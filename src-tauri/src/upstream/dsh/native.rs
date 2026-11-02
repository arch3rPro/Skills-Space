use super::*;
use sha2::{Digest, Sha256};
use std::io::Write;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConfigurationChange {
    target: Target,
    key: String,
    revision: String,
    custom_skill_dirs: Vec<String>,
    include_default_roots: bool,
    #[serde(default)]
    watch: Option<bool>,
    #[serde(default)]
    directory_only: bool,
    #[serde(default)]
    settings: Option<serde_json::Value>,
    #[serde(default)]
    reset: bool,
    #[serde(default)]
    restore_preset: bool,
    #[serde(default)]
    confirm_materialize: bool,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeRemoval {
    target: Target,
    file: String,
    path: String,
    name: String,
    revision: String,
    dependencies: String,
    #[serde(default)]
    context_key: Option<String>,
}

// DSH atomic-write locks <profile>/package.json.lock with an exclusive PID file.
// Never steal an existing lock. The native writer can wait or recover its own stale lock.
pub(super) struct WriterLock {
    path: PathBuf,
    file: fs::File,
}
impl WriterLock {
    pub(super) fn acquire(path: &Path) -> Result<Self, String> {
        let lock = PathBuf::from(format!("{}.lock", path.display()));
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&lock)
            .map_err(|_| "DSH writer lock is busy or unavailable. Refresh before retrying.")?;
        if let Err(error) = writeln!(file, "{}", std::process::id()).and_then(|_| file.sync_all()) {
            let _ = fs::remove_file(&lock);
            return Err(error.to_string());
        }
        Ok(Self { path: lock, file })
    }
}
impl Drop for WriterLock {
    fn drop(&mut self) {
        let same = self
            .file
            .metadata()
            .ok()
            .zip(fs::symlink_metadata(&self.path).ok())
            .is_some_and(|(owned, current)| {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::MetadataExt;
                    owned.ino() == current.ino() && owned.dev() == current.dev()
                }
                #[cfg(not(unix))]
                {
                    !current.file_type().is_symlink() && owned.len() == current.len()
                }
            });
        if same {
            let _ = fs::remove_file(&self.path);
        }
    }
}
#[derive(Deserialize)]
struct Prepared {
    before: String,
    after: String,
    path: Option<String>,
    #[serde(rename = "lockPath")]
    lock_path: Option<String>,
    #[serde(default, rename = "beforeMissing")]
    before_missing: bool,
    #[serde(default, rename = "expectedComposition")]
    expected_composition: Option<String>,
}
fn prepare(
    engine: &Engine,
    target: &Target,
    mode: &str,
    payload: serde_json::Value,
) -> Result<Prepared, String> {
    let directory = target.directory(&engine.home)?;
    let mut command = helper_command(engine, &engine.home);
    command
        .arg(engine.resources.join("prepare-dsh-change.mjs"))
        .arg(mode)
        .arg(&engine.home)
        .arg(harness_home(engine))
        .arg(if target.scope == "project" {
            directory.to_string_lossy().into_owned()
        } else {
            String::new()
        })
        .arg(serde_json::to_string(&payload).map_err(|e| e.to_string())?)
        .arg(if engine.isolated {
            "{\"runtimeVersion\":\"0.2.0-rc.2\"}"
        } else {
            "{}"
        });
    let output = run_process_with_timeout(&mut command, Duration::from_secs(20))?;
    if !output.success {
        return Err(
            "DSH content changed or cannot be edited safely. Reload before retrying.".into(),
        );
    }
    serde_json::from_str(&output.stdout).map_err(|_| "Unsupported DSH preparation response.".into())
}
fn configuration_save(
    engine: &Engine,
    change: ConfigurationChange,
) -> Result<serde_json::Value, String> {
    let before = inspect_context(engine, &change.target, Some(&change.key))?;
    if before["revision"] != change.revision {
        return Err("DSH configuration changed. Reload before saving.".into());
    }
    let row = before["configurations"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["key"] == change.key))
        .ok_or("DSH configuration is no longer available.")?;
    if row["editable"] != true {
        return Err("This DSH configuration is read-only.".into());
    }
    let lock_path = row["manifestPath"]
        .as_str()
        .ok_or("DSH profile manifest is unavailable.")?;
    let _lock = WriterLock::acquire(Path::new(lock_path))?;
    let prepared = prepare(
        engine,
        &change.target,
        "configuration",
        serde_json::json!({"key":change.key,"revision":change.revision,"customSkillDirs":change.custom_skill_dirs,"includeDefaultRoots":change.include_default_roots,"watch":change.watch,"directoryOnly":change.directory_only,"settings":change.settings,"reset":change.reset,"restorePreset":change.restore_preset,"confirmMaterialize":change.confirm_materialize}),
    )?;
    let path = prepared
        .path
        .as_deref()
        .ok_or("DSH configuration target is missing.")?;
    if prepared.lock_path.as_deref() != Some(lock_path)
        || Some(path) != row["path"].as_str()
        || if prepared.before_missing {
            Path::new(path).exists()
        } else {
            fs::read_to_string(path).map_err(|e| e.to_string())? != prepared.before
        }
        || inspect_context(engine, &change.target, Some(&change.key))?["revision"]
            != change.revision
    {
        return Err("DSH configuration changed during preparation. Reload before saving.".into());
    }
    pi::write_bytes(Path::new(path), prepared.after.as_bytes())?;
    let verified = (|| {
        let after = inspect_context(engine, &change.target, Some(&change.key))?;
        let saved = after["configurations"]
            .as_array()
            .and_then(|rows| rows.iter().find(|row| row["key"] == change.key))
            .ok_or("DSH settings saved; refresh to verify the file.")?;
        if prepared.expected_composition.as_deref() != saved["compositionRevision"].as_str() {
            return Err("DSH configuration changed during verification.".into());
        }
        Ok(after)
    })();
    if verified.is_err()
        && fs::read_to_string(path).ok().as_deref() == Some(prepared.after.as_str())
    {
        if prepared.before_missing {
            fs::remove_file(path).map_err(|e| e.to_string())?;
        } else {
            pi::write_bytes(Path::new(path), prepared.before.as_bytes())?;
        }
    }
    verified
}
fn native_skill(
    engine: &Engine,
    target: &Target,
    file: &str,
    invocation: bool,
    context_key: Option<&str>,
) -> Result<(serde_json::Value, serde_json::Value), String> {
    let snapshot = inspect_context(engine, target, context_key)?;
    let item = snapshot["skills"]
        .as_array()
        .and_then(|rows| {
            rows.iter()
                .find(|row| row["file"] == file && row["inScope"] == true)
        })
        .ok_or("DSH skill is outside this scope. Refresh the list.")?;
    if item[if invocation {
        "canSetInvocation"
    } else {
        "canTrash"
    }] != true
    {
        return Err("Only independent local DSH skills support this operation.".into());
    }
    let path = item["path"].as_str().ok_or("Invalid DSH skill path.")?;
    let physical = fs::canonicalize(path).map_err(|e| e.to_string())?;
    let inventory = engine.inventory(target)?;
    if inventory.skills.iter().any(|skill| {
        fs::canonicalize(&skill.path).ok().as_ref() == Some(&physical)
            && (skill.shared || skill.cli_managed || skill.agents.iter().any(|id| id != ID))
    }) {
        return Err("Shared and managed skills cannot be changed as native DSH resources.".into());
    }
    pi_removal::tree_revision(&physical).map_err(|error| error.replace("Pi", "DSH"))?;
    fn reject_configuration(path: &Path) -> Result<(), String> {
        if path.is_dir() {
            for entry in fs::read_dir(path).map_err(|error| error.to_string())? {
                let entry = entry.map_err(|error| error.to_string())?;
                if entry.file_name() == ".dsh" {
                    return Err("DSH refuses a skill containing a configuration folder.".into());
                }
                reject_configuration(&entry.path())?;
            }
        }
        Ok(())
    }
    reject_configuration(&physical)?;
    Ok((snapshot.clone(), item.clone()))
}
#[cfg(test)]
fn removal_plan(engine: &Engine, target: Target, file: String) -> Result<NativeRemoval, String> {
    removal_plan_context(engine, target, file, None)
}
fn removal_plan_context(
    engine: &Engine,
    target: Target,
    file: String,
    context_key: Option<String>,
) -> Result<NativeRemoval, String> {
    let (snapshot, item) = native_skill(engine, &target, &file, false, context_key.as_deref())?;
    let path = item["path"]
        .as_str()
        .ok_or("Invalid DSH skill path.")?
        .to_owned();
    Ok(NativeRemoval {
        context_key,
        target,
        file,
        path: path.clone(),
        name: item["name"].as_str().unwrap_or("Skill").into(),
        revision: pi_removal::tree_revision(Path::new(&path))
            .map_err(|e| e.replace("Pi", "DSH"))?,
        dependencies: snapshot["revision"]
            .as_str()
            .ok_or("Missing DSH revision.")?
            .into(),
    })
}
fn removal_apply(
    engine: &Engine,
    reviewed: NativeRemoval,
    move_to_trash: impl FnOnce(&Path) -> Result<(), String>,
) -> Result<(), String> {
    let (_, item) = native_skill(
        engine,
        &reviewed.target,
        &reviewed.file,
        false,
        reviewed.context_key.as_deref(),
    )?;
    let root = item["physicalRoot"].as_str().ok_or("Invalid DSH root.")?;
    let key = format!("{:x}", Sha256::digest(reviewed.file.as_bytes()));
    let _lock =
        WriterLock::acquire(&Path::new(root).join(format!(".skills-space-dsh-{}", &key[..24])))?;
    if removal_plan_context(
        engine,
        reviewed.target.clone(),
        reviewed.file.clone(),
        reviewed.context_key.clone(),
    )? != reviewed
    {
        return Err("DSH removal content changed. Review it again.".into());
    }
    move_to_trash(Path::new(&reviewed.path))?;
    if fs::symlink_metadata(&reviewed.path).is_ok() {
        return Err("DSH removal could not verify the move to Trash.".into());
    }
    Ok(())
}
#[tauri::command]
pub async fn upstream_dsh_save(
    app: AppHandle,
    change: ConfigurationChange,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        configuration_save(&Engine::from_app(&app)?, change)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_dsh_removal_plan(
    app: AppHandle,
    target: Target,
    file: String,
    context_key: Option<String>,
) -> Result<NativeRemoval, String> {
    tauri::async_runtime::spawn_blocking(move || {
        removal_plan_context(&Engine::from_app(&app)?, target, file, context_key)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_dsh_trash(app: AppHandle, reviewed: NativeRemoval) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        removal_apply(&Engine::from_app(&app)?, reviewed, |path| {
            pi_removal::system_trash(path).map_err(|e| e.replace("Pi", "DSH"))
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreationReview {
    target: Target,
    key: Option<String>,
    revision: String,
    directory: String,
    name: String,
    plan: super::super::creation::CreationPlan,
}
fn creation_review(
    engine: &Engine,
    target: Target,
    key: Option<String>,
    directory: String,
    name: String,
) -> Result<CreationReview, String> {
    if name.is_empty()
        || name.len() > 64
        || name.split('-').any(|part| {
            part.is_empty()
                || !part
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
    {
        return Err("Use a lowercase kebab-case DSH skill name.".into());
    }
    let snapshot = inspect_context(engine, &target, key.as_deref())?;
    if snapshot["contextIssue"].is_string() {
        return Err("DSH configuration changed. Reload before creating.".into());
    }
    let root = snapshot["roots"]
        .as_array()
        .and_then(|roots| {
            roots.iter().find(|root| {
                root["path"].as_str().is_some_and(|path| Path::new(path) == Path::new(&directory))
                    && root["inScope"] == true
                    && root["canCreate"] == true
                    && matches!(
                        root["source"].as_str(),
                        Some("user-dsh" | "project-dsh" | "configured-dsh" | "custom")
                    )
            })
        })
        .ok_or("Choose an enabled independent DSH skill directory.")?;
    let path = Path::new(&directory);
    if snapshot["canonicalRoot"] == directory
        || snapshot["sharedHome"]
            .as_str()
            .is_some_and(|home| Path::new(home).join("skills") == path)
    {
        return Err("Shared skill directories use the managed lifecycle.".into());
    }
    let inventory = engine.inventory(&target)?;
    if inventory
        .agents
        .iter()
        .any(|agent| agent.id != ID && Path::new(&agent.path) == path)
    {
        return Err("This skill root belongs to another Agent.".into());
    }
    let mut ancestor = path;
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or("Invalid DSH root")?;
    }
    let normalized_ancestor = ancestor.to_path_buf();
    #[cfg(target_os = "macos")]
    let normalized_ancestor = if let Ok(relative) = ancestor.strip_prefix("/var") {
        Path::new("/private/var").join(relative)
    } else if let Ok(relative) = ancestor.strip_prefix("/tmp") {
        Path::new("/private/tmp").join(relative)
    } else {
        normalized_ancestor
    };
    if dunce::canonicalize(ancestor).map_err(|e| e.to_string())? != normalized_ancestor
        || root["source"] == "bundled"
    {
        return Err("Linked DSH creation roots are read-only.".into());
    }
    let plan = super::super::creation::native_plan(&directory, &name)?;
    // A custom discovery root must not transfer ownership of known shared/package content.
    let mut protected: Vec<PathBuf> = snapshot["roots"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|root| {
            matches!(
                root["source"].as_str(),
                Some("user-agents" | "configured-agents" | "bundled")
            )
        })
        .filter_map(|root| root["path"].as_str().map(PathBuf::from))
        .collect();
    if let Some(path) = snapshot["canonicalRoot"].as_str() {
        protected.push(path.into());
    }
    protected.extend(
        inventory
            .agents
            .iter()
            .filter(|agent| agent.id != ID)
            .flat_map(|agent| {
                std::iter::once(PathBuf::from(&agent.path))
                    .chain(agent.additional_paths.iter().map(PathBuf::from))
            }),
    );
    for path in protected {
        let actual = dunce::canonicalize(&path).unwrap_or(path);
        if plan.skill_path().starts_with(actual) {
            return Err(
                "Shared, managed and bundled roots cannot receive native skill files.".into(),
            );
        }
    }

    Ok(CreationReview {
        target,
        key,
        revision: snapshot["revision"]
            .as_str()
            .ok_or("Missing DSH revision")?
            .into(),
        directory,
        name,
        plan,
    })
}
#[tauri::command]
pub async fn upstream_dsh_creation_plan(
    app: AppHandle,
    target: Target,
    key: Option<String>,
    directory: String,
    name: String,
) -> Result<CreationReview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        creation_review(&Engine::from_app(&app)?, target, key, directory, name)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_dsh_create(
    app: AppHandle,
    reviewed: CreationReview,
) -> Result<super::super::creation::CreationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        let current = creation_review(
            &engine,
            reviewed.target.clone(),
            reviewed.key.clone(),
            reviewed.directory.clone(),
            reviewed.name.clone(),
        )?;
        if current.revision != reviewed.revision || current.plan != reviewed.plan {
            return Err("DSH creation context changed. Review it again.".into());
        }
        fs::create_dir_all(&reviewed.directory).map_err(|e| e.to_string())?;
        let result = super::super::creation::create(&engine, &reviewed.plan)?;
        let snapshot = inspect_context(&engine, &reviewed.target, reviewed.key.as_deref())?;
        if !snapshot["skills"].as_array().is_some_and(|rows| {
            rows.iter().any(|row| {
                row["name"] == reviewed.name && row["reason"].is_null() && row["inScope"] == true
            })
        }) {
            return Err(
                "Created skill could not be verified by DSH discovery. Inspect SKILL.md.".into(),
            );
        }
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{engine, global};
    fn skill(home: &Path, relative: &str, name: &str) -> PathBuf {
        let file = home.join(relative);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(
            &file,
            format!("---\r\n# retain\r\nname: {name}\r\ndescription: Fixture\r\n---\r\nBody\r\n"),
        )
        .unwrap();
        dunce::canonicalize(file).unwrap()
    }
    fn install_original_runtime(home: &Path) {
        let Some(package) = std::env::var_os("SKILLS_SPACE_DSH_TEST_INSTALL").map(PathBuf::from)
        else {
            return;
        };
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(package.join("package.json")).unwrap()).unwrap();
        assert_eq!(manifest["name"], "@deepseek-ai/dsh");
        let relative = manifest["bin"]["dsh"]
            .as_str()
            .or_else(|| manifest["bin"].as_str())
            .unwrap();
        let link = home.join(".local/bin/dsh");
        fs::create_dir_all(link.parent().unwrap()).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(package.join(relative), link).unwrap();
    }
    fn profile(home: &Path) -> PathBuf {
        install_original_runtime(home);
        let path = home.join(".dsh/profiles/web");
        fs::create_dir_all(&path).unwrap();
        fs::write(
            path.join("package.json"),
            r#"{"dsh":{"profile":{"bundles":[]}}}"#,
        )
        .unwrap();
        fs::write(path.join("cordis.patch.yml"),"# preserved\n- insert:\n  - id: skill-filesystem\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config:\n      customSkillDirs: []\n      secret: keep\n      watch: true # retained\n").unwrap();
        path
    }
    fn change(snapshot: &serde_json::Value) -> ConfigurationChange {
        ConfigurationChange {
            target: global(),
            key: snapshot["configurations"][0]["key"]
                .as_str()
                .unwrap()
                .into(),
            revision: snapshot["revision"].as_str().unwrap().into(),
            custom_skill_dirs: vec![],
            include_default_roots: false,
            watch: Some(false),
            directory_only: false,
            settings: None,
            reset: false,
            restore_preset: false,
            confirm_materialize: false,
        }
    }
    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL pointing to an original DSH package"]
    fn directory_only_configuration_omits_watch_and_preserves_it_on_save_and_reset() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let e = engine(&home);
        let p = profile(&home);
        let file = p.join("cordis.patch.yml");
        let original = fs::read_to_string(&file).unwrap().replace(
            "watch: true # retained",
            "watch: false # retained\n      watchPollIntervalMs: 73\n      watchMaxProjects: !!js neverEvaluateNativeWatch()",
        );
        fs::write(&file, &original).unwrap();
        let before = inspect(&e, &global()).unwrap();
        let request: ConfigurationChange = serde_json::from_value(serde_json::json!({
            "target":global(),"key":before["configurations"][0]["key"],
            "revision":before["revision"],"customSkillDirs":[home.join("extra")],
            "includeDefaultRoots":false,"directoryOnly":true
        })).unwrap();
        assert!(request.watch.is_none());
        let saved = configuration_save(&e, request).unwrap();
        assert_eq!(saved["configurations"][0]["watch"], false);
        let mut reset = change(&saved);
        reset.directory_only = true;
        reset.watch = None;
        reset.reset = true;
        configuration_save(&e, reset).unwrap();
        let raw = fs::read_to_string(file).unwrap();
        assert!(raw.contains("watch: false # retained"));
        assert!(raw.contains("watchPollIntervalMs: 73"));
        assert!(raw.contains("neverEvaluateNativeWatch()"));
        assert!(raw.contains("secret: keep"));
        let restarted = inspect(&engine(&home), &global()).unwrap();
        assert_eq!(restarted["configurations"][0]["watch"], false);
        assert!(restarted["configurations"][0]["hasOverride"].as_bool().unwrap());
        assert_eq!(restarted["configurations"][0]["canRestoreDirectories"], false);
    }
    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL pointing to an original DSH package"]
    fn dsh_inventory_context_keeps_roots_and_scoped_skills_together() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let e = engine(&home);
        skill(&home, ".dsh/skills/global-native/SKILL.md", "global-native");
        skill(&home, ".agents/skills/shared/SKILL.md", "shared");
        skill(
            &home,
            "repo/.dsh/skills/project-native/SKILL.md",
            "project-native",
        );
        skill(&home, "extra/custom-native/SKILL.md", "custom-native");
        fs::create_dir_all(home.join("repo/.git")).unwrap();
        let profile = profile(&home);
        let project = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(home.join("repo").to_string_lossy().into()),
        };
        let names = |inventory: &Inventory| {
            let mut names: Vec<_> = inventory
                .skills
                .iter()
                .filter(|s| s.agents.iter().any(|a| a == ID))
                .map(|s| s.name.clone())
                .collect();
            names.sort();
            names
        };
        let global_default = e.inventory(&global()).unwrap();
        assert_eq!(names(&global_default), vec!["global-native", "shared"]);
        assert_eq!(
            names(&e.inventory(&project).unwrap()),
            vec!["project-native"]
        );
        let key = global_default.dsh.as_ref().unwrap()["configurations"][0]["key"]
            .as_str()
            .unwrap()
            .to_owned();
        fs::write(profile.join("cordis.patch.yml"), format!("- insert:\n  - id: skill-filesystem\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config:\n      includeDefaultRoots: false\n      customSkillDirs: [{}]\n", serde_json::to_string(&home.join("extra")).unwrap())).unwrap();
        for scope in [&global(), &project] {
            let inventory = e.inventory_context(scope, Some(&key)).unwrap();
            assert_eq!(names(&inventory), vec!["custom-native"]);
            let snapshot = inventory.dsh.as_ref().unwrap();
            assert_eq!(snapshot["roots"].as_array().unwrap().len(), 1);
            assert_eq!(
                snapshot["roots"][0]["path"],
                home.join("extra").to_string_lossy().as_ref()
            );
            assert_eq!(snapshot["roots"][0]["inScope"], true);
            assert_eq!(snapshot["roots"][0]["exists"], true);
            assert!(
                inventory
                    .skills
                    .iter()
                    .find(|s| s.name == "custom-native")
                    .unwrap()
                    .dsh_state
                    .as_ref()
                    .unwrap()
                    .can_trash
            );
        }
        // Disabling DSH discovery must not remove the shared installation from other Agents.
        assert!(e
            .inventory_context(&global(), Some(&key))
            .unwrap()
            .skills
            .iter()
            .any(|s| s.name == "shared"));
        fs::write(profile.join("cordis.patch.yml"), "- insert:\n  - id: skill-filesystem\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config:\n      includeDefaultRoots: false\n      customSkillDirs: []\n").unwrap();
        let empty = e.inventory_context(&global(), Some(&key)).unwrap();
        assert!(names(&empty).is_empty());
        assert!(empty.dsh.as_ref().unwrap()["roots"]
            .as_array()
            .unwrap()
            .is_empty());
        let stale = e
            .inventory_context(&global(), Some("removed-context"))
            .unwrap();
        assert!(names(&stale).is_empty());
        assert!(stale
            .warnings
            .iter()
            .any(|warning| warning.contains("Selected DSH configuration changed")));
    }
    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL pointing to an original DSH package"]
    fn static_configuration_cas_native_lock_and_restart_readback() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let e = engine(&home);
        let p = profile(&home);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(
                p.join("cordis.patch.yml"),
                fs::Permissions::from_mode(0o640),
            )
            .unwrap();
        }
        let before = inspect(&e, &global()).unwrap();
        let held = WriterLock::acquire(&p.join("package.json")).unwrap();
        assert!(configuration_save(&e, change(&before)).is_err());
        assert!(p.join("package.json.lock").exists());
        drop(held);
        let after = configuration_save(&e, change(&before)).unwrap();
        assert_eq!(after["configurations"][0]["watch"], false);
        assert!(configuration_save(&e, change(&before)).is_err());
        assert!(!p.join("package.json.lock").exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(p.join("cordis.patch.yml"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o640
            );
        }
        let raw = fs::read_to_string(p.join("cordis.patch.yml")).unwrap();
        assert!(
            raw.contains("secret: keep")
                && raw.contains("# retained")
                && raw.contains("# preserved")
        );
        let restarted = inspect(&engine(&home), &global()).unwrap();
        assert_eq!(restarted["configurations"][0]["watch"], false);
        assert_eq!(restarted["configurations"][0]["includeDefaultRoots"], false);
        fs::write(p.join("package.json.lock"), "424242\n").unwrap();
        assert!(configuration_save(&e, change(&restarted)).is_err());
        assert_eq!(
            fs::read_to_string(p.join("package.json.lock")).unwrap(),
            "424242\n"
        );
    }
    fn bundle_profile(home: &Path) -> (PathBuf, PathBuf) {
        install_original_runtime(home);
        let profile = home.join(".dsh/profiles/fixture-profile");
        let bundle = profile.join("node_modules/@fixture/skills-layer");
        fs::create_dir_all(&bundle).unwrap();
        fs::write(
            profile.join("package.json"),
            r#"{"dsh":{"profile":{"bundles":["@fixture/skills-layer"]}}}"#,
        )
        .unwrap();
        fs::write(bundle.join("package.json"), r#"{"name":"@fixture/skills-layer","version":"1.0.0","dsh":{"bundle":{"patch":"layer.yml"}}}"#).unwrap();
        fs::write(bundle.join("layer.yml"), "- insert:\n  - id: local-reader\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config:\n      watch: true\n      watchMaxProjects: 21\n      retained: original\n  - id: unrelated\n    name: '@fixture/unrelated'\n    disabled: !!js neverEvaluate()\n").unwrap();
        (profile, bundle)
    }
    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL pointing to an original DSH package"]
    fn bundled_profile_creates_override_and_restores_inheritance_after_restart() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let (profile, bundle) = bundle_profile(&home);
        let e = engine(&home);
        let inherited_bytes = fs::read(bundle.join("layer.yml")).unwrap();
        let before = inspect(&e, &global()).unwrap();
        assert_eq!(before["configurations"][0]["editable"], true);
        assert_eq!(before["configurations"][0]["patchExists"], false);
        let mut request = change(&before);
        request.settings = Some(
            serde_json::json!({"watchUsePolling":true,"watchMaxProjects":55,"watchPollIntervalMs":90,"watchStabilityThresholdMs":350,"watchFollowSymlinks":false}),
        );
        let saved = configuration_save(&e, request).unwrap();
        assert_eq!(saved["configurations"][0]["watchMaxProjects"], 55);
        assert!(profile.join("cordis.patch.yml").is_file());
        assert_eq!(fs::read(bundle.join("layer.yml")).unwrap(), inherited_bytes);
        let restarted = inspect(&engine(&home), &global()).unwrap();
        assert_eq!(restarted["configurations"][0]["watch"], false);
        assert_eq!(restarted["configurations"][0]["watchUsePolling"], true);
        let mut reset = change(&restarted);
        reset.reset = true;
        let restored = configuration_save(&e, reset).unwrap();
        assert_eq!(restored["configurations"][0]["watch"], true);
        assert_eq!(restored["configurations"][0]["watchMaxProjects"], 21);
        assert_eq!(restored["configurations"][0]["hasOverride"], false);
        assert_eq!(
            inspect(&engine(&home), &global()).unwrap()["configurations"][0]["watchMaxProjects"],
            21
        );
    }
    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL pointing to an original DSH package"]
    fn bundled_profile_rejects_shadow_and_external_layer_changes_without_writes() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let (profile, bundle) = bundle_profile(&home);
        let e = engine(&home);
        let before = inspect(&e, &global()).unwrap();
        let mut bytes = fs::read_to_string(bundle.join("layer.yml")).unwrap();
        bytes.push_str("# external change\n");
        fs::write(bundle.join("layer.yml"), bytes).unwrap();
        assert!(configuration_save(&e, change(&before)).is_err());
        assert!(!profile.join("cordis.patch.yml").exists());
        let home_patch = home.join(".dsh/cordis.patch.yml");
        fs::write(
            &home_patch,
            "- id: local-reader\n  config:\n    watch: false\n",
        )
        .unwrap();
        let shadowed = inspect(&e, &global()).unwrap();
        assert_eq!(
            shadowed["configurations"][0]["readOnlyReason"],
            "home-overlay"
        );
        assert!(configuration_save(&e, change(&shadowed)).is_err());
        assert!(!profile.join("cordis.patch.yml").exists());
        assert!(!profile.join("package.json.lock").exists());
    }
    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL pointing to an original DSH package"]
    fn secondary_provider_discovery_preserves_primary_and_profile() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let e = engine(&home);
        let primary = skill(&home, "primary/alpha/SKILL.md", "alpha");
        let secondary = skill(&home, "secondary/beta/SKILL.md", "beta");
        let profile = profile(&home);
        let patch = profile.join("cordis.patch.yml");
        let body = format!("- insert:\n  - id: preset\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: standard\n      plugins:\n        - id: primary\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {{providerName: primary, includeDefaultRoots: false, customSkillDirs: [{}]}}\n        - id: secondary\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {{providerName: secondary, includeDefaultRoots: false, customSkillDirs: [{}]}}\n", serde_json::to_string(&home.join("primary")).unwrap(), serde_json::to_string(&home.join("secondary")).unwrap());
        fs::write(&patch, &body).unwrap();
        let primary_before = fs::read(&primary).unwrap();
        let before = inspect(&e, &global()).unwrap();
        let key = before["contextKey"].as_str().unwrap();
        let selected = before["configurations"].as_array().unwrap().iter().find(|row| row["key"] == key).unwrap();
        assert_eq!(selected["entryId"], "primary");
        let row = before["skills"].as_array().unwrap().iter().find(|row| row["file"] == secondary.to_string_lossy().as_ref()).unwrap();
        assert_eq!(row["modelInvocable"], true);
        assert_eq!(row["userInvocable"], true);
        let secondary_before = fs::read(&secondary).unwrap();
        let after = inspect_context(&e, &global(), Some(key)).unwrap();
        assert!(after["skills"].as_array().unwrap().iter().any(|row| row["file"] == secondary.to_string_lossy().as_ref()));
        assert_eq!(fs::read(&secondary).unwrap(), secondary_before);
        assert_eq!(after["contextKey"], key);
        assert_eq!(fs::read(&primary).unwrap(), primary_before);
        assert_eq!(fs::read_to_string(&patch).unwrap(), body);
        assert!(fs::read_to_string(&secondary).unwrap().ends_with("---\r\nBody\r\n"));
    }

    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL to inspect the active Profile before Trash"]
    fn trash_moves_only_reviewed_bundle_or_flat_file_and_failure_never_deletes() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let e = engine(&home);
        let file = skill(&home, ".dsh/skills/alpha/SKILL.md", "alpha");
        fs::write(file.parent().unwrap().join("support.txt"), "support").unwrap();
        let sibling = skill(&home, ".dsh/skills/sibling/SKILL.md", "sibling");
        let shared = skill(&home, ".agents/skills/shared/SKILL.md", "shared");
        let p = profile(&home);
        let config = fs::read(p.join("cordis.patch.yml")).unwrap();
        let plan = removal_plan(&e, global(), file.to_string_lossy().into_owned()).unwrap();
        fs::write(file.parent().unwrap().join("changed.txt"), "changed").unwrap();
        assert!(removal_apply(&e, plan, |_| panic!("must not move")).is_err());
        let plan = removal_plan(&e, global(), file.to_string_lossy().into_owned()).unwrap();
        assert!(removal_apply(&e, plan, |_| Err("Trash unavailable".into())).is_err());
        assert!(file.exists());
        let trash = temp.0.join("trash-bundle");
        let plan = removal_plan(&e, global(), file.to_string_lossy().into_owned()).unwrap();
        removal_apply(&e, plan, |path| {
            fs::rename(path, &trash).map_err(|e| e.to_string())
        })
        .unwrap();
        assert!(trash.join("support.txt").exists());
        assert!(sibling.exists() && shared.exists());
        assert_eq!(fs::read(p.join("cordis.patch.yml")).unwrap(), config);
        let flat = skill(&home, ".dsh/skills/flat.md", "flat");
        let attachment = home.join(".dsh/skills/attachment.png");
        fs::write(&attachment, "attachment").unwrap();
        let plan = removal_plan(&e, global(), flat.to_string_lossy().into_owned()).unwrap();
        let flat_trash = temp.0.join("trash-flat.md");
        removal_apply(&e, plan, |path| {
            fs::rename(path, &flat_trash).map_err(|e| e.to_string())
        })
        .unwrap();
        assert!(flat_trash.is_file() && attachment.exists());
    }
    #[test]
    fn linked_nested_configuration_and_project_boundaries_refuse_native_mutations() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let e = engine(&home);
        let file = skill(&home, ".dsh/skills/alpha/SKILL.md", "alpha");
        fs::create_dir(file.parent().unwrap().join(".dsh")).unwrap();
        assert!(removal_plan(&e, global(), file.to_string_lossy().into_owned()).is_err());
        fs::remove_dir(file.parent().unwrap().join(".dsh")).unwrap();
        #[cfg(unix)]
        {
            let outside = temp.0.join("outside");
            fs::write(&outside, "outside").unwrap();
            let nested = file.parent().unwrap().join("support");
            std::os::unix::fs::symlink(&outside, &nested).unwrap();
            assert!(removal_plan(&e, global(), file.to_string_lossy().into_owned()).is_err());
            fs::remove_file(&nested).unwrap();
            fs::hard_link(&outside, &nested).unwrap();
            assert!(removal_plan(&e, global(), file.to_string_lossy().into_owned()).is_err());
            fs::remove_file(nested).unwrap();
        }
        let project = temp.0.join("project");
        fs::create_dir_all(project.join(".git")).unwrap();
        let local = skill(&project, ".dsh/skills/local/SKILL.md", "local");
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        assert!(removal_plan(&e, global(), local.to_string_lossy().into_owned()).is_err());
        assert!(removal_plan(&e, target.clone(), file.to_string_lossy().into_owned()).is_err());
        removal_plan(&e, target, local.to_string_lossy().into_owned()).unwrap();
    }
    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL pointing to an original DSH package"]
    fn preset_parent_override_isolates_duplicate_children_and_restores_after_restart() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let (profile, bundle) = bundle_profile(&home);
        fs::write(bundle.join("layer.yml"),"- insert:\n  - id: preset-alpha\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: alpha\n      prefix: !!js neverEvaluate()\n      retained: original\n      plugins:\n        - id: skill-filesystem\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {watch: true}\n  - id: preset-beta\n    name: '@deepseek-ai/dsh-agent-preset'\n    config:\n      id: beta\n      plugins:\n        - id: skill-filesystem\n          name: '@deepseek-ai/dsh-skill-filesystem'\n          config: {watch: true}\n").unwrap();
        let e = engine(&home);
        let before = inspect(&e, &global()).unwrap();
        assert_eq!(before["configurations"].as_array().unwrap().len(), 2);
        let first = &before["configurations"][0];
        let second = &before["configurations"][1];
        assert_ne!(first["key"], second["key"]);
        let mut request = change(&before);
        assert!(configuration_save(&e, change(&before)).is_err());
        request.confirm_materialize = true;
        let saved = configuration_save(&e, request).unwrap();
        assert_eq!(saved["configurations"][0]["watch"], false);
        assert_eq!(saved["configurations"][1]["watch"], true);
        let patch = fs::read_to_string(profile.join("cordis.patch.yml")).unwrap();
        assert!(
            patch.contains("neverEvaluate()")
                && patch.contains("retained: original")
                && !patch.contains("preset-beta")
        );
        let restarted = inspect(&engine(&home), &global()).unwrap();
        assert_eq!(restarted["configurations"][0]["watch"], false);
        let mut reset = change(&restarted);
        reset.reset = true;
        let defaults = configuration_save(&e, reset).unwrap();
        assert_eq!(defaults["configurations"][0]["watch"], true);
        assert_eq!(defaults["configurations"][0]["hasOverride"], true);
        let mut inherit = change(&defaults);
        inherit.restore_preset = true;
        let restored = configuration_save(&e, inherit).unwrap();
        assert_eq!(restored["configurations"][0]["hasOverride"], false);
        assert_eq!(restored["configurations"][1]["watch"], true);
    }
    #[test]
    fn native_creation_validates_roots_names_and_original_init() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        fs::create_dir_all(&home).unwrap();
        let home = dunce::canonicalize(home).unwrap();
        let e = engine(&home);
        let root = home.join(".dsh/skills").to_string_lossy().into_owned();
        for name in ["bad_name", "bad--name", "-bad", "bad-", ""] {
            assert!(creation_review(&e, global(), None, root.clone(), name.into()).is_err());
        }
        assert!(creation_review(
            &e,
            global(),
            None,
            home.join(".agents/skills").to_string_lossy().into(),
            "alpha".into()
        )
        .is_err());
        let reviewed =
            creation_review(&e, global(), None, root.clone(), "new-native".into()).unwrap();
        assert!(!Path::new(&root).exists());
        fs::create_dir_all(&root).unwrap();
        let result = super::super::super::creation::create(&e, &reviewed.plan).unwrap();
        let result = serde_json::to_value(result).unwrap();
        assert_eq!(result["status"], "complete");
        let inventory = inspect(&e, &global()).unwrap();
        assert!(inventory["skills"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["name"] == "new-native" && row["reason"].is_null()));
        assert!(creation_review(&e, global(), None, root, "new-native".into()).is_err());
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn native_creation_accepts_system_var_alias() {
        let temp = TemporaryDirectory::new().unwrap();
        let canonical = fs::canonicalize(&temp.0).unwrap();
        let alias = PathBuf::from(canonical.to_string_lossy().replacen(
            "/private/var/",
            "/var/",
            1,
        ));
        let home = alias.join("home");
        fs::create_dir_all(&home).unwrap();
        let e = engine(&home);
        let root = home.join(".dsh/skills");
        let reviewed = creation_review(
            &e,
            global(),
            None,
            root.to_string_lossy().into(),
            "allowed-native".into(),
        )
        .unwrap();
        fs::create_dir_all(&root).unwrap();
        let result = super::super::super::creation::create(&e, &reviewed.plan).unwrap();
        assert_eq!(serde_json::to_value(result).unwrap()["status"], "complete");
    }
    #[test]
    #[ignore = "requires SKILLS_SPACE_DSH_TEST_INSTALL pointing to an original DSH package"]
    fn native_creation_refuses_custom_shared_bundled_and_other_agent_destinations() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        fs::create_dir_all(&home).unwrap();
        let home = dunce::canonicalize(home).unwrap();
        let e = engine(&home);
        let profile = profile(&home);
        let shared = home.join("configured-shared");
        let bundled = home.join("bundled");
        fs::create_dir_all(shared.join("skills")).unwrap();
        fs::create_dir_all(&bundled).unwrap();
        for root in [shared.join("skills"), bundled.clone()] {
            let config = serde_json::json!({"agentsHome":shared,"bundledSkillDir":bundled,"customSkillDirs":[root]});
            fs::write(profile.join("cordis.patch.yml"),format!("- insert:\n  - id: skill-filesystem\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config: {}\n",config)).unwrap();
            assert!(creation_review(
                &e,
                global(),
                None,
                root.to_string_lossy().into(),
                "new-native".into()
            )
            .is_err());
        }
        let parent = home.join("custom-parent");
        let protected = parent.join("protected-skill");
        fs::create_dir_all(&protected).unwrap();
        let config = serde_json::json!({"bundledSkillDir":protected,"customSkillDirs":[parent]});
        fs::write(profile.join("cordis.patch.yml"),format!("- insert:\n  - id: skill-filesystem\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config: {}\n",config)).unwrap();
        assert!(creation_review(
            &e,
            global(),
            None,
            parent.to_string_lossy().into(),
            "protected-skill".into()
        )
        .is_err());
        let pi_parent = home.join(".pi/agent");
        fs::create_dir_all(&pi_parent).unwrap();
        let config = serde_json::json!({"customSkillDirs":[pi_parent]});
        fs::write(profile.join("cordis.patch.yml"),format!("- insert:\n  - id: skill-filesystem\n    name: '@deepseek-ai/dsh-skill-filesystem'\n    config: {}\n",config)).unwrap();
        assert!(creation_review(
            &e,
            global(),
            None,
            pi_parent.to_string_lossy().into(),
            "skills".into()
        )
        .is_err());
    }
}
