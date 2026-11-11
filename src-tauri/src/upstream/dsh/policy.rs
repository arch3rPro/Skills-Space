use super::*;
use super::native::WriterLock;

#[derive(Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct PolicyChange {
    target: Target,
    context_key: Option<String>,
    revision: String,
    configuration_revision: String,
    action: String,
    files: Vec<PolicyFile>,
}
#[derive(Deserialize,Serialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct PolicyFile { file:String, revision:String }
#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct PreparedPolicy {path:String,before:String,before_missing:bool,after:String,lock_path:String}

fn prepare_policy(engine:&Engine,target:&Target,mode:&str,payload:serde_json::Value)->Result<PreparedPolicy,String>{
    let directory=target.directory(&engine.home)?;
    let mut command=helper_command(engine,&engine.home);
    command.arg(engine.resources.join("prepare-dsh-change.mjs")).arg(mode).arg(&engine.home).arg(harness_home(engine))
        .arg(if target.scope=="project"{directory.to_string_lossy().into_owned()}else{String::new()})
        .arg(serde_json::to_string(&payload).map_err(|e|e.to_string())?).arg("{}");
    let result=run_process_with_timeout(&mut command,Duration::from_secs(30))?;
    if !result.success{return Err(format!("DSH policy preparation failed: {}",result.stderr));}
    serde_json::from_str(&result.stdout).map_err(|e|e.to_string())
}
fn write_prepared(plan:&PreparedPolicy)->Result<(),String>{
    let path=Path::new(&plan.path);
    if path.exists(){let metadata=fs::symlink_metadata(path).map_err(|e|e.to_string())?;
        if metadata.file_type().is_symlink()||!metadata.is_file(){return Err("DSH policy destination is not a regular file.".into());}
        #[cfg(unix)] {use std::os::unix::fs::MetadataExt;if metadata.nlink()!=1{return Err("DSH policy destination is hard-linked.".into());}}
    }
    if if plan.before_missing{path.exists()}else{fs::read_to_string(path).map_err(|e|e.to_string())?!=plan.before}{return Err("DSH policy changed while saving. Refresh before retrying.".into());}
    pi::write_bytes(path,plan.after.as_bytes())
}
fn save(engine:&Engine,change:PolicyChange)->Result<serde_json::Value,String>{
    if change.files.is_empty(){return Err("No DSH skills selected.".into());}
    let before=inspect_context(engine,&change.target,change.context_key.as_deref())?;
    if before["revision"]!=change.configuration_revision||before["policy"]["revision"]!=change.revision{return Err("DSH configuration or policy changed. Refresh before saving.".into());}
    let path=before["policy"]["policyFile"].as_str().ok_or("DSH policy path unavailable")?;
    let parent=Path::new(path).parent().ok_or("DSH policy parent unavailable")?;
    fs::create_dir_all(parent).map_err(|e|e.to_string())?;
    if fs::canonicalize(parent).map_err(|e|e.to_string())?!=parent{return Err("DSH policy directory is linked.".into());}
    let _lock=WriterLock::acquire(Path::new(path))?;
    let plan=prepare_policy(engine,&change.target,"policy",serde_json::json!({"contextKey":change.context_key,"revision":change.revision,"configurationRevision":change.configuration_revision,"action":change.action,"files":change.files}))?;
    if plan.path!=path||plan.lock_path!=path{return Err("DSH policy write target changed.".into());}
    write_prepared(&plan)?;
    inspect_context(engine,&change.target,change.context_key.as_deref())
}

#[tauri::command]
pub async fn upstream_dsh_policy(app:AppHandle,change:PolicyChange)->Result<serde_json::Value,String>{
    tauri::async_runtime::spawn_blocking(move||{let _guard=MUTATION.lock().map_err(|e|e.to_string())?;save(&Engine::from_app(&app)?,change)}).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn upstream_dsh_policy_install(app:AppHandle,target:Target,context_key:Option<String>,revision:String)->Result<serde_json::Value,String>{
    tauri::async_runtime::spawn_blocking(move||{let _guard=MUTATION.lock().map_err(|e|e.to_string())?;install(&Engine::from_app(&app)?,&target,context_key.as_deref(),&revision)}).await.map_err(|e|e.to_string())?
}
fn install(engine:&Engine,target:&Target,context_key:Option<&str>,revision:&str)->Result<serde_json::Value,String>{
    if context_key!=Some("all"){return install_one(engine,target,context_key,revision);}
    let before=inspect_context(engine,target,Some("all"))?;
    if before["revision"]!=revision{return Err("DSH configuration changed. Refresh first.".into());}
    let candidates=before["policy"]["configurations"].as_array().ok_or("DSH configurations unavailable")?.iter().filter(|row|row["canInstall"]==true&&matches!(row["status"].as_str(),Some("not-installed"|"needs-setup"))).filter_map(|row|row["path"].as_str().map(str::to_owned)).collect::<Vec<_>>();
    if candidates.is_empty(){return Err("No DSH configuration is eligible for plugin setup.".into());}
    for (index,path) in candidates.iter().enumerate(){
        let key=format!("file:{path}");let current=inspect_context(engine,target,Some(&key))?;
        let version=current["revision"].as_str().ok_or("DSH revision unavailable")?;
        install_one(engine,target,Some(&key),version).map_err(|error|format!("DSH plugin setup completed {index}/{}. {path}: {error}",candidates.len()))?;
    }
    inspect_context(engine,target,Some("all"))
}
fn install_one(engine:&Engine,target:&Target,context_key:Option<&str>,revision:&str)->Result<serde_json::Value,String>{
    let before=inspect_context(engine,target,context_key)?;
    if before["revision"]!=revision||before["policy"]["canInstall"]!=true{return Err("DSH configuration changed or cannot enable the policy plugin. Refresh first.".into());}
    let path=before["configurationPath"].as_str().ok_or("DSH configuration unavailable")?;
    let row=before["configurations"].as_array().and_then(|rows|rows.iter().find(|row|row["path"]==path)).ok_or("DSH profile unavailable")?;
    let profile=row["profile"].as_str().ok_or("DSH profile unavailable")?;
    let installation=row["installation"].as_str().ok_or("DSH installation unavailable")?;
    let raw=fs::read(path).ok();
    // Resume after a successful original CLI install when only the overlay
    // failed. The inspector verifies the installed package version and bytes.
    if before["policy"]["status"] != "needs-setup" {
        let metadata:serde_json::Value=serde_json::from_slice(&fs::read(engine.resources.join("dsh-skill-policy/package.json")).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        let version=metadata["version"].as_str().ok_or("DSH plugin version unavailable")?;
        let source=harness_home(engine).join("skills-space/plugin").join(version);
        fs::create_dir_all(&source).map_err(|e|e.to_string())?;
        if fs::canonicalize(&source).map_err(|e|e.to_string())?!=source{return Err("DSH companion directory is linked.".into());}
        for file in ["index.mjs","state.mjs","package.json","cordis.patch.yml"]{pi::write_bytes(&source.join(file),&fs::read(engine.resources.join("dsh-skill-policy").join(file)).map_err(|e|e.to_string())?)?;}
        let mut command=helper_command(engine,&engine.home);
        command.arg(engine.resources.join("run-dsh-policy-install.mjs")).arg(&engine.home).arg(installation).arg(profile).arg(&source).env("DSH_HOME",harness_home(engine));
        let result=run_process_with_timeout(&mut command,Duration::from_secs(120))?;
        if !result.success{return Err(format!("Original DSH CLI plugin installation failed: {}\n{}",result.stderr,result.stdout));}
    }
    if fs::read(path).ok()!=raw{return Err("DSH plugin installed, but the configuration changed. Refresh before applying its overlay.".into());}
    let manifest=row["manifestPath"].as_str().ok_or("DSH manifest unavailable")?;
    let _lock=WriterLock::acquire(Path::new(manifest))?;
    let plan=prepare_policy(engine,target,"policy-setup",serde_json::json!({"contextKey":context_key}))?;
    if plan.path!=path||plan.lock_path!=manifest{return Err("DSH configuration write target changed.".into());}
    write_prepared(&plan)?;
    let after=inspect_context(engine,target,context_key)?;
    if after["contextIssue"].is_string(){inspect_context(engine,target,Some(&format!("file:{path}")))}else{Ok(after)}
}

#[tauri::command]
pub async fn upstream_dsh_repair_preset(
    app: AppHandle,
    target: Target,
    context_key: String,
    revision: String,
) -> Result<serde_json::Value, String> {
    if target.scope != "global" {
        return Err("Repair Agent presets in global DSH settings.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = MUTATION.lock().map_err(|e| e.to_string())?;
        let engine = Engine::from_app(&app)?;
        repair_preset(&engine, &target, &context_key, &revision)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn repair_preset(engine: &Engine, target: &Target, key: &str, revision: &str) -> Result<serde_json::Value, String> {
    let before = inspect_context(engine, target, Some(key))?;
    if before["revision"] != revision || before["contextIssue"].is_string() {
        return Err("DSH configuration changed. Refresh before repairing the preset.".into());
    }
    let path = before["configurationPath"].as_str().ok_or("DSH configuration unavailable")?;
    let manifest = Path::new(path).with_file_name("package.json");
    let _lock = WriterLock::acquire(&manifest)?;
    let plan = prepare_policy(engine, target, "preset-repair", serde_json::json!({"contextKey":key,"revision":revision}))?;
    if plan.path != path || Path::new(&plan.lock_path) != manifest {
        return Err("DSH configuration write target changed.".into());
    }
    write_prepared(&plan)?;
    inspect_context(engine, target, Some(key))
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path=std::env::temp_dir().join(format!("dsh-policy-writer-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
            fs::create_dir_all(&path).unwrap();Self(path)
        }
        fn plan(&self) -> PreparedPolicy {
            let path=self.0.join("policy.json").to_string_lossy().into_owned();
            PreparedPolicy{path:path.clone(),before:"before".into(),before_missing:false,after:"after".into(),lock_path:path}
        }
    }
    impl Drop for Fixture { fn drop(&mut self){let _=fs::remove_dir_all(&self.0);} }

    #[test]
    fn prepared_policy_write_rejects_changed_and_newly_created_destinations() {
        let fixture=Fixture::new();let mut plan=fixture.plan();
        fs::write(&plan.path,"external edit").unwrap();
        assert!(write_prepared(&plan).unwrap_err().contains("changed"));
        assert_eq!(fs::read_to_string(&plan.path).unwrap(),"external edit");
        plan.before_missing=true;
        assert!(write_prepared(&plan).unwrap_err().contains("changed"));
        fs::remove_file(&plan.path).unwrap();write_prepared(&plan).unwrap();
        assert_eq!(fs::read_to_string(&plan.path).unwrap(),"after");
    }

    #[test]
    #[cfg(unix)]
    fn prepared_policy_write_rejects_links_without_modifying_shared_bytes() {
        let fixture=Fixture::new();let plan=fixture.plan();let outside=fixture.0.join("source.json");
        fs::write(&outside,"before").unwrap();
        std::os::unix::fs::symlink(&outside,&plan.path).unwrap();
        assert!(write_prepared(&plan).unwrap_err().contains("regular"));
        assert_eq!(fs::read_to_string(&outside).unwrap(),"before");fs::remove_file(&plan.path).unwrap();
        fs::hard_link(&outside,&plan.path).unwrap();
        assert!(write_prepared(&plan).unwrap_err().contains("hard-linked"));
        assert_eq!(fs::read_to_string(&outside).unwrap(),"before");
    }

}
