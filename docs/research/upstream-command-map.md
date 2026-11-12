# Upstream CLI integration map

Status: Current implementation reference, updated 2026-11-12. CLI baseline: unmodified published `skills@1.8.1`. Node minimum is 22.20.0; the implemented resolver honors an explicit executable selection, uses a compatible system runtime, and obtains the pinned official fallback only when needed. Node is not bundled with the App. Integration is bounded; a command entry does not imply every source/parameter/platform is covered. See the [1.8.1 audit and verification](upstream-1.8.1-upgrade-audit.md), the [prior upgrade audit](upstream-1.7.2-upgrade-audit.md), [capability plan](../specs/0004-upstream-capability-completion-plan.md) and [historical 1.5.20 evidence](../archive/upstream-1.5.20-integration-history.md).

| Command | Aliases | Pinned interface | Desktop integration |
| --- | --- | --- | --- |
| add | a, install/i with a source | source; -s/--skill, -a/--agent, -g/--global, -l/--list, -y/--yes, --copy, --metadata, --subagent, --all, --full-depth, --json | Explicit source/skills/Agents/scope, bounded preview, internal opt-in, overwrite confirmation and actual content/lock verification. Single installation area and Eve-only installs use original forced copy semantics. Non-well-known add batches use `--json` and structured result adaptation. Well-known installs retain their separate provider path; both paths still verify actual content/locks. No wildcard/all-Agent shortcut. |
| list | ls | --json, -g/--global, -a/--agent | Consume original JSON, keep missing lock entries out of physical inventory and supplement actual directories to retain same-name installation identities and shared relationships. Agent detection does not prove executable availability or skill loading. |
| remove | rm, r | names OR exact lock source; -s/--skill, -a/--agent, -g/--global, -y/--yes, --all | Explicit reviewed per-skill/Agent paths, shared impact and copy/link deletion results. Exact lock-source GUI selection expands to reviewed explicit skill removals, including lock-only entries; membership is rechecked. Source records are retained when an unselected detected Agent still uses the skill. Project copies that upstream cannot verify in ordinary repository directories are reported before mutation. |
| update | upgrade | names, -g/--global, -p/--project, -y/--yes | Explicit scope and per-item content/lock verification. When no Agent is detected, the GUI explicitly reinstalls the reviewed existing placements through original add. Well-known digest checks/updates are integrated; a missing source skill is retained locally until explicit uninstall confirmation. |
| check | none | Read-only scope/name update check, exit 1 on updates or local changes | Desktop continues to verify the selected source and installed paths with its own read-only operation. |
| find | search, f, s | query; --owner / --owner=value | Desktop uses the same public skills.sh JSON search endpoint with the current official website limit of 100, retains service order and paginates locally (12/24/48). The pinned CLI find command itself retains its original ten-result behavior; its code is unmodified. Installation reuses the existing preview/install flow. Leaderboards remain a separate user-authorized discovery extension. |
| init | none | optional name | Implemented original template generation into a reviewed directory, no overwrite, view/open and explicit subsequent installation. Ordinary authoring actions are currently hidden by user decision; this is not an unimplemented backend. |
| use | none | source; -s/--skill, -a/--agent, --full-depth | Implemented separate modal, one skill/working directory; ordinary authoring actions are currently hidden by user decision. Prompt or Claude Code/Codex/Sarvam Code. Materialized bytes and original prompt verified before actual executable launch. Session restore, process state, stop and explicit release. OpenClaw-specific acceptance flag was removed upstream and is no longer passed. |
| experimental_install | install/i without a source | Project lock; --agent, --dry-run, --force, --frozen-lockfile/--no-frozen-lockfile; forwards dependency options | Review shared project placements and verify actual content/locks. GUI supplies --agent universal and --no-frozen-lockfile. The dependency portion uses --copy --no-cleanup --no-remote. Subagent/plugin/provider restore extensions remain bounded. |
| experimental_sync | sync | -a/--agent, -y/--yes, --copy, --dry-run, --no-cleanup, --no-remote, -r/--recursive, --include, --exclude, --frozen-lockfile/--no-frozen-lockfile | Explicit Agents, original read-only discovery for direct/dev/optional/peer dependencies and npm skills declarations, reviewed copy install, actual content/lock checks. Explicit-source conflicts block. Default GUI uses --copy --no-cleanup --no-remote; copy/link, cleanup, declared Git sources, workspace recursion and include/exclude are exposed through read-only original discovery/dry-run plans and per-path verification. --force no longer exists and is not sent or offered. |
| --help / --version | -h / -v | Human help/version | Developer reference and diagnostics, not ordinary GUI promotional copy or an integration schema. |

The current completed/development/verification/deferred split belongs to [plan 0004](../specs/0004-upstream-capability-completion-plan.md#当前状态与剩余工作2026-11-02). This table describes integration, not a promise of complete source, parameter or platform acceptance. The dated records below retain their original results; this documentation update did not rerun them.

## Sources and inspection bounds

- Supported GUI previews: absolute local directories with ~ input expansion; GitHub/GitLab shorthand, prefixes, aliases, tree/ref URLs and unique skill filters; generic HTTP(S)/SSH/file Git; plugin manifests/groupings; v1/v2 well-known indexes with bounded Markdown/ZIP/TAR.GZ artifacts and original direct downloads. Writes always use the original CLI. Private/SSH/enterprise authentication still needs actual authorized-host acceptance.
- Original direct Markdown/ZIP/TAR/TAR.GZ/TGZ downloads, including hosted artifact parser types, are preview-adapted in owned temporary trees and feed install/use. Azure Repos query/path/ref forms, credential/query-bearing download URLs and larger-than-GUI-bound downloads remain limited. Failed or unsupported preview blocks mutation; it never means an empty source or automatic all-skill install.
- Sources can declare extra search containers in `skills.sh.json.paths`. These directories participate in the original discovery order for preview and install. Ordinary recursive depth 5, 200 skills and bounded trees/content remain GUI inspection limits. Duplicate names, unsafe/ambiguous files and unverifiable content remain blocked. Internal discovery is explicit. --full-depth matches preview selection; --metadata is telemetry-only and is not exposed with telemetry disabled.
- Agent paths come from the 79-entry pinned table. Antigravity and Antigravity CLI use `~/.gemini/config/skills` globally; Reasonix honors its native home. Pi/Droid/Kilo now share .agents/skills; Codex's global declaration also directly uses it. No automatic migration/deletion of former dedicated paths. New Agents reuse existing cards/icons; no Agent program installation is claimed from directory detection.
- Project locks v1 and v2 can be read. The original 1.8.1 CLI writes v2 and migrates only verifiable legacy hashes. The desktop and companion recognize both hashes for unchanged sources, including old CLI writes interleaved with v2. Global local-source installs receive original local lock records; project local lock sources may be relative to the project. Locks are owned by upstream and do not prove current content. Well-known locks additionally carry discovery base/digest; their checks/updates use original digests plus actual content verification.
- Eve transformation retains supported name, description, license, compatibility, version and metadata via original YAML serialization. Project root/existing subagents are supported; dependency/Eve/download combinations and flat provider files remain bounded gaps.

## Execution and verification

Only original pinned bin/dist files perform mutations. Read-only helpers derive parser, provider, plugin, Eve and dependency contracts from that release; terminal prose is diagnostic only. HOME paths display as ~ while execution/copied prompts retain real paths. Preview and complete operation plans are rechecked before writes; zero exit alone is insufficient.

Use retains support files after ordinary exit and keeps surviving process-group jobs until completion/explicit Stop; release removes only an owned inactive cache session. Unix prompt control and macOS Terminal launch are available; Windows control/Linux terminal launch and real authenticated Agent task execution need separate acceptance. Process groups cannot contain a daemon that intentionally detaches.

All mutation regression fixtures use isolated HOME/projects. Staging/build and native CLI tests run sequentially because staging replaces test resources. Current acceptance counts and desktop/package evidence belong in [plan 0004](../specs/0004-upstream-capability-completion-plan.md). Remote management is outside this release.

## Hermes read-only inventory extension (2026-10-15)

The pinned CLI paths are correct but installed-list discovery is shallow. The desktop adapter adds categorized Hermes skills and configured extra roots without writing locks or changing original CLI mutations. Unsupported category/extra-root removals are rejected; there is no in-place adoption command. See [implementation and adoption evidence](hermes-skill-inventory.md).

## Preview discovery alignment — 2026-10-18

Authorized correction: use the original pinned discovery/selection rules across repositories, with no repository-specific or locally installed Agent checks. The former recursive Rust scan plus path sorting and pre-filter duplicate-name rejection did not implement the CLI's directory priority, exact-name deduplication, internal filtering or installed-project lock exclusions. It could reject a repository the original CLI installs and could select a different directory. That independent scanner is removed.

`inspect-upstream-discovery.mjs` evaluates the original `discoverSkills`, `filterSkills` and their dependencies from unchanged `skills@1.7.2/dist/cli.mjs`, with read-only, bounded filesystem APIs. It never enters the CLI, executes repository scripts, writes locks or installs files. Preview, installation and temporary use all use `fullDepth: true`; only upstream-selected paths are passed to document hashing. Document frontmatter parsing and metadata sanitization now also use original functions. Plugin manifests retain explicit format/link checks and original grouping; they no longer independently enumerate/sort candidates. The Node process receives no mutation/network APIs through the discovery context.

| Checked surface | Resulting contract |
| --- | --- |
| Exact duplicate raw names | Original discovery keeps its first eligible match, based on original traversal/priority. Agent-specific repository copies do not require that Agent to be installed. |
| Internal skills | Original filtering occurs before name deduplication; explicit inclusion uses the same setting as execution. A hidden duplicate no longer blocks the visible eligible match. |
| Case-only name collisions / source name filters | Original exact-name deduplication does not collapse case-only variants, while selection is case-insensitive. Multiple surviving case-insensitive matches remain blocked instead of installing an ambiguous set. Source filters require one selected eligible match. |
| Root, priority containers, fallback recursion and plugins | Original ordering, depth and plugin directories apply. Original add/use both use `--full-depth`; root skills therefore do not imply default shallow early return. |
| Repository subdirectories and local lock | Keep clone root separate from search root; original `skills-lock.json` exclusions use clone root, including session reinspection. |
| Direct Markdown / ZIP / TAR | Original downloader feeds the same corrected directory preview; no separate archive-specific name selection. |
| Well-known provider | Already uses original provider/parser. Explicit add uses named selection (which may include internal entries); preview preserves that candidate selection and only then hides internal entries. Partial downloads, mismatched index/document identity and conflicting install paths remain explicit unsupported cases, not alternate candidate guesses. |
| Sync, batch reinspection and temporary use | Reuse corrected source inspection; preserve source-content/group fingerprints, moved-ref checks and full installed/materialized content verification. |

Bounds remain deliberate: at most 200 selected skills, 10,000 discovery directory observations, 256 KiB per skill document, 1 MiB per manifest/lock read and 16 MiB cumulative discovery reads. Non-missing read errors and unsafe linked paths fail the preview rather than silently presenting a subset. Case-insensitive ordinary files are distinguished from links using `lstat` metadata. These are application verification limits, not alternative discovery priorities.

The isolated packaged desktop application accepted the original `https://github.com/ayghri/i-have-adhd` root URL, previewed one skill and installed it successfully into a temporary HOME for Codex. The installed `SKILL.md`, `agents/gemini.toml` and `agents/openai.yaml` matched the selected `skills/i-have-adhd` directory byte-for-byte (reviewed repository revision `1ecea1993b7fce257ffbd686c070948b5e07eda6`). No skill was installed into the user's HOME. The test window was closed. A fixture-only project marker and empty initial inventory were checked before any desktop mutation; another test copy that opened with personal inventory was used only for read-only retry and was closed.

Regression assertions now follow original exact-name deduplication and internal filtering. Case-only collisions remain negative tests, and stale content must still reject execution. New original-CLI fixtures compare full selected/installed directory signatures (including different supporting files on otherwise same-named skills) across local/Git sources and global/project scopes, root skills, fallback recursion, root lock exclusions under subdirectory discovery and more than 200 duplicate copies. A no-op CLI fixture includes the new read-only helper rather than bypassing preview.

Final verification: `pnpm test:frontend-contracts` passed 134 tests. `SKILLS_SPACE_TEST_RUNTIME_ROOT=<temporary snapshot> cargo test --offline --manifest-path src-tauri/Cargo.toml --lib upstream:: -- --test-threads=1` passed 136 tests, failed 0 and ignored 3 optional tests (public HTTPS lifecycle, skills.sh network discovery and explicitly selected original Pi package update). Download fixtures ran with loopback permission; no production services were changed. The first broad run was not accepted: it exposed a real case-insensitive-path check defect and a missing helper in the no-op fixture, plus blocked loopback listeners and shared staging-runtime interference. These were corrected without weakening assertions, and the final complete upstream suite passed using an immutable runtime snapshot. `bin/cli.mjs` and `dist/cli.mjs` remain byte-identical to the original pinned package. Modified Rust-file formatting, helper syntax and document references passed; `git diff --check` passed. Final `CI=false pnpm tauri build --debug --bundles app` passed, including resource staging, strict TypeScript, Vite and Rust compilation. No commit was created.

### 2026-10-19 — 带媒体附件技能的来源指纹修复

`alchaincyf/darwin-skill` 在 revision `8a8b66258e3c45d6ae4aea39719468c6428fcb0a` 的技能树约 5.3 MB。原 4 MiB 内容上限让预览指纹为空，安装时又将缺失指纹映射为“检查已失效”，所以重新预览不能消除失败。Node 指纹与 Rust 来源／安装树核验现统一为 16 MiB，保留文件数量、链接拒绝、来源重检、本地修改和超限保护；无法核验与会话过期分别反馈。原版 CLI 及其锁格式不变。

隔离桌面在同一临时 HOME 先复现原报错，再使用修复构建，选择 DeepSeek Harness 连续安装该仓库两次均完成；仓库地址通过仅测试 HOME 的 Git 映射固定到上述公开源码 checkout。38 份安装文件与来源逐字节一致，原版全局锁记录存在，来源与 DSH Profile 清单哈希不变。没有安装到真实用户目录，也未执行技能内脚本。安装确认中的指定覆盖提示按用户要求删除。

针对性验证：DSH 前端／脚本 17、错误反馈 16、DSH 原生 9、来源会话 8、同步保护 6、Git 更新／本地修改／Diff 恢复生命周期 1 项通过；新增大于 4 MiB 的媒体技能安装／重复安装覆盖，超限负例仍超过新上限且保持原保护断言。debug 应用构建（含严格 TypeScript、staging、Vite 和 Rust 编译）、定向 Rust 格式及差异检查通过；未重复执行全量回归。

### 2026-10-19 — 安装进度反馈

来源检查和安装通过请求级 Tauri Channel 更新右下角同一条 Sonner 提示，不改变弹窗布局。适配层 Git clone/fetch 使用真实 stderr 的 CR/LF 分段进度；保留原日志、退出状态、超时和最终文件／锁核验。仅提取 Git 数字传输信息，不把任意日志或 URL 作为进度。界面显示检查来源、克隆、安装和核验阶段，结束后清除加载提示；晚到消息不能重新唤起已结束请求。原版 CLI 未修改，其 add 内部未提供持续的逐技能进度时只显示安装阶段和所选数量，不编造安装百分比；核验计数表示已核验结果数量。

针对性验证：实时分段进度／失败退出 2 项、来源会话 8 项、超时子进程回收 1 项、弹窗结果 4 项、悬浮提示约束 1 项通过；严格 TypeScript 和 debug 应用构建通过。隔离打包应用先验证来源失败后重试，再观察右下角真实 Git 进度及完成后收起，批量复制安装 alpha/beta 成功；两个技能文件与来源逐字节一致，原版 CLI 锁记录齐全。桌面安装很快完成，安装／核验阶段顺序及计数由原生会话用例核实；未执行全量回归，也未写入真实用户技能目录。

### 2026-10-19 — 仓库根技能更新身份修复

`darwin-skill` 的原版全局锁记录为根提交 `8a8b66258e3c45d6ae4aea39719468c6428fcb0a`，同一 checkout 的根 tree 为 `7763cff02c78b3fbd54d424a0bb6392d2f0035fa`。适配层原先只接受 SHA-256 内容摘要和 Git tree，导致已安装技能误报更新，并在原版 CLI 返回已是最新后核验失败。现在仅对 GitHub 仓库根技能补充同一 checkout 的提交身份；已有匹配版本优先用于显示，嵌套技能仍只接受自身目录身份。文件、目标关系、锁记录及本地修改核验保留，不解析终端成功文案代替核验，不改写原版锁。

验证：新增隔离用例使用未修改的原版 CLI，模拟 GitHub API 返回根提交身份，覆盖安装后检查、已是最新的无写入更新、tree 身份兼容、真正的来源升级、本地支持文件修改保护和嵌套技能排除；通过。现有全局／项目 Git 更新与 Diff 恢复生命周期、零退出空操作保护各 1 项通过。debug 应用构建（含严格 TypeScript、staging、Vite 和 Rust 编译）、定向 Rust 格式和差异检查通过；未执行全量回归，未变更真实技能或锁记录。

### 2026-10-19 — 同步范围切换与按钮提示

同步向导切换全局／项目范围时复用本次检查的来源内容摘要，只重新读取本机原技能和目标 Agent／目录／共享冲突，不调用来源检查、联网或下载。原技能或来源记录变化会要求重新检查；目标读取失败清除当前目标检查结果，继续复用现有重试入口。确认同步仍由原有 apply 路径重新检查来源和所选内容指纹，并重检本机内容与目标占用，之后才调用原版 CLI add。没有新增持久化记录或来源缓存。

详情页两个既有动作复用共享 Hint，文案为“卸载同一来源的所有技能”和“同步安装到其他智能体”；保留按钮名称、布局、缺少来源时的禁用原因，以及点击后关闭提示的行为。

验证：最终 `pnpm build`、`CI=false pnpm tauri build --debug --bundles app`、同步模块 7 项隔离用例、共享悬浮提示约束 1 项、定向 Rust 格式和差异检查通过。新增用例在来源目录已不可用时往返切换全局／项目，核对目标禁选、共享冲突和本机原技能变化；Git 用例确认范围检查沿用已审阅内容，而确认同步仍拦截远端分支变化且保留原文件／锁记录。没有执行全量回归或自动桌面安装流程；hover 外观与范围切换界面效果留作手动确认。

### 2026-10-19 — 技能卡片与详情读取反馈

普通技能卡片的非交互区域打开详情，使用手型指针和现有语义 ring 按下反馈；卡片内部按钮、开关、禁用提示代理和浮层事件不触发额外的详情读取。批量选择行为保持原样。详情立即显示已知技能信息，正文及懒加载组件使用共享 Skeleton；读取失败结束加载，并继续使用现有错误反馈，旧请求不能覆盖新详情。

原同步 `upstream_document` 会在窗口线程执行库存扫描、进程调用和文件指纹读取。现在通过 `spawn_blocking` 在后台执行；来源目录随同一份已验证库存返回，打开详情不再额外调用 `upstream_source_directory` 重扫库存。路径、文件大小和库存归属核验保留，没有新增内容缓存或放宽文件读取范围。

验证：最终 `pnpm build` 和 debug 应用打包构建通过，包含严格 TypeScript、staging、Vite 和 Rust 编译。技能文档 3 项纯函数与 5 项组件检查、共享悬浮提示约束 1 项通过；新增加载骨架及读取结束后不残留加载状态断言。定向 Rust 格式和差异检查通过。未执行全量回归或自动桌面工作流；手型、按下反馈和实际详情加载表现留作手动确认。


### Local directory distribution (accepted 2026-10-20)

The existing `upstream_skill_sync_review` / `upstream_skill_sync_targets` read installed content only. `syncOrigin` on the existing apply command selects the application-owned local copy/direct-link extension; it does not invoke remote inspection or CLI local add and never writes upstream locks. Existing update and uninstall flows handle protected associated copies and owned broken links. Original source updates remain unmodified-CLI operations, with explicit original targets when associations exist, followed by independent propagation. This supersedes the earlier source-reinstallation-based sync behavior described above.


## 2026-10-21 skills 1.7.4

The original CLI stays unmodified. `experimental_sync` remains supported, with `sync` as an alias. Pi and Codex keep `.agents/skills`; fx now uses that shared root. Existing `.fx/skills` directories are observed as additional inventory, never passed to the new CLI as current fx targets or moved automatically. Node requirements, direct runtime dependencies, global v3 and project v1 lock schemas are unchanged.

Dependency planning now uses the original remote declaration filters and per-skill cleanup predicate, including shared declarations from multiple packages. Cached remote skills can repair missing Agent links without fetching or rewriting cached content/lock records. The review distinguishes these link repairs even when Copy is selected: the original cached branch uses symlinks. Post-execution inspection verifies current cached content and unchanged source records. Ordinary local skill distribution remains the existing separate local-sync flow. The packaged upstream docs directory is retained alongside README and notices.

## Skills Store public discovery — 2026-11-02

The accepted store redesign reads the public endpoints used by the current skills.sh website, independently of the pinned CLI's terminal presentation. Anonymous requests to `/api/skills/{all-time,trending,hot}/0` and `/api/search?q=…&limit=…` succeeded during this audit; these are different from the documented authenticated `/api/v1/` API. Website assets referenced by the inspected page establish the paging/search behavior; the app does not execute those assets.

- Leaderboard pages contain 200 records plus `total` and `hasMore`; the adapter maps them into existing 12-card UI pages, including pages crossing a 200-record boundary. The returned serving-window total is used, not the homepage's entire-catalog figure. No HTML/Next Flight extraction is needed.
- All-time metrics are cumulative, trending is the last 24 hours, and hot includes hourly counts and their difference from the same hour yesterday. Preserve the service ordering; hot is not sorted by cumulative or hourly count in the app.
- The website searches after at least two trimmed characters, debounces input and requests up to 100 entries. Public responses observed `fuzzy` for `frontend` and `semantic` for `frontend design`; one character returned HTTP 400. Search results preserve the service order. This deliberately differs from the pinned CLI's terminal `find` helper, which reorders results by installs; the CLI itself is unchanged.
- Reuse a native HTTP client, coalesce reads per leaderboard page, retain bounded in-memory pages and each board's latest first-page snapshot in application cache. Explicit refresh bypasses saved data. A failed refresh retains the last successful result; invalid cache data is not a valid empty result.
- Listing payloads do not guarantee a description or file snapshot. Details read the actual repository through the existing source inspection, match the original case-insensitive skill-name filter uniquely and render its SKILL.md. No guessed raw GitHub paths, invented descriptions or bulk repository clones for card decoration. A successful inspected session can transfer to the existing install wizard; original add, locks and verification remain unchanged.

Public references: [leaderboards](https://www.skills.sh/), [website search/pagination implementation inspected in this audit](https://www.skills.sh/_next/static/immutable/chunks/0zfh1m9r3ttbf.js), [API documentation](https://www.skills.sh/docs/api). Public interfaces are an observed read contract, not a promise of permanent availability. Runtime and desktop acceptance for this change are recorded in plan 0004.

### Card descriptions — 2026-11-02 follow-up

The public listing/search responses omit authored descriptions. The corresponding public detail page embeds complete metadata as JSON-LD `SoftwareApplication.description`; its `url` is checked against the exact requested listing. The SEO `meta description` is shortened, while the visible Summary is a separate text, so neither is used for cards. The observed find-skills record matches its actual source frontmatter. Description reads use the existing HTTP client and public listing identity, not guessed repository paths or Git clones. Only visible/near-visible cards subscribe, with three in-flight tasks shared across store re-entry, unstarted obsolete tasks cancelled, and a bounded one-day application cache. Description availability does not delay the leaderboard/search response.

### Clone-free store details research — 2026-11-02 (proposal only)

The current store detail calls `upstream_inspect`, which enters `inspection_session::inspect` and the existing `git clone --depth 1` source checkout. This avoids history but downloads the current worktree and performs install-oriented discovery/content fingerprinting. Browsing a store listing does not require those installation guarantees. No production implementation was changed by this research.

Read-only probes found:

| Option | Observed capability | Constraint |
| --- | --- | --- |
| Public skills.sh detail page | Full rendered document is present in its Next Flight payload. `CollapsibleReadme` receives `previewHtml` and `restHtml`; its Show more only expands already-provided text, with no document fetch or clone. | HTML presentation, not original Markdown. Both values can be direct strings or Flight text references; resolve references and byte lengths, not only the initial visible preview. The site presentation is an observed interface that may change. |
| Documented `/api/v1/skills/{id}` | Documented `files`/`hash` snapshot can supply original Markdown and supporting files. | Exact unauthenticated find-skills request returned 401 `authentication_required` requiring Vercel OIDC. Not an anonymous desktop default. A guessed non-v1 `/api/skills/{id}` route returned 404 and is not a supported fallback. |
| GitHub tree plus immutable blob/content | Public tree request succeeded; the actual `skills/find-skills/SKILL.md` entry supplied a blob URL. Raw blob read succeeded, 5,472 bytes including frontmatter, with no Git checkout. | Tree metadata alone does not resolve upstream skill-name/frontmatter precedence or same-name copies. Never infer a path from skillId alone. Anonymous REST allowance is 60 requests/hour per IP; recursive trees can be truncated. |
| Partial/sparse Git checkout | Git can omit blobs and fetch required objects later. | Still creates repository state and can fault in additional files while upstream discovery scans. Not the minimal solution for reading an introduction. Repository ZIP/TAR similarly still downloads an archive. |

Observed website response/document sizes (single observations, not a speed benchmark): find-skills response 83,249 bytes, complete rendered document 7,322 bytes; frontend-design response 84,486 bytes, complete document 9,370 bytes; website-source ui-taste response 57,625 bytes, complete document 9,385 bytes. Resolving only `restHtml` is insufficient: frontend-design also uses a referenced `previewHtml` value.

Website-source pages use `/site/{domain}/{skill}`, verified from the homepage's actual link and a 200 response for `/site/uizze.sh/ui-taste`; `/uizze.sh/ui-taste` returned 404. Existing description/source-link URL construction must be checked with that distinction when implementing this proposal. Installation eligibility and detail browsing eligibility are separate.

Recommended scope for approval:

1. Give store browsing a separate document result, never a fabricated `Inspection`. Reuse the existing card-description HTTP response to extract/cache the full website document when possible; currently that response is discarded after extracting description. Store bounded document text/structure, no `.git`, repository worktree or inspection session.
2. Open details immediately with cached identity/description, then show complete website document using the project's document typography. Do not execute remote scripts, adopt website styles, or present reconstructed Markdown as original source. A retained Source action needs a separate exact single-file read; its path and name resolution must be demonstrated rather than guessed. Missing website content offers Retry/Open source and does not automatically trigger a clone.
3. Only an explicit Install action enters the existing original source-inspection and CLI flow, passing source/skill identity rather than treating website text as reviewed install content. Preserve original discovery, same-name selection and final installation verification.

References: [public GitHub skill detail](https://www.skills.sh/vercel-labs/skills/find-skills), [website-source detail](https://www.skills.sh/site/uizze.sh/ui-taste), [inspected CollapsibleReadme client](https://www.skills.sh/_next/static/immutable/chunks/0449nm76gnw5j.js), [documented file snapshot API](https://www.skills.sh/docs/api), [GitHub content API](https://docs.github.com/en/rest/repos/contents), [GitHub tree API](https://docs.github.com/en/rest/git/trees), [GitHub blob API](https://docs.github.com/en/rest/git/blobs), [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [Git partial clone](https://git-scm.com/docs/partial-clone).

### Clone-free details implementation — 2026-11-02

Subsequent source-view research found a distinct public snapshot endpoint already used by the pinned CLI: `/api/download/{owner}/{repo}/{slug}`. It returns original file contents without the OIDC requirement observed for `/api/v1/skills/{id}`. The earlier API observations remain valid for those exact routes, but do not imply that all snapshot access requires authentication. Verified data sources, website well-known files, snapshot/version boundaries and the proposed shared Preview/Source path are recorded in [store skill source data](store-skill-source-data.md). This is research; the current product still uses the HTML document path described below.

The proposal above is now authorized. Store browsing uses `fetch_skill_document`, a website-document result rather than an installation Inspection. The description loader retains the complete body from its existing response; detail subscribes to that same queued request and reuses the result. Old description-only cache records remain readable and fetch the body only when requested. The bounded snapshot retains at most 256 records and 4 MiB of serialized public document data; no repository or inspection session is created by browsing.

The adapter decodes Next Flight push arrays as JSON and walks framed records, including UTF-8 byte-length text records and inline/referenced preview/rest HTML. It does not scan inside document strings for executable instructions or execute page scripts. Exact canonical identity is checked for both GitHub and website routes; GitHub authored metadata retains its additional SoftwareApplication identity check. Website sources without authored JSON-LD use the opening document paragraphs as a literal introduction, not generic SEO text.

The shared document surface projects inert-template HTML into allowed React document nodes, retaining project typography, heading anchors, code blocks, safe links/images and table presentation; remote classes, styles, event attributes and active elements are not adopted. This is rendered website content, so the store does not claim it is original Markdown source. Installed-skill Markdown preview/source remains unchanged. Explicit Install starts the original SourceField inspection flow with source/skill identity; browsing data never skips installation verification.

### Shared store documents — 2026-11-02 implementation

The authorized increment uses `fetch_skill_markdown`: GitHub source/slug reads the pinned CLI's public download route and extracts the unique SKILL.md without a checkout; website sources call the existing original-provider bridge in document-only mode, limiting v1 to SKILL.md and preserving v2 digest/archive checks. Website reading uses the existing Node runtime; it never enters the CLI or creates an installation inspection. Session-owned Markdown reads coalesce and cache; SkillDocument renders Preview and Source from the same bytes. The existing HTML cache remains available when original Markdown cannot be read, with Source unavailable and an explicit retry. Installation still begins its own original SourceField inspection. This supersedes the previous store-only HTML composition, not the installed Markdown contract. Targeted validation and the normal application build passed; actual application observation is tracked in plan 0004.

### Website install identity and local search windows — 2026-11-02

Website listings now retain the complete, same-host HTTP(S) URL from the page's Installation data, including a declared subpath, for the original installation wizard and well-known document reader. A missing or invalid Installation does not invalidate a readable document: it is returned as a separate source diagnostic, and explicit source-dependent actions can retry it. No webpage command is executed. Cached legacy website documents lacking a validated source address are reread. The Flight adapter covers both CollapsibleReadme props and the direct prose HTML used by short documents. Introduction extraction accepts leading headings before the first paragraph.

The public search contract remains one bounded limit=100 response without a server page/cursor. The UI now renders twelve results at a time using the existing leaderboard pagination composition; page changes do not issue another search. No claim is made that local pagination removes upstream search latency. Per-card description retry buttons are removed; the ordinary list refresh retries failed reads while successful document/description data remains shared.

### Structured store metadata — 2026-11-02

The same canonical-checked Flight response now yields body and optional metadata separately: summaryHtml, Installation command/prompt, repository label/link, GitHub Stars display string and header skill-topic links. Semantic titles are matched only as label nodes, while plain serialized sibling groups are scanned once; similarly styled Summary prose cannot become SKILL.md, and footer/related-topic navigation is excluded. Both source identity and displayed Installation use the resolved command. No webpage command is executed.

Metadata is an optional field on existing description cache records; detail-only reads can require it without forcing a valid original body. Missing original Markdown/HTML does not suppress a readable installation or overview panel. Cached old fields remain compatible, and detail fallback reuses its in-flight information read rather than issuing another page fetch. Original files, installation CLI and other Agent document defaults remain unchanged. Current task evidence is tracked in plan 0004.

Current display pagination (2026-11-02): boards adapt the original 200-item service chunks to 12/24/48-item display pages; cache identities include display size. Search slices its one response locally and changing display size does not issue a search. The page size is persisted in existing application preferences (old data defaults to 12). Period counts and activity retain their independent data meanings. Code committed as `1130aad` and `f5248be`; targeted evidence and remaining manual checks are recorded in plan 0004.
