//! Content baselines supplement original CLI locks; they never replace installation records.
use super::*;
use sha2::{Digest, Sha256};
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn location(engine: &Engine) -> PathBuf {
    engine.home.join(".skills-space/update-baselines.json")
}
fn key(target: &Target, name: &str) -> Result<String, String> {
    serde_json::to_string(&(target, name)).map_err(|e| e.to_string())
}
fn read(engine: &Engine) -> Result<serde_json::Value, String> {
    let path = location(engine);
    if !path.exists() {
        return Ok(serde_json::json!({"version":1,"records":{}}));
    }
    let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() || metadata.len() > 4 * 1024 * 1024 {
        return Err("Update baseline file is linked or oversized.".into());
    }
    let value: serde_json::Value =
        serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    if value["version"] != 1 || !value["records"].is_object() {
        return Err("Invalid update baselines.".into());
    }
    Ok(value)
}
fn signatures(inventory: &Inventory, name: &str) -> Option<BTreeMap<String, String>> {
    inventory
        .skills
        .iter()
        .filter(|s| s.name == name && s.source_type.as_deref() != Some("local-sync"))
        .map(|s| Some((s.path.clone(), hash(&tree_signature(Path::new(&s.path))?))))
        .collect()
}
pub(super) fn remember(
    engine: &Engine,
    target: &Target,
    name: &str,
    inventory: &Inventory,
) -> Result<(), String> {
    let lock = engine.lock(target)?;
    let observed = signatures(inventory, name)
        .filter(|v| !v.is_empty())
        .ok_or("Installed content cannot be verified.")?;
    let path = location(engine);
    let mut parent = path.parent();
    while let Some(directory) = parent {
        if fs::symlink_metadata(directory).is_ok_and(|m| m.file_type().is_symlink()) {
            #[cfg(target_os = "macos")]
            if matches!(directory.to_str(), Some("/var" | "/tmp"))
                && fs::canonicalize(directory)
                    .is_ok_and(|p| p == PathBuf::from(format!("/private{}", directory.display())))
            {
                parent = directory.parent();
                continue;
            }
            return Err("Update baseline directory is linked.".into());
        }
        parent = directory.parent();
    }
    let _guard = pi::SettingsLock::acquire(&path)?;
    let mut data = read(engine)?;
    data["records"][key(target, name)?] =
        serde_json::json!({"lock":lock["skills"][name],"paths":observed});
    pi::write_bytes(
        &path,
        &serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?,
    )
}
pub(super) fn state(engine: &Engine, target: &Target, name: &str, inventory: &Inventory) -> String {
    let result = (|| -> Result<String, String> {
        let data = read(engine)?;
        let lock = engine.lock(target)?;
        let id = key(target, name)?;
        let record = &data["records"][id];
        if record.is_null() || record["lock"] != lock["skills"][name] {
            return Ok("unverified".into());
        }
        let observed = signatures(inventory, name).ok_or("Cannot inspect installed tree.")?;
        Ok(
            if serde_json::to_value(observed).map_err(|e| e.to_string())? == record["paths"] {
                "clean"
            } else {
                "modified"
            }
            .into(),
        )
    })();
    result.unwrap_or_else(|_| "unverified".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::tests::{addition, engine, global};
    #[test]
    fn original_cli_baselines_detect_support_edits_and_lock_version_changes() {
        let root = TemporaryDirectory::new().unwrap();
        let home = root.0.join("home");
        let source = root.0.join("source");
        fs::create_dir_all(&source).unwrap();
        fs::write(
            source.join("SKILL.md"),
            "---\nname: fixture-skill\ndescription: Safety fixture\n---\nOriginal\n",
        )
        .unwrap();
        fs::write(source.join("reference.txt"), "original").unwrap();
        fs::create_dir_all(&home).unwrap();
        let e = engine(&home);
        let operation = addition(&source, global(), true);
        let installed = apply(&e, &operation).unwrap();
        assert!(installed.items.iter().all(|i| i.status == "complete"));
        let actual = e.inventory(&global()).unwrap();
        assert_eq!(state(&e, &global(), "fixture-skill", &actual), "clean");
        fs::write(
            Path::new(&actual.skills[0].path).join("reference.txt"),
            "local",
        )
        .unwrap();
        assert_eq!(state(&e, &global(), "fixture-skill", &actual), "modified");
        fs::write(
            Path::new(&actual.skills[0].path).join("reference.txt"),
            "original",
        )
        .unwrap();
        assert_eq!(state(&e, &global(), "fixture-skill", &actual), "clean");

        let lock = e.home.join(".agents/.skill-lock.json");
        let mut data = e.lock(&global()).unwrap();
        data["version"] = 999.into();
        fs::write(lock, serde_json::to_vec(&data).unwrap()).unwrap();
        assert!(e.lock(&global()).is_err());
    }
}
