use super::*;
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub write_config: bool,
    pub write_defaults: bool,
    pub name_rules: bool,
    pub list_plugins: bool,
    pub list_marketplaces: bool,
    pub install_plugins: bool,
    pub uninstall_plugins: bool,
}
// Cache only interface inspection, keyed by the executable identity and its metadata.
// Never execute a mutation as a capability probe.
pub(super) fn inspect_capabilities(engine: &Engine, binary: &Path, cwd: &Path) -> Capabilities {
    static CACHE: OnceLock<Mutex<BTreeMap<String, Capabilities>>> = OnceLock::new();
    let metadata = fs::metadata(binary).ok();
    let key = format!(
        "{}:{:?}:{:?}",
        identity(binary).display(),
        metadata.as_ref().map(|m| m.len()),
        metadata.and_then(|m| m.modified().ok())
    );
    let cache = CACHE.get_or_init(|| Mutex::new(BTreeMap::new()));
    if let Some(value) = cache
        .lock()
        .ok()
        .and_then(|values| values.get(&key).cloned())
    {
        return value;
    }
    let supports = |args: &[&str], flags: &[&str]| -> bool {
        run_process_with_timeout(
            command(engine, binary, cwd).args(args).arg("--help"),
            Duration::from_secs(5),
        )
        .is_ok_and(|output| {
            output.success
                && flags
                    .iter()
                    .all(|flag| output.stdout.split_whitespace().any(|word| word == *flag))
        })
    };
    let plugin_capabilities = Capabilities {
        list_plugins: supports(
            &["plugin", "list"],
            &["--json", "--available", "--marketplace"],
        ),
        list_marketplaces: supports(&["plugin", "marketplace", "list"], &["--json"]),
        install_plugins: supports(&["plugin", "add"], &["--json"]),
        uninstall_plugins: supports(&["plugin", "remove"], &["--json"]),
        ..Capabilities::default()
    };
    let result = (|| -> Result<Capabilities, String> {
        let directory = TemporaryDirectory::new()?;
        let output = run_process_with_timeout(
            command(engine, binary, cwd)
                .args(["app-server", "generate-json-schema", "--out"])
                .arg(&directory.0),
            Duration::from_secs(20),
        )?;
        if !output.success {
            return Err(output.stderr);
        }
        let read = |name: &str| -> Value {
            fs::read(directory.0.join("v2").join(format!("{name}.json")))
                .ok()
                .and_then(|bytes| serde_json::from_slice(&bytes).ok())
                .unwrap_or(Value::Null)
        };
        let write = read("ConfigValueWriteParams");
        let batch = read("ConfigBatchWriteParams");
        let skills = read("SkillsConfigWriteParams");
        Ok(Capabilities {
            write_config: ["keyPath", "value", "mergeStrategy", "expectedVersion"]
                .iter()
                .all(|key| write["properties"].get(key).is_some()),
            write_defaults: ["edits", "expectedVersion"]
                .iter()
                .all(|key| batch["properties"].get(key).is_some()),
            name_rules: skills["properties"].get("name").is_some(),
            ..plugin_capabilities.clone()
        })
    })();
    match result {
        Ok(value) => {
            if let Ok(mut values) = cache.lock() {
                values.insert(key, value.clone());
            }
            value
        }
        Err(_) => plugin_capabilities,
    }
}
