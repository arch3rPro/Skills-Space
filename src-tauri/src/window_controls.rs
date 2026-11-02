#[tauri::command]
pub async fn upstream_window_controls(
    window: tauri::WebviewWindow,
    collapsed: bool,
) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSWindow, NSWindowButton, NSWindowStyleMask};
        let (sender, mut receiver) = tauri::async_runtime::channel(1);
        let native = window.clone();
        window
            .run_on_main_thread(move || {
                let result = (|| {
                    let pointer = native.ns_window().map_err(|error| error.to_string())?;
                    // Tauri owns this NSWindow. Access it only on the AppKit main thread,
                    // without retaining the borrowed reference beyond this callback.
                    let window = unsafe { pointer.cast::<NSWindow>().as_ref() }
                        .ok_or("Native window is unavailable.")?;
                    let hidden =
                        collapsed && !window.styleMask().contains(NSWindowStyleMask::FullScreen);
                    let buttons = [
                        NSWindowButton::CloseButton,
                        NSWindowButton::MiniaturizeButton,
                        NSWindowButton::ZoomButton,
                    ]
                    .into_iter()
                    .map(|kind| window.standardWindowButton(kind))
                    .collect::<Option<Vec<_>>>()
                    .ok_or("Native window controls are unavailable.")?;
                    for button in &buttons {
                        button.setHidden(hidden);
                    }
                    if buttons.iter().any(|button| button.isHidden() != hidden) {
                        return Err("Native window controls did not update.".into());
                    }
                    Ok(hidden)
                })();
                let _ = sender.try_send(result);
            })
            .map_err(|error| error.to_string())?;
        receiver
            .recv()
            .await
            .ok_or("Native window update was interrupted.")?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, collapsed);
        Ok(false)
    }
}
