// AniList's GraphQL API, turned into the small JSON shapes the site uses.

use serde::Serialize;
use serde_json::{json, Value};

const CARD: &str = "id title{english romaji native} startDate{year month day} status episodes format averageScore popularity genres coverImage{large color} nextAiringEpisode{episode airingAt}";
const HERO: &str = "bannerImage description(asHtml:false) trailer{id site thumbnail}";
const MORE: &str = "endDate{year month day} studios(isMain:true){nodes{name}} externalLinks{site url type notes color}";
const CAST: &str = "characters(sort:[ROLE,RELEVANCE,ID],perPage:18){edges{role node{name{full} image{medium}} voiceActors(language:JAPANESE,sort:[RELEVANCE,ID]){name{full} image{medium}}}}";

pub type R<T> = Result<T, String>;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: i64,
    pub title: String,
    pub native: Option<String>,
    pub romaji: Option<String>, // for matching on other sites
    pub start: Option<String>, // "2023-09-29", "2023-09" or "2023"
    pub status: Option<String>,
    pub episodes: Option<i64>,
    pub format: Option<String>,
    pub score: Option<i64>, // 0-100
    pub genres: Vec<String>,
    pub poster: Option<String>,
    pub color: Option<String>, // the poster's main colour, for placeholders
    pub banner: Option<String>,
    pub synopsis: Option<String>,
    pub synopsis_source: Option<String>, // "(Source: Crunchyroll)" at the end, shown as a credit
    pub trailer: Option<Trailer>,
    pub next_episode: Option<i64>,
    pub next_airing: Option<i64>, // unix seconds
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Trailer {
    pub id: String,
    pub site: String, // "youtube" or "dailymotion"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    #[serde(flatten)]
    pub card: Card,
    pub end: Option<String>,
    pub studio: Option<String>,
    pub links: Vec<Link>,
    pub cast: Vec<Cast>,
    pub related: Vec<Related>,
    pub recommended: Vec<Card>,
}

#[derive(Serialize)]
pub struct Link { pub site: String, pub url: String, pub note: Option<String>, pub color: Option<String> }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Cast { pub name: String, pub role: String, pub image: Option<String>, pub actor: Option<String>, pub actor_image: Option<String> }

#[derive(Serialize)]
pub struct Related { pub relation: String, pub anime: Card }

#[derive(Serialize)]
pub struct Row { pub title: String, pub items: Vec<Card> }

pub async fn query(http: &reqwest::Client, q: &str, vars: Value) -> R<Value> {
    let r = http.post("https://graphql.anilist.co").json(&json!({ "query": q, "variables": vars }))
        .send().await.map_err(|e| format!("AniList unreachable: {e}"))?;
    let status = r.status();
    let mut v: Value = r.json().await.map_err(|e| format!("AniList sent bad JSON: {e}"))?;
    if !status.is_success() || v["data"].is_null() {
        return Err(format!("AniList answered {status}"));
    }
    Ok(v["data"].take())
}

// All start-page rows in one request. Trending also brings banners and synopses: it feeds the carousel.
pub async fn home(http: &reqwest::Client, today: (i64, i64)) -> R<Vec<Row>> {
    let (year, month) = today;
    let season = ["WINTER", "SPRING", "SUMMER", "FALL"][((month - 1) / 3) as usize];
    let rows = [
        ("Trending now", "sort:TRENDING_DESC".to_string()),
        ("Airing this season", format!("season:{season},seasonYear:{year},sort:POPULARITY_DESC")),
        ("Most popular", "sort:POPULARITY_DESC".into()),
        ("Top rated", "sort:SCORE_DESC".into()),
        ("Coming soon", "status:NOT_YET_RELEASED,sort:POPULARITY_DESC".into()),
        ("Popular in Action", "genre:\"Action\",sort:POPULARITY_DESC".into()),
        ("Popular in Romance", "genre:\"Romance\",sort:POPULARITY_DESC".into()),
        ("Popular in Fantasy", "genre:\"Fantasy\",sort:POPULARITY_DESC".into()),
    ];
    let q: Vec<String> = rows.iter().enumerate().map(|(i, (_, args))| {
        let extra = if i == 0 { HERO } else { "" };
        format!("r{i}: Page(perPage:20){{media(type:ANIME,isAdult:false,{args}){{{CARD} {extra}}}}}")
    }).collect();
    let d = query(http, &format!("{{{}}}", q.join(" ")), json!({})).await?;
    Ok(rows.iter().enumerate()
        .map(|(i, (title, _))| Row { title: title.to_string(), items: list(&d[format!("r{i}")]["media"]) })
        .filter(|r| !r.items.is_empty()).collect())
}

// Filters already checked by the caller. Only the ones that are set go into the query (AniList rejects some as null).
#[derive(Default)]
pub struct Search { pub q: Option<String>, pub genre: Option<String>, pub year: Option<i64>, pub season: Option<String>, pub format: Option<String>, pub status: Option<String>, pub sort: String, pub page: i64 }

pub async fn search(http: &reqwest::Client, s: &Search) -> R<Vec<Card>> {
    let mut params = vec!["$sort:[MediaSort]".to_string()];
    let mut args = vec!["sort:$sort".to_string()];
    let mut vars = json!({ "sort": [s.sort] });
    let mut add = |name: &str, ty: &str, arg: &str, value: Value| {
        params.push(format!("${name}:{ty}"));
        args.push(format!("{arg}:${name}"));
        vars[name] = value;
    };
    if let Some(q) = &s.q { add("q", "String", "search", json!(q)) }
    if let Some(g) = &s.genre { add("genre", "String", "genre", json!(g)) }
    if let Some(f) = &s.format { add("format", "MediaFormat", "format", json!(f)) }
    if let Some(st) = &s.status { add("status", "MediaStatus", "status", json!(st)) }
    match (&s.season, s.year) {
        (Some(season), Some(y)) => { // a season is AniList's own grouping (a show starting late December can be Winter)
            add("season", "MediaSeason", "season", json!(season));
            add("seasonYear", "Int", "seasonYear", json!(y));
        }
        (_, Some(y)) => {
            add("from", "FuzzyDateInt", "startDate_greater", json!(y * 10000));
            add("to", "FuzzyDateInt", "startDate_lesser", json!((y + 1) * 10000));
        }
        _ => {}
    }
    let q = format!("query({}){{Page(page:{},perPage:40){{media(type:ANIME,isAdult:false,{}){{{CARD} {HERO}}}}}}}",
                    params.join(","), s.page, args.join(","));
    let d = query(http, &q, vars).await?;
    Ok(list(&d["Page"]["media"]))
}

pub async fn detail(http: &reqwest::Client, id: i64) -> R<Detail> {
    let related = format!("relations{{edges{{relationType node{{type isAdult bannerImage {CARD}}}}}}}");
    let recs = format!("recommendations(sort:RATING_DESC,perPage:15){{nodes{{mediaRecommendation{{type isAdult {CARD}}}}}}}");
    let q = format!("query($id:Int){{Media(id:$id){{{CARD} {HERO} {MORE} {related} {recs} {CAST}}}}}");
    let d = query(http, &q, json!({ "id": id })).await?;
    let m = &d["Media"];
    if m.is_null() { return Err("No such anime".into()) }
    let edges = arr(&m["relations"]["edges"]);
    let mut main = card(m);
    if main.banner.is_none() { main.banner = borrowed_banner(edges) }
    Ok(Detail {
        card: main,
        end: date(&m["endDate"]),
        studio: s(&m["studios"]["nodes"][0], "name"),
        links: arr(&m["externalLinks"]).iter().filter(|l| l["type"] == "STREAMING")
            .filter_map(|l| Some(Link { site: s(l, "site")?, url: s(l, "url")?, note: s(l, "notes"), color: s(l, "color") })).collect(),
        cast: arr(&m["characters"]["edges"]).iter().filter_map(|e| {
            let va = &e["voiceActors"][0];
            Some(Cast { name: s(&e["node"]["name"], "full")?, role: nice(&s(e, "role").unwrap_or_default()),
                        image: s(&e["node"]["image"], "medium"), actor: s(&va["name"], "full"), actor_image: s(&va["image"], "medium") })
        }).collect(),
        related: related_list(edges),
        recommended: arr(&m["recommendations"]["nodes"]).iter().map(|n| &n["mediaRecommendation"])
            .filter(|r| anime(r)).map(card).collect(),
    })
}

// MARK: parsing

fn arr(v: &Value) -> &[Value] { v.as_array().map(|a| a.as_slice()).unwrap_or(&[]) }
fn s(v: &Value, k: &str) -> Option<String> { v[k].as_str().map(str::trim).filter(|t| !t.is_empty()).map(String::from) }
fn anime(n: &Value) -> bool { n["type"] == "ANIME" && n["isAdult"] != true }
fn list(v: &Value) -> Vec<Card> { arr(v).iter().map(card).collect() }

pub fn card(m: &Value) -> Card {
    let t = &m["title"];
    let synopsis = s(m, "description").map(|d| split_source(&plain(&d)));
    Card {
        id: m["id"].as_i64().unwrap_or(0),
        title: s(t, "english").or_else(|| s(t, "romaji")).unwrap_or_else(|| "?".into()),
        native: s(t, "native"),
        romaji: s(t, "romaji"),
        start: date(&m["startDate"]),
        status: s(m, "status").map(|x| nice(&x)),
        episodes: m["episodes"].as_i64(),
        format: s(m, "format").map(|x| nice(&x)),
        score: m["averageScore"].as_i64(),
        genres: arr(&m["genres"]).iter().filter_map(|g| g.as_str().map(String::from)).collect(),
        poster: s(&m["coverImage"], "large"),
        color: s(&m["coverImage"], "color"),
        banner: s(m, "bannerImage"),
        synopsis: synopsis.as_ref().map(|x| x.0.clone()),
        synopsis_source: synopsis.and_then(|x| x.1),
        trailer: trailer(&m["trailer"]),
        next_episode: m["nextAiringEpisode"]["episode"].as_i64(),
        next_airing: m["nextAiringEpisode"]["airingAt"].as_i64(),
    }
}

fn trailer(t: &Value) -> Option<Trailer> {
    let (id, site) = (s(t, "id")?, s(t, "site")?); // some ids end in a tab: s() trims
    ["youtube", "dailymotion"].contains(&site.as_str()).then_some(Trailer { id, site })
}

pub fn date(d: &Value) -> Option<String> {
    let y = d["year"].as_i64()?;
    Some(match (d["month"].as_i64(), d["day"].as_i64()) {
        (Some(m), Some(day)) => format!("{y}-{m:02}-{day:02}"),
        (Some(m), None) => format!("{y}-{m:02}"),
        _ => y.to_string(),
    })
}

// "RELEASING" → "Airing", "TV_SHORT" → "TV short", "SIDE_STORY" → "Side story"
pub fn nice(x: &str) -> String {
    match x {
        "RELEASING" => "Airing".into(),
        "TV" | "OVA" | "ONA" => x.into(),
        "TV_SHORT" => "TV short".into(),
        _ => {
            let l = x.replace('_', " ").to_lowercase();
            let mut c = l.chars();
            c.next().map(|f| f.to_uppercase().collect::<String>() + c.as_str()).unwrap_or_default()
        }
    }
}

// AniList's plain descriptions still carry <br> and <i>.
pub fn plain(html: &str) -> String {
    let mut out = String::new();
    let mut tag = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match (in_tag, ch) {
            (false, '<') => { in_tag = true; tag.clear() }
            (true, '>') => { in_tag = false; if tag.trim_start_matches('/').to_lowercase().starts_with("br") { out.push('\n') } }
            (true, c) => tag.push(c),
            (false, c) => out.push(c),
        }
    }
    for (e, c) in [("&quot;", "\""), ("&#039;", "'"), ("&lt;", "<"), ("&gt;", ">"), ("&mdash;", "—"), ("&rsquo;", "’"), ("&nbsp;", " "), ("&amp;", "&")] {
        out = out.replace(e, c);
    }
    // Trim each line, and at most one blank line between paragraphs.
    let mut text = String::new();
    let mut blank = 0;
    for line in out.lines().map(str::trim) {
        if line.is_empty() { blank += 1; continue }
        if !text.is_empty() { text.push_str(if blank > 0 { "\n\n" } else { "\n" }) }
        text.push_str(line);
        blank = 0;
    }
    text
}

// "...adventure.\n\n(Source: Crunchyroll)" → ("...adventure.", Some("Crunchyroll")). Also "[Written by MAL Rewrite]".
pub fn split_source(text: &str) -> (String, Option<String>) {
    let t = text.trim_end();
    let Some(close) = t.chars().last().filter(|c| *c == ')' || *c == ']') else { return (t.to_string(), None) };
    let open = if close == ')' { '(' } else { '[' };
    let Some(start) = t.rfind(open) else { return (t.to_string(), None) };
    let inner = &t[start + 1..t.len() - 1];
    let lower = inner.to_lowercase();
    let Some(rest) = ["source", "written by"].iter().find_map(|k| lower.starts_with(k).then(|| &inner[k.len()..])) else { return (t.to_string(), None) };
    let src = rest.trim_start_matches([':', ' ']).trim();
    let body = t[..start].trim_end().to_string();
    if src.is_empty() || body.is_empty() { return (t.to_string(), None) }
    (body, Some(src.to_string()))
}

// "Because you liked…": AniList's community picks for a few shows, in one request.
pub async fn recommended(http: &reqwest::Client, ids: &[i64]) -> R<Vec<Row>> {
    let q: Vec<String> = ids.iter().enumerate().map(|(i, id)| format!(
        "r{i}: Media(id:{id}){{title{{english romaji}} recommendations(sort:RATING_DESC,perPage:20){{nodes{{mediaRecommendation{{type isAdult {CARD} {HERO}}}}}}}}}")).collect();
    let d = query(http, &format!("{{{}}}", q.join(" ")), json!({})).await?;
    Ok((0..ids.len()).filter_map(|i| {
        let m = &d[format!("r{i}")];
        let title = s(&m["title"], "english").or_else(|| s(&m["title"], "romaji"))?;
        let items: Vec<Card> = arr(&m["recommendations"]["nodes"]).iter().map(|n| &n["mediaRecommendation"]).filter(|r| anime(r)).map(card).collect();
        Some(Row { title: format!("Because you liked {title}"), items })
    }).collect())
}

#[derive(Serialize)]
pub struct Airing { pub episode: i64, pub at: i64, pub anime: Card }

// Every episode airing in a window (a week is ~5 pages of 50).
pub async fn schedule(http: &reqwest::Client, from: i64, to: i64) -> R<Vec<Airing>> {
    let q = format!("query($p:Int,$a:Int,$b:Int){{Page(page:$p,perPage:50){{pageInfo{{hasNextPage}} airingSchedules(airingAt_greater:$a,airingAt_lesser:$b,sort:TIME){{episode airingAt media{{isAdult type {CARD} bannerImage}}}}}}}}");
    let mut out = vec![];
    for p in 1..=8 {
        let d = query(http, &q, json!({ "p": p, "a": from, "b": to })).await?;
        for a in arr(&d["Page"]["airingSchedules"]) {
            let m = &a["media"];
            if m["isAdult"] == true { continue }
            if let (Some(episode), Some(at)) = (a["episode"].as_i64(), a["airingAt"].as_i64()) { out.push(Airing { episode, at, anime: card(m) }) }
        }
        if d["Page"]["pageInfo"]["hasNextPage"] != true { break }
    }
    Ok(out)
}

// No banner of its own: borrow one from the same series (season 1 for a season 2, the show for its movie…).
fn borrowed_banner(edges: &[Value]) -> Option<String> {
    let order = ["PREQUEL", "PARENT", "SEQUEL", "SIDE_STORY", "ALTERNATIVE", "SPIN_OFF"];
    edges.iter().filter(|e| anime(&e["node"]))
        .filter_map(|e| Some((order.iter().position(|o| e["relationType"] == *o)?, s(&e["node"], "bannerImage")?)))
        .min_by_key(|(i, _)| *i).map(|(_, b)| b)
}

// Anime only (no manga/novels), in watch order: prequels, sequels, then the rest.
fn related_list(edges: &[Value]) -> Vec<Related> {
    let order = ["PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "SUMMARY", "CHARACTER", "OTHER", "COMPILATION", "CONTAINS"];
    let mut out: Vec<(usize, Related)> = edges.iter().filter(|e| anime(&e["node"])).filter_map(|e| {
        let r = s(e, "relationType")?;
        let a = card(&e["node"]);
        let relation = match r.as_str() {
            "SIDE_STORY" => "Side story".into(),
            "SPIN_OFF" => "Spin-off".into(),
            "PARENT" => "Main story".into(),
            "ALTERNATIVE" | "OTHER" if a.format.as_deref() == Some("Movie") => "Movie".into(),
            _ => nice(&r),
        };
        Some((order.iter().position(|o| *o == r).unwrap_or(order.len()), Related { relation, anime: a }))
    }).collect();
    out.sort_by_key(|(i, _)| *i); // stable: AniList's order within a kind
    out.into_iter().map(|(_, r)| r).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_card() {
        let c = card(&json!({
            "id": 154587, "title": {"english": null, "romaji": "Sousou no Frieren", "native": "葬送のフリーレン"},
            "startDate": {"year": 2023, "month": 9, "day": 29}, "status": "FINISHED", "format": "TV_SHORT",
            "genres": ["Adventure"], "coverImage": {"large": "https://x/p.jpg"}, "trailer": {"id": "abc\t", "site": "youtube"},
            "description": "Elf mage.<br><br>\n<br>\n(Source: Crunchyroll)&amp;more"
        }));
        assert_eq!(c.title, "Sousou no Frieren");
        assert_eq!(c.start.as_deref(), Some("2023-09-29"));
        assert_eq!(c.format.as_deref(), Some("TV short"));
        assert_eq!(c.status.as_deref(), Some("Finished"));
        assert_eq!(c.trailer, Some(Trailer { id: "abc".into(), site: "youtube".into() }));
        assert_eq!(c.synopsis.as_deref(), Some("Elf mage.\n\n(Source: Crunchyroll)&more")); // not at the end: stays in the text
    }

    #[test]
    fn related_in_watch_order_without_manga() {
        let e = |rel: &str, id: i64, ty: &str| json!({"relationType": rel, "node": {"id": id, "type": ty, "title": {"romaji": format!("{id}")}}});
        let r = related_list(&[e("SEQUEL", 2, "ANIME"), e("ADAPTATION", 3, "MANGA"), e("PREQUEL", 1, "ANIME")]);
        assert_eq!(r.iter().map(|x| x.anime.id).collect::<Vec<_>>(), vec![1, 2]);
        assert_eq!(r[0].relation, "Prequel");
    }

    #[test]
    fn synopsis_source() {
        assert_eq!(split_source("An elf.\n\n(Source: Crunchyroll)"), ("An elf.".into(), Some("Crunchyroll".into())));
        assert_eq!(split_source("Text [Written by MAL Rewrite]"), ("Text".into(), Some("MAL Rewrite".into())));
        assert_eq!(split_source("A (quiet) story."), ("A (quiet) story.".into(), None));
        assert_eq!(split_source("Ends (in a bracket)"), ("Ends (in a bracket)".into(), None));
    }

    #[test]
    fn dates() {
        assert_eq!(date(&json!({"year": 2024, "month": 4})).as_deref(), Some("2024-04"));
        assert_eq!(date(&json!({"year": null})), None);
    }
}
