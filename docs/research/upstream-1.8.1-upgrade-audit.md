# skills CLI 1.7.4 → 1.8.1 升级审计

核查于 2026-11-12。本文件保留升级前审计和旧工作区的隔离验证记录；新仓库整合后的实际检查以本次交付记录为准。

核查时，Skills Space 桌面端的 manifest、pnpm 锁、staging 版本守卫、现有生成资源和 DSH companion manifest 均指向 `skills@1.7.4`。npm 的 `latest`、GitHub 最新 Release 和远端 `main` 均指向 `1.8.1`。比较 npm 发布提交 `a80e4c9` 至 `e781cb4` 的 92 个提交，复核关键实现及发布包。两端 tarball 通过 npm integrity 校验，当前本地依赖和桌面生成资源的 `dist/cli.mjs` 与官方 1.7.4 一致。 [npm 1.7.4](https://registry.npmjs.org/skills/1.7.4) · [npm latest](https://registry.npmjs.org/skills/latest) · [GitHub 版本差异](https://github.com/vercel-labs/skills/compare/a80e4c9d12d607631249d4d7d059f835d4b2f13a...e781cb4d07433dfe1d19e924ed45cc61738c55ec)

**建议先完成兼容适配，再升级到 1.8.1。** 直接换包会使资源 staging 失败。即使绕过 staging，新项目锁和缺失条目的 JSON 都会让当前桌面适配器拒绝读回。项目锁 v2 还影响仍在使用 1.7.4 的 DSH companion 和终端 CLI。

## 自定义路径的实际含义

上游 #2583 从 **1.7.5** 起支持发布者在**来源搜索根目录**的 `skills.sh.json` 声明 `paths`。指定仓库子目录为来源时，配置随该搜索根解析。普通 Git checkout、本地目录和 GitHub tree/blob 快速路径均有对应实现。路径必须以 `./` 开头，归一化后留在仓库范围内，重复项合并，无效项忽略。声明目录加入优先搜索，目录容器向下查找最多三层，常规目录继续参与选择。同名来源仍受搜索顺序和去重影响，GUI 必须预览真正会安装的那一份。 [来源配置解析](https://github.com/vercel-labs/skills/blob/v1.8.1/src/skills-sh-config.ts) · [目录发现](https://github.com/vercel-labs/skills/blob/v1.8.1/src/skills.ts) · [GitHub 快速路径](https://github.com/vercel-labs/skills/blob/v1.8.1/src/blob.ts) · [合并 PR](https://github.com/vercel-labs/skills/pull/2583)

```json
{
  "paths": ["./tools/skills", "./packages/shared/agent-catalog"]
}
```

安装仍使用选定 Agent 的目录。例如项目 `--agent universal` 的目的地是 `.agents/skills/<name>`。**1.8.1 无任意安装目标参数**。隔离试验中传入 `--path=...` 或 `--dir=...` 均被忽略，命令仍成功写入默认目录。能把自定义目的地记入锁、再交给 list/update/remove 管理的 `--dir` 是尚未合并的 #2302。 [已发布的 add 参数](https://github.com/vercel-labs/skills/blob/v1.8.1/src/add.ts) · [上游目标目录提案](https://github.com/vercel-labs/skills/pull/2302)

对 Skills Space 的直接收益是**预览并安装采用非标准布局的来源**。沿用现有来源选择、目标确认、内容比对与安装结果流程即可。当前预览从 1.7.4 的打包代码切片执行，已验证它无法直接在新包上运行。接入后仍需验证深层仓库、指定子目录、与标准目录同名、无效配置和来源内容在确认后变化的场景。自定义 Agent 加载目录继续由 Agent 本身决定，例如 DSH `customSkillDirs`、Pi 与 Hermes 的原生配置。任意本地目录写入若成为产品需求，可评估扩展现有本地分发的 copy/link 与关系记录，分别明确路径所有权、重名、更新传播、解除关联和卸载。CLI 管理任意目录须等上游有可验证的生命周期合同。 [当前来源预览](../../scripts/inspect-upstream-discovery.mjs) · [DSH 目录配置](../../scripts/dsh-directory-config.mjs) · [本地分发](../../src-tauri/src/upstream/skill_sync.rs)

## 发布区间的功能及影响

| 版本 | 源码确认的行为 | 对 Skills Space 的影响 |
| --- | --- | --- |
| [1.7.5](https://github.com/vercel-labs/skills/releases/tag/v1.7.5) | 来源 `paths`；`check` 与写入型 `update` 分开；`list` 比对锁与磁盘；缺失已锁技能可重装；显式复制写入 `installMode`；恢复增加 dry-run，默认跳过已满足条目；sync/restore 加入 frozen 模式；更新在进程内重装并并行下载。发现支持优先按名称、失败时匹配 slug，按名称请求时可继续搜索根技能下的候选。 | App 目前自己做只读更新检查、精确目标预览和实际状态核验，继续保留这些边界。需要验证新版自动补缺、复制保留、退出码、缺失条目以及预览/安装选中的实际来源。性能改动属于上游路径，本次未测 App 性能。 |
| [1.7.6](https://github.com/vercel-labs/skills/releases/tag/v1.7.6) | skills.sh pack 对可匹配的公开技能使用原仓库指针，并验证与 pack 所锁内容相符；收紧技能支持文件中嵌套链接的复制边界。 | 商店预览、源锁、打开来源和更新可能呈现原仓库身份。要用实际 pack 校验混合来源的显示与内容对应。现有工作区已解析到 tar 7.5.22，区间内 tar 补丁版本本身不能代表当前桌面缺少该依赖修复。 |
| [1.8.0](https://github.com/vercel-labs/skills/releases/tag/v1.8.0) | 项目锁 v2 与跨平台内容哈希；新增公开 JS API；裸 `install`/`i` 恢复项目锁；恢复创建所选 Agent 的链接或副本，单个来源失败时继续；URL/归档和 Notion 下载可入锁；GitHub 更名归一、tag/完整 SHA pin、SSH tree URL、递归 submodule 和 Windows 长路径改进；使用注册 Agent 目录发现来源；全局/项目批量卸载按锁筛选；目录冲突保护和完整性校验；子命令统一参数解析及诊断。 | 主要升级工作在此版本。锁、JSON、构建产物、目标路径和恢复写入范围需要同步适配。Git 源改进影响 App 自己的来源解析及 clone 预览，只有 CLI 执行继承新版行为。已出现的注册目录、指定名字、`metadata.internal` 字符串和同名选择差异也须回归。 |
| [1.8.1](https://github.com/vercel-labs/skills/releases/tag/v1.8.1) | 补回 `skills/bin/cli.mjs` 包子路径导出，`find` 在多词查询缺少完整匹配时回退到部分词匹配，更新依赖。最低 Node 仍为 22.20.0。 | 适配目标取 1.8.1。桌面直接运行绝对 bin 路径，DSH 当前也由 package.json 推导绝对路径，1.8.0 的包子路径导出问题与 staging 失败是两件事。商店独立调用 skills.sh 搜索 API，CLI 的查询回退不会自动出现在商店。 |

入口和行为交叉核对于 [CLI 分发](https://github.com/vercel-labs/skills/blob/v1.8.1/src/cli.ts)、[CLI 命令参考](https://github.com/vercel-labs/skills/blob/v1.8.1/docs/commands.md)、[来源解析](https://github.com/vercel-labs/skills/blob/v1.8.1/src/source-parser.ts)、[更新](https://github.com/vercel-labs/skills/blob/v1.8.1/src/update.ts)、[安装器](https://github.com/vercel-labs/skills/blob/v1.8.1/src/installer.ts)、[卸载](https://github.com/vercel-labs/skills/blob/v1.8.1/src/remove.ts)和[检索](https://github.com/vercel-labs/skills/blob/v1.8.1/src/find.ts)。

## 升级兼容性与回退

| 严重性 | 实际契约 | 当前影响及接入条件 |
| --- | --- | --- |
| 阻断 · staging 与预览 | 1.8.1 的 Agent 表、parser、discovery、installer 等代码移入共享 chunk；CLI 文件仍是入口，但布局已变。包新增 `nostics`，依赖声明为 tar `^7.5.22`、yaml `^2.9.1`。 | 临时复制 staging，仅更换版本守卫后在 `readUpstreamAgents` 失败。逐项调用旧 helper 也证实来源解析、发现、插件、provider、依赖、文档、Eve、下载的切片边界失效。DSH companion 共用 Agent 元数据、发现和来源解析。保留上游包原字节，核对依赖、公开 API 能覆盖的边界及剩余只读 helper。 [staging](../../scripts/stage-upstream.mjs) · [companion staging](../../scripts/stage-dsh-companion.mjs) |
| 阻断 · 项目锁 | `skills-lock.json` v1 → v2。新哈希按 UTF-8 路径字节排序，写入路径和长度边界，规范文本换行，统一安装忽略项与链接范围。读 v1 时只有实际内容仍匹配旧哈希的条目会转换成新哈希，缺失或已改条目留空。新版 `list` 和恢复 dry-run 不写迁移，普通写入或非 frozen 的实际恢复可持久化 v2。 | 桌面 Rust 和 DSH companion 均严格要求项目 v1。适配时按锁版本解释 `computedHash`，让更新比较、安装核验、恢复、依赖同步、provider、Eve、文件 Diff 和 DSH 使用对应语义。仅放开版本守卫会引入假更新和失败读回。 [上游锁与哈希](https://github.com/vercel-labs/skills/blob/v1.8.1/src/local-lock.ts) · [桌面锁读取](../../src-tauri/src/upstream.rs) · [DSH managedEntries](../../packages/dsh-skills-space/managed.mjs) · [现用文档哈希](../../scripts/inspect-skill-documents.mjs) |
| 阻断 · 回退及并用 | 旧 CLI 仍可读写 v2 并保留 `version: 2`，但为新增或改写条目写入 v1 哈希。隔离实测新版把新写条目判成 `modified`。全局 `.skill-lock.json` 仍是 v3；本地、非 GitHub 及 fallback 的目录哈希仍需分辨旧算法与新算法。GitHub tree SHA、well-known digest、下载文件哈希用途不同。 | 两个产品可以分开交付，但必须考虑它们访问同一项目的时间窗口。升级资格验证应包含 1.7.4 CLI/旧 companion 并用和回退后的读写。对可恢复的工作项目保留匹配的锁与安装状态，切回旧 CLI 或手动改 schema 数字无法转换哈希。 [旧锁实现](https://github.com/vercel-labs/skills/blob/v1.7.4/src/local-lock.ts) · [新全局锁写入](https://github.com/vercel-labs/skills/blob/v1.8.1/src/add.ts) |
| 阻断 · 盘点协议 | `list --json` 增加 `status`，包括 `tracked`、`modified`、`untracked`、`missing`。缺失行的 `path` 为 `null` 且 Agent 列表为空。新版遇到坏项目锁时 list 可保留 JSON 输出并在 stderr 告警，restore 拒绝执行。 | 当前 Rust 直接反序列化成 `Vec<Skill>`，`path: String` 会拒绝整个列表，影响基于 inventory 的后续操作。安装路径项与锁缺失项需有各自身份，支持缺失项的恢复或移除记录。原 `add --json` 逐项 `name/status` 成功合同在本地 fixture 成立，仍要覆盖跳过、部分失败与锁写失败。 [list 源码](https://github.com/vercel-labs/skills/blob/v1.8.1/src/list.ts) · [桌面 inventory](../../src-tauri/src/upstream.rs) |
| 高 · Agent 目标目录 | Antigravity 与 Antigravity CLI 项目仍为 `.agents/skills`，全局改为 `~/.gemini/config/skills`，且全局单独处理。Reasonix 增加 `REASONIX_HOME` 与 Windows Roaming 路径。注册 Agent 数量仍为 79。 | Rust 目前把项目路径是 `.agents/skills` 的 Agent 全部按全局通用目录处理，且不认识 `reasonixHome`。修正预览、盘点、覆盖核验、同步目标和卸载中的同一映射，保留历史位置可见性，逐项确认实际目标。DSH 映射到 `universal` 的通用安装语义独立于这两个 Agent 的路径变化。 [Agent 定义](https://github.com/vercel-labs/skills/blob/v1.8.1/src/agents.ts) · [安装路径选择](https://github.com/vercel-labs/skills/blob/v1.8.1/src/installer.ts) |
| 高 · 恢复写入与 CI | 恢复默认选显式 Agent、上次选择或本机检测结果，并加入通用 Agent。哈希匹配的技能保留内容，可补缺失的 Agent 放置；修改项可能重装。默认按记录保留复制。CI 默认 frozen，缺失、无可信哈希或来源不符的条目可失败。同一恢复中的其他来源可能成功。 | 当前恢复确认主要围绕项目锁目标，执行调用没有显式 `--agent`，已有 `--copy --no-cleanup --no-remote` 用于依赖部分。升级后确认页须覆盖真实 Agent 落点、既有本地改动和部分成功；明确交互恢复与 CI 模式，保留来源复核。上游 CI 判定使用环境变量是否有值，`CI=false` 字符串也会触发。 [上游恢复](https://github.com/vercel-labs/skills/blob/v1.8.1/src/install.ts) · [CI 判定](https://github.com/vercel-labs/skills/blob/v1.8.1/src/ci.ts) · [桌面恢复执行](../../src-tauri/src/upstream/restoration.rs) |
| 高 · 来源身份与支持文件 | GitHub 更名、checkout pin、GitLab/GitHub URL、submodule、直接下载锁、pack 指针、目录链接和忽略规则均可能改变候选或内容。 | 保持预览、执行、已安装内容的同一来源和同一份支持文件。桌面自身的 Git clone、只读来源和允许的 URL/sourceType 有独立边界。尤其 `download` 当前进不了自动更新分支；应单独支持或明确显示其来源状态，避免拿旧 Git 或 well-known 规则解释。 [下载与来源](https://github.com/vercel-labs/skills/blob/v1.8.1/src/add.ts) · [桌面源类型判断](../../src-tauri/src/upstream.rs) |

## 扩展功能建议

1. **优先接入来源目录和盘点状态。** 安装向导自动使用发布者声明的 `paths`，列表和详情使用已核实的来源相对路径及已有 UI。把 `missing` 作为可操作的锁记录，提供恢复或清理记录。用 `modified` 提示本地差异并引导已有 Diff，保留桌面精确路径判定，因为 CLI 盘点行仍不能完整表达多个同名安装和分发关系。 [来源解析](https://github.com/vercel-labs/skills/blob/v1.8.1/src/skills-sh-config.ts) · [列表协议](https://github.com/vercel-labs/skills/blob/v1.8.1/src/list.ts)
2. **升级恢复与团队复现。** 可增加显式 Agent 与 dry-run、frozen 意图，确认时展示将写入的实际位置。项目锁 v2 可用于团队/CI 校验，先验证干净项目、v1 缺失内容、混合 npm/远端、已有改动和跨平台换行。恢复也可利用 `installMode`，历史无记录时需按已观察的目标状态处理。桌面现有只读检查已有来源、修改和授权语义，可吸收新版状态，保留原有逐项确认与核验。 [恢复命令](https://github.com/vercel-labs/skills/blob/v1.8.1/docs/commands.md#experimental_install) · [锁哈希](https://github.com/vercel-labs/skills/blob/v1.8.1/src/skill-hash.ts)
3. **按来源扩展直接下载更新。** 有稳定 URL 的 Markdown、ZIP、TAR 可凭原版 `sourceType: "download"`、`sourceUrl`、包内 skill 路径和哈希接入检查、恢复与更新。带 query 或 userinfo 的 URL 不入锁，更新需要新 URL；Notion 页或 pack 走 `ntn` 的可重取身份，应单独资格验证。首次接入可从已支持的公开稳定 URL 做完整闭环。 [下载锁说明](https://github.com/vercel-labs/skills/blob/v1.8.1/docs/commands.md#skills-add) · [下载更新实现](https://github.com/vercel-labs/skills/blob/v1.8.1/src/update.ts)
4. **用公开 API 减少打包代码切片。** `resolveSource` 提供来源、候选、重复项与释放句柄，`getSupportedAgents`、`detectAgents` 提供 Agent 观察，值得先试接。完整 API 另有 `installSkills`、`listSkills`、`removeSkills` 和诊断。API 缺少 update/restore/sync，Agent 元数据的 `universal` 只表达项目语义，且 `resolveSource` 可发起网络请求；它不能直接替换受限 VM、预览边界、指定 Agent 的写入核验及现有原版 CLI 生命周期执行。 `SkillsConfig.agents` 控制目标 Agent 集合，接口没有任意目标路径。 [API 源码](https://github.com/vercel-labs/skills/blob/v1.8.1/src/index.ts) · [API 契约](https://github.com/vercel-labs/skills/blob/v1.8.1/docs/api.md)
5. **将真正的自定义目标独立定义。** 若场景是 Agent 读取用户指定目录，沿用各 Agent 原生配置和实际读回。若场景是分发到工作目录，沿用现有分发记录并定义生命周期。若目标是安装到任意目录后继续由上游统一管理，关注 #2302 的合并版本、锁里的目的地身份、同名多目的地和跨版本回退。 [目标目录提案](https://github.com/vercel-labs/skills/pull/2302) · [现有生命周期所有权](../adr/0005-use-unmodified-upstream-cli.md)

## 验证记录

- **已运行，Node 25.9.0，临时 HOME 与项目。** 原版 1.7.4 未发现深层声明目录的 fixture，1.8.1 找到并复制原文件到 `.agents/skills`。未知 `--path=` 和 `--dir=` 均落到默认目录。运行 `add --json`、`list --json`、`check -p -y`、`install --dry-run`、`install --frozen-lockfile`、`i`、`remove --all`。观察了 v1 只读不写、v2 迁移、空哈希、旧 CLI 写入造成的混合哈希、四种列表状态、check 对本地变化返回 1、frozen 保持锁字节与显式复制、CI 拒绝来源变化、只删除锁内项、坏锁的 list/restore 差异，以及全局锁保持 v3。另用同一份本地技能验证了 Antigravity 的全局落点从 `~/.agents/skills` 变为 `~/.gemini/config/skills`，用发布包的公开 `resolveSource` 读回了声明目录的相对路径，`getSupportedAgents` 返回 79 项。
- **已运行，临时 staging 副本。** 现有版本守卫按设计拒绝 1.8.1。放行临时副本后，依赖复制完成，Agent 元数据提取失败。复用旧元数据仅用于逐项探查 helper，确认共享 chunk 布局引起的边界失败。项目正式生成资源未重写。
- **源码确认。** GitHub blob、远端及私有源、Notion、Eve、依赖同步、pack、文件内容保护等分支的影响依据发布提交及应用消费者；未把源码判断写作应用验收。本次没有改依赖、锁、功能代码或生产数据。尚未执行 1.8.1 桌面/DSH 端到端、Node 22.20.0、跨平台或真实第三方来源回归。升级实现后的最小验收应先验证两端 staging/包内资源、v1→v2→旧版并用、缺失列表、安装/更新/卸载、来源自定义目录、恢复写入范围和变更 Agent 路径。

## 2026-11-12 实施与隔离验收

桌面与 `dsh-skills-space` 伴随插件均固定未修改的 `skills@1.8.1`。插件自身版本保留 0.2.2。适配原版共享 chunk、项目锁 v1/v2、缺失盘点行、Antigravity 全局目录和 Reasonix 用户目录。预览沿用现有入口和原版发现优先级。项目锁由 CLI 自己迁移，桌面与 companion 的只读检查同时比较旧哈希和新版哈希。 [桌面基线](../../package.json) · [DSH companion](../../packages/dsh-skills-space/package.json)

- 桌面恢复明确传入 `--agent universal`，与原确认的共享目录范围一致，使用显式交互恢复行为，依赖部分保留原参数。确认后仍检查实际内容和锁。项目无 Agent 被上游检测到时，桌面更新用原版 add 的明确目标调用已有安装，防止非交互 update 创建全部 Agent 目录。新锁记录中的显式复制方式可在更新和恢复后保留。
- 已核对原版 1.8.1 直接下载的 URL、来源类型和哈希读回。用户可在项目恢复中重取锁里可预览的稳定下载 URL。任意目标目录仍在本次范围外。
- 回退使用同一时点的 v1 锁与安装目录快照。隔离试验恢复这两个快照后，原版 1.7.4 可读取并卸载该技能。只切回旧 CLI 可能在 v2 写入旧算法哈希。对曾发生过混合写入的 v2 项目，已经验证新版桌面与 companion 的只读检查不会把内容未变的技能标成有更新。
- Eve 经格式转换的项目副本可能被原版 1.8.1 判为无法验证的普通项目目录。原版 remove 会留下这些目录，但仍可能报告成功。桌面在执行前报告受影响路径，保留副本和锁。该组合的应用内卸载仍受上游限制。

验收证据：

- macOS 隔离 QA 桌面包构建通过。其 18 个 `bin` / `dist` 文件与 npm 官方 1.8.1 逐字节相同。在 Node 22.20.0 上，使用包内资源运行原生适配器的 19 项相关回归，全部通过。随后针对移除中途的锁迁移补充复核，最终包通过 v1 首次读回、深层 paths 预览与安装、v2 与 1.7.4 交替写入、真实内容更新、项目恢复、正常卸载和两条 v1 记录的连续卸载。最终移除相关 4 项回归也通过。
- DSH companion 最终 QA 归档为 `dsh-skills-space-0.2.2-6fd8fcb68ccc.tgz`。候选包检查及隔离测试通过 28 项，跳过可选公网 HTTPS 场景 1 项。使用原版 CLI 实测本地深层 paths、v1/v2、旧版交替写入、安装、更新、锁恢复、卸载和成对快照回退。归档已装入本工作区的 `skills-space-clean`，安装文件与归档逐字节一致，依赖读回 1.8.1。64590 由另一工作区占用，本工作区的隔离 Host 在临时 loopback 端口验证可启动并返回认证响应。
- 前端相关合同通过。全量前端合同里的既有 `overlay-hints` 静态断言仍有 1 项失败，涉及本批之外的三个组件 `title` 属性。桌面结果来自打包资源与原生适配器实测，DSH 结果来自实际归档与隔离运行时。未作桌面/Host 页面逐项人工点验，也未覆盖 Windows/Linux 或真实认证源。
