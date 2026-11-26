// Where to watch in one country: TMDB's watch providers (data from JustWatch). Optional: needs TMDB_KEY.

use serde::Serialize;
use serde_json::Value;

use crate::anilist::R;

#[derive(Serialize)]
pub struct Provider { pub name: String, pub logo: Option<String> }

#[derive(Serialize)]
pub struct Watch {
    pub name: String, // the show TMDB matched, so a wrong match is visible
    pub year: Option<String>,
    pub stream: Vec<Provider>,
    pub buy: Vec<Provider>,
    pub link: Option<String>, // TMDB's page, which credits JustWatch
}

async fn get(http: &reqwest::Client, key: &str, path: &str, q: &[(&str, &str)]) -> R<Value> {
    let mut r = http.get(format!("https://api.themoviedb.org/3/{path}")).query(q);
    // The short v3 "API key" or the long v4 "read access token" both work.
    r = if key.len() > 40 { r.bearer_auth(key) } else { r.query(&[("api_key", key)]) };
    let res = r.send().await.map_err(|e| format!("TMDB unreachable: {e}"))?;
    if !res.status().is_success() { return Err(format!("TMDB answered {}", res.status())) }
    res.json().await.map_err(|e| e.to_string())
}

// "Attack on Titan Season 3 Part 2" → also "Attack on Titan": TMDB keeps every season under one show.
pub fn search_terms(titles: &[String]) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for t in titles {
        let words: Vec<&str> = t.split_whitespace().collect();
        let cut = words.iter().enumerate().position(|(i, w)| {
            let w = w.to_lowercase();
            let next = words.get(i + 1).map(|n| n.to_lowercase()).unwrap_or_default();
            let ordinal = ["st", "nd", "rd", "th"].iter().any(|s| w.ends_with(s) && w[..w.len() - 2].chars().all(|c| c.is_ascii_digit()) && w.len() > 2);
            (w == "season" && next.chars().next().is_some_and(|c| c.is_ascii_digit())) || (ordinal && next == "season")
                || (w == "part" && next.chars().next().is_some_and(|c| c.is_ascii_digit())) || (w == "the" && next == "final")
        }).unwrap_or(words.len());
        let base = words[..cut].join(" ");
        for c in [t.trim().to_string(), base.clone(), base.split(':').next().unwrap_or("").trim().to_string()] {
            if c.chars().count() >= 3 && !out.contains(&c) { out.push(c) } // "Re" from "Re:ZERO" would match anything
        }
    }
    out
}

pub async fn watch(http: &reqwest::Client, key: &str, titles: &[String], movie: bool, region: &str) -> R<Option<Watch>> {
    let kind = if movie { "movie" } else { "tv" };
    let mut best: Option<Value> = None;
    for q in search_terms(titles) {
        let found = get(http, key, &format!("search/{kind}"), &[("query", &q)]).await?;
        // Animated (genre 16) and Japanese first, else TMDB's order.
        let results = found["results"].as_array().cloned().unwrap_or_default();
        let score = |r: &Value| i32::from(r["genre_ids"].as_array().is_some_and(|g| g.contains(&16.into()))) * 2 + i32::from(r["original_language"] == "ja");
        if let Some(top) = results.iter().enumerate().max_by_key(|(i, r)| (score(r), -(*i as i32))).map(|(_, r)| r.clone()) { best = Some(top); break }
    }
    let Some(show) = best else { return Ok(None) };
    let id = show["id"].as_i64().unwrap_or(0).to_string();
    let d = get(http, key, &format!("{kind}/{id}/watch/providers"), &[]).await?;
    let r = &d["results"][region];
    let names = |keys: &[&str]| {
        let mut out: Vec<Provider> = vec![];
        for k in keys {
            for p in r[*k].as_array().into_iter().flatten() {
                let Some(name) = p["provider_name"].as_str() else { continue };
                if out.iter().any(|x| x.name == name) { continue }
                out.push(Provider { name: name.into(), logo: p["logo_path"].as_str().map(|l| format!("https://image.tmdb.org/t/p/w92{l}")) });
            }
        }
        out
    };
    Ok(Some(Watch {
        name: show["name"].as_str().or(show["title"].as_str()).unwrap_or("?").into(),
        year: show["first_air_date"].as_str().or(show["release_date"].as_str()).filter(|d| d.len() >= 4).map(|d| d[..4].into()),
        stream: names(&["flatrate", "free", "ads"]),
        buy: names(&["rent", "buy"]),
        link: r["link"].as_str().map(String::from),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn season_words_are_cut() {
        let t = |s: &str| search_terms(&[s.to_string()]);
        assert_eq!(t("Attack on Titan Season 3 Part 2"), vec!["Attack on Titan Season 3 Part 2", "Attack on Titan"]);
        assert_eq!(t("Sousou no Frieren 2nd Season"), vec!["Sousou no Frieren 2nd Season", "Sousou no Frieren"]);
        assert_eq!(t("Re:ZERO -Starting Life in Another World-"), vec!["Re:ZERO -Starting Life in Another World-"]);
        assert_eq!(t("Frieren: Beyond Journey’s End"), vec!["Frieren: Beyond Journey’s End", "Frieren"]);
    }
}
