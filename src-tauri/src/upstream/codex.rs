//! Codex protocol/config adapter. Content lifecycle remains in the original CLIs.
use super::*;
use serde_json::{json, Value};
mod access;
pub mod account;
mod capabilities;
mod catalog;
pub mod defaults;
pub mod details;
mod discovery;
pub mod markets;
mod presentation;
mod rpc;
pub mod rules;
mod runtime;
mod scope;
mod skill_inventory;
pub mod updates;
use capabilities::{inspect_capabilities, Capabilities};
use rpc::Session;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillState {
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub plugin_display_name: Option<String>,
    pub document_path: String,
    pub installation_path: String,
    pub origin: String,
    pub runtime_scope: String,
    pub in_scope: bool,
    pub enabled: Option<bool>,
    pub plugin_id: Option<String>,
    pub can_toggle: bool,
    pub needs_confirmation: bool,
    pub toggle_scope: Option<String>,
    pub lifecycle_owner: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeSkill {
    pub name: String,
    pub description: String,
    pub state: SkillState,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plugin {
    #[serde(default)]
    pub toggle_scope: String,
    #[serde(default)]
    pub project_enabled: Option<bool>,
    #[serde(default)]
    pub remote_plugin_id: Option<String>,
    #[serde(default)]
    pub marketplace_display_name: Option<String>,
    #[serde(default)]
    pub source_origin: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub enabled_known: bool,
    #[serde(default)]
    pub source_kind: Option<String>,
    #[serde(default)]
    pub install_policy: Option<String>,
    #[serde(default)]
    pub install_policy_source: Option<String>,
    #[serde(default)]
    pub permissions: access::Permissions,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    pub id: String,
    pub name: String,
    pub marketplace: String,
    pub version: Option<String>,
    pub installed: bool,
    pub installation_known: bool,
    pub enabled: bool,
    pub components: Vec<String>,
    pub skills: Vec<String>,
    #[serde(default)]
    pub skill_inventory: skill_inventory::SkillInventory,
    pub source_path: String,
    pub installed_path: Option<String>,
    pub can_install: bool,
    pub can_toggle: bool,
    pub can_uninstall: bool,
    #[serde(default)]
    pub can_check_updates: bool,
    #[serde(default)]
    pub catalog_entry: bool,
    #[serde(default)]
    pub remote: bool,
    #[serde(default)]
    pub git_marketplace: bool,
    #[serde(default)]
    pub toggle_reason: Option<String>,
    #[serde(default)]
    pub uninstall_reason: Option<String>,
    pub unavailable_reason: Option<String>,
    pub fingerprint: String,
    pub auth_policy: Option<String>,
    pub content_verified: bool,
    #[serde(default)]
    pub builtin: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub binary: String,
    pub version: String,
    pub context_id: Option<String>,
    pub codex_home: String,
    pub config_path: String,
    pub revision: String,
    pub unavailable_reason: Option<String>,
    pub plugins_complete: bool,
    pub catalog_requested: bool,
    pub rules: Vec<Value>,
    pub capabilities: Capabilities,
    pub skills: Vec<NativeSkill>,
    pub plugins: Vec<Plugin>,
    pub warnings: Vec<String>,
}
fn binary(engine: &Engine) -> Option<PathBuf> {
    let mut roots: Vec<PathBuf> = [
        ".local/bin",
        "bin",
        ".cargo/bin",
        ".npm-global/bin",
        ".bun/bin",
        ".volta/bin",
        ".local/share/pnpm",
    ]
    .iter()
    .map(|p| engine.home.join(p))
    .collect();
    if !engine.isolated {
        roots.extend(std::env::split_paths(
            &std::env::var_os("PATH").unwrap_or_default(),
        ));
        roots.extend([
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ]);
    }
    roots
        .into_iter()
        .map(|p| p.join(if cfg!(windows) { "codex.exe" } else { "codex" }))
        .find(|p| super::detection::executable(p))
        .or_else(|| runtime::app_binary(engine))
}
fn remote_command(engine: &Engine, binary: &Path, cwd: &Path) -> Command {
    let mut command = engine.command(binary, cwd);
    command.env("CODEX_HOME", engine.env_home("CODEX_HOME", ".codex"));
    if engine.isolated {
        for name in ["OPENAI_API_KEY", "CODEX_API_KEY", "CHATGPT_TOKEN"] {
            command.env_remove(name);
        }
    }
    command
}
// Local management must not read persistent credentials or inherit login tokens.
fn command(engine: &Engine, binary: &Path, cwd: &Path) -> Command {
    let mut command = remote_command(engine, binary, cwd);
    command.args(["-c", "cli_auth_credentials_store=\"ephemeral\""]);
    for name in [
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "CHATGPT_TOKEN",
        "CODEX_ACCESS_TOKEN",
        "OPENAI_FEDERATION_RULE_ID",
        "OPENAI_IDENTITY_TOKEN_FILE",
        "OPENAI_WORKLOAD_IDENTITY_CONTEXT",
    ] {
        command.env_remove(name);
    }
    command
}
fn cli(engine: &Engine, binary: &Path, cwd: &Path, args: &[&str]) -> Result<Value, String> {
    let result = run_process_with_timeout(
        command(engine, binary, cwd).args(args),
        Duration::from_secs(45),
    )?;
    if !result.success {
        return Err(format!("Codex command failed: {}", result.stderr));
    }
    serde_json::from_str(&result.stdout).map_err(|e| format!("Invalid Codex JSON: {e}"))
}
fn remote_cli(engine: &Engine, binary: &Path, cwd: &Path, args: &[&str]) -> Result<Value, String> {
    let result = run_process_with_timeout(
        remote_command(engine, binary, cwd).args(args),
        Duration::from_secs(45),
    )?;
    if !result.success {
        return Err(format!("Codex command failed: {}", result.stderr));
    }
    serde_json::from_str(&result.stdout).map_err(|e| format!("Invalid Codex JSON: {e}"))
}
fn user_layer(config: &Value) -> Result<&Value, String> {
    config["layers"]
        .as_array()
        .and_then(|layers| layers.iter().find(|v| v["name"]["type"] == "user"))
        .ok_or_else(|| "Codex user configuration layer unavailable.".into())
}
fn read_config(session: &mut Session, cwd: &Path) -> Result<Value, String> {
    session.call("config/read", json!({"cwd":cwd,"includeLayers":true}))
}
fn list_skills(
    session: &mut Session,
    cwd: &Path,
) -> Result<(Vec<NativeSkill>, Vec<String>), String> {
    let result = session.call("skills/list", json!({"cwds":[cwd],"forceReload":true}))?;
    let rows = result["data"]
        .as_array()
        .ok_or("Codex skill listing has no data.")?;
    let mut skills = Vec::new();
    let mut warnings = Vec::new();
    for row in rows {
        if let Some(errors) = row["errors"].as_array() {
            warnings.extend(errors.iter().map(|v| format!("Codex: {v}")));
        }
        for item in row["skills"]
            .as_array()
            .ok_or("Invalid Codex skill list.")?
        {
            let path = item["path"]
                .as_str()
                .ok_or("Codex skill path unavailable.")?;
            if !Path::new(path).is_absolute()
                || Path::new(path).file_name().and_then(|p| p.to_str()) != Some("SKILL.md")
            {
                return Err("Codex returned an unsupported skill identity.".into());
            }
            let scope = item["scope"]
                .as_str()
                .ok_or("Codex skill scope unavailable.")?;
            let plugin = item["pluginId"].as_str().map(str::to_owned);
            let origin = if plugin.is_some() {
                "plugin"
            } else if scope == "system" || scope == "admin" {
                scope
            } else {
                "standalone"
            };
            let can_toggle = matches!(scope, "user" | "repo" | "system");
            skills.push(NativeSkill {
                name: item["name"].as_str().unwrap_or_default().into(),
                description: item["description"].as_str().unwrap_or_default().into(),
                state: SkillState {
                    display_name: item["interface"]["displayName"]
                        .as_str()
                        .filter(|s| !s.trim().is_empty())
                        .map(str::to_owned),
                    icon: presentation::skill_icon(
                        Path::new(path).parent().unwrap(),
                        &item["interface"],
                    ),
                    plugin_display_name: None,
                    document_path: path.into(),
                    installation_path: Path::new(path)
                        .parent()
                        .unwrap_or(Path::new(path))
                        .to_string_lossy()
                        .into(),
                    origin: origin.into(),
                    runtime_scope: scope.into(),
                    in_scope: false,
                    enabled: Some(
                        item["enabled"]
                            .as_bool()
                            .ok_or("Codex skill enabled state unavailable.")?,
                    ),
                    plugin_id: plugin,
                    can_toggle,
                    needs_confirmation: false,
                    toggle_scope: can_toggle.then(|| "user".into()),
                    lifecycle_owner: if origin == "plugin" {
                        "codex-plugin"
                    } else {
                        "external"
                    }
                    .into(),
                },
            });
        }
    }
    Ok((skills, warnings))
}
fn identity(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}
fn safe_segment(value: &str) -> bool {
    !value.is_empty() && value != "." && value != ".." && !value.contains(['/', '\\'])
}
fn read_manifest(root: &Path, path: &Path) -> Result<Value, String> {
    if !identity(path).starts_with(identity(root)) {
        return Err("Plugin manifest escapes its installation.".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    if bytes.len() > 1024 * 1024 {
        return Err("Plugin manifest is too large.".into());
    }
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}
fn manifest(root: &Path) -> Result<Value, String> {
    let portable = root.join("plugin.json");
    let legacy = root.join(".codex-plugin/plugin.json");
    if portable.is_file() {
        let value = read_manifest(root, &portable)?;
        if value["$schema"]
            .as_str()
            .is_some_and(|schema| schema.starts_with("https://agent-plugins.org/"))
        {
            let mut overlay = if value["extensions"]["com.openai"].is_object() {
                value["extensions"]["com.openai"].clone()
            } else if legacy.is_file() {
                read_manifest(root, &legacy)?
            } else {
                json!({})
            };
            if !overlay.is_object() {
                return Err("Plugin overlay must be an object.".into());
            }
            overlay["name"] = value["name"].clone();
            overlay["version"] = value["version"].clone();
            for key in ["description", "author"] {
                if !value[key].is_null() {
                    overlay[key] = value[key].clone();
                }
            }
            overlay["skills"] = json!("./skills/");
            overlay["mcpServers"] = if root.join("mcp.json").is_file() {
                json!("./mcp.json")
            } else {
                Value::Null
            };
            return Ok(overlay);
        }
        if !legacy.is_file() {
            return Ok(value);
        }
    }
    if legacy.is_file() {
        read_manifest(root, &legacy)
    } else {
        read_manifest(root, &root.join(".claude-plugin/plugin.json"))
    }
}

fn plugin_documents(root: &Path, manifest: &Value) -> Vec<PathBuf> {
    skill_inventory::documents(root, manifest).0
}

fn plugins(
    engine: &Engine,
    binary: &Path,
    cwd: &Path,
    config: &Value,
    warnings: &mut Vec<String>,
    capabilities: &Capabilities,
    complete: &mut bool,
) -> Vec<Plugin> {
    let mut plugins = Vec::new();
    let mut markets = config["config"]["marketplaces"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    let discovery = if capabilities.list_marketplaces {
        cli(
            engine,
            binary,
            cwd,
            &["plugin", "marketplace", "list", "--json"],
        )
    } else {
        Err("Marketplace listing is unavailable in this Codex interface.".into())
    };
    match discovery {
        Ok(list) => {
            if !list["marketplaces"].is_array() {
                *complete = false;
                warnings.push("Invalid marketplace inventory.".into());
            }
            for row in list["marketplaces"].as_array().into_iter().flatten() {
                let (Some(name), Some(root)) = (row["name"].as_str(), row["root"].as_str()) else {
                    continue;
                };
                let source_type = row["marketplaceSource"]["sourceType"]
                    .as_str()
                    .unwrap_or("local");
                if Path::new(root).is_absolute() && matches!(source_type, "local" | "git") {
                    markets.insert(
                        name.into(),
                        json!({"source_type":source_type,"source":root}),
                    );
                }
            }
        }
        Err(error) => {
            *complete = false;
            warnings.push(format!("Marketplace discovery: {error}"));
        }
    }
    let home = engine.env_home("CODEX_HOME", ".codex");
    for (market, definition) in &markets {
        if !safe_segment(market) {
            continue;
        }
        if !matches!(definition["source_type"].as_str(), Some("local" | "git")) {
            *complete = false;
            warnings.push(format!(
                "Plugin source {market} cannot be inspected through the local interface."
            ));
            continue;
        }
        if !capabilities.list_plugins {
            *complete = false;
            continue;
        }
        let result = match cli(
            engine,
            binary,
            cwd,
            &[
                "plugin",
                "list",
                "--marketplace",
                market,
                "--available",
                "--json",
            ],
        ) {
            Ok(v) => v,
            Err(e) => {
                *complete = false;
                warnings.push(e);
                continue;
            }
        };
        if !result["installed"].is_array() || !result["available"].is_array() {
            *complete = false;
            warnings.push(format!("Invalid plugin inventory for {market}."));
            continue;
        }
        let market_data =
            markets::manifest(Path::new(definition["source"].as_str().unwrap_or_default()))
                .unwrap_or(Value::Null);
        for item in result["installed"]
            .as_array()
            .into_iter()
            .flatten()
            .chain(result["available"].as_array().into_iter().flatten())
        {
            let Some(id) = item["pluginId"].as_str() else {
                continue;
            };
            if plugins.iter().any(|p: &Plugin| p.id == id) {
                continue;
            }
            let name = item["name"].as_str().unwrap_or_default();
            if !safe_segment(name) {
                continue;
            }
            let local = item["source"]["source"] == "local";
            let git_marketplace = definition["source_type"] == "git";
            let source = item["source"]["path"].as_str().unwrap_or_default();
            let market_root = definition["source"].as_str().unwrap_or_default();
            let source_path = if Path::new(source).is_absolute() {
                PathBuf::from(source)
            } else {
                Path::new(market_root).join(source)
            };
            let installed = item["installed"].as_bool().unwrap_or(false);
            let version = item["version"].as_str().map(str::to_owned);
            let installed_path = item["installedPath"]
                .as_str()
                .map(PathBuf::from)
                .filter(|p| installed && p.is_absolute())
                .or_else(|| {
                    version
                        .as_deref()
                        .filter(|v| safe_segment(v))
                        .filter(|_| installed)
                        .map(|v| home.join("plugins/cache").join(market).join(name).join(v))
                        .filter(|p| p.is_dir())
                });
            let root = installed_path.as_deref().unwrap_or(&source_path);
            let data = match manifest(root) {
                Ok(v) => v,
                Err(e) => {
                    warnings.push(format!("{id}: {e}"));
                    Value::Null
                }
            };
            let skill_root = if installed {
                installed_path.as_deref()
            } else {
                Some(root)
            };
            let skill_inventory =
                skill_inventory::inspect(skill_root, Some(&source_path), installed);
            let documents = skill_root
                .map(|path| plugin_documents(path, &data))
                .unwrap_or_default();
            let mut components: Vec<String> = ["skills", "mcpServers", "hooks", "apps"]
                .iter()
                .filter(|key| !data[**key].is_null())
                .map(|s| s.to_string())
                .collect();
            if !documents.is_empty() && !components.iter().any(|s| s == "skills") {
                components.push("skills".into());
            }
            // Conventional component files are part of the package even when omitted from its manifest.
            for (file, label) in [
                (".mcp.json", "mcpServers"),
                ("mcp.json", "mcpServers"),
                ("hooks/hooks.json", "hooks"),
                (".app.json", "apps"),
            ] {
                if root.join(file).is_file() && !components.iter().any(|s| s == label) {
                    components.push(label.into());
                }
            }
            // Inventory fingerprints guard identity/configuration. Package content is
            // hashed on demand by the update review, never while opening an Agent.
            let fingerprint = document_diff::revision(
                json!({
                    "id": id, "source": source_path, "installedPath": installed_path,
                    "installed": installed, "enabled": item["enabled"],
                    "policy": item["installPolicy"], "policySource": item["installPolicySource"],
                    "components": components, "skills": documents,
                })
                .to_string()
                .as_bytes(),
            );
            let can_check_updates = local && installed && installed_path.is_some();
            plugins.push(Plugin {
                toggle_scope: String::new(),
                project_enabled: None,
                remote_plugin_id: None,
                marketplace_display_name: market_data["interface"]["displayName"]
                    .as_str()
                    .map(str::to_owned),
                source_origin: markets::market_origin(
                    market,
                    Path::new(market_root),
                    !user_layer(config)
                        .ok()
                        .map(|layer| layer["config"]["marketplaces"][market].is_null())
                        .unwrap_or(true),
                )
                .into(),
                category: data["interface"]["category"]
                    .as_str()
                    .or_else(|| {
                        market_data["plugins"]
                            .as_array()
                            .and_then(|entries| entries.iter().find(|entry| entry["name"] == name))
                            .and_then(|entry| entry["category"].as_str())
                    })
                    .map(str::to_owned),
                enabled_known: item["enabled"].is_boolean(),
                source_kind: item["source"]["source"].as_str().map(str::to_owned),
                install_policy: item["installPolicy"].as_str().map(str::to_owned),
                install_policy_source: item["installPolicySource"].as_str().map(str::to_owned),
                permissions: access::Permissions::default(),
                description: presentation::description(&data),
                author: presentation::author(&data),
                icon: presentation::icon(root, &data),
                builtin: catalog::builtin_market(market, Path::new(market_root)),
                id: id.into(),
                name: data["interface"]["displayName"]
                    .as_str()
                    .unwrap_or(name)
                    .into(),
                marketplace: market.clone(),
                version,
                installed,
                installation_known: item["installed"].is_boolean(),
                enabled: item["enabled"].as_bool().unwrap_or(false),
                components,
                skill_inventory,
                skills: documents
                    .iter()
                    .map(|p| p.to_string_lossy().into())
                    .collect(),
                source_path: source_path.to_string_lossy().into(),
                auth_policy: item["authPolicy"].as_str().map(str::to_owned),
                content_verified: installed_path.as_ref().is_some_and(|p| p.is_dir())
                    && !data.is_null(),
                installed_path: installed_path.map(|p| p.to_string_lossy().into()),
                can_install: false,
                can_toggle: false,
                can_uninstall: false,
                can_check_updates,
                catalog_entry: false,
                remote: false,
                git_marketplace,
                toggle_reason: None,
                uninstall_reason: None,
                unavailable_reason: None,
                fingerprint,
            });
        }
    }
    // Configuration records retain identity, but do not establish runtime manageability.
    // Configuration alone is not evidence of an installed cache or a removable package.
    if let Some(entries) = config["config"]["plugins"].as_object() {
        for (id, entry) in entries {
            if plugins.iter().any(|p| p.id == *id) {
                continue;
            }
            let Some((name, market)) = id.rsplit_once('@') else {
                continue;
            };
            if !safe_segment(name) || !safe_segment(market) {
                continue;
            }
            let Some(enabled) = entry["enabled"].as_bool() else {
                continue;
            };
            plugins.push(Plugin {
                toggle_scope: String::new(),
                project_enabled: None,
                remote_plugin_id: None,
                marketplace_display_name: None,
                source_origin: "configuration".into(),
                category: None,
                enabled_known: false,
                source_kind: None,
                install_policy: None,
                install_policy_source: None,
                permissions: access::Permissions::default(),
                description: String::new(),
                author: None,
                icon: None,
                id: id.clone(),
                name: name.into(),
                marketplace: market.into(),
                version: None,
                installed: false,
                installation_known: false,
                enabled,
                components: vec![],
                skill_inventory: Default::default(),
                skills: vec![],
                source_path: String::new(),
                installed_path: None,
                can_install: false,
                can_toggle: false,
                can_uninstall: false,
                can_check_updates: false,
                catalog_entry: false,
                remote: false,
                git_marketplace: false,
                toggle_reason: Some("unconfirmed".into()),
                uninstall_reason: Some("unconfirmed".into()),
                unavailable_reason: Some("unconfirmed".into()),
                fingerprint: format!("configured:{id}:{entry}"),
                auth_policy: None,
                content_verified: false,
                builtin: false,
            });
        }
    }
    plugins
}
fn inspect(engine: &Engine, target: &Target) -> Result<Snapshot, String> {
    inspect_catalog(engine, target, false)
}

fn inspect_catalog(
    engine: &Engine,
    target: &Target,
    include_catalog: bool,
) -> Result<Snapshot, String> {
    inspect_mode(engine, target, include_catalog, true)
}
fn inspect_skills(engine: &Engine, target: &Target) -> Result<Snapshot, String> {
    inspect_mode(engine, target, false, false)
}
fn inspect_mode(
    engine: &Engine,
    target: &Target,
    include_catalog: bool,
    include_plugins: bool,
) -> Result<Snapshot, String> {
    let binary = binary(engine).ok_or("Codex CLI was not found. Install the original Codex CLI to manage native skills and plugins.")?;
    let cwd = target.directory(&engine.home)?;
    let version = run_process_with_timeout(
        command(engine, &binary, &cwd).arg("--version"),
        Duration::from_secs(5),
    )?;
    if !version.success {
        return Err("Cannot read Codex CLI version.".into());
    }
    let mut session = Session::start(engine, &binary, &cwd)?;
    let config = read_config(&mut session, &cwd)?;
    let layer = user_layer(&config)?;
    let revision = layer["version"]
        .as_str()
        .ok_or("Codex configuration version unavailable.")?
        .to_owned();
    let (mut skills, mut warnings) = list_skills(&mut session, &cwd)?;
    let mut capabilities = inspect_capabilities(engine, &binary, &cwd);
    capabilities.write_config &= layer["disabledReason"].is_null();
    let home = engine.env_home("CODEX_HOME", ".codex");
    if session
        .codex_home
        .as_ref()
        .is_some_and(|actual| identity(actual) != identity(&home))
    {
        return Err("Codex returned a different configuration directory.".into());
    }
    let config_path = layer["name"]["file"]
        .as_str()
        .map(PathBuf::from)
        .filter(|path| path.is_absolute())
        .ok_or("Codex user configuration path unavailable.")?;
    let context_id = Some(document_diff::revision(
        format!(
            "{}:{}:{}:{}:{}",
            identity(&binary).display(),
            version.stdout.trim(),
            identity(&home).display(),
            identity(&config_path).display(),
            identity(&cwd).display()
        )
        .as_bytes(),
    ));
    let mut plugins_complete = capabilities.list_plugins;
    let mut plugins = if include_plugins {
        plugins(
            engine,
            &binary,
            &cwd,
            &config,
            &mut warnings,
            &capabilities,
            &mut plugins_complete,
        )
    } else {
        Vec::new()
    };
    if include_catalog && capabilities.list_plugins {
        // Public CLI JSON is the production contract. Plugin RPCs remain
        // development-only even when a generated schema exposes them.
        match catalog::read(engine, &binary, &cwd, &mut plugins_complete, &mut warnings) {
            Ok(value) => {
                if let Err(error) = catalog::merge(
                    &mut plugins,
                    &value,
                    &engine.env_home("CODEX_HOME", ".codex"),
                    &capabilities,
                    &config,
                ) {
                    plugins_complete = false;
                    warnings.push(error);
                }
            }
            Err(error) => {
                plugins_complete = false;
                warnings.push(error);
            }
        }
    }
    for plugin in &mut plugins {
        access::apply(plugin, &config, &capabilities);
    }
    let missing_documents: Vec<String> = plugins
        .iter()
        .filter(|p| p.installed)
        .flat_map(|p| p.skills.iter())
        .map(|p| identity(Path::new(p)).to_string_lossy().into_owned())
        .filter(|p| !skills.iter().any(|s| s.state.document_path == *p))
        .filter_map(|p| {
            Path::new(&p)
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
        })
        .collect();
    let metadata = if missing_documents.is_empty() {
        None
    } else {
        engine.codex_documents(&missing_documents).ok()
    };
    for plugin in plugins.iter().filter(|p| p.installed) {
        for document in &plugin.skills {
            let document = identity(Path::new(document)).to_string_lossy().into_owned();
            if skills.iter().any(|s| s.state.document_path == document) {
                continue;
            }
            let path = Path::new(&document)
                .parent()
                .unwrap_or(Path::new(&document));
            let metadata = metadata
                .as_ref()
                .and_then(|items| items.get(&path.to_string_lossy().into_owned()));
            skills.push(NativeSkill {
                name: format!(
                    "{}:{}",
                    plugin.id.rsplit_once('@').map(|(name, _)| name).unwrap_or(&plugin.name),
                    metadata
                        .and_then(|m| m.document.name.clone())
                        .filter(|n| !n.is_empty())
                        .unwrap_or_else(|| {
                            path.file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .into_owned()
                        })
                ),
                description: metadata
                    .and_then(|m| m.document.description.clone())
                    .unwrap_or_default(),
                state: SkillState {
                    display_name: metadata.and_then(|m| m.interface["display_name"].as_str()).map(str::to_owned),
                    icon: metadata.and_then(|m| presentation::skill_icon(path, &json!({"iconSmall":m.interface["icon_small"],"iconLarge":m.interface["icon_large"]}))),
                    plugin_display_name: Some(plugin.name.clone()),
                    document_path: document.clone(),
                    installation_path: path.to_string_lossy().into(),
                    origin: "plugin".into(),
                    runtime_scope: if plugin.enabled { "unloaded" } else { "user" }.into(),
                    in_scope: target.scope == "global",
                    enabled: None,
                    plugin_id: Some(plugin.id.clone()),
                    can_toggle: true,
                    needs_confirmation: false,
                    toggle_scope: Some("user".into()),
                    lifecycle_owner: "codex-plugin".into(),
                },
            });
        }
    }
    {
        let mut aliases = Vec::new();
        let mut pending = if target.scope == "project" {
            vec![cwd.join(".codex/skills"), cwd.join(".agents/skills")]
        } else {
            vec![
                engine.home.join(".agents/skills"),
                engine.env_home("CODEX_HOME", ".codex").join("skills"),
            ]
        };
        let mut seen = BTreeSet::new();
        while let Some(path) = pending.pop() {
            if !path.is_dir() || seen.len() + aliases.len() > 2000 {
                continue;
            }
            let document = path.join("SKILL.md");
            if document.is_file() {
                if let Some(native) = skills
                    .iter()
                    .find(|s| Path::new(&s.state.document_path) == identity(&document))
                {
                    let mut alias = native.clone();
                    alias.state.installation_path = path.to_string_lossy().into();
                    alias.state.in_scope = true;
                    aliases.push(alias);
                }
            } else if seen.insert(identity(&path)) {
                if let Ok(entries) = fs::read_dir(&path) {
                    pending.extend(
                        entries
                            .flatten()
                            .take(500)
                            .filter(|e| e.file_name() != ".system")
                            .map(|e| e.path()),
                    );
                }
            }
        }
        for alias in aliases {
            if !skills.iter().any(|s| {
                s.state.installation_path == alias.state.installation_path
                    || (!Path::new(&alias.state.installation_path).is_symlink()
                        && identity(Path::new(&s.state.installation_path))
                            == identity(Path::new(&alias.state.installation_path)))
            }) {
                skills.push(alias);
            }
        }
    }
    for skill in &mut skills {
        if let Some(plugin) = plugins
            .iter()
            .find(|plugin| Some(&plugin.id) == skill.state.plugin_id.as_ref())
        {
            skill.state.plugin_display_name = Some(plugin.name.clone());
        }
        skill.state.can_toggle &= capabilities.write_config;
        if skill.state.plugin_id.is_some() {
            skill.state.enabled = Some(rules::configured_enabled(
                &layer["config"]["skills"]["config"],
                &skill.name,
                &skill.state.document_path,
            ));
        }
        skill.state.needs_confirmation = layer["config"]["skills"]["config"]
            .as_array()
            .is_some_and(|rules| {
                rules
                    .iter()
                    .any(|r| r["name"].as_str() == Some(&skill.name))
            });
        skill.state.in_scope = if target.scope == "global" {
            skill.state.runtime_scope != "repo"
        } else {
            Path::new(&skill.state.installation_path).starts_with(&cwd)
                && (skill.state.runtime_scope == "repo" || skill.state.in_scope)
        };
    }
    let home = engine.env_home("CODEX_HOME", ".codex");
    let mut snapshot = Snapshot {
        binary: binary.to_string_lossy().into(),
        version: version.stdout.trim().into(),
        context_id,
        config_path: config_path.to_string_lossy().into(),
        codex_home: home.to_string_lossy().into(),
        revision,
        unavailable_reason: None,
        plugins_complete,
        catalog_requested: include_catalog,
        rules: layer["config"]["skills"]["config"]
            .as_array()
            .cloned()
            .unwrap_or_default(),
        capabilities,
        skills,
        plugins,
        warnings,
    };
    if include_catalog {
        account::overlay(&mut snapshot, &config);
    }
    scope::apply(engine, target, &config, &mut snapshot.plugins);
    Ok(snapshot)
}

pub(super) fn read_snapshot(engine: &Engine, target: &Target) -> Snapshot {
    read_snapshot_catalog(engine, target, false)
}

fn read_snapshot_catalog(engine: &Engine, target: &Target, include_catalog: bool) -> Snapshot {
    match inspect_catalog(engine, target, include_catalog) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            let executable = binary(engine);
            let home = engine.env_home("CODEX_HOME", ".codex");
            Snapshot {
                unavailable_reason: Some(
                    if executable.is_none() {
                        "cliMissing"
                    } else {
                        "unavailable"
                    }
                    .into(),
                ),
                binary: executable
                    .map(|p| p.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                context_id: None,
                version: String::new(),
                config_path: home.join("config.toml").to_string_lossy().into_owned(),
                codex_home: home.to_string_lossy().into_owned(),
                revision: String::new(),
                rules: vec![],
                capabilities: Capabilities::default(),
                skills: vec![],
                plugins: vec![],
                plugins_complete: false,
                catalog_requested: include_catalog,
                warnings: vec![error],
            }
        }
    }
}

#[cfg(test)]
pub(super) fn augment(engine: &Engine, target: &Target, inventory: &mut Inventory) {
    augment_observed(engine, target, inventory, read_snapshot(engine, target));
}
pub(super) fn augment_observed(
    engine: &Engine,
    target: &Target,
    inventory: &mut Inventory,
    snapshot: Snapshot,
) {
    inventory.codex = Some(snapshot.clone());
    inventory.warnings.extend(snapshot.warnings);
    if let Some(agent) = inventory.agents.iter_mut().find(|a| a.id == "codex") {
        let root = if target.scope == "global" {
            PathBuf::from(&snapshot.codex_home).join("skills")
        } else {
            target
                .directory(&engine.home)
                .unwrap_or_default()
                .join(".codex/skills")
        };
        let root = root.to_string_lossy().into_owned();
        if root != agent.path && !agent.additional_paths.contains(&root) {
            agent.additional_paths.push(root);
        }
    }
    let standard_root = target
        .directory(&engine.home)
        .unwrap_or_default()
        .join(".agents/skills");
    let original_count = inventory.skills.len();
    for mut native in snapshot.skills {
        let mut matched = false;
        for skill in inventory
            .skills
            .iter_mut()
            .take(original_count)
            .filter(|s| {
                s.agents.iter().any(|id| id == "codex")
                    || Path::new(&s.path)
                        .parent()
                        .is_some_and(|p| identity(p) == identity(&standard_root))
            })
        {
            if identity(&Path::new(&skill.path).join("SKILL.md"))
                != PathBuf::from(&native.state.document_path)
            {
                continue;
            }
            if !skill.agents.iter().any(|id| id == "codex") {
                skill.agents.push("codex".into());
            }
            if native.state.origin == "standalone"
                && !skill.cli_agents.iter().any(|id| id == "codex")
            {
                skill.cli_agents.push("codex".into());
            }
            let mut state = native.state.clone();
            state.installation_path = skill.path.clone();
            state.in_scope = true;
            if state.origin == "standalone" {
                state.lifecycle_owner = "skills-cli".into();
            } else {
                skill.updateable = false;
            }
            skill.codex_state = Some(state);
            matched = true;
        }
        let native_root = if target.scope == "project" {
            target
                .directory(&engine.home)
                .unwrap_or_default()
                .join(".codex/skills")
        } else {
            engine.env_home("CODEX_HOME", ".codex").join("skills")
        };
        let own_instance = Path::new(&native.state.installation_path).starts_with(native_root)
            && !inventory
                .skills
                .iter()
                .any(|s| s.path == native.state.installation_path);
        if (!matched || own_instance) && native.state.in_scope {
            let standard = native.state.origin == "standalone"
                && Path::new(&native.state.installation_path)
                    .parent()
                    .is_some_and(|p| identity(p) == identity(&standard_root));
            if standard {
                native.state.lifecycle_owner = "skills-cli".into();
            }
            inventory.skills.push(Skill {
                source_type: None,
                plugin_name: native.state.plugin_id.clone(),
                name: native.name,
                path: native.state.installation_path.clone(),
                agents: vec!["codex".into()],
                shared: false,
                source: None,
                source_url: None,
                description: native.description,
                issue: None,
                updateable: false,
                install_source: None,
                eve_locations: Vec::new(),
                cli_managed: false,
                cli_agents: if standard {
                    vec!["codex".into()]
                } else {
                    Vec::new()
                },
                hermes_origin: None,
                hermes_state: None,
                pi_state: None,
                dsh_state: None,
                codex_state: Some(native.state),
            });
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToggleRequest {
    target: Target,
    revision: String,
    documents: Vec<String>,
    base_rules: Option<Vec<Value>>,
    enabled: bool,
}
fn toggle(engine: &Engine, request: ToggleRequest) -> Result<Snapshot, String> {
    let mut observed = inspect(engine, &request.target)?;
    if request.documents.iter().any(|p| {
        !observed
            .skills
            .iter()
            .any(|s| s.state.document_path == *p && s.state.can_toggle)
    }) {
        return Err(
            "Selected skill cannot be changed with this Codex version or configuration.".into(),
        );
    }
    let binary = PathBuf::from(&observed.binary);
    let cwd = request.target.directory(&engine.home)?;
    let mut session = Session::start(engine, &binary, &cwd)?;
    let config = read_config(&mut session, &cwd)?;
    let layer = user_layer(&config)?;
    if layer["version"] != request.revision
        && request.base_rules.as_ref()
            != Some(
                &layer["config"]["skills"]["config"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default(),
            )
    {
        return Err("Codex configuration changed. Refresh and retry your selection.".into());
    }
    let documents: BTreeSet<_> = request.documents.into_iter().collect();
    if documents.is_empty() {
        return Err("Select at least one skill.".into());
    }
    if request.target.scope == "project" {
        // Match the desktop skill card: plugin names select a plugin skill;
        // ordinary skills select their document path. Inventory ownership is
        // distinct from the original runtime's skill configuration authority.
        for path in &documents {
            let skill = observed.skills.iter().find(|skill| skill.state.document_path == *path)
                .ok_or("Selected skill is no longer available.")?;
            let params = if skill.name.contains(':') && observed.capabilities.name_rules {
                json!({"name":skill.name,"enabled":request.enabled})
            } else {
                json!({"path":path,"enabled":request.enabled})
            };
            session.call("skills/config/write", params)?;
        }
        let after = inspect(engine, &request.target)?;
        if documents.iter().any(|path| !after.skills.iter().any(|skill| {
            skill.state.document_path == *path && skill.state.enabled == Some(request.enabled)
        })) {
            return Err("A selected skill did not reach the requested setting.".into());
        }
        return Ok(after);
    }
    let mut rules = layer["config"]["skills"]["config"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut selected_rules = BTreeMap::new();
    rules.retain(|rule| {
        if let Some(path) = rule["path"].as_str().filter(|_| rule.get("name").is_none()) {
            let canonical = identity(Path::new(path)).to_string_lossy().into_owned();
            if documents.contains(&canonical) {
                selected_rules.insert(canonical, rule.clone());
                return false;
            }
        }
        true
    });
    for path in &documents {
        let mut rule = selected_rules.remove(path).unwrap_or_else(|| json!({}));
        rule["path"] = json!(path);
        rule["enabled"] = json!(request.enabled);
        rules.push(rule);
    }
    session.call("config/value/write",json!({"keyPath":"skills.config","value":rules,"mergeStrategy":"replace","expectedVersion":layer["version"]}))?;
    let saved = read_config(&mut session, &cwd)?;
    let saved_layer = user_layer(&saved)?;
    if saved_layer["config"]["skills"]["config"] != json!(rules) {
        return Err("Skill rules were not saved as requested.".into());
    }
    let (after, _) = list_skills(&mut session, &cwd)?;
    for skill in &mut observed.skills {
        if let Some(actual) = after
            .iter()
            .find(|s| s.state.document_path == skill.state.document_path)
        {
            skill.state.enabled = actual.state.enabled;
        }
        if skill.state.plugin_id.is_some() {
            skill.state.enabled = Some(rules::configured_enabled(
                &json!(rules),
                &skill.name,
                &skill.state.document_path,
            ));
        }
    }
    if documents.iter().any(|p| {
        !observed
            .skills
            .iter()
            .any(|s| s.state.document_path == *p && s.state.enabled == Some(request.enabled))
    }) {
        return Err("A selected skill did not reach the requested setting.".into());
    }
    observed.rules = rules;
    observed.revision = saved_layer["version"]
        .as_str()
        .ok_or("Configuration version missing")?
        .into();
    Ok(observed)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginRequest {
    target: Target,
    revision: String,
    plugin_id: String,
    fingerprint: String,
    #[serde(default)]
    catalog_entry: bool,
    #[serde(default)]
    remote_plugin_id: Option<String>,
    action: String,
}
fn plugin_apply(engine: &Engine, request: PluginRequest) -> Result<Snapshot, String> {
    let local = inspect(engine, &request.target)?;
    let before = if request.action == "install" && request.remote_plugin_id.is_some() {
        let mut snapshot = inspect_catalog(engine, &request.target, true)?;
        let plugin = discovery::prepare(
            engine,
            &request.target,
            request.remote_plugin_id.as_deref().unwrap_or_default(),
            &snapshot,
        )?;
        snapshot.plugins.retain(|current| current.id != plugin.id);
        snapshot.plugins.push(plugin);
        snapshot
    } else if request.catalog_entry
        && !local
            .plugins
            .iter()
            .any(|plugin| plugin.id == request.plugin_id && plugin.installation_known)
    {
        inspect_catalog(engine, &request.target, true)?
    } else {
        local
    };
    // Kept in the wire contract for existing callers; unrelated config changes do
    // not invalidate native installation actions. Writes use the freshly read version.
    let _ = &request.revision;
    let plugin = before
        .plugins
        .iter()
        .find(|p| p.id == request.plugin_id)
        .ok_or("Plugin is no longer available in the native inventory.")?;
    if plugin.fingerprint != request.fingerprint {
        return Err("Plugin changed. Refresh and review its components again.".into());
    }
    let binary = Path::new(&before.binary);
    let cwd = request.target.directory(&engine.home)?;
    let allowed = match request.action.as_str() {
        "install" => plugin.can_install,
        "uninstall" => plugin.can_uninstall,
        "enable" | "disable" => plugin.can_toggle,
        "reset" => {
            plugin.can_toggle
                && plugin.toggle_scope == "project"
                && plugin.project_enabled.is_some()
        }
        _ => false,
    };
    if !allowed {
        return Err("This plugin action is unavailable.".into());
    }
    if plugin.remote {
        account::apply(plugin, &request.action)?;
        return inspect_catalog(engine, &request.target, true);
    }
    let lifecycle_cli = if plugin.remote { remote_cli } else { cli };
    let execution = (|| -> Result<(), String> {
        match request.action.as_str() {
            "install" if plugin.can_install => {
                lifecycle_cli(
                    engine,
                    binary,
                    &cwd,
                    &["plugin", "add", &plugin.id, "--json"],
                )?;
            }
            "uninstall" if plugin.can_uninstall => {
                lifecycle_cli(
                    engine,
                    binary,
                    &cwd,
                    &["plugin", "remove", &plugin.id, "--json"],
                )?;
            }
            "enable" | "disable" | "reset"
                if plugin.can_toggle && request.target.scope == "project" =>
            {
                scope::write(engine, &request.target, binary, plugin, &request.action)?;
            }
            "enable" | "disable" if plugin.can_toggle => {
                let mut session = Session::start(engine, binary, &cwd)?;
                let config = read_config(&mut session, &cwd)?;
                let layer = user_layer(&config)?;
                if config["config"]["plugins"][&plugin.id]["enabled"]
                    .as_bool()
                    .unwrap_or(true)
                    != plugin.enabled
                {
                    return Err("Plugin state changed. Refresh before changing it.".into());
                }
                let mut entries = layer["config"]["plugins"]
                    .as_object()
                    .cloned()
                    .unwrap_or_default();
                let entry = entries.entry(plugin.id.clone()).or_insert(json!({}));
                entry
                    .as_object_mut()
                    .ok_or("Invalid Codex plugin configuration.")?
                    .insert("enabled".into(), json!(request.action == "enable"));
                session.call("config/value/write",json!({"keyPath":"plugins","value":entries,"mergeStrategy":"replace","expectedVersion":layer["version"]}))?;
            }
            _ => return Err("This plugin action is unavailable.".into()),
        }
        Ok(())
    })();
    let mut after = inspect_catalog(engine, &request.target, plugin.remote)?;
    let current = after.plugins.iter().find(|p| p.id == request.plugin_id);
    let verified = match request.action.as_str() {
        "install" => current.is_some_and(|p| {
            p.installed
                && (p.remote || p.content_verified)
                && (p.remote
                    || p.installed_path
                        .as_ref()
                        .is_some_and(|p| Path::new(p).is_dir()))
        }),
        "uninstall" => {
            current.is_some_and(|p| p.installation_known && !p.installed)
                || current.is_none() && after.plugins_complete
        }
        "reset" => {
            current.is_some_and(|p| p.toggle_scope == "project" && p.project_enabled.is_none())
        }
        "enable" => current.is_some_and(|p| p.installation_known && p.installed && p.enabled),
        "disable" => current.is_some_and(|p| p.installation_known && p.installed && !p.enabled),
        _ => false,
    };
    if !verified {
        return Err(execution.err().unwrap_or_else(|| "Codex finished the command, but the requested plugin state could not be verified. Refresh actual state before retrying.".into()));
    }
    if let Err(error) = execution {
        after.warnings.push(format!(
            "The requested plugin state was verified after a command error: {error}"
        ));
    }
    Ok(after)
}
#[tauri::command]
pub async fn upstream_codex_plugin_directory(
    app: AppHandle,
    target: Target,
    zh: bool,
    metadata_only: Option<bool>,
) -> Result<discovery::Directory, String> {
    tauri::async_runtime::spawn_blocking(move || {
        discovery::directory(
            &Engine::from_app(&app)?,
            &target,
            zh,
            metadata_only.unwrap_or(false),
        )
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_plugin_category(
    app: AppHandle,
    target: Target,
    slug: Option<String>,
    query: String,
    cursor: Option<String>,
    personal: bool,
    zh: bool,
) -> Result<discovery::Page, String> {
    tauri::async_runtime::spawn_blocking(move || {
        discovery::page(
            &Engine::from_app(&app)?,
            &target,
            slug.as_deref(),
            &query,
            cursor.as_deref(),
            personal,
            zh,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_prepare_public_plugin(
    app: AppHandle,
    target: Target,
    remote_plugin_id: String,
) -> Result<Plugin, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        let snapshot = inspect_catalog(&engine, &target, true)?;
        discovery::prepare(&engine, &target, &remote_plugin_id, &snapshot)
    })
    .await
    .map_err(|error| error.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_settings(
    app: AppHandle,
    target: Target,
    include_catalog: Option<bool>,
    skills_only: Option<bool>,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        if skills_only.unwrap_or(false) {
            inspect_skills(&engine, &target)
        } else {
            Ok(read_snapshot_catalog(
                &engine,
                &target,
                include_catalog.unwrap_or(false),
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_toggle(
    app: AppHandle,
    request: ToggleRequest,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        toggle(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_codex_plugin(
    app: AppHandle,
    request: PluginRequest,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        plugin_apply(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests;

pub(super) fn read_document(root: &Path) -> Result<SkillDocumentInfo, String> {
    if !root.is_absolute() {
        return Err("Skill path must be absolute.".into());
    }
    let path = root.join("SKILL.md");
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 256 * 1024 {
        return Err("Skill document exceeds preview limits.".into());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    if content.len() > 256 * 1024 {
        return Err("Skill document exceeds preview limits.".into());
    }
    let plugin_version = root.ancestors().take(8).find_map(|ancestor| {
        manifest(ancestor)
            .ok()
            .and_then(|data| data["version"].as_str().map(str::to_owned))
    });
    Ok(SkillDocumentInfo {
        plugin_version,
        source_directory: None,
        revision: tree_signature(root).map(|bytes| document_diff::revision(&bytes)),
        local_state: None,
        content,
        version: None,
    })
}
