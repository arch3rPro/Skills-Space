# Installation source reuse

Status: Implemented with targeted verification, 2026-10-16. This record describes the pinned skills@1.7.2 adapter; it does not authorize a CLI fork or long-term source cache.

## Execution contract

- One add operation sends its complete explicit skill list to the unmodified CLI, retaining the original source, Agent set, scope, full-depth discovery, mode and Eve targets. Update and remove retain their previous execution paths.
- Git/local/direct-download add uses upstream's supported JSON results. Well-known add retains its original non-JSON path because the pinned version rejects that combination. Structured item success never replaces actual file/link, Agent, applicable lock and unrelated-content verification. A failed batch exit does not turn independently reported and verified successful items into failures.
- A nonzero batch exit without independently verified item success reports failure for each affected item. Exit zero or JSON `installed` alone still yields uncertain when actual installation cannot be verified. Do not infer a second per-skill invocation from list order; one add call carries the full selection.
- Snapshot unrelated content and lock entries before the batch writes; compare each selected skill against its reviewed expected content and targets afterward. Selected skills are excluded from one another's unrelated-content set. No automatic rollback or retry is added.

## Read-only inspection sessions

- Rust owns an opaque session identifier bound to HOME and the original trimmed source. The UI carries the identifier, never a temporary path. Local/download/provider inspection remains fresh and uncached.
- Git preview clones once and stores the checkout in a dedicated temporary directory. A repeated inspection can reuse it; include-internal changes rescan the same checkout. Agent/scope/mode changes do not invalidate the source checkout.
- Apply consumes the session, resolves the remote HEAD or exact branch/tag (including annotated tags), and fails closed on unavailable/deleted references. An unchanged revision still requires fresh local byte/fingerprint inspection. A changed revision uses shallow fetch and detached checkout, then the same selection-fingerprint comparison as before. Changes to unselected repository files alone do not invalidate selected content.
- The original CLI independently resolves the remote during installation. Its source identities, locks and copy/link semantics remain upstream-owned. A remote change between preflight and original execution remains possible and is checked through post-install content comparison; this is not an atomic commit-pinning guarantee.
- UI dismissal/source replacement/unmount releases the session. Apply releases it on success or validation failure; invalidation returns the wizard to source inspection. Sessions expire after 30 minutes, with a minute cleanup sweep and a maximum of 16 stored checkouts. Normal application exit clears them. Dedicated crash leftovers older than 24 hours are pruned on inspection startup. General read-only/test/CLI temporary trees are outside that cleanup prefix.

## Verification

- 24 targeted native tests passed across session reuse, Git/local installs, plugin metadata, Eve conversion, direct downloads and well-known providers; one public HTTPS test remained explicitly ignored. The initial loopback-server tests were blocked at bind by sandbox permissions; rerunning with permitted loopback access passed. Two additional cases verify moved annotated tags/subdirectories/HOME binding and detection of changed unrelated files/lock entries.
- New real-CLI fixtures cover global/project scopes, symlink/copy modes, partial failure, selected-content changes versus unrelated commits, unavailable sources, expired/released/mismatched/tampered sessions, and default-branch/tag resolution. Git trace confirms one inspection clone plus one original CLI batch clone for two selected skills in all four scope/mode combinations.
- Frontend upstream contracts (24 tests) and error/notification summaries (11 tests) passed. Frontend build, debug app bundle, Rustfmt and diff checks passed; the final card-only density adjustment is included in the subsequent bundle/type build. The 15 staged original CLI bin/dist files match the pinned installed package byte-for-byte.
- In a packaged application launched with isolated HOME, two previews of the same Git source produced one clone and one remote check. Selecting two skills and Claude Code/Codex, then confirming the original CLI installation, produced two individually completed items; files, Claude links and both original source-lock entries were read back. Total: two clones and two remote checks.
- A second packaged-app preview followed by a fixture commit changing a selected skill was rejected before installation. One incremental fetch occurred, no installation clone was added, the original installed content remained unchanged, and the wizard returned to source inspection with a concise localized notice. Reinspection succeeded; quitting with that live session released its dedicated checkout.
- Actual selection-card observation confirmed normal two-line wrapping and ellipsis. The follow-up removes an empty metadata region when no metadata exists; no lifecycle rerun is required for that conditional presentation change.
- All mutation tests use temporary HOME/projects and local Git/HTTP fixtures. No real user skills were installed, updated or removed. Public network performance was not benchmarked; clone counts do not imply a measured speedup percentage. No full desktop regression was run.

## Batch result regression follow-up (2026-10-17)

The older zero-exit/no-op test retained a per-skill execution expectation after commit `696205e` introduced one add call. Its failing stub exits nonzero for the whole selection with no successful item evidence, so both results must be failed. The test now checks that contract, the complete selection in one invocation, no automatic retry, and uncertain results when JSON reports installed but no files change. Runtime result classification is unchanged. The real CLI partial-failure test and full native suite pass: 120 passed, zero failed, three public-network tests ignored.
