//! Public discovery follows the plugin service's editorial sections and cursors.
//! The native installed snapshot remains separate from discovery results.
use super::*;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    id: String,
    title: String,
    url_slug: Option<String>,
    kind: &'static str,
    plugins: Vec<Plugin>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Directory {
    pub snapshot: Option<Snapshot>,
    public_sections: Vec<Section>,
    personal_sections: Vec<Section>,
    account_required: bool,
    public_error: Option<String>,
    personal_error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    title: Option<String>,
    description: Option<String>,
    plugins: Vec<Plugin>,
    next_page_token: Option<String>,
}
fn text(value: &Value) -> Option<String> {
    value
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
}
fn directory_plugin(
    value: &Value,
    installed: &[Plugin],
    caps: &Capabilities,
) -> Result<Plugin, String> {
    let remote = text(&value["id"])
        .filter(|id| safe_segment(id))
        .ok_or("Invalid directory plugin identity.")?;
    if let Some(plugin) = installed.iter().find(|plugin| {
        plugin.remote_plugin_id.as_deref() == Some(&remote)
            && plugin.installed
            && plugin.installation_known
    }) {
        let mut plugin = plugin.clone();
        if let Some(name) = text(&value["display_name"]) {
            plugin.name = name;
        }
        if let Some(description) = text(&value["short_description"]) {
            plugin.description = description;
        }
        if let Some(icon) = presentation::remote_icon(&value["icon_url"]) {
            plugin.icon = Some(icon);
        }
        return Ok(plugin);
    }
    let mut plugins = Vec::new();
    catalog::merge(
        &mut plugins,
        &json!({"installed":[],"available":[{
            "pluginId":format!("catalog:{remote}"),"remotePluginId":remote,
            "name":value["display_name"],"marketplaceName":"openai-curated-remote",
            "installed":false,"enabled":false,"source":{"source":"remote"},
            "installPolicy":value["installation_policy"],
            "interface":{"displayName":value["display_name"],"shortDescription":value["short_description"],"composerIcon":value["icon_url"]}
        }]}),
        Path::new(""),
        caps,
        &json!({}),
    )?;
    let mut plugin = plugins.pop().ok_or("Invalid directory plugin.")?;
    plugin.fingerprint = format!("public:{remote}");
    if value["status"] == "DISABLED_BY_ADMIN" || !value["disabled_reason"].is_null() {
        plugin.can_install = false;
        plugin.permissions.install = "restricted".into();
        plugin.unavailable_reason =
            text(&value["disabled_reason"]).or_else(|| Some("policy".into()));
    }
    Ok(plugin)
}
fn home(value: &Value, installed: &[Plugin], caps: &Capabilities) -> Result<Vec<Section>, String> {
    value["sections"]
        .as_array()
        .ok_or("Invalid public directory sections.")?
        .iter()
        .map(|section| {
            Ok(Section {
                id: text(&section["id"]).ok_or("Invalid directory section identity.")?,
                title: text(&section["title"]).ok_or("Invalid directory section title.")?,
                url_slug: text(&section["url_slug"]),
                kind: "public",
                plugins: section["plugins"]
                    .as_array()
                    .ok_or("Invalid directory section plugins.")?
                    .iter()
                    .map(|plugin| directory_plugin(plugin, installed, caps))
                    .collect::<Result<_, _>>()?,
            })
        })
        .collect()
}
fn page_metadata(
    value: &Value,
    installed: &[Plugin],
    caps: &Capabilities,
    personal: bool,
) -> Result<Page, String> {
    let plugins=value["plugins"].as_array().ok_or("Invalid directory page.")?.iter().map(|plugin|if personal||plugin["release"].is_object() {
        let interface=&plugin["release"]["interface"];
        directory_plugin(&json!({"id":plugin["id"],"display_name":plugin["release"]["display_name"],"short_description":interface["short_description"],"icon_url":interface["logo_url"],"installation_policy":plugin["installation_policy"],"status":plugin["status"],"disabled_reason":plugin["disabled_reason"]}),installed,caps)
    } else {directory_plugin(plugin,installed,caps)}).collect::<Result<_,_>>()?;
    // The service may return more than the requested limit. Only its cursor
    // establishes whether another page exists; do not infer from item count.
    let pagination = value["pagination"]
        .as_object()
        .ok_or("Missing directory pagination.")?;
    let cursor = pagination.get("next_page_token").unwrap_or(&Value::Null);
    if !cursor.is_null() && !cursor.is_string() {
        return Err("Invalid directory cursor.".into());
    }
    Ok(Page {
        title: text(&value["category"]["title"]),
        description: text(&value["category"]["description"]),
        plugins,
        next_page_token: text(cursor),
    })
}
#[cfg(test)]
fn page_value(value: &Value, snapshot: &Snapshot, personal: bool) -> Result<Page, String> {
    page_metadata(value, &snapshot.plugins, &snapshot.capabilities, personal)
}
pub(super) fn directory(
    engine: &Engine,
    target: &Target,
    zh: bool,
    metadata_only: bool,
) -> Result<Directory, String> {
    let snapshot = if metadata_only {
        None
    } else {
        Some(inspect_catalog(engine, target, true)?)
    };
    let caps = if let Some(snapshot) = &snapshot {
        snapshot.capabilities.clone()
    } else {
        let binary = binary(engine).ok_or("Codex CLI was not found.")?;
        inspect_capabilities(engine, &binary, &target.directory(&engine.home)?)
    };
    let installed = snapshot
        .as_ref()
        .map(|snapshot| snapshot.plugins.as_slice())
        .unwrap_or_default();
    let mut local = BTreeMap::<String, Section>::new();
    for plugin in installed
        .iter()
        .filter(|plugin| !plugin.remote && !plugin.builtin && plugin.installation_known)
    {
        let section = local
            .entry(plugin.marketplace.clone())
            .or_insert_with(|| Section {
                id: format!("market:{}", plugin.marketplace),
                title: plugin
                    .marketplace_display_name
                    .clone()
                    .unwrap_or_else(|| plugin.marketplace.clone()),
                url_slug: None,
                kind: "market",
                plugins: Vec::new(),
            });
        section.plugins.push(plugin.clone());
    }
    let mut personal_sections = local.into_values().collect::<Vec<_>>();
    let (public_sections, account_required, public_error) =
        match account::discovery_read("/ps/plugins/home", zh) {
            Ok(value) => (home(&value, installed, &caps)?, false, None),
            Err(error) if error == "CODEX_AUTH_REQUIRED" => (Vec::new(), true, None),
            Err(error) => (Vec::new(), false, Some(error)),
        };
    let mut personal_error = None;
    if !account_required {
        match account::discovery_read("/ps/plugins/list?scope=USER&limit=9", zh) {
            Ok(value) => {
                let page = page_metadata(&value, installed, &caps, true)?;
                if !page.plugins.is_empty() {
                    personal_sections.insert(
                        0,
                        Section {
                            id: "personal-created".into(),
                            title: if zh {
                                "我创建的插件"
                            } else {
                                "Created by you"
                            }
                            .into(),
                            url_slug: None,
                            kind: "created",
                            plugins: page.plugins,
                        },
                    );
                }
            }
            Err(error) if error == "CODEX_AUTH_REQUIRED" => (),
            Err(error) => personal_error = Some(error),
        }
    }
    Ok(Directory {
        snapshot,
        public_sections,
        personal_sections,
        account_required,
        public_error,
        personal_error,
    })
}
fn query_path(
    slug: Option<&str>,
    query: &str,
    cursor: Option<&str>,
    personal: bool,
) -> Result<String, String> {
    if query.len() > 4096 || cursor.is_some_and(|cursor| cursor.len() > 16384) {
        return Err("Invalid directory query.".into());
    }
    let path = if personal {
        "/ps/plugins/list".into()
    } else if let Some(slug) = slug {
        if !safe_segment(slug) {
            return Err("Invalid directory category.".into());
        }
        format!("/ps/plugin-categories/{slug}/plugins")
    } else {
        "/ps/plugins/search".into()
    };
    let mut url = reqwest::Url::parse("https://chatgpt.com/").map_err(|error| error.to_string())?;
    {
        let mut params = url.query_pairs_mut();
        params
            .append_pair("scope", if personal { "USER" } else { "GLOBAL" })
            .append_pair("limit", "50");
        if !personal && !query.trim().is_empty() {
            params.append_pair("q", query.trim());
        }
        if let Some(cursor) = cursor {
            params.append_pair("pageToken", cursor);
        }
    }
    Ok(format!("{path}?{}", url.query().unwrap_or_default()))
}
pub(super) fn page(
    engine: &Engine,
    target: &Target,
    slug: Option<&str>,
    query: &str,
    cursor: Option<&str>,
    personal: bool,
    zh: bool,
) -> Result<Page, String> {
    let path = query_path(slug, query, cursor, personal)?;
    // Searching public metadata does not need a fresh skills/config/catalog scan.
    // Installation state is joined with the current directory snapshot in the UI;
    // detail preparation and every mutation still re-read native state.
    let binary = binary(engine).ok_or("Codex CLI was not found.")?;
    let cwd = target.directory(&engine.home)?;
    let caps = inspect_capabilities(engine, &binary, &cwd);
    let value = account::discovery_read(&path, zh)?;
    page_metadata(&value, &[], &caps, personal)
}
pub(super) fn prepare(
    engine: &Engine,
    target: &Target,
    id: &str,
    snapshot: &Snapshot,
) -> Result<Plugin, String> {
    if !safe_segment(id) {
        return Err("Invalid directory plugin identity.".into());
    }
    let value = account::public_plugin(id)?;
    let detail = &value["plugin"];
    let summary = &detail["summary"];
    if summary["source"]["type"] != "remote" || summary["remotePluginId"].as_str() != Some(id) {
        return Err("Directory plugin identity changed. Refresh and retry.".into());
    }
    let mut entry = summary.clone();
    entry["pluginId"] = summary["id"].clone();
    entry["marketplaceName"] = json!("openai-curated-remote");
    entry["source"] = json!({"source":"remote"});
    let cwd = target.directory(&engine.home)?;
    let mut session = Session::start(engine, Path::new(&snapshot.binary), &cwd)?;
    let config = read_config(&mut session, &cwd)?;
    let mut plugins = Vec::new();
    catalog::merge(
        &mut plugins,
        &json!({"installed":[entry]}),
        Path::new(&snapshot.codex_home),
        &snapshot.capabilities,
        &config,
    )?;
    let mut plugin = plugins.pop().ok_or("Plugin details unavailable.")?;
    plugin.components = [
        ("skills", "skills"),
        ("apps", "apps"),
        ("mcpServers", "mcpServers"),
        ("hooks", "hooks"),
    ]
    .into_iter()
    .filter(|(key, _)| {
        detail[*key]
            .as_array()
            .is_some_and(|items| !items.is_empty())
            || detail[*key]
                .as_object()
                .is_some_and(|items| !items.is_empty())
    })
    .map(|(_, component)| component.into())
    .collect();
    if summary["availability"] == "DISABLED_BY_ADMIN" || !summary["disabledReason"].is_null() {
        plugin.can_install = false;
        plugin.permissions.install = "restricted".into();
        plugin.unavailable_reason =
            text(&summary["disabledReason"]).or_else(|| Some("policy".into()));
    }
    plugin.fingerprint = catalog::remote_fingerprint(&plugin);
    Ok(plugin)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn snapshot() -> Snapshot {
        Snapshot {
            binary: String::new(),
            version: String::new(),
            context_id: Some("fixture".into()),
            codex_home: "/missing-fixture".into(),
            config_path: String::new(),
            revision: "r".into(),
            unavailable_reason: None,
            plugins_complete: true,
            catalog_requested: true,
            rules: vec![],
            capabilities: Capabilities {
                install_plugins: true,
                ..Capabilities::default()
            },
            skills: vec![],
            plugins: vec![],
            warnings: vec![],
        }
    }
    fn entry(id: &str) -> Value {
        json!({"id":id,"display_name":id,"short_description":"Public introduction","installation_policy":"AVAILABLE","icon_url":"https://example.invalid/icon.png","status":"ENABLED","disabled_reason":null,"creator_account_user_id":"must-not-cross-ipc"})
    }
    #[test]
    fn home_uses_service_sections_and_keeps_public_identity_without_guessing_names() {
        let value = json!({"sections":[{"id":"featured","title":"热门","url_slug":"featured","plugins":[entry("public-gmail")]},{"id":"productivity","title":"效率","url_slug":"productivity","plugins":[entry("public-gmail")]}]});
        let sections = home(&value, &[], &snapshot().capabilities).unwrap();
        assert_eq!(sections.len(), 2);
        assert_eq!(sections[0].title, "热门");
        assert_eq!(sections[1].url_slug.as_deref(), Some("productivity"));
        assert_eq!(
            sections[0].plugins[0].remote_plugin_id.as_deref(),
            Some("public-gmail")
        );
        assert!(sections[0].plugins[0].can_install);
        assert!(sections[0].plugins[0].fingerprint.starts_with("public:"));
        assert_eq!(
            sections[1].plugins.len(),
            1,
            "A plugin may appear in multiple editorial sections"
        );
        assert!(!serde_json::to_string(&sections)
            .unwrap()
            .contains("must-not-cross-ipc"));
        assert!(home(&json!({}), &[], &snapshot().capabilities).is_err());
    }
    #[test]
    fn category_pagination_uses_the_returned_cursor_and_preserves_full_pages() {
        let plugins: Vec<_> = (0..61)
            .map(|index| entry(&format!("plugin-{index}")))
            .collect();
        let value = json!({"category":{"title":"效率","description":"From the service"},"plugins":plugins,"pagination":{"limit":50,"next_page_token":"server-cursor"}});
        let page = page_value(&value, &snapshot(), false).unwrap();
        assert_eq!(page.plugins.len(), 61);
        assert_eq!(page.next_page_token.as_deref(), Some("server-cursor"));
        assert_eq!(page.title.as_deref(), Some("效率"));
        let empty = page_value(
            &json!({"plugins":[],"pagination":{"next_page_token":"next"}}),
            &snapshot(),
            false,
        )
        .unwrap();
        assert_eq!(empty.next_page_token.as_deref(), Some("next"));
        assert!(page_value(
            &json!({"plugins":[],"pagination":{"next_page_token":12}}),
            &snapshot(),
            false
        )
        .is_err());
        let search=page_value(&json!({"plugins":[{"id":"search-id","release":{"display_name":"Search result","interface":{"short_description":"From full plugin","logo_url":"https://example.invalid/search.png"}},"installation_policy":"AVAILABLE"}],"pagination":{"next_page_token":null}}),&snapshot(),false).unwrap();
        assert_eq!(search.plugins[0].name, "Search result");
        assert_eq!(
            search.plugins[0].remote_plugin_id.as_deref(),
            Some("search-id")
        );
        let personal = page_value(
            &json!({"plugins":[],"pagination":{"next_page_token":null}}),
            &snapshot(),
            true,
        )
        .unwrap();
        assert!(personal.plugins.is_empty());
    }
    #[test]
    fn public_slugs_and_search_text_cannot_select_personal_scope() {
        let public = query_path(
            Some("personal-created"),
            "a&scope=USER",
            Some("x&scope=USER"),
            false,
        )
        .unwrap();
        let parsed = reqwest::Url::parse(&format!("https://chatgpt.com{public}")).unwrap();
        assert_eq!(
            parsed.path(),
            "/ps/plugin-categories/personal-created/plugins"
        );
        let scopes: Vec<_> = parsed
            .query_pairs()
            .filter(|(name, _)| name == "scope")
            .collect();
        assert_eq!(scopes.len(), 1);
        assert_eq!(scopes[0].1, "GLOBAL");
        assert!(query_path(None, "", None, true)
            .unwrap()
            .starts_with("/ps/plugins/list?scope=USER"));
        assert!(query_path(Some("../private"), "", None, false).is_err());
    }
    #[test]
    fn blocked_directory_entries_do_not_acquire_install_permission() {
        let mut value = entry("blocked");
        value["disabled_reason"] = json!("plan_not_eligible");
        let plugin = directory_plugin(&value, &[], &snapshot().capabilities).unwrap();
        assert!(!plugin.can_install);
        assert_eq!(plugin.permissions.install, "restricted");
        assert_eq!(
            plugin.unavailable_reason.as_deref(),
            Some("plan_not_eligible")
        );
    }
}
