//! Bounded package inspection. Source documents never substitute for installed content.
use super::*;
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInventory {
    pub complete: bool,
    pub missing_from_installation: Option<usize>,
}
pub(super) fn documents(root: &Path, data: &Value) -> (Vec<PathBuf>, bool) {
    if !root.is_dir() || !data.is_object() {
        return (vec![], false);
    }
    let mut pending = match &data["skills"] {
        Value::String(p) => vec![root.join(p)],
        Value::Array(paths) if paths.iter().all(Value::is_string) => paths
            .iter()
            .filter_map(Value::as_str)
            .map(|p| root.join(p))
            .collect(),
        Value::Null => {
            if root.join("skills").is_dir() {
                vec![root.join("skills")]
            } else {
                vec![]
            }
        }
        _ => return (vec![], false),
    };
    let base = identity(root);
    let mut seen = BTreeSet::new();
    let mut found = Vec::new();
    let mut complete = true;
    while let Some(path) = pending.pop() {
        let canonical = identity(&path);
        if !canonical.starts_with(&base) {
            complete = false;
            continue;
        }
        if !seen.insert(canonical) {
            continue;
        }
        if seen.len() > 2000 {
            complete = false;
            break;
        }
        match fs::metadata(&path) {
            Ok(meta) if meta.is_dir() => {
                let document = path.join("SKILL.md");
                if document.is_file() {
                    if identity(&document).starts_with(&base) {
                        found.push(document);
                    } else {
                        complete = false;
                    }
                } else {
                    match fs::read_dir(&path) {
                        Ok(entries) => {
                            for (index, entry) in entries.enumerate() {
                                if index >= 500 {
                                    complete = false;
                                    break;
                                }
                                match entry {
                                    Ok(entry) => pending.push(entry.path()),
                                    Err(_) => complete = false,
                                }
                            }
                        }
                        Err(_) => complete = false,
                    }
                }
            }
            Ok(meta) if meta.is_file() && path.file_name().is_some_and(|p| p == "SKILL.md") => {
                found.push(path)
            }
            Ok(_) => {}
            Err(_) => complete = false,
        }
    }
    found.sort();
    (found, complete)
}
pub(super) fn inspect(
    root: Option<&Path>,
    source: Option<&Path>,
    installed: bool,
) -> SkillInventory {
    let Some(root) = root else {
        return SkillInventory::default();
    };
    let Ok(data) = manifest(root) else {
        return SkillInventory::default();
    };
    let (documents, complete) = documents(root, &data);
    let missing = source
        .filter(|source| installed && identity(source) != identity(root))
        .and_then(|source| {
            let source_data = manifest(source).ok()?;
            // A newer catalog version is an update, not proof of a damaged installation.
            if data["name"] != source_data["name"]
                || data["version"].as_str().is_none()
                || data["version"] != source_data["version"]
                || !complete
            {
                return None;
            }
            let (expected, source_complete) = self::documents(source, &source_data);
            if !source_complete {
                return None;
            }
            let actual: BTreeSet<_> = documents
                .iter()
                .filter_map(|p| p.strip_prefix(root).ok())
                .collect();
            Some(
                expected
                    .iter()
                    .filter_map(|p| p.strip_prefix(source).ok())
                    .filter(|p| !actual.contains(p))
                    .count(),
            )
        });
    SkillInventory {
        complete,
        missing_from_installation: missing,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinguishes_empty_unreadable_missing_and_newer_source() {
        let temp = TemporaryDirectory::new().unwrap();
        let source = temp.0.join("source");
        let cache = temp.0.join("cache");
        for root in [&source, &cache] {
            fs::create_dir_all(root.join(".codex-plugin")).unwrap();
            fs::create_dir_all(root.join("skills")).unwrap();
            fs::write(
                root.join(".codex-plugin/plugin.json"),
                r#"{"name":"demo","version":"1","skills":"./skills"}"#,
            )
            .unwrap();
        }
        fs::create_dir_all(source.join("skills/one")).unwrap();
        fs::write(source.join("skills/one/SKILL.md"), "# One").unwrap();
        let result = inspect(Some(&cache), Some(&source), true);
        assert!(result.complete);
        assert_eq!(result.missing_from_installation, Some(1));
        assert_eq!(
            inspect(Some(&source), None, false).missing_from_installation,
            None
        );
        fs::write(
            source.join(".codex-plugin/plugin.json"),
            r#"{"name":"demo","version":"2","skills":"./skills"}"#,
        )
        .unwrap();
        assert_eq!(
            inspect(Some(&cache), Some(&source), true).missing_from_installation,
            None
        );
        fs::remove_dir(cache.join("skills")).unwrap();
        assert!(!inspect(Some(&cache), None, true).complete);
        assert!(!inspect(None, None, true).complete);
    }
}
