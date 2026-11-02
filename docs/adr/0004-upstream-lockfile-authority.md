# ADR 0004: Upstream lockfile authority

- Status: Accepted principle; revised for [ADR 0005](0005-use-unmodified-upstream-cli.md)
- Reviewed: 2026-10-13

## Current decision

The original upstream CLI owns its installation, update, removal and lockfile writes. Skills Space reads applicable upstream lockfiles for recorded source/provenance and observes actual filesystem state for inventory and result verification. It must not create a competing deployment database.

A lock record is not proof that a directory still exists or that an Agent is installed or has loaded a skill. Manual changes, unknown sources and shared directories require read-only observation; uncertain results remain uncertain. See [CONTEXT.md](../../CONTEXT.md) and [spec 0003](../specs/0003-upstream-aligned-refactoring.md).

## Consequences

CLI operations performed outside the GUI are observed on refresh. The desktop must preserve unknown-source records rather than invent provenance or silently repair lockfiles. Partial failures do not authorize automatic rollback or retry.

## Historical decision wording — superseded

The earlier wording assigned structured provenance and update plans to a Managed CLI, called the lockfile authoritative Deployment State, and required Source Skill Deployment / Deployment Drift planning. That managed protocol and terminology are retired under ADR 0005. Only upstream ownership and the prohibition on a second deployment ledger remain applicable.
