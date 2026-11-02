# Skills Space Context

Status: Active glossary. Reviewed against current runtime on 2026-10-14.

## Purpose

Skills Space is a desktop client for the original upstream `skills` CLI. It prioritizes personal skill management across Agents and follows upstream lifecycle behavior. This file defines current domain terms; it is not a complete development standard or an implementation-completion report. [The document index](docs/README.md) separates project rules, workflow, accepted requirements, decisions, plans and historical evidence. The accepted scope is recorded in [spec 0003](docs/specs/0003-upstream-aligned-refactoring.md); [ADR 0005](docs/adr/0005-use-unmodified-upstream-cli.md) supersedes the managed-CLI architecture.

## Ubiquitous Language

| Term | Definition |
| --- | --- |
| Skills Space | The desktop application for viewing and managing skills through the original upstream tool. |
| Upstream CLI | The original `skills` tool published by upstream, used for core skill lifecycle operations. |
| Desktop Extension | A management capability provided by Skills Space beyond upstream's exposed interfaces. |
| Host | The machine and operating-system user whose skill installations are being inspected or changed. |
| Local Host | The computer and user running the desktop application. |
| Server | A future SSH-accessible host, outside this release's user-visible workflows. |
| Global Scope | Installations associated with a host user, independently of one project directory. |
| Project Scope | Installations associated with one explicitly selected project directory. It is distinct from global scope. |
| Agent | A tool supported by the pinned upstream Agent definitions. Being supported does not mean it exists on this computer. |
| Eve Subagent | A project-local installation destination under agent/subagents/name/skills within the Eve Agent, not a separate Agent ID. Install can select destinations; original remove targets the Eve root and all subagents for that skill. |
| Upstream Agent Detection | The `detected` observation derived from upstream configuration paths and applicable dependency checks. It does not verify an executable, login, running process or actual skill loading. Residual configuration can satisfy detection. |
| Agent Installation Status | A separate read-only observation: `confirmed` requires a known executable or macOS application bundle with an executable; `configurationOnly` means only the upstream configuration signal was found; `notFound` means no supported installation evidence was found. The requested display labels are Installed, Configuration found, and Not installed, with green, amber, and red badges respectively. `installationEvidence` identifies the observed entry point. Confirmation does not prove login, runtime health or skill loading. Unsupported/custom entry points may remain unconfirmed. |
| Skill Directory | A directory associated with an Agent in the selected scope. `directoryExists` only observes directory existence; it is independent of detection and does not imply it contains skills. |
| Shared Skill Directory | A physical directory such as `.agents/skills` associated with multiple upstream Agent definitions. Multiple confirmed Agents can have installed skills at this same physical target. `shared` and `sharedDirectory` describe physical sharing for verification, not a replacement for Agent icons. |
| Installed Skill | An observed skill record at an actual path in the selected host and scope. `agents` records directory relationships, including shared directories; it does not prove Agent installation or loading. Same names at different paths may have different sources or content. |
| Installed Agent Display | The GUI shows confirmed Agents by default; manual visibility remains available. Skill icons show confirmed Agent installations with verified skill target relationships, including universal Agents sharing the same directory. All physical associations remain available for lifecycle impact analysis. Unconfirmed Agent pages do not list installed skills or count directory contents; physical records remain in scope-wide inventory and lifecycle impact analysis. |
| Agent Order | A persistent list of stable Agent IDs, shared by management, sidebar, installation pickers and filters. Sorting a scope or search subset retains saved IDs outside that view; legacy preferences default to an empty order. |
| Source | The repository, URL, or local directory from which a skill can be installed. |
| Inventory | The observed skill records and Agent directories in a host and scope. |
| Source Preview | Read-only discovery and content inspection before selecting skills to install. Unsupported sources are reported explicitly. |
| Plugin Group | An optional grouping assigned by upstream plugin/marketplace manifests. In the pinned release it does not namespace or change a skill's installation name; only global source locks persist pluginName. |
| Direct Download | A Markdown or archive URL recognized by the original downloader after applicable discovery fallback. It creates no new source lock; existing same-name records remain unchanged. |
| Source Removal | Exact upstream lock-source membership expanded into reviewed skill/path removals in one scope, including lock-only entries. |
| Dependency Sync | Original experimental_sync for project dependencies and declared Git skills, with optional workspace/filter/link/cleanup behavior. It is distinct from Agent-to-Agent synchronization. |
| Download Source | An HTTP(S) source handled by the pinned original downloader or well-known provider. Well-known indexes reference skill files or archives and retain source/digest records for explicit update checks and updates. Direct downloads create no new upstream source lock and require the URL for a new preview and confirmed installation. |
| Temporary Use Session | One original use invocation for one skill, producing a prompt or launching one supported Agent. It has an explicit working directory and owned temporary support files; it does not create an installed-skill record. Process exit does not mean the Agent completed the user's task. |
| Release Temporary Files | Explicit deletion of an application-owned use session after its tracked processes have ended. It invalidates support paths in copied prompts and is distinct from uninstalling a skill. |
| Update Check | A read-only assessment of available source changes. It is distinct from an upstream command that performs updates. |
| Pi Skill Configuration | Native Pi settings for additional skill paths and resource filters, edited through Pi management inside Settings. A disabled skill remains installed. Card switches change native filters and require Pi reload; they do not prove current-session loading or remove prior conversation content. |
| Uninstall | Removal through upstream from explicitly selected Agent targets and scope. It is not an enable/disable toggle. |
| Operation Summary | The intended operation, source where relevant, selected skills, host, scope and affected targets presented for confirmation. |
| Operation Result | Observed completed, failed or uncertain outcomes after execution and inventory refresh. |

## Semantic boundaries

- Pi-native skill configuration writes are limited to the accepted paths/filters and per-skill switches in spec 0006. They preserve unrelated settings and do not modify skill content or upstream locks.
- Core installation, update and uninstall execute through the unmodified pinned upstream CLI. User-installed CLI commands remain untouched.
- Rust owns filesystem, native process and future SSH capabilities. React owns presentation and interaction.
- Terminal prose is diagnostic data. Inventory uses supported JSON plus read-only observation; lifecycle success is checked against actual state.
- Project scopes are selected explicitly. Global and project inventories are not combined into a claim about Agent effective loading behavior.
- Unknown source or metadata limits capabilities rather than hiding actual installations or inventing provenance.
- Startup reads local inventory. Network update checks are user-triggered; changes are confirmed before execution.
- Partial or uncertain outcomes trigger observation, not automatic rollback or retry.
- Tests mutate isolated HOME, project and Agent fixtures. Old central-library compatibility/migration and automatic cleanup are outside the refactor.
- Remote writes remain unavailable until a separate SSH workflow is accepted and verified with a real host or fixture.
- Secrets do not belong in ordinary configuration, inventory, logs or shareable manifests.

## Runtime evidence and maintenance

Detection and directory observations are produced in `src-tauri/src/upstream.rs`; installation evidence is inspected in `src-tauri/src/upstream/detection.rs`; frontend types and the installation presentation filter are in `src/lib/upstream.ts`. Native command registration in `src-tauri/src/lib.rs` includes `marketplace`, `preferences` and `upstream`.

Update this glossary when accepted terminology or observed semantics change. Do not revive retired terms such as Managed CLI, central-library distribution, Deployment Drift or Snapshot by following a historical document. Future remote models require a separately accepted spec; the current `Target` only accepts local global/project execution.


### Project navigation metadata

Project records contain an absolute directory path, a display name, and a built-in icon ID. Their array order controls sidebar and installation-scope ordering. Collapse state is a presentation preference. These fields do not rename directories or alter upstream skill identity. Global and project navigation both use the Agent view; changing scope must clear the previous inventory before loading the new scope.
