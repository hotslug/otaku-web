// Otaku on the web: a small Rust server in front of AniList, serving the React site from frontend/dist.

mod anilist;

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
    gate: Semaphore, // AniList allows ~90 requests a minute (sometimes 30): a few at a time, the rest wait
}

impl App {
    // Fresh copy if we have one; otherwise ask AniList. If AniList fails, the last good answer (marked stale) beats an error.
    // ponytail: unbounded in-memory cache, no request coalescing; add an LRU (or Redis) if traffic ever needs it.
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
            if stale { h.insert("x-stale", HeaderValue::from_static("1")); } // the site says "showing saved data"
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

pub const GENRES: [&str; 18] = ["Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music",
                                "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];

// Everything from the browser is checked against AniList's own names before it goes into a query.
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

// Unix seconds → (year, month), UTC. Days-to-civil from Howard Hinnant's date algorithms; saves a date crate.
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
    let site = ServeDir::new(&dist).fallback(ServeFile::new(format!("{dist}/index.html"))); // the React router handles the rest
    let router = Router::new()
        .route("/api/home", get(home))
        .route("/api/search", get(search))
        .route("/api/anime/{id}", get(detail))
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
        assert_eq!(year_month(1_795_651_200), (2026, 11)); // 26 Nov 2026
        assert_eq!(year_month(951_782_400), (2000, 2)); // 29 Feb 2000
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
