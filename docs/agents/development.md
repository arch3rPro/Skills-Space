# Development map

Status: Active guidance. Reviewed 2026-10-14.

## Active runtime

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

Read required build commands in `AGENTS.md` and runnable scripts in `package.json`; do not copy the entire script catalog into more documents.

Choose application verification by change size:

- Styling, copy and small localized adjustments: complete relevant build/type checks and necessary targeted tests, open the updated app, and give the user concise manual testing notes with the affected page, action and expected result. Use this lightweight path without automated app interaction or a full desktop workflow run.
- Substantial module, workflow or cross-page behavior changes: automate the affected app flow, covering relevant state transitions and failures. An explicit user request for APP testing selects this path regardless of change size. Use isolated fixtures for mutations.
- Documentation-only changes: check references and rule consistency; opening or rebuilding the app is unnecessary.

Native/compiler checks and relevant code tests remain required according to the change; APP testing here means automated interaction with the application, not ordinary build or unit checks.

UI acceptance also includes the [design baseline's consistency review](../design/ui-system.md#consistency-review-before-handoff). Keep its static checks, observed visual results and remaining manual checks distinct; retain the size-based automation policy above.

### Verification scope and automation limits

1. **Choose once from the actual change.** State the verification branch and concrete questions in the existing progress update and reviewer handoff; small changes need no separate verification plan or report. Label edits, option filtering, default-selection corrections and other localized fixes normally use the lightweight branch. Ordinary App inspection means opening the affected surface and reading its rendered state, without a scripted interaction or state-transition test. Touching Rust, a configuration reader or persistence does not by itself require UI automation: use targeted code/native tests for those contracts, and automate only a named application transition that they cannot establish. General requests to check, verify or review are not explicit requests for automated APP testing. Prior broad feature verification does not automatically carry a full workflow into every later local fix.
2. **Keep review independent and execution bounded.** Both reviewers inspect the complete affected task and may report design or functional defects. Their role does not authorize extra automation, a full theme/window matrix, restarts or duplicate application flows. The main agent records the specific unresolved behavior before expanding the selected branch. A newly introduced persistence transition may need one targeted restart; it does not justify replaying unrelated flows. Reuse visual evidence when its relevant layout, controls and conditions are unchanged.
3. **Stop tool-failure loops.** For an unchanged automation/input failure, allow at most one recovery using the tool's documented API and at most two minutes total, whichever comes first. Then stop that automated check, record what remains unobserved, and continue independent code checks and ordinary/manual inspection where available. A tool limitation is not a product failure or a pass. Do not rebuild or relaunch to clear accessibility, focus, stale-snapshot or input-delivery errors. Resume only when a changed prerequisite or a materially different supported approach addresses the identified blocker; switching agents, APIs or key sequences does not reset this limit. These limits apply to tool troubleshooting, not to repairing a demonstrated product defect.
4. **Build after consolidated repairs.** Finish static review and collect related findings before packaging. One owner prepares only the artifacts needed for the selected verification and delivery; do not automatically build both normal and QA Apps. Reuse the shared fixture and existing valid results. After a production repair, rerun only invalidated checks and required dependent checks; a Tauri build that already ran the complete frontend build does not require a duplicate standalone frontend build.
5. **Close at the selected acceptance boundary.** End verification when required checks and the named questions are resolved. Do not add screenshots, scenarios, reports or another reviewer run merely to increase confidence or compensate for a blocked tool. Resolve material product defects; report passed, failed and unobserved states accurately. Explain a tool stall in the next progress update, including the attempted recovery and the check being stopped, rather than leaving the user waiting through repeated attempts.

| Change | Evidence |
| --- | --- |
| Pure frontend behavior | Relevant `src/lib/upstream.test.ts` cases; strict frontend build |
| Automated app verification | When selected by the size rules above, exercise the affected flow in the actual Tauri window, including relevant loading, empty, failure and uncertain states; use the packaged app when distribution behavior is affected |
| Persistence | Change state, restart and verify the saved result; check compatibility with existing saved data using isolated fixtures |
| Native lifecycle behavior | Real pinned CLI in isolated HOME/project fixtures, actual directory/content/lock results, native build |
| CLI pin, staging or runtime packaging | Compare command/path/lock contracts; stage resources; isolated lifecycle tests; inspect packaged CLI/resources and downloaded runtime/licenses |
| Documentation only | Local links resolve, authoritative/historical status is clear, instructions are consistent; runtime builds are unnecessary |
| Authorized remote operations | Real host or SSH fixture before any claim of a working remote workflow |

Staging rewrites the generated CLI resources used by native tests; it uses the build process Node and stages no Node sidecar. Native fixtures require a compatible system Node. Run staging/build and native fixture tests **sequentially**. Do not execute `pnpm build` or Tauri's staging hook concurrently with tests that run the staged CLI: a binary being copied can produce `Malformed Mach-o file` failures unrelated to lifecycle behavior. Tests using `upstream::tests::engine` can set the test-only `SKILLS_SPACE_TEST_RUNTIME_ROOT` to a temporary snapshot containing `resources/upstream/`, copied after staging completes. This keeps fixture executables stable when another task shares the checkout; it does not change production runtime discovery or authorize concurrent mutation of the snapshot. Download fixtures require a permitted loopback listener.

Frontend contract tests also import generated scripts from `resources/upstream/`; on a clean checkout, finish `pnpm stage:upstream` before `pnpm test:frontend-contracts`.

To prepare a standalone native test run: finish `pnpm stage:upstream`, then run `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1`. An offline cache miss is an environment limitation to report, not a reason to change the CLI contract.

`test:frontend-contracts` exercises the current adapter helpers, including `test:pi` for Pi rules, discovery and CLI removal boundaries. Pi native fixtures cover preserved settings, concurrent edits/locks, project isolation, package filters, unchanged skill content, and original CLI copy/link lifecycle. For Pi configuration UI changes, also verify Settings-tab navigation, card switches and restart persistence in an isolated packaged application.

`test:native` runs current native fixtures after staging has finished; it does not stage resources concurrently. Legacy test commands have been removed. Builds, helper tests and native fixtures do not replace a network update or a complete desktop lifecycle test.

`test:hermes` checks project isolation/trust, precedence, Hub path identity, YAML preservation and stale edits. Hermes native fixtures additionally execute original CLI copy/link add/remove and native configuration writes in isolated HOME. For Hermes settings changes, verify dirty navigation/close guards, card enable/preload state and restart persistence in an isolated packaged app. Do not run Hermes discovery commands that initialize Hub state for a read-only inventory check; offline qualification is not a runtime scan or session-loading guarantee.

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

After staging, the deterministic suites are `pnpm test:frontend-contracts` and the native `--lib` suite. The opt-in original Pi package fixture requires `SKILLS_SPACE_PI_TEST_INSTALL` pointing to an existing original Pi 1.3.0 package root; invoke native test `original_pi_package_update` with `--ignored --test-threads=1`. `node --test scripts/pi-package.test.mjs` uses the same explicit variable for its original Pi/npm fixture. This test starts a loopback-only registry; all installs, metadata patches, dependencies and installation journals use a temporary HOME. Its version checks assert no package-archive downloads or journal writes; explicitly confirmed updates remain available; automatic copy propagation retains local changes and field recovery preserves separately changed invocation values. Whole-package backups and independent npm source-archive caches are retired by the simplified contract in spec 0006. It is skipped when no original installation was explicitly selected. A sandbox blocking loopback servers is an environment failure; rerun the unchanged fixture with the permitted local networking scope.

Packaged desktop acceptance reuses one shared QA app with a separate **compiled** identifier and unique window title, isolated HOME, global/project roots and Pi settings. Rebuild that same QA product in place when source or packaging changes require it; preserve the normal App bundle. Changing only Info.plist does not isolate Tauri's compiled configuration identity. Keep the allowlisted GUI launch process alive in its foreground session, bind automation to that live instance, and confirm the same PID and fixture paths after binding; stop it after acceptance. Remove redundant QA app copies while retaining reusable datasets and evidence. The current local fixture entry is `.scratch/directory-actions-qa/README.md`; if unavailable, inspect existing local fixtures before preparing a replacement. Verify native-rule migration, explicit false/default, original package update review, retained local edits during automatic propagation, process restart and original Pi `/skill:name` expansion with a local simulated response stream. Never use real Agent credentials or a live model merely to verify invocation semantics.

### Codex native qualification

Run `pnpm test:upstream` for Codex canonical-path selection, native ownership and Agent-context boundaries. After staging, the opt-in original CLI fixture is:

```sh
SKILLS_SPACE_CODEX_TEST_BINARY=/absolute/path/to/codex cargo test --offline --manifest-path src-tauri/Cargo.toml --lib upstream::codex::tests::native_config_and_local_plugin_round_trip -- --ignored --nocapture --test-threads=1
```

It uses a temporary HOME, no model requests, and covers duplicate names, path/name rule ordering, native single-write differences, batch deduplication, semantic configuration conflicts, project aliases, content preservation and local plugin install/disable/enable/remove including dotted IDs. Codex UI changes additionally require isolated packaged-app checks for switches, batch selection, whole-plugin confirmation, custom CODEX_HOME and restart persistence. Never use the user's installed plugins as mutation fixtures.

## Windows path boundaries

Rust paths serialized to Node helpers, the upstream CLI or inventory records must use the same canonical spelling as the receiving runtime. Use `dunce::canonicalize` at those boundaries to handle Windows verbatim prefixes and short-name aliases; it is already present in the locked dependency graph. Keep real directory containment, symlink and shared-ownership checks. Pure Rust identity comparisons do not require broad replacement. Test Git file sources must be constructed with `reqwest::Url::from_file_path`, not `file://` plus `Path::display`, because backslashes are escapes in Git configuration.
