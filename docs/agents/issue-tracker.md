# Local implementation tracking

Status: Active guidance. Reviewed 2026-10-13.

Use local Markdown tickets only when an approved implementation needs multiple dependent tasks or durable handoff. A small fix or documentation edit can be completed directly; tickets, `ready-for-agent` labels and agent delegation are not mandatory workflow steps.

- Accepted product requirements belong in `docs/specs/`; architecture decisions belong in `docs/adr/`.
- When needed, create numbered tickets under `.scratch/<feature-slug>/issues/`, with scope, dependencies, progress and verification evidence. These are local working files, intentionally ignored by Git; durable requirements and delivery evidence belong in versioned documents.
- Tickets must follow the owning active spec and cannot introduce unapproved product scope.
- Do not create or modify GitHub issues solely to track local implementation planning. External issue changes require user authorization.

See [the document index](../README.md) for current contracts and [CLAUDE.md](../../CLAUDE.md) for the ordinary workflow. Tracking work does not authorize invoking skills or sub-agents.
