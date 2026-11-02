//! Compare package content without treating proven desktop runtime overrides as releases.
use super::*;

pub(super) fn fields(plugin: &Plugin) -> Option<(&'static str, &'static [&'static str])> {
    if !plugin.builtin
        || !matches!(
            plugin.marketplace.as_str(),
            "openai-bundled" | "openai-bundled-alpha"
        )
    {
        return None;
    }
    match plugin.id.rsplit_once('@')?.0 {
        "unified-computer-use" => Some((
            "cua_repl",
            &[
                "command",
                "args",
                "enabled",
                "omit_tools_from",
                "env_vars",
                "env",
            ],
        )),
        "codex-app-tools" => Some((
            "codex_app",
            &[
                "command",
                "args",
                "cwd",
                "enabled",
                "omit_tools_from",
                "env",
            ],
        )),
        _ => None,
    }
}

pub(super) fn fingerprint(root: &Path, policy: Option<(&str, &[&str])>) -> Option<String> {
    let Some((server, fields)) = policy else {
        return super::fingerprint(root);
    };
    fn visit(
        root: &Path,
        path: &Path,
        out: &mut Vec<u8>,
        count: &mut usize,
        server: &str,
        fields: &[&str],
    ) -> Option<()> {
        let mut entries = fs::read_dir(path)
            .ok()?
            .collect::<Result<Vec<_>, _>>()
            .ok()?;
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            if matches!(entry.file_name().to_str(), Some(".git" | "node_modules")) {
                continue;
            }
            *count += 1;
            if *count > 2000 {
                return None;
            }
            let kind = entry.file_type().ok()?;
            if kind.is_symlink() {
                return None;
            }
            if kind.is_dir() {
                visit(root, &entry.path(), out, count, server, fields)?;
            } else if kind.is_file() {
                if entry.metadata().ok()?.len() > MAX_SKILL_CONTENT_BYTES as u64 {
                    return None;
                }
                let name = entry
                    .path()
                    .strip_prefix(root)
                    .ok()?
                    .to_string_lossy()
                    .into_owned();
                let mut bytes = fs::read(entry.path()).ok()?;
                if name == ".mcp.json" {
                    let mut value: Value = serde_json::from_slice(&bytes).ok()?;
                    let config = value["mcpServers"][server].as_object_mut()?;
                    // Only fields written by the desktop's ko/Uc runtime patches.
                    // Tool definitions, approval rules, timeouts and other servers stay visible.
                    for field in fields {
                        config.remove(*field);
                    }
                    bytes = serde_json::to_vec(&value).ok()?;
                }
                if out.len() + name.len() + bytes.len() > MAX_SKILL_CONTENT_BYTES {
                    return None;
                }
                out.extend_from_slice(&(name.len() as u64).to_le_bytes());
                out.extend_from_slice(name.as_bytes());
                out.extend_from_slice(&(bytes.len() as u64).to_le_bytes());
                out.extend(bytes);
            } else {
                return None;
            }
        }
        Some(())
    }
    let mut bytes = Vec::new();
    visit(root, root, &mut bytes, &mut 0, server, fields)?;
    Some(document_diff::revision(&bytes))
}

pub(super) struct Captured {
    server: String,
    fields: Vec<String>,
    values: serde_json::Map<String, Value>,
    old_root: PathBuf,
    canonical_old_root: PathBuf,
}
pub(super) fn capture(plugin: &Plugin) -> Result<Option<Captured>, String> {
    let Some((server, fields)) = fields(plugin) else {
        return Ok(None);
    };
    let root = Path::new(
        plugin
            .installed_path
            .as_deref()
            .ok_or("Installed runtime path unavailable.")?,
    );
    let data = read_manifest(root, &root.join(".mcp.json"))?;
    let config = data["mcpServers"][server]
        .as_object()
        .ok_or("App runtime configuration unavailable.")?;
    Ok(Some(Captured {
        server: server.into(),
        fields: fields.iter().map(|s| s.to_string()).collect(),
        values: config
            .iter()
            .filter(|(key, _)| fields.contains(&key.as_str()))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        old_root: root.to_path_buf(),
        canonical_old_root: identity(root),
    }))
}
pub(super) fn restore(root: &Path, captured: &Captured) -> Result<(), String> {
    let file = root.join(".mcp.json");
    let mut data = read_manifest(root, &file)?;
    let config = data["mcpServers"][&captured.server]
        .as_object_mut()
        .ok_or("Updated App runtime configuration unavailable.")?;
    let rebase = |value: &Value| {
        let path = value.as_str().map(Path::new);
        path.and_then(|path| {
            path.strip_prefix(&captured.old_root)
                .or_else(|_| path.strip_prefix(&captured.canonical_old_root))
                .ok()
        })
        .map(|relative| json!(root.join(relative).to_string_lossy()))
        .unwrap_or_else(|| value.clone())
    };
    for field in &captured.fields {
        match captured.values.get(field) {
            Some(value) => {
                let value = if field == "args" {
                    value
                        .as_array()
                        .map(|items| Value::Array(items.iter().map(&rebase).collect()))
                        .unwrap_or_else(|| value.clone())
                } else if matches!(field.as_str(), "command" | "cwd") {
                    rebase(value)
                } else {
                    value.clone()
                };
                config.insert(field.clone(), value);
            }
            None => {
                config.remove(field);
            }
        }
    }
    // This is restoration of the desktop-owned runtime configuration, after the
    // original installer writes the package. Never persist these values in history/logs.
    super::super::super::pi::write_bytes(
        &file,
        &serde_json::to_vec_pretty(&data)
            .map_err(|_| "Cannot encode App runtime configuration.")?,
    )
}
