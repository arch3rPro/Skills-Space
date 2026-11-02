//! Object policy and adapter execution are separate facts. Never infer authority
//! from a marketplace name, policy provenance, or a lower-priority default.
use super::*;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Permissions {
    pub install: String,
    pub toggle: String,
    pub uninstall: String,
    pub check_updates: String,
}

fn overriding_layer<'a>(config: &'a Value, id: &str) -> Option<&'a str> {
    // config/read returns layers in descending priority. Only layers above the
    // user layer can shadow a user write; system defaults below it cannot.
    config["layers"]
        .as_array()?
        .iter()
        .take_while(|layer| layer["name"]["type"] != "user")
        .find(|layer| {
            layer["disabledReason"].is_null()
                && layer["config"]["plugins"][id]["enabled"].is_boolean()
        })
        .and_then(|layer| layer["name"]["type"].as_str())
}

pub(super) fn apply(plugin: &mut Plugin, config: &Value, caps: &Capabilities) {
    let policy = plugin.install_policy.as_deref();
    let declared = matches!(policy, Some("AVAILABLE" | "INSTALLED_BY_DEFAULT"));
    let forbidden = policy == Some("NOT_AVAILABLE");
    let local = matches!(
        plugin.source_kind.as_deref(),
        Some("local" | "url" | "git-subdir" | "npm")
    );
    let lifecycle = local || plugin.marketplace == "openai-curated-remote";
    let user_readonly = user_layer(config).is_ok_and(|layer| !layer["disabledReason"].is_null());
    let overridden = overriding_layer(config, &plugin.id);
    let toggle_reason = if !plugin.installation_known {
        Some("unconfirmed")
    } else if !plugin.enabled_known {
        Some("stateUnknown")
    } else if forbidden {
        Some("policy")
    } else if !declared {
        Some("unknownPolicy")
    } else if plugin.remote {
        None
    } else if !local {
        Some("unknownSource")
    } else if user_readonly && !plugin.remote {
        Some("userReadOnly")
    } else if overridden.is_some() {
        Some("projectOverride")
    } else if !caps.write_config {
        Some("notIntegrated")
    } else {
        None
    };
    let install = if plugin.installed {
        "notApplicable"
    } else if forbidden {
        "restricted"
    } else if !declared || !plugin.installation_known {
        "unknown"
    } else if user_readonly && !plugin.remote {
        "restricted"
    } else if !local && !plugin.remote {
        "unknown"
    } else if !caps.install_plugins || !lifecycle {
        "notIntegrated"
    } else {
        "available"
    };
    let toggle = if !plugin.installed {
        "notApplicable"
    } else {
        match toggle_reason {
            None => "available",
            Some("policy" | "userReadOnly") => "restricted",
            Some("projectOverride") => "overridden",
            Some("notIntegrated") => "notIntegrated",
            _ => "unknown",
        }
    };
    let uninstall = if !plugin.installed {
        "notApplicable"
    } else if policy == Some("INSTALLED_BY_DEFAULT") {
        if matches!(
            plugin.install_policy_source.as_deref(),
            Some("WORKSPACE_SETTING" | "IMPLICIT_CANONICAL_APP")
        ) {
            "restricted"
        } else {
            "unknown"
        }
    } else if !declared || !plugin.installation_known {
        "unknown"
    } else if user_readonly && !plugin.remote {
        "restricted"
    } else if !local && !plugin.remote {
        "unknown"
    } else if !caps.uninstall_plugins || !lifecycle {
        "notIntegrated"
    } else {
        "available"
    };
    // Checking sources does not require configuration mutation permission.
    let check_updates = if !plugin.installed {
        "notApplicable"
    } else if plugin.can_check_updates {
        "available"
    } else if plugin.remote {
        "notIntegrated"
    } else {
        "unknown"
    };
    plugin.can_install = install == "available";
    plugin.can_toggle = toggle == "available";
    plugin.can_uninstall = uninstall == "available";
    plugin.toggle_reason = toggle_reason.map(str::to_owned);
    plugin.uninstall_reason = match uninstall {
        "restricted" if policy == Some("INSTALLED_BY_DEFAULT") => Some("defaultInstall"),
        "restricted" => Some("userReadOnly"),
        "unknown" => Some("unknownPolicy"),
        "notIntegrated" => Some("notIntegrated"),
        _ => None,
    }
    .map(str::to_owned);
    plugin.unavailable_reason = if !plugin.installation_known {
        Some("unconfirmed".into())
    } else if forbidden {
        Some("policy".into())
    } else if !declared {
        Some("unknownPolicy".into())
    } else {
        None
    };
    plugin.permissions = Permissions {
        install: install.into(),
        toggle: toggle.into(),
        uninstall: uninstall.into(),
        check_updates: check_updates.into(),
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configuration_precedence_ignores_disabled_and_lower_layers() {
        let layer = |kind: &str| json!({"name":{"type":kind},"config":{"plugins":{"p@m":{"enabled":false}}}});
        assert_eq!(
            overriding_layer(&json!({"layers":[layer("user"),layer("system")]}), "p@m"),
            None
        );
        assert_eq!(
            overriding_layer(&json!({"layers":[layer("project"),layer("user")]}), "p@m"),
            Some("project")
        );
        let mut disabled = layer("project");
        disabled["disabledReason"] = json!("untrusted");
        assert_eq!(
            overriding_layer(&json!({"layers":[disabled,layer("user")]}), "p@m"),
            None
        );
    }
}
