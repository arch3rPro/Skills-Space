//! Workbench-owned records and structured original Agent processes.
use super::*;
use std::io::Write;
use serde_json::{json, Value};

static ACTIVE: Mutex<Option<String>> = Mutex::new(None);

fn request(app: &AppHandle, action: &str, input: Value) -> Result<(Engine, Value), String> {
    let engine = Engine::from_app(app)?;
    let settings = crate::preferences::read(app)?;
    let base = crate::preferences::workshop_path(settings.workshop_directory.as_deref(), &engine.home)?;
    let mut bases = vec![base.clone(), engine.home.join(".skills-space").join("workshop"), app.path().app_data_dir().map_err(|e| e.to_string())?.join("workshop")];
    for path in &settings.workshop_history_paths { bases.push(crate::preferences::workshop_path(Some(path), &engine.home)?); }
    let mut value = input.as_object().cloned().ok_or("Invalid workshop request.")?;
    value.insert("action".into(), json!(action));
    value.insert("base".into(), json!(base));
    value.insert("bases".into(), json!(bases));
    value.insert("home".into(), json!(engine.home));
    value.insert("cli".into(), json!(engine.resources.join("skills/bin/cli.mjs")));
    value.insert("parentPid".into(), json!(std::process::id()));
    value.insert("activeId".into(), json!(ACTIVE.lock().map_err(|_| "Workshop state is unavailable.")?.clone()));
    Ok((engine, Value::Object(value)))
}
fn call(engine: &Engine, request: &Value) -> Result<Value, String> {
    let mut child = engine.command(&engine.node, &engine.home)
        .arg(engine.resources.join("workshop.mjs"))
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped())
        .spawn().map_err(|e| e.to_string())?;
    let bytes = serde_json::to_vec(request).map_err(|e| e.to_string())?;
    child.stdin.take().ok_or("Workshop input is unavailable.")?.write_all(&bytes).map_err(|e| e.to_string())?;
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Err(String::from_utf8_lossy(&output.stderr).trim().to_owned()); }
    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
struct WorkshopDocumentMetadata {
    #[serde(flatten)]
    document: DocumentMetadata,
    version: Option<String>,
    license: Option<String>,
    compatibility: Option<String>,
}

// Reuse the existing upstream frontmatter reader; no folder hashing or second parser.
fn enrich_metadata(engine: &Engine, result: &mut Value, hash: bool) -> Result<(), String> {
    let mut drafts: Vec<&mut Value> = match result {
        Value::Array(items) => items.iter_mut().collect(),
        Value::Object(_) => vec![result],
        _ => return Ok(()),
    };
    for draft in &mut drafts { draft["metadata"] = Value::Null; }
    let paths: Vec<String> = drafts.iter().filter_map(|draft| draft["skillDirectory"].as_str().map(str::to_owned)).collect();
    if paths.is_empty() { return Ok(()); }
    let mut command = engine.command(&engine.node, &engine.home);
    command.arg(engine.resources.join("inspect-skill-documents.mjs"))
        .arg(serde_json::to_string(&paths).map_err(|e| e.to_string())?);
    if !hash { command.arg("--metadata-only"); }
    let output = run_process(&mut command)?;
    if !output.success { return Err(format!("Cannot read workshop skill metadata: {}", output.stderr)); }
    let metadata: Vec<WorkshopDocumentMetadata> = serde_json::from_str(&output.stdout).map_err(|e| e.to_string())?;
    for draft in drafts {
        let document = draft["skillDirectory"].as_str().and_then(|path| metadata.iter().find(|document| document.document.path == path));
        draft["metadata"] = document.map(|document| json!({
            "name": document.document.name, "description": document.document.description, "error": document.document.error,
            "version": document.version, "hash": document.document.hash, "license": document.license, "compatibility": document.compatibility,
        })).unwrap_or(Value::Null);
    }
    Ok(())
}

#[tauri::command]
pub async fn workshop_command(app: AppHandle, action: String, input: Value) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !matches!(action.as_str(), "agents" | "list" | "read" | "detail" | "document" | "create" | "update" | "open" | "stop" | "send") {
            return Err("Unknown workshop action.".into());
        }
        if action == "send" {
            let id = input["id"].as_str().ok_or("Choose a workshop draft.")?.to_owned();
            {
                let mut active = ACTIVE.lock().map_err(|_| "Workshop state is unavailable.")?;
                if active.is_some() { return Err("Another workshop task is still running.".into()); }
                *active = Some(id.clone());
            }
            let prepared = request(&app, "validate", input.clone()).and_then(|(engine, value)| call(&engine, &value));
            if let Err(error) = prepared { *ACTIVE.lock().map_err(|_| "Workshop state is unavailable.")? = None; return Err(error); }
            let run_request = request(&app, "run", input);
            let (engine, value) = match run_request { Ok(value) => value, Err(error) => { *ACTIVE.lock().map_err(|_| "Workshop state is unavailable.")? = None; return Err(error); } };
            let worker_app = app.clone();
            thread::spawn(move || {
                if let Err(error) = call(&engine, &value) {
                    if let Ok((engine, value)) = request(&worker_app, "fail", json!({"id":id,"error":error})) { let _ = call(&engine, &value); }
                }
                if let Ok(mut active) = ACTIVE.lock() { *active = None; }
            });
            return Ok(Value::Null);
        }
        if action == "stop" {
            let active = ACTIVE.lock().map_err(|_| "Workshop state is unavailable.")?.clone();
            if input["id"].as_str() != active.as_deref() || active.is_none() { return Err("This workshop task is no longer running.".into()); }
        }
        let (engine, value) = request(&app, if action == "open" { "directory" } else { &action }, input)?;
        let mut result = call(&engine, &value)?;
        if matches!(action.as_str(), "list" | "read" | "detail" | "create" | "update") { enrich_metadata(&engine, &mut result, action == "detail")?; }
        if action == "open" {
            use tauri_plugin_opener::OpenerExt;
            let path = result.as_str().ok_or("Workshop directory is unavailable.")?;
            app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())?;
            return Ok(Value::Null);
        }
        Ok(result)
    }).await.map_err(|e| e.to_string())?
}
