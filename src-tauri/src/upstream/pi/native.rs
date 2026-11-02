//! Native invocation policy: journal first, field-only patch, then retire external rules.
use super::*;
const STATE: &str = "skills-space-invocation.json";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NativeChange {
    pub(super) target: Target,
    pub(super) file: String,
    pub(super) revision: String,
    pub(super) dependencies: Vec<Dependency>,
    pub(super) mode: String,
}
fn plan(
    engine: &Engine,
    agent: &str,
    item: &SkillState,
    action: &str,
    mode: &str,
) -> Result<serde_json::Value, String> {
    let output = run_process_with_timeout(
        engine.command(&engine.node, &engine.home).args([
            engine
                .resources
                .join("pi-invocation-state.mjs")
                .to_string_lossy()
                .as_ref(),
            action,
            agent,
            &serde_json::to_string(item).map_err(|e| e.to_string())?,
            mode,
        ]),
        Duration::from_secs(40),
    )?;
    if !output.success {
        return Err(output.stderr);
    }
    serde_json::from_str(&output.stdout).map_err(|e| e.to_string())
}
pub(super) fn plain(path: &Path) -> Result<(), String> {
    if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
        return Err("Invocation destination is linked.".into());
    }
    if !path.is_dir() {
        visibility::regular_destination(path)?;
        if fs::metadata(path).is_ok_and(|metadata| metadata.permissions().readonly()) {
            return Err("Invocation destination is read-only.".into());
        }
    }
    let mut parent = path.parent();
    while let Some(path) = parent {
        if fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink()) {
            #[cfg(target_os = "macos")]
            if matches!(path.to_str(), Some("/var" | "/tmp"))
                && fs::canonicalize(path)
                    .is_ok_and(|p| p == PathBuf::from(format!("/private{}", path.display())))
            {
                parent = path.parent();
                continue;
            }
            return Err(
                "Invocation destination has a linked parent. Review its physical scope.".into(),
            );
        }
        parent = path.parent();
    }
    Ok(())
}
// Only explicit invocation choices call this; automatic recovery never discards history.
fn rebuild_damaged_journal(path: &Path) -> Result<(), String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(error.to_string()),
    };
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("Invocation recovery journal exceeds its size limit.".into());
    }
    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&bytes) {
        if value["version"] == 1 && value["records"].is_object() {
            return Ok(());
        }
        if value["version"].as_u64().is_some_and(|version| version > 1) {
            return Err("Unsupported invocation recovery journal version.".into());
        }
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let backup = path.with_file_name(format!("{STATE}.corrupt-{stamp}.bak"));
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut output = options.open(&backup).map_err(|e| e.to_string())?;
    output.write_all(&bytes).map_err(|e| e.to_string())?;
    output.sync_all().map_err(|e| e.to_string())?;
    if fs::read(path).map_err(|e| e.to_string())? != bytes {
        return Err("Pi settings or recovery records changed. Refresh before saving.".into());
    }
    write_settings(
        path,
        &serde_json::json!({"version":1,"records":{},"historyReset":true}),
    )
}

fn commit(
    engine: &Engine,
    snapshot: &Snapshot,
    item: &SkillState,
    action: &str,
    mode: &str,
) -> Result<(), String> {
    if item.managed {
        return Err("Managed skills use external visibility preferences.".into());
    }
    let agent = Path::new(&snapshot.agent_directory);
    plain(&agent.join("extensions").join("skills-space-visibility.js"))?;
    visibility::upgrade_owned_extension(engine, agent)?;
    let journal = agent.join(STATE);
    let file = Path::new(&item.file);
    plain(&journal)?;
    plain(file)?;
    let _journal_guard = SettingsLock::acquire(&journal)?;
    let _document_guard = SettingsLock::acquire(file)?;
    let proposal = plan(engine, &snapshot.agent_directory, item, action, mode)?;
    if proposal["result"].is_null() {
        return Ok(());
    }
    let result = &proposal["result"];
    let before = result["before"]
        .as_str()
        .ok_or("Invalid invocation plan.")?;
    let after = result["after"]
        .as_str()
        .ok_or("Invalid invocation patch.")?;
    if result["record"]["beforeHash"].as_str() != Some(&item.document_revision) {
        return Err("Skill changed while checking source evidence. Refresh before saving.".into());
    }
    if fs::read(file).map_err(|e| e.to_string())? != before.as_bytes() {
        return Err("Skill changed while planning invocation. Refresh before retrying.".into());
    }
    let mut state = proposal["state"].clone();
    state["records"][&item.file] = result["record"].clone();
    if serde_json::to_vec(&state).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
        return Err("Invocation recovery journal exceeds its size limit.".into());
    }
    // A durable prepared record makes a crash between file and journal writes recoverable.
    write_settings(&journal, &state)?;
    write_bytes(file, after.as_bytes())?;
    if fs::read(file).map_err(|e| e.to_string())? != after.as_bytes() {
        return Err("Invocation write could not be verified. Recovery remains pending.".into());
    }
    // Native physical files have one value across scopes. Remove only this file's old rules.
    let mut policies =
        vec![Path::new(&snapshot.agent_directory).join("skills-space-visibility.json")];
    if snapshot.target.scope == "project" {
        policies.push(
            snapshot
                .target
                .directory(&engine.home)?
                .join(".pi/skills-space-visibility.json"),
        );
    }
    for path in policies {
        if !path.exists() {
            continue;
        }
        plain(&path)?;
        let _guard = SettingsLock::acquire(&path)?;
        let mut policy = settings(&path)?;
        let entries = policy["hiddenSkills"]
            .as_array_mut()
            .ok_or("Invalid visibility policy. Recovery remains pending.")?;
        let count = entries.len();
        entries.retain(|entry| {
            entry["file"].as_str().is_none_or(|value| {
                dunce::canonicalize(value)
                    .map(|p| p.to_string_lossy() != item.file)
                    .unwrap_or(value != item.file)
            })
        });
        if count != entries.len() {
            write_settings(&path, &policy)?;
        }
    }
    state["records"][&item.file]["phase"] = "committed".into();
    write_settings(&journal, &state)
}
pub(super) fn change(engine: &Engine, request: NativeChange) -> Result<Snapshot, String> {
    let snapshot = inspect(engine, &request.target)?;
    if snapshot.dependencies != request.dependencies {
        return Err("Pi settings or recovery records changed. Refresh before saving.".into());
    }
    let item = snapshot
        .skills
        .iter()
        .find(|s| s.file == request.file)
        .ok_or("Native skill is no longer configured.")?;
    if !item.can_set_visibility || item.managed {
        return Err(
            "Native skill changed or belongs to another scope. Refresh before saving.".into(),
        );
    }
    if item.document_revision != request.revision
        && item
            .lifecycle
            .as_ref()
            .is_some_and(|value| value["recovery"] == "conflict")
    {
        return Err("Invocation field changed. The user's field value was retained.".into());
    }
    if !matches!(
        request.mode.as_str(),
        "auto" | "manual" | "default" | "recover"
    ) {
        return Err("Unsupported invocation mode.".into());
    }
    if request.mode == "recover"
        && item
            .lifecycle
            .as_ref()
            .is_some_and(|value| value["scopeConflict"] == true)
    {
        return Err("Scope preferences conflict. Explicitly choose automatic, manual or source default for this physical file.".into());
    }
    if matches!(request.mode.as_str(), "auto" | "manual") {
        let journal = Path::new(&snapshot.agent_directory).join(STATE);
        plain(&journal)?;
        let _guard = SettingsLock::acquire(&journal)?;
        rebuild_damaged_journal(&journal)?;
    }
    commit(
        engine,
        &snapshot,
        item,
        if request.mode == "recover" {
            "recover"
        } else {
            "plan"
        },
        &request.mode,
    )?;
    inspect(engine, &request.target)
}
pub(super) fn reconcile(engine: &Engine, target: &Target) -> Result<Snapshot, String> {
    let snapshot = inspect(engine, target)?;
    let mut warnings = Vec::new();
    let mut migrated = false;
    for item in snapshot.skills.iter().filter(|s| {
        !s.managed
            && s.can_set_visibility
            && s.visibility_configured
            && s.lifecycle
                .as_ref()
                .is_none_or(|value| value["recovery"] != "conflict")
            && s.lifecycle
                .as_ref()
                .is_some_and(|v| v["configured"] == false)
    }) {
        migrated = true;
        if let Err(error) = commit(
            engine,
            &snapshot,
            item,
            "plan",
            if item.visibility_hidden {
                "manual"
            } else {
                "auto"
            },
        ) {
            warnings.push(format!("{}: {error}", item.name));
        }
    }
    let snapshot = if migrated {
        inspect(engine, target)?
    } else {
        snapshot
    };
    let mut recovered = false;
    for item in snapshot.skills.iter().filter(|s| {
        !s.managed
            && s.in_scope
            && s.lifecycle
                .as_ref()
                .is_some_and(|v| v["recovery"] == "pendingRestore")
    }) {
        recovered = true;
        // Failed/ambiguous recovery stays visible in lifecycle state; never mask local edits.
        if let Err(error) = commit(engine, &snapshot, item, "recover", "") {
            warnings.push(format!("{}: {error}", item.name));
        }
    }
    let mut actual = if recovered {
        inspect(engine, target)?
    } else {
        snapshot
    };
    actual.warnings.extend(warnings);
    Ok(actual)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvocationFile {
    file: String,
    revision: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvocationBatch {
    target: Target,
    files: Vec<InvocationFile>,
    dependencies: Vec<Dependency>,
    mode: String,
}
fn change_batch(engine: &Engine, request: InvocationBatch) -> Result<Snapshot, String> {
    if !matches!(request.mode.as_str(), "auto" | "manual")
        || request.files.is_empty()
        || request.files.len() > 2000
    {
        return Err("Invalid invocation batch.".into());
    }
    let selected: std::collections::HashMap<_, _> = request
        .files
        .iter()
        .map(|file| (file.file.as_str(), file.revision.as_str()))
        .collect();
    if selected.len() != request.files.len() {
        return Err("Duplicate Pi skill paths.".into());
    }
    let snapshot = inspect(engine, &request.target)?;
    if snapshot.dependencies != request.dependencies {
        return Err("Pi settings changed. Refresh before saving.".into());
    }
    let items: Vec<_> = snapshot
        .skills
        .iter()
        .filter(|item| selected.contains_key(item.file.as_str()))
        .collect();
    if items.len() != selected.len()
        || items.iter().any(|item| {
            !item.can_set_visibility
                || !item.in_scope
                || selected[item.file.as_str()].len() != 64
                || !selected[item.file.as_str()]
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit())
                || selected[item.file.as_str()] != item.document_revision
                    && item
                        .lifecycle
                        .as_ref()
                        .is_some_and(|value| value["recovery"] == "conflict")
        })
    {
        return Err(
            "Native skill changed or belongs to another scope. Refresh before saving.".into(),
        );
    }
    let managed: Vec<_> = items
        .iter()
        .filter(|item| item.managed)
        .map(|item| (item.file.clone(), item.document_revision.clone()))
        .collect();
    let native: Vec<_> = items.iter().filter(|item| !item.managed).copied().collect();
    let agent = Path::new(&snapshot.agent_directory);
    let journal = agent.join(STATE);
    let mut guards = Vec::new();
    let mut proposal = None;
    if !native.is_empty() {
        plain(&journal)?;
        guards.push(SettingsLock::acquire(&journal)?);
        for item in &native {
            plain(Path::new(&item.file))?;
            guards.push(SettingsLock::acquire(Path::new(&item.file))?);
        }
        rebuild_damaged_journal(&journal)?;
        let output = run_process_with_timeout(
            engine.command(&engine.node, &engine.home).args([
                engine
                    .resources
                    .join("pi-invocation-state.mjs")
                    .to_string_lossy()
                    .as_ref(),
                "plan-batch",
                &snapshot.agent_directory,
                &serde_json::to_string(&native).map_err(|e| e.to_string())?,
                &request.mode,
            ]),
            Duration::from_secs(40),
        )?;
        if !output.success {
            return Err(output.stderr);
        }
        let value: serde_json::Value =
            serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
        let changes = value["result"]
            .as_array()
            .ok_or("Invalid invocation batch plan.")?;
        if changes.len() != native.len() {
            return Err("Incomplete invocation batch plan.".into());
        }
        for (item, change) in native.iter().zip(changes) {
            if change["file"].as_str() != Some(&item.file)
                || change["record"]["beforeHash"].as_str() != Some(&item.document_revision)
                || change["before"].as_str().map(str::as_bytes)
                    != Some(fs::read(&item.file).map_err(|e| e.to_string())?.as_slice())
            {
                return Err(
                    "Skill changed while planning invocation. Refresh before retrying.".into(),
                );
            }
        }
        if serde_json::to_vec(&value["state"])
            .map_err(|e| e.to_string())?
            .len()
            > 16 * 1024 * 1024
        {
            return Err("Invocation recovery journal exceeds its size limit.".into());
        }
        proposal = Some(value);
    }
    // Managed preferences are saved together, with the same stale-state guards as a single change.
    if !managed.is_empty() {
        visibility::change_many(
            engine,
            &request.target,
            &managed,
            &request.dependencies,
            Some(request.mode == "manual"),
        )?;
    }
    if let Some(value) = proposal {
        visibility::upgrade_owned_extension(engine, agent)?;
        let mut state = value["state"].clone();
        let changes = value["result"]
            .as_array()
            .ok_or("Invalid invocation batch plan.")?;
        // One prepared journal covers all approved files; interrupted field writes remain recoverable.
        write_settings(&journal, &state)?;
        for change in changes {
            let file = Path::new(change["file"].as_str().ok_or("Missing invocation file.")?);
            if fs::read(file).map_err(|e| e.to_string())?
                != change["before"]
                    .as_str()
                    .ok_or("Missing invocation content.")?
                    .as_bytes()
            {
                return Err(
                    "Skill changed while planning invocation. Refresh before retrying.".into(),
                );
            }
            let bytes = change["after"]
                .as_str()
                .ok_or("Missing invocation patch.")?
                .as_bytes();
            write_bytes(file, bytes)?;
            if fs::read(file).map_err(|e| e.to_string())? != bytes {
                return Err(
                    "Invocation write could not be verified. Recovery remains pending.".into(),
                );
            }
        }
        let mut policies = vec![agent.join("skills-space-visibility.json")];
        if request.target.scope == "project" {
            policies.push(
                request
                    .target
                    .directory(&engine.home)?
                    .join(".pi/skills-space-visibility.json"),
            );
        }
        for path in policies {
            if !path.exists() {
                continue;
            }
            plain(&path)?;
            let _guard = SettingsLock::acquire(&path)?;
            let mut policy = settings(&path)?;
            let entries = policy["hiddenSkills"]
                .as_array_mut()
                .ok_or("Invalid visibility policy.")?;
            let before = entries.len();
            entries.retain(|entry| {
                !native.iter().any(|item| {
                    entry["file"].as_str().is_some_and(|file| {
                        dunce::canonicalize(file).is_ok_and(|file| file.to_string_lossy() == item.file)
                    })
                })
            });
            if entries.len() != before {
                write_settings(&path, &policy)?;
            }
        }
        for change in changes {
            state["records"][change["file"].as_str().ok_or("Missing invocation file.")?]["phase"] =
                "committed".into();
        }
        write_settings(&journal, &state)?;
    }
    let after = inspect(engine, &request.target)?;
    if selected.keys().any(|file| {
        !after.skills.iter().any(|item| {
            item.file == *file
                && item.manual_only == (request.mode == "manual")
                && !item.visibility_pending
        })
    }) {
        return Err(
            "Invocation write could not be verified. Refresh and review Pi settings.".into(),
        );
    }
    Ok(after)
}
#[tauri::command]
pub async fn upstream_pi_invocation_batch(
    app: AppHandle,
    request: InvocationBatch,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        change_batch(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn upstream_pi_invocation(
    app: AppHandle,
    request: NativeChange,
) -> Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        change(&Engine::from_app(&app)?, request)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{engine, global};
    fn fixture() -> (TemporaryDirectory, Engine, PathBuf) {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let file = home.join(".pi/agent/skills/demo/SKILL.md");
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(
            &file,
            "---\nname: demo\ndescription: Native fixture\n---\nOriginal body\n",
        )
        .unwrap();
        (root, engine(&home), file)
    }
    fn request(snapshot: &Snapshot, mode: &str) -> NativeChange {
        let item = snapshot.skills.iter().find(|s| s.name == "demo").unwrap();
        NativeChange {
            target: snapshot.target.clone(),
            file: item.file.clone(),
            revision: item.document_revision.clone(),
            dependencies: snapshot.dependencies.clone(),
            mode: mode.into(),
        }
    }
    #[test]
    fn mixed_invocation_batch_preserves_managed_bytes_and_rejects_stale_files_before_writing() {
        let (_root, e, native) = fixture();
        let second = e.home.join(".pi/agent/skills/second/SKILL.md");
        let managed = e.home.join(".agents/skills/managed/SKILL.md");
        write_settings(
            &e.home.join(".agents/.skill-lock.json"),
            &serde_json::json!({"version":3,"skills":{"managed":{"source":"fixture/repo"}}}),
        )
        .unwrap();
        for (file, name) in [(&second, "second"), (&managed, "managed")] {
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(
                file,
                format!("---\nname: {name}\ndescription: Fixture\n---\nPreserved body\n"),
            )
            .unwrap();
        }
        let bytes = fs::read(&managed).unwrap();
        let original = fs::read(&native).unwrap();
        let before = inspect(&e, &global()).unwrap();
        assert_eq!(before.skills.len(), 3);
        let request_for = |snapshot: &Snapshot, mode: &str| InvocationBatch {
            target: global(),
            files: snapshot
                .skills
                .iter()
                .map(|item| InvocationFile {
                    file: item.file.clone(),
                    revision: item.document_revision.clone(),
                })
                .collect(),
            dependencies: snapshot.dependencies.clone(),
            mode: mode.into(),
        };
        let mut stale = request_for(&before, "manual");
        stale.files[1].revision = "stale".into();
        assert!(change_batch(&e, stale).is_err());
        assert_eq!(fs::read(&native).unwrap(), original);
        assert!(!e
            .home
            .join(".pi/agent/skills-space-invocation.json")
            .exists());
        assert!(!e
            .home
            .join(".pi/agent/skills-space-visibility.json")
            .exists());
        fs::write(
            &second,
            fs::read_to_string(&second).unwrap() + "Extra body edit\n",
        )
        .unwrap();
        let manual = change_batch(&e, request_for(&before, "manual")).unwrap();
        assert!(fs::read_to_string(&second)
            .unwrap()
            .contains("Extra body edit"));
        assert!(manual.skills.iter().all(|item| item.manual_only));
        assert_eq!(fs::read(&managed).unwrap(), bytes);
        let state = settings(&e.home.join(".pi/agent/skills-space-invocation.json")).unwrap();
        assert_eq!(state["records"].as_object().unwrap().len(), 2);
        assert!(state["records"]
            .as_object()
            .unwrap()
            .values()
            .all(|item| item["phase"] == "committed"));
        let policy = settings(&e.home.join(".pi/agent/skills-space-visibility.json")).unwrap();
        assert_eq!(policy["hiddenSkills"].as_array().unwrap().len(), 1);
        let automatic = change_batch(&e, request_for(&manual, "auto")).unwrap();
        assert!(automatic.skills.iter().all(|item| !item.manual_only));
        assert_eq!(fs::read(&managed).unwrap(), bytes);
        assert!(fs::read_to_string(&native)
            .unwrap()
            .contains("disable-model-invocation: false"));
        assert!(fs::read_to_string(&second)
            .unwrap()
            .contains("Preserved body"));
        assert!(inspect(&e, &global())
            .unwrap()
            .skills
            .iter()
            .all(|item| !item.manual_only));
    }
    #[test]
    fn native_internal_policy_survives_restart_false_default_and_manual_edits() {
        let (_root, e, file) = fixture();
        let original = fs::read(&file).unwrap();
        let hidden = change(&e, request(&inspect(&e, &global()).unwrap(), "manual")).unwrap();
        assert!(hidden.skills[0].manual_only);
        assert!(fs::read_to_string(&file)
            .unwrap()
            .contains("disable-model-invocation: true"));
        let restarted = engine(&e.home);
        let automatic = change(
            &restarted,
            request(&inspect(&restarted, &global()).unwrap(), "auto"),
        )
        .unwrap();
        assert!(!automatic.skills[0].manual_only);
        assert!(fs::read_to_string(&file)
            .unwrap()
            .contains("disable-model-invocation: false"));
        change(&e, request(&automatic, "default")).unwrap();
        assert_eq!(fs::read(&file).unwrap(), original);
        let stale = request(&inspect(&e, &global()).unwrap(), "manual");
        fs::write(&file,"---\nname: demo\ndescription: Edited\ndisable-model-invocation: true\n---\nUser body\n").unwrap();
        assert!(change(&e, stale).is_err());
        let observed = inspect(&e, &global()).unwrap();
        assert_eq!(
            observed.skills[0].lifecycle.as_ref().unwrap()["recovery"],
            "conflict"
        );
        change(&e, request(&observed, "auto")).unwrap();
        assert!(fs::read_to_string(&file).unwrap().contains("User body"));
        assert!(fs::read_to_string(&file)
            .unwrap()
            .contains("disable-model-invocation: false"));
    }
    #[test]
    fn external_native_rules_migrate_but_managed_files_and_locks_stay_external() {
        let (_root, e, file) = fixture();
        let shared = e.home.join(".agents/skills/managed/SKILL.md");
        write_settings(
            &e.home.join(".agents/.skill-lock.json"),
            &serde_json::json!({"version":3,"skills":{"managed":{"source":"fixture/repo"}}}),
        )
        .unwrap();
        fs::create_dir_all(shared.parent().unwrap()).unwrap();
        fs::write(
            &shared,
            "---\nname: managed\ndescription: Shared\n---\nShared body\n",
        )
        .unwrap();
        let shared_bytes = fs::read(&shared).unwrap();
        let policy = e.home.join(".pi/agent/skills-space-visibility.json");
        write_settings(&policy,&serde_json::json!({"version":1,"hiddenSkills":[{"file":file,"name":"demo","hidden":true},{"file":shared,"name":"managed","hidden":true}]})).unwrap();
        let result = reconcile(&e, &global()).unwrap();
        assert!(
            result
                .skills
                .iter()
                .find(|s| s.name == "demo")
                .unwrap()
                .manual_only
        );
        assert!(fs::read_to_string(file)
            .unwrap()
            .contains("disable-model-invocation: true"));
        assert_eq!(fs::read(shared).unwrap(), shared_bytes);
        let saved = settings(&policy).unwrap();
        assert_eq!(saved["hiddenSkills"].as_array().unwrap().len(), 1);
        assert_eq!(saved["hiddenSkills"][0]["name"], "managed");
    }
    #[test]
    fn migration_does_not_overwrite_an_unverified_existing_field() {
        let (_root, e, file) = fixture();
        let edited="---\nname: demo\ndescription: Local field\ndisable-model-invocation: false\n---\nLocal body\n";
        fs::write(&file, edited).unwrap();
        let policy = e.home.join(".pi/agent/skills-space-visibility.json");
        write_settings(&policy,&serde_json::json!({"version":1,"hiddenSkills":[{"file":dunce::canonicalize(&file).unwrap(),"name":"demo","hidden":true}]})).unwrap();
        let result = reconcile(&e, &global()).unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), edited);
        assert_eq!(
            result.skills[0].lifecycle.as_ref().unwrap()["recovery"],
            "conflict"
        );
        assert!(!result.skills[0].lifecycle.as_ref().unwrap()["configured"]
            .as_bool()
            .unwrap());
        let changed = change(&e, request(&result, "manual")).unwrap();
        assert!(changed.skills[0].manual_only);
        change(&e, request(&changed, "default")).unwrap();
        assert_eq!(fs::read_to_string(file).unwrap(), edited);
    }
    #[test]
    fn prepared_journal_recovers_only_its_field_and_preserves_body_edits() {
        let (_root, e, file) = fixture();
        let snapshot = inspect(&e, &global()).unwrap();
        let item = &snapshot.skills[0];
        let proposal = plan(&e, &snapshot.agent_directory, item, "plan", "manual").unwrap();
        let mut state = proposal["state"].clone();
        state["records"][&item.file] = proposal["result"]["record"].clone();
        write_settings(&Path::new(&snapshot.agent_directory).join(STATE), &state).unwrap();
        let result = reconcile(&e, &global()).unwrap();
        assert!(result.skills[0].manual_only);
        assert_eq!(
            result.skills[0].lifecycle.as_ref().unwrap()["recovery"],
            "consistent"
        );
        write_settings(&Path::new(&snapshot.agent_directory).join(STATE), &state).unwrap();
        fs::write(
            &file,
            "---\nname: demo\ndescription: Changed\n---\nLocal edit\n",
        )
        .unwrap();
        let result = reconcile(&e, &global()).unwrap();
        let recovered = fs::read_to_string(&file).unwrap();
        assert!(recovered.contains("Local edit"));
        assert!(recovered.contains("description: Changed"));
        assert!(recovered.contains("disable-model-invocation: true"));
        assert_eq!(
            result.skills[0].lifecycle.as_ref().unwrap()["recovery"],
            "consistent"
        );
        write_settings(&Path::new(&snapshot.agent_directory).join(STATE), &state).unwrap();
        fs::write(
            &file,
            recovered.replace(
                "disable-model-invocation: true",
                "disable-model-invocation: false",
            ),
        )
        .unwrap();
        let conflict_bytes = fs::read(&file).unwrap();
        let conflict = reconcile(&e, &global()).unwrap();
        assert_eq!(fs::read(&file).unwrap(), conflict_bytes);
        assert_eq!(
            conflict.skills[0].lifecycle.as_ref().unwrap()["recovery"],
            "conflict"
        );
        // A fresh explicit field choice supersedes the pending intent without replacing local body edits.
        let chosen = change(&e, request(&conflict, "auto")).unwrap();
        assert!(!chosen.skills[0].manual_only);
        assert!(fs::read_to_string(&file).unwrap().contains("Local edit"));
    }
    #[test]
    fn cr_only_native_document_preserves_body_through_atomic_field_writes() {
        let (_root, e, file) = fixture();
        let original = "---\rname: demo\rdescription: Fixture\r---\rBody\r";
        fs::write(&file, original).unwrap();
        let before = inspect(&e, &global()).unwrap();
        let manual = change(&e, request(&before, "manual")).unwrap();
        assert!(fs::read_to_string(&file)
            .unwrap()
            .contains("\rdisable-model-invocation: true\r"));
        let automatic = change(&e, request(&manual, "auto")).unwrap();
        assert!(fs::read_to_string(&file)
            .unwrap()
            .contains("\rdisable-model-invocation: false\r"));
        change(&e, request(&automatic, "default")).unwrap();
        assert_eq!(fs::read_to_string(file).unwrap(), original);
    }
    #[test]
    fn explicit_invocation_rebuilds_damaged_history_after_backup_without_guessing_defaults() {
        let (_root, e, file) = fixture();
        let journal = e.home.join(".pi/agent").join(STATE);
        let damaged = b"{damaged invocation history";
        fs::write(&journal, damaged).unwrap();
        let original = fs::read(&file).unwrap();
        let before = inspect(&e, &global()).unwrap();
        assert_eq!(
            fs::read(&journal).unwrap(),
            damaged,
            "inspection must not rebuild"
        );
        let actual = change(&e, request(&before, "auto")).unwrap();
        let backups: Vec<_> = fs::read_dir(journal.parent().unwrap())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("skills-space-invocation.json.corrupt-")
            })
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read(backups[0].path()).unwrap(), damaged);
        let value: serde_json::Value =
            serde_json::from_slice(&fs::read(&journal).unwrap()).unwrap();
        assert_eq!(
            value["records"][dunce::canonicalize(&file).unwrap().to_string_lossy().as_ref()]
                ["sourceDefaultKnown"],
            false
        );
        let bytes = fs::read(&file).unwrap();
        assert!(String::from_utf8_lossy(&bytes).contains("disable-model-invocation: false"));
        assert!(String::from_utf8_lossy(&bytes).contains("Original body"));
        let error = change(&e, request(&actual, "default")).unwrap_err();
        assert!(error.contains("Source default is unverified"), "{error}");
        assert_eq!(fs::read(&file).unwrap(), bytes);
        assert_ne!(original, bytes);
        let before = inspect(&e, &global()).unwrap();
        change(&e, request(&before, "manual")).unwrap();
        assert!(fs::read_to_string(&file)
            .unwrap()
            .contains("disable-model-invocation: true"));
        assert_eq!(
            fs::read_dir(journal.parent().unwrap())
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("skills-space-invocation.json.corrupt-"))
                .count(),
            1
        );
    }
}
