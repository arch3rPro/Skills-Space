# Skills Space — Project Instructions

## Scope and architecture

Skills Space is a Tauri desktop client for personal skill management across Agents, using the original upstream `skills` CLI. This release supports local global/project scopes; remote execution needs a separately approved design.

- UI state and presentation belong in `src/`; native OS, filesystem, process and credential capabilities belong in `src-tauri/`.
- Bundle the pinned, unmodified upstream CLI for lifecycle mutations. Resolve a compatible system Node (minimum 22.20.0), honor an explicit executable selection, and download the pinned official Node only when no compatible selected/system runtime is available; keep it in application data, not the app bundle. Rust adapts structured results and performs necessary read-only inspection; terminal prose is diagnostic data, not authoritative state. Leave user-installed commands untouched; maintain no separate CLI or fork.
- Store secrets only in the OS credential store and protected references in configuration.
- Develop on `main` in the independent `arch3rPro/Skills-Space` repository. Review upstream changes through the pinned published package or a separate read-only checkout; do not import upstream Git history or tags into this repository.

## Workflow and presentation

- **No overengineering:** implement the smallest complete solution for the current authorized need and reuse existing flows. Do not add abstractions, storage, verification gates, UI or fallback workflows for hypothetical risks. Missing auxiliary records must not permanently block a core action; distinguish confirmed conflicts from unknown state and use the existing confirmation flow when uncertainty requires a user decision.

Follow [CLAUDE.md](CLAUDE.md), the shared development process. UI work also follows the required design skills in [skill usage](docs/agents/skill-usage.md); other methods are user-selected. The post-implementation delegation below is selected for this project; other multi-agent workflows and TDD require explicit selection or a selected skill's applicable requirement.

Preserve layout, themes, cards, sidebar and Agent brand icons during functional refactors; UI changes require an authorized UI scope. Display HOME as `~`, retaining absolute paths for execution. Product copy describes user actions, states and impact; architecture and future plans belong in documentation.

**DSH companion plugin versions:** Increment the patch version for small fixes (for example, `0.1.0` to `0.1.1`). Use a minor version increment only for a substantive feature or compatibility change. UI-only changes do not require a plugin version bump.

**Reuse before addition:** For an existing user task, reuse the project's shared components, variants, styles and interaction patterns, including those used by other Agents. Do not add Agent-specific components, styles or duplicate controls unless an accepted requirement cannot be served by the existing composition. Identify that concrete gap before adding; put necessary reusable differences in the shared component rather than a page-specific skin.

Before adding UI, changing layout, controls, copy, themes or visual states, read [UI design baseline](docs/design/ui-system.md). Reuse its component and information hierarchy rules; complete its consistency review before handoff. Existing deviations are repair targets, not patterns to copy.

**Design acceptance gate:** Substantial feature-module development and page development must pass acceptance against the UI design baseline, covering page responsibilities, information hierarchy, layout, controls, dialogs and copy in the affected states. Any baseline violation fails acceptance and must be corrected before the work is marked complete. Passing builds or functional tests does not establish design acceptance.

## Post-implementation subagents

After the main agent finishes a coherent code change, delegate verification before final delivery:

- [test_coverage](.codex/agents/test-coverage.toml): review behavioral coverage, add necessary regression tests and run the applicable project checks. Documentation-only changes skip this agent.
- [ui_reviewer](.codex/agents/ui-reviewer.toml): review affected UI against the design baseline and applicable review skill, including the size-based visual verification. Changes with no UI impact skip this agent with a stated reason.

Give each agent the accepted requirements, this task's exact changed files/diff (including relevant untracked files), affected flows and existing verification evidence. Preserve unrelated dirty work. These agents run after implementation, not as development workers; delegated agents return their assigned result without recursively invoking this workflow. The test agent owns builds/staging and test execution; prepare the app/fixture before the UI agent interacts with it. Static UI review may run alongside tests when it does not share mutable resources. The main agent waits for both applicable results, fixes production code, requests targeted rechecks after relevant fixes and reports remaining gaps. Reuse valid evidence; final acceptance and delivery remain the main agent's responsibility.

## Task-based acceptance

Apply the global independent-quality-review rules to each handoff. Before substantial UI implementation, record the concrete user tasks and expected results in the affected existing spec. Review the whole affected task, including configuration identity, action scope, understandable choices, defaults, dependent enabled/disabled states, save/recovery feedback and error recovery. Use the design baseline to evaluate those tasks, not merely component selection or pixel alignment.

The two post-implementation reviewers independently inspect requirements and behavior; the parent must not narrow their assignment to confirming its own fixes. Each reviewer returns one consolidated actionable finding list, including related defects in the affected flow. The parent resolves findings together before the next build/recheck, with immediate handling of critical defects. Recheck invalidated evidence only. An unresolved material usability or functional defect fails task acceptance; document a blocked or unverified state precisely instead of declaring overall completion. Documentation-only instruction changes require reference/consistency checks, not runtime builds or reviewer delegation.

## Required checks

Resolve versions and scripts from manifests and lockfiles. Retain TypeScript strictness and Rust compiler checks; resolve type errors without unchecked casts. Apply size-based application verification in [development guidance](docs/agents/development.md); organize local code commits by completed, verified change units as described in [CLAUDE.md](CLAUDE.md).

**Verification scope:** Select the lightweight or automated branch before verification and include that choice in reviewer handoffs. Small local fixes use static review, targeted checks and ordinary App inspection; reviewer delegation does not authorize UI automation. Follow the [automation limits and stop conditions](docs/agents/development.md#verification-scope-and-automation-limits), including the bounded recovery for tool failures, one build owner and reuse of valid evidence. Expand only for a named unresolved behavior; stop when the selected checks are satisfied.

- Frontend changes: `pnpm build`.
- Tauri, Rust or application configuration changes: `CI=false pnpm tauri build --debug --bundles app`.
- Execution, packaging, verification, desktop interaction or persistence changes: first read [development guidance](docs/agents/development.md) for relevant checks, isolated mutation fixtures, sequential staging/test ordering and observable verification.
- Documentation-only edits: check references and instruction consistency; runtime builds are unnecessary.

For Tauri commands, override inherited `CI=1` with `CI=false` (including `CI=false pnpm tauri dev`); its CI flag accepts only booleans.

## Read by task

- Lifecycle behavior or GUI scope: [spec 0003](docs/specs/0003-upstream-aligned-refactoring.md), before changing it.
- CLI ownership, execution or locks: [ADR 0005](docs/adr/0005-use-unmodified-upstream-cli.md), before changing them. Retired managed-CLI modules impose no compatibility contract.
- Capability scheduling: [plan 0004](docs/specs/0004-upstream-capability-completion-plan.md); structural improvements: [plan 0005](docs/specs/0005-project-optimization-plan.md), supporting that capability plan.
- Document authority/status: [index](docs/README.md); domain terminology: [CONTEXT.md](CONTEXT.md).
- Authorized remote development: [development guidance](docs/agents/development.md), including confirmation and real-host/SSH-fixture verification.
