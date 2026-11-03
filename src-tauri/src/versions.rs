//! Read-only published release metadata. Never replace runtime files.
use quick_xml::{events::Event, Reader};
use serde::Serialize;
use std::{io::Read, time::Duration};
use tauri::AppHandle;

const APP_RELEASE: &str = "https://github.com/arch3rPro/Skills-Space/releases/latest";
const APP_FEED: &str = "https://github.com/arch3rPro/Skills-Space/releases.atom";
#[cfg(test)]
const APP_TAG: &str = "https://github.com/arch3rPro/Skills-Space/releases/tag/";
const LIMIT: u64 = 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionEntry {
    current: String,
    latest: Option<String>,
    state: &'static str,
    url: Option<String>,
    error: Option<&'static str>,
}
#[derive(Debug, Serialize)]
pub struct Versions {
    app: VersionEntry,
    cli: VersionEntry,
}
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseNote {
    version: String,
    title: String,
    url: String,
    updated_at: String,
    html: String,
}
#[derive(Debug, Serialize)]
pub struct ReleaseNotes {
    latest: Option<String>,
    releases: Vec<ReleaseNote>,
}
fn entry(current: String) -> VersionEntry {
    VersionEntry {
        current,
        latest: None,
        state: "unchecked",
        url: None,
        error: None,
    }
}
fn info(app: &AppHandle) -> Result<Versions, String> {
    Ok(Versions {
        app: entry(app.package_info().version.to_string()),
        cli: entry(crate::upstream::bundled_version(app)?),
    })
}
fn stable(version: &str) -> Option<[u64; 3]> {
    let mut parts = version.strip_prefix('v').unwrap_or(version).split('.');
    let mut result = [0; 3];
    for part in &mut result {
        let value = parts.next()?;
        if value.is_empty() || !value.bytes().all(|c| c.is_ascii_digit()) {
            return None;
        }
        *part = value.parse().ok()?;
    }
    parts.next().is_none().then_some(result)
}
fn client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .user_agent("Skills-Space version check")
        .timeout(Duration::from_secs(12))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())
}
fn body(client: &reqwest::blocking::Client, url: &str) -> Result<Vec<u8>, &'static str> {
    let mut response = client
        .get(url)
        .send()
        .map_err(|_| "network")?
        .error_for_status()
        .map_err(|_| "service")?;
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "network")?;
    if bytes.len() as u64 > LIMIT {
        return Err("response");
    }
    Ok(bytes)
}
// GitHub's public latest redirect identifies the stable release without API quota.
fn app_latest(
    client: &reqwest::blocking::Client,
    url: &str,
) -> Result<Option<(String, String)>, &'static str> {
    let response = client.head(url).send().map_err(|_| "network")?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    let response = response.error_for_status().map_err(|_| "service")?;
    let expected = reqwest::Url::parse(url).map_err(|_| "response")?;
    if response.url().origin() != expected.origin() {
        return Err("response");
    }
    let tag = response
        .url()
        .path()
        .rsplit_once("/releases/tag/")
        .ok_or("response")?
        .1;
    if stable(tag).is_none() {
        return Err("response");
    }
    Ok(Some((
        tag.strip_prefix('v').unwrap_or(tag).to_owned(),
        response.url().to_string(),
    )))
}
fn check(client: &reqwest::blocking::Client, item: &mut VersionEntry, url: &str) {
    let result = app_latest(client, url).map(|latest| latest.map(|(version, _)| version));
    match result {
        Ok(None) => item.state = "unreleased",
        Ok(Some(latest)) if stable(&item.current).is_some() => {
            item.state = if stable(&latest) > stable(&item.current) {
                "available"
            } else {
                "current"
            };
            if item.state == "available" {
                item.url = Some(APP_RELEASE.into());
            }
            item.latest = Some(latest);
        }
        result => {
            item.state = "failed";
            item.error = Some(result.err().unwrap_or("response"));
        }
    }
}
fn parse_feed(source: &str, tag_prefix: &str) -> Result<Vec<ReleaseNote>, &'static str> {
    let mut reader = Reader::from_str(source);
    let mut current: Option<ReleaseNote> = None;
    let mut releases = Vec::new();
    loop {
        match reader.read_event().map_err(|_| "response")? {
            Event::Start(e) if e.name().as_ref() == b"entry" => {
                current = Some(ReleaseNote::default())
            }
            Event::Empty(e) | Event::Start(e)
                if e.name().as_ref() == b"link" && current.is_some() =>
            {
                let mut alternate = false;
                let mut href = String::new();
                for attribute in e.attributes() {
                    let attribute = attribute.map_err(|_| "response")?;
                    let value = attribute
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|_| "response")?;
                    match attribute.key.as_ref() {
                        b"rel" => alternate = value == "alternate",
                        b"href" => href = value.into_owned(),
                        _ => {}
                    }
                }
                if alternate {
                    if let Some(note) = current.as_mut() {
                        note.url = href;
                    }
                }
            }
            Event::Start(e)
                if current.is_some()
                    && matches!(e.name().as_ref(), b"title" | b"content" | b"updated") =>
            {
                let raw = reader.read_text(e.name()).map_err(|_| "response")?;
                let raw = raw.decode().map_err(|_| "response")?;
                let value = if let Some(cdata) = raw
                    .strip_prefix("<![CDATA[")
                    .and_then(|v| v.strip_suffix("]]>"))
                {
                    cdata.to_owned()
                } else {
                    quick_xml::escape::unescape(&raw)
                        .map_err(|_| "response")?
                        .into_owned()
                };
                if let Some(note) = current.as_mut() {
                    match e.name().as_ref() {
                        b"title" => note.title = value,
                        b"updated" => note.updated_at = value,
                        b"content" => note.html = value,
                        _ => {}
                    }
                }
            }
            Event::End(e) if e.name().as_ref() == b"entry" => {
                if let Some(mut note) = current.take() {
                    if let Some(tag) = note.url.strip_prefix(tag_prefix) {
                        if stable(tag).is_some() {
                            note.version = tag.strip_prefix('v').unwrap_or(tag).to_owned();
                            releases.push(note);
                        }
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if current.is_some() {
        return Err("response");
    }
    releases.sort_by(|a, b| stable(&b.version).cmp(&stable(&a.version)));
    Ok(releases)
}
fn release_notes(
    client: &reqwest::blocking::Client,
    app_url: &str,
    feed_url: &str,
) -> Result<ReleaseNotes, &'static str> {
    let (latest, feed) = std::thread::scope(|scope| -> Result<_, &'static str> {
        let latest = scope.spawn(|| app_latest(client, app_url));
        let feed = body(client, feed_url);
        Ok((latest.join().map_err(|_| "response")??, feed))
    })?;
    let Some((version, url)) = latest else {
        return Ok(ReleaseNotes {
            latest: None,
            releases: vec![],
        });
    };
    let feed = feed?;
    let prefix = format!(
        "{}/tag/",
        app_url.strip_suffix("/latest").ok_or("response")?
    );
    let mut releases = parse_feed(std::str::from_utf8(&feed).map_err(|_| "response")?, &prefix)?;
    // Do not mislabel an older entry as latest when the feed lacks that release.
    let index = releases
        .iter()
        .position(|note| note.url == url)
        .ok_or("response")?;
    let latest = releases.remove(index);
    releases.insert(0, latest);
    Ok(ReleaseNotes {
        latest: Some(version),
        releases,
    })
}
fn check_all(mut versions: Versions, app_url: &str) -> Result<Versions, String> {
    check(&client()?, &mut versions.app, app_url);
    Ok(versions)
}
#[tauri::command]
pub fn application_versions(app: AppHandle) -> Result<Versions, String> {
    info(&app)
}
#[tauri::command]
pub async fn application_check_versions(app: AppHandle) -> Result<Versions, String> {
    tauri::async_runtime::spawn_blocking(move || check_all(info(&app)?, APP_RELEASE))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn application_release_notes() -> Result<ReleaseNotes, String> {
    tauri::async_runtime::spawn_blocking(|| {
        release_notes(&client()?, APP_RELEASE, APP_FEED).map_err(str::to_owned)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn server(status: &str, text: &str) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
            text.len()
        );
        let task = std::thread::spawn(move || {
            use std::io::Write;
            let (mut socket, _) = listener.accept().unwrap();
            let mut buffer = [0; 2048];
            let _ = socket.read(&mut buffer);
            socket.write_all(response.as_bytes()).unwrap();
        });
        (format!("http://{address}"), task)
    }
    fn app_server(tag: &str) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let first = format!("HTTP/1.1 302 Found\r\nLocation: /releases/tag/{tag}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let task = std::thread::spawn(move || {
            use std::io::Write;
            for response in [
                first.as_str(),
                "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
            ] {
                let (mut socket, _) = listener.accept().unwrap();
                let mut buffer = [0; 2048];
                let n = socket.read(&mut buffer).unwrap();
                assert!(buffer[..n].starts_with(b"HEAD "));
                socket.write_all(response.as_bytes()).unwrap();
            }
        });
        (format!("http://{address}/releases/latest"), task)
    }
    #[test]
    fn stable_versions_compare_numerically_and_reject_unusable_tags() {
        assert!(stable("1.10.0") > stable("1.7.4"));
        assert_eq!(stable("v1.7.4"), stable("1.7.4"));
        for value in ["latest", "1.7", "1.7.4-beta.1", "1.7.4.1", "1.7.-4"] {
            assert!(stable(value).is_none());
        }
    }
    #[test]
    fn metadata_checks_distinguish_available_current_unreleased_and_retry() {
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .build()
            .unwrap();
        let mut item = entry("0.1.0".into());
        for (status, expected) in [("404 Not Found", "unreleased"), ("403 Forbidden", "failed")] {
            let (url, task) = server(status, "");
            check(&client, &mut item, &url);
            task.join().unwrap();
            assert_eq!(item.state, expected);
        }
        for (tag, expected) in [
            ("v0.1.1", "available"),
            ("v0.1.0", "current"),
            ("v0.2.0-beta.1", "failed"),
        ] {
            item = entry(item.current);
            let (url, task) = app_server(tag);
            check(&client, &mut item, &url);
            task.join().unwrap();
            assert_eq!(item.state, expected);
            assert_eq!(item.url.is_some(), expected == "available");
        }

    }
    #[test]
    fn atom_notes_preserve_complete_html_and_sort_published_versions() {
        let source = format!(
            r#"<feed xmlns="http://www.w3.org/2005/Atom"><title>ignore feed title</title>
<entry><title>Old &amp; safe</title><updated>2026-01-01T00:00:00Z</updated><link rel="alternate" href="{APP_TAG}v0.1.0"/><content type="html">&lt;h2&gt;功能&lt;/h2&gt;&lt;p&gt;A &amp;amp; B&lt;/p&gt;</content></entry>
<entry><title>New</title><link rel="alternate" href="{APP_TAG}v0.2.0"/><content type="html"><![CDATA[<p>Full notes</p>]]></content></entry>
<entry><link rel="alternate" href="{APP_TAG}v0.3.0-beta.1"/></entry>
<entry><link rel="alternate" href="https://example.com/releases/tag/v9.0.0"/></entry></feed>"#
        );
        let notes = parse_feed(&source, APP_TAG).unwrap();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].version, "0.2.0");
        assert_eq!(notes[0].html, "<p>Full notes</p>");
        assert_eq!(notes[1].title, "Old & safe");
        assert_eq!(notes[1].html, "<h2>功能</h2><p>A &amp; B</p>");
        assert!(parse_feed("<feed><entry><title>broken</entry>", APP_TAG).is_err());
    }
    #[test]
    fn public_release_notes_match_latest_redirect_and_keep_older_notes() {
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .build()
            .unwrap();
        let (latest, head) = app_server("v0.2.0");
        let prefix = latest.strip_suffix("latest").unwrap();
        let feed = format!(
            r#"<feed><entry><title>New</title><link rel="alternate" href="{prefix}tag/v0.2.0"/><content>&lt;p&gt;New content&lt;/p&gt;</content></entry><entry><title>Old</title><link rel="alternate" href="{prefix}tag/v0.1.0"/><content>&lt;p&gt;Old content&lt;/p&gt;</content></entry></feed>"#
        );
        let (url, get) = server("200 OK", &feed);
        let notes = release_notes(&client, &latest, &url).unwrap();
        head.join().unwrap();
        get.join().unwrap();
        assert_eq!(notes.latest.as_deref(), Some("0.2.0"));
        assert_eq!(notes.releases.len(), 2);
        assert_eq!(notes.releases[0].html, "<p>New content</p>");
        assert_eq!(notes.releases[1].version, "0.1.0");
    }
}
