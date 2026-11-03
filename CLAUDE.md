# Coding workflow

Shared by coding agents, with or without selected skills. `AGENTS.md` owns project constraints, skill selection and required checks.

## 1. Establish

Read affected files, callers and tests; follow `AGENTS.md` references for applicable contracts. Check third-party interfaces against pinned sources or authoritative documentation. For multi-step work, state the observable outcome, assumptions and a short plan. Resolve routine details from project evidence; clarify choices that materially change behavior.

Completion: scope, contracts and verification path are explicit. For UI work, identify the existing reference surface, shared components and any missing primitive using the design baseline linked from `AGENTS.md` before editing.

## 2. Implement

Read and announce selected skills before applying their relevant instructions within scope. For a bug, reproduce it or establish a concrete failure signal; identify environment gaps when reproduction is unavailable. For a feature, complete the accepted path, including failure and uncertain states.

Match existing patterns, preserve unrelated work and explain material architectural decisions before implementation. Prefer existing dependencies; justify each new runtime dependency's necessity, maintenance and cost at delivery.

Completion: accepted behavior and failure paths are implemented; every changed file serves the task.

## 3. Verify

Apply the conditional subagent gate in AGENTS.md; routine work stays with the main agent. Before the first check, establish the fixed checklist required by [AGENTS.md](AGENTS.md#quality-review-and-verification-limits) and [development guidance](docs/agents/development.md#verification-scope-and-automation-limits). Reuse valid evidence and run only selected checks plus required builds. Reviewers may identify more defects, but may not start extra tests or application flows themselves. The parent records the concrete reason before revising execution scope.

Completion: selected required checks have results, material defects are resolved, and actual observations are distinguished from static or remaining manual checks. Stop verification at this boundary; do not add tests, experiments or a further review round after it merely to increase confidence.

## 4. Deliver

Report changes, reasons, checks and gaps; distinguish implemented, verified and planned capabilities. Update affected existing plans to match actual implementation and verification, and only documents whose contracts or claims changed.

Requirements belong in `docs/specs/`. Read `docs/agents/issue-tracker.md` for approved multi-task work needing persistent local tracking; simple edits need no tickets. Read `docs/agents/domain.md` for terminology or accepted architectural decisions. After completing and verifying a coherent unit of work, prepare its diff and intended commit message(s). Before creating any Git commit, present the change scope and commit plan to the user and obtain explicit confirmation for that commit or batch. Confirmation applies only to the reviewed batch; subsequent changes require new confirmation. Combine related styling and small adjustments into one commit; split substantial module or workflow changes into independently reviewable, verified commits. Inspect the staged diff and include only the current task’s changes, preserving unrelated work. Use descriptive commit messages and report commit status at handoff. Push only when the user separately authorizes it.
