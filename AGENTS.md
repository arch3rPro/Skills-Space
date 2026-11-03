# Skills Space — Project Instructions

## Scope and architecture

Skills Space is a Tauri desktop client for personal skill management across Agents, using the original upstream `skills` CLI. This release supports local global/project scopes; remote execution needs a separately approved design.

- UI state and presentation belong in `src/`; native OS, filesystem, process and credential capabilities belong in `src-tauri/`.
- Bundle the pinned, unmodified upstream CLI for lifecycle mutations. Resolve a compatible system Node (minimum 22.20.0), honor an explicit executable selection, and download the pinned official Node only when no compatible selected/system runtime is available; keep it in application data, not the app bundle. Rust adapts structured results and performs necessary read-only inspection; terminal prose is diagnostic data, not authoritative state. Leave user-installed commands untouched; maintain no separate CLI or fork.
- Store secrets only in the OS credential store and protected references in configuration.
- Develop on `main` in the independent `arch3rPro/Skills-Space` repository. Review upstream changes through the pinned published package or a separate read-only checkout; do not import upstream Git history or tags into this repository.

## Workflow and presentation

**Chinese terminology:** Describe test fixtures as 测试数据, 模拟配置 or 隔离测试环境 according to their actual role. Describe assertions as 检查项, 校验 or 预期结果 according to context. Keep code/API identifiers in their original language. Apply natural Chinese to user communication, product copy and new documentation; do not use literal translations of these technical terms.

- **No overengineering:** implement the smallest complete solution for the current authorized need and reuse existing flows. Do not add abstractions, storage, verification gates, UI or fallback workflows for hypothetical risks. Missing auxiliary records must not permanently block a core action; distinguish confirmed conflicts from unknown state and use the existing confirmation flow when uncertainty requires a user decision.

Follow [CLAUDE.md](CLAUDE.md), the shared development process. UI work also follows the required design skills in [skill usage](docs/agents/skill-usage.md); other methods are user-selected. The post-implementation delegation below is selected for this project; other multi-agent workflows and TDD require explicit selection or a selected skill's applicable requirement.

Preserve layout, themes, cards, sidebar and Agent brand icons during functional refactors; UI changes require an authorized UI scope. Display HOME as `~`, retaining absolute paths for execution. Product copy describes user actions, states and impact; architecture and future plans belong in documentation.

**DSH companion plugin versions:** Increment the patch version for small fixes (for example, `0.1.0` to `0.1.1`). Use a minor version increment only for a substantive feature or compatibility change. UI-only changes do not require a plugin version bump.

**Reuse before addition:** For an existing user task, reuse the project's shared components, variants, styles and interaction patterns, including those used by other Agents. Do not add Agent-specific components, styles or duplicate controls unless an accepted requirement cannot be served by the existing composition. Identify that concrete gap before adding; put necessary reusable differences in the shared component rather than a page-specific skin.

Before adding UI, changing layout, controls, copy, themes or visual states, read [UI design baseline](docs/design/ui-system.md). Reuse its component and information hierarchy rules; complete its consistency review before handoff. Existing deviations are repair targets, not patterns to copy.

**Design acceptance gate:** Substantial feature-module development and page development must pass acceptance against the UI design baseline, covering page responsibilities, information hierarchy, layout, controls, dialogs and copy in the affected states. Any baseline violation fails acceptance and must be corrected before the work is marked complete. Passing builds or functional tests does not establish design acceptance.

## Quality review and verification limits

Before implementation, identify the user task, action scope and observable result; substantial UI work records these in the affected existing spec. Review usability and behavior against the design baseline, not just component usage or successful compilation.

**Mandatory execution limits:** Before running checks, fix the minimal verification checklist and stop condition under [verification scope and automation limits](docs/agents/development.md#verification-scope-and-automation-limits). The parent and reviewers MUST NOT expand it for reassurance, test counts, speculative risks or handoff completeness. New execution requires a concrete uncovered requirement, observed defect or invalidated result, recorded by the parent before it runs. This is an execution boundary, not an additional user-approval gate. Keep required compiler/build checks and checks for material defects.

**Subagent use is conditional, not a required step after every edit.** The main agent executes and verifies routine work directly. Unless the user explicitly requests delegation, MUST NOT spawn or wake a subagent solely for packaging, running a command, committing/pushing, status reporting, documentation edits, small UI/copy/icon/event fixes or localized read-only display. An idle agent or available role is not a reason to delegate.

For substantial feature/module work or a concrete high-risk change with an independently reviewable concern (such as cross-Agent writes, content lifecycle or recovery), delegate only the relevant specialist: [test_coverage](.codex/agents/test-coverage.toml) for behavior, [ui_reviewer](.codex/agents/ui-reviewer.toml) for usability. Before delegation, name the bounded independent question and why its benefit exceeds coordination cost. Do not automatically dispatch both roles or split a simple task into multiple agents. Explicit delegation never authorizes extra tests. Reviewers return their result without recursively delegating. Documentation-only work requires reference/consistency checks, no runtime build.

Handoffs include accepted requirements, the exact task diff including relevant untracked files, affected flows, existing evidence and the fixed checklist: named checks/commands, expected duration and timeout, one execution/build owner, required artifact and stop condition. Reviewers independently challenge requirements and inspect the whole affected task; the checklist limits execution, not defect reporting or relevant source inspection. Missing execution scope must be resolved with the parent before running checks; continue static review meanwhile.

When review is delegated, the assigned test reviewer owns its selected tests, staging and build; the UI reviewer owns any selected application observation. Otherwise the main agent owns execution. A later packaging-only request is executed directly by the main agent, not routed back through a reviewer. Each flow is executed once. Consolidate both reviewers' static findings and coherent repairs before packaging; prepare one needed application artifact, not both normal and QA apps by default. The parent owns final acceptance, rechecks only invalidated evidence and stops when the checklist is satisfied. An unresolved material defect fails acceptance; blocked or unobserved behavior stays explicitly unverified. Do not weaken tests, skip required checks or use passing counts/builds to excuse an unusable task.

## Required checks

Native verification starts with the affected checks. `pnpm test:native` is the default critical suite, not a mandatory run for every Rust edit; `pnpm test:native:full` requires a concrete broader coverage need. Test selection, additions, reuse and prohibitions are defined once in the development guidance linked above.

For cross-platform path, process or test changes, follow [cross-platform failure review](docs/agents/development.md#cross-platform-failure-review) before dispatching installer builds. Record compiler and native-test evidence for each affected platform; results from one OS cover that OS only.

Resolve versions and scripts from manifests and lockfiles. Retain TypeScript strictness and Rust compiler checks; resolve type errors without unchecked casts. Apply size-based application verification in [development guidance](docs/agents/development.md); organize local code commits by completed, verified change units as described in [CLAUDE.md](CLAUDE.md).

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
