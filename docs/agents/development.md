# Development map

Status: Active guidance. Reviewed 2026-10-14.

## Active runtime

DSH companion development uses the active clean Web environment: `pnpm dev:dsh:clean status|start|open|restart|stop`. Its separate HOME, DSH_HOME and browser data are under `.scratch/dsh-clean-test/`, with Host at `http://127.0.0.1:64590`. The clean Profile needs the official `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app` bundles before the companion; the base bundle alone does not provide the Web Host services required by the plugin. The older `pnpm dev:dsh` target at `64580` is retained for historical QA and is not the current clean target. Keep both separate from personal Desktop/Web Profiles; update personal targets only for a requested delivery. See [spec 0012](../specs/0012-dsh-settings-native-skills-rebuild.md#3810-new-clean-test-environment-historical-baseline).

| Responsibility | Current entry |
| --- | --- |
| Desktop pages, user flow and presentation | `src/App.tsx` |
| UI design authority, theme ownership and component selection | `docs/design/ui-system.md`, `docs/design/component-catalog.md`; read before UI implementation or review |
| Installation source, Agent selection, mode preference and review | `src/components/source-field.tsx`, `agent-picker.tsx`, `install-mode-field.tsx`, `general-settings.tsx`, `install-review.tsx` |
| Agent brand icons and shared modal shell | `src/components/agent-logo.tsx`, `src/components/modal.tsx` |
| Native lifecycle regression fixtures | `src-tauri/src/upstream/tests.rs`, capability modules’ tests |
| Frontend contracts and pure inventory/path helpers | `src/lib/upstream.ts` |
| Native command registration | `src-tauri/src/lib.rs` |
| Original CLI execution, inventory, preview, mutations and verification | `src-tauri/src/upstream.rs` |
| Original init creation planning, execution and observation | `src-tauri/src/upstream/creation.rs` |
| Project lock restore planning, original command and outcome verification | `src-tauri/src/upstream/restoration.rs` |
| Dependency discovery planning, original sync and per-path observation | `src-tauri/src/upstream/dependencies.rs`, `scripts/inspect-upstream-dependencies.mjs` |
| Eve project paths, transformed document expectations and target verification | `src-tauri/src/upstream/eve.rs`, `scripts/inspect-eve.mjs` |
| Pi skill settings, resource inspection and card state | `src/components/pi-management.tsx`, `src/lib/pi.ts`, `src-tauri/src/upstream/pi.rs`, `scripts/inspect-pi-skills.mjs`, `upstream/pi/visibility.rs` and `scripts/pi-visibility-extension.mjs` (managed prompt visibility uses external preferences; native invocation uses revision-checked frontmatter writes and field-only recovery) |
| Pi independent local skill removal | `src-tauri/src/upstream/pi_removal.rs`: reviewed, bounded local-file/directory fingerprint and OS Trash move; shared/CLI/package resources excluded |
| DSH scoped inspection, composed settings, external invocation policy and independent local Trash removal | `src-tauri/src/upstream/dsh.rs`, `upstream/dsh/native.rs`, `upstream/dsh/policy.rs`, `scripts/dsh-policy.mjs`, `scripts/dsh-skill-policy/`, `scripts/run-dsh-policy-install.mjs`, `scripts/inspect-dsh-skills.mjs`, `scripts/dsh-configuration.mjs` (original installed app-boot composition; no Profile boot or expression evaluation), `scripts/prepare-dsh-change.mjs`, `src/components/dsh-management.tsx`; original CLI owns managed lifecycle, spec 0009 bounds native writes |
| Application preferences | `src-tauri/src/preferences.rs` |
| Hermes profile/project skill inspection and settings | `src-tauri/src/upstream/hermes.rs`, `scripts/inspect-hermes-config.mjs`, `scripts/prepare-hermes-settings.mjs` (read-only YAML preparation), `src/components/hermes-management.tsx`; Rust owns profile configuration writes, original CLI owns managed lifecycle |
| Internal read-only YAML metadata and bounded folder hashes | `scripts/inspect-skill-documents.mjs` |
| Read-only source parsing using original pinned parser functions | `scripts/inspect-upstream-source.mjs` |
| Read-only original plugin discovery/grouping and selection identity | `src-tauri/src/upstream/plugins.rs`, `scripts/inspect-upstream-plugins.mjs` (manifest validation/grouping), `scripts/inspect-upstream-discovery.mjs` (original pinned discovery/order/filter/lock exclusions), `scripts/inspect-skill-documents.mjs` (original metadata parser plus bounded hashes) |
| Read-only well-known index/artifact preview and download result verification | `src-tauri/src/upstream/provider.rs`, `scripts/inspect-upstream-provider.mjs` |
| Direct download preview | `src-tauri/src/upstream/downloads.rs`, `scripts/prepare-upstream-download.mjs` |
| Local installed-directory distribution | `src-tauri/src/upstream/skill_sync.rs`: local copy/direct-link writes and relationship journal, occupied/shared target checks, protected propagation and reviewed owned-link/copy removal; ADR 0005 defines the explicit local exception |
| Exact lock-source removal planning | `src-tauri/src/upstream/source_removal.rs` |
| Temporary use confirmation, owned session state and original CLI/terminal orchestration | `src-tauri/src/upstream/usage.rs`, `scripts/run-upstream-use.mjs` |
| Temporary-use modal content and typed frontend state | `src/components/use-skill-flow.tsx`, `src/lib/use.ts` |
| Pinned CLI/Agent metadata staging and Node discovery/download | `scripts/stage-upstream.mjs`, `scripts/node-runtime.json`, `src-tauri/src/upstream/node_runtime.rs` |

Use source imports and registered commands to verify runtime ownership; this table is navigation, not a second command contract. `docs/research/upstream-command-map.md` owns the integration findings for the pinned upstream release.

## Contracts and historical material

Read [the document index](../README.md) for current responsibilities, status and replacement relationships. `CONTEXT.md` defines domain terminology; it is not a substitute for project constraints, accepted requirements or implementation evidence. Specs 0004/0005 are plans, not proof of implemented capabilities. Historical material consolidated in `docs/archive/` do not impose current workflow or compatibility requirements.

The retired managed CLI package, its staging script, unregistered native modules and dedicated frontend helpers/tests were removed on 2026-10-13 after checking runtime references. Git history and marked historical documents retain their context; do not restore them as active execution paths.

## Verification branches

`AGENTS.md` owns required build commands and the conditional subagent gate. Routine work is executed by the main agent; this verification guidance does not authorize delegation. This section owns verification selection and stop rules for the parent and all reviewers; Agent-specific guidance below narrows applicable behavior checks and does not override these limits.

### Verification scope and automation limits

**Fix the checklist before execution.** In the existing progress update (and a reviewer handoff only when delegation qualifies), name (1) changed user outcomes and actual risks, (2) existing evidence to reuse and the smallest checks/commands needed, (3) expected duration and timeout for external checks, (4) one test/build owner and the single needed artifact, and (5) the stop condition. A short list is sufficient; small changes need no separate plan/report. A generic request to check or review is not authorization for UI automation or a full regression run. The parent chooses routine scope without asking the user to approve every check.

| Actual change | Minimal applicable evidence |
| --- | --- |
| Documentation/instructions only | Check references, parse configuration documents and reconcile instructions; no application tests, builds, desktop interaction or reviewer delegation |
| Copy, styling or existing-control composition | Static consistency review, required frontend build, ordinary observation of the affected surface when available; no new behavior tests for unchanged logic |
| Read-only metadata, filtering or status display | Existing focused parser/data-boundary and Agent/scope-isolation checks as applicable, static UI review and required build; no original-Agent lifecycle, model invocation or restart experiment unless that contract actually changes |
| Configuration writes or persistence | Focused changed-field/scope/conflict checks; one relevant save/restart observation when persistence changed, not every Agent or setting |
| Installation/update/removal, CLI integration or packaging | Actual affected original-CLI behavior in isolated HOME/project data; required build and artifact/resource checks. Broader coverage requires the affected contracts to be identified |
| Substantial application workflow, or explicit APP testing request | Automate only named affected transitions and relevant failure states that lower-level checks cannot establish; use the actual Tauri window and isolated mutation data |
| Authorized remote operations | Real host or SSH test environment before claiming the remote workflow works |

Ordinary observation means opening the affected surface and reading its rendered state, not scripting an application transition. Rust edits, read-only configuration inspection or reviewer delegation do not by themselves select application automation. UI review follows the [design baseline](../design/ui-system.md#consistency-review-before-handoff); report static, observed and unobserved results separately.
**Prohibited overtesting:** These limits also govern CI design: do not copy every check into every job/platform by default. Share platform-independent results while retaining compiler/runtime checks for affected platforms.

- MUST NOT run full frontend/native/Agent suites, a theme/platform matrix, original-runtime integration, live-network/model checks or restart scenarios merely because a file changed, a reviewer was assigned, an optional environment is available, or a previous task used them. Each additional execution needs an uncovered changed contract or observed defect. Do not rerun unchanged successful platforms/artifacts without a relevant source/environment change or explicit user request.
- MUST NOT add tests for reversible copy/style changes, tests that mirror implementation, duplicate layers checking the same outcome without a distinct risk, speculative edge-case cross-products, or new infrastructure/dependencies solely to make a small task look fully tested. Extend/consolidate an existing meaningful case first. Do not move expensive checks elsewhere and call that simplification.
- MUST NOT self-expand the fixed checklist, run a proposed check before the parent records its reason, or start another review/experiment/screenshot round merely for confidence or a more complete report. Independent review permits broader relevant inspection and defect reporting, not unlimited execution.
- MUST NOT guess upstream semantics or record counts through repeated failing test expectations. After a failure, capture the actual result and establish the requirement/upstream contract before changing a test. Preserve meaningful checks; do not weaken them for a pass, rewrite a passing test for tidier coverage, or broaden the task while fixing a test assumption. Report unrelated pre-existing failures separately; a failing required regression is not a pass.
- MUST NOT rerun a valid check unless its code, dependency, data/environment precondition or required contract changed. A Tauri build that includes the frontend build replaces a separate `pnpm build`. Do not repeat compilation/listing solely to collect results already available from the same artifact.
- MUST NOT package after each local fix, build both normal and QA apps by default, or let multiple agents stage/build/run the same flow. Complete static findings and related repairs first; then one owner performs the selected checks and one necessary build. Rebuild only for a source/resource change invalidating that artifact or explicit user request. Never rebuild/relaunch to repair a desktop-tool binding, focus or stale snapshot problem.

**Scope changes and completion.** A newly observed material defect, uncovered changed requirement or invalidated result permits the parent to revise only the necessary checks, recording the finding, smallest extra check and expected cost before execution. This requires no new user permission within authorized work. Reviewers report proposed expansion and continue independent static work; they do not execute it first. As soon as required selected checks pass and material findings are resolved, stop. A missing optional tool or unobserved state is a precise verification gap, not permission to compensate with other tests. Never claim acceptance from test counts/builds or silently skip a material defect.

**Bounded tools.** Set supported command/tool timeouts and use cancellable/yielding calls. Do not leave an external operation unbounded. For the same desktop/input failure, allow at most one documented recovery and two minutes total, whichever comes first; then cancel/interrupt the pending operation, stop that check and report the gap. The parent must interrupt a stalled delegated operation rather than keep polling it. Changing agents, APIs, sessions or keys does not reset this limit; later sessions inherit the recorded blocker until a changed prerequisite addresses its cause. Do not launch a replacement flow while the old one is pending. Compilation and a deliberately selected long test use their declared command budget, not this desktop recovery limit; an unexpected overrun requires diagnosis and a bounded revised plan, not silent waiting.
Staging rewrites the generated CLI resources used by native tests; it uses the build process Node and stages no Node sidecar. Native fixtures require a compatible system Node. Run staging/build and native fixture tests **sequentially**. Do not execute `pnpm build` or Tauri's staging hook concurrently with tests that run the staged CLI: a binary being copied can produce `Malformed Mach-o file` failures unrelated to lifecycle behavior. Tests using `upstream::tests::engine` can set the test-only `SKILLS_SPACE_TEST_RUNTIME_ROOT` to a temporary snapshot containing `resources/upstream/`, copied after staging completes. This keeps fixture executables stable when another task shares the checkout; it does not change production runtime discovery or authorize concurrent mutation of the snapshot. Download fixtures require a permitted loopback listener.

Frontend contract tests also import generated scripts from `resources/upstream/`; on a clean checkout, finish `pnpm stage:upstream` before `pnpm test:frontend-contracts`.

To prepare a selected standalone native check, finish `pnpm stage:upstream` first. `pnpm test:native` selects the critical scope; `pnpm test:native:full` selects the extended library suite. Select either under the checklist above; original-Agent opt-in checks remain separate. A dependency-cache miss is an environment limitation to report, not a reason to change the CLI contract. In CI, the compilation step writes Cargo JSON metadata and sets `NATIVE_TEST_ARTIFACTS` for the execution step; the runner reads the generated test executable and invokes it directly for listing, ignored-state inspection and execution. This prevents an additional Cargo invocation from recompiling the test program. Without this CI metadata, the local entry keeps its existing Cargo behavior.

`test:frontend-contracts` exercises the current adapter helpers, including `test:pi` for Pi rules, discovery and CLI removal boundaries. Pi native fixtures cover preserved settings, concurrent edits/locks, project isolation, package filters, unchanged skill content, and original CLI copy/link lifecycle. For Pi changes, select navigation, card-switch or restart checks only when the corresponding behavior changed; do not replay them for copy, layout or read-only display edits.

`test:native` runs current native fixtures after staging has finished; it does not stage resources concurrently. Legacy test commands have been removed. Builds, helper tests and native fixtures do not replace a network update or a complete desktop lifecycle test.

`test:hermes` checks project isolation/trust, precedence, Hub path identity, YAML preservation and stale edits. Hermes native fixtures additionally execute original CLI copy/link add/remove and native configuration writes in isolated HOME. For Hermes changes, select dirty-navigation, enable/preload or restart checks only when those behaviors changed; a settings-page edit alone does not require all of them. Do not run Hermes discovery commands that initialize Hub state for a read-only inventory check; offline qualification is not a runtime scan or session-loading guarantee.
`test:frontend-contracts` exercises the current adapter helpers, including `test:pi` for Pi rules, discovery and CLI removal boundaries. Pi native fixtures cover preserved settings, concurrent edits/locks, project isolation, package filters, unchanged skill content, and original CLI copy/link lifecycle. When application checks are needed for changed Pi behavior, inspect the affected navigation or controls; include a restart only when restart behavior changed.

`test:native` runs current native fixtures after staging has finished; it does not stage resources concurrently. Legacy test commands have been removed. Builds, helper tests and native fixtures do not replace a network update or a complete desktop lifecycle test.

`test:hermes` checks project isolation/trust, precedence, Hub path identity, YAML preservation and stale edits. Hermes native fixtures additionally execute original CLI copy/link add/remove and native configuration writes in isolated HOME. When application checks are needed for changed Hermes behavior, inspect only the affected settings, navigation guards or controls; include a restart only when restart behavior changed. Do not run Hermes discovery commands that initialize Hub state for a read-only inventory check; offline qualification is not a runtime scan or session-loading guarantee.

The optional public HTTPS lifecycle test is ignored by default: `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib real_https_git_source_lifecycle -- --ignored --nocapture --test-threads=1`. It requires network access and only mutates a temporary HOME. Deterministic version-change fixtures remain in the default suite; do not substitute a no-op network update for that evidence.

## Remote development, only when explicitly authorized

The current release rejects non-local execution. Before adding remote support, obtain an approved design under spec 0003. Model remote mutations as plan → explicit confirmation → apply → verify; include affected skills, lockfiles and CLI installations in the plan and require confirmation before overwriting them. Verify the accepted workflow on a real host or SSH fixture.

## Local generated directories

- `.cache/upstream-runtime/` retains earlier official Node download evidence/fixtures and is ignored by Git; current builds no longer need it. The application downloads a fallback only when needed, into its own data directory, using the pins in `scripts/node-runtime.json`.
- `.scratch/` holds local fixture/work material. Inspect and reuse compatible existing isolated data, launch configuration and acceptance artifacts before creating another fixture. Preserve test preconditions: reset only the affected seed data when a fresh state is required, and create a separate dataset only for incompatible or concurrent scenarios. Move durable findings into specs/research or archive; do not commit test HOME trees or credentials.
- `.worktrees/` is not required by the application or build. Git worktrees live at paths shown by `git worktree list`; an empty local folder does not own those checkouts.
- `.vscode/` and old skill-runner state are not project requirements. No editor extension recommendations are shipped.


## Pi invocation and update safety verification

The 2026-10-18 increment in spec 0006 supersedes the earlier all-external invocation tests. For managed invocation, verify that an explicit external automatic preference overrides source `true`, no external record follows the source default, prompt discovery changes while original `/skill:` expansion remains available, and recognized old extension upgrades preserve local-edit protection. Managed source/lock bytes remain unchanged by visibility changes; native invocation writes only its YAML field and journals recovery outside the skill tree. Check explicit `false`, source default (including an absent field), externally edited fields/support files, prepared-transaction restart and whole-package affected scopes. A source change must not erase a local edit or make a recorded preference replace an old document wholesale.

After staging, select affected deterministic cases from `pnpm test:frontend-contracts` or the native `--lib` suite under the fixed checklist; these suite names are entry points, not a requirement to run both in full. The opt-in original Pi package fixture requires `SKILLS_SPACE_PI_TEST_INSTALL` pointing to an existing original Pi 1.3.0 package root; invoke native test `original_pi_package_update` with `--ignored --test-threads=1`. `node --test scripts/pi-package.test.mjs` uses the same explicit variable for its original Pi/npm fixture. This test starts a loopback-only registry; all installs, metadata patches, dependencies and installation journals use a temporary HOME. Its version checks assert no package-archive downloads or journal writes; explicitly confirmed updates remain available; automatic copy propagation retains local changes and field recovery preserves separately changed invocation values. Whole-package backups and independent npm source-archive caches are retired by the simplified contract in spec 0006. It is skipped when no original installation was explicitly selected. A sandbox blocking loopback servers is an environment failure; rerun the unchanged fixture with the permitted local networking scope.

Packaged desktop acceptance reuses one shared QA app with a separate **compiled** identifier and unique window title, isolated HOME, global/project roots and Pi settings. Rebuild that same QA product in place when source or packaging changes require it; preserve the normal App bundle. Changing only Info.plist does not isolate Tauri's compiled configuration identity. Keep the allowlisted GUI launch process alive in its foreground session, bind automation to that live instance, and confirm the same PID and fixture paths after binding; stop it after acceptance. Remove redundant QA app copies while retaining reusable datasets and evidence. The current local fixture entry is `.scratch/directory-actions-qa/README.md`; if unavailable, inspect existing local fixtures before preparing a replacement. When these contracts change, select the relevant native-rule migration, explicit false/default, package-update review, retained-edit propagation, restart or original Pi `/skill:name` expansion check; this inventory is not an every-task checklist. Use a local simulated response stream for invocation checks. Never use real Agent credentials or a live model merely to verify invocation semantics.
### Codex native qualification

Use the relevant cases in `pnpm test:upstream` for changed Codex canonical-path, ownership or Agent-context boundaries; do not run the whole suite for an unchanged contract. After staging, the opt-in original CLI fixture is:

```sh
SKILLS_SPACE_CODEX_TEST_BINARY=/absolute/path/to/codex cargo test --offline --manifest-path src-tauri/Cargo.toml --lib upstream::codex::tests::native_config_and_local_plugin_round_trip -- --ignored --nocapture --test-threads=1
```

It uses a temporary HOME, no model requests, and covers duplicate names, path/name rule ordering, native single-write differences, batch deduplication, semantic configuration conflicts, project aliases, content preservation and local plugin install/disable/enable/remove including dotted IDs. For Codex, select isolated switch, batch, whole-plugin confirmation, custom CODEX_HOME or restart checks only when that specific behavior changes. Read-only state display does not trigger this lifecycle checklist. Never use the user's installed plugins as mutation fixtures.

## Windows path boundaries

Rust paths serialized to Node helpers, the upstream CLI or inventory records must use the same canonical spelling as the receiving runtime. Use `dunce::canonicalize` at those boundaries to handle Windows verbatim prefixes and short-name aliases; it is already present in the locked dependency graph. Keep real directory containment, symlink and shared-ownership checks. Pure Rust identity comparisons do not require broad replacement. `rustfmt` parsing is not a type check: compile changed tests before dispatching an installer build. A platform-specific runtime assertion that only uses portable Rust types should remain compiled on other hosts (for example, `cfg_attr` can ignore execution); reserve `cfg` exclusion for actual platform-only APIs. Test Git file sources must be constructed with `reqwest::Url::from_file_path`, not `file://` plus `Path::display`, because backslashes are escapes in Git configuration.

## Cross-platform failure review

1. Read the complete failed-target log and map every failing assertion to its producer, consumer and contract. Separate production defects, test-data assumptions and insufficient diagnostics. A generic failure without its actual result is an evidence gap: add bounded result diagnostics before drawing a conclusion.
2. Repair the whole known defect pattern together. For filesystem identity, compare path components or consistently resolved physical paths, including paths planned before creation. Display strings and mixed separators are not installation identities. Serialize relative source/signature paths using portable components, while preserving file contents byte for byte. Test Git repositories that require exact bytes must declare their newline policy explicitly.
3. Compile changed production code and tests with the actual compiler before handoff. Syntax parsing and static review do not type-check constructors. Keep portable test bodies compiled on other hosts; use platform exclusion for platform-only APIs. Run native tests on the affected OS before installer packaging, and distinguish passed, skipped, failed and unverified outcomes.
4. Consolidate review findings and repairs before the next explicitly authorized workflow run. Reuse valid checks and successful unchanged platform artifacts. Rebuild all platforms only when shared changes require it or the user requests it. Keep installer creation dependent on successful checks for that target; a macOS pass is not Windows or Linux acceptance.

Completion requires every known failure to have a supported correction and relevant evidence. Pending target execution remains pending; do not describe it as fixed or accepted based only on another OS.
