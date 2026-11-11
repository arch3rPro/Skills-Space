# Coding workflow

Shared by coding agents, with or without selected skills. `AGENTS.md` owns project constraints, skill selection and required checks.

## 1. Establish

Identify the user's observable outcome and the smallest complete task that delivers it. Read affected files, callers and applicable current contracts; reuse unchanged context instead of repeatedly reopening the same documents. Check third-party interfaces when their behavior is unknown or has changed. Give one short work update for multi-step work, then implement. Resolve routine choices from project evidence without adding approval or planning gates.

Completion: scope, contracts and verification path are explicit. For UI work, identify the existing reference surface, shared components and any missing primitive using the design baseline linked from `AGENTS.md` before editing.

## 2. Implement

Read and announce applicable skills once before using them. For a bug, use the reported failure or establish a concrete failure signal; do not repeatedly reproduce an already established defect. Complete the accepted user path and handle failures actually reachable from it. Add no speculative defensive mechanisms, unrelated refactors or generic recovery flows.

Match existing patterns, preserve unrelated work and explain material architectural decisions before implementation. Prefer existing dependencies; justify each new runtime dependency's necessity, maintenance and cost at delivery.

Completion: accepted behavior and failure paths are implemented; every changed file serves the task.

## 3. Verify

Apply the conditional subagent gate in AGENTS.md; routine work stays with the main agent. Before the first check, establish the fixed checklist required by [AGENTS.md](AGENTS.md#quality-review-and-verification-limits) and [development guidance](docs/agents/development.md#verification-scope-and-automation-limits). Reuse valid evidence and run only selected checks plus required builds. Reviewers may identify more defects, but may not start extra tests or application flows themselves. The parent records the concrete reason before revising execution scope.

Check the completed batch against the user's actual task and established failure signal. Run the affected build/type checks and the smallest relevant existing tests. Add a regression test only for a demonstrated bug or meaningful changed business rule; do not add tests that mirror markup or implementation details. Broaden verification only for a named unresolved behavior or observed failure. Reuse passing results under unchanged conditions. Independent review is optional under `AGENTS.md`; do not wait on default reviewer rounds or transfer build ownership between agents.

Completion: selected required checks have results, material defects are resolved, and actual observations are distinguished from static or remaining manual checks. Stop verification at this boundary; do not add tests, experiments or a further review round after it merely to increase confidence.

## 4. Deliver

Deliver the usable result in the authorized target, including necessary build/install/update steps. Report what the user can now do, the actual artifact or entry point, and material unfinished work; distinguish implemented, observed and planned capabilities. Do not call a running-product task complete with source edits or a build alone. Update only existing documents whose requirements or claims changed, without generating routine progress reports or duplicate acceptance records.

Requirements belong in `docs/specs/`. Read `docs/agents/issue-tracker.md` for approved multi-task work needing persistent local tracking; simple edits need no tickets. Read `docs/agents/domain.md` for terminology or accepted architectural decisions. After completing and verifying a coherent unit of work, prepare its diff and intended commit message(s). Before creating any Git commit, present the change scope and commit plan to the user and obtain explicit confirmation for that commit or batch. Confirmation applies only to the reviewed batch; subsequent changes require new confirmation. Combine related styling and small adjustments into one commit; split substantial module or workflow changes into independently reviewable, verified commits. Inspect the staged diff and include only the current task’s changes, preserving unrelated work. Use descriptive commit messages and report commit status at handoff. Push only when the user separately authorizes it.
