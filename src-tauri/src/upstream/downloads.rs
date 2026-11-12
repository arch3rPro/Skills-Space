//! Original direct download into an owned preview tree, never installation paths.
use super::*;
pub(super) fn inspect(
    engine: &Engine,
    source: &str,
    url: &str,
    internal: bool,
) -> Result<Inspection, String> {
    let temp = TemporaryDirectory::new()?;
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("prepare-upstream-download.mjs"))
            .arg(url)
            .arg(&temp.0),
    )?;
    if !output.success {
        return Err(format!("Cannot preview download: {}", output.stderr));
    }
    let result: serde_json::Value =
        serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    let root = fs::canonicalize(
        result["rootDir"]
            .as_str()
            .ok_or("Missing download directory.")?,
    )
    .map_err(|e| e.to_string())?;
    if !root.starts_with(fs::canonicalize(&temp.0).map_err(|e| e.to_string())?) {
        return Err("Download escaped its preview directory.".into());
    }
    let mut inspection = inspect_with_options(engine, &root.to_string_lossy(), internal)?;
    inspection.source = source.into();
    for skill in &mut inspection.skills {
        skill.download_url = Some(url.into());
        skill.selection_fingerprint = Some(
            serde_json::to_string(&(&skill.selection_fingerprint, url))
                .map_err(|e| e.to_string())?,
        );
        skill.file_count = skill.signature.as_ref().map(|bytes| {
            let mut b = bytes.as_slice();
            let mut count = 0;
            while b.len() >= 8 {
                let mut size = [0; 8];
                size.copy_from_slice(&b[..8]);
                let n = u64::from_le_bytes(size) as usize;
                if n > b.len() - 8 {
                    break;
                }
                b = &b[8 + n..];
                count += 1;
            }
            count / 2
        });
    }
    inspection.warnings.push("The download URL is recorded as the skill source. Preview it again to reinstall newer content. Eve targets are unavailable for downloads.".into());
    Ok(inspection)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::upstream::{
        provider::tests::{archive, Server},
        tests::{addition, engine, global},
    };
    #[test]
    fn original_direct_markdown_zip_and_tar_lifecycle_records_source() {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        fs::create_dir_all(home.join(".codex")).unwrap();
        let e = engine(&home);
        let server = Server::new();
        for (index, kind) in ["md", "zip", "tgz"].into_iter().enumerate() {
            let name = format!("direct-{kind}");
            let bytes = if kind == "md" {
                format!("\u{feff}---\nname: {name}\ndescription: Direct fixture\n---\nBody\n")
                    .into_bytes()
            } else {
                archive(&e, kind, &name, false)
            };
            let route = format!("/opaque-{index}");
            server.put(&route, bytes);
            let url = format!("{}{}", server.url, route);
            let target = if index % 2 == 0 {
                global()
            } else {
                let p = f.0.join("project");
                fs::create_dir_all(&p).unwrap();
                Target {
                    host: "local".into(),
                    scope: "project".into(),
                    project_path: Some(p.to_string_lossy().into_owned()),
                }
            };
            let preview = super::super::inspect(&e, &url).unwrap();
            assert!(!preview.provider);
            assert_eq!(preview.skills[0].name, name);
            let mut op = addition(Path::new(&url), target.clone(), true);
            op.agents = vec!["codex".into()];
            op.skills = vec![name.clone()];
            op.source_hashes = Some(
                preview
                    .skills
                    .iter()
                    .map(|s| (s.name.clone(), s.selection_fingerprint.clone()))
                    .collect(),
            );
            let result = apply(&e, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            let lock = e.lock(&target).unwrap();
            assert_eq!(lock["skills"][&name]["sourceType"], "download");
            assert_eq!(lock["skills"][&name]["sourceUrl"], url);
            if kind != "md" {
                assert_eq!(
                    fs::read(
                        target
                            .directory(&home)
                            .unwrap()
                            .join(".agents/skills")
                            .join(&name)
                            .join("binary.dat")
                    )
                    .unwrap(),
                    [0, 255, 2]
                );
            }
            op.action = "remove".into();
            op.source_hashes = None;
            assert_eq!(apply(&e, &op).unwrap().items[0].status, "complete");
        }
    }
    #[test]
    fn direct_changed_preview_unsafe_archive_and_invalid_payload_never_install() {
        let f = TemporaryDirectory::new().unwrap();
        fs::create_dir_all(f.0.join(".codex")).unwrap();
        let e = engine(&f.0);
        let server = Server::new();
        let url = format!("{}/download", server.url);
        server.put(
            "/download",
            b"---\nname: direct\ndescription: Fixture\n---\nOne\n".to_vec(),
        );
        let preview = super::super::inspect(&e, &url).unwrap();
        let mut op = addition(Path::new(&url), global(), false);
        op.agents = vec!["codex".into()];
        op.skills = vec!["direct".into()];
        op.source_hashes = Some(
            preview
                .skills
                .iter()
                .map(|s| (s.name.clone(), s.selection_fingerprint.clone()))
                .collect(),
        );
        server.put(
            "/download",
            b"---\nname: direct\ndescription: Fixture\n---\nTwo\n".to_vec(),
        );
        assert!(apply(&e, &op).is_err());
        server.put("/download", archive(&e, "zip", "direct", true));
        assert!(super::super::inspect(&e, &url).is_err());
        server.put("/download", b"<html>Not a skill</html>".to_vec());
        assert!(super::super::inspect(&e, &url).is_err());
        assert!(!f.0.join(".agents/skills").exists());
    }
    #[test]
    #[ignore = "Requires public HTTPS; mutations use temporary HOME"]
    fn real_https_direct_download_lifecycle() {
        let f = TemporaryDirectory::new().unwrap();
        fs::create_dir_all(f.0.join(".codex")).unwrap();
        let e = engine(&f.0);
        let url="https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md";
        let preview = super::super::inspect(&e, url).unwrap();
        assert_eq!(preview.skills.len(), 1);
        let name = preview.skills[0].name.clone();
        let mut op = addition(Path::new(url), global(), true);
        op.agents = vec!["codex".into()];
        op.skills = vec![name.clone()];
        op.source_hashes = Some(
            preview
                .skills
                .iter()
                .map(|s| (s.name.clone(), s.selection_fingerprint.clone()))
                .collect(),
        );
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert!(e.lock(&global()).unwrap()["skills"][&name].is_null());
        op.action = "remove".into();
        op.source_hashes = None;
        assert_eq!(apply(&e, &op).unwrap().items[0].status, "complete");
        assert!(e.inventory(&global()).unwrap().skills.is_empty());
    }
}
