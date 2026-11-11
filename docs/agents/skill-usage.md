# Skill usage

Status: Active guidance. Updated 2026-10-15.

## Selection and scope

Use the ordinary workflow in `CLAUDE.md` unless a method is selected. UI tasks also require the applicable project skills below; this does not activate TDD, multi-agent work or a complete plugin workflow. Apply the targeted checks in `AGENTS.md` and reuse valid prior results. Loading a skill does not require new tests, tickets, review agents or an expanded verification matrix.

| Trigger | Required project-local skill | Purpose |
| --- | --- | --- |
| Add/change pages, components, layout, controls, themes or visual states | [shadcn](../../.agents/skills/shadcn/SKILL.md) | Inspect project configuration, installed components and actual APIs; retrieve applicable component docs before coding. |
| Write/change/refactor React code | [vercel-react-best-practices](../../.agents/skills/vercel-react-best-practices/SKILL.md) | Apply relevant rendering, state and performance rules without refactoring unrelated code. |
| User requests UI/UX, accessibility or design-consistency review | [web-design-guidelines](../../.agents/skills/web-design-guidelines/SKILL.md) | Retrieve current guidelines, review the affected scope and report concrete locations and verification limits. |

Read the [UI design baseline](../design/ui-system.md) first. It owns product simplicity, information hierarchy and local design choices; skills supply component/API, implementation and review methods. Use only the rows triggered by the task. A documentation-only component inventory does not itself require a React implementation workflow or prove a rendered UI review.

mattpocock-skills methods are optional. Independent review and multi-agent work require an explicit user request for the current task under `AGENTS.md`. TDD requires explicit method selection. Availability, automatic skill routing or a document reference does not activate these workflows.

## Applying a skill

1. Identify the task and deliverable; read the applicable `SKILL.md` once and announce its purpose. Reuse its instructions and verified API lookups while they remain valid; refresh only changed or missing information. Resolve a stale path before claiming use.
2. Follow its actual steps and conditional references. Reading a name or finding a URL is not completing the workflow.
3. Deliver the required result and evidence; distinguish blocked, unverified and completed work.
4. Honor user steering. A skill never authorizes redesign, additional functionality or real-data mutations beyond the accepted task.

Combine skills only when their responsibilities are distinct and applicable. Follow the delivery-first execution policy in `AGENTS.md`; skill loading alone never activates reviewer delegation, parallel agents or additional approval gates. Apply methods to the smallest complete user task.

## Optional methods

This table is selection guidance, not an invocation directive. Read the installed skill for its current procedure.

| Task | Optional method | Deliverable |
| --- | --- | --- |
| Clarify meaningful product/design decisions | `grilling` | Accepted decisions, constraints and remaining questions |
| Investigate upstream commands, APIs or lock behavior | `research` | Findings with primary-source evidence |
| Clarify domain meanings | `domain-modeling` | Consistent glossary and an ADR when warranted |
| Improve module boundaries | `codebase-design` | Clearer interface and focused verification |
| Diagnose difficult failures/regressions | `diagnosing-bugs` | Concrete failure signal, cause and verified repair |
| Explicitly requested test-first implementation | `tdd` | Meaningful red/green/refactor evidence |
| Explore an uncertain state model or interaction | `prototype` | A disposable experiment answering the design question |
| Review changes against a fixed revision | `code-review` | Standards and requirement findings |
| Maintain Agent instructions | `writing-for-agents` | Clear entry points, conditional references and completion criteria |
| Write a PR description | `pr` | Reviewer-oriented problem, behavior and validation |
| Guide steps only the human can perform | `wizard` | Human-executable setup steps |

`wizard` is not for work the agent can perform. Prototype code does not automatically become production implementation. Ordinary fixes can follow the normal evidence-based workflow without loading a full diagnosis framework.
