# 上游一致的个人跨 Agent 管理重构方案

状态：已确认的当前重构基线；本机核心入口已接入，核心生命周期已补齐，完整上游能力仍在分阶段接入。确认日期：2026-10-12；文档核查：2026-10-13。当前主线：`main`；原重构分支 `codex/upstream-native-refactor` 已于 2026-10-13 更名。剩余工作以 [计划 0004](0004-upstream-capability-completion-plan.md) 为准；下方验证记录保留原日期，不表示本轮重新执行。

当前运行基线以 `package.json`／锁文件及[命令映射](../research/upstream-command-map.md)为准：`skills@1.7.4`、Node 22.20.0。后文旧版本和“待实施”记录保留原日期；当前进度统一见 [0004 当前状态](0004-upstream-capability-completion-plan.md#当前状态与剩余工作2026-10-28)，不重新执行已结束阶段。

## 已确认的方向

1. 优先服务个人跨 Agent 技能管理。
2. 核心功能和使用逻辑与上游 `vercel-labs/skills` 保持一致。
3. 上游没有的扩展能力由桌面项目提供。
4. 执行层使用原版上游 CLI，不再维护自有 CLI 或 fork，见 ADR 0005。
5. 整理完整上游命令和参数，首期可以只开放部分功能。
6. 本期仅保留本机目标校验并拒绝非本机请求，远程执行边界留待后续设计，不交付远程页面；后续先做单台 SSH 主机只读查看，再开放变更操作。
7. 方案确认后开始实施，按阶段验证。
8. 应用附带固定版本的原版上游 CLI，不修改其源码、不单独发布，随应用升级；不改动用户已有 CLI 安装。
9. 允许桌面端补充必要的只读检查；另按 [0006 Pi 原生技能配置](0006-pi-skill-management.md) 明确授权写入 Pi 技能目录与过滤配置，不改变 CLI 安装／更新／卸载权威；核心状态不依赖终端文案解析，无法可靠集成的能力限制或延后。
10. 首期同时支持全局和项目范围，默认打开全局视图，安装时明确选择范围；项目由用户添加。
11. 实施在新分支开展，不实现旧中心库兼容保留。原实施分支为 `codex/upstream-native-refactor`，现已更名为 `main`。

## 重构前基线与目标的差异

- 重构前核心路径为来源检查、导入中心库、分发至 Agent，并维护自有分发状态。
- 重构前核心执行层为 `packages/skills-space-cli`，依赖 `skills@1.5.20` 并包含自有生命周期逻辑。
- 重构前的 CONTEXT、ADR 0001/0003、本机生命周期规范及代理规则以 managed JSON 协议为前提；当前术语与替代关系已另行更新。
- 项目范围与原版 CLI 接口适配需要重新设计，不能仅更换页面文案；旧中心库兼容不纳入本次实现。

## 设计决策树

第一轮：已确认。

- D1：应用提供固定版本的原版上游 CLI。
- D2：允许必要只读扩展；不解析终端文案判断核心状态，不维护自有生命周期引擎。
- D3：首期支持全局和项目范围。
- D4：本期不交付远程页面或 SSH 执行；当前仅校验本机目标并拒绝非本机请求，不能据此宣称远程边界已完整验证。
- D5：新分支实施，不做旧中心库兼容保留。

决策依赖（已完成本期边界访谈；技术核验留至实施阶段）：

- D1/D2 → 版本兼容策略、命令映射和结果验证、Agent 目录与检测来源。
- D3 → 页面范围选择、项目登记、跨 Agent 安装身份及聚合规则。
- D4 → SSH 用户与主机身份、远端运行时供给、认证、断线与验证策略。
- D5 → 测试数据隔离、旧数据处置边界；新分支不等于本机技能数据隔离。
- 页面流程 → 安装、更新、卸载、按 Agent 查看库存、冲突处理与确认。
- 汇总 → 分期任务、验收标准、文档冲突消解及用户最终确认。

## 页面结构（已确认）

2026-10-15 入口收敛：技能测试和创建技能的 GUI 入口暂时隐藏，底层能力保留。Agent 顶部路径及左侧图标可打开目录；添加技能移至托管技能工具栏，空更多菜单隐藏。工作台仅记录想法，待重新调研，不构成本次实现范围；见[工作台想法与入口记录](../research/skill-workbench-ideas.md)。下文相关创建／临时使用能力描述不代表当前仍有可见 GUI 入口。

以下为功能视角。2026-10-14 用户确认范围导航调整：侧栏同时提供全局与多个项目的 Agent 入口，保留技能空间导航并移除列表页范围下拉；技能商店与安装向导保留。

- 已安装：按当前主机与范围展示实际技能安装，可搜索、筛选 Agent、更新和卸载。
- 发现技能：保留来源输入，恢复原版排行榜浏览并增加关键词/owner 搜索；统一进入现有预览安装流程，沿用原版卡片和页签。
- Agents：列出 Agent；进入详情查看当前范围内各自安装了哪些技能，支持安装、受上游能力约束的更新、卸载及打开目录。不增加专门的跨 Agent 差异矩阵或自动同步功能；手动补装入口遵循 D13。
- 设置：全局设置、外观、语言和 Agent 显示偏好。全局设置保存普通安装的默认模式（符号链接／文件复制，默认符号链接），单次安装可覆盖；上游单一安装目录及 Eve 的复制语义保留。项目记录在侧栏新增、编辑和移除。诊断日志供排查；不在普通 GUI 中展示执行层归属、供给版本或远程规划。
- 中心库不作为普通安装的必经步骤；不实现旧中心库兼容。
- 插件清单中的技能分组沿用现有预览卡片与安装确认，安装身份仍为技能原名；预览复用固定上游 `discoverSkills` 的目录优先级、精确同名去重、内部过滤与本地锁排除，并与安装一致使用 `fullDepth`。不再因仓库保留 Agent 专用副本而拒绝安装；上游去重后仍有大小写选择歧义时拒绝，不引入插件专用页面或虚构命名空间。已安装分组只展示原版全局锁中的记录。
- well-known 索引与直接下载的 Markdown、ZIP、TAR/TAR.GZ/TGZ 复用现有安装向导，确认文件数量及下载地址。预览使用固定上游下载器，写入仅由原版 CLI 执行。well-known 使用原版摘要检查及 update，来源移除后保留本地内容并提供显式卸载；直接下载按原版不新增来源锁，需保留 URL 后重新预览安装，不承诺自动更新或来源锁恢复。
- 按来源卸载以当前锁中的精确 source 展开技能、物理路径和共享影响，确认后调用原版 remove；执行前重检成员，结果逐项说明实际删除与保留。
- 项目依赖同步在原有弹窗中选择本地复制／链接、工作区递归、包含／排除、Git 声明与失效清理。只读计划遵循原版发现／筛选／清理语义，清理需列出全部受影响 Agent 路径（包括未选 Agent）；Git 来源仍按原版使用来源链接。
- 临时使用沿用现有弹窗、来源预览、主题及 Agent 图标，入口放在技能空间、详情与来源输入。只选一个技能并明确工作目录，生成提示词或启动上游支持的单个 Agent；启动前核验临时内容。会话状态与安装库存分开，关闭弹窗保留会话，运行中可停止，进程结束后主动释放支持文件，具体执行取舍见 ADR 0006。

## 第二轮决策（已确认）

- D6：开发验证使用隔离 HOME、临时项目和测试 Agent 目录；不自动清理用户真实旧数据，不实现旧中心库迁移。
- D7：采用已安装、发现技能、Agents、设置的页面结构；Agent 视角与技能视角共享当前主机和范围。Agent 库存视图保留，专门差异对比已由 D13 排除。
- D8：手动放置或来源不明的技能允许查看、预览、打开目录和受支持的卸载；无法准确重建来源时，不自动更新或直接复制到其他 Agent。可补充来源后按上游流程重新安装。
- D9：保留只读更新检查作为桌面扩展；实际更新遵循上游影响范围，无法可靠预判时只提供明确说明限制的上游更新入口，不承诺单 Agent 更新。

## 第三轮决策（已确认）

- D10：无法可靠预览的来源，首期暂缓 GUI 安装，解释限制并提供上游使用说明；不能把预览失败当作空仓库，也不能默认安装全部技能。
- D11：原确认移除抓取排行榜、优先来源安装；2026-10-13 用户明确调整为恢复原排行榜浏览，并补上 `find` 搜索。两种发现方式复用现有预览安装，不恢复中心库。
- D12：安装采用分步弹窗：来源 → 技能 → Agent 与范围 → 确认与结果。从 Agent 页面进入时预选当前 Agent，从发现结果进入时预填来源。

## 第四轮决策（已确认）

- D13：优先 skills 管理与上游功能接入，保留查看不同 Agent 各自安装了哪些技能；首期不增加差异矩阵、对比工作流或自动同步功能。安装到其他 Agent 是上游安装操作的快捷入口。 2026-10-16 用户确认将详情入口收敛为“同步技能”：按记录的原安装来源自动检查并锁定当前技能，直接选择目标 Agent／范围／安装方式，再确认调用原版 add；不采用当前安装目录替代来源，不包含自动同步或本地修改分发。缺少来源或找不到唯一匹配时停止，保留原安装前校验和安装后逐项核验。详情更多菜单移除重复的打开目录，保留详情路径入口。 2026-10-19 用户调整：同源卸载入口移至单技能卸载确认弹窗；详情页不再显示该动作。点击后先查看当前范围的同源技能清单，再确认卸载，继续沿用原有来源成员复核和结果核验。 同步前比较原安装来源与本机技能的实际内容，仅一致且可核验时继续；内容不同或无法核验时停止，用户可检查更新或取消，不静默安装最新版。当前范围已存在该技能、独立副本有差异或同名目录无法核验的 Agent 不可重复选择；共享目录按实际内容检查，可能覆盖不同内容或来源时停止。切换全局／项目只重建目标检查，复用本次已检查的来源结果，不重新联网检查来源；本机原技能发生变化时停止继续使用该结果。执行前仍再次核验来源、本机内容和目标是否仍为空；未完成项重新检查保留这些约束。 安装技能与同步技能的 Agent 选择默认只显示已安装 Agent，保留全部／已安装／发现配置／未安装筛选；切换筛选不解除已有技能及冲突目标的禁选。 同步时已有此技能的目标以灰色勾选且禁用的复选框表示，冲突／无法核验目标不勾选且禁用；原因通过悬浮／聚焦提示提供，Agent 自身安装状态仍保留在名称下方。底部显示“本次同步 N”，只统计并执行新选的可用目标，不将已有技能的展示勾选计入。
- D14：启动时只读本地库存，用户主动触发联网更新检查；不实现定时检查或自动更新。2026-10-28 用户明确授权运行依赖例外：缺少兼容 Node 时自动下载官方固定版本，不自动更新技能、插件或用户 Node。
- D15：部分失败时刷新实际状态，逐项展示已完成、失败、无法确认；不自动回滚或重试变更，由用户核对后重新发起。

访谈形式：使用问答卡片逐轮确认。用户已确认 D1–D15 及最终方案；后续实质性范围变更仍需确认。

## 上游命令映射的交付要求

每项记录：基准版本或 SHA、命令及别名、参数与默认行为、交互/非交互支持、结构化输出、目录和锁文件副作用、远程适用性、GUI 入口、实施阶段及验证证据。不能用旧研究报告替代当前接口核查。

### 当前命令清单入口

[上游命令映射](../research/upstream-command-map.md)集中维护固定发行版 `skills@1.7.2` 的命令、别名、参数、副作用、GUI 接入和验证边界，本规范不再复制第二份命令表。早期访谈曾参考本地 `upstream/main` 的 1.5.22 源码；它不是应用执行基准，也不代表已核验远端最新版本。参数以实际固定发行文件的解析器为准。

## 目标架构

React 负责页面与交互；Rust 负责参数构造、执行协调、原版 CLI 进程、只读检查和结果验证。应用附带原版 CLI，不再发布或调用 managed `skills-space` CLI。2026-10-28 用户调整运行时分发：优先使用兼容的系统 Node，支持手动选择；缺少兼容版本时才下载官方固定版本到应用数据目录，不再随安装包携带 Node。

- 上游负责核心安装、更新、卸载以及其锁文件维护。
- 桌面端补充只读预览、只读更新检查和必要的实际路径/链接观察；不写入竞争性的部署状态库。
- GUI 配置仅保存项目目录、显示偏好等扩展信息；原版 CLI 手动操作后通过刷新重新观察。
- 不依赖人类终端文案形成库存或成功状态。日志用于诊断；退出状态与刷新核查共同形成结果，无法确定时显示待确认。
- 原有 managed Agent Registry 不继续作为独立协议维护。Agent 标识、路径与检测采用所选上游版本为依据的只读适配，并纳入版本验证。
- 当前请求包含本机标识、范围和项目目录，并拒绝非 local 目标。SSH 用户、认证、传输和远端运行时尚未建模或验证；未来需单独接受方案和行为验证，不能把本机目标校验当成双执行适配器已交付。
- CLI 版本、来源预览支持格式和只读检查覆盖范围是实施前技术核验项；不把所有上游来源都宣称为首期 GUI 支持。

## 页面与操作细化

| 页面 | 展示 | 主要操作 |
| --- | --- | --- |
| 已安装 | 当前范围技能、来源、安装 Agent、更新或异常信息 | 搜索、按 Agent 筛选、详情、安装、主动检查更新、更新、卸载 |
| 发现技能 | 来源输入、可可靠读取的技能简介与内容 | 榜单浏览、关键词/owner 搜索、检查来源、进入安装弹窗 |
| Agents | Agent 列表及当前范围各自的安装库存 | 进入 Agent 详情、安装、卸载、打开目录；更新严格按实际上游影响范围 |
| 设置 | 外观、语言、Agent 显示偏好和项目记录 | 调整偏好、管理项目记录；隐藏 Agent 不卸载其技能 |

技能详情展示内容、来源及实际安装目标。正文默认提供 Markdown 预览，支持标题、列表、表格、任务列表和代码块；通过现有分段控件切换完整源码，预览不重复顶部 YAML 元数据。原始 HTML 不执行，网页链接经原有系统打开能力处理；未接入原生读取的相对文件引用保留为文字。保持记录的范围和来源身份；同名但来源不同的技能不因名称相同而合并为一个可更新对象。来源不明时遵循 D8。

创建技能在技能空间使用现有样式弹窗：选择已有目录与可选子目录名称，先只读确认生成路径，再调用原版 `init`；已有 `SKILL.md` 不覆盖。创建后可查看和打开文件编辑，并明确发起现有预览安装流程。创建来源目录与项目/全局安装范围分开，不因模板生成就宣称已安装。

安装流程：来源 → 技能 → Agent 与范围、安装方式 → 摘要确认 → 上游执行 → 刷新验证。链接/复制采用上游语义；不增加中心库导入、纳管或启用步骤。无法可靠发现的冲突不伪装成已通过精确预检；不能承诺比上游更强的版本固定或事务保证。

项目锁恢复在项目技能空间使用原有弹窗，确认全部锁记录及 node_modules 扫描额外项、共享路径和覆盖影响后执行原版命令。它使用当前来源内容，不承诺精确回滚，也不重建独立 Agent 分发；依赖重装需明确选择。结果逐项核对实际内容和锁记录，重试回到整个清单的新确认。

项目依赖安装在项目技能空间和 Agent 页面使用现有弹窗：选择 Agent，扫描 node_modules 的全部技能，确认共享内容、所选副本/链接及来源记录替换。相同锁哈希默认跳过，修复缺失目标或新增 Agent 时需明确选择全部重装；不支持单独筛选技能。项目 Agent 根目录缺失可能只安装共享内容，结果分别报告实际路径；Eve 格式转换暂缓此入口。

Eve 在项目范围的安装目标步骤选择根 Agent 和现有子 Agent；卡片保留各物理记录并标注位置。文档转换读取原版 formatter，按转换后的目录内容及锁记录核验。Git 更新按项目锁的 subagents 位置执行；未选位置保留但未必继续被同名锁记录覆盖。Eve 卸载没有逐子 Agent 参数，确认根与所有子 Agent 的同名实际路径后整体清理；不将多位置误当成单目标，也不自建删除器。全局、扁平 provider 文件、创建新子 Agent、不可可靠映射的目录/名称仍不开放。

卸载明确技能、Agent、范围和可确认的路径，避免使用“禁用”描述目录/链接移除。更新检查是只读扩展，显示可验证结果和不能确定的项；实际更新遵循上游能力，不受当前 Agent 筛选误导。

## 实施阶段与进度

阶段 1–3 已建立本机执行与页面入口，仍有来源、参数和行为覆盖待补齐；阶段 4 的受支持来源更新、核验与人工恢复已补齐；全来源与全参数覆盖仍待接入。阶段 5 的文档状态与引用于 2026-10-13 收尾，运行验证仍以下方注明日期的记录为限。以下条目定义工作范围，不表示每项验收已完成。

1. **新分支与契约核验**：创建 `codex/` 前缀分支；验证固定上游版本及运行时，补全命令/参数映射与隔离 fixture。核查来源枚举、安装、更新、卸载与实际锁文件/链接行为。
2. **替换执行层**：原版 CLI 打包、Rust 本机适配、库存与 Agent 识别；移除自有 CLI 接入和中心库执行逻辑。读写隔离测试环境，不处理旧中心库兼容或迁移。
3. **核心管理页面**：已安装、发现技能、Agent 库存、技能详情、项目/全局切换、安装弹窗和卸载；移除纳管、接管、分发；排行榜与搜索按 2026-10-13 用户补充要求恢复为发现入口。
4. **更新与异常闭环**：用户主动只读检查、原版上游更新、结果核验、部分失败与来源不明提示；如接口能力不足，按 D9/D10 限制功能，不补造执行引擎。
5. **收尾验证与文档统一**：前端构建、原生构建和隔离环境行为验证；同步 README、CONTEXT、AGENTS/CLAUDE 相关规则及 ADR 0001/0003 的替代关系；归档旧 specs，避免新旧合同并列有效。

后续实施顺序以计划 0004 为准：先核心生命周期闭环，再常用及其余上游命令，之后才考虑单台 SSH 主机只读与远程变更；不提前设计远程页面。

## 验收要求

- CLI 用户原有安装可被识别，GUI 操作结果与受支持的上游行为一致。
- 安装后刷新并验证所选目标；共用链接导致的影响范围准确展示。
- 不因缺失来源或 GUI 元数据而隐藏实际安装；无法执行的操作解释原因。
- 不要求兼容旧 Skills Space 中心库与受管状态；不将“不做兼容”视为删除用户真实目录的授权。测试使用隔离 HOME、临时项目和测试 Agent 目录。
- 如交付远程操作，使用真实 SSH 主机或 fixture 验证，不能以接口存在代替端到端证据。

## 实施状态与当前边界

- 已固定原版 `skills@1.5.20` 和官方 Node `22.20.0`，打包原始 bin/dist 与 YAML 依赖，附带许可证；不使用开发机 Homebrew Node 动态库。
- 从原版 main（6386a77）新建分支，保留原版技能商店、技能空间、Agent 侧栏入口和设置分组，以及字体、主题、卡片和 Agent 品牌图标。接入全局/项目范围、分步安装、按 Agent 卸载、更新和主动只读检查。旧 managed 模块留作历史代码，未被入口导入、注册或打包为 CLI。
- GUI 只表达用户可执行的操作、状态和影响，不展示上游版本供给、执行层归属、发布阶段或远程规划等需求与实现说明。技术细节保留在文档中。
- 上游通用 Agent 实际安装路径为共享 `.agents/skills`；同时观察已存在的历史专属路径。2026-10-14 补充约定：原版配置检测结果保留供生命周期影响核验；另以可执行入口或 macOS 应用包证据区分“已安装”“发现配置”“未安装”，默认显示确认安装的 Agent，也可手动显示或隐藏。按用户后续确认，技能卡片恢复 Agent 图标，移除“共享可用”标签：只展示确认安装且实际目标中有该技能的 Agent，包括共用目录的通用 Agent；专属 Agent 必须有有效副本或链接。Agent 页面、Agent 筛选和设置技能数量使用同一确认条件，未确认安装的 Agent 不展示共享目录中的技能，也不以提示文案代替过滤。共享关系及所有实际路径继续参与原版 CLI 的安装、更新、卸载及影响核验。配置存在、目录内容和安装证据均不证明技能实际加载。已知入口之外的自定义安装可能无法确认，详见[检测验证记录](../research/agent-detection-review.md)。
- 同名独立副本不自动合并；目标 Agent 内身份唯一时允许卸载。同一可靠来源的独立副本可一起更新，来源不同或不明时禁止按名称更新；更新执行结果缺少可靠逐项证据时显示待确认。
- 卸载统一保留原版 `remove` 执行和“卸载”按钮。确认前生成按技能隔离的实际路径清单：共享内容关联的通用 Agent 与链接目标共同进入确认，独立副本不静默扩大范围；仍在使用技能的独立副本可能阻止共享目录清理，允许明确加入清单。执行前重新校验清单，目录关系变化时停止。结果逐路径说明共享内容、副本、链接已删除或仍存在、保留、失效及来源记录清理情况，不用笼统“待确认”代替实际结果；额外影响和无法读取仍明确标注。
- 只读更新检查支持有可靠锁记录的全局/项目 GitHub、GitLab、Git 来源，核对来源哈希及实际内容；来源不明、本地修改或不能完整检查时显示无法确认，不调用上游 check 冒充只读。
- 来源预览使用原版 YAML 依赖，支持仓库子目录/树链接与 Git URL；内部技能默认隐藏，安装来源步骤可主动开启显示；列表与确认摘要标出所选内部项，仍通过具体名称安装，不隐式全选。已安装内部技能参与库存、可靠 Git 来源检查/更新及卸载；锁恢复和依赖安装暂不开放内部技能。同名冲突与未支持来源暂缓 GUI 安装。来源前缀、仓库别名、片段引用与技能过滤读取固定原版包的解析函数，不维护第二套映射。过滤来源只允许确认匹配的可见技能，无匹配或名称歧义时停止；GH_HOST 按同一环境解析。安装前再次核对预览内容。安装后比较有界文件树；超过核验边界显示待确认。
- 本期拒绝非 local 目标；尚未实现或验证 SSH。

## 验证记录（2026-10-12，macOS arm64）

- `pnpm test:frontend-contracts`：7 项通过。
- `cargo test --offline --lib -- --test-threads=1`：10 项通过。真实原版 CLI 在隔离 HOME/项目中验证链接安装、复制安装、卸载、共享清理影响；测试替身验证退出码为零但未变更不能被标记成功；共享技能目录本身不使未检测到配置的 Agent 被标为已检测。检测到配置也不证明可执行程序已安装。
- `pnpm build`：通过 TypeScript 严格检查和 Vite 构建。
- `CI=false pnpm tauri build --debug --bundles app`：成功生成 macOS app；包内含原版 CLI、YAML、官方独立 Node 和许可证。
- 桌面验证：基于原版布局重新构建的 app 启动并读取真实库存；核对品牌图标侧栏、技能卡片、Codex 页面、设置中的 Agent 分组卡片，以及安装入口预选 Codex、临时来源预览、技能选择、目标步骤和确认摘要；确认三处版本供给、执行层和远程规划文案已移除。桌面验证未执行真实 HOME 变更；变更行为通过隔离 native fixtures 覆盖。
- `git diff --check`：通过。
- 未验证：SSH、其他操作系统、真实网络来源更新成功和 GitHub 只读检查的联网端到端结果。此版本对更新结果保持待确认，检查范围外显示无法确认。

## 后续生命周期交付（2026-10-13）

本轮补齐内容、最新行为验证及剩余边界统一记录在[计划 0004 的交付记录](0004-upstream-capability-completion-plan.md#本轮交付与验证2026-10-13macos-arm64)。上方 2026-10-12 记录保留为历史证据，其中的更新/预览限制不再描述当前实现。


## 2026-10-14 全局与项目侧栏

- 全局管理与项目管理分别可折叠，分类标题无背景、字号略大并使用弱化文字色；箭头位于标题文字之后，与新增按钮默认隐藏，在 hover 或键盘聚焦时显示。每个项目使用名称和内置图标，无表情符号入口；新增与更多按钮置于对应标题行内；项目整行共用一层 hover 背景，更多按钮无额外背景层，菜单从按钮下方向下展开、宽度适应内容；移除操作文案为“移除项目”，只移除记录。
- 项目标题行直接拖动排序，无独立拖动手柄或折叠箭头；单击标题行展开／折叠。键盘 Enter／Space 折叠、上下方向键排序；所有范围内的 Agent 图标与名称列统一右移 12px，不叠加多层缩进。
- 项目记录包含绝对路径、名称、图标；数组顺序为项目顺序，折叠状态随现有偏好保存。旧字符串路径迁移为目录名与文件夹图标。同一目录重复登记被拒绝；编辑名称／图标不更改目录，移除记录不删除文件或卸载技能。
- 点击范围内 Agent 时切换实际本机 global/project 目标，并清空旧库存；页面显示当前范围名称与该 Agent 的技能目录。范围库存分别读取，侧栏按展开状态读取并缓存；读取失败提供重试。
- 安装向导保留范围选择与当前 Agent 预选，实际变更仍使用固定未修改的上游 CLI；技能空间汇总当前单一范围，不新增跨范围汇总、远程执行或自动同步。

## Hermes 库存补充（2026-10-15）

只读检测补充 Hermes 分类目录和当前 Hermes home 配置的额外技能目录，正常显示内置技能及 Agent 图标，并区分上游 CLI 来源记录与实际可操作路径。发现目录不创建来源锁，也不自动迁移或接管；不受原版 CLI 支持的分类／额外目录更新、卸载入口受限，正常安装、更新和卸载仍使用原版 CLI。接管结论及范围、验证见 [Hermes 检测记录](../research/hermes-skill-inventory.md)。

## Pi 原生技能配置补充（2026-10-15）

设置 → AGENT管理的 Pi 卡片进入同一 Tab 内的 Pi 管理页，返回保留列表状态；配置附加技能目录和排除规则。启停仍在侧栏 Pi 技能卡片右上，卸载使用图标。原生规则停用不会减少已安装数量或改动技能内容；保存后提示 Pi `/reload`。配置保留、外部编辑保护、包过滤及 CLI 权限边界见 [0006](0006-pi-skill-management.md)，不扩展模型、本体更新或完整插件管理。2026-10-18 用户明确授权原生调用字段、更新检测、本地修改保护与升级后恢复；扩展包内容升级委托原版 Pi，详情及边界见 0006。


## 技能库存分区（2026-10-15）

技能空间与 Agent 页统一使用“托管技能 / Agent 技能”切换，按实际管理路径分离标准安装与 Agent 原生资源；后者来源细分内置、扩展包、本地目录，并只展示当前实际可用的操作。设置列表仅 Pi 显示配置入口，其他 Agent 卡片不再跳转技能页。保留完整库存、作用范围和原版 CLI 生命周期校验，详见[分类记录](../research/skill-collections-review.md)。

- 同源卸载仅选择当前来源的 CLI 托管安装和对应 CLI Agent 目标；Pi 原生目录、扩展包等同名技能不纳入卸载目标，执行后仍检查其内容保持不变。单独卸载原生技能的路径保护保持生效。


## 同源批量安装与检查会话（2026-10-16）

同一安装操作的显式技能清单由一次原版 `add --skill … --agent …` 执行，原始来源、范围、复制／链接及 Eve 参数保持不变。原版支持时使用 `--json` 提供逐项执行结果，但成功判定仍需实际内容、关联、适用锁记录及无关内容保留核验；不支持 JSON 的 well-known 来源仍走原版命令与实际状态核验。更新、卸载流程不随此优化合并。

Git 检查可持有原生端临时会话；前端仅持有会话标识。安装前必须查询远端引用，未变时重读本地内容，变化时浅拉取并重查所选技能指纹和插件身份；无法确认、会话失效或所选内容变化均阻止安装。CLI 仍独立获取原始远程来源，不把临时目录改作安装来源，不修改锁记录来伪装来源，也不承诺原版未提供的提交锁定／事务保证。关闭、切换来源、执行消费、过期及正常退出释放会话；异常退出遗留目录有专属清理边界。

实现和针对性验证记录见[安装来源复用](../research/installation-source-reuse.md)。


## Local distribution extension — 2026-10-20

Accepted scope: reuse the existing Sync, update/result/retry and uninstall confirmation surfaces. No new buttons or explanatory blocks. CLI/native installed directories can be distributed without resolving the remote latest version. The local extension is the explicit ADR 0005 exception; normal remote lifecycle operations remain original-tool owned.

- Direct symlinks share the installed source; file copies preserve its current contents. Resolve actual destination directories, deduplicate common Agent roots and reject occupied/overlapping paths. Standalone documents synchronize as a target folder containing only SKILL.md, copied or linked directly to the original file; unrelated sibling files are not included. Eve retains project root/subagent selection and converted-copy semantics using the pinned original formatter. Compare associated Eve copies against converted source contents, keeping source files and original locks untouched.
- `~/.skills-space/local-sync.json` records source/destination scopes and paths, mode, original provenance when known, successful content fingerprint and only the pending replacement information needed for retries. Original CLI/Agent locks and source files remain untouched. Internal skill links/special files and the existing bounded-signature exclusions/limits follow current filesystem inspection rules.
- Successful source updates propagate to unchanged associated copies independently. External changes are discovered by local update checks and applied through the existing update confirmation. Target edits, changed link relationships and another manager's changed source identity block writes to that target, without rolling back successful source/other-target updates. Restored content is re-evaluated from actual bytes. Known invocation settings are preserved by retaining locally changed copies; no field or directory is overwritten to make a comparison pass.
- Save a pending fingerprint before writes. Prepare copies beside their destination, recheck source/target and rename with recoverable previous-directory information. Content/record partial success is reconciled on retry; no archive downloads, copied package backups, historic snapshot store or background monitor. Missing auxiliary history never alone prevents a first sync; existing unowned targets remain conflicts.
- Inventory detects broken owned links without deleting them; existing uninstall confirmation reviews and removes only the exact owned link. Replaced links/directories are retained. Explicit mutations prune missing-target relationships; confirmed source deletion detaches copies without deleting them. Inaccessible source parents retain associations. No automatic source-name matching or recursive propagation.
- Hermes details read bundled origin hashes from `.bundled_manifest`, or exact-path Hub `metadata.source_revision` / `content_hash`. Missing records remain unknown. Origin hashes are baselines, not invented Git commits or release versions; complete values are retained and existing short-hash presentation is reused.

Verification: isolated copy/direct-link, occupied/shared target, cross-scope project, edit/restore, partial propagation/retry, interrupted replacement, external lock takeover, source removal and reviewed broken-link cleanup fixtures passed. The original CLI source-update fixture passed, including protection of an edited associated copy and a fresh local retry after the source is already current. Frontend and debug app builds passed. The isolated packaged desktop flow observed native-directory sync, Hermes seven-character origin hash display, copy/direct-link success, external source update detection, confirmation-time target edits being retained, restore/check-again/update success, restart persistence and confirmed broken-link removal while retaining/detaching the independent copy. Theme-wide redesign/automation and real user-skill mutations were not performed. The qualified original Pi 1.3.0 package fixture also passed: an update initiated in project scope updates both package scopes, restores their distinct invocation fields, then propagates the global source into its associated copy. The fixture uses a temporary HOME and local Git rewrite; the installed Pi package is read-only.

Delivery observation: the final debug bundle was restarted after confirming the main app had no draft or running operation. A read-only Hermes `airtable` detail check displayed the bundled-origin short hash `3b1f4e4`. The isolated QA app was stopped. No real skill synchronization, update or deletion was performed. Changes remain uncommitted.


2026-10-20 correction: Eve Sync is restored through the existing project/root/subagent picker with original formatter conversion; original CLI installation/uninstallation remains unchanged. Standalone Pi documents now support both target SKILL.md copies and direct file links. Isolated fixtures cover conversion, per-slot assets, local-edit retention, retry, source/target overlap rejection and owned broken-file-link cleanup. The existing original CLI mixed Eve add/remove fixture also passed. Packaged desktop checks observed Eve root plus alpha sync and standalone document copy plus link, retained target conflict blocking and unchanged source files. Frontend and native debug bundle builds passed. These observations use disposable HOME/project directories; they do not assert live Agent session loading.

Delivery observation for this correction: the final bundle was restarted after confirming the main app had no draft or active operation. The Pi native list showed one top-level change notice. No real skill was synchronized, updated, removed or reconfigured. Changes remain uncommitted.


## 2026-10-20 Explicit lifecycle actions and auxiliary records (authorized)

This increment supersedes earlier content-baseline gates for explicit installation, local synchronization, update and uninstall. Keep original CLI ownership, scope, selected destination identity, actual filesystem errors and concurrent write checks. Missing auxiliary history or a local content difference is not permission to disable a core action.

- Existing update actions include known local modifications and use the existing overwrite confirmation. Read-only local-state indicators and Diff remain available; updates no longer require a whole-skill baseline match.
- Installation accepts absent optional content signatures while retaining selected skill/source identity checks and comparisons when a reviewed signature is available. Actual selected target presence and original structured CLI results remain authoritative; missing unrelated content signatures do not manufacture a failed installation.
- Local synchronization uses installed bytes without remote resolution. Matching destinations remain checked and unavailable; different-content destinations can be selected and explicitly replaced through the existing confirmation. The review marks only selected replacement targets. Source/destination overlap and a source changed during copying remain actual errors.
- Automatic association propagation retains modified copies and continues with other records. Explicit local-copy updates and reviewed uninstall do not require a baseline match. Retrying a retained associated copy uses the existing local update path instead of rerunning its successful source update. Broken-link cleanup and record detachment still preserve replacement objects and independent copies.
- Source update completion and associated-copy exceptions are separate results. Auxiliary association-history read failures do not prevent original CLI operations or silently replace the damaged record file.
- Optional preview signatures and metadata-read warnings do not disable an otherwise addressable original lifecycle operation. Folder/version hashes and normal local-copy fingerprints stream file contents without adopting preview-size limits as lifecycle limits; existing local relationship hash framing is preserved. Diff/provider/restore callers retain their existing behavior when full preview contents are available.
- Verification: strict frontend build and debug Tauri application build passed. Focused checks passed: 53 frontend contracts; 49 script checks with 1 optional comparison skipped; the isolated original-Pi/npm fixture; 30 native tests across source install/update/remove, one-invocation batch update, install sessions, field recovery, qualified Pi package update and local associations. This combines targeted runs, not a new full-suite claim. The source lifecycle test was rerun after optional-source-signature changes; shared hash framing, large content, retained copies and restart behavior were checked against the final relevant paths.
- Packaged acceptance used a distinct application identifier and temporary HOME. GUI install completed through original CLI; a known modified managed skill remained updateable and updated successfully. A differing same-name sync target was selectable and marked as replacement in the existing review; confirmed copy replacement succeeded. A native Pi package updated and restored automatic invocation while retaining a modified associated copy; the package remained reported as updated. The retained copy then updated explicitly from its Agent page and could be explicitly uninstalled after a further local edit. Source contents were retained. Restart preserved the native invocation field, updated content and removed-copy state. The update-confirmation layout was visually checked; the already-current state was confirmed through accessibility, with stale pixel capture after restart recorded as a tooling limitation.
- Initial QA desktop connection launched a default-HOME instance and exposed personal inventory; no mutations were performed there. It was stopped before fixture operations, then relaunched with explicit isolated environment and verified fixture-only inventory. All lifecycle/configuration mutations used isolated paths. Main application was restarted after confirming no draft or pending operation, and its original Pi native list was restored. No commit or push was created.


## Feedback and existing-action closure correction (2026-10-20)

The authorized correction has two implementation batches. The first removes package-wide modification and generic invocation-recovery paragraphs from skill details, removes the card notice that linked to details without providing its reason, and makes extension checks return transient success/failure when there is no update to confirm. A failed check never also renders an up-to-date empty state. Existing diagnostics remain collapsed; no new button, explanatory panel or lifecycle gate is introduced.

The second keeps local content comparison separate from source-record identity changes, exposes recovery only for a pending recoverable field, automatically refreshes a stale document revision once for read-only Diff, and reuses the Diff control for genuine read/restore failures. Actual Diff/read/restore errors reuse the existing transient error notification; no inline error panel or explanation row is added. Associated-copy results carry the actual destination and Agent identifiers; failure entries retain those targets, existing retries select their Agents, and package results retain every post-update issue rather than only the first. Unknown error summaries can use the failed action's existing retry path without truncating the underlying cause. Managed external invocation, native internal fields, Diff/file restore, local sync and original CLI ownership remain intact.

Verification: strict frontend and debug application builds passed. Focused checks passed: 57 frontend contracts, 46 script checks (one optional upstream comparison skipped), 10 local-association native cases, 6 native invocation cases, and the explicitly selected original Pi package fixture in both scopes. The package fixture additionally confirmed successful source update plus a retained modified copy with its Agent/destination in structured issues. The final result-rendering change was rechecked with 7 existing/new result tests; these are included in the script coverage, not an additional full-suite run.

Packaged desktop checks use the existing dedicated QA application identifier and explicit temporary HOME; fixture-only inventory was verified before any mutation. A package supporting-file edit produced no routine skill-detail notice. A managed skill changed after opening details was compared after one automatic revision refresh, without an intermediate error notice. A genuinely unavailable recorded version used the existing bottom-right error notification, with no content-area error box; after restoring the fixture reference, the same Diff control retried successfully; file restoration retained a concurrently changed file, then completed from the refreshed review and displayed the existing no-differences state. The existing detail layout, Diff, Empty state and transient error notification were observed in the dark theme. No new inline error panel remains. No personal skill mutation, live model session, full-suite/theme-wide automation, commit or push was performed. Earlier broader acceptance records are not rerun or claimed as part of this increment.


### Concise copy and existing retry paths (2026-10-20)

The approved copy audit uses 配置 for configuration sections, 配置方案 for a named Profile, and 配置文件 for an actual file. Stored names and technical identifiers remain unchanged. Routine notifications use localized action context rather than raw native output; partial failures retain their actual completion counts. Known causes remain distinct, and unknown state is not presented as confirmed edits, shared files or permission failure. Raw diagnostics stay in existing logs.

Dependency/restoration results distinguish missing, different and unreadable content and missing, different and unreadable installation records, preserving the existing completion checks and per-target paths. Uninstall results distinguish retained files, changed targets and unreadable records; uncertain unrelated content is not described as changed. Creation results identify missing, unreadable, invalid, unverified and valid files through the existing result controls. A failure to refresh temporary-session history does not report a successfully started session as failed. Existing actions retry these flows; no button or persistent explanation surface was added.

Original Pi handles interrupted Git package updates through its existing update marker and update operation, including an already-current HEAD. Checks can recover an exact installed npm reference only when a recorded invocation policy belongs to another installed version; ordinary checks do not fetch archives. Rechecking retries persistence through the existing journal writer. Damaged auxiliary history is retained and does not prevent version discovery; a record-save failure does not suppress version results or repeat a successful source update.

Verification: 69 focused frontend tests and 9 result-rendering tests passed; 8 original-CLI restoration tests, 11 dependency tests, 1 installation-record persistence retry test and the qualified original Pi integration test passed in isolated HOME/project fixtures. Three creation tests also passed, including the unchanged-file and no-template failure paths. The local npm registry fixture passed with over 100 dependencies, no ordinary-check archive requests, exact-reference retrieval only for pending recovery, no check-time document writes, and preserved damaged history. The dedicated packaged QA app verified resuming an interrupted update at the current revision and the full stale review → existing recheck → update completion path; invocation field preferences and updated body content were read back. Frontend and debug application builds passed before these desktop checks. Final copy refinements retain the same controls and flow; the final frontend/debug application builds passed, and the restarted isolated app visibly showed the Hermes 配置 section with the existing layout. Fourteen DSH script tests passed, including the user-configuration link target; three DSH frontend contracts also passed (already included in the 69). No personal skill mutation, live model call, full-suite run, commit or push was performed.


### Follow-up fault-path evidence (2026-10-20)

The user selected backup-and-rebuild for damaged invocation history and keeping authoring entrances closed. Native creation faults retain unreadable, invalid and unverified files; repaired files can use the existing preview action. A started prompt session survives an actual session-directory listing denial and becomes listable after permissions are restored. These authoring flows were verified natively; their inactive desktop entrances were not enabled or accepted as working desktop flows.

Targeted isolation passed: creation fault fixture (three failure variants), restoration content/lock permission fixture, seven native invocation cases, session-list permission/retry fixture, and 39 Pi script cases (one optional comparison skipped). The final frontend checks passed 26 helper cases and nine result cases, and pnpm build passed. Packaged QA observed damaged journal backup/rebuild, uninstall permission failure followed by the existing Check again action, and successful npm update followed by failed record persistence, permission repair, recheck and invocation recovery without repeating the update. All mutations used temporary HOME/project/source paths.

DSH displayed the effective user-overlay file path and invoked the existing file-open action. The system launched its associated editor, but correct-document loading in that external editor was not verified; this is a remaining external-handler check, not a passed end-to-end result. No further editor interaction is planned.

Final follow-up checks: the qualified original Pi package integration passed again in both scopes; the final debug application build and diff whitespace check passed. Restart of the final isolated QA bundle showed closure-local and closure-npm still set to automatic selection; file read-back confirmed explicit false, valid saved history and the retained corrupt-history backup. The test app was stopped afterward. Main application was not restarted; external editor document loading remains unverified. No commit or push was created.

2026-10-20 Skill Space filter correction: Agent filters now narrow inventory only; they no longer become an Agent action context. Agent-specific filters, controls, settings loads, detail actions and batch operations remain scoped to the actual Agent management page. The existing All Agents Chinese option is 所有智能体. The design baseline was corrected in place. Six existing Agent-action contracts and the strict frontend build passed. This localized change did not run a new desktop automation flow or mutate any skills; main application restart and visual acceptance remain pending.

Delivery correction for the filter fix: the prior frontend build had not replaced the desktop bundle. The final debug desktop package was rebuilt. In the isolated packaged app, All Agents → Pi → Codex changed inventory only; Agent-specific toolbar controls did not appear. The actual Pi management page retained its native state/source filters, card switches, invocation actions and batch entry. The newly built main app was then launched by its exact bundle path; a read-only native-list check confirmed that choosing Pi did not add Agent-specific toolbar controls. No skill/configuration mutation was performed. This supersedes the preceding pending-restart/desktop-acceptance note.

2026-10-20 collection-count correction: tab totals are derived independently from search and list filters, retaining current scope/Agent ownership. Thirty-four existing upstream helper contracts, the frontend build and the debug desktop build passed. In isolated packaged QA, selecting Codex in the managed collection produced no matches while the native total remained three. The updated main app was restarted and showed managed two/native 76 before filtering. No skills were modified.

2026-10-20 skill-card alignment correction: the prior minimum-height fix did not align title text consistently when optional information icons were present. The shared title row now vertically centers its children, and Pi/Hermes switches no longer carry a separate top offset. Existing typography, icon sizes, description allocation and outer card spacing are retained. The frontend build, debug desktop build and diff whitespace check passed; the updated main app was restarted. A plain-title DSH card screenshot was observed. Cross-page comparison with switch/information-icon titles was interrupted by concurrent user navigation and remains unverified; no skill mutation or full desktop workflow test was performed.

2026-10-20 unsupported-guidance cleanup: audited Pi/Hermes/DSH headers, settings, card restrictions, details, operation results and shared errors against their existing actions. Removed the unconditional Pi trust directive and generic conversation-content sentence; the shared title hint now only names /reload. Removed vague Pi package-rule and extension-enable instructions. DSH read-only reasons retain their actual cause without generic repair/open/reselect directives; the existing file-open action remains. A missing DSH file only promises creation when that configuration is editable. Hermes trust controls, existing readback/retry/result actions and necessary disabled-action reasons remain intact. No new action, layout or lifecycle behavior was added. Thirty-six existing helper checks, ten existing result/tooltip checks and the frontend build passed; these checks do not simulate the rare error states whose copy was changed.

Notice-cleanup delivery: the debug desktop build and diff check passed. With no pending settings draft (Save disabled), the main app was restarted from the exact rebuilt bundle. Keyboard focus on the project Pi title hint visibly returned 修改后在 Pi 中运行 /reload。 with no trust directive. Other revised restrictions/rare-error strings were inspected in code and covered by the existing scoped checks, not reproduced as new desktop failure scenarios. No trust/skill settings were changed, and no feature/button/layout was introduced.


## 2026-10-21 upstream 1.7.4 and version checks

Accepted scope: upgrade the bundled unmodified CLI to 1.7.4, preserve existing lifecycle capabilities, and add a compact version area to Global settings. The current dependency review and results cover remote filters/cleanup and cached missing-link repair, with current cache edits and existing lock records retained. Old fx roots remain visible as non-CLI-target inventory; no file/lock migration is automatic. Pi/Codex installation paths and managed/native invocation ownership are unchanged.

The version area reads the actual app package version and staged CLI version. A single manual check queries npm stable dist-tags and GitHub's latest published app release concurrently. Failures remain retryable without blocking other pages. Missing app releases are distinct from a current version; only a newer published app offers a download-page link. No credentials, dependency-tree downloads, updater daemon, arbitrary CLI replacement, release publication or version preference is introduced. Application versions remain synchronized across the existing manifests; CLI upgrades remain part of the app release.

Verification: frontend contracts passed 176 cases with two optional skips; the final fx inventory/removal helper check passed 41 cases (one added case, 177 distinct frontend cases in total). The native CLI suite initially passed 161 cases with 12 failures and four ignored optional cases. Eleven failures were host permission/network-listener restrictions and passed unchanged in permitted host reruns. One stale test incorrectly expected an already-current Git source with local edits to fail; its expectation now follows the existing successful no-op contract, while retaining content/lock/local-modification assertions. The corrected fixture passed. Together with three version metadata tests, 176 distinct native cases passed across these runs; this is combined evidence, not a newly repeated whole-suite pass. Final fx legacy-root/removal protection passed again after its last change. Dependency coverage includes merged declarations, remote include/exclude cleanup, cached edits, unchanged lock bytes, absent source, target conflict repair and retry. Version fixtures cover numeric comparison, malformed responses, service failure, no published release and retry.

The final strict frontend build and debug macOS application bundle passed sequentially with native execution. Packaged CLI entrypoints, docs and notices matched the installed original 1.7.4 package byte-for-byte. An isolated packaged application repaired two missing Claude Code links with Copy selected while its source repository was unavailable, preserving a changed supporting file and the entire project lock. The review identifies cached repairs separately and uses symbolic-link mode for a repair-only review. Readback after restart retained both links, the local edit and exact lock bytes. Legacy fx appeared in the native collection with Open folder rather than CLI uninstall; its backend mutation rejection was also tested. No Agent runtime-loading claim is made for fixture Agents that are not installed.

Packaged version checks displayed the actual app 0.1.0 and CLI 1.7.4; the first live request returned no app release and current CLI. A QA-process-only unreachable proxy produced retryable failure, without blocking other settings pages. Restoring normal networking recovered the CLI result; a later GitHub service rejection remained a retryable app-check failure rather than an up-to-date claim. Successful recovery/new-release branches were covered by native HTTP fixtures; no actual app release was published or downloaded. Default dark layout and light/18px layout in the default and system half-width window were observed. Main-app restart was performed only after the user approved discarding its open dependency-install draft; Global settings then visibly showed skills CLI 1.7.4. All lifecycle mutations used temporary HOME/project paths. No personal skill mutation, model call, CLI hot swap, commit or push was performed.


## 2026-10-21 project import and reinstall

Accepted two-batch scope: rename the existing project actions to 项目导入 / 重新安装 and provide one concise introduction in each task dialog. Import discovers dependency-provided skills before choosing Agents/mode, then reviews affected targets and executes the unmodified sync command. Existing workspace/Git/filter/cleanup options remain available, with label-side help and concrete package#skill examples. Reinstall first reads the local project installation records; it reinstalls recorded sources at their current version, not a historical rollback, and retains whole-record restoration rather than adding partial selection.

Read-only checks use flow-local state and the existing bottom-right progress notification; closing a pending read invalidates its UI result. A single active project flow temporarily reuses source checkouts, with ref refresh before execution. Reinstall confirmation rechecks the reviewed records, source contents and observed local paths rather than rerunning full inventory preparation. Missing temporary preview state falls back to ordinary preparation. Directory observations batch canonical paths to avoid hashing a shared target once per Agent; independent initial Git sources use at most three concurrent fetches. The original CLI owns installation/lock mutations and existing result verification/retry remains. No new lifecycle backend, persistent cache, partial restore or runtime trust action is introduced.

Verification: 14 dependency-native cases and 11 reinstall-native cases passed in temporary HOME/project/source fixtures; the final source-first discovery case passed again after removing the first-phase inventory scan. Nine existing dialog-result contracts, strict frontend build and debug application packaging passed. Native coverage retains lock/source/target changes, duplicate conflicts, copy/link modes, workspace/filter/cleanup behavior, cached-link local edits, independent copies, missing records, permission repair, partial/no-op outcomes and retry. Added coverage proves discovery without an Agent cannot execute, changing Agents can reuse a checkout while its origin is unavailable, a moving Git source is refreshed into that same checkout and rejected against an old plan, canonical batched observations match individual reads, and a cached reinstall review detects concurrent edits and permits the existing recheck path. No full-suite pass is claimed.

The packaged isolated application displayed both new action names and concise descriptions, no Agent chooser before discovery, concrete include/exclude help, an empty-record state, and 16 discovered/recorded skills. Moving the test repository away after discovery still allowed choosing a different Agent and reaching confirmation. Introducing an unrecorded target after review prevented mutation and retained the file/absent lock; after removing that fixture conflict, the existing target-check path installed all 16 skills through the original CLI. Reinstall first displayed local records, detected a post-review local addition without overwriting it, and retained the existing check action. The initial reinstall produced 15 complete / one incomplete: the fixture used a generic file:// Git URL without a .git suffix, which upstream reconstructed as an invalid nested repository path. This was corrected only in the disposable source/manifest and reseeded with the original CLI; no application fallback or CLI patch was added. Repeating the packaged flow with the corrected source completed all 16, refreshed Git content, retained the independent Claude copy edit and kept 16 installation records. No personal skill/model/editor operation was performed.

Visual acceptance: the isolated QA screenshot interface returned an older menu frame while the accessibility tree showed the task dialog, and coordinate operations returned noWindowsAvailable. After the final debug bundle was built, the main application was restarted with no pending draft. Its actual screenshots showed both revised dialogs in the default dark window: source-first steps and description, local recorded-skill/source alignment, project HOME abbreviation and fixed bottom actions. No personal source inspection or mutation was executed. The two read-only dialogs were closed and the original project Pi page retained. Long-list functional states were exercised in QA, but its stale screenshots do not establish their visual acceptance; light/narrow/large-text coverage is also unconfirmed for this increment. The final QA bundle was separately restarted with the same temporary HOME: project Pi inventory still showed 16 managed skills, updated source bytes and the independent copy edit remained, and the lock file matched its pre-restart bytes exactly. No commit or push was created.


Follow-up visual verification (2026-10-21): actual packaged QA screenshots now cover both task dialogs in light mode at 1280×800 and the supported 960×640 minimum, using 18px text, plus dark 16px default and dark 18px at 960×640. The fixture has 14 local dependency skills / 16 installation records. Inspected long-list starts/ends, long Git source wrapping, expanded import settings, exclusion help, the Agent picker with all 79 options selected, single-target import confirmation, reinstall confirmation and its 16-complete result. Headers/actions remain outside body scrolling; selected names truncate beside the protected count; no horizontal overflow or clipped actions was observed. The desktop screenshot service again returned an old frame on one display; moving only the QA window through the native Window menu to the other display restored current screenshots. Accessibility-only states were not counted as visual acceptance.

Found and repaired one bounded behavior defect: moving from a scrolled list to a new stage retained the old body scroll offset. Only these two project flows now provide a stage identity to the existing Modal, which resets its body scroll on stage changes without remounting controls or changing other dialog consumers. In the refreshed QA package, moving from the bottom of the recorded list to reinstall review showed its title/first row; confirming from its bottom displayed the result from its beginning. Import selection-to-review likewise returned to the step indicator and review start. Reinstall completed all 16 fixture skills; no personal lifecycle mutation was performed. The 79-selection layout was checked, not a 79-Agent installation. Initial QA Git inspection and one multi-target review attempt returned existing check errors; subsequent local/single-target previews and the 16-item reinstall succeeded. Those attempts do not establish all upstream-source or target combinations.

Required strict frontend build and debug app packaging passed after this localized change (the existing Vite chunk-size advisory remains). No native lifecycle implementation changed and the earlier native suites were not repeated. The main application was checked for pending drafts, quit through its native menu, launched from the rebuilt debug bundle and returned to its original project Pi page. Temporary QA settings/skills remained separate from personal data. No commit or push was made.


Project action-menu correction (2026-10-21): the preceding dialog acceptance omitted the containing toolbar menu. Its fitContent flag was enabled only on the installed-skills page, leaving project-managed actions 项目导入 / 重新安装 under the shared 12rem minimum. Enable the existing content-fit variant for project-managed menus as well. This changes one caller condition only; task dialog sizes, controls, copy and lifecycle behavior remain unchanged. Follow the lightweight localized-UI verification path rather than repeating isolated installation workflows.

The localized correction passed pnpm build, debug app packaging and diff whitespace checks. In a fresh minimal temporary HOME/project, the packaged menu visibly contracted around the two icon/text rows (about 105px at 16px base text, replacing the 192px minimum). No installation/check action was executed. The previous temporary lifecycle fixture had been removed externally and was not treated as a valid current fixture. The user approved closing the project-import wizard and restarting. The main application was quit through its native menu and relaunched from the rebuilt bundle; its project Pi action menu visibly fit the two icon/text rows. No personal installation or source-check action was executed.

## 技能商店重构（2026-11-02，已授权实施）

历史首轮方案：其中“详情读取真实仓库／Inspection交接”的条款已被下方“无克隆商店详情”替代；其余榜单、搜索、卡片和原版安装约束保留。

用户任务与验收边界：

- 浏览真实 skills.sh 总榜、近 24 小时趋势榜和按小时增量排序的热门榜。使用官网公开 JSON 分页，保留服务端顺序和指标含义；页面翻页不下载 HTML。复用连接、同页请求和最近成功数据，刷新绕过缓存；失败保留已有结果并可重试，不把错误当作空结果。
- 榜单选项、自适应搜索框、图标加文字的刷新按钮与安装技能按钮位于同一工具栏。使用现有控件尺寸，搜索框不高于其他按钮。搜索至少两字符，停顿后查询全站索引，支持中文输入；保留接口搜索顺序，不用安装量重排。清空立即恢复原榜单和页码，过期请求不能覆盖新查询。
- 榜单与搜索共用技能卡片，不显示排名。展示技能名称、仓库、简写安装量和实际可取得的描述；未取得描述不编造、不批量克隆补齐。完整安装量可通过现有提示查看，热榜保留增量含义。
- 点技能进入详情，按现有原版发现机制读取真实 SKILL.md。读取中、失败、未找到和重试有明确反馈；不能猜测仓库文件路径或按相似名称替换技能。详情返回保留榜单／搜索状态，检查会话在离开时释放，交给安装向导后由原流程接管。
- 安装技能直接复用现有来源→技能→Agent 与范围→确认→结果弹窗。卡片预填来源与技能；详情已读取的检查会话可复用。Git、本地目录和下载来源仍由 SourceField 选择，移除商店重复入口。原版 CLI、来源校验及安装后核验不变。

验证选择：本次为页面与数据流重构，仅自动检查上述实际应用转换；原版安装流程复用已有证据，补充详情检查会话交接的定向检查。只在隔离数据中验证写操作，集中检查后由一个构建负责人打包更新，用户手动检查；不提交。

### 列表简介补齐（2026-11-02）

简介验收必须覆盖首次进入榜单和首次搜索、尚未打开任何技能详情时的可见卡片；仅在打开详情后回填简介不能算完成列表简介。

官网列表缺少描述字段时，读取对应技能详情页 `SoftwareApplication` JSON-LD 的完整 `description`，校验 canonical URL 与所请求技能身份一致；不使用截断 SEO 文案或另生成的 Summary。可见范围及120px预读范围内后台加载，最多3个在途请求，同ID共享；离屏／卸载撤销无订阅的未启动任务，在途可完成缓存并交给新订阅，切页面不重建并发预算。先显示列表，简介读取使用现有两行Skeleton；确认缺少简介与读取失败区分，失败提供原位重试，无逐卡错误通知。采用应用缓存保存最多256条、24小时有效的简介，已有真实源文件描述优先。榜单与搜索共用同一卡片实现，不新增样式、Git克隆或安装流程。

### 无克隆商店详情（2026-11-02，已授权实施）

- 用户仅浏览详情时，读取官网完整正文，复用简介读取的同一网页响应及缓存；不调用 upstream_inspect，不启动Git或Node进程，不创建检查会话／工作区。完整正文包括折叠部分，支持内联及字节长度引用的官网文本数据。
- 榜单与搜索卡片简介、详情和来源链接统一识别GitHub与网站来源。网站详情使用官网 `/site/{domain}/{skill}`，来源打开发布者站点；网站无作者元数据时从正文开头段落摘取真实文字，不使用通用SEO安装文案。
- 正文复用现有文档字体、标题锚点、代码块、链接、图片及表格组件。只投影允许的文档结构，不执行远程脚本，不应用远程样式或事件属性。网站渲染正文不伪装为原始Markdown源码；这一路径只展示正文，已安装技能的预览／源码保持原样。
- 明确安装时才进入现有来源→技能→Agent与范围→确认→结果流程，传原来源和技能身份，不用网页正文创建或跳过安装Inspection。浏览失败保留身份／简介，提供重试及来源入口，不自动克隆。
- 定向验证选择：实际App仅检查一次“未打开安装时详情完整显示／无克隆”及网站来源读取和来源链接；原安装写入与已通过商店流程证据复用，入口确认后取消。缓存复用、错误和身份边界由定向夹具验证，不扩展整套桌面／主题矩阵。

### 商店共享交互与原始文档（2026-11-02，已授权实施）

- 商店与管理页共用技能卡片的普通点击处理：标题、简介和空白区域进入详情，独立按钮／提示等操作不冒泡进入详情；管理页批量选择保持原行为。
- 两处共用详情标题／返回／操作／简介组合和元数据布局。商店只替换其实际来源、安装量和安装操作，不显示虚构的本地路径或版本。
- GitHub来源通过原版公开download读取真实SKILL.md；网站通过原版well-known解析读取选中条目的文档，不下载其他v1支持文件。v2沿用原版digest／归档读取。浏览不创建Inspection或Git工作区。
- 同份原始Markdown交给SkillDocument，预览／源码切换不重新请求；会话内缓存原文。原文不可用时仍可显示已存在的官网正文，源码不可用，不把HTML冒充Markdown；失败用原有反馈与重试。安装继续原来源检查。
- 本轮定向验证共享卡片点击／独立按钮、真实Markdown预览与完整源码、网站读取、无原文状态、返回筛选／页码、原安装入口。复用先前安装写入、榜单和搜索证据；唯一正常App构建由测试审查负责，不扩展全主题／窗口矩阵。

本增量替代上轮“所有商店浏览不启动Node”的实现约束：GitHub快照为原生HTTP读取；网站文档使用已有Node执行原版well-known只读解析，既不进入CLI入口，也不创建安装检查会话／工作区。其余无克隆与安装边界保留。

### 网站安装、搜索分页与简介修正（2026-11-02，已授权实施）

- 网站技能可以从卡片／详情进入原安装向导，使用官网Installation声明的完整HTTP(S)来源（包括子路径），保留所选技能名；来源链接和well-known原文读取使用同一地址，不从域名猜测子路径。不执行网页中的命令文本。
- 官网公开搜索仍单次最多100项且保留服务排序；本地与榜单同样按12项分页，切页不重复搜索，只读取当前页卡片简介；新查询／来源筛选从第一页开始，详情返回与页面往返保留当前页，清空搜索恢复榜单。
- 官网正文同时支持短正文与折叠正文；标题先于段落不意味着无简介。卡片移除独立“重试简介”按钮，列表刷新重试失败的简介；失败与确定没有简介保持区分，成功缓存不因失败抹除。
- 本轮定向检查真实网站子路径身份、原安装入口、短正文／段落提取、搜索分页／清空恢复及列表刷新。原版安装写入复用已有隔离证据，不在个人HOME确认安装；只打包一次正常App，不扩大主题／窗口矩阵。

### 商店详情元数据与文档Tab（2026-11-02，已授权实施）

- 保持现有详情组件，简介下元数据补齐官网Repository／Source、GitHub Stars显示值、技能Topics，保留安装量；缺失字段不造值、不增加其他Agent字段。
- 文档Tab按安装／概述／预览／源码排列，以首个可用项作为商店初始内容，其他Agent维持原预览／源码及差异。安装和概述分别承接官网Installation的完整command／prompt与独立Summary，使用已有文档／CodeBlock／复制组件，复制不执行网页命令；实际安装仍原向导。
- 按官网页面语义区块区分Summary、SKILL.md与标题Topics，排除页脚和相关推荐；同一详情响应一次解析并缓存，已有简介请求复用，新字段缺失的旧记录仅在详情按需补读。正文和来源等能力独立，某可选字段缺失不阻断其他内容；概述不能充当源码。
- 卡片空间不足时安装操作使用现有icon-sm按钮／Hint，空间充足保留图标加文字，不能挤掉来源或安装量。安装量紧凑显示统一M/K，中文“累计安装量”改“安装量”，趋势／小时指标含义保留。
- 定向验证一次完整GitHub详情、一个缺可选字段网站及子路径来源，覆盖Tab顺序／缺失／同份预览源码／复制与切换复用请求、卡片窄空间切图标和正常空间恢复；复用旧安装／搜索分页证据。集中修正后唯一正常App构建供手动检查，先不提交，不扩展其他Agent／主题矩阵。

### 商店分页及指标最终增量（2026-11-02）

商店列表每页可选12／24／48项，默认12且记住选择；卡片独立滚动，底部分页保持可见，提供上一页／当前总页数／下一页、输入页码跳转及回车。切换数量保存成功后统一回第一页，保存失败保留当前位置；榜单／查询变更回顶，详情返回恢复列表位置。未知总页数时保留分页栏并暂停翻页，不显示伪造数量，读取失败仍能切换每页数量。榜单按需跨原200项分块，搜索最多100项且纯数量切换只本地分页。本段替代上文固定12项的早期展示规则，不修改历史验证结果。

趋势以24h安装量展示；热门的1h安装量与变化量独立，卡片使用方向图标和变化数，详情独立字段名为活跃度（Activity）并配图标，悬浮说明昨日同时段比较。紧凑数值统一M/K，详情保留完整数值。
