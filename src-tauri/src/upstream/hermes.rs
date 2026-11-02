//! Hermes inventory and native configuration. Skill lifecycle mutations remain CLI-owned.
use super::*;
use std::collections::BTreeSet;

#[derive(Default, Deserialize)]
pub(super) struct Configuration {
    pub directories: Vec<String>,
    pub bundled: Vec<String>,
    pub warnings: Vec<String>,
}
pub(super) fn configuration(engine: &Engine) -> Result<Configuration, String> {
    let hermes_home = engine.env_home("HERMES_HOME", ".hermes");
    if !hermes_home.join("config.yaml").exists()
        && !hermes_home.join("skills/.bundled_manifest").exists()
    {
        return Ok(Configuration::default());
    }
    let mut command = engine.command(&engine.node, &engine.home);
    command
        .arg(engine.resources.join("inspect-hermes-config.mjs"))
        .arg(&engine.home)
        .arg(hermes_home);
    let output = run_process(&mut command)?;
    if !output.success {
        return Ok(Configuration {
            warnings: vec!["Hermes skill directory configuration could not be inspected.".into()],
            ..Configuration::default()
        });
    }
    serde_json::from_str(&output.stdout)
        .map_err(|_| "Cannot inspect Hermes skill directories.".into())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillState {
    pub path: String,
    pub file: String,
    pub name: String,
    pub description: String,
    pub origin: String,
    pub in_scope: bool,
    pub enabled: bool,
    pub auto_load: bool,
    pub can_toggle: bool,
    pub can_preload: bool,
    pub reason: Option<String>,
    pub load_name: Option<String>,
    pub document_revision: String,
    #[serde(default)]
    pub version: Option<String>,
    pub cli_addressable: bool,
}
pub(super) fn inspect(engine: &Engine, target: &Target) -> Result<serde_json::Value, String> {
    target.directory(&engine.home)?;
    let mut command = engine.command(&engine.node, &engine.home);
    command
        .arg(engine.resources.join("inspect-hermes-config.mjs"))
        .arg(&engine.home)
        .arg(engine.env_home("HERMES_HOME", ".hermes"));
    if target.scope == "project" {
        command.arg(target.directory(&engine.home)?);
    }
    let output = run_process_with_timeout(&mut command, Duration::from_secs(20))?;
    if !output.success {
        return Err("Cannot inspect Hermes skill settings. Check config.yaml.".into());
    }
    serde_json::from_str(&output.stdout).map_err(|_| "Unsupported Hermes settings response.".into())
}
pub(super) fn augment_observed(
    engine: &Engine,
    target: &Target,
    inventory: &mut Inventory,
    observed: Result<serde_json::Value, String>,
) {
    let value = match observed {
        Ok(v) => v,
        Err(e) => {
            inventory.warnings.push(e);
            return;
        }
    };
    inventory.hermes = Some(value.clone());
    if let Some(warnings) = value["warnings"].as_array() {
        inventory.warnings.extend(
            warnings
                .iter()
                .filter_map(|s| s.as_str().map(str::to_owned)),
        );
    }
    if target.scope == "project" {
        if let Some(agent) = inventory.agents.iter_mut().find(|a| a.id == "hermes-agent") {
            if let Ok(project) = target.directory(&engine.home) {
                let shared = project.join(".agents/skills");
                if shared.is_dir() {
                    agent.additional_paths.push(shared.to_string_lossy().into());
                }
            }
        }
    }
    let Some(rows) = value["skills"].as_array() else {
        return;
    };
    for row in rows.iter().filter(|s| s["inScope"] == true) {
        let Ok(mut state) = serde_json::from_value::<SkillState>(row.clone()) else {
            continue;
        };
        if let Some(skill) = inventory
            .skills
            .iter_mut()
            .find(|s| s.path == state.path && s.name == state.name)
        {
            if !skill.agents.iter().any(|id| id == "hermes-agent") {
                skill.agents.push("hermes-agent".into());
            }
            if state.origin == "hub" {
                if skill.cli_managed {
                    skill.issue = Some(
                        "Hermes Hub and CLI ownership overlap. Review the source records.".into(),
                    );
                    state.can_toggle = false;
                    state.can_preload = false;
                } else {
                    skill.hermes_origin = Some("external".into());
                    skill.cli_agents.retain(|id| id != "hermes-agent");
                    if skill.cli_agents.is_empty() {
                        skill.updateable = false;
                    }
                }
            }
            if !state.cli_addressable && skill.hermes_origin.is_none() {
                skill.hermes_origin = Some("external".into());
            }
            skill.hermes_state = Some(state);
        } else {
            inventory.skills.push(Skill {
                name: state.name.clone(),
                path: state.path.clone(),
                description: state.description.clone(),
                agents: vec!["hermes-agent".into()],
                shared: false,
                source: None,
                source_url: None,
                source_type: None,
                plugin_name: None,
                issue: None,
                updateable: false,
                install_source: None,
                eve_locations: vec![],
                cli_managed: false,
                cli_agents: vec![],
                hermes_origin: Some(
                    if state.origin == "builtin" {
                        "builtin"
                    } else {
                        "external"
                    }
                    .into(),
                ),
                hermes_state: Some(state),
                pi_state: None,
                dsh_state: None,
                codex_state: None,
            });
        }
    }
}
struct ConfigLock(PathBuf);
impl Drop for ConfigLock {
    fn drop(&mut self) {
        let _ = fs::remove_dir(&self.0);
    }
}
fn save(
    engine: &Engine,
    target: &Target,
    change: serde_json::Value,
) -> Result<serde_json::Value, String> {
    target.directory(&engine.home)?;
    let object = change
        .as_object()
        .ok_or("Invalid Hermes settings request.")?;
    let allowed = [
        "kind",
        "changes",
        "revision",
        "externalDirs",
        "createDir",
        "projectDiscovery",
        "trustedProjects",
        "autoLoad",
        "file",
        "documentRevision",
        "enabled",
    ];
    if object.keys().any(|k| !allowed.contains(&k.as_str())) {
        return Err("Invalid Hermes settings fields.".into());
    }
    let input = serde_json::to_string(&change).map_err(|e| e.to_string())?;
    if input.len() > 1024 * 1024 {
        return Err("Hermes settings request exceeds the size limit.".into());
    }
    let root = engine.env_home("HERMES_HOME", ".hermes");
    if !root.is_absolute() {
        return Err("Hermes root must be absolute.".into());
    }
    let path = root.join("config.yaml");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let lock = root.join(".config.yaml.skills-space.lock");
    fs::create_dir(&lock).map_err(|_| "Hermes settings is being edited. Retry later.")?;
    let _lock = ConfigLock(lock);
    fn validate(path: &Path) -> Result<(), String> {
        if let Ok(m) = fs::symlink_metadata(path) {
            if !m.is_file() || m.file_type().is_symlink() {
                return Err("Hermes settings must be an independent regular file.".into());
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                if m.nlink() != 1 {
                    return Err("Hermes settings must be an independent regular file.".into());
                }
            }
        }
        Ok(())
    }
    validate(&path)?;
    let original = fs::read(&path).ok();
    let before = inspect(engine, target)?;
    if before["revision"] != change["revision"] || !change["revision"].is_string() {
        return Err("Hermes settings changed. Reload before saving.".into());
    }
    let mut command = engine.command(&engine.node, &engine.home);
    command
        .arg(engine.resources.join("prepare-hermes-settings.mjs"))
        .arg(&engine.home)
        .arg(&root)
        .arg(if target.scope == "project" {
            target
                .directory(&engine.home)?
                .to_string_lossy()
                .into_owned()
        } else {
            String::new()
        })
        .arg(input);
    let prepared = run_process_with_timeout(&mut command, Duration::from_secs(20))?;
    if !prepared.success {
        return Err(prepared.stderr);
    }
    let prepared: serde_json::Value =
        serde_json::from_str(&prepared.stdout).map_err(|_| "Cannot prepare Hermes settings.")?;
    if prepared["path"].as_str() != path.to_str() {
        return Err("Hermes settings path changed.".into());
    }
    let content = prepared["content"]
        .as_str()
        .ok_or("Invalid Hermes settings content.")?;
    validate(&path)?;
    if fs::read(&path).ok() != original {
        return Err("Hermes settings changed. Reload before saving.".into());
    }
    pi::write_bytes(&path, content.as_bytes())?;
    inspect(engine, target)
}
#[tauri::command]
pub async fn upstream_hermes_settings(
    app: AppHandle,
    target: Target,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || inspect(&Engine::from_app(&app)?, &target))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_hermes_save(
    app: AppHandle,
    target: Target,
    change: serde_json::Value,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        save(&Engine::from_app(&app)?, &target, change)
    })
    .await
    .map_err(|e| e.to_string())?
}

// Match Hermes category discovery, prune support/state directories and bound symlink traversal.
pub(super) fn paths(root: &Path, warnings: &mut Vec<String>) -> Vec<PathBuf> {
    fn visit(
        path: &Path,
        depth: usize,
        seen: &mut BTreeSet<PathBuf>,
        count: &mut usize,
        result: &mut Vec<PathBuf>,
        warnings: &mut Vec<String>,
    ) {
        if depth > 32 || *count >= 10000 || result.len() >= 2000 {
            warnings.push(format!(
                "{}: Hermes skill discovery exceeds inspection limits.",
                path.display()
            ));
            return;
        }
        let actual = match fs::canonicalize(path) {
            Ok(p) => p,
            Err(_) => return,
        };
        if !seen.insert(actual) {
            return;
        }
        let skill = path.join("SKILL.md").is_file();
        if skill {
            result.push(path.to_path_buf());
        }
        let entries = match fs::read_dir(path) {
            Ok(entries) => entries,
            Err(e) => {
                warnings.push(format!("{}: {e}", path.display()));
                return;
            }
        };
        let mut entries: Vec<_> = entries.filter_map(Result::ok).collect();
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            *count += 1;
            if *count > 10000 {
                warnings.push(format!(
                    "{}: Hermes skill discovery exceeds inspection limits.",
                    path.display()
                ));
                break;
            }
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if matches!(
                name.as_ref(),
                ".git"
                    | ".github"
                    | ".hub"
                    | ".archive"
                    | ".curator_backups"
                    | ".locks"
                    | ".venv"
                    | "venv"
                    | "node_modules"
                    | "site-packages"
                    | "__pycache__"
                    | ".tox"
                    | ".nox"
                    | ".pytest_cache"
                    | ".mypy_cache"
                    | ".ruff_cache"
            ) || skill
                && matches!(
                    name.as_ref(),
                    "references" | "templates" | "assets" | "scripts"
                )
            {
                continue;
            }
            if entry.path().is_dir() {
                visit(&entry.path(), depth + 1, seen, count, result, warnings);
            } else if entry.path().is_symlink() && !entry.path().exists() {
                warnings.push(format!("Broken link: {}", entry.path().display()));
            }
        }
    }
    let mut result = Vec::new();
    if root.is_dir() {
        visit(root, 0, &mut BTreeSet::new(), &mut 0, &mut result, warnings);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{engine, global};
    fn skill(path: &Path, name: &str) {
        fs::create_dir_all(path).unwrap();
        fs::write(
            path.join("SKILL.md"),
            format!(
                "---\nname: {name}\ndescription: Hermes inventory fixture\n---\nOriginal content\n"
            ),
        )
        .unwrap();
    }
    #[test]
    fn hermes_categories_external_configuration_and_cli_adoption_boundaries() {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        let hermes = home.join(".hermes");
        let root = hermes.join("skills");
        let builtin = root.join("development/bundled-demo");
        skill(&builtin, "bundled-demo");
        skill(&root.join("manual"), "manual");
        skill(&root.join(".hub/quarantine/hidden"), "hidden");
        skill(&builtin.join("references/example"), "example");
        let external = hermes.join("external");
        skill(&external.join("category/external-demo"), "external-demo");
        let created = hermes.join("created");
        skill(&created.join("created-demo"), "created-demo");
        fs::write(
            root.join(".bundled_manifest"),
            "bundled-demo:fixture-hash\n",
        )
        .unwrap();
        fs::write(hermes.join("config.yaml"), "skills:\n  create_dir: created\n  external_dirs:\n    - external\n    - '${HOME}/.hermes/external'\n    - '~/.hermes/skills'\n    - missing\n").unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&root, root.join("cycle")).unwrap();
            std::os::unix::fs::symlink(hermes.join("missing"), root.join("broken")).unwrap();
        }
        let e = engine(&home);
        let config = configuration(&e).unwrap();
        assert_eq!(config.directories.len(), 2);
        let inventory = e.inventory(&global()).unwrap();
        assert_eq!(inventory.skills.len(), 4);
        let bundled = inventory
            .skills
            .iter()
            .find(|s| s.name == "bundled-demo")
            .unwrap();
        assert_eq!(bundled.hermes_origin.as_deref(), Some("builtin"));
        assert!(!bundled.cli_managed && bundled.cli_agents.is_empty() && !bundled.updateable);
        let external_skill = inventory
            .skills
            .iter()
            .find(|s| s.name == "external-demo")
            .unwrap();
        assert_eq!(external_skill.hermes_origin.as_deref(), Some("external"));
        assert_eq!(external_skill.agents, vec!["hermes-agent"]);
        let before = fs::read(builtin.join("SKILL.md")).unwrap();
        let mut op = crate::upstream::tests::addition(&builtin, global(), false);
        op.skills = vec!["bundled-demo".into()];
        op.agents = vec!["hermes-agent".into(), "claude-code".into()];
        op.action = "remove".into();
        assert!(removal_plan(&e, &op, &inventory).is_err());
        assert!(apply(&e, &op).is_err());
        assert_eq!(fs::read(builtin.join("SKILL.md")).unwrap(), before);
        // Original list cannot see the categorized bundle; remove is a no-op there.
        let listed = e
            .cli(
                &["list".into(), "--global".into(), "--json".into()],
                &global(),
            )
            .unwrap();
        let listed: Vec<Skill> = serde_json::from_str(&listed.stdout).unwrap();
        assert!(!listed.iter().any(|s| s.name == "bundled-demo"));
        e.cli(
            &[
                "remove".into(),
                "bundled-demo".into(),
                "--global".into(),
                "--agent".into(),
                "hermes-agent".into(),
                "-y".into(),
            ],
            &global(),
        )
        .unwrap();
        assert_eq!(fs::read(builtin.join("SKILL.md")).unwrap(), before);
        // add creates a new flat installation; it does not adopt or alter the bundle.
        op.action = "add".into();
        let result = apply(&e, &op).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{}",
            result.logs
        );
        assert_eq!(fs::read(builtin.join("SKILL.md")).unwrap(), before);
        assert!(root.join("bundled-demo/SKILL.md").is_file());
        let inventory = e.inventory(&global()).unwrap();
        let nested = inventory
            .skills
            .iter()
            .find(|s| s.path == fs::canonicalize(&builtin).unwrap().to_string_lossy())
            .unwrap();
        assert!(nested.source.is_none() && !nested.cli_managed && !nested.updateable);
        let flat = inventory
            .skills
            .iter()
            .find(|s| {
                s.name == "bundled-demo"
                    && s.path != fs::canonicalize(&builtin).unwrap().to_string_lossy()
            })
            .unwrap();
        assert!(flat.cli_managed && flat.cli_agents.contains(&"hermes-agent".into()));
        fs::write(
            hermes.join("config.yaml"),
            "skills:\n  external_dirs:\n    - external\n    - ~/.agents/skills\n",
        )
        .unwrap();
        // Ordinary flat Hermes installations retain original copy/link and uninstall behavior,
        // including an external alias of the shared root in the removal impact plan.
        let managed_source = f.0.join("managed-source");
        skill(&managed_source, "managed-demo");
        for copy in [false, true] {
            let mut ordinary = crate::upstream::tests::addition(&managed_source, global(), copy);
            ordinary.skills = vec!["managed-demo".into()];
            ordinary.agents = vec!["hermes-agent".into(), "claude-code".into(), "codex".into()];
            let installed = apply(&e, &ordinary).unwrap();
            assert!(
                installed.items.iter().all(|i| i.status == "complete"),
                "{}",
                installed.logs
            );
            assert_eq!(
                fs::symlink_metadata(root.join("managed-demo"))
                    .unwrap()
                    .is_symlink(),
                !copy
            );
            ordinary.action = "remove".into();
            let removed = apply(&e, &ordinary).unwrap();
            assert!(
                removed.items.iter().all(|i| i.status == "complete"),
                "{}",
                serde_json::to_string(&removed).unwrap()
            );
            assert!(!root.join("managed-demo").exists());
            assert_eq!(fs::read(builtin.join("SKILL.md")).unwrap(), before);
        }
        let project = f.0.join("project");
        skill(
            &project.join(".hermes/skills/category/project-demo"),
            "project-demo",
        );
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        let project_inventory = e.inventory(&target).unwrap();
        assert_eq!(
            project_inventory.skills.len(),
            1,
            "global extra directories never leak into project scope"
        );
        assert_eq!(project_inventory.skills[0].name, "project-demo");
    }
    #[test]
    fn hermes_invalid_config_is_reported_without_disclosing_other_values() {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        skill(&home.join(".hermes/skills/category/keep"), "keep");
        fs::write(
            home.join(".hermes/config.yaml"),
            "secret: PRIVATE_VALUE\nskills: [unterminated",
        )
        .unwrap();
        let inventory = engine(&home).inventory(&global()).unwrap();
        assert_eq!(inventory.skills.len(), 1);
        assert!(inventory
            .warnings
            .iter()
            .any(|w| w.contains("configuration")));
        assert!(inventory
            .warnings
            .iter()
            .all(|w| !w.contains("PRIVATE_VALUE")));
    }
    #[test]
    fn settings_save_preserves_unknown_yaml_and_rejects_stale_versions() {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        let root = home.join(".hermes");
        skill(&root.join("skills/native"), "native");
        let config = root.join("config.yaml");
        fs::write(&config,"# retained\nsecret: KEEP_PRIVATE\nskills:\n  platform_disabled:\n    telegram: [native]\n").unwrap();
        let e = engine(&home);
        let before = inspect(&e, &global()).unwrap();
        let change = serde_json::json!({"kind":"settings","revision":before["revision"],"externalDirs":[],"createDir":"created","projectDiscovery":false,"trustedProjects":[],"autoLoad":["native"]});
        let bytes = fs::read(root.join("skills/native/SKILL.md")).unwrap();
        let saved = save(&e, &global(), change.clone()).unwrap();
        assert_eq!(saved["projectDiscovery"], false);
        assert_eq!(saved["autoLoad"][0], "native");
        let yaml = fs::read_to_string(&config).unwrap();
        assert!(
            yaml.contains("# retained")
                && yaml.contains("KEEP_PRIVATE")
                && yaml.contains("telegram")
        );
        assert!(save(&e, &global(), change).unwrap_err().contains("changed"));
        let row = &saved["skills"][0];
        let off=save(&e,&global(),serde_json::json!({"kind":"toggle","revision":saved["revision"],"file":row["file"],"documentRevision":row["documentRevision"],"enabled":false})).unwrap();
        assert_eq!(off["skills"][0]["enabled"], false);
        assert_eq!(
            fs::read(root.join("skills/native/SKILL.md")).unwrap(),
            bytes
        );
        assert!(!root.join("skills/.hub/lock.json").exists());
    }
    #[test]
    fn batch_save_is_all_or_nothing_and_persists_all_states() {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        let root = home.join(".hermes");
        skill(&root.join("skills/one"), "one");
        skill(&root.join("skills/category/two"), "two");
        let config = root.join("config.yaml");
        fs::write(
            &config,
            "# retained\nmodel: unchanged\nskills:\n  custom: keep\n",
        )
        .unwrap();
        let e = engine(&home);
        let snapshot = inspect(&e, &global()).unwrap();
        let changes:Vec<_>=snapshot["skills"].as_array().unwrap().iter().flat_map(|r|[
            serde_json::json!({"kind":"toggle","file":r["file"],"documentRevision":r["documentRevision"],"enabled":false}),
            serde_json::json!({"kind":"preload","file":r["file"],"documentRevision":r["documentRevision"],"enabled":true})]).collect();
        let mut invalid = changes.clone();
        invalid.last_mut().unwrap()["documentRevision"] = serde_json::json!("stale");
        let before = fs::read(&config).unwrap();
        assert!(save(
            &e,
            &global(),
            serde_json::json!({"kind":"batch","revision":snapshot["revision"],"changes":invalid})
        )
        .is_err());
        assert_eq!(fs::read(&config).unwrap(), before);
        let saved = save(
            &e,
            &global(),
            serde_json::json!({"kind":"batch","revision":snapshot["revision"],"changes":changes}),
        )
        .unwrap();
        assert!(saved["skills"]
            .as_array()
            .unwrap()
            .iter()
            .all(|r| r["enabled"] == false && r["autoLoad"] == true));
        assert_eq!(
            inspect(&engine(&home), &global()).unwrap()["revision"],
            saved["revision"]
        );
        let mut last = saved.clone();
        for preload in [false, true] {
            let changes:Vec<_>=last["skills"].as_array().unwrap().iter().map(|r|serde_json::json!({"kind":"preload","file":r["file"],"documentRevision":r["documentRevision"],"enabled":preload})).collect();
            last = save(
                &e,
                &global(),
                serde_json::json!({"kind":"batch","revision":last["revision"],"changes":changes}),
            )
            .unwrap();
            assert!(last["skills"]
                .as_array()
                .unwrap()
                .iter()
                .all(|r| r["enabled"] == false && r["autoLoad"] == preload));
        }

        let content = fs::read_to_string(&config).unwrap();
        assert!(
            content.contains("# retained")
                && content.contains("model: unchanged")
                && content.contains("custom: keep")
        );
        assert!(!root.join(".config.yaml.skills-space.lock").exists());
    }
    #[test]
    fn project_shared_skills_are_observed_before_trust_without_importing_global_installs() {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        skill(&home.join(".hermes/skills/global"), "global");
        let project = home.join("project");
        skill(&project.join(".agents/skills/local"), "local");
        fs::create_dir(project.join(".git")).unwrap();
        let e = engine(&home);
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        let inventory = e.inventory(&target).unwrap();
        let skill = inventory.skills.iter().find(|s| s.name == "local").unwrap();
        assert!(skill.agents.contains(&"hermes-agent".into()));
        assert_eq!(
            skill.hermes_state.as_ref().unwrap().reason.as_deref(),
            Some("untrusted")
        );
        assert!(!inventory.skills.iter().any(|s| s.name == "global"));
        let before = inspect(&e, &target).unwrap();
        let saved=save(&e,&target,serde_json::json!({"kind":"settings","revision":before["revision"],"externalDirs":[],"createDir":"","projectDiscovery":true,"trustedProjects":[project],"autoLoad":[]})).unwrap();
        assert_eq!(saved["projectTrusted"], true);
        assert_eq!(saved["skills"][0]["reason"], "scanUnverified");
    }
}
