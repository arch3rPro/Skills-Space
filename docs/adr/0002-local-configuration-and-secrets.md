# ADR 0002: Persist non-sensitive configuration locally and keep secrets in OS storage

- **Status:** Partially retained; historical scope superseded by [spec 0003](../specs/0003-upstream-aligned-refactoring.md)
- **Status reviewed:** 2026-10-13
- **Date:** 2026-07-28

## Current applicability

The retained principles are local non-sensitive preferences, explicitly registered project directories, and separation of secret material from ordinary configuration. [AGENTS.md](../../AGENTS.md) defines the current security constraints. The active preferences implementation is `src-tauri/src/preferences.rs`: `preferences-v2.json` stores theme, language, projects and Agent display preferences.

Server profiles, host trust, cached snapshots, 90-day operation history and shareable manifests below are historical proposals. They are not current-release requirements or claims of implementation. Remote functionality needs a separately accepted spec and real-host/SSH-fixture verification. This ADR does not establish that OS credential storage is already integrated.

## Historical context

Skills Space is initially a personal and small-team desktop tool. It must retain server profiles, explicit project directories, user preferences, cached inventory, and a limited operation history without treating the desktop app as a credential vault or requiring a cloud service.

SSH private keys, passphrases, access tokens, and changed host keys have materially different security properties from normal application settings. Storing them beside profiles or in a Git-shareable file would create an unacceptable disclosure path.

## Historical decision

Skills Space will use:

- a versioned local JSON configuration for non-sensitive server profiles, project directories, theme preference, snapshots, and operation history;
- operating-system credential storage for secret material;
- protected references to a selected private-key file rather than a copied private key;
- explicit confirmation of a server's initial SSH host-key fingerprint, with changed trusted keys blocking connection;
- 90 days of non-sensitive operation history;
- a Git-shareable `skills-space.manifest.json` for non-sensitive environment metadata and baseline references. Imported manifests require each user to bind local credentials separately.

A server profile includes only the SSH connection metadata, labels, explicit project directories, and secret references. Inventory is limited to the SSH user's global scope and those explicit directories.

## Historical consequences

### Positive

- A team can review and share environment intent without sharing credentials.
- Sensitive material stays under platform credential protections and user-controlled key-file access.
- Application startup can display cached snapshots without connecting to every server.
- Explicit project scopes prevent surprising or broad filesystem scans.

### Negative

- Credential bindings are local to a person and must be recreated after importing a manifest on a new machine.
- The initial JSON persistence model needs schema migrations and retention cleanup.
- Users must explicitly maintain project-directory lists when their server layout changes.
- The application must provide clear stale-snapshot and missing-credential states.

## Rejected alternatives

- **Plain-text configuration containing secrets:** unsafe and incompatible with shared manifests.
- **Application-owned copies of private keys:** expands the application secret boundary unnecessarily.
- **Cloud account synchronization:** introduces accounts, backend security, access control, and service operations beyond the initial scope.
- **Automatic server-wide project discovery:** slow, unpredictable, and likely to cross ownership or permission boundaries.
