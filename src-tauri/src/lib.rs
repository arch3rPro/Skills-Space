mod marketplace;
mod preferences;
mod upstream;
mod versions;
mod window_controls;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let preferences = preferences::read(app.handle()).map_err(std::io::Error::other)?;
            preferences::theme(app.handle(), &preferences.theme);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            upstream::node_runtime::application_node_status,
            upstream::node_runtime::application_node_detect,
            upstream::node_runtime::application_node_select,
            versions::application_versions,
            versions::application_check_versions,
            marketplace::fetch_skill_leaderboard,
            marketplace::fetch_skill_document,
            marketplace::fetch_skill_markdown,
            marketplace::upstream_find,
            upstream::dependencies::upstream_dependency_plan,
            upstream::project_sources::upstream_project_preview_release,
            upstream::restoration::upstream_restore_records,
            upstream::dependencies::upstream_dependency_install,
            upstream::restoration::upstream_restore_plan,
            upstream::restoration::upstream_restore,
            upstream::creation::upstream_creation_plan,
            upstream::creation::upstream_create,
            upstream::creation::upstream_open_created,
            upstream::usage::upstream_use_agents,
            upstream::usage::upstream_use_prepare,
            upstream::usage::upstream_use_start,
            upstream::usage::upstream_use_session,
            upstream::usage::upstream_use_sessions,
            upstream::usage::upstream_use_cancel,
            upstream::usage::upstream_use_release,
            upstream::usage::upstream_use_open_directory,
            upstream::upstream_inventory,
            upstream::upstream_agents,
            upstream::codex::upstream_codex_settings,
            upstream::codex::defaults::upstream_codex_defaults,
            upstream::codex::defaults::upstream_codex_save_defaults,
            upstream::codex::upstream_codex_plugin_directory,
            upstream::codex::upstream_codex_plugin_category,
            upstream::codex::upstream_codex_prepare_public_plugin,
            upstream::codex::account::upstream_codex_account_start,
            upstream::codex::account::upstream_codex_account_status,
            upstream::codex::account::upstream_codex_account_cancel,
            upstream::codex::account::upstream_codex_account_logout,
            upstream::codex::details::upstream_codex_plugin_details,
            upstream::codex::markets::upstream_codex_marketplaces,
            upstream::codex::markets::upstream_codex_marketplace_apply,
            upstream::codex::updates::upstream_codex_check_plugin,
            upstream::codex::updates::upstream_codex_update_plugin,
            upstream::codex::rules::upstream_codex_save_rules,
            upstream::codex::upstream_codex_toggle,
            upstream::codex::upstream_codex_plugin,
            upstream::hermes::upstream_hermes_settings,
            upstream::hermes::upstream_hermes_save,
            upstream::pi::upstream_pi_settings,
            upstream::dsh::upstream_dsh_settings,
            upstream::dsh::upstream_dsh_open_configuration,
            upstream::dsh::upstream_dsh_save,
            upstream::dsh::upstream_dsh_policy,
            upstream::dsh::upstream_dsh_policy_install,
            upstream::dsh::upstream_dsh_removal_plan,
            upstream::dsh::upstream_dsh_trash,
            upstream::dsh::upstream_dsh_creation_plan,
            upstream::dsh::upstream_dsh_create,
            upstream::pi::upstream_pi_save,
            upstream::pi::upstream_pi_trust,
            upstream::pi::upstream_pi_validate_directories,
            upstream::pi::upstream_pi_toggle,
            upstream::pi::upstream_pi_toggle_batch,
            upstream::pi::visibility::upstream_pi_visibility,
            upstream::pi::native::upstream_pi_invocation,
            upstream::pi::native::upstream_pi_invocation_batch,
            upstream::pi::packages::upstream_pi_package,
            upstream::pi::inventory::upstream_pi_packages,
            upstream::pi_removal::upstream_pi_removal_plan,
            upstream::pi_removal::upstream_pi_trash,
            upstream::upstream_inspect,
            upstream::skill_sync::upstream_skill_sync_review,
            upstream::skill_sync::upstream_skill_sync_targets,
            upstream::inspection_session::upstream_inspection_release,
            upstream::upstream_apply,
            upstream::upstream_removal_plan,
            upstream::source_removal::upstream_source_removal_plan,
            upstream::upstream_check_updates,
            upstream::upstream_update_local_states,
            upstream::upstream_document,
            upstream::document_diff::upstream_skill_diff,
            upstream::document_diff::upstream_skill_file_restore,
            upstream::upstream_source_directory,
            upstream::upstream_open_directory,
            upstream::upstream_local_directories,
            preferences::upstream_preferences,
            preferences::upstream_window_appearance,
            window_controls::upstream_window_controls,
            preferences::upstream_save_preferences,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Skills Space")
        .run(|_, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                upstream::codex::account::cleanup();
                upstream::inspection_session::cleanup();
                upstream::project_sources::cleanup();
            }
        });
}
