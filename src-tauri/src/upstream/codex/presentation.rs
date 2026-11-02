use super::*;

pub(super) fn description(data: &Value) -> String {
    data["interface"]["shortDescription"]
        .as_str()
        .or_else(|| data["description"].as_str())
        .unwrap_or_default()
        .into()
}
pub(super) fn author(data: &Value) -> Option<String> {
    data["author"]["name"]
        .as_str()
        .or_else(|| data["author"].as_str())
        .or_else(|| data["interface"]["developerName"].as_str())
        .filter(|s| !s.trim().is_empty())
        .map(str::to_owned)
}
// Service icon metadata is a URL, never authority to read a local file.
pub(super) fn remote_icon(value: &Value) -> Option<String> {
    let source = value.as_str().or_else(|| value["light"].as_str())?;
    let url = reqwest::Url::parse(source).ok()?;
    (url.scheme() == "https" && url.username().is_empty() && url.password().is_none())
        .then(|| source.into())
}
pub(super) fn icon(root: &Path, data: &Value) -> Option<String> {
    ["composerIcon", "logo"].into_iter().find_map(|key| {
        let value = &data["interface"][key];
        let source = value.as_str().or_else(|| value["light"].as_str())?;
        if source.starts_with("https://") {
            let url = reqwest::Url::parse(source).ok()?;
            return (url.username().is_empty() && url.password().is_none()).then(|| source.into());
        }
        let path = identity(&root.join(source));
        if !path.starts_with(identity(root)) {
            return None;
        }
        let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            _ => return None,
        };
        // Only the referenced small image, never a general filesystem URL grant.
        let metadata = fs::metadata(&path).ok()?;
        if !metadata.is_file() || metadata.len() > 256 * 1024 {
            return None;
        }
        let bytes = fs::read(path).ok()?;
        if bytes.len() > 256 * 1024 {
            return None;
        }
        let encoded: String = bytes.iter().map(|byte| format!("%{byte:02X}")).collect();
        Some(format!("data:{mime},{encoded}"))
    })
}

pub(super) fn skill_icon(root: &Path, interface: &Value) -> Option<String> {
    ["iconSmall", "iconLarge"].into_iter().find_map(|key| {
        let source = interface[key].as_str()?;
        if source.starts_with("https://") || source.starts_with("http://") {
            return None;
        }
        icon(root, &json!({"interface":{"composerIcon":source}}))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn plugin_metadata_uses_declared_identity_and_contained_images() {
        let fixture = TemporaryDirectory::new().unwrap();
        fs::write(
            fixture.0.join("icon.svg"),
            "<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
        )
        .unwrap();
        let data = json!({"description":"Long description","author":{"name":"Author"},"interface":{"shortDescription":"Short introduction","composerIcon":"./icon.svg"}});
        assert_eq!(description(&data), "Short introduction");
        assert_eq!(author(&data).as_deref(), Some("Author"));
        assert!(skill_icon(&fixture.0, &json!({"iconSmall":fixture.0.join("icon.svg")})).is_some());
        assert!(skill_icon(&fixture.0, &json!({"composerIcon":"./icon.svg"})).is_none());
        assert!(icon(&fixture.0, &data)
            .unwrap()
            .starts_with("data:image/svg+xml,%3C"));
        assert!(icon(
            &fixture.0,
            &json!({"interface":{"composerIcon":"../outside.svg"}})
        )
        .is_none());
        assert!(icon(
            &fixture.0,
            &json!({"interface":{"composerIcon":"https://user:secret@example.invalid/icon.svg"}})
        )
        .is_none());
        assert!(remote_icon(&json!("/private/fixture.png")).is_none());
        assert!(remote_icon(&json!("file:///private/fixture.png")).is_none());
        assert!(remote_icon(&json!("https://user:secret@example.invalid/icon.png")).is_none());
        assert_eq!(
            remote_icon(&json!("https://example.invalid/icon.png")).as_deref(),
            Some("https://example.invalid/icon.png")
        );
    }
}
