use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager, Theme};

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Project {
    pub path: String,
    pub name: String,
    pub icon: String,
}
fn deserialize_projects<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<Project>, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum SavedProject {
        Legacy(String),
        Current(Project),
    }
    Vec::<SavedProject>::deserialize(deserializer).map(|items| {
        items
            .into_iter()
            .map(|item| match item {
                SavedProject::Current(project) => project,
                SavedProject::Legacy(path) => {
                    let name = std::path::Path::new(&path)
                        .file_name()
                        .and_then(|name| name.to_str())
                        .unwrap_or(&path)
                        .to_owned();
                    Project {
                        path,
                        name,
                        icon: "folder".into(),
                    }
                }
            })
            .collect()
    })
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallMode {
    #[default]
    Symlink,
    Copy,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub theme: String,
    #[serde(default = "default_color_theme")]
    pub color_theme: String,
    #[serde(default = "default_font_family")]
    pub font_family: String,
    #[serde(default = "default_font_size")]
    pub font_size: u8,
    pub language: String,
    #[serde(default = "default_store_page_size")]
    pub store_page_size: usize,
    #[serde(default)]
    pub install_mode: InstallMode,
    #[serde(deserialize_with = "deserialize_projects")]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub collapsed_sections: Vec<String>,
    pub hidden_agents: Vec<String>,
    // Accept the retired setting without retaining its former filtering behavior.
    #[serde(default, skip_serializing, rename = "hideUnmanageableCodexPlugins")]
    pub _legacy_hidden_plugin_filter: bool,
    #[serde(default)]
    pub visible_agents: Vec<String>,
    #[serde(default)]
    pub agent_order: Vec<String>,
    #[serde(default)]
    pub dsh_contexts: std::collections::BTreeMap<String, Option<String>>,
}
fn default_store_page_size() -> usize { 12 }
fn default_color_theme() -> String {
    "codex".into()
}
fn default_font_family() -> String {
    "system".into()
}
fn default_font_size() -> u8 {
    16
}
fn valid_appearance(p: &Preferences) -> bool {
    matches!(
        p.color_theme.as_str(),
        "codex"
            | "claude"
            | "caffeine"
            | "darkmatter"
            | "modern-minimal"
            | "supabase"
            | "vercel"
            | "twitter"
            | "dark-forge"
    ) && matches!(
        p.font_family.as_str(),
        "geist" | "system" | "serif" | "mono"
    ) && matches!(p.font_size, 14 | 16 | 18)
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            theme: "system".into(),
            color_theme: default_color_theme(),
            font_family: default_font_family(),
            font_size: default_font_size(),
            language: "zh-CN".into(),
            store_page_size: default_store_page_size(),
            install_mode: InstallMode::default(),
            projects: vec![],
            collapsed_sections: vec![],
            hidden_agents: vec![],
            _legacy_hidden_plugin_filter: false,
            visible_agents: vec![],
            agent_order: vec![],
            dsh_contexts: Default::default(),
        }
    }
}
pub fn read(app: &AppHandle) -> Result<Preferences, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("preferences-v2.json");
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| e.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Preferences::default()),
        Err(error) => Err(error.to_string()),
    }
}
pub fn theme(app: &AppHandle, value: &str) {
    app.set_theme(match value {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None,
    });
}
#[tauri::command]
pub fn upstream_window_appearance(
    app: AppHandle,
    background: [u8; 3],
    dark: bool,
    follow_system: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let window = app
            .get_webview_window("main")
            .ok_or("Main window is unavailable.")?;
        window
            .set_theme(if follow_system {
                None
            } else {
                Some(if dark { Theme::Dark } else { Theme::Light })
            })
            .map_err(|e| e.to_string())?;
        window
            .set_title_bar_style(tauri::TitleBarStyle::Overlay)
            .map_err(|e| e.to_string())?;
        window
            .set_background_color(Some(tauri::window::Color(
                background[0],
                background[1],
                background[2],
                255,
            )))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, background, dark, follow_system);
    Ok(())
}
#[tauri::command]
pub fn upstream_preferences(app: AppHandle) -> Result<Preferences, String> {
    read(&app)
}
#[tauri::command]
pub fn upstream_save_preferences(
    app: AppHandle,
    preferences: Preferences,
) -> Result<Preferences, String> {
    if !matches!(preferences.store_page_size, 12 | 24 | 48)
        || !valid_appearance(&preferences)
        || !matches!(preferences.theme.as_str(), "dark" | "light" | "system")
        || !matches!(preferences.language.as_str(), "zh-CN" | "en")
    {
        return Err("Invalid preferences.".into());
    }
    if preferences.projects.iter().any(|project| {
        !std::path::Path::new(&project.path).is_absolute() || project.name.trim().is_empty()
    }) {
        return Err("Projects must have absolute paths.".into());
    }
    let mut paths = std::collections::HashSet::new();
    if preferences.projects.iter().any(|project| {
        !paths.insert(
            fs::canonicalize(&project.path)
                .unwrap_or_else(|_| std::path::PathBuf::from(&project.path)),
        )
    }) {
        return Err("Duplicate project paths.".into());
    }
    let directory = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let temporary = directory.join("preferences-v2.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(&preferences).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temporary, directory.join("preferences-v2.json")).map_err(|e| e.to_string())?;
    theme(&app, &preferences.theme);
    Ok(preferences)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn store_page_size_defaults_for_older_preferences_and_round_trips_without_losing_other_fields() {
        let old:Preferences=serde_json::from_str(r#"{"theme":"dark","language":"zh-CN","projects":["/tmp/project"],"hiddenAgents":["codex"]}"#).unwrap();
        assert_eq!(old.store_page_size,12);assert_eq!(Preferences::default().store_page_size,12);
        for size in [12,24,48] {
            let prefs=Preferences{store_page_size:size,..old.clone()};let bytes=serde_json::to_vec_pretty(&prefs).unwrap();let json:serde_json::Value=serde_json::from_slice(&bytes).unwrap();assert_eq!(json["storePageSize"],size);
            let restored:Preferences=serde_json::from_slice(&bytes).unwrap();assert_eq!(restored.store_page_size,size);assert_eq!(restored.projects,old.projects);assert_eq!(restored.hidden_agents,old.hidden_agents);assert_eq!(restored.theme,old.theme);
        }
    }

    #[test]
    fn old_preferences_add_design_defaults_without_losing_projects() {
        let p: Preferences = serde_json::from_str(r#"{"theme":"dark","language":"zh-CN","projects":["/tmp/project"],"hiddenAgents":["codex"]}"#).unwrap();
        assert_eq!(p.theme, "dark");
        assert_eq!(p.color_theme, "codex");
        assert_eq!(p.font_family, "system");
        assert_eq!(p.font_size, 16);
        assert_eq!(
            p.projects,
            vec![Project {
                path: "/tmp/project".into(),
                name: "project".into(),
                icon: "folder".into()
            }]
        );
        assert!(p.collapsed_sections.is_empty());
        assert_eq!(p.hidden_agents, vec!["codex"]);
        assert!(valid_appearance(&p));
    }
    #[test]
    fn nine_palettes_and_font_settings_round_trip() {
        for name in [
            "codex",
            "claude",
            "caffeine",
            "darkmatter",
            "modern-minimal",
            "supabase",
            "vercel",
            "twitter",
            "dark-forge",
        ] {
            let p = Preferences {
                color_theme: name.into(),
                font_family: "serif".into(),
                font_size: 18,
                ..Preferences::default()
            };
            assert!(valid_appearance(&p));
            let restored: Preferences =
                serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();
            assert_eq!(restored.color_theme, name);
            assert_eq!(restored.font_family, "serif");
            assert_eq!(restored.font_size, 18);
        }
    }
    #[test]
    fn invalid_theme_font_or_size_cannot_be_saved() {
        for p in [
            Preferences {
                color_theme: "invented".into(),
                ..Preferences::default()
            },
            Preferences {
                font_family: "remote".into(),
                ..Preferences::default()
            },
            Preferences {
                font_size: 0,
                ..Preferences::default()
            },
        ] {
            assert!(!valid_appearance(&p));
        }
    }
}

#[cfg(test)]
mod order_tests {
    use super::*;
    #[test]
    fn agent_order_round_trips_and_old_preferences_preserve_defaults() {
        let old: Preferences = serde_json::from_str(r#"{"theme":"dark","language":"zh-CN","projects":[],"hiddenAgents":[],"visibleAgents":["pi"],"hideUnmanageableCodexPlugins":true}"#).unwrap();
        assert!(old.agent_order.is_empty());
        let ordered = Preferences {
            agent_order: vec!["pi".into(), "codex".into(), "eve".into()],
            ..old
        };
        let saved = serde_json::to_vec(&ordered).unwrap();
        let restored: Preferences = serde_json::from_slice(&saved).unwrap();
        assert_eq!(restored.agent_order, ordered.agent_order);
        assert!(serde_json::to_value(&restored)
            .unwrap()
            .get("hideUnmanageableCodexPlugins")
            .is_none());
        assert_eq!(restored.visible_agents, vec!["pi"]);
        assert_eq!(restored.theme, "dark");
    }
}

#[cfg(test)]
mod project_tests {
    use super::*;
    #[test]
    fn project_metadata_order_and_collapse_round_trip() {
        let mut p = Preferences::default();
        p.projects = vec![
            Project {
                path: "/tmp/b".into(),
                name: "Research".into(),
                icon: "flask".into(),
            },
            Project {
                path: "/tmp/a".into(),
                name: "Application".into(),
                icon: "code".into(),
            },
        ];
        p.collapsed_sections = vec!["global".into(), "/tmp/b".into()];
        let restored: Preferences =
            serde_json::from_slice(&serde_json::to_vec(&p).unwrap()).unwrap();
        assert_eq!(restored.projects, p.projects);
        assert_eq!(restored.collapsed_sections, p.collapsed_sections);
    }
}

#[cfg(test)]
mod install_mode_tests {
    use super::*;
    #[test]
    fn old_preferences_default_to_symlink_without_losing_other_settings() {
        let p: Preferences = serde_json::from_str(
            r#"{"theme":"dark","language":"en","projects":[],"hiddenAgents":["codex"]}"#,
        )
        .unwrap();
        assert_eq!(p.install_mode, InstallMode::Symlink);
        assert_eq!(p.language, "en");
        assert_eq!(p.hidden_agents, vec!["codex"]);
    }
    #[test]
    fn install_modes_round_trip_and_invalid_modes_are_rejected() {
        for mode in [InstallMode::Symlink, InstallMode::Copy] {
            let p = Preferences {
                install_mode: mode,
                ..Preferences::default()
            };
            let saved = serde_json::to_vec(&p).unwrap();
            let restored: Preferences = serde_json::from_slice(&saved).unwrap();
            assert_eq!(restored.install_mode, mode);
        }
        assert!(serde_json::from_str::<Preferences>(r#"{"theme":"dark","language":"en","projects":[],"hiddenAgents":[],"installMode":"other"}"#).is_err());
    }
    #[test]
    fn dsh_management_contexts_preserve_scope_isolation_and_old_preferences() {
        let legacy: Preferences = serde_json::from_str(
            r#"{"theme":"dark","language":"zh-CN","projects":[],"hiddenAgents":[]}"#,
        )
        .unwrap();
        assert!(legacy.dsh_contexts.is_empty());
        let mut saved = legacy;
        saved.dsh_contexts.insert(
            "settings".into(),
            Some("desktop:profile-web:preset-alpha".into()),
        );
        saved.dsh_contexts.insert(
            "global".into(),
            Some("cli:profile-custom:preset-beta".into()),
        );
        saved.dsh_contexts.insert(
            "project:/fixture/repo".into(),
            Some("desktop:profile-desktop:preset-review".into()),
        );
        saved.dsh_contexts.insert(
            "settingsFile".into(),
            Some("/fixture/.dsh/profiles/without-provider/cordis.patch.yml".into()),
        );
        let restored: Preferences =
            serde_json::from_slice(&serde_json::to_vec(&saved).unwrap()).unwrap();
        assert_eq!(restored.dsh_contexts, saved.dsh_contexts);
        assert_ne!(
            restored.dsh_contexts["global"],
            restored.dsh_contexts["project:/fixture/repo"]
        );
        assert_eq!(restored.theme, "dark");
        assert_eq!(restored.language, "zh-CN");
        saved.dsh_contexts.insert("settings".into(), None);
        let file_only: Preferences =
            serde_json::from_slice(&serde_json::to_vec(&saved).unwrap()).unwrap();
        assert_eq!(file_only.dsh_contexts["settings"], None);
        assert_eq!(
            file_only.dsh_contexts["settingsFile"],
            saved.dsh_contexts["settingsFile"]
        );
    }
}
