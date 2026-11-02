# Codex-inspired design baseline rollout

Status: User approved the inventory/detail/dialog sample and authorized project-wide promotion on 2026-10-23. Shared styling and page composition are implemented. Representative packaged-app checks passed and the rollout was committed in `8636129`. The recorded complete frontend run had DSH fixture failures; later desktop-reader and diagnostic fixes in `6021d66` passed targeted checks but do not constitute a new complete-suite pass.

## Scope and invariants

Apply the approved visual language to the existing store, skill inventories, global/project Agent pages, skill/plugin details, marketplace management, settings, forms, menus, tooltips, notifications and dialogs. Keep navigation, fields, action eligibility, busy/disabled conditions, draft guards, task steps, error handling, native commands and lifecycle logic unchanged.

Existing data, Agent brands and explicit user appearance selections are preserved. Codex is a new local palette; new/missing appearance values default to Codex and the system font. Other palettes and font/size/mode selectors remain available. Shared geometry and elevation are independent of imported palette colors. This changes appearance defaults, not the preference schema or installation behavior.

## Implementation

- `src/lib/theme-presets.json`: additive Codex palette matching the approved neutral light/dark sample.
- `src/lib/appearance.ts` and native appearance validation/defaults: select/apply/persist the new palette, retain explicit saved choices, and leave shared geometry/elevation in CSS.
- `src/components/ui/`: centralized pill actions/navigation, input surfaces/focus, quiet cards, menu elevation, blue/accent switches, and rounded dialog surfaces. Radix interfaces and behavioral props are retained.
- `src/components/modal.tsx`: shared padding and same-surface header/actions; one body scroll region and existing close/pending/focus behavior.
- `src/index.css`, `src/App.tsx` and existing page owners: common wide inventory/store measure, narrower settings/details, metadata grouping, readable Markdown and matched inventory/loading spacing.
- `docs/design/ui-system.md`: active design authority. The standalone `design-preview.html` remains a reference with in-memory sample data, not a production navigation entry.

No new runtime dependency, lifecycle backend or generic UI framework is introduced. No commit or push is included.

## Acceptance and evidence

Verified 2026-10-23:

- `pnpm build`: passed, including strict TypeScript and production frontend bundling. The existing large-chunk advisory remains.
- `CI=false pnpm tauri build --debug --bundles app`: passed, including frontend rebuild, Rust compilation and the macOS debug app bundle. The final package contains the updated theme attribution.
- `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib preferences::tests -- --test-threads=1`: all 3 appearance/default/round-trip/validation tests passed.
- `pnpm test:frontend-contracts`: stopped at DSH configuration fixtures, with 11 failures in `scripts/dsh-skills.test.mjs`. The failing assertions concern missing configuration contexts/entries (`preset`, `key`, `editable`, and related fields); those inspection/preparation implementations were not changed by this rollout. This is a failed check, not a passing regression baseline, and was not fixed by changing expectations.
- Remaining chain entries were run separately: `pnpm test:hermes` (7 helper and 9 script cases) and `pnpm test:overlays` (1 case) passed. Across the executed frontend suites, 188 cases passed, 11 DSH cases failed and 2 opt-in Pi cases were skipped.
- A per-turn AST comparison of 7 page/flow owners (`App`, Modal, AgentPicker, scope sidebar, Codex inventory/plugin/marketplace pages) is identical after removing `className` attributes. All eight existing palette objects are exactly unchanged. These static checks support the functional scope boundary; they do not replace lifecycle testing.
- `git diff --check` and local design-document reference checks passed.

Actual native review used a separately identified copy of the debug app with an isolated HOME, project and Agent configuration. The pinned original CLI installed only local fixture skills. No user skill, credential, installed application or real Agent configuration was modified.

Observed surfaces: three-column dark inventory, skill detail/Markdown/code, global Agent inventory, project empty inventory, Agent settings, appearance settings, light 18px inventory, Claude palette switching and return to Codex, selection menu, long Agent selection in the sync Modal, short uninstall review (cancelled), and project editing Modal (cancelled). Window narrowing produced a two-column grid and secondary-label compaction while retaining primary actions. Short confirmation initially focused Cancel; Escape closed both confirmation and task dialogs. Existing close/focus handlers were retained without behavioral changes.

Appearance persistence was observed after quitting and relaunching the final app copy: Codex, light mode, system font and 18px remained selected. Local screenshots and logs are under `.scratch/design-rollout/`; the approved sample's earlier browser screenshots remain separate evidence.

## Remaining limits and delivery

All Agent/plugin conditional and error states, every palette in native rendering, every window size and complete install/update/uninstall execution were not re-exercised. The scope changes styling, not lifecycle behavior; no claim is made that the DSH failures or every pre-existing UI deviation are resolved. At the rollout checkpoint no Git commit or push had been created; the visual/palette/documentation unit was subsequently committed in `8636129`. Later scoped UI and verification changes are recorded in the owning specs. No project-wide acceptance is inferred from commit status.


## General settings layout refinement (2026-10-28)

The requested General settings cleanup uses four consistently titled Cards: Skill installation, Runtime, Directory diagnostics and Versions. Page spacing follows Agent settings. Detection/update actions sit in CardAction; Node selection remains beside its runtime details, with automatic-detection recovery available for an explicit selection. Runtime help moves to the existing HelpPopover and long paths use OverflowText with HOME abbreviation. Labels and version descriptions use the shared Field components. Diagnostics display their status in the Card header and render result content only when issues or failures exist, without decorative dividers. Existing preference writes, Node discovery/download, directory checks and version/download actions retain their contracts.

Verification: existing Node download-feedback regression (1/1), directory-diagnostics helper regressions (2/2), `pnpm build`, normal debug App build and `git diff --check` passed. No implementation-mirroring styling tests were added.

Rendered review: actual React/Radix components with final build CSS passed light/default, dark/English/18px narrow-width, diagnostic issue and failed-scope layouts in an isolated browser fixture (only Tauri boundaries mocked); no horizontal overflow or control overlap was observed. Native verification used a separately built, signed App with unique bundle ID `com.skills-space.general-layout-qa`, executable `skills-space-general-layout-qa` and isolated HOME. Light/default native screenshots confirmed all four Cards and loaded Node/version values. Dark/English/18px native screenshots at 960×640 confirmed installation and runtime layouts and the diagnosis heading; scrolling did not reach the diagnosis body/Versions, so those native narrow-window regions remain unobserved despite corresponding browser coverage. Evidence: `/tmp/general-settings-layout-review/` PNGs. The temporary server and QA App were stopped; isolated preferences were restored byte-for-byte. Existing personal App processes and settings were retained.


### Runtime field correction after rejected layouts (2026-10-29)

The user rejected both the earlier superficial four-Card cleanup and the subsequent unaccepted flat category-column layout. The actual problem was overloaded Node information/actions; the category-column redesign violated the request to reuse the existing settings language. The unaccepted flat page changes were withdrawn, retaining the prior settings structure. The user's explicit correction uses the Directory diagnostics composition exactly: CardHeader containing CardTitle (Runtime), CardDescription and right-aligned CardAction, with no secondary field title or separate CardContent. The description is `Node · version · path` (HOME abbreviated for display). Detect again is a visible button; no action menu or runtime-policy help remains. Existing file selection and conditional automatic-detection reset remain available as direct actions. Normal settings structure is preserved, with no category-column redesign. Pending/download/error states and native commands retain their behavior.

For this small follow-up the user explicitly declined subagent UI review. The main agent ran the existing focused component/feedback tests (2/2, no skips), `pnpm build` and `git diff --check`; all passed. The tests verify the exact runtime description, direct detection, selection/cancellation, conditional reset, and pending/disabled behavior. The normal debug App build passed, reusing the already validated/staged frontend with its duplicate before-build hook disabled. No additional subagents, QA builds or visual automation were used for this follow-up.
