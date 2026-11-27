
mod anilist;
mod tmdb;

use std::{collections::HashMap, future::Future, sync::Arc, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};

use anilist::{Search, R};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use tokio::sync::{Mutex, Semaphore};
use tower_http::{compression::CompressionLayer, services::{ServeDir, ServeFile}};

struct App {
    http: reqwest::Client,
    cache: Mutex<HashMap<String, (Instant, Value)>>,
    gate: Semaphore,
}

impl App {
    async fn cached<F: Future<Output = R<Value>>>(&self, key: String, ttl: Duration, fetch: F) -> R<(Value, bool)> {
        if let Some((at, v)) = self.cache.lock().await.get(&key) {
            if at.elapsed() < ttl { return Ok((v.clone(), false)) }
        }
        let fresh = { let _slot = self.gate.acquire().await.map_err(|e| e.to_string())?; fetch.await };
        match fresh {
            Ok(v) => { self.cache.lock().await.insert(key, (Instant::now(), v.clone())); Ok((v, false)) }
            Err(e) => self.cache.lock().await.get(&key).map(|(_, v)| (v.clone(), true)).ok_or(e),
        }
    }
}

type Shared = State<Arc<App>>;

fn reply(r: R<(Value, bool)>, max_age: u32) -> Response {
    match r {
        Ok((v, stale)) => {
            let mut res = Json(v).into_response();
            let h = res.headers_mut();
            h.insert(header::CACHE_CONTROL, HeaderValue::from_str(&format!("public, max-age={max_age}")).unwrap());
            if stale { h.insert("x-stale", HeaderValue::from_static("1")); }
            res
        }
        Err(e) => (StatusCode::BAD_GATEWAY, Json(json!({ "error": e }))).into_response(),
    }
}

async fn home(State(app): Shared) -> Response {
    let today = year_month(SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64);
    let r = app.cached("home".into(), Duration::from_secs(15 * 60), async {
        anilist::home(&app.http, today).await.map(|rows| json!({ "rows": rows }))
    }).await;
    reply(r, 300)
}

async fn search(State(app): Shared, Query(p): Query<HashMap<String, String>>) -> Response {
    let s = match check(&p) { Ok(s) => s, Err(e) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": e }))).into_response() };
    let key = format!("search:{:?}:{:?}:{:?}:{:?}:{:?}:{:?}:{}:{}", s.q.as_ref().map(|q| q.to_lowercase()), s.genre, s.year, s.season, s.format, s.status, s.sort, s.page);
    let r = app.cached(key, Duration::from_secs(30 * 60), async {
        anilist::search(&app.http, &s).await.map(|items| json!({ "items": items }))
    }).await;
    reply(r, 300)
}

async fn detail(State(app): Shared, Path(id): Path<i64>) -> Response {
    if !(1..100_000_000).contains(&id) { return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Bad id" }))).into_response() }
    let r = app.cached(format!("anime:{id}"), Duration::from_secs(6 * 3600), async {
        anilist::detail(&app.http, id).await.map(|d| serde_json::to_value(d).unwrap())
    }).await;
    reply(r, 3600)
}

async fn schedule(State(app): Shared, Query(p): Query<HashMap<String, String>>) -> Response {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
    let Some(from) = p.get("from").and_then(|v| v.parse::<i64>().ok()).filter(|f| (now - 2 * 86_400..=now + 86_400).contains(f)) else {
        return bad("Bad start time")
    };
    let r = app.cached(format!("schedule:{from}"), Duration::from_secs(30 * 60), async {
        anilist::schedule(&app.http, from, from + 7 * 86_400 + 3600).await.map(|a| json!({ "items": a }))
    }).await;
    reply(r, 600)
}

async fn recommended(State(app): Shared, Query(p): Query<HashMap<String, String>>) -> Response {
    let ids: Vec<i64> = p.get("ids").map(|v| v.split(',').filter_map(|x| x.parse().ok()).filter(|x| (1..100_000_000).contains(x)).collect()).unwrap_or_default();
    if ids.is_empty() || ids.len() > 3 { return bad("1 to 3 ids") }
    let key = format!("recommended:{ids:?}");
    let r = app.cached(key, Duration::from_secs(6 * 3600), async {
        anilist::recommended(&app.http, &ids).await.map(|rows| json!({ "rows": rows }))
    }).await;
    reply(r, 3600)
}

async fn watch(State(app): Shared, Path(id): Path<i64>, Query(p): Query<HashMap<String, String>>) -> Response {
    let Some(key) = std::env::var("TMDB_KEY").ok().filter(|k| !k.is_empty()) else {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "No TMDB key on this server" }))).into_response()
    };
    let region = p.get("region").map(|r| r.to_uppercase()).filter(|r| r.len() == 2 && r.chars().all(|c| c.is_ascii_uppercase()));
    let Some(region) = region else { return bad("Bad region") };
    if !(1..100_000_000).contains(&id) { return bad("Bad id") }
    let page = app.cached(format!("anime:{id}"), Duration::from_secs(6 * 3600), async {
        anilist::detail(&app.http, id).await.map(|d| serde_json::to_value(d).unwrap())
    }).await;
    let Ok((a, _)) = page else { return reply(page, 0) };
    let titles: Vec<String> = [&a["title"], &a["romaji"]].iter().filter_map(|t| t.as_str().map(String::from)).collect();
    let movie = a["format"] == "Movie";
    let r = app.cached(format!("watch:{id}:{region}"), Duration::from_secs(24 * 3600), async {
        tmdb::watch(&app.http, &key, &titles, movie, &region).await.map(|w| json!({ "watch": w, "region": region }))
    }).await;
    reply(r, 3600)
}

fn bad(why: &str) -> Response { (StatusCode::BAD_REQUEST, Json(json!({ "error": why }))).into_response() }

pub const GENRES: [&str; 18] = ["Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music",
                                "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];

fn check(p: &HashMap<String, String>) -> Result<Search, String> {
    fn pick(p: &HashMap<String, String>, k: &str, allowed: &[&str]) -> Result<Option<String>, String> {
        match p.get(k).filter(|v| !v.is_empty()) {
            None => Ok(None),
            Some(v) if allowed.contains(&v.as_str()) => Ok(Some(v.clone())),
            Some(v) => Err(format!("Unknown {k}: {v}")),
        }
    }
    let q = p.get("q").map(|q| q.trim()).filter(|q| !q.is_empty()).map(String::from);
    if q.as_ref().is_some_and(|q| q.chars().count() > 100) { return Err("Search is too long".into()) }
    let year = match p.get("year").filter(|v| !v.is_empty()) {
        None => None,
        Some(y) => Some(y.parse::<i64>().ok().filter(|y| (1940..=2100).contains(y)).ok_or("Bad year")?),
    };
    let page = p.get("page").and_then(|v| v.parse::<i64>().ok()).unwrap_or(1).clamp(1, 20);
    Ok(Search {
        q,
        genre: pick(p, "genre", &GENRES)?,
        year,
        season: pick(p, "season", &["WINTER", "SPRING", "SUMMER", "FALL"])?,
        format: pick(p, "format", &["TV", "MOVIE", "OVA", "ONA", "SPECIAL", "TV_SHORT"])?,
        status: pick(p, "status", &["RELEASING", "FINISHED", "NOT_YET_RELEASED"])?,
        sort: pick(p, "sort", &["POPULARITY_DESC", "SCORE_DESC", "TRENDING_DESC", "START_DATE_DESC"])?.unwrap_or_else(|| "POPULARITY_DESC".into()),
        page,
    })
}

fn year_month(secs: i64) -> (i64, i64) {
    let z = secs.div_euclid(86_400) + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (yoe + era * 400 + i64::from(month <= 2), month)
}

#[tokio::main]
async fn main() {
    let app = Arc::new(App {
        http: reqwest::Client::builder().user_agent("otaku-web/0.1").timeout(Duration::from_secs(10)).build().unwrap(),
        cache: Mutex::new(HashMap::new()),
        gate: Semaphore::new(3),
    });
    let dist = std::env::var("OTAKU_DIST").unwrap_or_else(|_| "frontend/dist".into());
    let site = ServeDir::new(&dist).fallback(ServeFile::new(format!("{dist}/index.html")));
    let router = Router::new()
        .route("/api/home", get(home))
        .route("/api/search", get(search))
        .route("/api/anime/{id}", get(detail))
        .route("/api/anime/{id}/watch", get(watch))
        .route("/api/schedule", get(schedule))
        .route("/api/recommended", get(recommended))
        .with_state(app)
        .fallback_service(site)
        .layer(CompressionLayer::new());
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await.unwrap();
    println!("Otaku on http://localhost:{port}");
    axum::serve(listener, router).await.unwrap();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn year_and_month() {
        assert_eq!(year_month(0), (1970, 1));
        assert_eq!(year_month(1_795_651_200), (2026, 11));
        assert_eq!(year_month(951_782_400), (2000, 2));
    }

    #[test]
    fn filters_are_checked() {
        let p = |pairs: &[(&str, &str)]| pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect::<HashMap<_, _>>();
        let s = check(&p(&[("q", " frieren "), ("genre", "Fantasy"), ("year", "2023"), ("season", "FALL")])).unwrap();
        assert_eq!((s.q.as_deref(), s.genre.as_deref(), s.year, s.sort.as_str()), (Some("frieren"), Some("Fantasy"), Some(2023), "POPULARITY_DESC"));
        assert!(check(&p(&[("sort", "ID){evil}")])).is_err());
        assert!(check(&p(&[("genre", "Hentai")])).is_err());
        assert!(check(&p(&[("year", "abc")])).is_err());
        assert!(check(&p(&[("q", &"x".repeat(101))])).is_err());
    }
}
