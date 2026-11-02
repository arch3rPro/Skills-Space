# Skill usage

Status: Active guidance. Updated 2026-10-15.

## Selection and scope

Use the ordinary workflow in `CLAUDE.md` unless a method is selected. UI tasks also require the applicable project skills below; this does not activate TDD, multi-agent work or a complete plugin workflow. Existing quality checks always apply. Scale verification to the change rather than requiring new tests, tickets or every skill for each small edit.

| Trigger | Required project-local skill | Purpose |
| --- | --- | --- |
| Add/change pages, components, layout, controls, themes or visual states | [shadcn](../../.agents/skills/shadcn/SKILL.md) | Inspect project configuration, installed components and actual APIs; retrieve applicable component docs before coding. |
| Write/change/refactor React code | [vercel-react-best-practices](../../.agents/skills/vercel-react-best-practices/SKILL.md) | Apply relevant rendering, state and performance rules without refactoring unrelated code. |
| User requests UI/UX, accessibility or design-consistency review | [web-design-guidelines](../../.agents/skills/web-design-guidelines/SKILL.md) | Retrieve current guidelines, review the affected scope and report concrete locations and verification limits. |

Read the [UI design baseline](../design/ui-system.md) first. It owns product simplicity, information hierarchy and local design choices; skills supply component/API, implementation and review methods. Use only the rows triggered by the task. A documentation-only component inventory does not itself require a React implementation workflow or prove a rendered UI review.

mattpocock-skills methods are optional. User selection or a selected skill's applicable requirement is needed for TDD and multi-agent workflows. Availability, keywords or a document reference alone do not authorize those methods.

## Applying a skill

1. Identify the task and deliverable; locate and read the current `SKILL.md`, then announce its purpose. If a path is stale, locate the current installation rather than claiming it was used.
2. Follow its actual steps and conditional references. Reading a name or finding a URL is not completing the workflow.
3. Deliver the required result and evidence; distinguish blocked, unverified and completed work.
4. Honor user steering. A skill never authorizes redesign, additional functionality or real-data mutations beyond the accepted task.

Combine skills only when their responsibilities are distinct and applicable. Follow explicit collaboration requirements of selected skills; otherwise do not start parallel agents merely because tools are available.

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
