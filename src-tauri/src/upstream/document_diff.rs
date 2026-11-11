//! Read-only per-file comparison and explicitly reviewed file restoration.
use super::*;
use sha2::{Digest, Sha256};

pub(super) fn revision(signature: &[u8]) -> String {
    format!("{:x}", Sha256::digest(signature))
}
pub(super) fn files(mut signature: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    let mut result = BTreeMap::new();
    fn take<'a>(input: &mut &'a [u8]) -> Result<&'a [u8], String> {
        let length = input.get(..8).ok_or("Invalid content signature.")?;
        let length = usize::try_from(u64::from_le_bytes(
            length.try_into().map_err(|_| "Invalid length.")?,
        ))
        .map_err(|_| "Invalid length.")?;
        *input = &input[8..];
        let value = input.get(..length).ok_or("Invalid content signature.")?;
        *input = &input[length..];
        Ok(value)
    }
    while !signature.is_empty() {
        let name = std::str::from_utf8(take(&mut signature)?)
            .map_err(|e| e.to_string())?
            .to_owned();
        if name.chars().any(char::is_control)
            || Path::new(&name)
                .components()
                .any(|p| !matches!(p, std::path::Component::Normal(_)))
        {
            return Err("Invalid comparison path.".into());
        }
        result.insert(name, take(&mut signature)?.to_vec());
    }
    Ok(result)
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    pub path: String,
    pub status: String,
    pub binary: bool,
    pub diff: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDiff {
    pub revision: String,
    pub version: String,
    pub files: Vec<DiffFile>,
}
fn inspected(
    engine: &Engine,
    target: &Target,
    path: &str,
    expected: &str,
) -> Result<(PathBuf, Vec<u8>, SourceSnapshot, String), String> {
    let inventory = engine.inventory(target)?;
    let skill = inventory
        .skills
        .iter()
        .find(|s| s.path == path && s.cli_managed)
        .ok_or("This skill has no recorded source for comparison.")?;
    let root = fs::canonicalize(&skill.path).map_err(|e| e.to_string())?;
    let local = tree_signature(&root).ok_or("Local files could not be inspected.")?;
    if revision(&local) != expected {
        return Err("Skill changed. Reopen its details before comparing.".into());
    }
    let lock = engine.lock(target)?;
    let entry = &lock["skills"][&skill.name];
    let version = ["skillFolderHash", "computedHash", "wellKnownDigest"]
        .iter()
        .find_map(|key| entry[*key].as_str())
        .ok_or("No installed source version was recorded.")?
        .to_owned();
    let source = source_snapshot(engine, target, &skill.name, &mut SourceCache::default())?;
    if !source.hashes.contains(&version) {
        return Err("The recorded source version is unavailable; the latest version cannot represent local edits.".into());
    }
    Ok((root, local, source, version))
}
pub(super) fn compare(
    engine: &Engine,
    target: &Target,
    path: &str,
    expected: &str,
) -> Result<SkillDiff, String> {
    let (_, local, source, version) = inspected(engine, target, path, expected)?;
    let original = files(
        source
            .signature
            .as_deref()
            .ok_or("Source content exceeds the diff preview limit.")?,
    )?;
    let current = files(&local)?;
    Ok(SkillDiff {
        revision: expected.into(),
        version,
        files: compare_files(engine, original, current)?,
    })
}
pub(super) fn compare_files(
    engine: &Engine,
    original: BTreeMap<String, Vec<u8>>,
    current: BTreeMap<String, Vec<u8>>,
) -> Result<Vec<DiffFile>, String> {
    let names: std::collections::BTreeSet<_> = original.keys().chain(current.keys()).collect();
    let mut result: Vec<_> = names
        .into_iter()
        .filter(|name| original.get(*name) != current.get(*name))
        .map(|name| DiffFile {
            path: name.clone(),
            status: if !original.contains_key(name) {
                "added"
            } else if !current.contains_key(name) {
                "deleted"
            } else {
                "modified"
            }
            .into(),
            binary: [original.get(name), current.get(name)]
                .into_iter()
                .flatten()
                .any(|v| v.contains(&0) || std::str::from_utf8(v).is_err()),
            diff: String::new(),
        })
        .collect();
    if result.is_empty() {
        return Ok(result);
    }
    let temporary = TemporaryDirectory::new()?;
    for (directory, contents) in [("a", &original), ("b", &current)] {
        fs::create_dir(temporary.0.join(directory)).map_err(|e| e.to_string())?;
        for (name, bytes) in contents {
            let file = temporary.0.join(directory).join(name);
            fs::create_dir_all(file.parent().ok_or("Invalid comparison path.")?)
                .map_err(|e| e.to_string())?;
            fs::write(file, bytes).map_err(|e| e.to_string())?;
        }
    }
    let output = engine
        .command(Path::new("git"), &temporary.0)
        .args([
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.quotepath=false",
            "diff",
            "--no-index",
            "--no-renames",
            "--no-prefix",
            "--no-ext-diff",
            "--no-textconv",
            "--no-color",
            "--",
            "a",
            "b",
        ])
        .output()
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::NotFound => "Install Git and restart Skills Space to view file changes.".to_owned(),
            _ => error.to_string(),
        })?;
    if !matches!(output.status.code(), Some(0 | 1)) {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    let text = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    for chunk in text.split("diff --git ").skip(1) {
        let name = chunk
            .lines()
            .filter_map(|line| {
                line.strip_prefix("+++ ")
                    .or_else(|| line.strip_prefix("--- "))
            })
            .filter(|v| *v != "/dev/null")
            .last();
        if let Some(name) = name {
            let decoded = if name.starts_with('"') {
                serde_json::from_str::<String>(name).map_err(|e| e.to_string())?
            } else {
                name.into()
            };
            if let Some(file) = result.iter_mut().find(|file| {
                Some(file.path.as_str())
                    == decoded
                        .strip_prefix("a/")
                        .or_else(|| decoded.strip_prefix("b/"))
            }) {
                file.diff = chunk
                    .lines()
                    .skip_while(|line| !line.starts_with("@@"))
                    .collect::<Vec<_>>()
                    .join("\n");
            }
        }
    }
    Ok(result)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreFile {
    pub target: Target,
    pub path: String,
    pub file: String,
    pub revision: String,
    pub version: String,
}
pub(super) fn restore(engine: &Engine, request: &RestoreFile) -> Result<String, String> {
    let (root, before, source, version) =
        inspected(engine, &request.target, &request.path, &request.revision)?;
    if version != request.version {
        return Err("Source version changed. Review the diff again.".into());
    }
    let originals = files(
        source
            .signature
            .as_deref()
            .ok_or("Source content exceeds the diff preview limit.")?,
    )?;
    let (after, _guard) = restore_file(&root, &before, &originals, &request.file)?;
    // Establish evidence only when every installed copy matches the verified
    // recorded source, exactly as a successful ordinary update check does.
    let _ = (|| -> Result<(), String> {
        let inventory = engine.inventory(&request.target)?;
        if let Some(skill) = inventory
            .skills
            .iter()
            .find(|skill| skill.path == request.path && skill.cli_managed)
        {
            let lock = engine.lock(&request.target)?;
            let entry = &lock["skills"][&skill.name];
            let version = ["skillFolderHash", "computedHash", "wellKnownDigest"]
                .iter()
                .find_map(|key| entry[*key].as_str());
            if version == Some(request.version.as_str())
                && inventory
                    .skills
                    .iter()
                    .filter(|item| item.name == skill.name)
                    .all(|item| {
                        source
                            .signature
                            .as_ref()
                            .is_some_and(|signature| eve::content_matches(engine, item, signature))
                    })
            {
                let _ = update_safety::remember(engine, &request.target, &skill.name, &inventory);
            }
        }
        Ok(())
    })();
    Ok(revision(&after))
}
// The caller retains the lock through the subsequent baseline refresh.
fn restore_file(
    root: &Path,
    before: &[u8],
    originals: &BTreeMap<String, Vec<u8>>,
    file: &str,
) -> Result<(Vec<u8>, pi::SettingsLock), String> {
    let current = files(before)?;
    if originals.get(file) == current.get(file) {
        return Err("This file has no local difference.".into());
    }
    if file.chars().any(char::is_control)
        || Path::new(&file)
            .components()
            .any(|p| !matches!(p, std::path::Component::Normal(_)))
    {
        return Err("Invalid restore path.".into());
    }
    let destination = root.join(&file);
    for ancestor in destination.ancestors().take_while(|p| *p != root) {
        if fs::symlink_metadata(ancestor)
            .is_ok_and(|m| m.file_type().is_symlink() || m.permissions().readonly())
        {
            return Err("Restore path is linked or read-only.".into());
        }
    }
    let guard = pi::SettingsLock::acquire(root)?;
    if tree_signature(root).as_deref() != Some(before) {
        return Err("Skill changed. Review the diff again.".into());
    }
    if let Some(bytes) = originals.get(file) {
        pi::write_bytes(&destination, bytes)?;
    } else {
        fs::remove_file(&destination).map_err(|e| e.to_string())?;
    }
    if originals
        .get(file)
        .is_some_and(|bytes| fs::read(&destination).ok().as_ref() != Some(bytes))
        || !originals.contains_key(file) && destination.exists()
    {
        return Err("Restored file could not be verified.".into());
    }
    let after = tree_signature(&root).ok_or("Restored files could not be inspected.")?;
    let mut expected = current;
    if let Some(bytes) = originals.get(file) {
        expected.insert(file.to_owned(), bytes.clone());
    } else {
        expected.remove(file);
    }
    if files(&after)? != expected {
        return Err("File restored, but other files changed. Reopen the diff.".into());
    }
    Ok((after, guard))
}

#[tauri::command]
pub async fn upstream_skill_diff(
    app: AppHandle,
    target: Target,
    path: String,
    revision: String,
) -> Result<SkillDiff, String> {
    tauri::async_runtime::spawn_blocking(move || {
        compare(&Engine::from_app(&app)?, &target, &path, &revision)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn upstream_skill_file_restore(
    app: AppHandle,
    request: RestoreFile,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || restore(&Engine::from_app(&app)?, &request))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn file_changes_restore_and_stale_path_protection() {
        let temporary = TemporaryDirectory::new().unwrap();
        let engine = super::super::tests::engine(&temporary.0);
        let root = temporary.0.join("installed");
        fs::create_dir(&root).unwrap();
        let original = BTreeMap::from([
            ("SKILL.md".into(), b"# Original\n".to_vec()),
            ("version.txt".into(), b"one".to_vec()),
        ]);
        for (name, bytes) in &original {
            fs::write(root.join(name), bytes).unwrap();
        }
        fs::write(root.join("SKILL.md"), "# Local edit\n").unwrap();
        fs::write(root.join("added.txt"), "one").unwrap();
        fs::write(root.join("binary.dat"), [0, 1, 2]).unwrap();
        fs::remove_file(root.join("version.txt")).unwrap();
        let before = tree_signature(&root).unwrap();
        let differences =
            compare_files(&engine, original.clone(), files(&before).unwrap()).unwrap();
        assert_eq!(differences.len(), 4);
        let document = differences.iter().find(|f| f.path == "SKILL.md").unwrap();
        assert!(document.diff.contains("-# Original") && document.diff.contains("+# Local edit"));
        assert!(differences
            .iter()
            .any(|f| f.path == "added.txt" && f.status == "added" && f.diff.contains("+one")));
        assert!(differences
            .iter()
            .any(|f| f.path == "version.txt" && f.status == "deleted" && f.diff.contains("-one")));
        assert!(differences
            .iter()
            .any(|f| f.path == "binary.dat" && f.binary));
        fs::write(root.join("added.txt"), "changed since review").unwrap();
        assert!(restore_file(&root, &before, &original, "SKILL.md").is_err());
        assert_eq!(
            fs::read_to_string(root.join("SKILL.md")).unwrap(),
            "# Local edit\n"
        );
        let before = tree_signature(&root).unwrap();
        let unsafe_original = BTreeMap::from([("../outside".into(), b"untrusted".to_vec())]);
        assert!(restore_file(&root, &before, &unsafe_original, "../outside").is_err());
        assert!(!temporary.0.join("outside").exists());
        for name in ["SKILL.md", "added.txt", "binary.dat", "version.txt"] {
            let before = tree_signature(&root).unwrap();
            let expected = files(&before).unwrap();
            let (after, guard) = restore_file(&root, &before, &original, name).unwrap();
            assert!(pi::SettingsLock::acquire(&root).is_err());
            drop(guard);
            drop(pi::SettingsLock::acquire(&root).unwrap());
            let after = files(&after).unwrap();
            for (other, bytes) in expected.iter().filter(|(other, _)| other.as_str() != name) {
                assert_eq!(
                    after.get(other),
                    Some(bytes),
                    "Unselected file changed: {other}"
                );
            }
            assert_eq!(after.get(name), original.get(name));
        }
        assert_eq!(files(&tree_signature(&root).unwrap()).unwrap(), original);
        assert!(compare_files(&engine, original.clone(), original)
            .unwrap()
            .is_empty());
    }
}
