//! Read-only skills.sh discovery. Lifecycle writes remain owned by the original CLI.
mod document;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const CACHE_TTL: u64 = 300;
const SEARCH_LIMIT: usize = 100;
const CHUNK_SIZE: usize = 200;
const RESPONSE_LIMIT: u64 = 4 * 1024 * 1024;
type ChunkSlot = Arc<Mutex<Option<CachedChunk>>>;
type Cache = HashMap<(String, usize), ChunkSlot>;
static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
static CLIENT: OnceLock<Result<reqwest::blocking::Client, String>> = OnceLock::new();

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkill {
    pub id: String,
    pub skill_id: String,
    pub name: String,
    pub source: String,
    pub installs: u64,
    pub previewable: bool,
    pub description: Option<String>,
    pub change: Option<i64>,
    pub is_official: bool,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePage {
    pub skills: Vec<MarketplaceSkill>,
    pub page: usize,
    pub total: usize,
    pub total_pages: usize,
    pub stale: bool,
    pub fetched_at: u64,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Chunk {
    skills: Vec<MarketplaceSkill>,
    total: usize,
    has_more: bool,
}
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CachedChunk {
    fetched_at: u64,
    chunk: Chunk,
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value != "."
        && value != ".."
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}
fn valid_source(source: &str) -> bool {
    let parts: Vec<_> = source.split('/').collect();
    parts.len() == 2 && parts.iter().all(|s| token(s))
}
fn skill(value: &serde_json::Value) -> Result<MarketplaceSkill, String> {
    let source = value["source"]
        .as_str()
        .ok_or("Missing discovery source.")?;
    let skill_id = value["skillId"]
        .as_str()
        .or_else(|| value["skill_id"].as_str())
        .or_else(|| {
            value["id"]
                .as_str()
                .and_then(|id| id.strip_prefix(&format!("{source}/")))
        })
        .ok_or("Missing discovery skill identity.")?;
    let name = value["name"]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .ok_or("Missing discovery skill name.")?;
    if source.is_empty()
        || source.len() > 300
        || source.chars().any(char::is_control)
        || skill_id.is_empty()
        || skill_id.len() > 200
        || skill_id.chars().any(char::is_control)
        || name.len() > 200
        || name.chars().any(char::is_control)
    {
        return Err("Invalid discovery identity; installation was not started.".into());
    }
    Ok(MarketplaceSkill {
        id: format!("{source}/{skill_id}"),
        skill_id: skill_id.into(),
        name: name.into(),
        source: source.into(),
        previewable: (valid_source(source) || document::website_source(source))
            && !skill_id.starts_with('-')
            && skill_id != "*",
        installs: value["installs"]
            .as_u64()
            .ok_or("Invalid installation count.")?,
        description: value["description"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.chars().take(2000).collect()),
        change: value["change"].as_i64(),
        is_official: value["isOfficial"].as_bool().unwrap_or(false),
    })
}
fn response(url: reqwest::Url) -> Result<String, String> {
    let client = CLIENT
        .get_or_init(|| {
            reqwest::blocking::Client::builder()
                .user_agent("Skills Space")
                .timeout(Duration::from_secs(25))
                .build()
                .map_err(|e| e.to_string())
        })
        .as_ref()
        .map_err(Clone::clone)?;
    let response = client
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| format!("Discovery request failed: {e}"))?;
    let mut bytes = Vec::new();
    response
        .take(RESPONSE_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > RESPONSE_LIMIT {
        return Err("Discovery response exceeds the size limit.".into());
    }
    String::from_utf8(bytes).map_err(|_| "Discovery response is not UTF-8.".into())
}
fn board_url(board: &str, page: usize) -> Result<reqwest::Url, String> {
    let view = match board {
        "alltime" => "all-time",
        "trending" => "trending",
        "hot" => "hot",
        _ => return Err("Unknown leaderboard.".into()),
    };
    reqwest::Url::parse(&format!("https://www.skills.sh/api/skills/{view}/{page}"))
        .map_err(|e| e.to_string())
}
fn parse_chunk(body: &str) -> Result<Chunk, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Invalid leaderboard data: {e}"))?;
    let values = value["skills"]
        .as_array()
        .ok_or("Leaderboard response is missing its skills array.")?;
    if values.len() > CHUNK_SIZE {
        return Err("Leaderboard page exceeds its supported size.".into());
    }
    let skills = values.iter().map(skill).collect::<Result<Vec<_>, _>>()?;
    let total = value["total"]
        .as_u64()
        .and_then(|n| usize::try_from(n).ok())
        .ok_or("Leaderboard total is missing.")?;
    let has_more = value["hasMore"]
        .as_bool()
        .ok_or("Leaderboard pagination is missing.")?;
    if has_more && skills.len() != CHUNK_SIZE {
        return Err("Leaderboard page is incomplete.".into());
    }
    Ok(Chunk {
        skills,
        total,
        has_more,
    })
}
fn disk_cache(directory: &Path, board: &str) -> PathBuf {
    directory.join(format!("leaderboard-{board}.json"))
}
fn read_snapshot(directory: &Path, board: &str) -> Option<CachedChunk> {
    let path = disk_cache(directory, board);
    if std::fs::metadata(&path).ok()?.len() > RESPONSE_LIMIT {
        return None;
    }
    let record: CachedChunk = serde_json::from_slice(&std::fs::read(path).ok()?).ok()?;
    // Cached data has the same identity/count contract as a network response.
    let chunk = parse_chunk(&serde_json::to_string(&record.chunk).ok()?).ok()?;
    Some(CachedChunk {
        fetched_at: record.fetched_at,
        chunk,
    })
}
fn chunk_slot(board: &str, page: usize) -> Result<ChunkSlot, String> {
    let mut cache = CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Discovery cache unavailable.")?;
    let key = (board.to_owned(), page);
    if !cache.contains_key(&key) && cache.len() >= 64 {
        if let Some(old) = cache
            .iter()
            .find(|(_, slot)| Arc::strong_count(slot) == 1)
            .map(|(key, _)| key.clone())
        {
            cache.remove(&old);
        }
    }
    Ok(cache
        .entry(key)
        .or_insert_with(|| Arc::new(Mutex::new(None)))
        .clone())
}
fn load_chunk(
    board: &str,
    page: usize,
    refresh: bool,
    directory: Option<&Path>,
) -> Result<CachedChunk, String> {
    let url = board_url(board, page)?;
    let slot = chunk_slot(board, page)?;
    // A per-page slot coalesces simultaneous reads without blocking other boards.
    let mut stored = slot.lock().map_err(|_| "Discovery cache unavailable.")?;
    if stored.is_none() && page == 0 {
        *stored = directory.and_then(|dir| read_snapshot(dir, board));
    }
    if !refresh {
        if let Some(cached) = &*stored {
            return Ok(cached.clone());
        }
    }
    let record = CachedChunk {
        fetched_at: now(),
        chunk: parse_chunk(&response(url)?)?,
    };
    if page == 0 {
        if let Some(directory) = directory {
            // Disposable read cache: inability to persist it must not fail discovery.
            if std::fs::create_dir_all(directory).is_ok() {
                if let Ok(bytes) = serde_json::to_vec(&record) {
                    let _ = std::fs::write(disk_cache(directory, board), bytes);
                }
            }
        }
    }
    *stored = Some(record.clone());
    Ok(record)
}
fn page_from_chunks<F>(page: usize, page_size: usize, mut load: F) -> Result<MarketplacePage, String>
where
    F: FnMut(usize) -> Result<CachedChunk, String>,
{
    if !matches!(page_size, 12 | 24 | 48) {
        return Err("Invalid leaderboard page size.".into());
    }
    let mut page = page.max(1);
    loop {
        let offset = (page - 1)
            .checked_mul(page_size)
            .ok_or("Invalid leaderboard page.")?;
        let index = offset / CHUNK_SIZE;
        let first = load(index)?;
        let mut total = first.chunk.total;
        if !first.chunk.has_more {
            total = total.min(index * CHUNK_SIZE + first.chunk.skills.len());
        }
        let last_page = total.div_ceil(page_size).max(1);
        if page > last_page {
            page = last_page;
            continue;
        }
        let mut skills = first
            .chunk
            .skills
            .iter()
            .skip(offset % CHUNK_SIZE)
            .take(page_size)
            .cloned()
            .collect::<Vec<_>>();
        let mut fetched_at = first.fetched_at;
        if skills.len() < page_size && first.chunk.has_more {
            let next = load(index + 1)?;
            skills.extend(
                next.chunk
                    .skills
                    .iter()
                    .take(page_size - skills.len())
                    .cloned(),
            );
            fetched_at = fetched_at.min(next.fetched_at);
            if !next.chunk.has_more {
                total = total.min((index + 1) * CHUNK_SIZE + next.chunk.skills.len());
            }
        }
        return Ok(MarketplacePage {
            skills,
            page,
            total,
            total_pages: total.div_ceil(page_size).max(1),
            stale: now().saturating_sub(fetched_at) >= CACHE_TTL,
            fetched_at,
        });
    }
}
fn search_url(query: &str, owner: &str) -> Result<reqwest::Url, String> {
    let query = query.trim();
    if !(2..=200).contains(&query.chars().count()) || query.chars().any(char::is_control) {
        return Err("Enter a search query of 2–200 characters.".into());
    }
    let owner = owner.trim();
    if !owner.is_empty()
        && (owner.len() > 39
            || !owner.starts_with(|c: char| c.is_ascii_alphanumeric())
            || !owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
    {
        return Err("Enter a valid GitHub owner.".into());
    }
    let mut url =
        reqwest::Url::parse("https://www.skills.sh/api/search").map_err(|e| e.to_string())?;
    url.query_pairs_mut()
        .append_pair("q", query)
        .append_pair("limit", &SEARCH_LIMIT.to_string());
    if !owner.is_empty() {
        url.query_pairs_mut()
            .append_pair("owner", &owner.to_ascii_lowercase());
    }
    Ok(url)
}
fn parse_search(body: &str, owner: &str) -> Result<Vec<MarketplaceSkill>, String> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Invalid search response: {e}"))?;
    let values = value["skills"]
        .as_array()
        .ok_or("Search response is missing its skills array.")?;
    let items = values
        .iter()
        .take(SEARCH_LIMIT)
        .map(skill)
        .collect::<Result<Vec<_>, _>>()?;
    if !owner.trim().is_empty()
        && items.iter().any(|s| {
            !s.source
                .split('/')
                .next()
                .unwrap_or_default()
                .eq_ignore_ascii_case(owner.trim())
        })
    {
        return Err("Search returned entries outside the requested owner.".into());
    }
    let mut seen = HashSet::new();
    // Keep the service's search ranking, including semantic-query relevance.
    Ok(items
        .into_iter()
        .filter(|s| seen.insert(s.id.clone()))
        .collect())
}
#[tauri::command]
pub async fn fetch_skill_leaderboard(
    app: tauri::AppHandle,
    board: String,
    page: usize,
    refresh: Option<bool>,
    page_size: Option<usize>,
) -> Result<MarketplacePage, String> {
    let directory = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join("skills-store"));
    tauri::async_runtime::spawn_blocking(move || {
        page_from_chunks(page, page_size.unwrap_or(12), |index| {
            load_chunk(
                &board,
                index,
                refresh.unwrap_or(false),
                directory.as_deref(),
            )
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_find(query: String, owner: String) -> Result<Vec<MarketplaceSkill>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        parse_search(&response(search_url(&query, &owner)?)?, &owner)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn entry(n: usize) -> serde_json::Value {
        json!({"source":"owner/repo", "skillId":format!("skill-{n}"), "name":format!("Skill {n}"), "installs":n})
    }
    fn cached(start: usize, count: usize, total: usize, more: bool, at: u64) -> CachedChunk {
        CachedChunk {
            fetched_at: at,
            chunk: parse_chunk(&json!({"skills":(start..start+count).map(entry).collect::<Vec<_>>(), "total":total, "hasMore":more}).to_string()).unwrap(),
        }
    }
    #[test]
    fn public_board_contract_preserves_hot_order_and_metrics() {
        let body = json!({"skills":[
            {"source":"owner/repo","skillId":"low-count","name":"Low count","installs":3,"change":3,"isOfficial":true},
            {"source":"owner/repo","skillId":"high-count","name":"High count","installs":100,"change":1}
        ],"total":2,"hasMore":false});
        let page = parse_chunk(&body.to_string()).unwrap();
        assert_eq!(
            page.skills
                .iter()
                .map(|s| s.skill_id.as_str())
                .collect::<Vec<_>>(),
            ["low-count", "high-count"]
        );
        assert_eq!(page.skills[0].change, Some(3));
        assert!(page.skills[0].is_official);
        assert!(page.skills[0].description.is_none());
        assert!(!page.skills[1].is_official);
        for (board, view) in [
            ("alltime", "all-time"),
            ("trending", "trending"),
            ("hot", "hot"),
        ] {
            assert_eq!(
                board_url(board, 2).unwrap().as_str(),
                format!("https://www.skills.sh/api/skills/{view}/2")
            );
        }
        assert!(board_url("../hot", 0).is_err());
        for body in [
            "{}",
            "<html>changed</html>",
            "{\"skills\":[],\"total\":2}",
            "{\"skills\":[],\"total\":2,\"hasMore\":true}",
        ] {
            assert!(parse_chunk(body).is_err());
        }
        assert!(
            parse_chunk(&json!({"skills":[entry(1)],"total":-1,"hasMore":false}).to_string())
                .is_err()
        );
        assert!(parse_chunk(
            &json!({"skills":(0..201).map(entry).collect::<Vec<_>>(),"total":201,"hasMore":false})
                .to_string()
        )
        .is_err());
    }

    #[test]
    fn supported_page_sizes_keep_order_across_200_item_chunks_and_bound_terminal_pages() {
        let at=now();
        for size in [12,24,48] {
            let total:usize=405;let mut all=Vec::new();
            for page in 1..=total.div_ceil(size) {
                let result=page_from_chunks(page,size,|index| {let start=index*200;let count=(total-start).min(200);Ok(cached(start,count,total,start+count<total,at))}).unwrap();
                assert_eq!(result.total,total);assert_eq!(result.total_pages,total.div_ceil(size));assert_eq!(result.page,page);assert!(result.skills.len()<=size);assert!(!result.stale);
                all.extend(result.skills.into_iter().map(|skill|skill.skill_id));
            }
            assert_eq!(all,(0..total).map(|n|format!("skill-{n}")).collect::<Vec<_>>());
            let mut requested=Vec::new();let crossing=200/size+1;
            let result=page_from_chunks(crossing,size,|index|{requested.push(index);Ok(cached(index*200,200,total,true,at))}).unwrap();
            assert_eq!(requested,vec![0,1]);assert_eq!(result.skills.len(),size);assert_eq!(result.skills[0].skill_id,format!("skill-{}",(crossing-1)*size));
            let empty=page_from_chunks(99,size,|_|Ok(cached(0,0,0,false,at))).unwrap();assert_eq!(empty.page,1);assert_eq!(empty.total_pages,1);assert!(empty.skills.is_empty());
            let first=page_from_chunks(0,size,|_|Ok(cached(0,200,405,true,at))).unwrap();assert_eq!(first.page,1);assert_eq!(first.skills[0].skill_id,"skill-0");
            let mut requested=Vec::new();
            let shrunk=page_from_chunks(99,size,|index|{requested.push(index);Ok(if index==0{cached(0,25,25,false,at)}else{cached(index*200,0,25,false,at)})}).unwrap();assert_eq!(shrunk.page,25usize.div_ceil(size));assert_eq!(shrunk.total_pages,25usize.div_ceil(size));assert_eq!(shrunk.skills.len(),25-(shrunk.page-1)*size);assert_eq!(shrunk.skills.last().unwrap().skill_id,"skill-24");
            assert_eq!(requested,vec![((99-1)*size)/CHUNK_SIZE,0]);
        }
        for size in [0,1,13,23,25,49,100,usize::MAX] {assert!(page_from_chunks(1,size,|_|unreachable!("invalid size must not fetch")).is_err());}
        for size in [12,24,48] {assert!(page_from_chunks(usize::MAX,size,|_|unreachable!("invalid offset must not fetch")).is_err());}
    }

    #[test]
    fn partial_terminal_pages_bound_totals_and_keep_oldest_timestamp() {
        let at = now();
        let page = page_from_chunks(34, 12, |index| {
            Ok(if index == 1 {
                cached(200, 200, 999, true, at)
            } else {
                cached(400, 5, 999, false, at.saturating_sub(CACHE_TTL))
            })
        })
        .unwrap();
        assert_eq!(
            page.skills
                .iter()
                .map(|s| s.skill_id.as_str())
                .collect::<Vec<_>>(),
            (396..405).map(|n| format!("skill-{n}")).collect::<Vec<_>>()
        );
        assert_eq!(page.total, 405);
        assert_eq!(page.total_pages, 34);
        assert_eq!(page.fetched_at, at.saturating_sub(CACHE_TTL));
        assert!(page.stale);
        let page = page_from_chunks(1, 12, |_| Ok(cached(0, 0, 0, false, at))).unwrap();
        assert!(page.skills.is_empty());
        assert_eq!(page.total_pages, 1);
        assert!(page_from_chunks(17, 12, |index| if index == 0 {
            Ok(cached(0, 200, 400, true, at))
        } else {
            Err("second chunk failed".into())
        })
        .unwrap_err()
        .contains("second chunk failed"));
    }

    #[test]
    fn search_distinguishes_empty_invalid_owner_mismatch_and_preserves_relevance() {
        assert!(parse_search("{\"skills\":[]}", "").unwrap().is_empty());
        for bad in ["{}", "<html>error</html>", "{\"skills\":[{}]}"] {
            assert!(parse_search(bad, "").is_err());
        }
        let body = json!({"skills":[entry(1),entry(3),entry(1)]}).to_string();
        let skills = parse_search(&body, "OWNER").unwrap();
        assert_eq!(
            skills.iter().map(|s| s.installs).collect::<Vec<_>>(),
            [1, 3]
        );
        assert!(parse_search(&body, "other").is_err());
        assert_eq!(
            parse_search(
                &json!({"skills":(0..110).map(entry).collect::<Vec<_>>()} ).to_string(),
                ""
            )
            .unwrap()
            .len(),
            100
        );
        for query in ["", "a", "ab\ncd"] {
            assert!(search_url(query, "").is_err());
        }
        assert!(search_url(&"字".repeat(201), "").is_err());
        assert!(search_url("中文", "").is_ok());
        assert!(search_url("react", "a/b").is_err());
        let url = search_url("react & native", "Vercel-Labs").unwrap();
        assert!(url
            .query_pairs()
            .any(|(k, v)| k == "q" && v == "react & native"));
        assert!(url
            .query_pairs()
            .any(|(k, v)| k == "owner" && v == "vercel-labs"));
        assert!(url.query_pairs().any(|(k, v)| k == "limit" && v == "100"));
    }
    #[test]
    fn discovery_identity_and_source_eligibility_are_not_inferred_from_names() {
        assert!(skill(&json!({"source":"google-labs-code/stitch-skills", "skillId":"stitch::react-components", "name":"stitch::react-components", "installs":1})).unwrap().previewable);
        assert!(
            !skill(
                &json!({"source":"https://evil.test", "skillId":"test","name":"test","installs":1})
            )
            .unwrap()
            .previewable
        );
        assert!(
            !skill(&json!({"source":"owner/repo", "skillId":"-all","name":"All","installs":1}))
                .unwrap()
                .previewable
        );
        assert!(skill(
            &json!({"source":"owner/repo", "skillId":"x\ny","name":"test","installs":1})
        )
        .is_err());
        assert!(
            skill(&json!({"source":"owner/repo", "skillId":"ok","name":"test","installs":-1}))
                .is_err()
        );
    }
    #[test]
    fn persisted_snapshots_revalidate_identity_and_expired_data_survives_for_refresh() {
        let path = std::env::temp_dir().join(format!(
            "skills-store-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&path).unwrap();
        let record = cached(0, 200, 500, true, now().saturating_sub(CACHE_TTL));
        std::fs::write(
            disk_cache(&path, "hot"),
            serde_json::to_vec(&record).unwrap(),
        )
        .unwrap();
        let restored = read_snapshot(&path, "hot").unwrap();
        assert_eq!(restored.fetched_at, record.fetched_at);
        assert_eq!(restored.chunk.skills.len(), 200);
        assert!(read_snapshot(&path, "alltime").is_none());
        let mut invalid = serde_json::to_value(&record).unwrap();
        invalid["chunk"]["skills"][0]["installs"] = json!(-1);
        std::fs::write(
            disk_cache(&path, "hot"),
            serde_json::to_vec(&invalid).unwrap(),
        )
        .unwrap();
        assert!(read_snapshot(&path, "hot").is_none());
        std::fs::write(disk_cache(&path, "hot"), b"broken").unwrap();
        assert!(read_snapshot(&path, "hot").is_none());
        std::fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn cached_reads_share_one_slot_and_keep_board_and_page_isolation() {
        let one = chunk_slot("alltime", 77).unwrap();
        let same = chunk_slot("alltime", 77).unwrap();
        assert!(Arc::ptr_eq(&one, &same));
        assert!(!Arc::ptr_eq(&one, &chunk_slot("hot", 77).unwrap()));
        assert!(!Arc::ptr_eq(&one, &chunk_slot("alltime", 78).unwrap()));
        let record = cached(0, 200, 200, false, now());
        *one.lock().unwrap() = Some(record.clone());
        let actual = load_chunk("alltime", 77, false, None).unwrap();
        assert_eq!(actual.fetched_at, record.fetched_at);
        assert_eq!(actual.chunk.skills[0].skill_id, "skill-0");
    }
    #[test]
    fn http_errors_are_not_empty_results() {
        use std::{io::Write, net::TcpListener};
        let server = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = reqwest::Url::parse(&format!("http://{}", server.local_addr().unwrap())).unwrap();
        let worker = std::thread::spawn(move || {
            let (mut socket, _) = server.accept().unwrap();
            let mut buf = [0; 4096];
            let _ = socket.read(&mut buf);
            socket.write_all(b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
        });
        assert!(response(url).unwrap_err().contains("503"));
        worker.join().unwrap();
    }

    fn description_document(value: serde_json::Value) -> String {
        format!("<html><meta name=\"description\" content=\"Short SEO text…\"><script>throw new Error('never execute scripts')</script><script nonce=\"public\" type=\"application/ld+json\">{value}</script></html>")
    }
    #[test]
    fn authored_description_comes_from_matching_software_application_not_seo_or_scripts() {
        let url = description_url("owner/repo/skill").unwrap();
        let authored = "完整作者简介，保留引号 \"value\"、换行\n和 <strong>literal text</strong>。";
        let html = description_document(
            json!({"@type":"SoftwareApplication","url":url.as_str(),"description":format!("  {authored}  ")}),
        );
        assert_eq!(
            parse_description(&html, &url).unwrap().as_deref(),
            Some(authored)
        );
        let html = format!(
            "<script type='application/ld+json'>{}</script>",
            json!({"@type":"SoftwareApplication","url":url.as_str(),"description":"Single quoted script attribute"})
        );
        assert_eq!(
            parse_description(&html, &url).unwrap().as_deref(),
            Some("Single quoted script attribute")
        );
        let related = format!(
            "<script type=\"application/ld+json\">{}</script>{html}",
            json!({"@type":"WebSite","description":"Not this skill"})
        );
        assert_eq!(
            parse_description(&related, &url).unwrap().as_deref(),
            Some("Single quoted script attribute")
        );
    }
    #[test]
    fn description_identity_and_missing_data_are_distinct_from_invalid_responses() {
        let url = description_url("owner/repo/skill").unwrap();
        for value in [
            json!({"@type":"SoftwareApplication","url":url.as_str()}),
            json!({"@type":"SoftwareApplication","url":url.as_str(),"description":null}),
            json!({"@type":"SoftwareApplication","url":url.as_str(),"description":"  \n "}),
        ] {
            assert!(parse_description(&description_document(value), &url)
                .unwrap()
                .is_none());
        }
        for value in [
            json!({"@type":"SoftwareApplication","url":"https://www.skills.sh/other/repo/skill","description":"Wrong skill"}),
            json!({"@type":"SoftwareApplication","url":"https://evil.test/owner/repo/skill","description":"Wrong origin"}),
            json!({"@type":"SoftwareApplication","description":"Missing identity"}),
            json!({"@type":"SoftwareApplication","url":url.as_str(),"description":123}),
        ] {
            assert!(parse_description(&description_document(value), &url).is_err());
        }
        for html in [
            "<html>unavailable</html>",
            "<meta name=\"description\" content=\"SEO only\">",
            "<script type=\"application/ld+json\">not json</script>",
            "<script type=\"application/ld+json\">{\"@type\":\"WebSite\"}</script>",
        ] {
            assert!(parse_description(html, &url).is_err());
        }
    }
    #[test]
    fn description_urls_keep_skill_ids_as_encoded_path_segments() {
        let url = description_url("owner/repo/skill?query#fragment").unwrap();
        assert_eq!(url.host_str(), Some("www.skills.sh"));
        assert!(url.query().is_none());
        assert!(url.fragment().is_none());
        assert_eq!(url.path(), "/owner/repo/skill%3Fquery%23fragment");
        for id in [
            "",
            "owner//skill",
            "../repo/skill",
            "owner/./skill",
            "owner/repo/line\nbreak",
        ] {
            assert!(description_url(id).is_err());
        }
        assert!(description_url(&"a".repeat(601)).is_err());
    }
    #[test]
    fn fresh_description_snapshot_restores_real_text_and_confirmed_absence_without_network() {
        let directory = std::env::temp_dir().join(format!(
            "skills-description-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let at = now();
        let records = HashMap::from([
            (
                "fixture/repo/known".to_string(),
                CachedDescription {
                    source_url: None,
                    source_error: None,
                    metadata: None,
                    html: None,
                    description: Some("Actual saved description".into()),
                    fetched_at: at,
                },
            ),
            (
                "fixture/repo/absent".to_string(),
                CachedDescription {
                    source_url: None,
                    source_error: None,
                    metadata: None,
                    html: None,
                    description: None,
                    fetched_at: at,
                },
            ),
            (
                "../invalid".to_string(),
                CachedDescription {
                    source_url: None,
                    source_error: None,
                    metadata: None,
                    html: None,
                    description: Some("Must not restore".into()),
                    fetched_at: at,
                },
            ),
        ]);
        std::fs::write(
            directory.join("descriptions.json"),
            serde_json::to_vec(&records).unwrap(),
        )
        .unwrap();
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        assert_eq!(
            load_description("fixture/repo/known", Some(&directory))
                .unwrap()
                .as_deref(),
            Some("Actual saved description")
        );
        assert!(load_description("fixture/repo/absent", Some(&directory))
            .unwrap()
            .is_none());
        assert!(!cache.lock().unwrap().contains_key("../invalid"));
        cache.lock().unwrap().clear();
        std::fs::remove_dir_all(directory).unwrap();
    }

    fn listing_document(id: &str, preview: &str, rest: &str) -> String {
        let url = description_url(id).unwrap();
        let metadata = if url.path().starts_with("/site/") {
            String::new()
        } else {
            format!(
                "<script type=\"application/ld+json\">{}</script>",
                json!({"@type":"SoftwareApplication","url":url.as_str(),"description":"Complete authored description"})
            )
        };
        let payload = format!("0:{}\n", json!({"previewHtml":preview,"restHtml":rest}));
        format!("<head><link rel=\"canonical\" href=\"{url}\"></head>{metadata}<script>self.__next_f.push({})</script>",json!([1,payload]).to_string().replace('<',"\\u003c"))
    }
    #[test]
    fn metadata_and_full_document_reuse_one_response_and_cache_record() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let id = "fixture/repo/one-response";
        let mut calls = 0;
        let first = load_listing_with(id, None, false, |url| {
            calls += 1;
            assert_eq!(url, description_url(id).unwrap());
            Ok(listing_document(
                id,
                "<p>Intro</p>",
                "<p>Complete ending</p>",
            ))
        })
        .unwrap();
        let full = load_listing_with(id, None, true, |_| {
            calls += 1;
            Err("must not fetch a second time".into())
        })
        .unwrap();
        assert_eq!(calls, 1);
        assert_eq!(
            first.description.as_deref(),
            Some("Complete authored description")
        );
        assert_eq!(
            full.html.as_deref(),
            Some("<p>Intro</p><p>Complete ending</p>")
        );
        assert_eq!(cache.lock().unwrap().len(), 1);
        cache.lock().unwrap().clear();
    }
    #[test]
    fn old_description_only_cache_migrates_on_document_read_and_errors_preserve_it() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let id = "fixture/repo/legacy";
        let old: CachedDescription = serde_json::from_value(
            json!({"description":"Legacy authored description","fetched_at":now()}),
        )
        .unwrap();
        assert!(old.html.is_none());
        cache.lock().unwrap().insert(id.into(), old);
        assert_eq!(
            load_listing_with(id, None, false, |_| panic!("metadata must reuse old cache"))
                .unwrap()
                .description
                .as_deref(),
            Some("Legacy authored description")
        );
        assert!(load_listing_with(id, None, true, |_| Err("network unavailable".into())).is_err());
        assert_eq!(
            cache
                .lock()
                .unwrap()
                .get(id)
                .unwrap()
                .description
                .as_deref(),
            Some("Legacy authored description")
        );
        let wrong = listing_document(id, "<p>Intro</p>", "<p>End</p>").replacen(
            "href=\"https://www.skills.sh/fixture/repo/legacy\"",
            "href=\"https://www.skills.sh/wrong/repo/skill\"",
            1,
        );
        assert!(load_listing_with(id, None, true, |_| Ok(wrong)).is_err());
        assert!(cache.lock().unwrap().get(id).unwrap().html.is_none());
        let mut calls = 0;
        let full = load_listing_with(id, None, true, |_| {
            calls += 1;
            Ok(listing_document(id, "<p>Intro</p>", "<p>End</p>"))
        })
        .unwrap();
        assert_eq!(calls, 1);
        assert_eq!(full.html.as_deref(), Some("<p>Intro</p><p>End</p>"));
        assert!(
            load_listing_with(id, None, true, |_| panic!("migrated body must be cached"))
                .unwrap()
                .html
                .is_some()
        );
        cache.lock().unwrap().clear();
    }
    #[test]
    fn website_body_without_authored_metadata_is_not_replaced_by_seo_text() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let id = "uizze.sh/ui-taste";
        let record = load_listing_with(id, None, false, |url| {
            assert_eq!(url.path(), "/site/uizze.sh/ui-taste");
            Ok(listing_document(
                id,
                "<h1>UI taste</h1><p>Actual original paragraph.</p>",
                "<h2>Last section</h2><p>Complete ending.</p>",
            ) + &format!("<script>self.__next_f.push({})</script>",json!([1,"1:{\"label\":\"Installation\",\"command\":\"npx skills add https://uizze.sh/skills/ui-taste\"}\n"])))
        })
        .unwrap();
        assert!(record.description.is_none());
        assert!(record.html.unwrap().contains("Complete ending."));
        assert!(load_listing_with(id, None, true, |_| panic!(
            "website body shares metadata request"
        ))
        .unwrap()
        .html
        .is_some());
        cache.lock().unwrap().clear();
    }
    #[test]
    fn valid_website_body_survives_missing_ambiguous_or_foreign_installation_metadata() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        let id = "uizze.sh/ui-taste";
        for commands in [
            vec![],
            vec![
                "npx skills add https://uizze.sh/a",
                "npx skills add https://uizze.sh/b",
            ],
            vec!["npx skills add https://other.test/wrong"],
        ] {
            cache.lock().unwrap().clear();
            let mut html = listing_document(
                id,
                "<h2>Intro</h2><p>Valid original paragraph</p>",
                "<p>Complete ending</p>",
            );
            if !commands.is_empty() {
                let payload = format!(
                    "1:{}\n",
                    json!(commands
                        .into_iter()
                        .map(|command| json!({"label":"Installation","command":command}))
                        .collect::<Vec<_>>())
                );
                html += &format!(
                    "<script>self.__next_f.push({})</script>",
                    json!([1, payload])
                );
            }
            let record = load_listing_with(id, None, true, |_| Ok(html)).unwrap();
            assert!(record.html.as_deref().unwrap().contains("Complete ending"));
            assert!(record.source_url.is_none());
        }
        cache.lock().unwrap().clear();
    }

    #[test]
    fn old_website_cache_without_full_source_refetches_and_preserves_valid_data_on_failure() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let id = "uizze.sh/ui-taste";
        let old: CachedDescription = serde_json::from_value(
            json!({"description":null,"html":"<p>Old body</p>","fetched_at":now()}),
        )
        .unwrap();
        cache.lock().unwrap().insert(id.into(), old);
        assert!(load_listing_with(id, None, false, |_| Err("offline".into())).is_err());
        let kept = cache.lock().unwrap().get(id).unwrap().html.clone();
        assert_eq!(kept.as_deref(), Some("<p>Old body</p>"));
        let html=listing_document(id,"<p>Intro</p>","<p>End</p>")+&format!("<script>self.__next_f.push({})</script>",json!([1,"1:{\"label\":\"Installation\",\"command\":\"npx skills add https://uizze.sh/skills/ui-taste\"}\n"]));
        let record = load_listing_with(id, None, false, |_| Ok(html)).unwrap();
        assert_eq!(
            record.source_url.as_deref(),
            Some("https://uizze.sh/skills/ui-taste")
        );
        assert!(load_listing_with(id, None, false, |_| panic!("full source now cached")).is_ok());
        cache.lock().unwrap().clear();
    }

    #[test]
    fn metadata_only_website_keeps_installation_usable_without_a_document() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let id = "example.org/chosen";
        let url = description_url(id).unwrap();
        let payload = format!(
            "0:{}\n",
            json!({"label":"Installation","command":"npx skills add https://example.org/skills/chosen","prompt":"Install chosen."})
        );
        let html=format!("<head><link rel=\"canonical\" href=\"{url}\"></head><script>self.__next_f.push({})</script>",json!([1,payload]));
        let record = load_listing_requirements(id, None, false, true, |_| Ok(html)).unwrap();
        assert!(record.html.is_none());
        assert!(record.description.is_none());
        assert_eq!(
            record.source_url.as_deref(),
            Some("https://example.org/skills/chosen")
        );
        assert!(record.metadata.unwrap().installation.is_some());
        cache.lock().unwrap().clear();
    }
    #[test]
    fn metadata_on_demand_migrates_old_snapshot_and_failed_enrichment_retains_successful_fields() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let id = "fixture/repo/metadata";
        let old: CachedDescription = serde_json::from_value(
            json!({"description":"Authored","html":"<p>Existing body</p>","fetched_at":now()}),
        )
        .unwrap();
        assert!(old.metadata.is_none());
        cache.lock().unwrap().insert(id.into(), old);
        assert!(
            load_listing_requirements(id, None, false, false, |_| panic!(
                "cards do not request enrichment"
            ))
            .is_ok()
        );
        assert!(
            load_listing_requirements(id, None, false, true, |_| Err("offline".into())).is_err()
        );
        let saved = cache.lock().unwrap().get(id).unwrap().clone();
        assert_eq!(saved.description.as_deref(), Some("Authored"));
        assert_eq!(saved.html.as_deref(), Some("<p>Existing body</p>"));
        let record = load_listing_requirements(id, None, false, true, |_| {
            Ok(listing_document(id, "<p>New body</p>", ""))
        })
        .unwrap();
        assert!(record.metadata.is_some());
        assert!(load_listing_requirements(id, None, false, true, |_| panic!(
            "confirmed empty metadata is cached"
        ))
        .is_ok());
        cache.lock().unwrap().clear();
    }

    #[test]
    fn metadata_enrichment_with_unavailable_flight_body_does_not_erase_an_existing_preview() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let id = "fixture/repo/metadata-partial";
        let url = description_url(id).unwrap();
        let old:CachedDescription=serde_json::from_value(json!({"description":"Authored","html":"<p>Existing complete preview</p>","fetched_at":now()})).unwrap();
        cache.lock().unwrap().insert(id.into(), old);
        let raw=format!("<head><link rel=\"canonical\" href=\"{url}\"></head><script type=\"application/ld+json\">{}</script>",json!({"@type":"SoftwareApplication","url":url.as_str(),"description":"Current authored description"}));
        let result = load_listing_requirements(id, None, false, true, |_| Ok(raw.clone()));
        assert!(result.is_err(),"an unparseable empty response is not confirmed absent metadata");
        let saved = cache.lock().unwrap().get(id).unwrap().html.clone();
        assert_eq!(saved.as_deref(), Some("<p>Existing complete preview</p>"));
        let payload=format!("0:{}\n",json!({"label":"Installation","command":"npx skills add fixture/repo","prompt":"Install the chosen skill."}));
        let partial=raw+&format!("<script>self.__next_f.push({})</script>",json!([1,payload]));
        let record=load_listing_requirements(id,None,false,true,|_|Ok(partial)).unwrap();
        assert_eq!(record.html.as_deref(),Some("<p>Existing complete preview</p>"));assert!(record.metadata.unwrap().installation.is_some());
        let saved = cache.lock().unwrap().get(id).unwrap().html.clone();assert_eq!(saved.as_deref(),Some("<p>Existing complete preview</p>"));
        cache.lock().unwrap().clear();
    }

    #[test]
    fn failed_required_body_read_does_not_replace_an_existing_full_snapshot() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let id = "fixture/repo/old-document";
        cache.lock().unwrap().insert(
            id.into(),
            CachedDescription {
                source_url: None,
                source_error: None,
                metadata: None,
                description: Some("Old valid description".into()),
                html: Some("<p>Old valid body</p>".into()),
                fetched_at: now().saturating_sub(86400),
            },
        );
        let raw = listing_document(id, "<p>New intro</p>", "<p>New end</p>")
            .replace("previewHtml", "unsupportedPreview");
        assert!(load_listing_with(id, None, true, |_| Ok(raw)).is_err());
        let preserved = cache.lock().unwrap().get(id).unwrap().html.clone();
        assert_eq!(preserved.as_deref(), Some("<p>Old valid body</p>"));
        cache.lock().unwrap().clear();
    }
    #[test]
    fn listing_snapshots_bound_both_entry_count_and_serialized_html_bytes() {
        let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
        cache.lock().unwrap().clear();
        let directory = std::env::temp_dir().join(format!(
            "skills-document-cache-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        for n in 0..300 {
            cache.lock().unwrap().insert(
                format!("fixture/repo/old-{n}"),
                CachedDescription {
                    source_url: None,
                    source_error: None,
                    metadata: None,
                    description: None,
                    html: Some("x".repeat(17000)),
                    fetched_at: now().saturating_sub(10),
                },
            );
        }
        let id = "fixture/repo/new-complete-document";
        load_listing_with(id, Some(&directory), false, |_| {
            Ok(listing_document(id, "<p>Intro</p>", "<p>End</p>"))
        })
        .unwrap();
        assert!(cache.lock().unwrap().len() <= 256);
        assert!(
            std::fs::metadata(directory.join("descriptions.json"))
                .unwrap()
                .len()
                <= RESPONSE_LIMIT
        );
        cache.lock().unwrap().clear();
        let restored = load_listing_with(id, Some(&directory), true, |_| {
            panic!("complete persisted record should not refetch")
        })
        .unwrap();
        assert_eq!(restored.html.as_deref(), Some("<p>Intro</p><p>End</p>"));
        cache.lock().unwrap().clear();
        std::fs::remove_dir_all(directory).unwrap();
    }
}

#[derive(Clone, Deserialize, Serialize)]
struct CachedDescription {
    description: Option<String>,
    #[serde(default)]
    html: Option<String>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    source_error: Option<String>,
    #[serde(default)]
    metadata: Option<document::Metadata>,
    fetched_at: u64,
}
static DESCRIPTIONS: OnceLock<Mutex<HashMap<String, CachedDescription>>> = OnceLock::new();

fn description_url(id: &str) -> Result<reqwest::Url, String> {
    document::listing_url(id)
}
fn parse_description(html: &str, expected_url: &reqwest::Url) -> Result<Option<String>, String> {
    // The site's SoftwareApplication JSON-LD contains the complete authored description,
    // unlike the shortened SEO meta tag. Read JSON only; never execute page scripts.
    for script in html.split("<script").skip(1) {
        let Some((attributes, body)) = script.split_once('>') else {
            continue;
        };
        if !attributes.split_ascii_whitespace().any(|attribute| {
            attribute == "type=\"application/ld+json\"" || attribute == "type='application/ld+json'"
        }) {
            continue;
        }
        let Some((json, _)) = body.split_once("</script>") else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
            continue;
        };
        if value["@type"] != "SoftwareApplication" {
            continue;
        }
        let actual = value["url"]
            .as_str()
            .and_then(|s| reqwest::Url::parse(s).ok());
        if actual.as_ref() != Some(expected_url) {
            return Err("Skill description belongs to a different listing.".into());
        }
        return match value.get("description") {
            None | Some(serde_json::Value::Null) => Ok(None),
            Some(serde_json::Value::String(text)) => {
                Ok((!text.trim().is_empty()).then(|| text.trim().chars().take(2000).collect()))
            }
            _ => Err("Invalid skill description.".into()),
        };
    }
    Err("Skill description is unavailable in this response.".into())
}
#[cfg(test)]
fn load_description(id: &str, directory: Option<&Path>) -> Result<Option<String>, String> {
    Ok(load_listing(id, directory, false)?.description)
}
fn load_listing(
    id: &str,
    directory: Option<&Path>,
    require_document: bool,
) -> Result<CachedDescription, String> {
    load_listing_with(id, directory, require_document, response)
}
fn load_listing_with(
    id: &str,
    directory: Option<&Path>,
    require_document: bool,
    fetch: impl FnOnce(reqwest::Url) -> Result<String, String>,
) -> Result<CachedDescription, String> {
    load_listing_requirements(id, directory, require_document, false, fetch)
}
fn load_listing_requirements(
    id: &str,
    directory: Option<&Path>,
    require_document: bool,
    require_metadata: bool,
    fetch: impl FnOnce(reqwest::Url) -> Result<String, String>,
) -> Result<CachedDescription, String> {
    let url = description_url(id)?;
    let cache = DESCRIPTIONS.get_or_init(|| Mutex::new(HashMap::new()));
    {
        let mut stored = cache.lock().map_err(|_| "Description cache unavailable.")?;
        if stored.is_empty() {
            if let Some(path) = directory.map(|dir| dir.join("descriptions.json")) {
                if std::fs::metadata(&path).is_ok_and(|meta| meta.len() <= RESPONSE_LIMIT) {
                    if let Ok(bytes) = std::fs::read(path) {
                        if let Ok(records) =
                            serde_json::from_slice::<HashMap<String, CachedDescription>>(&bytes)
                        {
                            stored.extend(
                                records
                                    .into_iter()
                                    .filter(|(id, item)| {
                                        description_url(id).is_ok()
                                            && item
                                                .description
                                                .as_ref()
                                                .is_none_or(|text| text.len() <= 8000)
                                            && item
                                                .html
                                                .as_ref()
                                                .is_none_or(|text| text.len() <= 256 * 1024)
                                    })
                                    .take(256),
                            );
                        }
                    }
                }
            }
        }
        if let Some(item) = stored.get(id).filter(|item| {
            now().saturating_sub(item.fetched_at) < 86400
                && (!require_document || item.html.is_some())
                && (!require_metadata || item.metadata.is_some())
                && (!url.path().starts_with("/site/")
                    || item.source_url.as_ref().is_some_and(|source| {
                        document::validate_installation_source(
                            source,
                            id.split('/').next().unwrap_or_default(),
                        )
                        .is_ok()
                    }))
        }) {
            return Ok(item.clone());
        }
    }
    let raw = fetch(url.clone())?;
    document::validate_canonical(&raw, &url)?;
    let extracted = document::extract(&raw);
    let (source_url, source_error) = if url.path().starts_with("/site/") {
        match extracted.as_ref().map_err(Clone::clone).and_then(|page| {
            page.installation_source(id.split('/').next().ok_or("Missing website identity.")?)
        }) {
            Ok(source) => (Some(source), None),
            Err(reason) => (None, Some(reason)),
        }
    } else {
        (None, None)
    };
    let description = if url.path().starts_with("/site/") {
        None
    } else {
        parse_description(&raw, &url)?
    };
    let body = extracted
        .as_ref()
        .map_err(Clone::clone)
        .and_then(|page| page.body.clone());
    let metadata = extracted.as_ref().ok().map(|page| page.metadata.clone());
    if require_document {
        body.as_ref().map_err(Clone::clone)?;
    }
    if require_metadata
        && body.is_err()
        && source_url.is_none()
        && !metadata.as_ref().is_some_and(document::Metadata::has_data)
    {
        return Err(body
            .as_ref()
            .err()
            .cloned()
            .unwrap_or_else(|| "Skill information is unavailable.".into()));
    }
    let previous_body = if body.is_err() {
        cache
            .lock()
            .map_err(|_| "Description cache unavailable.")?
            .get(id)
            .and_then(|record| record.html.clone())
    } else {
        None
    };
    let record = CachedDescription {
        description,
        html: body.as_ref().ok().cloned().or(previous_body),
        source_url,
        source_error,
        metadata,
        fetched_at: now(),
    };
    if record.description.is_none()
        && record.html.is_none()
        && record.source_url.is_none()
        && !record
            .metadata
            .as_ref()
            .is_some_and(document::Metadata::has_data)
    {
        return Err(body
            .err()
            .unwrap_or_else(|| "Skill document is unavailable.".into()));
    }
    let mut stored = cache.lock().map_err(|_| "Description cache unavailable.")?;
    stored.insert(id.into(), record.clone());
    while stored.len() > 256 {
        if let Some(old) = stored
            .iter()
            .min_by_key(|(_, item)| item.fetched_at)
            .map(|(id, _)| id.clone())
        {
            stored.remove(&old);
        }
    }
    if let Some(directory) = directory {
        if std::fs::create_dir_all(directory).is_ok() {
            while let Ok(bytes) = serde_json::to_vec(&*stored) {
                if bytes.len() as u64 <= RESPONSE_LIMIT {
                    let _ = std::fs::write(directory.join("descriptions.json"), bytes);
                    break;
                }
                if let Some(old) = stored
                    .iter()
                    .min_by_key(|(_, item)| item.fetched_at)
                    .map(|(id, _)| id.clone())
                {
                    stored.remove(&old);
                } else {
                    break;
                }
            }
        }
    }
    Ok(record)
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsiteDocument {
    metadata: Option<document::Metadata>,
    description: Option<String>,
    html: Option<String>,
    source_url: Option<String>,
    #[serde(default)]
    source_error: Option<String>,
}
#[tauri::command]
pub async fn fetch_skill_document(
    app: tauri::AppHandle,
    id: String,
    require_document: bool,
    require_metadata: Option<bool>,
) -> Result<WebsiteDocument, String> {
    let directory = app
        .path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join("skills-store"));
    tauri::async_runtime::spawn_blocking(move || {
        let record = load_listing_requirements(
            &id,
            directory.as_deref(),
            require_document,
            require_metadata.unwrap_or(false),
            response,
        )?;
        Ok(WebsiteDocument {
            metadata: record.metadata,
            description: record.description,
            html: record.html,
            source_url: record.source_url,
            source_error: record.source_error,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn fetch_skill_markdown(app: tauri::AppHandle, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = document::listing_url(&id)?;
        let parts: Vec<_> = id.split('/').collect();
        if url.path().starts_with("/site/") {
            let directory = app
                .path()
                .app_cache_dir()
                .ok()
                .map(|dir| dir.join("skills-store"));
            let record = load_listing(&id, directory.as_deref(), false)?;
            let source = record.source_url.ok_or_else(|| {
                record
                    .source_error
                    .unwrap_or_else(|| "Published installation source is unavailable.".into())
            })?;
            crate::upstream::marketplace_skill_document(&app, &source, parts[1])
        } else {
            document::snapshot_markdown(&response(document::snapshot_url(&id)?)?)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
