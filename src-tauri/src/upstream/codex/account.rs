//! Independent original-CLI authorization. No desktop credentials or tokens cross IPC.
use super::*;
use std::sync::{Mutex, OnceLock};
use tauri_plugin_opener::OpenerExt;

const REQUIRED: &str = "CODEX_AUTH_REQUIRED";
const FAILED: &str = "CODEX_AUTH_FAILED";
static ACCOUNT: OnceLock<Mutex<Option<OwnedAccount>>> = OnceLock::new();
fn store() -> &'static Mutex<Option<OwnedAccount>> {
    ACCOUNT.get_or_init(|| Mutex::new(None))
}

struct OwnedAccount {
    session: Option<Session>,
    http: Option<reqwest::blocking::Client>,
    root: PathBuf,
    attempt: String,
    login: String,
    started: Instant,
    ready: bool,
}
impl Drop for OwnedAccount {
    fn drop(&mut self) {
        drop(self.session.take());
        let _ = fs::remove_dir_all(&self.root);
    }
}
impl OwnedAccount {
    fn rpc(&mut self, method: &str, params: Value) -> Result<Value, String> {
        self.session
            .as_mut()
            .ok_or(FAILED)?
            .call(method, params)
            .map_err(|_| {
                if method.starts_with("account/login/") {
                    FAILED.into()
                } else {
                    "CODEX_ACCOUNT_SERVICE".into()
                }
            })
    }
    fn poll(&mut self) -> Result<(), String> {
        if self.ready || self.login.is_empty() {
            return Ok(());
        }
        if self.started.elapsed() > Duration::from_secs(600) {
            return Err("CODEX_AUTH_TIMEOUT".into());
        }
        match self
            .session
            .as_mut()
            .ok_or(FAILED)?
            .poll_login(&self.login)
            .map_err(|_| FAILED)?
        {
            Some(true) => self.ready = true,
            Some(false) => return Err(FAILED.into()),
            None => (),
        }
        Ok(())
    }
    fn request(
        &mut self,
        method: reqwest::Method,
        path: &str,
        product: &str,
    ) -> Result<Value, String> {
        self.request_with_language(method, path, product, None)
    }
    fn request_with_language(
        &mut self,
        method: reqwest::Method,
        path: &str,
        product: &str,
        language: Option<&str>,
    ) -> Result<Value, String> {
        self.poll()?;
        if !self.ready {
            return Err(REQUIRED.into());
        }
        if self.http.is_none() {
            self.http = Some(
                reqwest::blocking::Client::builder()
                    .no_proxy()
                    .redirect(reqwest::redirect::Policy::none())
                    .timeout(Duration::from_secs(30))
                    .user_agent("SkillsSpace/0.1")
                    .build()
                    .map_err(|_| "CODEX_ACCOUNT_NETWORK")?,
            );
        }
        let client = self.http.as_ref().ok_or("CODEX_ACCOUNT_NETWORK")?.clone();
        for refresh in [false, true] {
            let auth = match self.rpc(
                "getAuthStatus",
                json!({"includeToken":true,"refreshToken":refresh}),
            ) {
                Ok(value) => value,
                Err(_) => return Err("CODEX_ACCOUNT_SERVICE".into()),
            };
            let Some(token) = auth["authToken"].as_str().filter(|s| !s.is_empty()) else {
                self.ready = false;
                self.login.clear();
                return Err(REQUIRED.into());
            };
            // Only select routing; profile fields are never used, returned, or logged.
            let account = self.rpc("account/read", json!({"refreshToken":false}))?;
            let routing = &account["workspaceRouting"];
            let origin = routing_origin(routing)?;
            let id = routing["chatgptAccountId"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or("CODEX_ACCOUNT_ROUTING")?;
            let mut request = client
                .request(method.clone(), format!("{origin}/backend-api{path}"))
                .bearer_auth(token)
                .header("ChatGPT-Account-Id", id)
                .header("originator", "skills_space")
                .header("OAI-Product-Sku", product)
                .header("X-Codex-Surface", "other")
                .header("Accept", "application/json");
            if let Some(language) = language {
                request = request.header("OAI-Language", language);
            }
            match routing["accountRoutingOverride"].as_str() {
                Some("NO_CONSTRAINT") => (),
                Some(value @ ("us" | "us_cr")) => {
                    request = request.header("X-OpenAI-Account-Routing-Override", value)
                }
                _ => return Err("CODEX_ACCOUNT_ROUTING".into()),
            }
            let response = request.send().map_err(|_| "CODEX_ACCOUNT_NETWORK")?;
            let status = response.status();
            let json_content = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|h| h.to_str().ok())
                .is_some_and(|s| s.contains("json"));
            if status.as_u16() == 401 {
                if !refresh {
                    continue;
                }
                self.ready = false;
                self.login.clear();
                return Err(REQUIRED.into());
            }
            if !status.is_success() {
                return Err(match (status.as_u16(), json_content) {
                    (403, false) => "CODEX_ACCOUNT_GATEWAY",
                    (403, true) => "CODEX_ACCOUNT_DENIED",
                    (409, _) => "CODEX_ACCOUNT_CHANGED",
                    (429, _) => "CODEX_ACCOUNT_RATE_LIMIT",
                    _ => "CODEX_ACCOUNT_SERVICE",
                }
                .into());
            }
            let mut bytes = Vec::new();
            response
                .take(4 * 1024 * 1024 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "CODEX_ACCOUNT_NETWORK")?;
            if bytes.len() > 4 * 1024 * 1024 {
                return Err("CODEX_ACCOUNT_SERVICE".into());
            }
            return if bytes.is_empty() {
                Ok(json!({}))
            } else {
                serde_json::from_slice(&bytes).map_err(|_| "CODEX_ACCOUNT_SERVICE".into())
            };
        }
        Err(REQUIRED.into())
    }
    fn installed(&mut self) -> Result<Vec<Value>, String> {
        let mut result = Vec::new();
        let mut page: Option<String> = None;
        for _ in 0..20 {
            let mut query =
                reqwest::Url::parse("https://chatgpt.com/").map_err(|_| "CODEX_ACCOUNT_SERVICE")?;
            query.query_pairs_mut().append_pair("limit", "1000");
            if let Some(page) = &page {
                query.query_pairs_mut().append_pair("pageToken", page);
            }
            let data = self.request(
                reqwest::Method::GET,
                &format!(
                    "/ps/plugins/installed?{}",
                    query.query().unwrap_or_default()
                ),
                "CODEX",
            )?;
            result.extend(
                data["plugins"]
                    .as_array()
                    .ok_or("CODEX_ACCOUNT_SERVICE")?
                    .iter()
                    .cloned(),
            );
            page = data["pagination"]["next_page_token"]
                .as_str()
                .filter(|s| !s.is_empty())
                .map(str::to_owned);
            if page.is_none() {
                return Ok(result);
            }
        }
        Err("CODEX_ACCOUNT_SERVICE".into())
    }
}
fn routing_origin(value: &Value) -> Result<String, String> {
    let origin = value["backendOrigin"]
        .as_str()
        .ok_or("CODEX_ACCOUNT_ROUTING")?;
    let url = reqwest::Url::parse(origin).map_err(|_| "CODEX_ACCOUNT_ROUTING")?;
    let host = url.host_str().ok_or("CODEX_ACCOUNT_ROUTING")?;
    if url.scheme() != "https"
        || url.origin().ascii_serialization() != origin
        || !(host == "chatgpt.com"
            || host == "openai.com"
            || host.ends_with(".chatgpt.com")
            || host.ends_with(".openai.com"))
    {
        return Err("CODEX_ACCOUNT_ROUTING".into());
    }
    Ok(origin.into())
}
fn validate_login_url(value: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(value).map_err(|_| FAILED)?;
    if url.scheme() != "https"
        || url.host_str() != Some("auth.openai.com")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(FAILED.into());
    }
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    state: &'static str,
    attempt_id: Option<String>,
}
fn status_value(account: &OwnedAccount) -> Status {
    Status {
        state: if account.ready {
            "ready"
        } else if account.login.is_empty() {
            "required"
        } else {
            "waiting"
        },
        attempt_id: Some(account.attempt.clone()),
    }
}
pub fn cleanup() {
    if let Ok(mut account) = store().lock() {
        account.take();
    }
}

fn storage_home(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "CODEX_AUTH_STORAGE")?
        .join("codex-account"))
}
fn open_account(app: &AppHandle) -> Result<OwnedAccount, String> {
    let engine = Engine::from_app(app)?;
    let binary = runtime::app_binary(&engine)
        .or_else(|| binary(&engine))
        .ok_or("CODEX_AUTH_UNAVAILABLE")?;
    let attempt = format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| FAILED)?
            .as_nanos()
    );
    let root = std::env::temp_dir().join(format!("skills-space-account-{attempt}"));
    fs::create_dir(&root).map_err(|_| FAILED)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).is_err() {
            let _ = fs::remove_dir(&root);
            return Err(FAILED.into());
        }
    }
    let mut account = OwnedAccount {
        http: None,
        session: None,
        root,
        attempt,
        login: String::new(),
        started: Instant::now(),
        ready: false,
    };
    account.session = Some(
        Session::start_account(&binary, &account.root, &storage_home(app)?, &engine.home)
            .map_err(|_| "CODEX_AUTH_STORAGE")?,
    );
    let initial = account.rpc(
        "getAuthStatus",
        json!({"includeToken":false,"refreshToken":false}),
    )?;
    account.ready = matches!(
        initial["authMethod"].as_str(),
        Some("chatgpt" | "chatgptAuthTokens")
    );
    Ok(account)
}

#[tauri::command]
pub async fn upstream_codex_account_start(app: AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = store().lock().map_err(|_| FAILED)?;
        if let Some(account) = state.as_mut() {
            if account.poll().is_ok() && account.ready {
                return Ok(status_value(account));
            }
        }
        state.take();
        let mut account = open_account(&app)?;
        if account.ready {
            let result = status_value(&account);
            *state = Some(account);
            return Ok(result);
        }
        let response = account.rpc("account/login/start", json!({"type":"chatgpt"}))?;
        let url = response["authUrl"].as_str().ok_or(FAILED)?;
        validate_login_url(url)?;
        account.login = response["loginId"].as_str().ok_or(FAILED)?.into();
        app.opener()
            .open_url(url, None::<&str>)
            .map_err(|_| "CODEX_AUTH_BROWSER")?;
        let result = status_value(&account);
        *state = Some(account);
        Ok(result)
    })
    .await
    .map_err(|_| FAILED.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_account_status(
    app: AppHandle,
    attempt_id: Option<String>,
) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = store().lock().map_err(|_| FAILED)?;
        if state.is_none() && attempt_id.is_none() && storage_home(&app)?.is_dir() {
            *state = Some(open_account(&app)?);
        }
        let Some(account) = state.as_mut() else {
            return Ok(Status {
                state: "required",
                attempt_id: None,
            });
        };
        if attempt_id.as_ref().is_some_and(|id| id != &account.attempt) {
            return Err("CODEX_AUTH_CANCELLED".into());
        }
        if let Err(error) = account.poll() {
            state.take();
            return Err(error);
        }
        Ok(status_value(account))
    })
    .await
    .map_err(|_| FAILED.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_account_cancel(attempt_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = store().lock().map_err(|_| FAILED)?;
        if state
            .as_ref()
            .is_some_and(|a| a.attempt == attempt_id && !a.ready)
        {
            state.take();
        }
        Ok(())
    })
    .await
    .map_err(|_| FAILED.to_string())?
}

#[tauri::command]
pub async fn upstream_codex_account_logout(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = store().lock().map_err(|_| FAILED)?;
        if state.is_none() && storage_home(&app)?.is_dir() {
            *state = Some(open_account(&app)?);
        }
        if let Some(account) = state.as_mut() {
            account.rpc("account/logout", json!({}))?;
        }
        state.take();
        Ok(())
    })
    .await
    .map_err(|_| FAILED.to_string())?
}

fn find_installed<'a>(items: &'a [Value], plugin_id: &str) -> Result<Option<&'a Value>, String> {
    let (name, market) = plugin_id.rsplit_once('@').ok_or("CODEX_ACCOUNT_CHANGED")?;
    if market != "openai-curated-remote" || !safe_segment(name) {
        return Err("CODEX_ACCOUNT_CHANGED".into());
    }
    let mut matches = items.iter().filter(|p| p["name"].as_str() == Some(name));
    let item = matches.next();
    if matches.next().is_some() {
        return Err("CODEX_ACCOUNT_CHANGED".into());
    }
    Ok(item)
}
pub(super) fn apply(plugin: &Plugin, action: &str) -> Result<(), String> {
    let mut state = store().lock().map_err(|_| FAILED)?;
    let account = state.as_mut().ok_or(REQUIRED)?;
    let installed = account.installed()?;
    let item = installed_plugin(&installed, plugin)?;
    match action {
        "enable" | "disable" => {
            let item = item.ok_or("CODEX_ACCOUNT_CHANGED")?;
            if item["enabled"].as_bool() != Some(plugin.enabled) {
                return Err("CODEX_ACCOUNT_CHANGED".into());
            }
            if item["status"] == "DISABLED_BY_ADMIN"
                || item["installation_policy"] == "NOT_AVAILABLE"
            {
                return Err("CODEX_ACCOUNT_DENIED".into());
            }
            let remote = item["id"]
                .as_str()
                .filter(|id| safe_segment(id))
                .ok_or("CODEX_ACCOUNT_CHANGED")?;
            // A retry after a delayed readback may already be at the requested state.
            if item["enabled"] != (action == "enable") {
                account.request(
                    reqwest::Method::POST,
                    &format!("/ps/plugins/{remote}/{action}"),
                    "CONNECTOR_SETTING",
                )?;
            }
        }
        "install" => {
            if item.is_some() {
                return Ok(());
            }
            let identity = plugin
                .remote_plugin_id
                .as_deref()
                .ok_or("CODEX_ACCOUNT_CHANGED")?;
            account.rpc(
                "plugin/install",
                json!({"pluginName":identity,"remoteMarketplaceName":"openai-curated-remote"}),
            )?;
        }
        "uninstall" => {
            let item = item.ok_or("CODEX_ACCOUNT_CHANGED")?;
            if item["installation_policy"] == "INSTALLED_BY_DEFAULT" {
                return Err("CODEX_ACCOUNT_DENIED".into());
            }
            account.rpc(
                "plugin/uninstall",
                json!({"pluginId":plugin.remote_plugin_id.as_deref().unwrap_or(&plugin.id)}),
            )?;
        }
        _ => return Err("CODEX_ACCOUNT_SERVICE".into()),
    }
    // Readback can lag a successful mutation. Retry reads only; never replay the action.
    for attempt in 0..4 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(250));
        }
        let actual = account.installed()?;
        if action_verified(installed_plugin(&actual, plugin)?, action) {
            return Ok(());
        }
    }
    Err("CODEX_ACCOUNT_UNVERIFIED".into())
}
fn installed_plugin<'a>(items: &'a [Value], plugin: &Plugin) -> Result<Option<&'a Value>, String> {
    if let Some(id) = &plugin.remote_plugin_id {
        return Ok(items.iter().find(|item| item["id"] == *id));
    }
    find_installed(items, &plugin.id)
}
fn action_verified(current: Option<&Value>, action: &str) -> bool {
    match action {
        "enable" => current.is_some_and(|v| v["enabled"] == true),
        "disable" => current.is_some_and(|v| v["enabled"] == false),
        "install" => current.is_some(),
        "uninstall" => current.is_none(),
        _ => false,
    }
}

pub(super) fn catalog() -> Option<Result<Value, String>> {
    let mut state = store().lock().ok()?;
    let account = state.as_mut().filter(|a| a.ready)?;
    Some((|| {
        let value = account.rpc("plugin/installed", json!({}))?;
        if value["marketplaceLoadErrors"]
            .as_array()
            .is_some_and(|e| !e.is_empty())
        {
            return Err("CODEX_ACCOUNT_SERVICE".into());
        }
        let mut installed = Vec::new();
        for market in value["marketplaces"]
            .as_array()
            .ok_or("CODEX_ACCOUNT_SERVICE")?
        {
            for item in market["plugins"]
                .as_array()
                .ok_or("CODEX_ACCOUNT_SERVICE")?
            {
                if item["installed"] != true || item["source"]["type"] != "remote" {
                    continue;
                }
                let mut entry = item.clone();
                entry["pluginId"] = item["id"].clone();
                entry["marketplaceName"] = json!("openai-curated-remote");
                entry["source"] = json!({"source":"remote"});
                installed.push(entry);
            }
        }
        Ok(json!({"installed":installed,"available":[]}))
    })())
}

pub(super) fn discovery_read(path: &str, zh: bool) -> Result<Value, String> {
    let mut state = store().lock().map_err(|_| FAILED)?;
    let account = state
        .as_mut()
        .filter(|account| account.ready)
        .ok_or(REQUIRED)?;
    account.request_with_language(
        reqwest::Method::GET,
        path,
        "CODEX",
        Some(if zh { "zh-CN" } else { "en" }),
    )
}
pub(super) fn public_plugin(id: &str) -> Result<Value, String> {
    if !safe_segment(id) {
        return Err("CODEX_ACCOUNT_SERVICE".into());
    }
    let mut state = store().lock().map_err(|_| FAILED)?;
    state
        .as_mut()
        .filter(|account| account.ready)
        .ok_or(REQUIRED)?
        .rpc(
            "plugin/read",
            json!({"pluginName":id,"remoteMarketplaceName":"openai-curated-remote"}),
        )
}

// Keep subsequent reads in the independently authorized account context.
pub(super) fn overlay(snapshot: &mut Snapshot, config: &Value) {
    let Ok(mut guard) = store().lock() else {
        return;
    };
    let Some(account) = guard.as_mut().filter(|a| a.ready) else {
        return;
    };
    snapshot.context_id = Some(format!(
        "{}:account:{}",
        snapshot.context_id.as_deref().unwrap_or_default(),
        account.attempt
    ));
    let result = account.installed();
    for plugin in snapshot.plugins.iter_mut().filter(|p| p.remote) {
        match result
            .as_ref()
            .ok()
            .and_then(|items| find_installed(items, &plugin.id).ok())
        {
            Some(item) => {
                plugin.installed = item.is_some();
                plugin.installation_known = true;
                plugin.enabled_known =
                    item.is_none() || item.is_some_and(|v| v["enabled"].is_boolean());
                plugin.enabled = item.is_some_and(|v| v["enabled"] == true);
                if let Some(item) = item {
                    plugin.remote_plugin_id = item["id"].as_str().map(str::to_owned);
                    if let Some(policy) = item["installation_policy"].as_str() {
                        plugin.install_policy = Some(policy.into());
                    }
                    if let Some(source) = item["installation_policy_source"].as_str() {
                        plugin.install_policy_source = Some(source.into());
                    }
                }
                access::apply(plugin, config, &snapshot.capabilities);
                if let Some(item) = item {
                    if item["status"] == "DISABLED_BY_ADMIN" {
                        plugin.can_toggle = false;
                        plugin.toggle_reason = Some("disabled_by_admin".into());
                        plugin.permissions.toggle = "restricted".into();
                    }
                }
            }
            None => {
                plugin.enabled_known = false;
                plugin.installation_known = false;
                plugin.can_toggle = false;
                plugin.can_install = false;
                plugin.can_uninstall = false;
                plugin.unavailable_reason = Some("stale".into());
            }
        }
        plugin.fingerprint = catalog::remote_fingerprint(plugin);
    }
    if let Err(error) = result {
        snapshot.plugins_complete = false;
        snapshot.warnings.push(error);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn action_readback_requires_the_requested_state() {
        assert!(!action_verified(Some(&json!({"enabled":true})), "disable"));
        assert!(action_verified(Some(&json!({"enabled":false})), "disable"));
        assert!(action_verified(Some(&json!({"enabled":true})), "enable"));
        assert!(!action_verified(Some(&json!({})), "enable"));
        assert!(action_verified(None, "uninstall"));
        assert!(!action_verified(None, "install"));
    }
    #[test]
    fn independent_routing_and_login_only_accept_trusted_origins() {
        for origin in [
            "https://chatgpt.com",
            "https://us.chatgpt.com",
            "https://api.openai.com",
        ] {
            assert!(routing_origin(&json!({"backendOrigin":origin})).is_ok());
        }
        for origin in [
            "http://chatgpt.com",
            "https://chatgpt.com.evil.test",
            "https://chatgpt.com/path",
            "https://x@chatgpt.com",
        ] {
            assert!(routing_origin(&json!({"backendOrigin":origin})).is_err());
        }
        assert!(validate_login_url("https://auth.openai.com/oauth/authorize").is_ok());
        assert!(validate_login_url("https://auth.openai.com.evil.test/").is_err());
    }
    #[test]
    #[ignore = "requires an explicitly selected original Codex binary and loopback login listener"]
    fn original_cli_independent_login_never_loads_existing_credentials() {
        let binary = PathBuf::from(
            std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("select original CLI"),
        );
        let root = std::env::temp_dir().join(format!(
            "skills-space-account-fixture-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let mut account = OwnedAccount {
            http: None,
            session: Some(Session::start_isolated(&binary, &root).unwrap()),
            root: root.clone(),
            attempt: "fixture".into(),
            login: String::new(),
            started: Instant::now(),
            ready: false,
        };
        let initial = account
            .rpc(
                "getAuthStatus",
                json!({"includeToken":false,"refreshToken":false}),
            )
            .unwrap();
        assert!(initial["authMethod"].is_null());
        let login = account
            .rpc("account/login/start", json!({"type":"chatgpt"}))
            .unwrap();
        validate_login_url(login["authUrl"].as_str().unwrap()).unwrap();
        account.login = login["loginId"].as_str().unwrap().into();
        let url = reqwest::Url::parse(login["authUrl"].as_str().unwrap()).unwrap();
        assert!(url
            .query_pairs()
            .any(|(key, value)| key == "code_challenge_method" && value == "S256"));
        account
            .rpc("account/login/cancel", json!({"loginId":account.login}))
            .unwrap();
        assert!(!root.join(".codex/auth.json").exists());
        drop(account);
        assert!(!root.exists());
    }
    #[test]
    #[ignore = "requires explicitly selected original CLI and a new disposable OS-keyring record"]
    fn original_cli_owned_keyring_survives_restart_and_logout_clears_only_fixture() {
        let binary = PathBuf::from(
            std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("select original CLI"),
        );
        let root = std::env::temp_dir().join(format!(
            "skills-space-keyring-fixture-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let home = root.join("home");
        let credential_home = root.join("owned-account");
        fs::create_dir_all(&home).unwrap();
        let mut first = Session::start_account(
            &binary,
            &home,
            &credential_home,
            &PathBuf::from(std::env::var_os("HOME").unwrap()),
        )
        .expect("OS credential store must be available; never fall back to file storage");
        assert!(first
            .call(
                "getAuthStatus",
                json!({"includeToken":false,"refreshToken":false})
            )
            .unwrap()["authMethod"]
            .is_null());
        // This intentionally invalid fixture key is stored only in a NEW namespace.
        // No network/model request is made and no existing user record is accessed.
        let saved=first.call("account/login/start",json!({"type":"apiKey","apiKey":"sk-skills-space-disposable-storage-fixture-not-a-real-key"}));
        if saved.is_err() {
            let _ = first.call("account/logout", json!({}));
            drop(first);
            let _ = fs::remove_dir_all(root);
            panic!(
                "could not save the disposable keyring fixture: {}",
                saved.unwrap_err()
            );
        }
        drop(first);
        let mut second = Session::start_account(
            &binary,
            &home,
            &credential_home,
            &PathBuf::from(std::env::var_os("HOME").unwrap()),
        )
        .unwrap();
        let resumed = second.call(
            "getAuthStatus",
            json!({"includeToken":false,"refreshToken":false}),
        );
        let no_plaintext = !credential_home.join("auth.json").exists();
        let logged_out = second.call("account/logout", json!({}));
        let after = second.call(
            "getAuthStatus",
            json!({"includeToken":false,"refreshToken":false}),
        );
        drop(second);
        fs::remove_dir_all(root).unwrap();
        assert!(
            resumed.unwrap()["authMethod"].is_string(),
            "a fresh original process did not resume its own saved authorization"
        );
        assert!(no_plaintext, "keyring mode wrote a plaintext auth.json");
        assert!(logged_out.is_ok());
        assert!(after.unwrap()["authMethod"].is_null());
    }
    #[test]
    fn transient_auth_transport_failure_does_not_force_reauthorization() {
        let root = std::env::temp_dir().join(format!(
            "skills-space-expiry-fixture-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        let mut account = OwnedAccount {
            http: None,
            session: None,
            root,
            attempt: "fixture".into(),
            login: "previous-completed-login".into(),
            started: Instant::now(),
            ready: true,
        };
        assert_eq!(
            account
                .request(reqwest::Method::GET, "/ps/plugins/installed", "CODEX")
                .unwrap_err(),
            "CODEX_ACCOUNT_SERVICE"
        );
        assert!(account.ready);
        assert_eq!(account.login, "previous-completed-login");
    }
    #[test]
    fn account_identity_uses_native_name_and_rejects_ambiguity() {
        let items = vec![
            json!({"name":"write-like-me","id":"remote-writing"}),
            json!({"name":"github","id":"remote-github"}),
        ];
        assert_eq!(
            find_installed(&items, "write-like-me@openai-curated-remote")
                .unwrap()
                .unwrap()["id"],
            "remote-writing"
        );
        assert!(find_installed(&items, "github@other").is_err());
        assert!(find_installed(
            &[items[1].clone(), items[1].clone()],
            "github@openai-curated-remote"
        )
        .is_err());
    }
}
