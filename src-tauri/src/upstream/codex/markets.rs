//! User marketplace registration through the original Codex CLI.
use super::*;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Market {
    name: String,
    display_name: String,
    root: String,
    source: String,
    source_type: String,
    ref_name: Option<String>,
    sparse_paths: Vec<String>,
    can_remove: bool,
    #[serde(default)]
    can_upgrade: bool,
    origin: String,
    user_registered: bool,
    registration_revision: String,
    remains_provided: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    markets: Vec<Market>,
    can_add: bool,
    read_error: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Request {
    target: Target,
    action: String,
    source: Option<String>,
    ref_name: Option<String>,
    #[serde(default)]
    sparse_paths: Vec<String>,
    market: Option<Market>,
}
fn read_manifest(path: &Path) -> Result<Vec<u8>, String> {
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > 2 * 1024 * 1024 {
        return Err("Marketplace metadata too large.".into());
    }
    fs::read(path).map_err(|e| e.to_string())
}
// Match the marketplace formats accepted by the original CLI. An invalid
// preferred manifest must surface its error rather than silently using another.
pub(super) fn manifest(root: &Path) -> Result<Value, String> {
    let preferred = root.join(".agents/plugins/marketplace.json");
    let path = if preferred.try_exists().map_err(|e| e.to_string())? {
        preferred
    } else {
        root.join(".claude-plugin/marketplace.json")
    };
    if !identity(&path).starts_with(identity(root)) {
        return Err("Plugin marketplace manifest escapes its source.".into());
    }
    serde_json::from_slice(&read_manifest(&path)?).map_err(|e| e.to_string())
}
fn supports(engine: &Engine, binary: &Path, cwd: &Path, action: &str) -> bool {
    run_process_with_timeout(
        command(engine, binary, cwd).args(["plugin", "marketplace", action, "--help"]),
        Duration::from_secs(5),
    )
    .is_ok_and(|v| v.success && v.stdout.split_whitespace().any(|s| s == "--json"))
}
// Provider identity and user registration are separate. A user repository with
// an official-looking name is still a user source.
pub(super) fn market_origin(name: &str, root: &Path, registered: bool) -> &'static str {
    if catalog::builtin_market(name, root) {
        if name == "openai-primary-runtime" {
            "runtime"
        } else {
            "app"
        }
    } else if registered {
        "user"
    } else {
        "configuration"
    }
}
fn upgrade_eligible(supported: bool, origin: &str, definition: &Value) -> bool {
    supported
        && !matches!(origin, "app" | "runtime")
        && definition["source_type"] == "git"
        && definition["source"]
            .as_str()
            .is_some_and(|source| !source.is_empty())
}
fn same_upgrade_source(current: &Market, reviewed: &Market) -> bool {
    current.name == reviewed.name
        && current.source == reviewed.source
        && current.source_type == reviewed.source_type
        && current.ref_name == reviewed.ref_name
        && current.sparse_paths == reviewed.sparse_paths
        && current.root == reviewed.root
}
fn verify_upgrade_result(output: &Value, name: &str) -> Result<(), String> {
    let selected = output["selectedMarketplaces"]
        .as_array()
        .ok_or("Invalid marketplace upgrade result.")?;
    let errors = output["errors"]
        .as_array()
        .ok_or("Invalid marketplace upgrade result.")?;
    if selected.len() != 1 || selected[0].as_str() != Some(name) {
        return Err("Marketplace upgrade did not confirm the selected marketplace. Refresh and check its state.".into());
    }
    if !errors.is_empty() {
        return Err(format!(
            "Marketplace upgrade incomplete: {}",
            serde_json::to_string(errors).map_err(|error| error.to_string())?
        ));
    }
    if !output["upgradedRoots"].is_array() {
        return Err("Invalid marketplace upgrade result.".into());
    }
    Ok(())
}
fn list(engine: &Engine, target: &Target) -> Result<Inventory, String> {
    let binary = binary(engine).ok_or("Codex CLI was not found.")?;
    let cwd = target.directory(&engine.home)?;
    let mut session = Session::start(engine, &binary, &cwd)?;
    let config = read_config(&mut session, &cwd)?;
    let user = user_layer(&config)?;
    let discovery = cli(
        engine,
        &binary,
        &cwd,
        &["plugin", "marketplace", "list", "--json"],
    );
    let (mut rows, read_error) = match discovery {
        Ok(value) => match value["marketplaces"].as_array() {
            Some(rows) => (rows.clone(), None),
            None => (Vec::new(), Some("Invalid marketplace inventory.".into())),
        },
        Err(error) => (Vec::new(), Some(error)),
    };
    // Registration is authoritative even when a catalog/snapshot is unreadable.
    // Keep its core add/remove actions available rather than requiring a good catalog.
    for (name, definition) in config["config"]["marketplaces"]
        .as_object()
        .into_iter()
        .flatten()
    {
        if !rows.iter().any(|row| row["name"] == *name) {
            let root = if definition["source_type"] == "local" {
                definition["source"].as_str().unwrap_or("")
            } else {
                ""
            };
            rows.push(json!({"name":name,"root":root}));
        }
    }
    let can_remove = supports(engine, &binary, &cwd, "remove");
    let can_upgrade = supports(engine, &binary, &cwd, "upgrade");
    let mut markets = Vec::new();
    for row in &rows {
        let name = row["name"]
            .as_str()
            .ok_or("Marketplace name unavailable.")?;
        let root = row["root"]
            .as_str()
            .ok_or("Marketplace root unavailable.")?;
        let definition = &config["config"]["marketplaces"][name];
        let user_definition = &user["config"]["marketplaces"][name];
        let user_registered = !user_definition.is_null();
        let other_layer = config["layers"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|layer| {
                layer["name"]["type"] != "user"
                    && layer["disabledReason"].is_null()
                    && layer["config"]["marketplaces"].get(name).is_some()
            });
        let origin = market_origin(name, Path::new(root), user_registered);
        let display_name = (!root.is_empty())
            .then(|| manifest(Path::new(root)))
            .and_then(Result::ok)
            .and_then(|v| v["interface"]["displayName"].as_str().map(str::to_owned))
            .unwrap_or_else(|| name.into());
        markets.push(Market {
            name: name.into(),
            display_name,
            root: root.into(),
            source: definition["source"]
                .as_str()
                .or_else(|| row["marketplaceSource"]["source"].as_str())
                .unwrap_or(root)
                .into(),
            source_type: definition["source_type"]
                .as_str()
                .or_else(|| row["marketplaceSource"]["sourceType"].as_str())
                .unwrap_or("local")
                .into(),
            ref_name: definition["ref"]
                .as_str()
                .or_else(|| definition["ref_name"].as_str())
                .map(str::to_owned),
            sparse_paths: definition["sparse_paths"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect(),
            origin: origin.into(),
            user_registered,
            registration_revision: document_diff::revision(user_definition.to_string().as_bytes()),
            remains_provided: other_layer || matches!(origin, "app" | "runtime"),
            can_upgrade: upgrade_eligible(can_upgrade, origin, definition),
            can_remove: can_remove
                && user["disabledReason"].is_null()
                && user_registered
                && !other_layer,
        });
    }
    markets.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(Inventory {
        markets,
        can_add: user["disabledReason"].is_null() && supports(engine, &binary, &cwd, "add"),
        read_error,
    })
}
fn source(value: &str, cwd: &Path) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.starts_with('-') {
        return Err("Enter a marketplace source.".into());
    }
    let local = Path::new(value);
    if local.is_absolute() || value.starts_with("./") || value.starts_with("../") {
        let path = if local.is_absolute() {
            local.to_path_buf()
        } else {
            cwd.join(local)
        };
        if !path.is_dir() {
            return Err("Choose an existing marketplace directory.".into());
        }
        return Ok(identity(&path).to_string_lossy().into_owned());
    }
    if !value.contains(":") && value.split('/').count() == 2 {
        let parts: Vec<_> = value.split('/').collect();
        if parts.iter().all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "._-@".contains(c))
        }) {
            return Ok(value.into());
        }
    }
    let url = tauri::Url::parse(value)
        .map_err(|_| "Use a local directory, owner/repo or public HTTPS Git URL.")?;
    if !matches!(url.scheme(), "https" | "http")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err("Use a public HTTPS Git URL without credentials.".into());
    }
    Ok(value.into())
}
fn mutate(engine: &Engine, request: Request) -> Result<Inventory, String> {
    if request.target.scope == "project" {
        return Err("Manage marketplaces in global management.".into());
    }
    let cwd = request.target.directory(&engine.home)?;
    let current = list(engine, &request.target)?;
    let binary = binary(engine).ok_or("Codex CLI was not found.")?;
    let mut args = vec![
        "plugin".to_owned(),
        "marketplace".into(),
        request.action.clone(),
    ];
    match request.action.as_str() {
        "add" => {
            if !current.can_add {
                return Err(
                    "Marketplace registration is not available in this configuration.".into(),
                );
            }
            let input = source(request.source.as_deref().unwrap_or(""), &cwd)?;
            let local = Path::new(&input).is_absolute();
            if local
                && (request
                    .ref_name
                    .as_ref()
                    .is_some_and(|s| !s.trim().is_empty())
                    || !request.sparse_paths.is_empty())
            {
                return Err("Git reference and sparse paths apply only to Git sources.".into());
            }
            args.push(input);
            if let Some(reference) = request.ref_name.filter(|s| !s.trim().is_empty()) {
                args.extend(["--ref".into(), reference.trim().into()]);
            }
            for path in request.sparse_paths {
                if !path.trim().is_empty() {
                    args.extend(["--sparse".into(), path.trim().into()]);
                }
            }
        }
        "upgrade" => {
            let reviewed = request.market.as_ref().ok_or("Choose a marketplace.")?;
            let selected = current
                .markets
                .iter()
                .find(|market| market.name == reviewed.name)
                .ok_or("Marketplace no longer exists. Refresh and retry.")?;
            if !selected.can_upgrade || !same_upgrade_source(selected, reviewed) {
                return Err(
                    "Marketplace changed or cannot be upgraded. Refresh before upgrading it."
                        .into(),
                );
            }
            args.push(selected.name.clone());
        }
        "remove" => {
            let reviewed = request.market.as_ref().ok_or("Choose a marketplace.")?;
            let selected = current
                .markets
                .iter()
                .find(|m| m.name == reviewed.name)
                .ok_or("Marketplace no longer exists. Refresh and retry.")?;
            if !selected.can_remove
                || selected.registration_revision != reviewed.registration_revision
            {
                return Err("Marketplace changed or is supplied by another configuration. Refresh before removing it.".into());
            }
            args.push(selected.name.clone());
        }
        _ => return Err("Unsupported marketplace action.".into()),
    }
    args.push("--json".into());
    // A temporary HOME prevents Git from reading .netrc, SSH or credential files.
    // CODEX_HOME remains the selected user's native configuration location.
    let temporary = TemporaryDirectory::new()?;
    let mut cmd = command(engine, &binary, &cwd);
    let native_home = engine.env_home("CODEX_HOME", ".codex");
    let path = std::env::var_os("PATH").unwrap_or_default();
    cmd.env_clear()
        .env("PATH", path)
        .env("CODEX_HOME", native_home)
        .env("HOME", &temporary.0)
        .env("USERPROFILE", &temporary.0)
        .env("XDG_CONFIG_HOME", &temporary.0)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env(
            "GIT_CONFIG_GLOBAL",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        )
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_CONFIG_COUNT", "2")
        .env("GIT_CONFIG_KEY_0", "credential.helper")
        .env("GIT_CONFIG_VALUE_0", "")
        .env("GIT_CONFIG_KEY_1", "core.hooksPath")
        .env(
            "GIT_CONFIG_VALUE_1",
            if cfg!(windows) { "NUL" } else { "/dev/null" },
        );
    for key in ["SystemRoot", "TMPDIR", "TMP", "TEMP"] {
        if let Some(value) = std::env::var_os(key) {
            cmd.env(key, value);
        }
    }
    let result = run_process_with_timeout(cmd.args(&args), Duration::from_secs(60))?;
    if !result.success {
        return Err(format!(
            "Codex marketplace operation failed: {}",
            result.stderr
        ));
    }
    let output: Value = serde_json::from_str(&result.stdout)
        .map_err(|e| format!("Invalid marketplace result: {e}"))?;
    if request.action == "upgrade" {
        verify_upgrade_result(
            &output,
            request
                .market
                .as_ref()
                .ok_or("Choose a marketplace.")?
                .name
                .as_str(),
        )?;
    }
    let observed = list(engine, &request.target)?;
    if request.action == "add" {
        let name = output["marketplaceName"]
            .as_str()
            .ok_or("Marketplace registration result has no identity.")?;
        if !observed.markets.iter().any(|market| market.name == name) {
            return Err(
                "Marketplace registration was not found after adding it. Refresh marketplaces."
                    .into(),
            );
        }
    }
    if request.action == "remove" {
        let name = output["marketplaceName"]
            .as_str()
            .ok_or("Marketplace removal result has no identity.")?;
        if observed
            .markets
            .iter()
            .any(|m| m.name == name && m.user_registered)
        {
            return Err(
                "Marketplace registration still exists after removal. Refresh marketplaces.".into(),
            );
        }
    }
    Ok(observed)
}
#[tauri::command]
pub async fn upstream_codex_marketplaces(
    app: AppHandle,
    target: Target,
) -> Result<Inventory, String> {
    tauri::async_runtime::spawn_blocking(move || list(&Engine::from_app(&app)?, &target))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_marketplace_apply(
    app: AppHandle,
    request: Request,
) -> Result<Inventory, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        mutate(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::super::super::tests::{engine, global};
    use super::*;
    #[test]
    fn upgrade_permission_and_result_follow_the_configured_git_contract() {
        let git = json!({"source_type":"git","source":"https://example.invalid/plugins.git"});
        assert!(upgrade_eligible(true, "user", &git));
        assert!(upgrade_eligible(true, "configuration", &git));
        for origin in ["app", "runtime"] {
            assert!(!upgrade_eligible(true, origin, &git));
        }
        assert!(!upgrade_eligible(false, "user", &git));
        assert!(!upgrade_eligible(
            true,
            "user",
            &json!({"source_type":"local","source":"/local"})
        ));
        assert!(!upgrade_eligible(true, "user", &Value::Null));
        assert!(
            verify_upgrade_result(
                &json!({"selectedMarketplaces":["chosen"],"upgradedRoots":[],"errors":[]}),
                "chosen"
            )
            .is_ok(),
            "An unchanged revision can succeed"
        );
        assert!(verify_upgrade_result(&json!({"selectedMarketplaces":["chosen"],"upgradedRoots":["/snapshot"],"errors":[{"marketplaceName":"chosen","message":"cache refresh failed"}]}),"chosen").unwrap_err().contains("cache refresh failed"));
        assert!(verify_upgrade_result(
            &json!({"selectedMarketplaces":["other"],"upgradedRoots":[],"errors":[]}),
            "chosen"
        )
        .is_err());
        assert!(verify_upgrade_result(
            &json!({"selectedMarketplaces":["chosen","other"],"upgradedRoots":[],"errors":[]}),
            "chosen"
        )
        .is_err());
        assert!(verify_upgrade_result(&json!({}), "chosen").is_err());
    }
    #[test]
    fn provider_identity_requires_both_name_and_root_and_is_not_registration_permission() {
        assert_eq!(
            market_origin(
                "openai-bundled",
                Path::new("/home/.codex/.tmp/bundled-marketplaces/openai-bundled"),
                false
            ),
            "app"
        );
        assert_eq!(
            market_origin(
                "openai-bundled",
                Path::new("/home/.codex/.tmp/bundled-marketplaces/openai-bundled"),
                true
            ),
            "app"
        );
        assert_eq!(market_origin("openai-primary-runtime", Path::new("/home/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime"), false), "runtime");
        assert_eq!(
            market_origin("openai-bundled", Path::new("/my-repo"), true),
            "user"
        );
        assert_eq!(
            market_origin("project", Path::new("/project"), false),
            "configuration"
        );
    }
    #[test]
    fn marketplace_formats_follow_precedence_and_keep_invalid_metadata_visible() {
        let temp = TemporaryDirectory::new().unwrap();
        fs::create_dir_all(temp.0.join(".claude-plugin")).unwrap();
        fs::write(
            temp.0.join(".claude-plugin/marketplace.json"),
            r#"{"name":"mattpocock","plugins":[{"name":"mattpocock-skills","source":"./"}]}"#,
        )
        .unwrap();
        assert_eq!(manifest(&temp.0).unwrap()["plugins"][0]["source"], "./");
        fs::create_dir_all(temp.0.join(".agents/plugins")).unwrap();
        let preferred = temp.0.join(".agents/plugins/marketplace.json");
        fs::write(&preferred, r#"{"name":"preferred"}"#).unwrap();
        assert_eq!(manifest(&temp.0).unwrap()["name"], "preferred");
        fs::write(&preferred, "{").unwrap();
        assert!(manifest(&temp.0).is_err());
        fs::remove_file(&preferred).unwrap();
        #[cfg(unix)]
        {
            let outside = TemporaryDirectory::new().unwrap();
            fs::write(outside.0.join("marketplace.json"), "{}").unwrap();
            std::os::unix::fs::symlink(outside.0.join("marketplace.json"), &preferred).unwrap();
            assert!(manifest(&temp.0).unwrap_err().contains("escapes"));
        }
    }
    #[test]
    fn source_parsing_never_accepts_embedded_credentials_or_ssh() {
        let temp = TemporaryDirectory::new().unwrap();
        assert!(source("owner/repo@main", &temp.0).is_ok());
        assert!(source("https://github.com/owner/repo.git", &temp.0).is_ok());
        assert!(source("git@github.com:owner/repo.git", &temp.0).is_err());
        assert!(source("https://user:secret@host/repo", &temp.0).is_err());
        assert!(source("https://host/repo?token=secret", &temp.0).is_err());
        assert_eq!(
            source("./", &temp.0).unwrap(),
            identity(&temp.0).to_string_lossy()
        );
    }
    #[test]
    #[ignore = "Requires explicitly selected original Codex CLI; isolated provider registrations"]
    fn original_provider_registrations_are_removable_without_deleting_provider_content() {
        let selected =
            std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original CLI");
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        fs::create_dir_all(home.join(".local/bin")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(selected, home.join(".local/bin/codex")).unwrap();
        let e = engine(&home);
        for (name, root, origin) in [
            (
                "openai-bundled",
                home.join(".codex/.tmp/bundled-marketplaces/openai-bundled"),
                "app",
            ),
            (
                "openai-primary-runtime",
                home.join(
                    ".cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime",
                ),
                "runtime",
            ),
        ] {
            fs::create_dir_all(root.join(".agents/plugins")).unwrap();
            let path = root.join(".agents/plugins/marketplace.json");
            fs::write(&path, json!({"name":name,"plugins":[]}).to_string()).unwrap();
            // Simulate provider-created registration using its original HOME;
            // application mutations deliberately use a credential-free temporary HOME.
            let binary = binary(&e).unwrap();
            cli(
                &e,
                &binary,
                &home,
                &[
                    "plugin",
                    "marketplace",
                    "add",
                    root.to_str().unwrap(),
                    "--json",
                ],
            )
            .unwrap();
            let added = list(&e, &global()).unwrap();
            let market = added.markets.into_iter().find(|m| m.name == name).unwrap();
            assert_eq!(market.origin, origin);
            assert!(market.user_registered && market.can_remove && market.remains_provided);
            let observed = mutate(
                &e,
                Request {
                    target: global(),
                    action: "remove".into(),
                    source: None,
                    ref_name: None,
                    sparse_paths: vec![],
                    market: Some(market),
                },
            )
            .unwrap();
            assert!(!observed
                .markets
                .iter()
                .any(|m| m.name == name && m.user_registered));
            assert!(
                path.is_file(),
                "Removing a registration must preserve its provider"
            );
        }
    }
    #[test]
    #[ignore = "Requires explicitly selected original Codex CLI; isolated HOME and anonymous Git listener"]
    fn original_marketplace_registration_and_removal_preserve_plugin_and_rules() {
        let selected =
            std::env::var_os("SKILLS_SPACE_CODEX_TEST_BINARY").expect("Select original CLI");
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        fs::create_dir_all(home.join(".local/bin")).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&selected, home.join(".local/bin/codex")).unwrap();
        let e = engine(&home);
        let root = home.join(".codex");
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("config.toml"),
            "model = \"preserved-model\"\n[[skills.config]]\nname = \"alpha\"\nenabled = false\n",
        )
        .unwrap();
        #[cfg(unix)]
        assert!(Command::new("mkfifo")
            .arg(root.join("auth.json"))
            .status()
            .unwrap()
            .success());
        fs::create_dir_all(home.join(".agents/plugins")).unwrap();
        fs::write(
            home.join(".agents/plugins/marketplace.json"),
            r#"{"name":"default-local","plugins":[]}"#,
        )
        .unwrap();
        let defaults = list(&e, &global()).unwrap();
        assert!(
            !defaults
                .markets
                .iter()
                .find(|m| m.name == "default-local")
                .unwrap()
                .can_remove
        );
        let market = temp.0.join("market");
        fs::create_dir_all(market.join(".agents/plugins")).unwrap();
        fs::create_dir_all(market.join("plugins/sample/.codex-plugin")).unwrap();
        fs::create_dir_all(market.join("plugins/sample/skills/alpha")).unwrap();
        fs::write(
            market.join("plugins/sample/skills/alpha/SKILL.md"),
            "---\nname: alpha\ndescription: Fixture\n---\nKeep me\n",
        )
        .unwrap();
        fs::write(
            market.join("plugins/sample/.codex-plugin/plugin.json"),
            r#"{"name":"sample","version":"1.0.0","skills":"./skills"}"#,
        )
        .unwrap();
        fs::write(market.join(".agents/plugins/marketplace.json"),r#"{"name":"registration","interface":{"displayName":"Registration Fixture"},"plugins":[{"name":"sample","source":"./plugins/sample","policy":{"installation":"AVAILABLE","authentication":"ON_INSTALL"}}]}"#).unwrap();
        let add = || Request {
            target: global(),
            action: "add".into(),
            source: Some(market.to_string_lossy().into_owned()),
            ref_name: None,
            sparse_paths: vec![],
            market: None,
        };
        let state = mutate(&e, add()).unwrap();
        let added = state
            .markets
            .iter()
            .find(|m| m.name == "registration")
            .unwrap()
            .clone();
        assert!(added.can_remove);
        assert!(!added.can_upgrade, "Local markets must not expose upgrade");
        assert_eq!(added.display_name, "Registration Fixture");
        assert_eq!(
            mutate(&e, add())
                .unwrap()
                .markets
                .iter()
                .filter(|m| m.name == "registration")
                .count(),
            1
        );
        let binary = PathBuf::from(selected);
        let installed = cli(
            &e,
            &binary,
            &home,
            &["plugin", "add", "sample@registration", "--json"],
        )
        .unwrap();
        let path = PathBuf::from(installed["installedPath"].as_str().unwrap());
        let content = fs::read(path.join("skills/alpha/SKILL.md")).unwrap();
        let after = mutate(
            &e,
            Request {
                target: global(),
                action: "remove".into(),
                source: None,
                ref_name: None,
                sparse_paths: vec![],
                market: Some(added),
            },
        )
        .unwrap();
        assert!(!after.markets.iter().any(|m| m.name == "registration"));
        assert_eq!(
            fs::read(path.join("skills/alpha/SKILL.md")).unwrap(),
            content
        );
        assert!(market.is_dir());
        let config = fs::read_to_string(root.join("config.toml")).unwrap();
        assert!(config.contains("preserved-model") && config.contains("enabled = false"));
        // A missing catalog must not permanently block registering or removing sources.
        let mut config_text = fs::read_to_string(root.join("config.toml")).unwrap();
        config_text.push_str(&format!(
            "\n[marketplaces.broken]\nsource_type = \"local\"\nsource = {}\n",
            json!(home.join("missing-market"))
        ));
        fs::write(root.join("config.toml"), config_text).unwrap();
        let incomplete = list(&e, &global()).unwrap();
        assert!(incomplete.can_add);
        let broken = incomplete
            .markets
            .iter()
            .find(|market| market.name == "broken")
            .unwrap()
            .clone();
        assert!(broken.can_remove);
        mutate(&e, add()).unwrap();
        mutate(
            &e,
            Request {
                target: global(),
                action: "remove".into(),
                source: None,
                ref_name: None,
                sparse_paths: vec![],
                market: Some(broken),
            },
        )
        .unwrap();
        let local = list(&e, &global())
            .unwrap()
            .markets
            .into_iter()
            .find(|m| m.name == "registration")
            .unwrap();
        mutate(
            &e,
            Request {
                target: global(),
                action: "remove".into(),
                source: None,
                ref_name: None,
                sparse_paths: vec![],
                market: Some(local),
            },
        )
        .unwrap();
        // Public Git-shaped transport with no real account: honor ref and sparse selection.
        for args in [
            vec!["init"],
            vec!["add", "."],
            vec![
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-m",
                "Fixture",
            ],
            vec!["branch", "-M", "main"],
        ] {
            assert!(Command::new("git")
                .current_dir(&market)
                .args(args)
                .output()
                .unwrap()
                .status
                .success());
        }
        assert!(Command::new("git")
            .current_dir(&market)
            .args(["branch", "release"])
            .status()
            .unwrap()
            .success());
        let origin = super::super::updates::git_fixture::GitOrigin::new(&market);
        let state = mutate(
            &e,
            Request {
                target: global(),
                action: "add".into(),
                source: Some(origin.url.clone()),
                ref_name: Some("release".into()),
                sparse_paths: vec![".agents/plugins".into(), "plugins/sample".into()],
                market: None,
            },
        )
        .unwrap();
        let git = state
            .markets
            .iter()
            .find(|m| m.name == "registration")
            .unwrap();
        assert!(git.can_upgrade);
        assert_eq!(git.source_type, "git");
        assert_eq!(git.ref_name.as_deref(), Some("release"));
        let checked = super::super::updates::check(&e, &global(), "sample@registration").unwrap();
        assert!(checked.source_path.ends_with("(release)"));
        assert_eq!(git.sparse_paths.len(), 2);
        assert_eq!(
            fs::read(path.join("skills/alpha/SKILL.md")).unwrap(),
            content
        );

        let request = |market: Market| Request {
            target: global(),
            action: "upgrade".into(),
            source: None,
            ref_name: None,
            sparse_paths: vec![],
            market: Some(market),
        };
        let mut stale = git.clone();
        stale.ref_name = Some("different-ref".into());
        assert!(mutate(&e, request(stale))
            .err()
            .unwrap()
            .contains("changed"));
        let mut session = Session::start(&e, &binary, &home).unwrap();
        let config = read_config(&mut session, &home).unwrap();
        let user = user_layer(&config).unwrap();
        let mut plugins = user["config"]["plugins"].clone();
        plugins["sample@registration"]["enabled"] = json!(false);
        session.call("config/value/write",json!({"keyPath":"plugins","value":plugins,"mergeStrategy":"replace","expectedVersion":user["version"]})).unwrap();
        drop(session);
        assert!(Command::new("git")
            .current_dir(&market)
            .args(["checkout", "release"])
            .output()
            .unwrap()
            .status
            .success());
        fs::write(
            market.join("plugins/sample/new-content.txt"),
            "upgraded disabled plugin",
        )
        .unwrap();
        for args in [
            vec!["add", "."],
            vec![
                "-c",
                "user.name=Fixture",
                "-c",
                "user.email=fixture@example.invalid",
                "commit",
                "-m",
                "Upgrade fixture",
            ],
        ] {
            assert!(Command::new("git")
                .current_dir(&market)
                .args(args)
                .output()
                .unwrap()
                .status
                .success());
        }
        let upgraded = mutate(&e, request(git.clone())).unwrap();
        assert!(
            upgraded
                .markets
                .iter()
                .find(|market| market.name == "registration")
                .unwrap()
                .can_upgrade
        );
        assert_eq!(
            fs::read(path.join("new-content.txt")).unwrap(),
            b"upgraded disabled plugin"
        );
        let mut session = Session::start(&e, &binary, &home).unwrap();
        let config = read_config(&mut session, &home).unwrap();
        assert_eq!(
            config["config"]["plugins"]["sample@registration"]["enabled"].as_bool(),
            Some(false)
        );
        assert_eq!(
            config["config"]["skills"]["config"][0]["enabled"].as_bool(),
            Some(false)
        );
        assert_eq!(config["config"]["model"].as_str(), Some("preserved-model"));
        drop(session);
        let again = list(&e, &global())
            .unwrap()
            .markets
            .into_iter()
            .find(|market| market.name == "registration")
            .unwrap();
        mutate(&e, request(again)).unwrap();
    }
}
