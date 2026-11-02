# Hermes skill inventory and upstream management

Status: Implemented read-only adapter; verification results are recorded below. Reviewed 2026-10-15. Runtime baseline: original skills@1.7.2, Node 22.20.0.

## Follow-up research (2026-10-17)

The [Hermes skill-management review](hermes-skill-management-review-2026-10-17.md) pins the locally installed Hermes source and expands research to project trust/shared roots, native disabling, profile scope, Hub provenance, bundled synchronization and Curator. The first configuration/detection batch is now implemented and verified under [spec 0008](../specs/0008-hermes-skill-management.md). The original read-only batch and its dated evidence below remain historical; Hub lifecycle, bundled synchronization and Curator remain deferred. Installed-content observation must not be mistaken for runtime loading verification.

## Findings

The pinned CLI uses `$HERMES_HOME/skills` (default `~/.hermes/skills`) globally and `<project>/.hermes/skills` locally. The paths are correct. Its `listInstalledSkills` and `runRemove` scan immediate children only; categorized Hermes skills such as `skills/apple/apple-notes/SKILL.md` are omitted. The CLI does not read Hermes `skills.external_dirs` or `skills.create_dir`.

Hermes seeds bundled skills into the profile-local skills directory, tracks their names in `.bundled_manifest`, and scans category directories recursively. Configured extra roots are also scanned. References, templates, assets and scripts inside a skill package are support files, while hub quarantine, archive, dependency and cache directories are excluded.

Primary references:

- [Hermes Skills System](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills): profile-local roots, bundled seeding, extra directories, creation root and project discovery.
- [Hermes skill utilities](https://github.com/NousResearch/hermes-agent/blob/main/agent/skill_utils.py): root expansion, recursion and exclusions. The live main reference is not the application's CLI pin.
- Published pinned source: `node_modules/skills/dist/cli.mjs`, functions `listInstalledSkills`, `runRemove`, `getInstallPath`, `runUpdate` and command parser `main`; shipped unchanged under `src-tauri/resources/upstream/skills/`.

## Adapter behavior

- Read category directories recursively for Hermes only; other Agent discovery remains unchanged. Follow directory symlinks with canonical-path deduplication, depth/entry/document limits and diagnostic warnings.
- For global scope, read only the skill path settings from the selected `HERMES_HOME/config.yaml`; support scalar/list `external_dirs`, `create_dir`, `~`, application-process environment variables and paths relative to Hermes home. Missing roots are skipped and duplicate roots deduplicated. Unrelated configuration and secrets are never returned. Invalid configuration emits a generic warning while the local directory remains readable.
- Project scope scans project `.hermes/skills` recursively without importing global extra roots. This is installed-content inspection, not proof of project trust, platform eligibility, enablement or runtime loading. Hermes session/profile switching, plugin skill providers and private Hermes `.env` variable loading are outside this adapter; the desktop process's `HERMES_HOME` and environment determine path expansion.
- Inventory retains separate same-name physical records. A bundled manifest name marks local Hermes origin as bundled; modified bundled skills retain that origin. Extra-root content is marked external. No source lock is created by discovery.
- `cliAgents` records associations in CLI-addressable immediate-child roots. Hermes extra-root associations do not make that root a CLI mutation target. `cliManaged` requires an observed upstream source and existing source lock. Source/update metadata is not inferred from a same-name lock for a pure category/extra-root record.
- Cards and detail preserve Agent icons and show bundled/external origin. Cards omit CLI management labels; detail explains the management and operation limits. Skill Space and Agent inventory use the same content width; each preserves its existing card content and icon placement. Unsupported Hermes-only removals are disabled in the UI and rejected by native planning before invoking the CLI. Global removal selects actual CLI target associations, so a CLI-managed shared skill stays removable when Hermes merely references it through an extra root. The confirmation includes that shared-directory impact; physical shared aliases are deduplicated without merging separate Agent symlinks. Same-name external records at unrelated physical paths remain protected. Existing direct-root removals remain available even without a source lock. Updates continue to require the existing supported-source checks.

## Can the upstream CLI adopt these skills?

The upstream `main` command parser was also checked on 2026-10-15; its package version is 1.7.2 and it exposes no in-place adoption command. [Original command parser](https://github.com/vercel-labs/skills/blob/main/src/cli.ts) and [installer](https://github.com/vercel-labs/skills/blob/main/src/installer.ts) corroborate the shallow installed-list scan and flat installation paths.

The pinned CLI has no `adopt`, `import`, or in-place registration command. `experimental_install` restores a project lock and `experimental_sync` imports package dependencies; neither adopts an arbitrary Hermes category or external folder. `--full-depth` expands discovery of an installation source, not scanning of installed skills.

Using `add <existing-skill-folder> --agent hermes-agent` creates a new flat installation in the original CLI roots, through copy or link semantics. It leaves the categorized/external original intact; the two can have the same declared name. It is therefore reinstallation, not adoption, and must remain an explicit user action. A local source record does not provide supported remote updates; reinstallation from a verified Git/well-known source is required for its respective update contract. This change does not migrate folders, synthesize locks, alter Hermes configuration or automatically reinstall existing skills.

## Verification

- `pnpm build` and final `CI=false pnpm tauri build --debug --bundles app`: passed; packaged resources include the read-only Hermes configuration helper. Original bundled CLI remains byte-identical to the pinned package.
- Frontend contracts: 30 passed, including unsupported Hermes target selection and macOS `/private` HOME alias rendering/expansion. The alias fix prevents a categorized skill's reinstall-source field from becoming `/private~`.
- Complete native suite with local fixture permissions: 91 passed, 3 existing public-network tests ignored. A first sandbox run could not bind localhost or launch some fixture processes; the final run passed. Final shared-root alias/target handling was followed by 2/2 Hermes and 8/8 shared-directory targeted passes; unrelated production behavior and dependencies were unchanged.
- Automated packaged-app acceptance in isolated HOME: four global records (two bundled, one configured external and one normal CLI installation); correct icons/source/management labels; unsupported individual and bulk mutation controls disabled; original skill folder opens in the existing source preview and parses successfully; project-only and empty/recovered inventories remain isolated from global extra roots; malformed YAML preserves local content and exposes only a generic diagnostic; restoring configuration and files restores normal discovery. A final five-record fixture additionally confirmed that a normal CLI installation referenced through an extra root remains globally removable while Hermes-only removal is disabled. Original CLI removal deleted both the shared directory and Claude link, cleared the source lock, preserved all four other fixture skills, included Hermes in the shared impact, and reported a verified uninstall.
- Normal application restarted and left on Hermes Agent: 57 records, including 56 categorized bundled skills and the existing CLI-installed `weknora`. One pre-existing broken link, `~/.hermes/skills/creative/claude-design`, is reported as a directory diagnostic and not counted as a valid skill. Real preferences, Hermes configuration, bundled manifest and 56 skill documents matched the pre-test hashes (59 checked files); no real skill mutation was executed.

Native fixtures cover nested bundled skills, support/quarantine pruning, relative/home/environment path expansion, duplicate and missing roots, creation directory, symlink loops/broken links, malformed configuration without secret disclosure, global/project isolation, same-name lock isolation, native removal rejection and original CLI flat reinstallation without altering the original bundle.

## Inventory presentation follow-up (2026-10-15)

Removed only the Agent-only 5xl content-width limit to align the inventory area. Preserved the existing card differences: Agent cards keep their leading skill icon, while the cross-Agent inventory keeps its Agent brand-icon row. Cards omit all CLI-management labels as a separate requested change; detail retains operation limits. This localized presentation change uses the lightweight build/open verification path, with manual comparison of both pages at the same window width. No lifecycle or detection logic changes in this follow-up.

The inventory toolbar no longer forces separate search/filter and action rows below the viewport xl breakpoint. Search and Agent filter can shrink while actions stay on one right-aligned row. Card content is unaffected. Manual verification should include the supported 960px window minimum, long Agent names and larger interface text.
