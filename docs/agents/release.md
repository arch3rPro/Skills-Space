# Release workflow

## Authorization and triggers

Both workflows use only `workflow_dispatch`. Pushes, pull requests, tags and release events do not trigger builds. Do not dispatch a build, create a tag, prepare a draft or publish without the user's instruction for that action. Committing workflow files does not authorize execution.

## Build installers

1. Commit the intended source and reviewed release notes to the selected branch.
2. In Actions, select **Build installers (manual)**, select that branch, choose all or one platform, and select the native verification scope (`critical` by default, `full` for an explicit extended regression).
3. Download the `installers-*` artifacts from the run. Each contains installers and `build.json` with version, source SHA, run ID and SHA-256 checksums. Retention is 30 days.

The matrix covers macOS arm64 (macos-15), macOS x64 (macos-15-intel), Windows x64 (windows-2022), and Linux x64 (ubuntu-22.04). macOS uses ad-hoc signing without notarization; Windows is unsigned. No certificates or updater signing keys are required. Node is not bundled. Existing staging and CLI contracts remain unchanged. Resource staging runs before both frontend contract tests and native tests; both test suites run before packaging. Native test compilation and execution use separate steps with identical build options, so their durations are visible without recompiling unchanged inputs; Tauri then runs its existing frontend build hook. Staging and native tests stay sequential. The default native scope selects 78 checks on Windows and 81 on Unix (including fast preference, marketplace and version checks) for demonstrated platform failures, core CLI lifecycle, scope/content protection, configuration writes and removal failures. It validates that required names exist and are not ignored. `full` explicitly runs the remaining default library suite; opt-in tests requiring an original Agent installation remain separate. Native execution has a 10-minute critical / 40-minute full budget; these are stop limits, not measured speed guarantees.

`fail-fast: false` lets other platforms finish after one fails. For transient failures, use **Re-run failed jobs** or `gh run rerun RUN_ID --failed`; successful jobs and their artifacts are retained. A run containing only one platform is useful for diagnosis, but cannot produce the complete release draft. An explicit full rerun replaces that platform's artifact.

A rerun uses the original commit and workflow, not newer fixes. If code or workflow changes, start a new build of the new commit. Do not mix old successful binaries with new source. Rust dependency caches are also saved on failed jobs to reduce recompilation during repairs. Dependency caches speed the new build but are not proof that an old installer is valid.

## Release notes

Maintain `docs/releases/VERSION.md` in the source commit being built. Every release must include **新增功能**, **功能优化**, and **Bug 修复**, summarizing user-visible changes since the previous published stable release. Use `git log PREVIOUS_TAG..HEAD` and the actual diff/specs; inspect commits rather than copying commit subjects blindly. Exclude changes only present in drafts, internal rework and unverified claims. Use “无” for an empty category.

The `<!-- previous-release: vX.Y.Z -->` marker records the comparison baseline. The draft job checks it against the most recently published stable release. For the first release use `none` and state that there is no previous release; do not invent a historical comparison. For example, to prepare 0.1.1 after 0.1.0, add `docs/releases/0.1.1.md` with marker `v0.1.0` and review `git log v0.1.0..HEAD` before building.

Keep versions synchronized in package.json, tauri.conf.json, Cargo.toml and Cargo.lock. Tags use `vX.Y.Z`, matching the existing application version checker. The DSH companion plugin keeps its independent version.

## Prepare and publish

Only after the user requests draft preparation:

1. Select **Prepare release draft (manual)** and enter the successful all-platform build run ID. The job checks out that build's exact commit, downloads its existing artifacts, validates all four platforms, versions and checksums, and reads the committed notes. No compilation runs.
2. It creates or updates a draft with the five installers, SHA256SUMS.txt, reviewed notes, source commit and bundled CLI version. A published version cannot be overwritten. An existing tag must point to the built commit.
3. Review installation, startup and core skill operations on the actual target systems. CI success is not runtime acceptance. Record untested platforms explicitly in the release review.
4. Publish the draft manually only after explicit user approval. Neither workflow publishes automatically.

A missing/expired artifact requires a new explicit build. If only drafting/upload failed, rerun the draft job; do not rebuild installers. Do not replace an already published installer under the same version; release a patch version.

No in-app updater is added: the existing checker reads published stable GitHub releases and opens the download page. Drafts are not offered as updates.

## Verification status

Initial infrastructure verification: 13 isolated artifact/version/notes tests passed; both original workflows passed actionlint and YAML parsing. Subsequent authorized builds and repairs are recorded in [the capability plan](../specs/0004-upstream-capability-completion-plan.md#windows-后续失败与-linux-耗时核对2026-11-03). Run 41485274762 completed with both macOS targets successful, Windows native tests failed, and the Linux runner disconnected before packaging. Earlier local corrections passed actual Rust compilation and 25 targeted native tests on macOS; the subsequent rationalization passed 84 selected native checks on macOS in about 3 minutes, selector validation and one debug App build; that stage's Windows selection contained 81 checks and was not executed; Windows execution and the Linux failure cause remain unverified. The compile/run step split passed YAML and argument-consistency checks; actionlint was unavailable for this latest edit. No release was prepared or published. Run infrastructure regressions with `node --test scripts/release.test.mjs`.


The subsequent whole-suite rationalization reviewed every existing test file, retained independent risks and reduced direct definitions from 664 to 637. The final local full library run passed 263 checks with 39 opt-in checks ignored; frontend contracts passed 259 with 32 skipped, and release infrastructure passed all 10 scenarios. The current critical selectors contain 81 Unix checks and a theoretical 78 on Windows, validated against actual compiled names without repeating execution. Windows execution remains pending. See [the complete removal and timing record](../research/test-suite-rationalization-2026-11-03.md); earlier counts above remain historical evidence. No new cloud build or release was triggered for this work.
