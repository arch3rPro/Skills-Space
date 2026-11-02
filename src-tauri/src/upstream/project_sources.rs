//! One active project flow's temporary source checkouts; never installation records.
use super::*;
use std::sync::LazyLock;

struct Preview {
    home: PathBuf,
    target: Target,
    kind: String,
    touched: Instant,
    sources: SourceCache,
}
static PREVIEW: LazyLock<Mutex<Option<Preview>>> = LazyLock::new(|| Mutex::new(None));

pub(super) fn with<T>(
    engine: &Engine,
    target: &Target,
    kind: &str,
    refresh: bool,
    run: impl FnOnce(&mut SourceCache) -> Result<T, String>,
) -> Result<T, String> {
    let previous = PREVIEW
        .lock()
        .map_err(|_| "Cannot access project preview.")?
        .take();
    let mut preview = previous
        .filter(|p| {
            p.home == engine.home
                && p.target == *target
                && p.kind == kind
                && p.touched.elapsed() < Duration::from_secs(1800)
        })
        .unwrap_or_else(|| Preview {
            home: engine.home.clone(),
            target: target.clone(),
            kind: kind.into(),
            touched: Instant::now(),
            sources: SourceCache::default(),
        });
    preview.sources.refresh = refresh;
    preview.sources.checked.clear();
    if refresh {
        preview.sources.locations.retain(|_, value| value.is_ok());
    }
    let result = run(&mut preview.sources);
    preview.touched = Instant::now();
    *PREVIEW
        .lock()
        .map_err(|_| "Cannot access project preview.")? = Some(preview);
    result
}
pub(crate) fn cleanup() {
    if let Ok(mut preview) = PREVIEW.lock() {
        *preview = None;
    }
}

#[tauri::command]
pub async fn upstream_project_preview_release(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let engine = Engine::from_app(&app)?;
        let mut preview = PREVIEW
            .lock()
            .map_err(|_| "Cannot access project preview.")?;
        if preview.as_ref().is_some_and(|p| p.home == engine.home) {
            *preview = None;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
