# Skills Space DSH skill policy

A local companion plugin for shared file-level invocation policy. Skill files and
upstream skill lockfiles are never written by this plugin. The original installed
DSH filesystem provider owns discovery, ordering, watching and document loading;
the wrapper changes only model/manual invocation permissions.

## Inventory and filtering

The native inventory aggregates actual discovery contexts across configurations
and presets. Physical instruction files are deduplicated while retaining each
configuration/preset membership and its original shadowing result. Configuration
and preset controls filter that inventory locally; they do not select a write
namespace. Settings continues to edit one original configuration/provider.

## Scope and deployment

- The original DSH CLI installs this local package into eligible Profiles. Its
  empty bundle patch does not introduce another skill scanner.
- User overlays wrap existing filesystem entries in place. Complete preset
  values are preserved when Cordis requires parent replacement; unknown/dynamic
  configuration is not rewritten. Installation can resume after package success.
- Schema 2 rules identify only the canonical instruction file and declared name,
  within the same DSH_HOME. Configurations, presets and projects using that file
  share its settings. An independent project copy is a different file. There is
  no project override or restore-inheritance operation.
- `disabled` closes both channels. Optional model/user preferences only restrict
  source permissions. Enabling restores saved channels, and turning off the last
  allowed channel disables the skill without losing the prior usable preference.
- Schema 1 records are read without writes, normalized by physical identity and
  merged only if preferences agree. Conflicts carry skill/path diagnostics and
  block conversion. The next explicitly requested write emits schema 2.
- Denied candidates retain original ranks and positions. Disabling the preferred
  copy cannot select a lower-priority same-name copy.

`runtimeAnchor` resolves the unmodified host module; no DSH runtime is copied.
`configuration` is only an activation/overlay identity, not a policy namespace.
List and load both recheck policy, including when an enabled summary is cached.
Filesystem events remain delegated to DSH. Policy changes invalidate the registry
and notify the host's command/menu refresh events.

## Activation

Acknowledgements record process ID, freshness, plugin version, configuration token,
filesystem settings digest (diagnostic only) and applied policy revision. Activation
checks process liveness/freshness, plugin version, configuration token and policy
revision; it does not compare raw directory expressions with evaluated settings.
Directory reload verification is a separate concern. Current running contexts
must confirm the policy; connected but dormant configurations do not prevent a
running configuration from being confirmed. A configuration applies saved policy
when next loaded. Runtime errors and unsupported configuration remain visible
rather than being converted to empty inventory or activation success.

Malformed policy closes the wrapped providers' channels and reports an error.
Removing the plugin restores original DSH behavior; its private JSON is not an
upstream native exclusion setting.

## Verification

The isolated runtime fixture imports the installed registry, filesystem provider,
model skill loader and manual pre-step handlers without model requests or personal
Profiles. The ASAR harness uses Node 24 module resolution. CLI integration covers
local-package installation, unchanged discovery and same-name precedence,
configuration directory save/restore, live/dead activation and process restart.
Unified inventory fixtures cover membership/physical deduplication and aggregation
of partial setup/errors. Policy fixtures cover migration, conflict/CAS and channel
preferences. All fixture mutations use temporary directories.
