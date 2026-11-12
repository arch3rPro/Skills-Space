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

Follow [CLAUDE.md](CLAUDE.md), the shared development process. Completing the user's authorized task and delivering a usable result take priority over process activity. UI work follows the applicable design skills in [skill usage](docs/agents/skill-usage.md); loading a skill does not activate independent review, TDD or a multi-agent workflow. Apply the delivery-first rules below.

Preserve layout, themes, cards, sidebar and Agent brand icons during functional refactors; UI changes require an authorized UI scope. Display HOME as `~`, retaining absolute paths for execution. Product copy describes user actions, states and impact; architecture and future plans belong in documentation.

**DSH companion plugin versions:** Do not change the plugin version unless the user explicitly requests a version change. Functional changes, fixes, builds and QA deployments do not authorize a version bump. Keep QA artifacts distinguishable with content hashes in their filenames.

**DSH companion parity:** When changing or adding core skill behavior, inspect the corresponding DSH companion flow. If it applies there, update and verify both surfaces in the same change unit, reusing the highest practical shared implementation. Keep Tauri and DSH Host adapters separate. Record a specific requirement or Host constraint for any intentional difference; do not leave applicable companion behavior stale.

**DSH test environment:** The active clean target is `127.0.0.1:64590`, controlled with `pnpm dev:dsh:clean`; its HOME, DSH_HOME and dedicated browser live under `.scratch/dsh-clean-test`. `pnpm dev:dsh` still targets the retained legacy QA on `64580`. Keep these environments distinct.

**Reuse the existing user flow:** Before implementing a UI for a task the product already supports, identify the closest existing page and its source entry point. Name the steps and states that will use the same implementation and tie each proposed difference to an accepted requirement and a concrete gap. Reuse at the highest applicable level: page flow, layout, interaction and state handling, then shared components, variants and styles. A different Agent, data source or action set does not by itself justify a separate page or flow. Extend the existing implementation at the relevant boundary when it can serve both cases.

**Reuse acceptance:** Before delivery, trace the affected task from its actual entry point through the changed steps, including relevant loading, failure, recovery and return behavior. Cite the shared implementation and explain any required divergence. Shared primitives or similar appearance alone do not establish flow reuse. Treat an independently implemented equivalent flow without a requirement-backed reason as a material finding to resolve before acceptance. When UI review is delegated under the existing gate, include the reference entry point and accepted differences in the handoff.

Before adding UI, changing layout, controls, copy, themes or visual states, read [UI design baseline](docs/design/ui-system.md). Reuse its component and information hierarchy rules; complete its consistency review before handoff. Existing deviations are repair targets, not patterns to copy.

**Design acceptance gate:** Substantial feature-module development and page development must pass acceptance against the UI design baseline, covering page responsibilities, information hierarchy, layout, controls, dialogs and copy in the affected states. Any baseline violation fails acceptance and must be corrected before the work is marked complete. Passing builds or functional tests does not establish design acceptance.

## Quality review and verification limits

Before implementation, identify the user task, action scope and observable result; substantial UI work records these in the affected existing spec. Review usability and behavior against the design baseline, not just component usage or successful compilation.

**Mandatory execution limits:** Before running checks, fix the minimal verification checklist and stop condition under [verification scope and automation limits](docs/agents/development.md#verification-scope-and-automation-limits). The parent and reviewers MUST NOT expand it for reassurance, test counts, speculative risks or handoff completeness. New execution requires a concrete uncovered requirement, observed defect or invalidated result, recorded by the parent before it runs. This is an execution boundary, not an additional user-approval gate. Keep required compiler/build checks and checks for material defects.

**Subagent use is conditional, not a required step after every edit.** The main agent executes and verifies routine work directly. Unless the user explicitly requests delegation, MUST NOT spawn or wake a subagent solely for packaging, running a command, committing/pushing, status reporting, documentation edits, small UI/copy/icon/event fixes or localized read-only display. An idle agent or available role is not a reason to delegate.
## Delivery-first execution

- The main agent owns implementation, necessary checks, builds and delivery. Finish a coherent user task before moving to another one. For running applications, update the authorized target and provide the actual usable entry; source edits or a package alone do not complete a request for working behavior.
- Read the applicable current requirements and reference implementation once, resolve relevant superseded requirements, and reuse that context while it remains valid. Do not repeatedly reload unchanged documents, rediscover checked APIs or expand research after the implementation question is answered.
- Address related defects together, then build and inspect the affected flow as one batch. Rebuild or recheck only when a new change or observed failure invalidates the previous result. Do not alternate tiny edits with screenshots, full test runs or new review rounds.
- Implement protections for actual task requirements and demonstrated failures. Do not add defensive frameworks, speculative edge cases, generic recovery systems, extra confirmations or tests for hypothetical risks. Preserve existing data, ownership restrictions and required destructive-action confirmations.
- Independent review and subagents are optional, not a default handoff gate. Launch them only when the user explicitly requests review or parallel work for the current task. The available [test reviewer](.codex/agents/test-coverage.toml) and [UI reviewer](.codex/agents/ui-reviewer.toml) are role descriptions, not automatic requirements. When requested, collect one consolidated result per assigned scope; retain one build owner and continue independent delivery work instead of waiting idle. Reuse valid results rather than restarting the review process.
- Stop process expansion when the requested behavior works and the necessary checks pass. Report concrete output and material unfinished work; do not substitute activity logs, review counts or repeated assurances for delivery.

When the user requests independent review for a substantial feature or high-risk change, assign only the relevant specialist: [test_coverage](.codex/agents/test-coverage.toml) for behavior or [ui_reviewer](.codex/agents/ui-reviewer.toml) for usability. Name the bounded review question; do not dispatch both roles automatically or add tests because a reviewer is available. Documentation-only work needs reference and consistency checks, not runtime builds.

Handoffs include accepted requirements, the exact task diff including relevant untracked files, affected flows, existing evidence and the fixed checklist: named checks/commands, expected duration and timeout, one execution/build owner, required artifact and stop condition. Reviewers independently challenge requirements and inspect the whole affected task; the checklist limits execution, not defect reporting or relevant source inspection. Missing execution scope must be resolved with the parent before running checks; continue static review meanwhile.

When review is delegated, the assigned test reviewer owns its selected tests, staging and build; the UI reviewer owns any selected application observation. Otherwise the main agent owns execution. A later packaging-only request is executed directly by the main agent, not routed back through a reviewer. Each flow is executed once. Consolidate both reviewers' static findings and coherent repairs before packaging; prepare one needed application artifact, not both normal and QA apps by default. The parent owns final acceptance, rechecks only invalidated evidence and stops when the checklist is satisfied. An unresolved material defect fails acceptance; blocked or unobserved behavior stays explicitly unverified. Do not weaken tests, skip required checks or use passing counts/builds to excuse an unusable task.

## Required checks

Native verification starts with the affected checks. `pnpm test:native` is the default critical suite, not a mandatory run for every Rust edit; `pnpm test:native:full` requires a concrete broader coverage need. Test selection, additions, reuse and prohibitions are defined once in the development guidance linked above.

For cross-platform path, process or test changes, follow [cross-platform failure review](docs/agents/development.md#cross-platform-failure-review) before dispatching installer builds. Record compiler and native-test evidence for each affected platform; results from one OS cover that OS only.

Resolve versions and scripts from manifests and lockfiles. Retain TypeScript strictness and Rust compiler checks; resolve type errors without unchecked casts. Apply size-based application verification in [development guidance](docs/agents/development.md); organize local code commits by completed, verified change units as described in [CLAUDE.md](CLAUDE.md).

For substantial UI work, record the concrete user tasks and expected results in the affected existing spec, keeping this concise. Implement the whole requested flow, including configuration identity, action scope, understandable choices, defaults, dependent enabled/disabled states and recovery from actual failures. Apply the design baseline directly during implementation; a separate reviewer or a new acceptance report is not required.

Fix known material defects in the requested flow before claiming completion. Use the smallest checks that establish the changed behavior and preserve valid prior evidence. Unobserved behavior must be described honestly; it does not authorize an unlimited verification matrix. Documentation-only instruction changes need reference/consistency checks, not builds, browser interaction or reviewer delegation.

**Verification scope:** Default to targeted checks and one inspection of the affected user flow. Choose automation only when the user requests it or a concrete changed behavior cannot be established by a smaller check. Follow the [automation limits and stop conditions](docs/agents/development.md#verification-scope-and-automation-limits). Keep one build owner, reuse valid evidence and stop when the necessary checks are satisfied. Layout/copy changes do not need new tests that merely mirror their markup.

- Frontend changes: build the affected deliverable once. Use `pnpm build` for the main app; use the companion package's own build/prepack for companion-only changes. Shared API changes also need type checking of affected consumers. Do not build unrelated products.
- Tauri, Rust or application configuration changes: `CI=false pnpm tauri build --debug --bundles app`; its included frontend build replaces a separate `pnpm build`.
- Execution, packaging, verification, desktop interaction or persistence changes: first read [development guidance](docs/agents/development.md) for relevant checks, isolated mutation fixtures, sequential staging/test ordering and observable verification.
- Documentation-only edits: check references and instruction consistency; runtime builds are unnecessary.

For Tauri commands, override inherited `CI=1` with `CI=false` (including `CI=false pnpm tauri dev`); its CI flag accepts only booleans.

## Read by task

- Lifecycle behavior or GUI scope: [spec 0003](docs/specs/0003-upstream-aligned-refactoring.md), before changing it.
- CLI ownership, execution or locks: [ADR 0005](docs/adr/0005-use-unmodified-upstream-cli.md), before changing them. Retired managed-CLI modules impose no compatibility contract.
- Capability scheduling: [plan 0004](docs/specs/0004-upstream-capability-completion-plan.md); structural improvements: [plan 0005](docs/specs/0005-project-optimization-plan.md), supporting that capability plan.
- Document authority/status: [index](docs/README.md); domain terminology: [CONTEXT.md](CONTEXT.md).
- Authorized remote development: [development guidance](docs/agents/development.md), including confirmation and real-host/SSH-fixture verification.
