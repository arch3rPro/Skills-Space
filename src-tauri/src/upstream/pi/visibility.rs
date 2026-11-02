//! Application-owned visibility preferences; never mutate skill contents or CLI locks.
use super::*;
const POLICY: &str = "skills-space-visibility.json";
const EXTENSION: &str = "skills-space-visibility.js";
fn previous_owned_extension(bytes: &[u8]) -> bool {
    use sha2::{Digest, Sha256};
    matches!(
        format!("{:x}", Sha256::digest(bytes)).as_str(),
        "304dd789f79a58f83c9e080a28d3b8ec8ec6298c180c53f622d17c452e502e1a"
            | "9f20c826d09e0ff9534b06f1fee7737ddf4544eaff26890fb8773e1cde0e4df9"
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VisibilityChange {
    target: Target,
    file: String,
    revision: String,
    dependencies: Vec<Dependency>,
    manual_only: Option<bool>,
}

pub(super) fn regular_destination(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if !metadata.is_file() || metadata.file_type().is_symlink() => {
            Err("Visibility configuration or extension is linked or is not a regular file.".into())
        }
        #[cfg(unix)]
        Ok(metadata) => {
            use std::os::unix::fs::MetadataExt;
            if metadata.nlink() != 1 {
                return Err("Visibility configuration or extension is hard-linked.".into());
            }
            Ok(())
        }
        #[cfg(not(unix))]
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

pub(super) fn upgrade_owned_extension(engine: &Engine, agent: &Path) -> Result<(), String> {
    let path = agent.join("extensions").join(EXTENSION);
    if !path.exists() {
        return Ok(());
    }
    regular_destination(&path)?;
    let _guard = SettingsLock::acquire(&path)?;
    let installed = fs::read(&path).map_err(|e| e.to_string())?;
    let source = fs::read(engine.resources.join("pi-visibility-extension.mjs"))
        .map_err(|e| e.to_string())?;
    if installed == source {
        return Ok(());
    }
    if !previous_owned_extension(&installed) {
        return Err("The visibility extension has local edits. Review it before migrating native invocation preferences.".into());
    }
    write_bytes(&path, &source)
}

fn change(engine: &Engine, request: VisibilityChange) -> Result<Snapshot, String> {
    change_many(
        engine,
        &request.target,
        &[(request.file, request.revision)],
        &request.dependencies,
        request.manual_only,
    )
}
pub(super) fn change_many(
    engine: &Engine,
    target: &Target,
    files: &[(String, String)],
    dependencies: &[Dependency],
    manual_only: Option<bool>,
) -> Result<Snapshot, String> {
    let before = inspect(engine, target)?;
    let agent_dir = PathBuf::from(&before.agent_directory);
    let extensions = agent_dir.join("extensions");
    if manual_only.is_some()
        && fs::symlink_metadata(&extensions)
            .is_ok_and(|metadata| !metadata.is_dir() || metadata.file_type().is_symlink())
    {
        return Err("Pi extensions directory is linked or is not a directory.".into());
    }
    let extension = extensions.join(EXTENSION);
    let path = Path::new(&before.path)
        .parent()
        .ok_or("Invalid Pi configuration path.")?
        .join(POLICY);
    if fs::symlink_metadata(path.parent().ok_or("Invalid visibility settings path.")?)
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
    {
        return Err(
            "Pi visibility settings directory is linked. Review its original scope before saving."
                .into(),
        );
    }
    regular_destination(&path)?;
    if manual_only.is_some() {
        regular_destination(&extension)?;
    }
    let _policy_lock = SettingsLock::acquire(&path)?;
    let _extension_lock = if manual_only.is_some() {
        Some(SettingsLock::acquire(&extension)?)
    } else {
        None
    };
    let current = inspect(engine, target)?;
    if current.dependencies != dependencies {
        return Err("Pi settings or visibility preferences changed. Refresh before saving.".into());
    }
    let selected: std::collections::HashMap<_, _> = files
        .iter()
        .map(|(file, revision)| (file.as_str(), revision.as_str()))
        .collect();
    let items: Vec<_> = current
        .skills
        .iter()
        .filter(|item| selected.contains_key(item.file.as_str()))
        .collect();
    if items.len() != selected.len()
        || items.iter().any(|item| {
            !item.managed
                || !item.can_set_visibility
                || selected[item.file.as_str()] != item.document_revision
        })
    {
        return Err("Visibility can only configure an unchanged Pi skill in the current scope. Refresh the list.".into());
    }
    if manual_only.is_some() && !current.visibility_extension_allowed {
        return Err(
            "The visibility extension is excluded by Pi settings. Enable it in Pi before saving."
                .into(),
        );
    }
    let source = fs::read(engine.resources.join("pi-visibility-extension.mjs"))
        .map_err(|error| error.to_string())?;
    let installed = fs::read(&extension).ok();
    let previous = installed
        .as_ref()
        .is_some_and(|bytes| previous_owned_extension(bytes));
    if manual_only.is_some()
        && installed.as_ref().is_some_and(|bytes| bytes != &source)
        && !previous
    {
        return Err("The Skills Space visibility extension was changed outside the application. Review it before saving.".into());
    }
    let mut policy = if path.exists() {
        settings(&path)?
    } else {
        serde_json::json!({"version":1,"hiddenSkills":[]})
    };
    let entries = policy["hiddenSkills"]
        .as_array_mut()
        .ok_or("Invalid visibility settings.")?;
    entries.retain(|entry| {
        entry["file"]
            .as_str()
            .is_none_or(|file| !selected.contains_key(file))
    });
    if let Some(hidden) = manual_only {
        for item in &items {
            entries.push(serde_json::json!({"file":item.file,"name":item.name,"hidden":hidden}));
        }
    }
    if entries.len() > 10000 {
        return Err("Visibility settings exceed the skill count limit.".into());
    }
    let mut policy_bytes = serde_json::to_vec_pretty(&policy).map_err(|error| error.to_string())?;
    policy_bytes.push(b'\n');
    if policy_bytes.len() > 1024 * 1024 {
        return Err("Visibility settings exceed the editing size limit.".into());
    }
    // Deploy only our missing entry. A failed policy write leaves an inert extension;
    // an existing entry is never silently replaced or adopted.
    if manual_only.is_some() && (!extension.exists() || previous) {
        write_bytes(&extension, &source)?;
    }
    write_bytes(&path, &policy_bytes)?;
    let after = inspect(engine, target)?;
    if selected.keys().any(|file| {
        !after.skills.iter().any(|item| {
            item.file == *file
                && manual_only.is_none_or(|hidden| {
                    item.manual_only == hidden
                        && item.visibility_hidden == hidden
                        && !item.visibility_pending
                })
                && (manual_only.is_some() || !item.can_restore_default)
        })
    }) {
        return Err(
            "Visibility preferences could not be verified. Refresh and review Pi settings.".into(),
        );
    }
    Ok(after)
}

#[tauri::command]
pub async fn upstream_pi_visibility(
    app: AppHandle,
    request: VisibilityChange,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|error| error.to_string())?;
        change(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{engine, global};
    fn fixture() -> (TemporaryDirectory, Engine, PathBuf) {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let skill = home.join(".agents/skills/managed/SKILL.md");
        fs::create_dir_all(skill.parent().unwrap()).unwrap();
        fs::write(
            &skill,
            "---\nname: managed\ndescription: Visibility fixture\n---\nKeep these skill bytes.\n",
        )
        .unwrap();
        let engine = engine(&home);
        write_settings(
            &home.join(".agents/.skill-lock.json"),
            &serde_json::json!({"version":3,"skills":{"managed":{"source":"fixture/repo"}}}),
        )
        .unwrap();
        write_settings(
            &home.join(".pi/agent/trust.json"),
            &serde_json::json!({dunce::canonicalize(&home).unwrap().to_string_lossy().to_string():true}),
        )
        .unwrap();
        (root, engine, skill)
    }
    fn request(snapshot: Snapshot, hidden: bool) -> VisibilityChange {
        named_request(snapshot, "managed", hidden)
    }
    fn named_request(snapshot: Snapshot, name: &str, hidden: bool) -> VisibilityChange {
        let item = snapshot
            .skills
            .iter()
            .find(|item| item.name == name)
            .unwrap();
        VisibilityChange {
            target: snapshot.target,
            file: item.file.clone(),
            revision: item.document_revision.clone(),
            dependencies: snapshot.dependencies,
            manual_only: Some(hidden),
        }
    }
    fn native_change(e: &Engine, request: VisibilityChange) -> Result<Snapshot, String> {
        native::change(
            e,
            native::NativeChange {
                target: request.target,
                file: request.file,
                revision: request.revision,
                dependencies: request.dependencies,
                mode: if request.manual_only == Some(true) {
                    "manual"
                } else {
                    "auto"
                }
                .into(),
            },
        )
    }
    #[test]
    fn managed_visibility_preserves_shared_skill_settings_and_locks_across_restart() {
        let (_root, e, skill) = fixture();
        let original = fs::read(&skill).unwrap();
        let settings_path = e.home.join(".pi/agent/settings.json");
        write_settings(
            &settings_path,
            &serde_json::json!({"future":{"keep":true},"enableSkillCommands":true}),
        )
        .unwrap();
        let config = fs::read(&settings_path).unwrap();
        let lock = e.home.join(".agents/.skill-lock.json");
        fs::write(
            &lock,
            r#"{"version":3,"skills":{"managed":{"source":"fixture/repo"}}}"#,
        )
        .unwrap();
        let after = change(&e, request(inspect(&e, &global()).unwrap(), true)).unwrap();
        let item = after
            .skills
            .iter()
            .find(|item| item.name == "managed")
            .unwrap();
        assert!(item.manual_only && item.can_set_visibility && !item.visibility_pending);
        let restarted = engine(&e.home);
        assert!(
            inspect(&restarted, &global())
                .unwrap()
                .skills
                .iter()
                .find(|item| item.name == "managed")
                .unwrap()
                .manual_only
        );
        let restored = change(
            &restarted,
            request(inspect(&restarted, &global()).unwrap(), false),
        )
        .unwrap();
        assert!(
            !restored
                .skills
                .iter()
                .find(|item| item.name == "managed")
                .unwrap()
                .manual_only
        );
        assert_eq!(fs::read(&skill).unwrap(), original);
        assert_eq!(fs::read(&settings_path).unwrap(), config);
        assert_eq!(
            fs::read_to_string(&lock).unwrap(),
            r#"{"version":3,"skills":{"managed":{"source":"fixture/repo"}}}"#
        );
    }
    #[test]
    fn stale_policy_document_and_modified_extension_are_rejected() {
        let (_root, e, skill) = fixture();
        let stale = request(inspect(&e, &global()).unwrap(), true);
        let policy = e.home.join(".pi/agent").join(POLICY);
        write_settings(
            &policy,
            &serde_json::json!({"version":1,"hiddenSkills":[],"future":true}),
        )
        .unwrap();
        assert!(change(&e, stale).unwrap_err().contains("changed"));
        let stale = request(inspect(&e, &global()).unwrap(), true);
        fs::write(&skill, "---\nname: managed\ndescription: Changed\n---\n").unwrap();
        assert!(change(&e, stale).unwrap_err().contains("unchanged"));
        let extension = e.home.join(".pi/agent/extensions").join(EXTENSION);
        fs::write(&extension, "// user-owned extension\n").unwrap();
        assert!(change(&e, request(inspect(&e, &global()).unwrap(), true))
            .unwrap_err()
            .contains("outside"));
        assert_eq!(
            fs::read_to_string(&extension).unwrap(),
            "// user-owned extension\n"
        );
        fs::remove_file(&extension).unwrap();
        fs::write(
            &skill,
            "---\nname: managed\ndescription: Manual source\ndisable-model-invocation: true\n---\n",
        )
        .unwrap();
        let original = fs::read(&skill).unwrap();
        let after = change(&e, request(inspect(&e, &global()).unwrap(), false)).unwrap();
        assert!(!after.skills[0].manual_only && after.skills[0].source_manual_only);
        assert_eq!(fs::read(&skill).unwrap(), original);
        fs::write(&policy, "broken JSON").unwrap();
        assert!(inspect(&e, &global()).is_err());
    }
    #[test]
    fn excluded_extension_and_project_preferences_do_not_modify_global_policy() {
        let (_root, e, _skill) = fixture();
        let config = e.home.join(".pi/agent/settings.json");
        write_settings(
            &config,
            &serde_json::json!({"extensions":["!skills-space-visibility.js"]}),
        )
        .unwrap();
        assert!(change(&e, request(inspect(&e, &global()).unwrap(), true))
            .unwrap_err()
            .contains("excluded"));
        write_settings(&config, &serde_json::json!({})).unwrap();
        change(&e, request(inspect(&e, &global()).unwrap(), true)).unwrap();
        let global_policy = fs::read(e.home.join(".pi/agent").join(POLICY)).unwrap();
        let project = e.home.join("project");
        let file = project.join(".agents/skills/managed/SKILL.md");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(
            &file,
            "---\nname: managed\ndescription: Project fixture\n---\n",
        )
        .unwrap();
        fs::create_dir_all(project.join(".git")).unwrap();
        write_settings(
            &project.join("skills-lock.json"),
            &serde_json::json!({"version":1,"skills":{"managed":{"source":"fixture/repo"}}}),
        )
        .unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        let after = change(&e, request(inspect(&e, &target).unwrap(), true)).unwrap();
        assert!(
            after
                .skills
                .iter()
                .find(|item| item.name == "managed")
                .unwrap()
                .manual_only
        );
        assert!(project.join(".pi").join(POLICY).exists());
        assert_eq!(
            fs::read(e.home.join(".pi/agent").join(POLICY)).unwrap(),
            global_policy
        );
    }
    #[cfg(unix)]
    #[test]
    fn project_link_can_override_global_visibility_without_changing_global_preferences() {
        let (_root, e, skill) = fixture();
        change(&e, request(inspect(&e, &global()).unwrap(), true)).unwrap();
        let global_policy = fs::read(e.home.join(".pi/agent").join(POLICY)).unwrap();
        let project = e.home.join("linked-project");
        fs::create_dir_all(project.join(".agents/skills")).unwrap();
        fs::create_dir_all(project.join(".git")).unwrap();
        write_settings(
            &project.join("skills-lock.json"),
            &serde_json::json!({"version":1,"skills":{"managed":{"source":"fixture/repo"}}}),
        )
        .unwrap();
        std::os::unix::fs::symlink(
            skill.parent().unwrap(),
            project.join(".agents/skills/managed"),
        )
        .unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        assert!(inspect(&e, &target).unwrap().skills[0].manual_only);
        let after = change(&e, request(inspect(&e, &target).unwrap(), false)).unwrap();
        assert!(!after.skills[0].manual_only);
        assert_eq!(
            fs::read(e.home.join(".pi/agent").join(POLICY)).unwrap(),
            global_policy
        );
        assert!(inspect(&e, &global()).unwrap().skills[0].manual_only);
        let original = fs::read(&skill).unwrap();
        let mut reset = request(inspect(&e, &target).unwrap(), false);
        reset.manual_only = None;
        let reset = change(&e, reset).unwrap();
        assert!(reset.skills[0].manual_only);
        assert!(!reset.skills[0].can_restore_default);
        assert_eq!(
            fs::read(e.home.join(".pi/agent").join(POLICY)).unwrap(),
            global_policy
        );
        assert_eq!(fs::read(&skill).unwrap(), original);
        let restarted = engine(&e.home);
        let reset = inspect(&restarted, &target).unwrap();
        assert!(reset.skills[0].manual_only && !reset.skills[0].can_restore_default);
        let disabled = super::super::toggle(
            &e,
            Toggle {
                target: target.clone(),
                file: reset.skills[0].file.clone(),
                dependencies: reset.dependencies,
                enabled: false,
            },
        )
        .unwrap();
        assert!(!disabled.skills[0].enabled && disabled.skills[0].in_scope);
        let enabled = super::super::toggle(
            &e,
            Toggle {
                target,
                file: disabled.skills[0].file.clone(),
                dependencies: disabled.dependencies,
                enabled: true,
            },
        )
        .unwrap();
        assert!(enabled.skills[0].enabled && enabled.skills[0].in_scope);
        assert_eq!(fs::read(&skill).unwrap(), original);
    }
    #[cfg(unix)]
    #[test]
    fn linked_or_hardlinked_configuration_and_extension_paths_are_not_written() {
        let (_root, e, _skill) = fixture();
        let agent = e.home.join(".pi/agent");
        fs::create_dir_all(&agent).unwrap();
        let outside = e.home.join("outside.json");
        fs::write(&outside, r#"{"version":1,"hiddenSkills":[]}"#).unwrap();
        std::os::unix::fs::symlink(&outside, agent.join(POLICY)).unwrap();
        assert!(change(&e, request(inspect(&e, &global()).unwrap(), true))
            .unwrap_err()
            .contains("linked"));
        fs::remove_file(agent.join(POLICY)).unwrap();
        fs::hard_link(&outside, agent.join(POLICY)).unwrap();
        assert!(change(&e, request(inspect(&e, &global()).unwrap(), true))
            .unwrap_err()
            .contains("hard-linked"));
        fs::remove_file(agent.join(POLICY)).unwrap();
        let external = e.home.join("external-extensions");
        fs::create_dir_all(&external).unwrap();
        std::os::unix::fs::symlink(&external, agent.join("extensions")).unwrap();
        assert!(change(&e, request(inspect(&e, &global()).unwrap(), true))
            .unwrap_err()
            .contains("directory is linked"));
        assert_eq!(
            fs::read_to_string(&outside).unwrap(),
            r#"{"version":1,"hiddenSkills":[]}"#
        );
        assert!(!external.join(EXTENSION).exists());
    }
    #[test]
    fn native_sources_use_internal_fields_and_preserve_unrelated_files() {
        let (_root, e, _shared) = fixture();
        let agent = e.home.join(".pi/agent");
        let extra = e.home.join("extra");
        let package = agent.join("fixture-package");
        let source = |base: &Path, name: &str| {
            let file = base.join(name).join("SKILL.md");
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(&file,format!("---\n# Preserve this comment\nname: {name}\ndescription: Read-only source fixture\nfuture: [keep]\n---\nBody unchanged\n")).unwrap();
            file
        };
        let native = source(&agent.join("skills"), "native");
        let extra_file = source(&extra, "extra");
        let package_file = source(&package.join("skills"), "packaged");
        let markdown = extra.join("standalone.md");
        fs::write(
            &markdown,
            "---\nname: standalone\ndescription: Independent markdown\n---\nPreserve markdown\n",
        )
        .unwrap();
        let manifest = package.join("package.json");
        fs::write(
            &manifest,
            r#"{"name":"fixture-package","version":"1.0.0","pi":{"skills":["skills"]}}"#,
        )
        .unwrap();
        let config = agent.join("settings.json");
        write_settings(&config,&serde_json::json!({"skills":[extra.to_string_lossy()],"packages":[{"source":"./fixture-package","extensions":[],"future":true}],"future":"keep"})).unwrap();
        let paths = [native, extra_file, markdown, package_file, manifest, config];
        let originals: Vec<_> = paths.iter().map(|path| fs::read(path).unwrap()).collect();
        for name in ["native", "extra", "standalone", "packaged"] {
            let before = inspect(&e, &global()).unwrap();
            let item = before.skills.iter().find(|item| item.name == name).unwrap();
            assert!(item.can_set_visibility && !item.cli_addressable);
            let after = native_change(&e, named_request(before, name, true)).unwrap();
            assert!(
                after
                    .skills
                    .iter()
                    .find(|item| item.name == name)
                    .unwrap()
                    .manual_only
            );
            let restarted = engine(&e.home);
            assert!(
                inspect(&restarted, &global())
                    .unwrap()
                    .skills
                    .iter()
                    .find(|item| item.name == name)
                    .unwrap()
                    .manual_only
            );
            let restored = native_change(
                &e,
                named_request(inspect(&e, &global()).unwrap(), name, false),
            )
            .unwrap();
            assert!(
                !restored
                    .skills
                    .iter()
                    .find(|item| item.name == name)
                    .unwrap()
                    .manual_only
            );
        }
        for (path, original) in paths.iter().zip(originals) {
            if path
                .file_name()
                .is_some_and(|name| name == "SKILL.md" || name == "standalone.md")
            {
                let after = fs::read_to_string(path).unwrap();
                assert!(after.contains("disable-model-invocation: false"));
                assert_eq!(
                    after.replace("disable-model-invocation: false\n", ""),
                    String::from_utf8(original).unwrap()
                );
            } else {
                assert_eq!(fs::read(path).unwrap(), original);
            }
        }
    }
    #[test]
    fn package_delta_visibility_is_independent_from_loading_and_parent_scope() {
        let (_root, e, _skill) = fixture();
        let agent = e.home.join(".pi/agent");
        let package = agent.join("package");
        let file = package.join("skills/delta/SKILL.md");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(
            &file,
            "---\nname: delta\ndescription: Delta skill\n---\nKeep body\n",
        )
        .unwrap();
        fs::write(
            package.join("package.json"),
            r#"{"pi":{"skills":["skills"]}}"#,
        )
        .unwrap();
        write_settings(
            &agent.join("settings.json"),
            &serde_json::json!({"packages":[{"source":"./package"}]}),
        )
        .unwrap();
        let project = e.home.join("project");
        fs::create_dir_all(project.join(".git")).unwrap();
        write_settings(
            &project.join("skills-lock.json"),
            &serde_json::json!({"version":1,"skills":{"managed":{"source":"fixture/repo"}}}),
        )
        .unwrap();
        let project_config = project.join(".pi/settings.json");
        write_settings(&project_config,&serde_json::json!({"packages":[{"source":package.to_string_lossy(),"autoload":false,"skills":["+skills/delta/SKILL.md"]}]})).unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        let before = inspect(&e, &target).unwrap();
        let item = before
            .skills
            .iter()
            .find(|item| item.name == "delta")
            .unwrap();
        assert_eq!(item.reason.as_deref(), Some("packageDelta"));
        assert!(!item.can_toggle && item.can_set_visibility);
        let config_bytes = fs::read(&project_config).unwrap();
        let after = native_change(&e, named_request(before, "delta", true)).unwrap();
        assert!(
            after
                .skills
                .iter()
                .find(|item| item.name == "delta")
                .unwrap()
                .manual_only
        );
        assert_eq!(fs::read(&project_config).unwrap(), config_bytes);
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "---\nname: delta\ndescription: Delta skill\ndisable-model-invocation: true\n---\nKeep body\n"
        );
        let inherited = named_request(inspect(&e, &target).unwrap(), "managed", true);
        assert!(native_change(&e, inherited).is_err());
    }
    #[test]
    fn manual_source_edits_are_observed_and_refresh_restores_external_editability() {
        let (_root, e, file) = fixture();
        change(&e, request(inspect(&e, &global()).unwrap(), true)).unwrap();
        let stale = request(inspect(&e, &global()).unwrap(), false);
        let edited="---\nname: managed\ndescription: Manually edited description\n---\nManual body edits stay intact.\n";
        fs::write(&file, edited).unwrap();
        assert!(change(&e, stale).unwrap_err().contains("unchanged"));
        let snapshot = inspect(&e, &global()).unwrap();
        assert!(snapshot.skills[0].manual_only && snapshot.skills[0].can_set_visibility);
        let after = change(&e, request(snapshot, false)).unwrap();
        assert!(!after.skills[0].manual_only);
        assert_eq!(fs::read_to_string(&file).unwrap(), edited);
        let authored="---\nname: managed\ndescription: Authored manual policy\ndisable-model-invocation: true\n---\nManual body edits stay intact.\n";
        fs::write(&file, authored).unwrap();
        let snapshot = inspect(&e, &global()).unwrap();
        assert!(!snapshot.skills[0].manual_only && snapshot.skills[0].source_manual_only);
        assert!(snapshot.skills[0].can_set_visibility);
        change(&e, request(snapshot, true)).unwrap();
        let after = change(&e, request(inspect(&e, &global()).unwrap(), false)).unwrap();
        assert!(!after.skills[0].manual_only);
        let policy = e.home.join(".pi/agent").join(POLICY);
        assert_eq!(
            settings(&policy).unwrap()["hiddenSkills"][0]["hidden"],
            false
        );
        let restarted = engine(&e.home);
        assert!(!inspect(&restarted, &global()).unwrap().skills[0].manual_only);
        assert_eq!(fs::read_to_string(&file).unwrap(), authored);
        fs::remove_file(e.home.join(".pi/agent/extensions").join(EXTENSION)).unwrap();
        let mut reset = request(inspect(&e, &global()).unwrap(), false);
        reset.manual_only = None;
        let reset = change(&e, reset).unwrap();
        assert!(reset.skills[0].manual_only && !reset.skills[0].can_restore_default);
        assert!(!e.home.join(".pi/agent/extensions").join(EXTENSION).exists());
        assert!(settings(&policy).unwrap()["hiddenSkills"]
            .as_array()
            .unwrap()
            .is_empty());
        assert_eq!(fs::read_to_string(&file).unwrap(), authored);
        fs::write(&file, edited).unwrap();
        let snapshot = inspect(&e, &global()).unwrap();
        assert!(!snapshot.skills[0].manual_only && snapshot.skills[0].can_set_visibility);
        change(&e, request(snapshot, true)).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), edited);
    }
}
