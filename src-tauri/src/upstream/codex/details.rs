//! Selected-plugin presentation only; no runtime, account or catalog access.
use super::*;
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Details {
    description: String,
    category: Option<String>,
    website: Option<String>,
    capabilities: Vec<String>,
    examples: Vec<String>,
    skills: Vec<DetailSkill>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DetailSkill {
    name: String,
    display_name: String,
    description: String,
    path: String,
    icon: Option<String>,
}
fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}
fn texts(value: &Value) -> Vec<String> {
    if let Some(value) = text(value) {
        vec![value]
    } else {
        value
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(text)
            .collect()
    }
}
fn read(engine: &Engine, root: &Path, id: &str) -> Result<Details, String> {
    let data = manifest(root)?;
    if data["name"].as_str() != id.rsplit_once('@').map(|p| p.0) {
        return Err("Plugin identity changed. Refresh plugins.".into());
    }
    let (documents, complete) = skill_inventory::documents(root, &data);
    if !complete {
        return Err("Plugin skill documents could not be completely read. Check the installation and retry.".into());
    }
    let paths: Vec<String> = documents
        .iter()
        .filter_map(|p| {
            p.parent()
                .map(|p| identity(p).to_string_lossy().into_owned())
        })
        .collect();
    let metadata = if paths.is_empty() {
        BTreeMap::new()
    } else {
        engine.codex_documents(&paths)?
    };
    let skills = paths.iter().map(|path| {
        let meta = metadata.get(path);
        let name = meta.and_then(|m| m.document.name.clone()).filter(|n| !n.is_empty())
            .unwrap_or_else(|| Path::new(path).file_name().unwrap_or_default().to_string_lossy().into_owned());
        DetailSkill {
            display_name: meta.and_then(|m| text(&m.interface["display_name"])).unwrap_or_else(|| name.clone()),
            description: meta.and_then(|m| m.document.description.clone()).unwrap_or_default(),
            icon: meta.and_then(|m| presentation::skill_icon(Path::new(path), &json!({"iconSmall":m.interface["icon_small"],"iconLarge":m.interface["icon_large"]}))),
            name, path: path.clone(),
        }
    }).collect();
    let website = text(&data["interface"]["websiteURL"])
        .or_else(|| text(&data["homepage"]))
        .filter(|value| {
            reqwest::Url::parse(value).is_ok_and(|url| {
                matches!(url.scheme(), "http" | "https")
                    && url.username().is_empty()
                    && url.password().is_none()
            })
        });
    Ok(Details {
        description: text(&data["interface"]["longDescription"])
            .or_else(|| text(&data["description"]))
            .unwrap_or_default(),
        category: text(&data["interface"]["category"]),
        website,
        capabilities: texts(&data["interface"]["capabilities"]),
        examples: texts(&data["interface"]["defaultPrompt"]),
        skills,
    })
}
#[tauri::command]
pub async fn upstream_codex_plugin_details(
    app: AppHandle,
    root: String,
    plugin_id: String,
    expected_version: Option<String>,
) -> Result<Details, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = Path::new(&root);
        if let Some(version) = expected_version {
            if manifest(root)?["version"].as_str() != Some(version.as_str()) {
                return Err("Plugin source version changed. Refresh plugins.".into());
            }
        }
        read(&Engine::from_app(&app)?, root, &plugin_id)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn skill_metadata_uses_local_documents_without_runtime_discovery() {
        let temp = TemporaryDirectory::new().unwrap();
        let e = super::super::super::tests::engine(&temp.0);
        let root = temp.0.join("plugin");
        fs::create_dir_all(root.join(".codex-plugin")).unwrap();
        fs::create_dir_all(root.join("skills/alpha/agents")).unwrap();
        fs::write(
            root.join(".codex-plugin/plugin.json"),
            r#"{"name":"demo","skills":"./skills"}"#,
        )
        .unwrap();
        fs::write(
            root.join("skills/alpha/SKILL.md"),
            "---\nname: alpha\ndescription: Local description\n---\n# Alpha\n",
        )
        .unwrap();
        fs::write(
            root.join("skills/alpha/agents/openai.yaml"),
            "interface:\n  display_name: Readable Alpha\n",
        )
        .unwrap();
        let result = read(&e, &root, "demo@market").unwrap();
        assert_eq!(result.skills.len(), 1);
        assert_eq!(result.skills[0].name, "alpha");
        assert_eq!(result.skills[0].display_name, "Readable Alpha");
        assert_eq!(result.skills[0].description, "Local description");
        assert_eq!(
            result.skills[0].path,
            identity(&root.join("skills/alpha")).to_string_lossy()
        );
    }

    #[test]
    fn selected_manifest_metadata_does_not_require_codex_or_credentials() {
        let temp = TemporaryDirectory::new().unwrap();
        let e = super::super::super::tests::engine(&temp.0);
        let root = temp.0.join("plugin");
        fs::create_dir_all(root.join(".codex-plugin")).unwrap();
        fs::write(root.join(".codex-plugin/plugin.json"),json!({"name":"demo","description":"short","interface":{"longDescription":"full","category":"Tools","websiteURL":"https://example.invalid","capabilities":["Browse"],"defaultPrompt":["Example"]}}).to_string()).unwrap();
        let result = read(&e, &root, "demo@market").unwrap();
        assert_eq!(result.description, "full");
        assert_eq!(result.category.as_deref(), Some("Tools"));
        assert_eq!(result.examples, vec!["Example"]);
        assert_eq!(result.capabilities, vec!["Browse"]);
        assert!(result.skills.is_empty());
        assert!(read(&e, &root, "different@market").is_err());
        fs::write(
            root.join(".codex-plugin/plugin.json"),
            json!({"name":"demo","homepage":"https://user:secret@example.invalid"}).to_string(),
        )
        .unwrap();
        let result = read(&e, &root, "demo@market").unwrap();
        assert!(result.website.is_none());
        assert!(result.category.is_none());
    }
}
