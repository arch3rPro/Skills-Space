# Agent lifecycle and usage controls: initial research

Reviewed: 2026-10-15. Scope: Claude Code, Pi, Codex, Hermes, OpenClaw, and common directory conventions. Supports the [provisional direction in ADR 0007](../adr/0007-agent-native-management-direction.md); it is not an implementation plan or completed integration claim.

Current scope revision: the user withdrew general Agent management. The [skills-only reassessment](skill-management-scope-review.md) is the current research direction; [Pi research](pi-agent-management.md) and [CC Switch analysis](cc-switch-agent-management-reference.md) remain references only. Runtime acceptance remains pending.

## Evidence boundary

This is a first-pass review of live official documentation and selected Pi source functions. Links to `main` and live documentation are moving references, not release pins. No native Agent mutation, configuration write, authenticated session, or enable/disable acceptance test was run. A documented capability does not establish availability in a user's installed version. Record version-specific fixtures before designing adapters. Existing Skills Space behavior remains defined by the pinned upstream contract in the [command map](upstream-command-map.md).

## Initial capability matrix

| Target | Native usage control found | Native lifecycle distinction | Main adapter concern |
| --- | --- | --- | --- |
| Claude Code | `skillOverrides`: `on`, `name-only`, `user-invocable-only`, `off`; plugin skills excluded | Personal/project files differ from plugin-owned and account-synced content | Name matching, settings precedence, plugin granularity and version support |
| Pi | Resource exclusion/inclusion rules; manual-only frontmatter is separate | Pi packages have their own install/remove/update lifecycle | Resolve actual resource paths, project trust and explicit CLI resource overrides |
| Codex | `[[skills.config]]` with skill path and `enabled = false`; implicit invocation policy is separate | Direct skill folders, built-ins and plugins are distinct | Exact path identity, configuration scope, restart and installed-version behavior |
| Hermes | Follow-up source inspection establishes skills.disabled and skills.platform_disabled; project trust and bundle seeding remain separate | Bundled sync and Hub lifecycle differ from externally placed files | Profile/platform, essential skills, recursive paths, same-name resolution and ownership |
| OpenClaw | `skills.entries.<key>.enabled`; agent allowlists and bundled allowlist | Registry updates differ from Git/local refresh; workspace/global and plugin content differ | Skill keys, agent scope, eligibility, snapshots and symlink restrictions |
| Common conventions | No universal per-Agent toggle established | File format/location convention does not supply a common lifecycle backend | Observe physical sharing without claiming every Agent is installed or enabled |

## Claude Code

Official documentation lists personal `~/.claude/skills`, project `.claude/skills`, additional directories, plugins and account-synced skills. Source type determines removal; plugin operations must respect plugin ownership.

`skillOverrides` controls native visibility by name. `off` hides the skill and rejects invocation through that skill mechanism; `user-invocable-only` preserves manual use. Plugin skills are excluded and use plugin controls. Frontmatter invocation flags are a separate mechanism and can affect shared content. Do not infer that permission rules or removal from a menu alone constitute full disable.

Proposal: investigate configuration overrides before file edits. Verify settings precedence, exact names/aliases, managed policy, older versions, plugin effects and session refresh. The documentation's version notes do not establish one tested minimum version for this adapter.

Source: [Claude Code skills — locations, visibility overrides, removal](https://code.claude.com/docs/en/skills).

## Pi

Pi discovers directory skills recursively and supports shared `.agents/skills` locations. `disable-model-invocation` preserves explicit command usage; `enableSkillCommands` changes command discovery and does not by itself disable manually typed commands. [Skills](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)

Settings resource arrays support `!pattern`, `+path` and `-path`. These offer native exclusion without moving files. [Settings](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/settings.md)

Selected source inspection found `isEnabledByOverrides`, `matchesAnyExactPattern` and `applyPatterns` in the package manager, and filtering of enabled resources before skill loading in the resource loader. Explicit CLI/additional skill paths are added separately, so a persistent exclusion must not be advertised as blocking every launch override. Symlink aliases and package-local paths need fixtures. [Package manager](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/package-manager.ts), [resource loader](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/src/core/resource-loader.ts)

The default agent directory is `~/.pi/agent`, configurable with `PI_CODING_AGENT_DIR`; project configuration uses `.pi` and trust applies. Documentation requests `/reload` after manual configuration/resource edits. [Configuration](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/configuration.md)

Pi packages can contain more than skills. Current docs list `pi install`, `pi remove`, and `pi update --extensions`; removal/update granularity is a package, not necessarily a single skill. Installed versions must be checked before using these commands. [Packages](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md)

## Codex

Official documentation lists user `~/.agents/skills`, repository ancestor `.agents/skills`, administrator and bundled locations; symlinked folders are supported. Same-name skills can both appear, so do not impose another Agent's precedence model.

The documented disable mechanism is a `[[skills.config]]` entry in `~/.codex/config.toml`, with `path` identifying `SKILL.md` and `enabled = false`. Configuration changes require restart according to this page. `agents/openai.yaml` can separately set `policy.allow_implicit_invocation: false`, retaining explicit invocation.

Proposal: prioritize a path-specific native adapter. Validate lexical/canonical path matching, custom Codex home, configuration layering, restart behavior, plugins and bundled content against a pinned Codex release. Do not assume the documented user-level mechanism provides project-local toggles.

Source: [Official skill documentation](https://developers.openai.com/codex/skills/) (redirected to [Build skills](https://learn.chatgpt.com/docs/build-skills) during review). The local Codex executable was located, but no local lifecycle or configuration mutation was executed.

## Hermes

Hermes supports categorized local skills, configured external/create roots and trusted project skills. Profile context matters. Bundled content uses native manifest-based synchronization; Hub content has `check`, `update` and `uninstall`, with modified content protected unless explicitly overridden.

Project `trust`/`untrust` is repository-wide. `project_discovery` controls project scanning. Bundle `opt-out` stops seeding; it does not disable existing skills. Follow-up research closes this initial review's per-skill control gap: fixed Hermes source implements skills.disabled and skills.platform_disabled, unions global/platform disabled names, protects essential skills, and includes list/skill_view filtering. See the [skills-only reassessment](skill-management-scope-review.md) for exact revisions and evidence; installed-version acceptance is still pending.

Proposal: preserve native ownership and investigate exact installed-version controls before offering toggles. Keep bundled updates distinct from Hub updates and GitHub latest. Additional roots can be writable, so local-change detection must cover shared physical content.

Sources: [Hermes skill system](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills), [existing project source/path research](hermes-skill-inventory.md).

## OpenClaw

Native configuration uses `skills.entries.<key>.enabled = false`; a custom `metadata.openclaw.skillKey` changes the key. Bundled allowlists and agent-specific skill allowlists are separate filters. Enabling a skill does not satisfy dependencies or override every other filter. Current docs describe rescan/session snapshot behavior, which must be checked against the installed release. [Skills configuration](https://docs.openclaw.ai/tools/skills-config)

The current lifecycle documentation distinguishes workspace skills, shared `~/.openclaw/skills`, plugins and other origins. `openclaw skills install` supports registry, Git and local inputs, but `openclaw skills update` tracks ClawHub installations; Git/local content is refreshed by reinstalling. Discovery imposes symlink containment/trust rules. Thus the App's default symbolic-link mode cannot be presumed effective for every OpenClaw destination. [Skills](https://docs.openclaw.ai/tools/skills)

Proposal: resolve the active workspace/profile and selected internal OpenClaw agent before displaying a toggle. Native operation commands, uninstall behavior and structured results still require release-specific inspection and fixtures. Do not confuse dependency installers with installation of the skill directory itself.

## Common Agent Skills conventions

Treat this as a portable baseline, not a sixth executable Agent. The format specification describes `SKILL.md` and supporting files; it does not supply a cross-Agent management service or a universal per-Agent configuration switch. [Agent Skills specification](https://agentskills.io/specification)

Shared `~/.agents/skills` and project `.agents/skills` are supported by several reviewed hosts, with different scanning, trust and configuration behavior. Follow each host's rules. A shared file path does not establish that every associated Agent is installed, enabled or currently loading it. Preserve existing installed-Agent icon rules rather than introducing a replacement “shared available” label.

## Suggested next verification, not executed

1. Pin Agent release/source revisions and resolve actual executable, profile, configuration roots and workspace. Do not add unrelated Agents in this phase.
2. Test native disable and re-enable on disposable skills: automatic selection, explicit invocation, persistence, reload/restart, and unchanged skill-file hashes.
3. Cover global/project precedence, untrusted projects, same names at different paths, symlink aliases, shared content, plugins/packages, managed settings and externally edited configuration.
4. For each backend, establish install/update/uninstall granularity, provenance, modification protection and partial failures. No automatic adoption or fabricated lock records.
5. Approve a bounded implementation scope and amend runtime contracts before introducing native mutation adapters or App-owned special-path writes.

Research priority: Claude Code and Codex native controls; Pi resource filtering; Hermes ownership/update distinctions; OpenClaw agent/workspace controls. Common-directory semantics are checked throughout. This order does not remove existing support for other Agents.
