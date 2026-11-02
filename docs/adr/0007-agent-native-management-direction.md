# ADR 0007: Agent-native management and bounded desktop extensions

- Status: Accepted direction with subsequently approved bounded implementations. Reviewed 2026-10-28; ownership exceptions are recorded in ADR 0005 and the owning specs, not inferred from this document.
- Date: 2026-10-15
- Initial research scope: Claude Code, Pi, Codex, Hermes, OpenClaw, and common Agent Skills directory conventions. Other Agents follow later.
- Related: [ADR 0005](0005-use-unmodified-upstream-cli.md), [ADR 0004](0004-upstream-lockfile-authority.md), [initial capability research](../research/agent-lifecycle-capabilities.md).

## Current scope (reviewed 2026-10-28)

Keep cross-Agent skill management as the product focus. Later explicit approvals separately added Pi package/plugin lifecycle, Codex skill/plugin/marketplace management and this application’s independent Codex authorization. Those bounded implementations are governed by [spec 0006](../specs/0006-pi-skill-management.md), [spec 0010](../specs/0010-codex-skill-plugin-management.md) and [ADR 0005](0005-use-unmodified-upstream-cli.md). General Agent application updates, model/provider management and session administration remain outside the accepted scope. Independent authorization does not permit reading or reusing an existing login.

## Historical scope revision (2026-10-15)

The user withdrew the expansion into general Agent management. Keep Skills Space focused on cross-Agent skills: discovery, install/update/uninstall, native skill controls and necessary skill-specific configuration. At that checkpoint, Pi application updates, package/plugin updates, models/providers, MCP, authentication, sessions and general Agent parameters were excluded. Later explicit package/plugin and independent-authorization approvals supersede only those named exclusions, as listed above. Agent version/root detection may support skill compatibility without becoming a version-management product.

The earlier Pi-management proposal below is historical. The [skills-only reassessment](../research/skill-management-scope-review.md) is the current research direction. Do not revive central-library distribution or build an App-owned special-path mutation engine by inference from this ADR; those possibilities remain deferred and require a concrete, separately accepted design.

## Context and decision

Skills Space needs to manage installations that the pinned upstream CLI cannot fully address, and to distinguish installation from an Agent's permission to discover or invoke a skill. A GitHub source alone does not establish ownership, safe updates, or compatibility with the installed Agent version.

Use the unmodified upstream CLI as the default lifecycle backend, Agent-native mechanisms for native content and usage controls, and bounded desktop extensions only where both leave a concrete gap. Do not maintain a CLI fork. A consistent GUI does not require every operation to use the same backend.

This decision does not restore a central skill library, distribution ledger, or enable/disable through withdrawing and restoring links or copies. Install skills at their actual destinations. Disabling must use an effective Agent-native control; unsupported controls stay unsupported.

## Responsibility boundaries

| Component | Responsibility |
| --- | --- |
| Upstream CLI | Its supported source discovery, install, update/check and uninstall behavior, and its own lockfile writes. Preserve original semantics and user-installed commands. |
| Agent | Its discovery roots, precedence, project trust, invocation policy, runtime loading, and native content/package lifecycle. |
| App | Select the correct backend for each operation, inspect actual state, show scope/impact, detect local changes, and verify outcomes. Native processes and file operations remain in Rust; React owns interaction. |

For each installation instance and operation, identify one execution authority. Do not let two backends update the same physical content independently. Instances include host, scope, actual path and Agent association; names alone are insufficient. Package/plugin ownership can constrain operations to a whole package rather than an individual skill.

## Operation policy

| Operation | Intended behavior |
| --- | --- |
| Install | Use upstream for supported standard installations; use Agent-native installation for native sources; consider App-owned special-path installation only after a concrete design. Copy/link placement does not establish enabled or loaded state. |
| Update | Use the installation's responsible backend. Establish source/version and check local changes before execution. Unknown provenance is not evidence of being current. Preserve backend-specific target granularity and update limits. |
| Uninstall | Remove the explicitly selected installation through its responsible backend. Show shared-content and package impact and local modifications. Do not retain a central-library copy as part of this operation. |
| Enable/disable | Change a verified Agent-native configuration or command. Do not move directories, withdraw links, edit a shared skill's frontmatter as a generic per-Agent toggle, or use an App-only flag. Distinguish full disable from explicit-invocation-only mode. |

Where native enable/disable is absent or unverified, expose that limitation rather than substitute uninstall. A successful configuration write is distinct from current-session effectiveness; report restart/reload requirements when established.

## State and update evidence

Observe installation, operation authority/capabilities, native configuration, discovery eligibility, local modifications and source updates separately. Directory presence does not prove Agent installation, effective visibility, loading, or execution. Project trust and same-name resolution are independent constraints. Configuration disable is a discovery/invocation control, not a filesystem security boundary or removal of instructions already in a conversation.

Future App-owned installations need a separate, minimal operation/provenance record: actual target, verified source/ref, copy/link mode and content baseline. Never synthesize upstream locks or infer ownership from matching names. Such a record supports actual special-path operations; it is not the retired central-library distribution model. Its schema and concurrency/recovery behavior remain undecided.

Compare the last successful baseline, local content and new source across the skill package, including support files. Local and remote changes require explicit conflict handling. Missing baseline permits a difference report, not a claim about who changed what. App-owned writes require bounded backup/recovery and result checks; existing upstream/native operations must not be advertised as transactional if they are not.

## Hermes direction

Keep bundled and Hub skills under their native lifecycle unless an explicit, separately designed migration changes ownership. Distinguish the installed Hermes release's bundled content from GitHub latest. A normal upstream installation used by Hermes stays upstream-managed. External/category content is not automatically adopted, migrated or given a fabricated source lock.

Hermes modifications are local changes to the actual content, including shared targets when writable; do not automatically overwrite them or publish them upstream. Native project trust and bundle seeding controls must not be labeled per-skill enable/disable.

## Sequencing and open decisions

Historical refinement, subsequently withdrawn: the user explored detailed Pi configuration and general Agent management, including application and package updates, using CC Switch as a reference. [Pi research](../research/pi-agent-management.md) and [reference-project analysis](../research/cc-switch-agent-management-reference.md) retain evidence, not an active implementation direction. Current sequencing is limited to skills in the scope revision above.

1. Research the five selected Agents and common directory conventions; track documentation, source inspection and runtime evidence separately.
2. Establish version-sensitive capabilities, installation identity, operation ownership and reliable state observations.
3. Design native usage controls and native lifecycle adapters, then local-change/update conflict handling.
4. Defer App-owned special-path installation; revisit only for a demonstrated skills-specific need and a separately accepted design. General Agent/package/application management is withdrawn.

Open: minimum supported Agent versions, configuration precedence, same-name/path targeting, package-level effects, config-preserving writes, concurrent external writers, special-path provenance storage, recovery and migration UX. No universal toggle or ownership-transfer workflow is approved by this record.

## Relationship to current contracts

ADR 0004/0005, spec 0003, project instructions and the current glossary describe the runtime. On 2026-10-15 the user accepted the bounded [Pi skill configuration implementation](../specs/0006-pi-skill-management.md): settings within the AGENT management tab, native extra directories/exclusion rules, and enable/disable on Pi skill cards. The affected contracts now permit these native configuration writes. Other Agent adapters and App-owned content lifecycle remain unimplemented; the earlier broad Agent-management proposal remains withdrawn.

## Alternatives not selected

- Force all content into upstream CLI management: loses native ownership and directory semantics.
- Maintain a fork now: adds release and compatibility responsibility before the gaps are validated.
- Restore central-library enable/disable by withdrawing distributions: explicitly excluded by the user.
- Present a universal switch without a verified native effect: reports a state the App cannot enforce.

## Approved Codex A–C refinement (2026-10-21)

The user explicitly approved native inventory, user-level skill enablement and local-marketplace plugin lifecycle in [spec 0010](../specs/0010-codex-skill-plugin-management.md). This is a narrow exception to the earlier general-plugin deferral: plugins are managed as whole skill-distribution packages, with their observed non-skill components included in confirmation. Existing Git-marketplace installations may use verified user-level enablement; Git/npm installation and removal, remote catalog expansion, source updates, model/provider, authentication and session management remain outside this approval. Skills Space owns presentation, protocol adaptation and verification; the original Codex CLI owns installation records, configuration persistence and plugin content mutations.


The final scope keeps user-level ordered skill name/path rules and override removal in Codex settings, with plugin lifecycle in the Agent plugin tab. Unmanageable plugins retain verifiable identity/state, disabled actions and an application-only hide filter; they never redirect to an external manager. Codex App and CLI share one adapter only for publicly observable configuration and capabilities. Executable schema checks replace a machine-specific version allowlist; a CLI sample does not establish the desktop session's effective state. App-only installations without a public management interface retain ordinary skill support and report native management as unavailable.
