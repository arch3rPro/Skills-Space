//! Read-only application and bundled CLI release metadata. Never replace runtime files.
use serde::Serialize;
use std::{io::Read, time::Duration};
use tauri::AppHandle;

const APP_RELEASE: &str = "https://api.github.com/repos/arch3rPro/skills-space/releases/latest";
const CLI_RELEASE: &str = "https://registry.npmjs.org/-/package/skills/dist-tags";
const APP_DOWNLOADS: &str = "https://github.com/arch3rPro/skills-space/releases/latest";
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
fn check(client: &reqwest::blocking::Client, item: &mut VersionEntry, url: &str, app: bool) {
    let result = (|| -> Result<Option<String>, &'static str> {
        let response = client.get(url).send().map_err(|_| "network")?;
        if app && response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let mut response = response.error_for_status().map_err(|_| "service")?;
        let mut bytes = Vec::new();
        response
            .by_ref()
            .take(LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "network")?;
        if bytes.len() as u64 > LIMIT {
            return Err("response");
        }
        let value: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| "response")?;
        if app && (value["draft"] != false || value["prerelease"] != false) {
            return Err("response");
        }
        let latest = value[if app { "tag_name" } else { "latest" }]
            .as_str()
            .ok_or("response")?;
        if stable(latest).is_none() || stable(&item.current).is_none() {
            return Err("response");
        }
        Ok(Some(latest.strip_prefix('v').unwrap_or(latest).to_owned()))
    })();
    match result {
        Ok(None) => item.state = "unreleased",
        Ok(Some(latest)) => {
            item.state = if stable(&latest) > stable(&item.current) {
                "available"
            } else {
                "current"
            };
            if app && item.state == "available" {
                item.url = Some(APP_DOWNLOADS.into());
            }
            item.latest = Some(latest);
        }
        Err(error) => {
            item.state = "failed";
            item.error = Some(error);
        }
    }
}
fn check_all(mut versions: Versions, app_url: &str, cli_url: &str) -> Result<Versions, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Skills-Space version check")
        .timeout(Duration::from_secs(12))
        .connect_timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    std::thread::scope(|scope| {
        let job = scope.spawn(|| check(&client, &mut versions.app, app_url, true));
        check(&client, &mut versions.cli, cli_url, false);
        job.join().map_err(|_| "Version check failed.")
    })?;
    Ok(versions)
}
#[tauri::command]
pub fn application_versions(app: AppHandle) -> Result<Versions, String> {
    info(&app)
}
#[tauri::command]
pub async fn application_check_versions(app: AppHandle) -> Result<Versions, String> {
    tauri::async_runtime::spawn_blocking(move || check_all(info(&app)?, APP_RELEASE, CLI_RELEASE))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn server(status: &str, body: &str) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
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
    #[test]
    fn application_manifest_versions_stay_in_sync() {
        let package: serde_json::Value =
            serde_json::from_str(include_str!("../../package.json")).unwrap();
        let tauri: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(package["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(tauri["version"], package["version"]);
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
        for (status, body, state) in [
            ("404 Not Found", "{}", "unreleased"),
            ("403 Forbidden", "{}", "failed"),
            (
                "200 OK",
                r#"{"tag_name":"v0.1.1","draft":false,"prerelease":false}"#,
                "available",
            ),
            (
                "200 OK",
                r#"{"tag_name":"v0.1.0","draft":false,"prerelease":false}"#,
                "current",
            ),
        ] {
            item = entry(item.current);
            let (url, task) = server(status, body);
            check(&client, &mut item, &url, true);
            task.join().unwrap();
            assert_eq!(item.state, state);
            assert_eq!(item.url.is_some(), state == "available");
        }
        for (body, state) in [
            (r#"{"latest":"1.7.4","snapshot":"9.0.0-beta"}"#, "current"),
            (r#"{"latest":"1.10.0"}"#, "available"),
            (r#"{"latest":"broken"}"#, "failed"),
            ("{", "failed"),
        ] {
            let (mut cli, (url, task)) = (entry("1.7.4".into()), server("200 OK", body));
            check(&client, &mut cli, &url, false);
            task.join().unwrap();
            assert_eq!(cli.state, state);
            assert!(cli.url.is_none());
        }
    }
}
