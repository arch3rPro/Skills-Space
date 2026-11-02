//! DSH inventory and bounded native extensions. CLI lifecycle uses the original universal target.
mod native;
mod policy;
pub use policy::*;
use super::*;
pub use native::*;

pub(super) const ID: &str = "deepseek-harness";

fn harness_home(engine: &Engine) -> PathBuf {
    let path = engine.env_home("DSH_HOME", ".dsh");
    if path == Path::new("~") {
        engine.home.clone()
    } else if let Ok(relative) = path.strip_prefix("~/") {
        engine.home.join(relative)
    } else {
        path
    }
}

// The desktop launcher points into runtime/cli, while packages live in app.asar.
// Use its original Electron filesystem only for our bounded inspection/preparation
// helpers; never invoke the desktop CLI, boot a Profile or import plugin entrypoints.
fn helper_command(engine: &Engine, directory: &Path) -> Command {
    #[cfg(target_os = "macos")]
    if !engine.isolated {
        let mut candidates: Vec<PathBuf> = std::env::var_os("PATH")
            .map(|path| {
                std::env::split_paths(&path)
                    .map(|bin| bin.join("dsh"))
                    .collect()
            })
            .unwrap_or_default();
        candidates.extend([
            engine.home.join(".local/bin/dsh"),
            PathBuf::from("/opt/homebrew/bin/dsh"),
            PathBuf::from("/usr/local/bin/dsh"),
            engine
                .home
                .join("Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"),
            PathBuf::from("/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness"),
        ]);
        for candidate in candidates {
            let Ok(actual) = fs::canonicalize(candidate) else {
                continue;
            };
            let Some(bundle) = actual.ancestors().find(|parent| {
                parent
                    .file_name()
                    .is_some_and(|name| name == "DeepSeek Harness.app")
            }) else {
                continue;
            };
            let executable = bundle.join("Contents/MacOS/DeepSeek Harness");
            if detection::executable(&executable)
                && bundle.join("Contents/Resources/app.asar").is_file()
            {
                let mut command = engine.command(&executable, directory);
                command
                    .env("ELECTRON_RUN_AS_NODE", "1")
                    .env_remove("NODE_OPTIONS")
                    .arg("--expose-internals");
                return command;
            }
        }
    }
    engine.command(&engine.node, directory)
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillState {
    #[serde(default)]
    pub declared_path: Option<String>,
    pub file: String,
    pub source: String,
    pub model_invocable: bool,
    pub user_invocable: bool,
    pub shadowed: bool,
    pub cli_addressable: bool,
    pub configured: bool,
    pub reason: Option<String>,
    #[serde(default)]
    pub can_set_invocation: bool,
    #[serde(default)]
    pub can_trash: bool,
    #[serde(default)]
    pub document_revision: String,
}

pub(super) fn agent(engine: &Engine, target: &Target) -> Result<Agent, String> {
    let path = target.directory(&engine.home)?.join(".agents/skills");
    let configured = harness_home(engine).is_dir();
    let (installation_status, installation_evidence) = detection::inspect_agent(
        ID,
        "DeepSeek Harness",
        &engine.home,
        engine.isolated,
        configured,
    );
    Ok(Agent {
        id: ID.into(),
        name: "DeepSeek Harness".into(),
        path: path.to_string_lossy().into(),
        directory_exists: path.is_dir(),
        detected: configured,
        installation_status,
        installation_evidence,
        shared_directory: true,
        additional_paths: Vec::new(),
        subagents: Vec::new(),
    })
}

pub(super) fn inspect(engine: &Engine, target: &Target) -> Result<serde_json::Value, String> {
    inspect_context(engine, target, None)
}

pub(super) fn inspect_context(
    engine: &Engine,
    target: &Target,
    context_key: Option<&str>,
) -> Result<serde_json::Value, String> {
    let directory = target.directory(&engine.home)?;
    let mut command = helper_command(engine, &engine.home);
    command
        .arg(engine.resources.join("inspect-dsh-skills.mjs"))
        .arg(&engine.home)
        .arg(harness_home(engine))
        .arg(if target.scope == "project" {
            directory.to_string_lossy().into_owned()
        } else {
            String::new()
        });
    let mut options = serde_json::json!({"contextKey":context_key});
    if engine.isolated {
        options["runtimeVersion"] = "0.2.0-rc.2".into();
    }
    command
        .arg("inspect")
        .arg(serde_json::to_string(&options).map_err(|e| e.to_string())?);
    let output = run_process_with_timeout(&mut command, Duration::from_secs(20))?;
    if !output.success {
        return Err("DSH skill inspection failed. No configuration was changed.".into());
    }
    serde_json::from_str(&output.stdout).map_err(|_| "Unsupported DSH inspection response.".into())
}

pub(super) fn validate_target(engine: &Engine, operation: &Operation) -> Result<(), String> {
    if operation.action == "add" && operation.agents.iter().any(|id| id == ID) {
        if let Some(issue) = inspect_context(
            engine,
            &operation.target,
            operation.dsh_context_key.as_deref(),
        )?["installIssue"]
            .as_str()
        {
            return Err(issue.into());
        }
    }
    Ok(())
}

pub(super) fn validate_source(
    engine: &Engine,
    operation: &Operation,
    inspection: &Inspection,
) -> Result<(), String> {
    if !operation.agents.iter().any(|id| id == ID) {
        return Ok(());
    }
    let documents: Vec<_> = inspection
        .skills
        .iter()
        .filter(|skill| operation.skills.contains(&skill.name))
        .map(|skill| serde_json::json!({"name":skill.name,"content":skill.content}))
        .collect();
    let mut command = engine.command(&engine.node, &engine.home);
    command
        .arg(engine.resources.join("inspect-dsh-skills.mjs"))
        .arg(&engine.home)
        .arg(harness_home(engine))
        .arg("")
        .arg("validate")
        .arg(serde_json::to_string(&documents).map_err(|error| error.to_string())?);
    let output = run_process(&mut command)?;
    if !output.success {
        return Err("Cannot verify DSH skill compatibility.".into());
    }
    let rows: Vec<serde_json::Value> =
        serde_json::from_str(&output.stdout).map_err(|error| error.to_string())?;
    for row in rows {
        if let Some(error) = row["error"].as_str() {
            return Err(format!(
                "{}: {error}. DSH installation was not started.",
                row["name"].as_str().unwrap_or("Skill")
            ));
        }
    }
    Ok(())
}

pub(super) fn augment_observed(
    inventory: &mut Inventory,
    observed: Result<serde_json::Value, String>,
) {
    let snapshot = match observed {
        Ok(value) => value,
        Err(error) => {
            inventory.warnings.push(error);
            return;
        }
    };
    inventory.dsh = Some(snapshot.clone());
    if let Some(issue) = snapshot["contextIssue"].as_str() {
        inventory.warnings.push(issue.into());
    }
    if let Some(warnings) = snapshot["warnings"].as_array() {
        inventory.warnings.extend(
            warnings
                .iter()
                .filter_map(|value| value.as_str().map(str::to_owned)),
        );
    }
    let Some(rows) = snapshot["skills"].as_array() else {
        return;
    };
    for row in rows.iter().filter(|row| row["inScope"] == true) {
        let (Some(path), Some(name), Some(description)) = (
            row["path"].as_str(),
            row["name"].as_str(),
            row["description"].as_str(),
        ) else {
            continue;
        };
        let Ok(mut state) = serde_json::from_value::<SkillState>(row.clone()) else {
            continue;
        };
        if let Some(skill) = inventory
            .skills
            .iter_mut()
            .find(|skill| skill.path == path && skill.name == name)
        {
            if !skill.agents.iter().any(|id| id == ID) {
                skill.agents.push(ID.into());
            }
            if state.cli_addressable && !skill.cli_agents.iter().any(|id| id == ID) {
                skill.cli_agents.push(ID.into());
            }
            if skill.shared || skill.cli_managed || skill.agents.iter().any(|id| id != ID) {
                state.can_set_invocation = false;
                state.can_trash = false;
            }
            skill.dsh_state = Some(state);
        } else {
            // A new row was not recognized by the CLI inventory; keep its lifecycle read-only.
            state.cli_addressable = false;
            inventory.skills.push(Skill {
                source_type: None,
                plugin_name: None,
                name: name.into(),
                path: path.into(),
                agents: vec![ID.into()],
                shared: state.cli_addressable,
                source: None,
                source_url: None,
                description: description.into(),
                issue: None,
                updateable: false,
                install_source: None,
                eve_locations: Vec::new(),
                cli_managed: false,
                cli_agents: if state.cli_addressable {
                    vec![ID.into()]
                } else {
                    Vec::new()
                },
                hermes_origin: None,
                hermes_state: None,
                pi_state: None,
                dsh_state: Some(state),
                codex_state: None,
            });
        }
    }
}

// Native discovery can include user-level skills inherited by a project. Reading
// them is authorized by the current discovery snapshot, independently of CLI ownership.
pub(super) fn read_discovered_document(
    snapshot: &serde_json::Value,
    path: &str,
) -> Result<SkillDocumentInfo, String> {
    if !snapshot["contextIssue"].is_null() {
        return Err("DSH configuration changed. Refresh first.".into());
    }
    let row = snapshot["skills"].as_array().and_then(|rows| rows.iter().find(|row| {
        row["path"].as_str() == Some(path) && row["reason"].is_null()
    })).ok_or("Skill is no longer in DSH discovery. Refresh first.")?;
    let document = row["file"].as_str().ok_or("Invalid DSH skill file.")?;
    if fs::metadata(document).map_err(|error| error.to_string())?.len() > 256 * 1024 {
        return Err("Skill document exceeds preview limits.".into());
    }
    Ok(SkillDocumentInfo {
        plugin_version: None,
        source_directory: None,
        revision: tree_signature(Path::new(path)).map(|signature| document_diff::revision(&signature)),
        local_state: None,
        content: fs::read_to_string(document).map_err(|error| error.to_string())?,
        version: row["version"].as_str().map(str::to_owned),
    })
}

// Translate only the --agent value list. Source names, skill names and paths stay untouched.
pub(super) fn cli_args(args: &[String]) -> Vec<String> {
    let mut values = false;
    let mut seen = std::collections::BTreeSet::new();
    args.iter()
        .filter_map(|arg| {
            if arg.starts_with('-') {
                values = arg == "--agent" || arg == "-a";
                seen.clear();
                return Some(arg.clone());
            }
            if !values {
                return Some(arg.clone());
            }
            let id = if arg == ID { "universal" } else { arg };
            seen.insert(id.to_owned()).then(|| id.to_owned())
        })
        .collect()
}

#[tauri::command]
pub async fn upstream_dsh_settings(
    app: AppHandle,
    target: Target,
    context_key: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        inspect_context(&Engine::from_app(&app)?, &target, context_key.as_deref())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn upstream_dsh_open_configuration(
    app: AppHandle,
    target: Target,
    key: Option<String>,
    profile_document: Option<bool>,
    configuration_path: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_opener::OpenerExt;
        let snapshot = inspect(&Engine::from_app(&app)?, &target)?;
        let path = if let Some(selected_path) = configuration_path.as_deref() {
            snapshot["configurationFiles"]
                .as_array()
                .and_then(|files| files.iter().find(|file| file["path"] == selected_path))
                .and_then(|file| file["path"].as_str())
        } else {
            snapshot["configurations"]
            .as_array()
            .and_then(|rows| rows.iter().find(|row| row["key"].as_str() == key.as_deref()))
            .and_then(|row| {
                if profile_document == Some(true) {
                    row["path"].as_str()
                } else {
                    row["openPath"].as_str().or_else(|| row["path"].as_str())
                }
            })
        }
        .ok_or("DSH configuration changed. Refresh first.")?;
        app.opener()
            .open_path(path.to_owned(), None::<&str>)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod discovered_document_tests {
    use super::*;

    #[test]
    fn dsh_discovered_document_reads_inherited_file_but_requires_exact_current_membership() {
        let temp = TemporaryDirectory::new().unwrap();
        let skill = temp.0.join("home-skills/inherited");
        fs::create_dir_all(&skill).unwrap();
        let document = skill.join("SKILL.md");
        fs::write(&document, "---\nname: inherited\ndescription: Fixture\n---\nInherited body\n").unwrap();
        let path = skill.to_str().unwrap();
        let snapshot = serde_json::json!({"contextIssue":null,"skills":[{"path":path,"file":document,"reason":null,"inScope":false,"canSetInvocation":false,"canTrash":false}]});
        let read = read_discovered_document(&snapshot, path).unwrap();
        assert!(read.content.contains("Inherited body"));
        assert!(read.version.is_none());
        assert!(read.plugin_version.is_none());
        assert!(read.local_state.is_none());
        assert!(read_discovered_document(&snapshot, temp.0.to_str().unwrap()).is_err());
        assert!(read_discovered_document(&snapshot, &format!("{path}/../inherited")).is_err());
        let mut invalid = snapshot.clone();
        invalid["skills"][0]["reason"] = "Invalid DSH format".into();
        assert!(read_discovered_document(&invalid, path).is_err());
        let mut stale = snapshot.clone();
        stale["contextIssue"] = "Changed configuration".into();
        assert!(read_discovered_document(&stale, path).is_err());
        fs::remove_file(document).unwrap();
        assert!(read_discovered_document(&snapshot, path).is_err());
    }

    #[test]
    fn dsh_discovered_document_enforces_preview_size_and_utf8_limits() {
        let temp = TemporaryDirectory::new().unwrap();
        let document = temp.0.join("SKILL.md");
        let path = temp.0.to_str().unwrap();
        let snapshot = serde_json::json!({"contextIssue":null,"skills":[{"path":path,"file":document,"reason":null}]});
        fs::write(&document, vec![b'x'; 256 * 1024]).unwrap();
        assert_eq!(read_discovered_document(&snapshot, path).unwrap().content.len(), 256 * 1024);
        fs::write(&document, vec![b'x'; 256 * 1024 + 1]).unwrap();
        assert!(read_discovered_document(&snapshot, path).err().unwrap().contains("preview limits"));
        fs::write(&document, [0xff, 0xfe]).unwrap();
        assert!(read_discovered_document(&snapshot, path).is_err());
    }

    #[test]
    fn dsh_discovered_document_returns_declared_skill_version_without_plugin_version_or_file_writes() {
        let temp=TemporaryDirectory::new().unwrap();let document=temp.0.join("SKILL.md");
        let raw="---\nname: versioned\ndescription: Fixture\nmetadata:\n  version: 1.0\n---\nOriginal body\n";
        fs::write(&document,raw).unwrap();let path=temp.0.to_str().unwrap();
        let mut snapshot=serde_json::json!({"contextIssue":null,"skills":[{"path":path,"file":document,"reason":null,"version":"1.0","inScope":false}]});
        let read=read_discovered_document(&snapshot,path).unwrap();
        assert_eq!(read.version.as_deref(),Some("1.0"));assert!(read.plugin_version.is_none());assert_eq!(read.content,raw);
        for invalid in [serde_json::Value::Null,serde_json::json!(1.0),serde_json::json!({"major":1})] {
            snapshot["skills"][0]["version"]=invalid;
            let read=read_discovered_document(&snapshot,path).unwrap();assert!(read.version.is_none());assert!(read.plugin_version.is_none());
        }
        assert_eq!(fs::read_to_string(document).unwrap(),raw);
    }
}
