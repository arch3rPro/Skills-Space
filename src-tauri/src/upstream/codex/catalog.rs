use super::*;

// Mirrors the original CLI's implicit-system marketplace identity. Match a
// relative suffix plus its official name, never a user's HOME or app version.
pub(super) fn builtin_market(name: &str, root: &Path) -> bool {
    (matches!(name, "openai-bundled" | "openai-bundled-alpha")
        && root.ends_with(Path::new(".tmp/bundled-marketplaces").join(name)))
        || (name == "openai-primary-runtime"
            && root
                .ends_with("codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime"))
}

pub(super) fn read(
    engine: &Engine,
    binary: &Path,
    cwd: &Path,
    complete: &mut bool,
    warnings: &mut Vec<String>,
) -> Result<Value, String> {
    if let Some(result) = account::catalog() {
        return result;
    }
    // Without app-owned authorization, request local/native installed records
    // with the ephemeral credential store. Never borrow the existing CLI login.
    let output = run_process_with_timeout(
        command(engine, binary, cwd).args(["plugin", "list", "--json"]),
        Duration::from_secs(120),
    )?;
    if !output.success {
        return Err(format!("Codex plugin inventory failed: {}", output.stderr));
    }
    // CLI may return a valid local subset alongside remote diagnostics. Do not
    // parse prose into plugin states or interpret missing rows as uninstalled.
    if !output.stderr.trim().is_empty() {
        *complete = false;
        warnings.push(format!(
            "Codex plugin inventory diagnostics: {}",
            output.stderr
        ));
    }
    let mut value: Value = serde_json::from_str(&output.stdout)
        .map_err(|error| format!("Invalid Codex plugin inventory: {error}"))?;
    value["installed"]
        .as_array()
        .ok_or("Invalid native installed plugin list.")?;
    // This command requested installed records only. Neither stale observations
    // nor an unsolicited catalog establishes current installation eligibility.
    value["available"] = json!([]);
    Ok(value)
}

// Guard operation-relevant state, not volatile directory metadata or object key order.
pub(super) fn remote_fingerprint(plugin: &Plugin) -> String {
    document_diff::revision(json!({"id":plugin.id,"remotePluginId":plugin.remote_plugin_id,"version":plugin.version,
        "installed":plugin.installed,"installationKnown":plugin.installation_known,
        "enabled":plugin.enabled,"enabledKnown":plugin.enabled_known,
        "components":plugin.components,"authPolicy":plugin.auth_policy,"policy":plugin.install_policy,"policySource":plugin.install_policy_source,
        "toggle":plugin.permissions.toggle,"uninstall":plugin.permissions.uninstall
    }).to_string().as_bytes())
}

pub(super) fn merge(
    plugins: &mut Vec<Plugin>,
    result: &Value,
    home: &Path,
    capabilities: &Capabilities,
    config: &Value,
) -> Result<(), String> {
    let installed = result["installed"]
        .as_array()
        .ok_or("Invalid native installed plugin list.")?;
    let mut known: BTreeSet<String> = plugins
        .iter()
        .filter(|p| p.installation_known)
        .map(|p| p.id.clone())
        .collect();
    for item in installed
        .iter()
        .chain(result["available"].as_array().into_iter().flatten())
    {
        let id = item["pluginId"]
            .as_str()
            .ok_or("Missing native plugin identity.")?;
        let name = item["name"].as_str().ok_or("Missing native plugin name.")?;
        let market = item["marketplaceName"]
            .as_str()
            .ok_or("Missing native marketplace identity.")?;
        let enabled = item["enabled"]
            .as_bool()
            .ok_or("Missing native plugin state.")?;
        let installed = item["installed"]
            .as_bool()
            .ok_or("Invalid native installation state.")?;
        let remote = item["source"]["source"] == "remote";
        if !known.insert(id.to_owned()) {
            continue;
        }
        // Default remote components are separate from explicitly installed user
        // plugins. CLI policy does not expose the RPC's more specific origin.
        let builtin = (item["source"]["source"] == "remote"
            && item["installPolicy"] == "INSTALLED_BY_DEFAULT")
            || item["marketplaceSource"]["source"]
                .as_str()
                .is_some_and(|root| builtin_market(market, Path::new(root)));
        let version = item["version"].as_str().map(str::to_owned);
        let root = version
            .as_deref()
            .filter(|_| installed)
            .filter(|v| safe_segment(v) && safe_segment(name) && safe_segment(market))
            .map(|v| home.join("plugins/cache").join(market).join(name).join(v));
        // Cache content provides display metadata only AFTER native installation
        // evidence; never enumerate cache directories to infer installed items.
        let local_data = root.as_ref().and_then(|root| manifest(root).ok());
        let content_verified = local_data.is_some();
        let data = local_data.unwrap_or_else(
            || json!({"interface":item["interface"],"description":item["description"]}),
        );
        let documents = root
            .as_ref()
            .map(|root| plugin_documents(root, &data))
            .unwrap_or_default();
        plugins.push(Plugin {
            toggle_scope: String::new(),
            project_enabled: None,
            remote_plugin_id: item["remotePluginId"].as_str().map(str::to_owned),
            marketplace_display_name: None,
            source_origin: if remote {
                "account".into()
            } else {
                markets::market_origin(
                    market,
                    Path::new(
                        item["marketplaceSource"]["source"]
                            .as_str()
                            .unwrap_or_default(),
                    ),
                    false,
                )
                .into()
            },
            category: item["interface"]["category"]
                .as_str()
                .or_else(|| data["interface"]["category"].as_str())
                .map(str::to_owned),
            enabled_known: true,
            source_kind: item["source"]["source"].as_str().map(str::to_owned),
            install_policy: item["installPolicy"].as_str().map(str::to_owned),
            install_policy_source: item["installPolicySource"].as_str().map(str::to_owned),
            permissions: access::Permissions::default(),
            description: presentation::description(&data),
            author: presentation::author(&data),
            icon: root
                .as_ref()
                .and_then(|root| presentation::icon(root, &data))
                .or_else(|| {
                    ["composerIcon", "composerIconUrl", "logo", "logoUrl"]
                        .into_iter()
                        .find_map(|key| presentation::remote_icon(&data["interface"][key]))
                }),
            id: id.into(),
            name: data["interface"]["displayName"]
                .as_str()
                .unwrap_or(name)
                .into(),
            marketplace: market.into(),
            version,
            installed,
            installation_known: true,
            enabled,
            builtin,
            components: ["skills", "mcpServers", "hooks", "apps"]
                .into_iter()
                .filter(|key| !data[*key].is_null())
                .map(str::to_owned)
                .collect(),
            skill_inventory: skill_inventory::inspect(
                root.as_deref(),
                item["source"]["path"]
                    .as_str()
                    .filter(|p| Path::new(p).is_absolute())
                    .map(Path::new),
                installed,
            ),
            skills: documents
                .iter()
                .map(|path| path.to_string_lossy().into())
                .collect(),
            source_path: if !remote {
                item["source"]["path"]
                    .as_str()
                    .filter(|path| Path::new(path).is_absolute())
                    .unwrap_or_default()
                    .into()
            } else {
                String::new()
            },
            installed_path: root
                .filter(|p| p.is_dir())
                .map(|p| p.to_string_lossy().into()),
            can_install: false,
            can_toggle: false,
            can_uninstall: false,
            can_check_updates: false,
            catalog_entry: true,
            remote,
            git_marketplace: false,
            toggle_reason: None,
            uninstall_reason: None,
            unavailable_reason: None,
            fingerprint: format!("catalog:{item}"),
            auth_policy: item["authPolicy"].as_str().map(str::to_owned),
            content_verified,
        });
    }
    for plugin in plugins.iter_mut() {
        access::apply(plugin, config, capabilities);
        if plugin.remote {
            plugin.fingerprint = remote_fingerprint(plugin);
        }
    }
    plugins.retain(|plugin| plugin.installation_known || !known.contains(&plugin.id));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn remote_action_fingerprint_ignores_display_metadata_but_guards_state_and_policy() {
        let entry = json!({"pluginId":"github@openai-curated-remote","name":"github","marketplaceName":"openai-curated-remote","installed":true,"enabled":true,"source":{"source":"remote"},"installPolicy":"AVAILABLE"});
        let mut plugins = vec![];
        merge(
            &mut plugins,
            &json!({"installed":[entry]}),
            Path::new("/fixture"),
            &Capabilities::default(),
            &json!({}),
        )
        .unwrap();
        let original = remote_fingerprint(&plugins[0]);
        let mut plugin = plugins[0].clone();
        plugin.name = "GitHub".into();
        plugin.description = "New directory copy".into();
        plugin.icon = Some("new-icon".into());
        assert_eq!(remote_fingerprint(&plugin), original);
        plugin.enabled = false;
        assert_ne!(remote_fingerprint(&plugin), original);
        plugin.enabled = true;
        plugin.install_policy = Some("NOT_AVAILABLE".into());
        assert_ne!(remote_fingerprint(&plugin), original);
    }
    #[test]
    #[ignore = "Requires an explicitly supplied original CLI JSON capture"]
    fn captured_native_inventory() {
        let path = std::env::var("SKILLS_SPACE_CODEX_CATALOG_CAPTURE").expect("Select CLI capture");
        let expected = std::env::var("SKILLS_SPACE_CODEX_EXPECTED_PLUGINS")
            .expect("Supply expected identities");
        let value: Value = serde_json::from_slice(&fs::read(path).unwrap()).unwrap();
        let mut plugins = vec![];
        merge(
            &mut plugins,
            &value,
            Path::new("/missing-fixture-home"),
            &Capabilities::default(),
            &json!({}),
        )
        .unwrap();
        let mut actual: Vec<_> = plugins
            .iter()
            .filter(|p| !p.builtin)
            .map(|p| p.id.clone())
            .collect();
        actual.sort();
        let mut expected: Vec<_> = expected.split(',').map(str::to_owned).collect();
        expected.sort();
        assert_eq!(actual, expected);
        println!(
            "Installed users: {}; default/built-in components: {}",
            actual.len(),
            plugins.iter().filter(|p| p.builtin).count()
        );
    }
    #[test]
    fn actions_follow_policy_and_interface_not_source_labels() {
        let caps = Capabilities {
            write_config: true,
            install_plugins: true,
            uninstall_plugins: true,
            ..Capabilities::default()
        };
        let entry = |name: &str, policy: &str, installed: bool| json!({"pluginId":format!("{name}@openai-curated-remote"),"name":name,"marketplaceName":"openai-curated-remote","installed":installed,"enabled":installed,"source":{"source":"remote","id":name},"installPolicy":policy});
        let mut local = entry("local", "AVAILABLE", true);
        local["source"] = json!({"source":"local","path":"/fixture/.tmp/bundled-marketplaces/openai-bundled/plugins/local"});
        local["marketplaceName"] = json!("openai-bundled");
        local["marketplaceSource"] =
            json!({"source":"/fixture/.tmp/bundled-marketplaces/openai-bundled"});
        let list = json!({"installed":[entry("github","AVAILABLE",true),entry("write-like-me","AVAILABLE",true),entry("default","INSTALLED_BY_DEFAULT",true),local],"available":[entry("new","AVAILABLE",false)]});
        let mut plugins = vec![];
        merge(
            &mut plugins,
            &list,
            Path::new("/fixture"),
            &caps,
            &json!({}),
        )
        .unwrap();
        for p in &plugins[..2] {
            assert!(p.can_uninstall && p.can_toggle);
            assert_eq!(p.toggle_reason, None);
            assert!(!p.can_check_updates);
            assert_eq!(p.permissions.toggle, "available");
        }
        assert!(!plugins[2].can_uninstall);
        assert_eq!(
            plugins[2].uninstall_reason.as_deref(),
            Some("unknownPolicy")
        );
        assert_eq!(plugins[2].permissions.uninstall, "unknown");
        assert!(plugins[3].builtin && plugins[3].can_toggle && plugins[3].can_uninstall);
        assert!(plugins[4].can_install && !plugins[4].installed);
        let mut overridden = vec![];
        merge(&mut overridden,&list,Path::new("/fixture"),&caps,&json!({"layers":[{"name":{"type":"project"},"config":{"plugins":{"local@openai-curated-remote":{"enabled":true}}}}]})).unwrap();
        assert!(!overridden[3].can_toggle && overridden[3].can_uninstall);
        assert_eq!(overridden[3].permissions.toggle, "overridden");
    }
    #[test]
    fn policy_provenance_defaults_and_unknowns_do_not_share_a_blanket_denial() {
        let caps = Capabilities {
            write_config: true,
            install_plugins: true,
            uninstall_plugins: true,
            ..Capabilities::default()
        };
        let entry = |name: &str, policy: Value| json!({"pluginId":format!("{name}@market"),"name":name,"marketplaceName":"market","installed":true,"enabled":true,"source":{"source":"local","path":"/fixture"},"installPolicy":policy,"installPolicySource":"WORKSPACE_SETTING"});
        let list = json!({"installed":[entry("available",json!("AVAILABLE")),entry("default",json!("INSTALLED_BY_DEFAULT")),entry("unknown",Value::Null)]});
        let config = json!({"layers":[{"name":{"type":"user"},"config":{}},{"name":{"type":"system"},"config":{"plugins":{"available@market":{"enabled":true}}}}]});
        let mut plugins = vec![];
        merge(&mut plugins, &list, Path::new("/fixture"), &caps, &config).unwrap();
        assert!(plugins[0].can_toggle && plugins[0].can_uninstall);
        assert_eq!(
            plugins[0].install_policy_source.as_deref(),
            Some("WORKSPACE_SETTING")
        );
        assert!(plugins[1].can_toggle && !plugins[1].can_uninstall);
        assert_eq!(plugins[1].permissions.uninstall, "restricted");
        assert!(!plugins[2].can_toggle && !plugins[2].can_uninstall);
        assert_eq!(plugins[2].permissions.toggle, "unknown");
        assert_eq!(
            plugins[2].uninstall_reason.as_deref(),
            Some("unknownPolicy")
        );
        let mut unknown_source = entry("future", json!("AVAILABLE"));
        unknown_source["source"] = json!({"source":"future-source"});
        let mut future = vec![];
        merge(
            &mut future,
            &json!({"installed":[unknown_source]}),
            Path::new("/fixture"),
            &caps,
            &config,
        )
        .unwrap();
        assert!(!future[0].can_toggle && !future[0].can_uninstall);
        assert_eq!(future[0].permissions.uninstall, "unknown");
        let mut unread_state = plugins[0].clone();
        unread_state.enabled_known = false;
        access::apply(&mut unread_state, &config, &caps);
        assert!(!unread_state.can_toggle);
        assert_eq!(unread_state.permissions.toggle, "unknown");
    }
    #[test]
    fn installed_user_inventory_excludes_available_and_default_components() {
        let mut plugins = vec![];
        let entry = |id: &str, policy: &str| json!({"pluginId":id,"name":id,"marketplaceName":"remote","installed":true,"enabled":true,"source":{"source":"remote"},"installPolicy":policy});
        let result = json!({"installed":[entry("user@remote","AVAILABLE"),entry("builtin@remote","INSTALLED_BY_DEFAULT")],"available":[entry("available@remote","AVAILABLE")]});
        merge(
            &mut plugins,
            &result,
            Path::new("/missing-fixture-home"),
            &Capabilities::default(),
            &json!({}),
        )
        .unwrap();
        assert_eq!(plugins.len(), 3);
        assert_eq!(plugins.iter().filter(|p| !p.builtin).count(), 2);
        assert!(plugins.iter().all(|p| p.can_toggle && !p.can_uninstall));
        assert!(!builtin_market(
            "openai-bundled",
            Path::new("/user/market/openai-bundled")
        ));
        assert!(builtin_market(
            "openai-bundled",
            Path::new("/any/home/.tmp/bundled-marketplaces/openai-bundled")
        ));
        assert!(merge(
            &mut plugins,
            &json!({}),
            Path::new("/missing-fixture-home"),
            &Capabilities::default(),
            &json!({})
        )
        .is_err());
    }
}
