//! Local distribution. Original lifecycle locks are read-only here.
use super::*;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Origin {
    target: Target,
    path: String,
    name: String,
}
#[derive(Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ContentState {
    Matching,
    Different,
    Unknown,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    inspection: Inspection,
    source_revision: Option<String>,
    agents: Vec<Agent>,
    state: ContentState,
    shared_conflict: bool,
    blocked_agents: BTreeMap<String, ContentState>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetReview {
    agents: Vec<Agent>,
    state: ContentState,
    shared_conflict: bool,
    blocked_agents: BTreeMap<String, ContentState>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Relation {
    name: String,
    description: String,
    source: String,
    source_target: Target,
    target: Target,
    destination: String,
    agents: Vec<String>,
    copy: bool,
    #[serde(default)]
    single_file: bool,
    #[serde(default)]
    eve_slot: Option<String>,
    original_source: Option<String>,
    version: Option<String>,
    baseline: String,
    // Written before mutation; permits retry after content succeeded but recording failed.
    pending: Option<String>,
    #[serde(default)]
    work: Option<String>,
    #[serde(default)]
    lock_identity: serde_json::Value,
}
#[derive(Deserialize, Serialize)]
struct Relations {
    version: u8,
    records: Vec<Relation>,
}
fn location(engine: &Engine) -> PathBuf {
    engine.home.join(".skills-space/local-sync.json")
}
fn read(engine: &Engine) -> Result<Relations, String> {
    let path = location(engine);
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Relations {
                version: 1,
                records: vec![],
            })
        }
        Ok(m) if m.is_file() && !m.is_symlink() && m.len() <= 4 * 1024 * 1024 => {}
        _ => return Err("Cannot safely read local sync records.".into()),
    }
    let data: Relations = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if data.version != 1 {
        return Err("Unsupported local sync records.".into());
    }
    Ok(data)
}
fn record_lock(engine: &Engine) -> Result<pi::SettingsLock, String> {
    let path = location(engine);
    let parent = path.parent().ok_or("Invalid record directory.")?;
    if fs::symlink_metadata(parent).is_ok_and(|m| m.is_symlink() || !m.is_dir()) {
        return Err("Local sync record directory must be a regular directory.".into());
    }
    pi::SettingsLock::acquire(&path)
}
fn save(engine: &Engine, data: &Relations) -> Result<(), String> {
    let path = location(engine);
    if fs::symlink_metadata(&path).is_ok_and(|m| !m.is_file() || m.is_symlink()) {
        return Err("Sync records must be a regular file.".into());
    }
    pi::write_bytes(
        &path,
        &serde_json::to_vec_pretty(data).map_err(|e| e.to_string())?,
    )
}
fn source_signature(path: &Path) -> Result<Vec<u8>, String> {
    if path.is_file() {
        if fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX_SKILL_CONTENT_BYTES as u64 {
            return Err("Skill content could not be inspected.".into());
        }
        let bytes = fs::read(path).map_err(|e| e.to_string())?;
        let name = b"SKILL.md";
        let mut framed = Vec::new();
        framed.extend_from_slice(&(name.len() as u64).to_le_bytes());
        framed.extend_from_slice(name);
        framed.extend_from_slice(&(bytes.len() as u64).to_le_bytes());
        framed.extend(bytes);
        return Ok(framed);
    }
    let document = path.join("SKILL.md");
    if document.is_symlink()
        && fs::read_dir(path)
            .is_ok_and(|mut entries| entries.next().is_some() && entries.next().is_none())
    {
        return source_signature(&document);
    }
    tree_signature(path).ok_or_else(|| "Skill content could not be inspected.".into())
}
fn fingerprint(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    fn file(hash: &mut Sha256, path: &Path, name: &str) -> Result<(), String> {
        let mut input = fs::File::open(path).map_err(|e| e.to_string())?;
        let size = input.metadata().map_err(|e| e.to_string())?.len();
        hash.update((name.len() as u64).to_le_bytes());
        hash.update(name.as_bytes());
        hash.update(size.to_le_bytes());
        let mut buffer = [0u8; 65536];
        let mut read = 0u64;
        loop {
            let length = input.read(&mut buffer).map_err(|e| e.to_string())?;
            if length == 0 {
                break;
            }
            hash.update(&buffer[..length]);
            read += length as u64;
        }
        if read != size {
            return Err("Sync source changed during reading.".into());
        }
        Ok(())
    }
    fn visit(hash: &mut Sha256, root: &Path, path: &Path) -> Result<(), String> {
        let mut entries = fs::read_dir(path)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        entries.sort_by_key(|entry| entry.file_name());
        for entry in entries {
            let name = entry.file_name();
            if name == ".git" || name == "node_modules" {
                continue;
            }
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_dir() {
                visit(hash, root, &entry.path())?;
            } else if kind.is_file() {
                file(
                    hash,
                    &entry.path(),
                    &entry
                        .path()
                        .strip_prefix(root)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy(),
                )?;
            } else {
                return Err("Skill contains unsupported links or special files.".into());
            }
        }
        Ok(())
    }
    let document = path.join("SKILL.md");
    if document.is_symlink()
        && fs::read_dir(path)
            .is_ok_and(|mut entries| entries.next().is_some() && entries.next().is_none())
    {
        return fingerprint(&document);
    }
    let mut hash = Sha256::new();
    if path.is_file() {
        file(&mut hash, path, "SKILL.md")?;
    } else {
        visit(&mut hash, path, path)?;
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn relation_signature(engine: &Engine, r: &Relation) -> Result<Vec<u8>, String> {
    let signature = source_signature(Path::new(&r.source))?;
    if r.eve_slot.is_some() {
        eve::signature(engine, &signature)
    } else {
        Ok(signature)
    }
}
fn source_path(engine: &Engine, origin: &Origin, skill: &Skill) -> PathBuf {
    let selected = PathBuf::from(&skill.path);
    if skill.agents.iter().any(|id| id == "eve") {
        if let Ok(directory) = origin.target.directory(&engine.home) {
            let shared = directory
                .join(".agents/skills")
                .join(restoration::folder_name(&skill.name));
            if let Some(signature) = tree_signature(&shared) {
                if eve::content_matches(engine, skill, &signature) {
                    return shared;
                }
            }
        }
    }
    selected
}
fn eve_operation(r: &Relation) -> Result<Operation, String> {
    serde_json::from_value(serde_json::json!({"target":r.target,"action":"add","source":r.source,"skills":[r.name],"agents":["eve"],"copy":true,"eveSubagents":[r.eve_slot]})).map_err(|e|e.to_string())
}
fn absent(path: &Path) -> bool {
    matches!(fs::symlink_metadata(path),Err(e) if e.kind()==std::io::ErrorKind::NotFound)
}
fn source_absent(path: &Path) -> bool {
    // A missing ancestor can be an unavailable volume. Only an accessible direct parent proves deletion.
    absent(path) && path.parent().is_some_and(|p| fs::read_dir(p).is_ok())
}
fn lock_identity(
    engine: &Engine,
    target: &Target,
    name: &str,
) -> Result<serde_json::Value, String> {
    let lock = engine.lock(target)?;
    let entry = &lock["skills"][name];
    Ok(serde_json::json!([
        entry["source"],
        entry["sourceUrl"],
        entry["sourceType"]
    ]))
}
fn resolved_parent(path: &Path) -> Result<PathBuf, String> {
    let mut ancestor = path.parent().ok_or("Invalid target path.")?;
    let mut tail = vec![path
        .file_name()
        .ok_or("Invalid target name.")?
        .to_os_string()];
    while !ancestor.exists() {
        tail.push(
            ancestor
                .file_name()
                .ok_or("Cannot resolve target directory.")?
                .to_os_string(),
        );
        ancestor = ancestor
            .parent()
            .ok_or("Cannot resolve target directory.")?;
    }
    let mut actual = dunce::canonicalize(ancestor).map_err(|e| e.to_string())?;
    for part in tail.into_iter().rev() {
        actual.push(part)
    }
    Ok(actual)
}
fn destination(engine: &Engine, r: &Relation) -> Result<PathBuf, String> {
    let folder = restoration::folder_name(&r.name);
    if folder.is_empty() {
        return Err("Invalid sync skill name.".into());
    }
    let agents = engine.agents(&r.target)?;
    let p = PathBuf::from(&r.destination);
    if r.eve_slot.is_some() {
        let op = eve_operation(r)?;
        eve::validate_operation(engine, &op)?;
        return if eve::paths(&op, &engine.home, &r.name)?
            .iter()
            .any(|v| resolved_parent(v).is_ok_and(|v| v == p))
        {
            Ok(p)
        } else {
            Err("Eve sync target changed.".into())
        };
    }
    if !r.agents.is_empty()
        && r.agents.iter().all(|id| {
            agents.iter().any(|a| {
                &a.id == id
                    && resolved_parent(&Path::new(&a.path).join(&folder)).is_ok_and(|v| v == p)
                    && a.id != "eve"
            })
        })
    {
        Ok(p)
    } else {
        Err("Sync target directories changed. Review targets again.".into())
    }
}
fn owned_link(r: &Relation, p: &Path) -> bool {
    let link = if r.single_file {
        if !fs::symlink_metadata(p).is_ok_and(|m| m.is_dir() && !m.is_symlink()) {
            return false;
        }
        p.join("SKILL.md")
    } else {
        p.to_path_buf()
    };
    fs::symlink_metadata(&link).is_ok_and(|m| m.is_symlink())
        && restoration::link_destination(&link) == Some(PathBuf::from(&r.source))
}
fn origin_record(engine: &Engine, origin: &Origin) -> Result<Skill, String> {
    engine
        .inventory(&origin.target)?
        .skills
        .into_iter()
        .find(|s| Path::new(&s.path) == Path::new(&origin.path) && s.name == origin.name)
        .ok_or_else(|| "Sync origin is no longer installed. Refresh and check again.".into())
}
fn local_inspection(engine: &Engine, origin: &Origin, skill: &Skill) -> Result<Inspection, String> {
    let root = source_path(engine, origin, skill);
    let document = if root.is_file() {
        root.clone()
    } else {
        root.join("SKILL.md")
    };
    if !document.is_file() {
        return Err("This skill document is unavailable for sync.".into());
    }
    let signature = source_signature(&root).ok();
    let revision = fingerprint(&root)?;
    Ok(Inspection {
        session_id: None,
        provider: false,
        source: skill.path.clone(),
        skill_filter: Some(skill.name.clone()),
        warnings: vec![],
        skills: vec![SourceSkill {
            use_signature: None,
            download_source: None,
            download_digest: None,
            download_url: None,
            file_count: None,
            plugin_name: skill.plugin_name.clone(),
            selection_fingerprint: Some(revision.clone()),
            internal: false,
            name: skill.name.clone(),
            description: skill.description.clone(),
            path: skill.path.clone(),
            content: fs::read_to_string(document).map_err(|e| e.to_string())?,
            signature,
            fingerprint: Some(revision),
        }],
    })
}
fn target_review(
    engine: &Engine,
    origin: &Origin,
    target: &Target,
    revision: Option<&str>,
) -> Result<TargetReview, String> {
    let skill = origin_record(engine, origin)?;
    let state = match fingerprint(&source_path(engine, origin, &skill)) {
        Ok(v) if Some(v.as_str()) == revision => ContentState::Matching,
        Ok(_) => ContentState::Different,
        Err(_) => ContentState::Unknown,
    };
    let agents = engine.agents(target)?;
    let inventory = engine.inventory(target)?;
    let folder = restoration::folder_name(&skill.name);
    if folder.is_empty() {
        return Err("Invalid sync skill name.".into());
    }
    let relations = read(engine)?;
    let mut blocked = BTreeMap::new();
    for a in &agents {
        let path = resolved_parent(&Path::new(&a.path).join(&folder))?;
        if relations.records.iter().any(|r| {
            r.target == *target
                && r.destination == path.to_string_lossy()
                && r.name == origin.name
                && r.source == origin.path
                && r.pending.is_some()
        }) {
            continue;
        }
        if a.id == "eve" {
            continue;
        }
        if !absent(&path)
            || inventory
                .skills
                .iter()
                .any(|s| s.name == skill.name && s.agents.contains(&a.id))
        {
            let existing: Vec<_> = inventory
                .skills
                .iter()
                .filter(|s| s.name == skill.name && s.agents.contains(&a.id))
                .collect();
            let same = revision.is_some()
                && (fingerprint(&path).ok().as_deref() == revision
                    || !existing.is_empty()
                        && existing
                            .iter()
                            .all(|s| fingerprint(Path::new(&s.path)).ok().as_deref() == revision));
            blocked.insert(
                a.id.clone(),
                if same {
                    ContentState::Matching
                } else {
                    ContentState::Different
                },
            );
        }
    }
    Ok(TargetReview {
        agents,
        state,
        shared_conflict: false,
        blocked_agents: blocked,
    })
}
fn review(
    engine: &Engine,
    origin: &Origin,
    target: &Target,
    _previous: Option<&str>,
) -> Result<Review, String> {
    let inspection = local_inspection(engine, origin, &origin_record(engine, origin)?)?;
    let revision = inspection.skills[0].selection_fingerprint.clone();
    let checked = target_review(engine, origin, target, revision.as_deref())?;
    Ok(Review {
        inspection,
        source_revision: revision,
        agents: checked.agents,
        state: checked.state,
        shared_conflict: false,
        blocked_agents: checked.blocked_agents,
    })
}
#[tauri::command]
pub async fn upstream_skill_sync_review(
    app: AppHandle,
    webview: tauri::Webview,
    origin: Origin,
    target: Target,
    session_id: Option<String>,
    on_progress: Option<JavaScriptChannelId>,
) -> Result<Review, String> {
    let progress = on_progress.map(|id| id.channel_on(webview));
    tauri::async_runtime::spawn_blocking(move || {
        let mut engine = Engine::from_app(&app)?;
        engine.progress = progress;
        review(&engine, &origin, &target, session_id.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_skill_sync_targets(
    app: AppHandle,
    origin: Origin,
    target: Target,
    source: String,
    source_revision: Option<String>,
) -> Result<TargetReview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if source != origin.path {
            return Err("Sync origin changed.".into());
        }
        target_review(
            &Engine::from_app(&app)?,
            &origin,
            &target,
            source_revision.as_deref(),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

// Reuse bounded directory rules; never follow internal links or copy generated dependency trees.
fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir(target).map_err(|e| e.to_string())?;
    if source.is_file() {
        fs::copy(source, target.join("SKILL.md")).map_err(|e| e.to_string())?;
        return Ok(());
    }
    for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name();
        if name == ".git" || name == "node_modules" {
            continue;
        }
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_dir() {
            copy_directory(&entry.path(), &target.join(name))?
        } else if kind.is_file() {
            fs::copy(entry.path(), target.join(name)).map_err(|e| e.to_string())?;
        } else {
            return Err("Skill contains unsupported links or special files.".into());
        }
    }
    Ok(())
}
fn remove_destination(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        if metadata.file_type().is_symlink_dir() {
            return fs::remove_dir(path).map_err(|e| e.to_string());
        }
    }
    if metadata.is_dir() && !metadata.is_symlink() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
    .map_err(|e| e.to_string())
}
fn replace_link(source: &Path, target: &Path, single_file: bool) -> Result<(), String> {
    let parent = target.parent().ok_or("Invalid sync target.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!(
        ".skills-space-sync-link-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_nanos()
    ));
    let old = temporary.with_extension("previous");
    let link = if single_file {
        fs::create_dir(&temporary).map_err(|e| e.to_string())?;
        temporary.join("SKILL.md")
    } else {
        temporary.clone()
    };
    #[cfg(unix)]
    let created = std::os::unix::fs::symlink(source, &link);
    #[cfg(windows)]
    let created = if single_file {
        std::os::windows::fs::symlink_file(source, &link)
    } else {
        std::os::windows::fs::symlink_dir(source, &link)
    };
    if let Err(error) = created {
        let _ = remove_destination(&temporary);
        return Err(error.to_string());
    }
    let existed = !absent(target);
    if existed {
        if let Err(error) = fs::rename(target, &old) {
            let _ = remove_destination(&temporary);
            return Err(error.to_string());
        }
    }
    if let Err(error) = fs::rename(&temporary, target) {
        if existed {
            let _ = fs::rename(&old, target);
        }
        let _ = remove_destination(&temporary);
        return Err(error.to_string());
    }
    if existed {
        remove_destination(&old)?;
    }
    Ok(())
}
fn replace_copy(
    source: &Path,
    target: &Path,
    expected: &str,
    before: Option<&str>,
    temp: &Path,
    source_revision: &str,
    converted: Option<&[u8]>,
) -> Result<(), String> {
    let parent = target.parent().ok_or("Invalid sync destination.")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let result = (|| {
        copy_directory(source, &temp)?;
        if let Some(converted) = converted {
            eve::write_signature(temp, converted)?;
        }
        if fingerprint(&temp)? != expected || fingerprint(source)? != source_revision {
            return Err("Sync source changed during copying.".into());
        }
        if before.is_some_and(|v| fingerprint(target).ok().as_deref() != Some(v))
            || before.is_none() && !absent(target)
        {
            return Err("Sync target changed during copying.".into());
        }
        // A short rename transaction, not a copied package backup. Keep old content if replacement fails.
        let old = temp.with_extension("previous");
        if before.is_some() {
            fs::rename(target, &old).map_err(|e| e.to_string())?;
        }
        if let Err(e) = fs::rename(&temp, target) {
            if before.is_some() {
                let _ = fs::rename(&old, target);
            }
            return Err(e.to_string());
        }
        if before.is_some() {
            remove_destination(&old)?;
        }
        Ok(())
    })();
    result
}
fn write_relation(
    engine: &Engine,
    data: &mut Relations,
    index: usize,
    explicit: bool,
) -> Result<(), String> {
    let r = data.records[index].clone();
    let target = destination(engine, &r)?;
    let source = Path::new(&r.source);
    if lock_identity(engine, &r.target, &r.name)? != r.lock_identity {
        return Err(
            "Another installation manager changed this target's source record. Target retained."
                .into(),
        );
    }
    if let Some(work) = &r.work {
        let work = PathBuf::from(work);
        let parent = target.parent().ok_or("Invalid target.")?;
        if work.parent() != Some(parent)
            || !work
                .file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with(".skills-space-sync-"))
        {
            return Err("Invalid interrupted sync path.".into());
        }
        let old = work.with_extension("previous");
        if old.is_dir() && !old.is_symlink() {
            if fingerprint(&old)? != r.baseline {
                return Err("Interrupted sync content changed; files retained.".into());
            }
            if absent(&target) {
                fs::rename(&old, &target).map_err(|e| e.to_string())?;
            } else if fingerprint(&target).ok().as_ref() == r.pending.as_ref() {
                fs::remove_dir_all(&old).map_err(|e| e.to_string())?;
            } else {
                return Err("Interrupted sync target changed; files retained.".into());
            }
        }
        if work.is_dir()
            && !work.is_symlink()
            && fingerprint(&work).ok().as_ref() == r.pending.as_ref()
        {
            fs::remove_dir_all(&work).map_err(|e| e.to_string())?;
        }
        data.records[index].work = None;
        save(engine, data)?;
    }
    if r.copy {
        if target.is_symlink() && !explicit {
            return Err("Sync target was replaced by a link.".into());
        }
        let source_revision = fingerprint(source)?;
        let converted = if r.eve_slot.is_some() {
            Some(relation_signature(engine, &r)?)
        } else {
            None
        };
        let desired = converted
            .as_ref()
            .map(|signature| document_diff::revision(signature))
            .unwrap_or_else(|| source_revision.clone());
        let current = if absent(&target) {
            None
        } else {
            Some(fingerprint(&target)?)
        };
        if !explicit
            && current.as_deref() != Some(&r.baseline)
            && current.as_ref() != r.pending.as_ref()
            && current.as_deref() != Some(&desired)
            && current.is_some()
        {
            return Err("Local changes detected; synced copy was retained.".into());
        }
        if explicit {
            if let Some(current) = &current {
                data.records[index].baseline = current.clone();
            }
        }
        data.records[index].pending = Some(desired.clone());
        save(engine, data)?;
        if current.as_deref() != Some(&desired) {
            let work = target.parent().ok_or("Invalid target.")?.join(format!(
                ".skills-space-sync-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos()
            ));
            data.records[index].work = Some(work.to_string_lossy().into());
            save(engine, data)?;
            replace_copy(
                source,
                &target,
                &desired,
                current.as_deref(),
                &work,
                &source_revision,
                converted.as_deref(),
            )?;
            data.records[index].work = None;
        }
        if fingerprint(&target)? != desired {
            return Err("Synced content could not be verified.".into());
        }
        data.records[index].baseline = desired;
        data.records[index].pending = None;
    } else {
        let link = if r.single_file {
            target.join("SKILL.md")
        } else {
            target.clone()
        };
        if absent(&link)
            && (absent(&target)
                || r.single_file && fs::read_dir(&target).is_ok_and(|mut e| e.next().is_none()))
        {
            if source_absent(source) {
                return Err("Sync origin no longer exists.".into());
            }
            fs::create_dir_all(if r.single_file {
                &target
            } else {
                target.parent().ok_or("Invalid target.")?
            })
            .map_err(|e| e.to_string())?;
            #[cfg(unix)]
            std::os::unix::fs::symlink(source, &link).map_err(|e| e.to_string())?;
            #[cfg(windows)]
            {
                if r.single_file {
                    std::os::windows::fs::symlink_file(source, &link)
                } else {
                    std::os::windows::fs::symlink_dir(source, &link)
                }
                .map_err(|e| e.to_string())?;
            }
        }
        if !owned_link(&r, &target) {
            if explicit {
                replace_link(source, &target, r.single_file)?;
            } else {
                return Err("Sync link was replaced; target retained.".into());
            }
        }
        data.records[index].baseline = fingerprint(source)?;
    }
    save(engine, data)
}
fn item(skill: &str, result: Result<(), String>) -> ItemResult {
    match result {
        Ok(()) => ItemResult {
            skill: skill.into(),
            status: "complete".into(),
            message: String::new(),
            removal: None,
            eve_paths: None,
            destination: None,
            agents: vec![],
        },
        Err(e) => ItemResult {
            skill: skill.into(),
            status: "failed".into(),
            message: e,
            removal: None,
            eve_paths: None,
            destination: None,
            agents: vec![],
        },
    }
}
pub(super) fn sync(engine: &Engine, op: &Operation) -> Result<OperationResult, String> {
    let origin = op.sync_origin.as_ref().ok_or("Missing sync origin.")?;
    if op.action != "add" || op.skills != [origin.name.clone()] || op.agents.is_empty() {
        return Err("Select one installed skill and its target Agents.".into());
    }
    let installed = origin_record(engine, origin)?;
    let inspected = local_inspection(engine, origin, &installed)?;
    let desired = inspected.skills[0]
        .selection_fingerprint
        .clone()
        .ok_or("Cannot inspect sync content.")?;
    if op
        .source_hashes
        .as_ref()
        .and_then(|v| v.get(&origin.name))
        .and_then(Option::as_ref)
        != Some(&desired)
    {
        return Err("Source content changed since preview. Inspect again.".into());
    }
    let _guard = record_lock(engine)?;
    let mut data = read(engine)?;
    let inventory = engine.inventory(&op.target)?;
    let folder = restoration::folder_name(&origin.name);
    let mut source =
        dunce::canonicalize(source_path(engine, origin, &installed)).map_err(|e| e.to_string())?;
    if let Some(parent) = data
        .records
        .iter()
        .find(|r| r.destination == installed.path && r.baseline == desired && r.pending.is_none())
    {
        let upstream = Path::new(&parent.source);
        if fingerprint(upstream).ok().as_deref() == Some(&desired) {
            source = upstream.to_path_buf();
        }
    }
    eve::validate_operation(engine, op)?;
    let mut destinations = BTreeMap::<PathBuf, (Vec<String>, Option<String>)>::new();
    for id in &op.agents {
        if id == "eve" {
            let slots = if op.eve_subagents.is_empty() {
                vec!["root".into()]
            } else {
                op.eve_subagents.clone()
            };
            for (path, slot) in eve::paths(op, &engine.home, &origin.name)?
                .into_iter()
                .zip(slots)
            {
                let target = resolved_parent(&path)?;
                if target == source || dunce::canonicalize(&target).is_ok_and(|p| p == source) {
                    continue;
                }
                if target.starts_with(&source) || source.starts_with(&target) {
                    return Err("Sync source overlaps its target.".into());
                }
                destinations.insert(target, (vec![id.clone()], Some(slot)));
            }
            continue;
        }
        let a = inventory
            .agents
            .iter()
            .find(|a| &a.id == id && id != "eve")
            .ok_or("Unsupported sync target.")?;
        let target = resolved_parent(&Path::new(&a.path).join(&folder))?;
        if target == source || dunce::canonicalize(&target).is_ok_and(|p| p == source) {
            continue;
        }
        if target.starts_with(&source) || source.starts_with(&target) {
            return Err("Sync source overlaps its target.".into());
        }
        destinations.entry(target).or_default().0.push(id.clone());
    }
    let mut items = vec![];
    for (target, (agents, eve_slot)) in destinations {
        let copy = op.copy || eve_slot.is_some();
        let result = (|| {
            let index = if let Some(i) = data.records.iter().position(|r| {
                r.destination == target.to_string_lossy()
                    && r.source == source.to_string_lossy()
                    && r.name == origin.name
            }) {
                i
            } else {
                data.records.push(Relation {
                    name: origin.name.clone(),
                    description: installed.description.clone(),
                    source: source.to_string_lossy().into(),
                    source_target: origin.target.clone(),
                    target: op.target.clone(),
                    destination: target.to_string_lossy().into(),
                    agents,
                    copy,
                    single_file: source.is_file(),
                    eve_slot: eve_slot.clone(),
                    original_source: installed
                        .install_source
                        .clone()
                        .or(installed.source_url.clone())
                        .or(installed.source.clone()),
                    version: version(engine, &origin.target, &installed),
                    baseline: desired.clone(),
                    pending: Some(desired.clone()),
                    work: None,
                    lock_identity: lock_identity(engine, &op.target, &origin.name)?,
                });
                save(engine, &data)?;
                data.records.len() - 1
            };
            if data.records[index].copy != copy {
                return Err("Sync mode changed; existing target was retained.".into());
            }
            write_relation(engine, &mut data, index, true)
        })();
        let mut outcome = item(&origin.name, result);
        if !outcome.message.is_empty() {
            outcome.message = format!("{}: {}", target.display(), outcome.message)
        }
        items.push(outcome);
    }
    if items.is_empty() {
        items.push(item(&origin.name, Ok(())))
    }
    Ok(OperationResult {
        items,
        inventory: engine.inventory(&op.target).ok(),
        logs: String::new(),
    })
}
pub(super) fn version(engine: &Engine, target: &Target, skill: &Skill) -> Option<String> {
    if let Ok(data) = read(engine) {
        if let Some(r) = data.records.iter().find(|r| r.destination == skill.path) {
            return Some(r.baseline.clone());
        }
    }
    if skill.cli_managed {
        let lock = engine.lock(target).ok()?;
        return ["skillFolderHash", "computedHash", "wellKnownDigest"]
            .iter()
            .find_map(|k| lock["skills"][&skill.name][*k].as_str().map(str::to_owned));
    }
    skill
        .hermes_state
        .as_ref()
        .and_then(|s| s.version.clone())
        .or_else(|| {
            skill
                .pi_state
                .as_ref()
                .and_then(|s| s.lifecycle.as_ref())
                .and_then(|s| s["source"]["version"].as_str().map(str::to_owned))
        })
}
// Read-only discovery: no copying, record pruning or link removal during inventory loading.
pub(super) fn augment(engine: &Engine, target: &Target, inventory: &mut Inventory) {
    let data = match read(engine) {
        Ok(v) => v,
        Err(e) => {
            inventory.warnings.push(e);
            return;
        }
    };
    for r in data.records.iter().filter(|r| &r.target == target) {
        let p = match destination(engine, r) {
            Ok(p) => p,
            Err(e) => {
                inventory.warnings.push(e);
                continue;
            }
        };
        let existing = inventory.skills.iter_mut().find(|s| {
            (s.name == r.name || r.eve_slot.is_some())
                && (s.path == r.destination
                    || !r.copy
                        && owned_link(r, &p)
                        && dunce::canonicalize(&p).is_ok_and(|v| v.to_string_lossy() == s.path))
        });
        if let Some(s) = existing {
            // Never silently take over another manager's installation.
            if !r.copy && !r.single_file {
                continue;
            }
            if r.eve_slot.is_some() {
                s.name = r.name.clone();
            }
            if lock_identity(engine, &r.target, &r.name).ok().as_ref() != Some(&r.lock_identity) {
                s.issue = Some("Another installation manager changed the source record.".into());
                continue;
            }
            s.cli_managed = false;
            s.source = Some(r.source.clone());
            s.source_url = r.original_source.clone();
            s.install_source = Some(r.source.clone());
            s.source_type = Some("local-sync".into());
            s.updateable = true;
        } else if !r.copy
            && owned_link(r, &p)
            && !(if r.single_file {
                p.join("SKILL.md").is_file()
            } else {
                p.is_dir()
            })
        {
            if let Ok(s) = serde_json::from_value::<Skill>(
                serde_json::json!({"name":r.name,"path":r.destination,"description":r.description,"agents":r.agents,"source":r.source,"sourceUrl":r.original_source,"sourceType":"local-sync","installSource":r.source,"updateable":false}),
            ) {
                inventory.skills.push(s)
            }
        }
    }
}
pub(super) fn status(engine: &Engine, target: &Target, name: &str) -> Option<UpdateStatus> {
    let data = read(engine).ok()?;
    let records: Vec<_> = data
        .records
        .iter()
        .filter(|r| &r.target == target && r.name == name)
        .collect();
    if records.is_empty() {
        return None;
    }
    let first = records[0];
    let mut current_revision = first.baseline.clone();
    let mut status = "current";
    let mut local = "clean";
    let mut message = String::new();
    let mut latest = None;
    for r in &records {
        if let Err(e) = destination(engine, r) {
            status = "unknown";
            message = e;
            break;
        }
        let source = if r.eve_slot.is_some() {
            relation_signature(engine, r).map(|v| document_diff::revision(&v))
        } else {
            fingerprint(Path::new(&r.source))
        };
        let current = fingerprint(Path::new(&r.destination));
        if r.copy
            && current
                .as_ref()
                .is_ok_and(|v| v != &r.baseline && Some(v) != r.pending.as_ref())
        {
            local = "modified";
            message = "Local changes detected; synced copy was retained.".into();
        }
        match source {
            Ok(v) => {
                if v != r.baseline {
                    status = "available";
                    current_revision = r.baseline.clone();
                }
                latest = Some(v)
            }
            Err(e) => {
                status = if source_absent(Path::new(&r.source)) {
                    "removed"
                } else {
                    "unknown"
                };
                message = e;
                break;
            }
        }
    }
    Some(UpdateStatus {
        skill: name.into(),
        status: status.into(),
        local_state: local.into(),
        current_revision: Some(current_revision),
        latest_revision: latest,
        message,
    })
}
pub(super) fn update(
    engine: &Engine,
    target: &Target,
    names: &[String],
) -> Result<Vec<ItemResult>, String> {
    update_selected(engine, target, names, &[])
}
pub(super) fn update_selected(
    engine: &Engine,
    target: &Target,
    names: &[String],
    agents: &[String],
) -> Result<Vec<ItemResult>, String> {
    let _guard = record_lock(engine)?;
    let mut data = read(engine)?;
    let mut items = vec![];
    for index in 0..data.records.len() {
        let r = &data.records[index];
        if &r.target != target
            || !names.contains(&r.name)
            || !agents.is_empty() && !r.agents.iter().any(|id| agents.contains(id))
        {
            continue;
        }
        let name = r.name.clone();
        let p = r.destination.clone();
        let agents = r.agents.clone();
        let mut result = item(&name, write_relation(engine, &mut data, index, true));
        result.destination = Some(p.clone());
        result.agents = agents;
        if !result.message.is_empty() {
            result.message = format!("{p}: {}", result.message)
        }
        items.push(result);
    }
    Ok(items)
}
// Propagate only from successfully updated source paths; errors are returned to the existing result flow.
pub(super) fn propagate(engine: &Engine, sources: &[String]) -> Result<Vec<ItemResult>, String> {
    if !location(engine).exists() {
        return Ok(vec![]);
    }
    let _guard = record_lock(engine)?;
    let mut data = read(engine)?;
    let mut items = vec![];
    data.records.retain(|r| {
        !((r.pending.is_none()
            && absent(Path::new(&r.destination))
            && Path::new(&r.destination)
                .parent()
                .is_some_and(|p| fs::read_dir(p).is_ok()))
            || (r.copy && source_absent(Path::new(&r.source))))
    });
    save(engine, &data)?;
    for index in 0..data.records.len() {
        if !sources.contains(&data.records[index].source) {
            continue;
        }
        let name = data.records[index].name.clone();
        let destination = data.records[index].destination.clone();
        let agents = data.records[index].agents.clone();
        let mut result = item(&name, write_relation(engine, &mut data, index, false));
        result.destination = Some(destination);
        result.agents = agents;
        items.push(result);
    }
    Ok(items)
}
pub(super) fn remove(engine: &Engine, op: &Operation) -> Result<OperationResult, String> {
    let _guard = record_lock(engine)?;
    let mut data = read(engine)?;
    let mut items = vec![];
    let mut remove = vec![];
    for (i, r) in data.records.iter().enumerate() {
        if r.target != op.target
            || !op.skills.contains(&r.name)
            || !r.agents.iter().any(|a| op.agents.contains(a))
        {
            continue;
        }
        let result = (|| {
            let p = destination(engine, r)?;
            if absent(&p) {
                return Ok(());
            }
            if !op.removals.as_ref().is_some_and(|plans| {
                plans.iter().any(|plan| {
                    plan.skill == r.name
                        && plan
                            .paths
                            .iter()
                            .any(|v| v.selected && v.path == r.destination)
                })
            }) {
                return Err("Removal target changed. Review again.".into());
            }
            if r.copy {
                if p.is_symlink() {
                    return Err("Sync target was replaced by a link. Review the new target before uninstalling.".into());
                }
                remove_destination(&p)?;
            } else {
                if !owned_link(r, &p) {
                    return Err("Sync link was replaced; target retained.".into());
                }
                remove_destination(&p)?;
            }
            Ok(())
        })();
        if result.is_ok() {
            remove.push(i)
        }
        items.push(item(&r.name, result));
    }
    for i in remove.into_iter().rev() {
        data.records.remove(i);
    }
    save(engine, &data)?;
    Ok(OperationResult {
        items,
        inventory: engine.inventory(&op.target).ok(),
        logs: String::new(),
    })
}

pub(super) fn selected_only(engine: &Engine, op: &Operation) -> Result<bool, String> {
    let Ok(data) = read(engine) else {
        return Ok(false);
    };
    Ok(!op.agents.is_empty()
        && op.skills.iter().all(|name| {
            op.agents.iter().all(|agent| {
                data.records
                    .iter()
                    .any(|r| r.target == op.target && r.name == *name && r.agents.contains(agent))
            })
        }))
}

pub(super) fn removal_plan(
    engine: &Engine,
    op: &Operation,
) -> Result<Option<Vec<RemovalPlan>>, String> {
    if !selected_only(engine, op)? {
        return Ok(None);
    }
    let data = read(engine)?;
    let mut plans = vec![];
    for name in &op.skills {
        let mut paths = vec![];
        for r in data.records.iter().filter(|r| {
            r.target == op.target
                && r.name == *name
                && r.agents.iter().any(|id| op.agents.contains(id))
        }) {
            let p = destination(engine, r)?;
            paths.push(RemovalPath {
                path: r.destination.clone(),
                kind: if r.copy { "copy" } else { "link" }.into(),
                agents: r.agents.clone(),
                selected: true,
                link_target: restoration::link_destination(&p).map(|p| p.to_string_lossy().into()),
            });
        }
        plans.push(RemovalPlan {
            skill: name.clone(),
            agents: op.agents.clone(),
            paths,
            shared: false,
            cleanup_possible: false,
            lock_present: false,
            lock_record: serde_json::Value::Null,
        });
    }
    Ok(Some(plans))
}
// Restrict CLI reinstalls to original targets when local associations exist. CLI bytes and locks remain unchanged.
pub(super) fn update_args(engine: &Engine, op: &Operation) -> Result<Option<Vec<String>>, String> {
    if op.action != "update" || op.skills.len() != 1 {
        return Ok(None);
    }
    let Ok(data) = read(engine) else {
        return Ok(None);
    };
    let inventory = engine.inventory(&op.target)?;
    let name = &op.skills[0];
    if !data.records.iter().any(|r| {
        r.name == *name
            && inventory
                .skills
                .iter()
                .any(|s| s.name == *name && s.path == r.source)
    }) {
        return Ok(None);
    }
    let originals: Vec<_> = inventory
        .skills
        .iter()
        .filter(|s| s.name == *name && s.source_type.as_deref() != Some("local-sync"))
        .collect();
    let lock = engine.lock(&op.target)?;
    let entry = &lock["skills"][name];
    let source = entry["sourceUrl"]
        .as_str()
        .or_else(|| entry["source"].as_str())
        .ok_or("Original update source is missing.")?;
    let source = match entry["ref"].as_str() {
        Some(reference) => format!("{source}#{reference}"),
        None => source.to_owned(),
    };
    let mut agents: Vec<_> = originals
        .iter()
        .flat_map(|s| s.agents.iter())
        .filter(|id| {
            !data
                .records
                .iter()
                .any(|r| r.target == op.target && r.name == *name && r.agents.contains(id))
        })
        .cloned()
        .collect();
    agents.sort();
    agents.dedup();
    if agents.is_empty() {
        return Err("Original update targets could not be resolved.".into());
    }
    let mut add = op.clone();
    add.action = "add".into();
    add.source = Some(source);
    add.agents = agents;
    add.include_internal = false;
    operation_args(engine, &add).map(Some)
}
pub(super) fn has_relations(engine: &Engine, names: &[String]) -> Result<bool, String> {
    Ok(read(engine).is_ok_and(|data| data.records.iter().any(|r| names.contains(&r.name))))
}

pub(super) fn lifecycle_inventory(
    engine: &Engine,
    target: &Target,
    action: &str,
) -> Result<Inventory, String> {
    let mut inventory = engine.inventory(target)?;
    if action == "update" {
        inventory
            .skills
            .retain(|s| s.source_type.as_deref() != Some("local-sync"));
    }
    Ok(inventory)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{addition, engine, global};
    fn fixture() -> (TemporaryDirectory, Engine, Origin) {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let source = home.join(".hermes/skills/category/fixture-skill");
        fs::create_dir_all(source.join("references")).unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();
        fs::create_dir_all(home.join(".codeium/windsurf")).unwrap();
        fs::write(source.join("SKILL.md"),"---\nname: fixture-skill\ndescription: Local sync fixture\ndisable-model-invocation: true\n---\nBody\n").unwrap();
        fs::write(source.join("references/one.txt"), "original").unwrap();
        fs::write(
            home.join(".hermes/skills/.bundled_manifest"),
            "fixture-skill:1234567890abcdef\n",
        )
        .unwrap();
        let home = dunce::canonicalize(home).unwrap();
        let source = dunce::canonicalize(source).unwrap();
        let e = engine(&home);
        let o = Origin {
            target: global(),
            path: source.to_string_lossy().into(),
            name: "fixture-skill".into(),
        };
        (temp, e, o)
    }
    fn operation(e: &Engine, o: &Origin, copy: bool, agents: Vec<String>) -> Operation {
        let review = review(e, o, &global(), None).unwrap();
        let mut op = addition(Path::new(&o.path), global(), copy);
        op.sync_origin = Some(o.clone());
        op.agents = agents;
        op.source_hashes = Some(BTreeMap::from([(o.name.clone(), review.source_revision)]));
        op
    }
    #[test]
    fn copy_sync_hashes_large_content_without_preview_limits_and_preserves_old_record_hashes() {
        let (_temporary, engine, origin) = fixture();
        let source = Path::new(&origin.path);
        assert_eq!(
            fingerprint(source).unwrap(),
            document_diff::revision(&tree_signature(source).unwrap())
        );
        fs::write(
            source.join("large.bin"),
            vec![0u8; MAX_SKILL_CONTENT_BYTES + 1],
        )
        .unwrap();
        let operation = operation(&engine, &origin, true, vec!["claude-code".into()]);
        let result = apply(&engine, &operation).unwrap();
        assert!(result.items.iter().all(|item| item.status == "complete"));
        let target = engine.home.join(".claude/skills/fixture-skill");
        assert_eq!(
            fs::metadata(target.join("large.bin")).unwrap().len(),
            (MAX_SKILL_CONTENT_BYTES + 1) as u64
        );
        fs::write(source.join("references/one.txt"), "next version").unwrap();
        assert_eq!(
            status(&engine, &global(), &origin.name).unwrap().status,
            "available"
        );
        assert!(update(&engine, &global(), &[origin.name])
            .unwrap()
            .iter()
            .all(|item| item.status == "complete"));
        assert_eq!(
            fs::read_to_string(target.join("references/one.txt")).unwrap(),
            "next version"
        );
    }
    #[test]
    fn standalone_file_copy_link_update_and_owned_cleanup() {
        for copy in [false, true] {
            let (_f, e, _) = fixture();
            let root = e.home.join(".pi/agent/skills");
            fs::create_dir_all(&root).unwrap();
            let source = root.join("standalone.md");
            let original =
                "---\nname: fixture-skill\ndescription: Single file fixture\n---\nSingle body\n";
            fs::write(&source, original).unwrap();
            fs::write(root.join("other.md"), "Unrelated file").unwrap();
            let o = Origin {
                target: global(),
                name: "fixture-skill".into(),
                path: source.to_string_lossy().into(),
            };
            let op = operation(&e, &o, copy, vec!["claude-code".into()]);
            let result = sync(&e, &op).unwrap();
            assert!(
                result.items.iter().all(|i| i.status == "complete"),
                "{}",
                serde_json::to_string(&result).unwrap()
            );
            let target = e.home.join(".claude/skills/fixture-skill");
            assert_eq!(
                fs::read_to_string(target.join("SKILL.md")).unwrap(),
                original
            );
            assert_eq!(fs::read_dir(&target).unwrap().count(), 1);
            assert_eq!(target.join("SKILL.md").is_symlink(), !copy);
            let changed = original.replace("Single body", "Updated body");
            fs::write(&source, &changed).unwrap();
            if copy {
                fs::write(target.join("SKILL.md"), "Local edits").unwrap();
                let result = propagate(&e, &[source.to_string_lossy().into()]).unwrap();
                assert!(result.iter().any(|i| i.status == "failed"));
                assert_eq!(
                    fs::read_to_string(target.join("SKILL.md")).unwrap(),
                    "Local edits"
                );
                fs::write(target.join("SKILL.md"), original).unwrap();
                assert!(propagate(&e, &[source.to_string_lossy().into()])
                    .unwrap()
                    .iter()
                    .all(|i| i.status == "complete"));
            }
            assert_eq!(
                fs::read_to_string(target.join("SKILL.md")).unwrap(),
                changed
            );
            assert_eq!(
                fs::read_to_string(root.join("other.md")).unwrap(),
                "Unrelated file"
            );
            if !copy {
                fs::remove_file(&source).unwrap();
                let mut removal = op.clone();
                removal.action = "remove".into();
                removal.sync_origin = None;
                removal.removals = removal_plan(&e, &removal).unwrap();
                assert!(remove(&e, &removal)
                    .unwrap()
                    .items
                    .iter()
                    .all(|i| i.status == "complete"));
                assert!(!target.exists());
                assert!(root.join("other.md").exists());
            }
        }
    }
    #[test]
    fn eve_sync_keeps_conversion_slots_assets_and_local_edit_protection() {
        let (_f, e, o) = fixture();
        let project = e.home.join("project");
        fs::create_dir_all(project.join("agent/subagents/alpha")).unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        let mut op = operation(&e, &o, false, vec!["eve".into()]);
        op.target = target.clone();
        op.eve_subagents = vec!["root".into(), "alpha".into()];
        let mut overlap = op.clone();
        overlap.target.project_path = Some(o.path.clone());
        overlap.eve_subagents = vec!["root".into()];
        assert!(sync(&e, &overlap).err().unwrap().contains("overlaps"));
        let source_before = tree_signature(Path::new(&o.path)).unwrap();
        let result = sync(&e, &op).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{}",
            serde_json::to_string(&result).unwrap()
        );
        let paths = eve::paths(&op, &e.home, &o.name).unwrap();
        for p in &paths {
            let doc = fs::read_to_string(p.join("SKILL.md")).unwrap();
            assert!(!doc.contains("disable-model-invocation"));
            assert!(doc.contains("name: fixture-skill"));
            assert!(doc.contains("Body"));
            assert_eq!(
                fs::read_to_string(p.join("references/one.txt")).unwrap(),
                "original"
            );
            assert!(!p.is_symlink());
        }
        assert_eq!(tree_signature(Path::new(&o.path)).unwrap(), source_before);
        let inventory = e.inventory(&target).unwrap();
        assert_eq!(
            inventory
                .skills
                .iter()
                .filter(|s| s.name == o.name && s.source_type.as_deref() == Some("local-sync"))
                .count(),
            2
        );
        fs::write(paths[0].join("references/one.txt"), "Local edit").unwrap();
        fs::write(
            Path::new(&o.path).join("references/one.txt"),
            "Updated asset",
        )
        .unwrap();
        let outcomes = propagate(&e, &[o.path.clone()]).unwrap();
        assert_eq!(outcomes.iter().filter(|i| i.status == "failed").count(), 1);
        assert_eq!(
            fs::read_to_string(paths[0].join("references/one.txt")).unwrap(),
            "Local edit"
        );
        assert_eq!(
            fs::read_to_string(paths[1].join("references/one.txt")).unwrap(),
            "Updated asset"
        );
        fs::write(paths[0].join("references/one.txt"), "original").unwrap();
        assert!(propagate(&e, &[o.path.clone()])
            .unwrap()
            .iter()
            .all(|i| i.status == "complete"));
        assert_eq!(
            fs::read_to_string(paths[0].join("references/one.txt")).unwrap(),
            "Updated asset"
        );
        assert!(!project.join(".agents/skills-lock.json").exists());
        assert!(!e.home.join(".agents/.skill-lock.json").exists());
    }
    #[test]
    fn native_copy_and_direct_link_keep_locks_source_and_restart_records() {
        for copy in [false, true] {
            let (_temp, e, o) = fixture();
            let before = tree_signature(Path::new(&o.path));
            let lock = e.lock(&global()).unwrap();
            let op = operation(&e, &o, copy, vec!["claude-code".into(), "windsurf".into()]);
            let result = apply(&e, &op).unwrap();
            assert!(
                result.items.iter().all(|i| i.status == "complete"),
                "{}",
                serde_json::to_string(&result).unwrap()
            );
            let target = e.home.join(".claude/skills/fixture-skill");
            assert_eq!(target.is_symlink(), !copy);
            if !copy {
                assert_eq!(fs::read_link(&target).unwrap(), PathBuf::from(&o.path))
            }
            assert_eq!(tree_signature(&target), before);
            assert_eq!(tree_signature(Path::new(&o.path)), before);
            assert_eq!(e.lock(&global()).unwrap(), lock);
            let restarted = engine(&e.home);
            let data = read(&restarted).unwrap();
            assert_eq!(data.records.len(), 2);
            assert_eq!(data.records[0].baseline, fingerprint(&target).unwrap());
            let source = origin_record(&restarted, &o).unwrap();
            assert_eq!(
                version(&restarted, &global(), &source).as_deref(),
                Some("1234567890abcdef")
            );
        }
    }
    #[test]
    fn stale_source_reviews_are_rejected_but_confirmed_target_replacements_are_allowed() {
        let (_temp, e, o) = fixture();
        let mut op = operation(
            &e,
            &o,
            true,
            vec!["codex".into(), "pi".into(), "universal".into()],
        );
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].status, "complete");
        assert_eq!(read(&e).unwrap().records.len(), 1);
        op.agents = vec!["claude-code".into()];
        fs::write(
            Path::new(&o.path).join("references/one.txt"),
            "source changed",
        )
        .unwrap();
        assert!(apply(&e, &op).is_err());
        let target = e.home.join(".claude/skills/fixture-skill");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("keep"), "independent").unwrap();
        let op = operation(&e, &o, true, vec!["claude-code".into()]);
        let result = apply(&e, &op).unwrap();
        assert_eq!(
            result.items[0].status, "complete",
            "{}",
            result.items[0].message
        );
        assert!(!target.join("keep").exists());
        assert!(target.join("SKILL.md").is_file());
    }
    #[test]
    fn propagation_preserves_modified_copies_and_retry_skips_completed_content() {
        let (_temp, e, o) = fixture();
        let op = operation(&e, &o, true, vec!["claude-code".into(), "windsurf".into()]);
        apply(&e, &op).unwrap();
        let claude = e.home.join(".claude/skills/fixture-skill");
        let windsurf = e.home.join(".codeium/windsurf/skills/fixture-skill");
        fs::write(claude.join("references/one.txt"), "local edit").unwrap();
        fs::write(Path::new(&o.path).join("references/one.txt"), "new source").unwrap();
        let result = propagate(&e, &[o.path.clone()]).unwrap();
        assert_eq!(result.iter().filter(|i| i.status == "failed").count(), 1);
        assert_eq!(result.iter().filter(|i| i.status == "complete").count(), 1);
        let failed = result.iter().find(|i| i.status == "failed").unwrap();
        assert_eq!(
            failed.destination.as_deref().map(Path::new),
            Some(claude.as_path())
        );
        assert_eq!(failed.agents, vec!["claude-code"]);
        assert_eq!(
            fs::read_to_string(claude.join("references/one.txt")).unwrap(),
            "local edit"
        );
        assert_eq!(
            fs::read_to_string(windsurf.join("references/one.txt")).unwrap(),
            "new source"
        );
        let checked = status(&e, &global(), &o.name).unwrap();
        assert_eq!(checked.local_state, "modified");
        fs::write(claude.join("references/one.txt"), "original").unwrap();
        let result = update(&e, &global(), &[o.name.clone()]).unwrap();
        assert!(result.iter().all(|i| i.status == "complete"));
        assert_eq!(tree_signature(&claude), tree_signature(Path::new(&o.path)));
        assert_eq!(status(&e, &global(), &o.name).unwrap().status, "current");
        let manually_updated = update(&e, &global(), &[o.name.clone()]).unwrap();
        assert!(manually_updated
            .iter()
            .all(|item| item.status == "complete"));
        assert_eq!(
            fs::read_to_string(claude.join("references/one.txt")).unwrap(),
            "new source"
        );
        fs::write(
            claude.join("references/one.txt"),
            "modified before explicit uninstall",
        )
        .unwrap();
        let mut uninstall = op.clone();
        uninstall.action = "remove".into();
        uninstall.sync_origin = None;
        uninstall.agents = vec!["claude-code".into()];
        uninstall.removals = Some(removal_plan(&e, &uninstall).unwrap().unwrap());
        let removed = apply(&e, &uninstall).unwrap();
        assert!(removed.items.iter().all(|item| item.status == "complete"));
        assert!(!claude.exists());
        assert!(windsurf.exists());
    }
    #[test]
    fn interrupted_rename_and_completed_content_recover_from_saved_pending_record() {
        let (_temp, e, o) = fixture();
        apply(&e, &operation(&e, &o, true, vec!["claude-code".into()])).unwrap();
        let target = e.home.join(".claude/skills/fixture-skill");
        let work = target.parent().unwrap().join(".skills-space-sync-fixture");
        let mut data = read(&e).unwrap();
        fs::write(Path::new(&o.path).join("references/one.txt"), "next").unwrap();
        data.records[0].pending = Some(fingerprint(Path::new(&o.path)).unwrap());
        data.records[0].work = Some(work.to_string_lossy().into());
        save(&e, &data).unwrap();
        copy_directory(Path::new(&o.path), &work).unwrap();
        fs::rename(&target, work.with_extension("previous")).unwrap();
        let restarted = engine(&e.home);
        assert!(update(&restarted, &global(), &[o.name.clone()])
            .unwrap()
            .iter()
            .all(|i| i.status == "complete"));
        assert_eq!(tree_signature(&target), tree_signature(Path::new(&o.path)));
        assert!(!work.with_extension("previous").exists());
        assert!(read(&restarted).unwrap().records[0].pending.is_none());
        // Simulate successful content replacement followed by failed final record write.
        let mut data = read(&e).unwrap();
        data.records[0].baseline = "old".into();
        data.records[0].pending = Some(fingerprint(&target).unwrap());
        save(&e, &data).unwrap();
        assert!(update(&e, &global(), &[o.name.clone()])
            .unwrap()
            .iter()
            .all(|i| i.status == "complete"));
    }
    #[test]
    fn broken_link_cleanup_uses_existing_removal_review_and_never_deletes_replacements() {
        let (_temp, e, o) = fixture();
        apply(&e, &operation(&e, &o, false, vec!["claude-code".into()])).unwrap();
        let target = e.home.join(".claude/skills/fixture-skill");
        fs::remove_dir_all(Path::new(&o.path).parent().unwrap()).unwrap();
        let inventory = e.inventory(&global()).unwrap();
        assert!(inventory
            .skills
            .iter()
            .any(|s| Path::new(&s.path) == target));
        let mut op = addition(Path::new(&o.path), global(), false);
        op.action = "remove".into();
        op.source = None;
        op.agents = vec!["claude-code".into()];
        op.removals = Some(super::removal_plan(&e, &op).unwrap().unwrap());
        #[cfg(unix)]
        fs::remove_file(&target).unwrap();
        #[cfg(windows)]
        fs::remove_dir(&target).unwrap();
        fs::create_dir(&target).unwrap();
        fs::write(target.join("keep"), "replacement").unwrap();
        assert_eq!(apply(&e, &op).unwrap().items[0].status, "failed");
        assert!(target.join("keep").is_file());
        fs::remove_dir_all(&target).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&o.path, &target).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&o.path, &target).unwrap();
        assert_eq!(apply(&e, &op).unwrap().items[0].status, "complete");
        assert!(absent(&target));
        assert!(read(&e).unwrap().records.is_empty());
    }
    #[test]
    fn deleted_sources_detach_copies_and_deleted_targets_are_not_reinstalled() {
        let (_temp, e, o) = fixture();
        apply(
            &e,
            &operation(&e, &o, true, vec!["claude-code".into(), "windsurf".into()]),
        )
        .unwrap();
        let claude = e.home.join(".claude/skills/fixture-skill");
        let windsurf = e.home.join(".codeium/windsurf/skills/fixture-skill");
        fs::remove_dir_all(&windsurf).unwrap();
        propagate(&e, &[o.path.clone()]).unwrap();
        assert!(absent(&windsurf));
        assert_eq!(read(&e).unwrap().records.len(), 1);
        fs::remove_dir_all(&o.path).unwrap();
        propagate(&e, &[o.path.clone()]).unwrap();
        assert!(claude.join("SKILL.md").is_file());
        assert!(read(&e).unwrap().records.is_empty());
    }
    #[test]
    fn external_installation_lock_takeover_blocks_sync_writes() {
        let (_temp, e, o) = fixture();
        apply(&e, &operation(&e, &o, true, vec!["claude-code".into()])).unwrap();
        let source = Path::new(&o.path);
        let mut add = addition(source, global(), true);
        add.agents = vec!["claude-code".into()];
        apply(&e, &add).unwrap();
        fs::write(source.join("references/one.txt"), "next").unwrap();
        let before = tree_signature(&e.home.join(".claude/skills/fixture-skill"));
        assert!(update(&e, &global(), &[o.name.clone()])
            .unwrap()
            .iter()
            .all(|i| i.status == "failed"));
        assert_eq!(
            tree_signature(&e.home.join(".claude/skills/fixture-skill")),
            before
        );
    }
}

pub(super) fn detach_removed_sources(engine: &Engine) -> Result<(), String> {
    if !location(engine).exists() {
        return Ok(());
    }
    let _guard = record_lock(engine)?;
    let mut data = read(engine)?;
    let count = data.records.len();
    data.records.retain(|r| {
        !(r.copy && source_absent(Path::new(&r.source)))
            && !(r.pending.is_none() && source_absent(Path::new(&r.destination)))
    });
    if data.records.len() != count {
        save(engine, &data)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    use crate::upstream::tests::{addition, engine, global};
    #[test]
    fn original_cli_source_update_propagates_and_preserves_modified_associated_copy() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let source = temp.0.join("source");
        fs::create_dir_all(source.join("references")).unwrap();
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(home.join(".claude")).unwrap();
        fs::write(
            source.join("SKILL.md"),
            "---\nname: fixture-skill\ndescription: Git update association fixture\n---\nBody\n",
        )
        .unwrap();
        fs::write(source.join("references/one.txt"), "original").unwrap();
        let e = engine(&home);
        let git = |args: &[&str]| {
            let out = run_process(e.command(Path::new("git"), &source).args(args)).unwrap();
            assert!(out.success, "{}", out.stderr)
        };
        git(&["init", "-b", "main"]);
        git(&["add", "."]);
        git(&[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-m",
            "initial",
        ]);
        let url = "https://skills-fixture.invalid/local-sync/source.git";
        fs::write(
            home.join(".gitconfig"),
            format!(
                "[url \"{}\"]\n insteadOf = {url}\n",
                crate::upstream::tests::file_url(&source)
            ),
        )
        .unwrap();
        let mut install = addition(&source, global(), true);
        install.source = Some(url.into());
        install.agents = vec!["codex".into()];
        let result = apply(&e, &install).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        let original = e
            .inventory(&global())
            .unwrap()
            .skills
            .into_iter()
            .find(|s| s.name == "fixture-skill" && s.cli_managed)
            .unwrap();
        let origin = Origin {
            target: global(),
            name: original.name.clone(),
            path: original.path.clone(),
        };
        let preview = review(&e, &origin, &global(), None).unwrap();
        let mut sync = addition(Path::new(&origin.path), global(), true);
        sync.agents = vec!["claude-code".into()];
        sync.sync_origin = Some(origin.clone());
        sync.source_hashes = Some(BTreeMap::from([(
            origin.name.clone(),
            preview.source_revision,
        )]));
        assert_eq!(apply(&e, &sync).unwrap().items[0].status, "complete");
        let target = home.join(".claude/skills/fixture-skill");
        fs::write(target.join("references/one.txt"), "local change").unwrap();
        fs::write(source.join("references/one.txt"), "new upstream").unwrap();
        git(&["add", "."]);
        git(&[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-m",
            "update",
        ]);
        let mut update = install.clone();
        update.action = "update".into();
        update.source = None;
        update.agents = vec![];
        let result = apply(&e, &update).unwrap();
        assert_eq!(
            result.items[0].status, "complete",
            "{} {}",
            result.items[0].message, result.logs
        );
        assert!(result.items.iter().any(|i| i.status == "failed"));
        assert_eq!(
            fs::read_to_string(target.join("references/one.txt")).unwrap(),
            "local change"
        );
        assert_eq!(
            fs::read_to_string(Path::new(&origin.path).join("references/one.txt")).unwrap(),
            "new upstream"
        );
        assert_eq!(
            e.lock(&global()).unwrap()["skills"]["fixture-skill"]["sourceUrl"],
            url
        );
        let protected = check_updates(&e, &global()).unwrap();
        assert_eq!(
            protected
                .iter()
                .find(|s| s.skill == origin.name)
                .unwrap()
                .local_state,
            "modified"
        );
        fs::write(target.join("references/one.txt"), "original").unwrap();
        let retry = check_updates(&e, &global()).unwrap();
        let pending = retry.iter().find(|s| s.skill == origin.name).unwrap();
        assert_eq!(pending.status, "available");
        assert_ne!(pending.current_revision, pending.latest_revision);
        let result = apply(&e, &update).unwrap();
        assert!(
            result.items.iter().all(|i| i.status == "complete"),
            "{} {}",
            serde_json::to_string(&result).unwrap(),
            result.logs
        );
        assert_eq!(
            fs::read_to_string(target.join("references/one.txt")).unwrap(),
            "new upstream"
        );
    }
}

pub(super) fn has_store(engine: &Engine) -> bool {
    location(engine).exists()
}

#[cfg(test)]
mod project_tests {
    use super::*;
    use crate::upstream::tests::{addition, engine, global};
    #[test]
    fn project_sync_uses_installed_global_bytes_without_global_or_project_cli_lock_changes() {
        let temp = TemporaryDirectory::new().unwrap();
        let home = temp.0.join("home");
        let source = home.join(".pi/agent/skills/native");
        let project = temp.0.join("project");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir(&project).unwrap();
        fs::write(
            source.join("SKILL.md"),
            "---\nname: native\ndescription: Project local fixture\n---\nBody\n",
        )
        .unwrap();
        let home = dunce::canonicalize(home).unwrap();
        let source = dunce::canonicalize(source).unwrap();
        let project = dunce::canonicalize(project).unwrap();
        let e = engine(&home);
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into()),
        };
        let origin = Origin {
            target: global(),
            name: "native".into(),
            path: source.to_string_lossy().into(),
        };
        let preview = review(&e, &origin, &target, None).unwrap();
        assert_eq!(preview.state, ContentState::Matching);
        let mut op = addition(&source, target.clone(), false);
        op.skills = vec!["native".into()];
        op.sync_origin = Some(origin);
        op.source_hashes = Some(BTreeMap::from([("native".into(), preview.source_revision)]));
        op.agents = vec!["claude-code".into()];
        let result = apply(&e, &op).unwrap();
        assert!(result.items.iter().all(|i| i.status == "complete"));
        let path = project.join(".claude/skills/native");
        assert!(path.is_symlink());
        assert_eq!(tree_signature(&path), tree_signature(&source));
        assert!(!project.join("skills-lock.json").exists());
        assert!(e.lock(&global()).unwrap()["skills"]
            .as_object()
            .unwrap()
            .is_empty());
        assert_eq!(read(&e).unwrap().records[0].target, target);
    }
}

pub(super) fn propagate_roots(
    engine: &Engine,
    roots: &[PathBuf],
) -> Result<Vec<ItemResult>, String> {
    if !has_store(engine) {
        return Ok(vec![]);
    }
    let mut sources: Vec<_> = read(engine)?
        .records
        .into_iter()
        .filter(|r| {
            roots
                .iter()
                .any(|root| Path::new(&r.source).starts_with(root))
        })
        .map(|r| r.source)
        .collect();
    sources.sort();
    sources.dedup();
    propagate(engine, &sources)
}
