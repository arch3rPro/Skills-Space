//! Read-only HTTP provider previews; the original CLI performs every mutation.
use super::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Download {
    source_identifier: String,
    name: String,
    description: String,
    content: String,
    internal: bool,
    source_url: String,
    fingerprint: String,
    digest: String,
    selection_fingerprint: String,
    files: Vec<(String, String)>,
}
pub(super) fn inspect(
    engine: &Engine,
    source: &str,
    url: &str,
    include_internal: bool,
) -> Result<Inspection, String> {
    validate_url(url)?;
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-upstream-provider.mjs"))
            .arg(url),
    )?;
    if !output.success {
        return Err(format!(
            "Cannot preview downloadable skills: {}",
            output.stderr
        ));
    }
    let response: serde_json::Value =
        serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    if response["directDownload"] == true {
        return super::downloads::inspect(engine, source, url, include_internal);
    }
    let downloads: Vec<Download> = serde_json::from_str(&output.stdout)
        .map_err(|e| format!("Incomplete provider preview: {e}"))?;
    let mut skills = Vec::new();
    for mut download in downloads {
        validate_url(&download.source_url)?;
        if download.internal && !include_internal {
            continue;
        }
        // Match filesystem traversal order (components), rather than full-path
        // string sorting, so sibling files and nested directories compare exactly.
        download
            .files
            .sort_by(|a, b| a.0.split('/').cmp(b.0.split('/')));
        let mut signature = Vec::new();
        for (path, hex) in &download.files {
            let bytes = decode(hex)?;
            signature.extend_from_slice(&(path.len() as u64).to_le_bytes());
            signature.extend_from_slice(path.as_bytes());
            signature.extend_from_slice(&(bytes.len() as u64).to_le_bytes());
            signature.extend(bytes);
        }
        skills.push(SourceSkill {
            use_signature: Some(signature.clone()),
            plugin_name: None,
            selection_fingerprint: Some(download.selection_fingerprint),
            internal: download.internal,
            name: download.name,
            description: download.description,
            path: download.source_url.clone(),
            content: download.content,
            signature: Some(signature),
            fingerprint: Some(download.fingerprint),
            download_source: Some(download.source_identifier),
            download_digest: Some(download.digest),
            download_url: Some(download.source_url),
            file_count: Some(download.files.len()),
        });
    }
    if skills.is_empty() {
        return Err(
            "No visible downloadable skills. Review the index or explicitly show internal skills."
                .into(),
        );
    }
    Ok(Inspection{session_id:None,source:source.into(),provider:true,skill_filter:None,skills,
        warnings:vec!["These downloads do not support automatic version checks. To refresh content, preview this source and confirm installation again. Eve destinations are not supported for this source.".into()]})
}
fn decode(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("Invalid downloaded file encoding.".into());
    }
    hex.as_bytes()
        .chunks_exact(2)
        .map(|pair| {
            let digit = |b: u8| match b {
                b'0'..=b'9' => Some(b - b'0'),
                b'a'..=b'f' => Some(b - b'a' + 10),
                _ => None,
            };
            Ok(digit(pair[0]).ok_or("Invalid downloaded bytes.")? * 16
                + digit(pair[1]).ok_or("Invalid downloaded bytes.")?)
        })
        .collect()
}
fn validate_url(source: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(source).map_err(|_| "Invalid download source.")?;
    if !matches!(url.scheme(), "https" | "http")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Download sources require HTTP(S) without credentials, query or fragment.".into(),
        );
    }
    Ok(())
}
pub(super) fn lock_matches(
    engine: &Engine,
    op: &Operation,
    name: &str,
    url: &str,
    hash: &str,
    source: &str,
) -> bool {
    engine.lock(&op.target).is_ok_and(|lock| {
        let entry = &lock["skills"][name];
        entry["sourceType"] == "well-known"
            && entry["source"].as_str() == Some(source)
            && if op.target.scope == "global" {
                entry["sourceUrl"].as_str() == Some(url) && entry["skillFolderHash"] == ""
            } else {
                entry["computedHash"].as_str() == Some(hash)
            }
    })
}
pub(super) fn reinstall_source(entry: &serde_json::Value) -> Option<String> {
    if let Some(base) = entry["sourceBaseUrl"].as_str().or_else(|| {
        entry["sourceUrl"]
            .as_str()
            .filter(|_| entry["computedHash"].is_string())
    }) {
        validate_url(base).ok()?;
        return Some(base.into());
    }
    let url = entry["sourceUrl"].as_str()?;
    let index = url.find("/.well-known/")?;
    let base = &url[..index];
    validate_url(base).ok()?;
    Some(base.into())
}
pub(super) fn snapshot(
    engine: &Engine,
    target: &Target,
    name: &str,
) -> Result<SourceSnapshot, String> {
    let lock = engine.lock(target)?;
    let entry = &lock["skills"][name];
    let source = reinstall_source(entry).ok_or("No reliable discovery URL was recorded.")?;
    let inspection = inspect(engine, &source, &source, true)?;
    let skill = inspection
        .skills
        .into_iter()
        .find(|s| s.name == name)
        .ok_or("The discovery source no longer provides this skill.")?;
    if skill.download_source.as_deref() != entry["source"].as_str() {
        return Err("Discovery source identity changed.".into());
    }
    Ok(SourceSnapshot {
        internal: skill.internal,
        signature: skill.signature,
        hashes: vec![skill
            .download_digest
            .ok_or("Missing original provider digest.")?],
    })
}
pub(super) fn removed(
    engine: &Engine,
    entry: &serde_json::Value,
    name: &str,
) -> Result<bool, String> {
    let source = reinstall_source(entry).ok_or("No reliable discovery URL.")?;
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-upstream-provider.mjs"))
            .args([
                source.as_str(),
                "--check-name",
                name,
                entry["wellKnownDigest"]
                    .as_str()
                    .ok_or("No recorded digest.")?,
            ]),
    )?;
    if !output.success {
        return Err(output.stderr);
    }
    let data: serde_json::Value =
        serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    if data["status"] == "error" {
        return Err("Cannot read discovery index.".into());
    }
    Ok(data["removedSkills"]
        .as_array()
        .is_some_and(|v| v.iter().any(|n| n == name)))
}

#[cfg(test)]
pub(super) mod tests {
    use super::*;
    use crate::upstream::tests::{addition, engine, global};
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc,
        },
    };
    type Routes = Arc<Mutex<BTreeMap<String, (u16, Vec<u8>, Option<String>)>>>;
    pub(in crate::upstream) struct Server {
        pub(in crate::upstream) url: String,
        routes: Routes,
        requests: Arc<Mutex<Vec<String>>>,
        stop: Arc<AtomicBool>,
        worker: Option<thread::JoinHandle<()>>,
    }
    impl Server {
        pub(in crate::upstream) fn new() -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            listener.set_nonblocking(true).unwrap();
            let url = format!("http://{}", listener.local_addr().unwrap());
            let routes: Routes = Arc::new(Mutex::new(BTreeMap::new()));
            let stop = Arc::new(AtomicBool::new(false));
            let requests = Arc::new(Mutex::new(Vec::new()));
            let hits = requests.clone();
            let (r, s) = (routes.clone(), stop.clone());
            let worker = thread::spawn(move || {
                let mut handlers = Vec::new();
                while !s.load(Ordering::Relaxed) {
                    match listener.accept() {
                        Ok((mut stream, _)) => {
                            let r = r.clone();
                            let hits = hits.clone();
                            handlers.push(thread::spawn(move||{
                                stream.set_nonblocking(false).unwrap();
                                stream.set_read_timeout(Some(Duration::from_secs(1))).unwrap();
                                let mut bytes=Vec::new();let mut chunk=[0;4096];
                                while !bytes.windows(4).any(|w|w==b"\r\n\r\n") {
                                    let n=stream.read(&mut chunk).unwrap_or(0);
                                    if n==0 || bytes.len()+n>8192 {return;}
                                    bytes.extend_from_slice(&chunk[..n]);
                                }
                                let request=String::from_utf8_lossy(&bytes);
                                let Some(path)=request.split_whitespace().nth(1) else {return;};
                                hits.lock().unwrap().push(path.to_owned());
                                let (status,body,redirect)=r.lock().unwrap().get(path).cloned().unwrap_or((404,Vec::new(),None));

                                let header=format!("HTTP/1.1 {status} Test\r\nContent-Length: {}\r\nConnection: close\r\n{}\r\n",body.len(),redirect.map(|url|format!("Location: {url}\r\n")).unwrap_or_default());
                                let _=stream.write_all(header.as_bytes());let _=stream.write_all(&body);
                            }));
                        }
                        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                            thread::sleep(Duration::from_millis(5))
                        }
                        Err(e) => panic!("{e}"),
                    }
                }
                for handler in handlers {
                    handler.join().unwrap();
                }
            });
            Self {
                url,
                routes,
                requests,
                stop,
                worker: Some(worker),
            }
        }
        pub(in crate::upstream) fn put(&self, path: &str, bytes: impl AsRef<[u8]>) {
            self.routes
                .lock()
                .unwrap()
                .insert(path.into(), (200, bytes.as_ref().to_vec(), None));
        }
        pub(in crate::upstream) fn index(&self, value: serde_json::Value) {
            self.put("/.well-known/agent-skills/index.json", value.to_string());
        }
        pub(in crate::upstream) fn legacy(&self, name: &str, extra: bool) {
            let mut files = vec!["SKILL.md"];
            if extra {
                files.extend(["data.bin", "a/note.txt", "a.txt", "metadata.json"]);
            }
            self.put(
                &format!("/.well-known/agent-skills/{name}/SKILL.md"),
                doc(name),
            );
            if extra {
                for (path, bytes) in [
                    ("data.bin", vec![0, 255, 1]),
                    ("a/note.txt", b"nested".to_vec()),
                    ("a.txt", b"sibling".to_vec()),
                    ("metadata.json", b"{\"kept\":true}".to_vec()),
                ] {
                    self.put(&format!("/.well-known/agent-skills/{name}/{path}"), bytes);
                }
            }
            self.index(
                serde_json::json!({"skills":[{"name":name,"description":"Fixture","files":files}]}),
            );
        }
    }
    impl Drop for Server {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Relaxed);
            if let Some(w) = self.worker.take() {
                w.join().unwrap();
            }
        }
    }
    fn doc(name: &str) -> String {
        format!("---\nname: {name}\ndescription: Download fixture\n---\nVersion 1\n")
    }
    fn confirmed(e: &Engine, url: &str, target: Target, names: &[&str], copy: bool) -> Operation {
        let preview = super::super::inspect(e, url).unwrap();
        let mut op = addition(Path::new(url), target, copy);
        op.agents = vec!["codex".into(), "hermes-agent".into()];
        op.skills = names.iter().map(|s| s.to_string()).collect();
        op.source_hashes = Some(
            preview
                .skills
                .iter()
                .map(|s| (s.name.clone(), s.selection_fingerprint.clone()))
                .collect(),
        );
        op
    }
    fn fixture() -> (TemporaryDirectory, Engine, Target) {
        let f = TemporaryDirectory::new().unwrap();
        let home = f.0.join("home");
        let project = f.0.join("project");
        fs::create_dir_all(home.join(".codex")).unwrap();
        fs::create_dir_all(home.join(".hermes")).unwrap();
        fs::create_dir_all(&project).unwrap();
        let target = Target {
            host: "local".into(),
            scope: "project".into(),
            project_path: Some(project.to_string_lossy().into_owned()),
        };
        let e = engine(&home);
        (f, e, target)
    }
    #[test]
    fn document_only_provider_selects_one_v1_skill_without_support_files_and_keeps_v2_digest_checks() {
        let (_f, e, _) = fixture();
        let server = Server::new();
        let read = |name: &str| run_process(e.command(&e.node, &e.home)
            .arg(e.resources.join("inspect-upstream-provider.mjs")).arg(&server.url).arg("--document").arg(name)).unwrap();
        server.put("/.well-known/agent-skills/selected/SKILL.md", doc("selected"));
        server.index(serde_json::json!({"skills":[
            {"name":"other","description":"Other","files":["SKILL.md"]},
            {"name":"selected","description":"Selected","files":["SKILL.md","unavailable.bin"]}
        ]}));
        let output=read("selected");assert!(output.success,"{}",output.stderr);
        assert_eq!(serde_json::from_str::<serde_json::Value>(&output.stdout).unwrap()["content"],doc("selected"));
        assert!(!server.requests.lock().unwrap().iter().any(|path|path.contains("other/")||path.ends_with("unavailable.bin")));
        assert!(!read("missing").success);
        let zip=archive(&e,"zip","selected",false);
        server.put("/downloads/selected.zip",&zip);
        let mut entry=artifact(&e,"selected","/downloads/selected.zip","archive",&zip);
        server.index(v2(vec![entry.clone()]));
        let output=read("selected");assert!(output.success,"{}",output.stderr);
        assert!(serde_json::from_str::<serde_json::Value>(&output.stdout).unwrap()["content"].as_str().unwrap().contains("name: selected"));
        entry["digest"]=serde_json::json!(format!("sha256:{}","0".repeat(64)));
        server.index(v2(vec![entry]));assert!(!read("selected").success);
        assert!(!e.home.join(".agents/skills").exists());
    }

    #[test]
    fn original_legacy_download_lifecycle_reinstall_and_uninstall_in_both_scopes() {
        let (_f, e, project) = fixture();
        let server = Server::new();
        server.legacy("fixture-skill", true);
        for (target, copy) in [(global(), false), (project, true)] {
            let preview = super::super::inspect(&e, &server.url).unwrap();
            assert!(preview.provider);
            assert_eq!(preview.skills[0].file_count, Some(5));
            let mut op = confirmed(&e, &server.url, target.clone(), &["fixture-skill"], copy);
            let result = apply(&e, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            let inventory = result.inventory.unwrap();
            assert!(!inventory.skills.is_empty());
            for skill in &inventory.skills {
                assert_eq!(
                    fs::read(Path::new(&skill.path).join("data.bin")).unwrap(),
                    [0, 255, 1]
                );
                assert!(Path::new(&skill.path).join("metadata.json").is_file());
                assert!(skill.updateable);
                assert_eq!(skill.source_type.as_deref(), Some("well-known"));
                assert_eq!(skill.install_source.as_deref(), Some(server.url.as_str()));
            }
            let checked = check_updates(&e, &target).unwrap();
            assert_eq!(checked[0].status, "current", "{}", checked[0].message);
            let path = "/.well-known/agent-skills/fixture-skill/SKILL.md";
            server.put(path, format!("{}Version 2\n", doc("fixture-skill")));
            assert!(apply(&e, &op)
                .err()
                .unwrap()
                .contains("Source content changed"));
            op = confirmed(&e, &server.url, target.clone(), &["fixture-skill"], copy);
            let result = apply(&e, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            assert!(result
                .inventory
                .unwrap()
                .skills
                .iter()
                .all(|s| fs::read_to_string(Path::new(&s.path).join("SKILL.md"))
                    .unwrap()
                    .contains("Version 2")));
            op.action = "remove".into();
            op.source_hashes = None;
            let result = apply(&e, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            assert!(result.inventory.unwrap().skills.is_empty());
            assert!(e.lock(&target).unwrap()["skills"]["fixture-skill"].is_null());
            server.put(path, doc("fixture-skill"));
        }
    }
    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
    fn digest(e: &Engine, bytes: &[u8]) -> String {
        let out=run_process(e.command(&e.node,&e.home).args(["-e","process.stdout.write(require('node:crypto').createHash('sha256').update(Buffer.from(process.argv[1],'hex')).digest('hex'))",&hex(bytes)])).unwrap();
        assert!(out.success);
        format!("sha256:{}", out.stdout)
    }
    pub(in crate::upstream) fn archive(
        e: &Engine,
        kind: &str,
        name: &str,
        unsafe_path: bool,
    ) -> Vec<u8> {
        // Use bundled Node built-ins solely to produce disposable archive fixtures.
        // The real upstream provider parses and installs the resulting bytes.
        let script = r#"
const z=require('node:zlib');const name=process.argv[1],kind=process.argv[2],unsafe=process.argv[3]==='true';
const files=[['SKILL.md',Buffer.from(`---\nname: ${name}\ndescription: Artifact fixture\n---\n# Artifact\n`)], [unsafe?'../escape':'binary.dat',Buffer.from([0,255,2])]];
let result;
if(kind==='tgz') {
 const chunks=[];for(const [path,bytes] of files){const h=Buffer.alloc(512);h.write(path);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.fill(32,148,156);h[156]=48;h.write('ustar\0',257);const sum=h.reduce((a,b)=>a+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);chunks.push(h,bytes,Buffer.alloc((512-bytes.length%512)%512));}chunks.push(Buffer.alloc(1024));result=z.gzipSync(Buffer.concat(chunks));
} else {
 const locals=[],central=[];let offset=0;
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 for(const [path,bytes] of files){const n=Buffer.from(path),l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt32LE(crc(bytes),14);l.writeUInt32LE(bytes.length,18);l.writeUInt32LE(bytes.length,22);l.writeUInt16LE(n.length,26);locals.push(l,n,bytes);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc(bytes),16);c.writeUInt32LE(bytes.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);central.push(c,n);offset+=l.length+n.length+bytes.length;}
 const body=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(body.length,12);end.writeUInt32LE(offset,16);result=Buffer.concat([...locals,body,end]);
}process.stdout.write(result.toString('hex'));
"#;
        let out = run_process(e.command(&e.node, &e.home).args([
            "-e",
            script,
            name,
            kind,
            if unsafe_path { "true" } else { "false" },
        ]))
        .unwrap();
        assert!(out.success, "{}", out.stderr);
        decode(&out.stdout).unwrap()
    }
    fn artifact(e: &Engine, name: &str, path: &str, kind: &str, bytes: &[u8]) -> serde_json::Value {
        serde_json::json!({"name":name,"description":"Artifact fixture","type":kind,"url":path,"digest":digest(e,bytes)})
    }
    fn v2(entries: Vec<serde_json::Value>) -> serde_json::Value {
        serde_json::json!({"$schema":"https://schemas.agentskills.io/discovery/0.2.0/schema.json","skills":entries})
    }
    #[test]
    fn original_v2_markdown_zip_and_targz_install_only_selected_artifacts() {
        let (_f, e, _) = fixture();
        let server = Server::new();
        let md = doc("md-skill");
        let zip = archive(&e, "zip", "zip-skill", false);
        let tar = archive(&e, "tgz", "tar-skill", false);
        server.put("/downloads/skill.md", &md);
        server.put("/downloads/skill.zip", &zip);
        server.put("/downloads/skill.tgz", &tar);
        server.index(v2(vec![
            artifact(
                &e,
                "md-skill",
                "/downloads/skill.md",
                "skill-md",
                md.as_bytes(),
            ),
            artifact(&e, "zip-skill", "/downloads/skill.zip", "archive", &zip),
            artifact(&e, "tar-skill", "/downloads/skill.tgz", "archive", &tar),
        ]));
        assert!(super::super::inspect(&e, &format!("{}/docs", server.url)).is_err());
        let preview = super::super::inspect(&e, &server.url).unwrap();
        assert_eq!(preview.skills.len(), 3);
        let mut op = confirmed(
            &e,
            &server.url,
            global(),
            &["zip-skill", "tar-skill"],
            false,
        );
        let result = apply(&e, &op).unwrap();
        assert!(
            result.items.iter().all(|s| s.status == "complete"),
            "{}",
            result.logs
        );
        let inventory = result.inventory.unwrap();
        assert_eq!(inventory.skills.len(), 2);
        assert!(!e.home.join(".agents/skills/md-skill").exists());
        for s in &inventory.skills {
            assert_eq!(
                fs::read(Path::new(&s.path).join("binary.dat")).unwrap(),
                [0, 255, 2]
            );
            assert_eq!(s.install_source.as_deref(), Some(server.url.as_str()));
        }
        op.action = "remove".into();
        op.source_hashes = None;
        assert!(apply(&e, &op)
            .unwrap()
            .items
            .iter()
            .all(|s| s.status == "complete"));
        let mut op = confirmed(&e, &server.url, global(), &["md-skill"], false);
        op.agents = vec!["hermes-agent".into()];
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "complete", "{}", result.logs);
        assert!(e.home.join(".hermes/skills/md-skill/SKILL.md").is_file());
        op.action = "remove".into();
        op.source_hashes = None;
        assert_eq!(apply(&e, &op).unwrap().items[0].status, "complete");
    }
    #[test]
    fn provider_failures_digest_alias_paths_internal_and_changed_index_do_not_write() {
        let (_f, e, project) = fixture();
        let server = Server::new();
        assert!(super::super::inspect(&e, &format!("{}/SKILL.md", server.url)).is_err());
        server.legacy("fixture-skill", false);
        let mut op = confirmed(&e, &server.url, project, &["fixture-skill"], true);
        server.index(serde_json::json!({"skills":[{"name":"fixture-skill","description":"Changed index","files":["SKILL.md"]}]}));
        assert!(apply(&e, &op)
            .err()
            .unwrap()
            .contains("Source content changed"));
        op.agents = vec!["eve".into()];
        assert!(apply(&e, &op).err().unwrap().contains("Eve destinations"));
        let md = doc("fixture-skill");
        server.put("/download.md", &md);
        let mut entry = artifact(
            &e,
            "fixture-skill",
            "/download.md",
            "skill-md",
            md.as_bytes(),
        );
        entry["digest"] = format!("sha256:{}", "0".repeat(64)).into();
        server.index(v2(vec![entry]));
        assert!(super::super::inspect(&e, &server.url).is_err());
        let unsafe_zip = archive(&e, "zip", "fixture-skill", true);
        server.put("/unsafe.zip", &unsafe_zip);
        server.index(v2(vec![artifact(
            &e,
            "fixture-skill",
            "/unsafe.zip",
            "archive",
            &unsafe_zip,
        )]));
        assert!(super::super::inspect(&e, &server.url).is_err());
        server.legacy("fixture-skill", true);
        server
            .routes
            .lock()
            .unwrap()
            .remove("/.well-known/agent-skills/fixture-skill/data.bin");
        assert!(super::super::inspect(&e, &server.url).is_err());
        server.legacy("fixture-skill", false);
        server.put(
            "/.well-known/agent-skills/fixture-skill/SKILL.md",
            doc("different-name"),
        );
        assert!(super::super::inspect(&e, &server.url)
            .err()
            .unwrap()
            .contains("installation name differs"));
        server.put("/.well-known/agent-skills/fixture-skill/SKILL.md","---\nname: fixture-skill\ndescription: Hidden\nmetadata: {internal: true}\n---\n# Hidden\n");
        assert!(super::super::inspect(&e, &server.url).is_err());
        assert_eq!(
            inspect_with_options(&e, &server.url, true)
                .unwrap()
                .skills
                .len(),
            1
        );
        assert!(super::super::inspect(&e, &format!("{}?token=secret", server.url)).is_err());
        assert!(!e.home.join(".agents/skills").exists());
    }

    #[test]
    fn provider_redirect_partial_discovery_and_zero_exit_without_files_are_not_success() {
        let (f, mut e, _) = fixture();
        let server = Server::new();
        let md = doc("fixture-skill");
        server.put("/real.md", &md);
        server.routes.lock().unwrap().insert(
            "/download.md".into(),
            (302, Vec::new(), Some("/real.md".into())),
        );
        let valid = artifact(
            &e,
            "fixture-skill",
            "/download.md",
            "skill-md",
            md.as_bytes(),
        );
        server.index(v2(vec![valid.clone()]));
        assert_eq!(
            super::super::inspect(&e, &server.url).unwrap().skills.len(),
            1
        );
        let broken = artifact(
            &e,
            "missing-skill",
            "/missing.md",
            "skill-md",
            doc("missing-skill").as_bytes(),
        );
        server.index(v2(vec![valid.clone(), broken]));
        assert!(super::super::inspect(&e, &server.url)
            .err()
            .unwrap()
            .contains("incomplete"));
        server.index(v2(vec![valid]));
        server.routes.lock().unwrap().insert(
            "/download.md".into(),
            (
                302,
                Vec::new(),
                Some(format!("{}/real.md?token=secret", server.url)),
            ),
        );
        assert!(super::super::inspect(&e, &server.url).is_err());
        server.routes.lock().unwrap().insert(
            "/download.md".into(),
            (302, Vec::new(), Some("/real.md".into())),
        );
        fn copy(from: &Path, to: &Path) {
            fs::create_dir_all(to).unwrap();
            for entry in fs::read_dir(from).unwrap() {
                let entry = entry.unwrap();
                let target = to.join(entry.file_name());
                if entry.path().is_dir() {
                    copy(&entry.path(), &target);
                } else {
                    fs::copy(entry.path(), target).unwrap();
                }
            }
        }
        let resources = f.0.join("noop-resources");
        copy(&e.resources, &resources);
        // Only this disposable fixture entry is replaced; shipped upstream bytes stay original.
        fs::write(
            resources.join("skills/bin/cli.mjs"),
            "if(process.argv[2]==='list')console.log('[]');",
        )
        .unwrap();
        e.resources = resources;
        let op = confirmed(&e, &server.url, global(), &["fixture-skill"], false);
        let result = apply(&e, &op).unwrap();
        assert_eq!(result.items[0].status, "uncertain");
        assert!(!e.home.join(".agents/skills/fixture-skill").exists());
        assert!(e.lock(&global()).unwrap()["skills"]["fixture-skill"].is_null());
    }
    #[test]
    fn original_well_known_digest_update_and_removed_skill_requires_user_uninstall() {
        for project_scope in [false, true] {
            let (_f, e, project) = fixture();
            let target = if project_scope { project } else { global() };
            let server = Server::new();
            server.legacy("fixture-skill", false);
            let mut op = confirmed(&e, &server.url, target.clone(), &["fixture-skill"], false);
            op.agents = vec!["codex".into()];
            assert_eq!(apply(&e, &op).unwrap().items[0].status, "complete");
            assert_eq!(check_updates(&e, &target).unwrap()[0].status, "current");
            let before =
                e.lock(&target).unwrap()["skills"]["fixture-skill"]["wellKnownDigest"].clone();
            server.put(
                "/.well-known/agent-skills/fixture-skill/SKILL.md",
                format!("{}Version 2\n", doc("fixture-skill")),
            );
            assert_eq!(check_updates(&e, &target).unwrap()[0].status, "available");
            op.action = "update".into();
            op.agents.clear();
            op.source_hashes = None;
            let result = apply(&e, &op).unwrap();
            assert_eq!(result.items[0].status, "complete", "{}", result.logs);
            assert_ne!(
                e.lock(&target).unwrap()["skills"]["fixture-skill"]["wellKnownDigest"],
                before
            );
            assert_eq!(check_updates(&e, &target).unwrap()[0].status, "current");
            server.index(serde_json::json!({"skills":[]}));
            assert_eq!(check_updates(&e, &target).unwrap()[0].status, "removed");
            assert!(target
                .directory(&e.home)
                .unwrap()
                .join(".agents/skills/fixture-skill/SKILL.md")
                .is_file());
            op.action = "remove".into();
            op.agents = vec!["codex".into()];
            assert_eq!(apply(&e, &op).unwrap().items[0].status, "complete");
            assert!(e.inventory(&target).unwrap().skills.is_empty());
        }
    }
}

// Document-only well-known read: no inspection session, materialized directory or CLI entry.
pub(super) fn marketplace_document(
    app: &AppHandle,
    source: &str,
    name: &str,
) -> Result<String, String> {
    validate_url(source)?;
    let engine = Engine::from_app(app)?;
    let output = run_process(
        engine
            .command(&engine.node, &engine.home)
            .arg(engine.resources.join("inspect-upstream-provider.mjs"))
            .arg(source)
            .arg("--document")
            .arg(name),
    )?;
    if !output.success {
        return Err(format!(
            "Could not read the published skill document: {}",
            output.stderr
        ));
    }
    let value: serde_json::Value =
        serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    value["content"]
        .as_str()
        .map(str::to_owned)
        .ok_or("Published skill document is missing.".into())
}
