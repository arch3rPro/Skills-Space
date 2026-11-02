# 项目整体优化方案

日期：2026-10-12；当前状态核对：2026-11-02。状态：规范整理、首批结构清理、加载／数量回归、独立筛选、稳定布局和诊断去重已实施；剩余结构候选不视作完成。

本批提交：`cd1ae2a` 完成兼容系统 Node 选择、受控官方备用运行时及设置；`79b32ef` 整理共享控件和来源筛选居中；`008a896` 统一版本读取状态。此前构建与定向检查证据按下方原记录复用，本次提交整理未重新打包或扩大验收范围。

2026-10-15 入口调整：目录诊断已从技能库存页面移至全局设置，使用设置行和检测按钮，显式检测全局及已添加项目；结果按完整问题身份去重，按受影响范围组合折叠；不同路径／包的问题分别保留。复用原生只读库存接口，不新增修复／删除操作。验证见[技能分类记录](../research/skill-collections-review.md#目录诊断入口调整)。

用户要求：具体实现时由用户按任务选择 mattpocock-skills，不要求全部使用。功能优先级以 [0004](0004-upstream-capability-completion-plan.md) 为准。该重构分支已于 2026-10-13 更名为 `main`，原主线保存在 `codex/backup-main-20261013`；后续优化在 `main` 开展，保留原版页面布局、卡片、主题、侧栏与 Agent 图标。


2026-10-13 补充授权：用户要求实施整体界面优化与八套主题切换，允许调整排版、操作位置与交互。上述视觉保留规则仍适用于功能重构；本轮界面授权、逐项整改与验证见[界面优化记录](../research/ui-refresh-review.md)，保留可识别导航结构和 Agent 品牌图标。

## 规范收尾阶段交付

- `AGENTS.md` 保留项目约束、质量要求和条件式文档入口。
- `CLAUDE.md` 集中维护 read → plan → implement → verify → deliver 工作流程，删除重复解释与泛化示例。
- `docs/agents/skill-usage.md` 提供按任务选技能的参考，用户未选时采用普通开发流程。
- `docs/agents/development.md` 指明当前运行入口与各类变更的验证方式。
- `docs/README.md` 统一列出文档职责、有效状态与替代关系；补齐历史 ADR/spec/计划的状态，修正过满的完成表述。
- `CONTEXT.md` 核对实际类型与检测代码，保留为当前术语表，区分 Agent 检测、目录存在、目录内容和实际加载。
- `.gitignore` 允许规范、指南与标注后的历史文档纳入版本管理；临时工单与私人参考资料继续忽略。

这些文档调整已经实施。下文是后续优化候选，不表示对应模块、测试或能力已经交付。

## 核查发现与处理状态

| 观察 | 证据 | 对后续工作的影响 |
| --- | --- | --- |
| 旧规范与新执行模型同时留在仓库 | 初次发现 ADR 0001 仍写 Accepted，旧 specs 0001/0002 没有替代标记 | 2026-10-13 已标注替代关系；ADR 0002/0004 区分保留原则与旧模型，历史计划不再作为当前执行指令 |
| 前端职责集中 | 品牌图标、共享弹窗、Codex 管理 Hook、筛选会话和目录观察已提取；`src/App.tsx` 仍承担页面及库存／操作协调 | 按实际变更热点继续收拢，不能将全部页面拆分标记为完成 |
| 原生职责集中 | 已按 Agent／能力拆出模块及基础测试；主入口仍包含进程与库存协调 | 后续按明确问题优化，不能因已有子模块就宣称完全解耦 |
| 状态含义容易混淆 | `detected` 来自配置路径；共享目录关系被库存关联；GUI 的安装归属需要另作解释 | 2026-10-14 已将安装证据与上游配置检测分开，恢复按实际目标展示已确认 Agent 图标；验证与入口覆盖边界见[检测记录](../research/agent-detection-review.md) |
| 测试证据有范围与日期 | 最初核查仅有部分本地覆盖；后续本地与公网验收见计划 0004，其他平台和真实认证任务仍有缺口 | 不以历史数字或构建成功替代当前用户流程验收 |
| 打包依赖生成资源 | staging 会重写测试使用的 Node/CLI 资源；Agent 检测元数据由固定发行文件提取 | 版本升级与构建顺序需要显式验证，正则提取必须在源形状变化时失败而非悄悄缺项 |
| 新旧实现共存（核查时） | 当前 lib.rs 注册 marketplace/preferences/upstream；旧模块此前仍留在树中 | 2026-10-13 已核对引用并移除退役实现，详见文末 |

## 优化顺序

当前能力与验证状态以 [0004 四类清单](0004-upstream-capability-completion-plan.md#当前状态与剩余工作2026-11-02) 为唯一 roadmap；本文件只说明结构优化和工程交付方式，不建立第二份功能排期。

| 状态 | 工程事项 | 当前边界 |
| --- | --- | --- |
| 已完成 | 能力模块首批拆分、加载／数量协调、筛选隔离、共享布局和诊断去重；系统 Node 与设置 `cd1ae2a`、共享控件 `79b32ef`、版本读取状态 `008a896` 已提交 | 后文各轮构建、隔离测试与 UI 证据按原日期保留，不由提交状态推定全覆盖 |
| 待开发 | 前端安装流程状态、库存／操作协调，以及原生进程、来源检查和库存核验的后续收拢；CI 平台及自动检查入口 | 按实际维护痛点选取模块，先决定 CI 平台；现有子模块不等于已完全解耦，也不授权整体重构 |
| 待验证 | 真实网络／完整库存性能、真实账号与跨平台场景、当前交付中明确缺少观察的状态 | 精确范围见 0004；已通过且未失效的证据继续复用，不为整理文档重新跑整套验证 |
| 暂缓 | 0004 明确列出的远程、完整 Agent 管理等范围，以及未经确认的工作台设计 | 不从下方原始优化批次推导额外功能授权 |

以下批次保留原始组织方式及验收思路，不把其中已经交付的条目再次列为未完成。旧“尚未提交”记录是当时检查点，当前状态以本节和 0004 为准。

### 第一批：为核心闭环建立可靠的状态与核验

与 0004 的最高功能优先级一起实施：

1. 统一 Agent 状态和技能身份。记录“检测依据”和“技能目录”分别表达什么；为 shared/global/project/manual/same-name 场景建立样例，保留原版锁文件的权威性。
2. 建立闭环验收矩阵。每个流程列出输入、确认、文件/锁结果、失败结果和刷新后的观察；覆盖项目/全局、链接/复制、共享/独立目录。
3. 给更新建立可重复的真实来源变更样例。先用临时 Git 仓库制造前后差异，再验证真实网络来源；能够证实才标成功。
4. 为部分失败定义可恢复的产品行为。用户能知道哪些完成、哪些失败、哪些待确认，并按剩余目标重新发起；不自动重试或回滚。

完成标准：0004 核心生命周期的验收门槛满足；状态含义能由样例与真实结果证明；没有为了“优化结构”延后原版能力交付。

### 第二批：在能力实现中收拢复杂度

按实际变更热点逐步提取 Module，不先创建一套空目录或通用框架。

| Module 候选 | Interface 应承担的复杂度 | Implementation 留在内部 | 验收 |
| --- | --- | --- | --- |
| 前端安装流程 | 来源、选项、确认、执行和结果之间的合法转换；失效请求不会覆盖当前状态 | 组件内部状态、请求标识、错误清理 | 页面复用同一流程；返回、取消、重开和失败后重试均正常 |
| 前端库存与操作 | 当前 scope、筛选、身份歧义与操作可用性 | Tauri 调用、刷新协调和变更后状态处理 | 切换 scope/Agent 时结果不串；同名不同路径不误操作 |
| 原生进程执行 | 固定运行时、cwd/HOME、超时、输出上限和诊断结果 | 子进程、流读取、环境隔离 | 调用方不重复拼进程策略；超时和零退出未变更仍有正确结果 |
| 原生来源检查 | 来源解析、只读发现和可安装技能结果 | Git 临时目录、元数据解析、遍历上限 | 预览与原版安装选择一致；不支持明确失败 |
| 原生库存与核验 | 可观察身份、路径关系、前后状态与不确定性 | 目录/锁读取、共享关系、内容签名 | 通过同一 Interface 测试真实生命周期与共享副作用 |

Module 的质量以调用方需要知道的规则是否减少、维护与验证是否集中判断，不按文件数量或行数判断。Tauri 命令只是薄入口；不新增自有 CLI、不为尚未交付的远程执行提前设计多实现框架。现有操作结果协议只有在具体闭环需求证明不足时才改变。

### 第三批：让上游扩展可重复交付

配合 0004 中 find/init/use/experimental 命令逐项接入：

- 对固定版本维护命令/参数/来源/锁行为覆盖记录。每接一项更新同一份映射，不另建重复注册表。
- 对打包产物检查原版文件、独立运行时、版本与许可证；新版本先跑契约样例再升级 pin。
- 收拢 frontend/native/packaging 的验证入口，区分当前和 legacy 结果；决定使用什么自动化平台后再增加 CI 配置。
- 每个 GUI 变更检查现有视觉基准、Agent 图标、目录缩写及产品文案；不把工程说明带入正常页面。

完成标准：增加一个命令时，所需修改集中在该能力的流程和适配处；已有核心闭环与原版视觉表现保持通过。

### 第四批：有证据地退役旧材料

单独安排小任务，先确认引用和保留价值，再处理：

- 文档状态整理已于 2026-10-13 完成：旧 ADR/spec、研究快照、旧设计与计划均有明确适用状态，保留决策沿革。
- 旧 native 模块、前端 helpers、managed CLI package 和 legacy tests 按依赖清单分批移除或归档。
- 清理 workspace/scripts 时验证开发与打包入口仍正确，不把历史测试数量算入新应用的覆盖率。

完成标准：当前入口只指向有效合同；退役清单能解释每个移除项；行为和打包结果不变。此工作不高于上游能力与管理闭环。

## 实现任务的按需交付参考

以下适用于需要记录的多步骤任务；简单修改可在交付说明中简述目标、结果与验证，不强制创建工单、填写完整模板或调用技能。

1. 问题/目标：一个具体行为或维护痛点。
2. 范围：涉及的 Module/Interface、保持的视觉与上游合同，以及本次不处理的事项。
3. 用户选择的技能：未选写“普通流程”；只执行与任务有关的方法。
4. 计划：少量可验证步骤，先解决最影响闭环的问题。
5. 验证：可重复样例、相关测试/构建、桌面观察和剩余缺口。
6. 结果：实际修改和证据；把未完成内容继续标为计划。

此前规范收尾阶段仅修改规范和计划，未进行结构性代码改动。后续首批结构清理已实施，具体范围与验证见下节；是否使用技能仍由用户选择。


## 首批结构清理（2026-10-13）

用户要求清理项目残留并优化整体结构，采用普通流程。以 lib.rs 注册、前端 import、脚本及 workspace 引用为依据，不改功能行为／页面布局。

- 移除退役 packages/skills-space-cli、stage-managed-cli.mjs、未注册的 configuration/health/inventory/local_skills Rust 模块；删除只服务旧模型的前端 configuration/i18n/distribution/unified-inventory/information-architecture/update-check 工具与专用测试。历史设计／ADR 保留，运行实现可通过 Git 历史追溯。
- 移除失效测试命令与空 workspace 声明，锁文件去掉旧 skills@1.5.20 importer／包项。现有依赖版本与固定原版 skills@1.7.2 不变；增加当前原生回归命令 test:native。
- AgentLogo 和 Modal 从 App.tsx 原样提取到 components/；图标 glob 仅修正相对目录。upstream.rs 基础测试原样迁移到 upstream/tests.rs，保持测试模块路径及共享 fixture 可见性。未增加空框架或远程抽象。
- 清理生成的旧 CLI 资源、脑暴本地服务缓存及约 3.6 GB 的 Cargo incremental；保留官方 Node 下载缓存、测试证据、私人 reference 和当前打包产物。后续构建会正常生成新的缓存。
- 更新开发地图、README 目录职责与规范状态。此批未拆分安装／库存状态协调，也未重构原生生命周期算法；前文其余候选仍为计划。

验证：提取前后的 AgentLogo／Modal JSX 与基础原生测试代码比对一致（仅导出、路径及格式变更）。严格 TypeScript、10 项前端测试、完整原生回归 71 项通过（3 项公网用例默认跳过）、pnpm build、Rustfmt 和 141 个本地文档链接检查通过。依赖按原锁重建，pnpm 11 供应链校验通过；没有新增运行时依赖或升级当前依赖。隔离 HOME 桌面抽查原侧栏／Claude 和 Codex 图标／暗色主题／安装弹窗及关闭返回正常；原生回归覆盖各功能完整流程，本次桌面只抽查提取的界面。

正式 CI=false pnpm tauri build --debug --bundles app 通过；包内标识 com.skills-space.desktop、skills 1.7.2 正确，15 个原版 bin/dist 文件与官方包逐字节一致，helper 与当前源码一致。未运行公网回归（本次未变更网络契约），未修改真实技能数据，未调用技能或子 Agent。


## 本地目录与历史归档迁移（2026-10-13）

- 按用户确认删除 VS Code 扩展推荐与空的 .worktrees；其他已注册 worktree 保持原状。
- 19 份退役文档与旧本地任务记录合并为 docs/archive/legacy-managed-phase.md。原文通过提交 4ee9ad7 追溯，不复制失效步骤作为新待办。旧版 1.5.20 集成历史单独迁入 archive，最终 1.7.2 测试输出去除项目绝对路径后归档，保留原日期与本轮未重跑说明。
- 官方 Node 缓存从 .scratch/upstream-runtime 迁到 .cache/upstream-runtime；同步修改 node-runtime.mjs、README、开发指南和 Git 忽略规则。其余已结束测试 HOME／临时脚本／服务状态清理，长期验收结论仍在计划 0004。任务需要时可重新创建 .scratch，不作为运行或文档依赖。
- 修正归档后的相对链接及有效／历史入口，旧 docs/superpowers、根 DESIGN 和 .superpowers 不再保留。功能与 GUI 代码未修改。

迁移验证：Node 官方 SHA-256 与新目录中可执行文件版本检查通过；pnpm build 通过并复用新缓存；79 个本地 Markdown 链接可解析。10 项前端测试及正式 CI=false pnpm tauri build --debug --bundles app 通过；包内 Node 与迁移缓存逐字节一致、版本 22.20.0，skills 为 1.7.2，15 个原版 bin/dist 文件及全部 helper 与源文件一致。git diff --check 通过。本次不重跑完整技能生命周期或公网测试，先前测试数字均作为有日期的证据保留。


## 全量残留复查与 README 整理（2026-10-13）

- 从前端运行入口与当前测试入口遍历本地 import，确认 alert／empty／label／table／tabs 五个 UI 模块不可达后删除；保留所有仍被引用的组件、Agent 图标、平台图标和配置。不修改保留的前端／原生功能代码。
- 删除空 public、5 处 Finder 缓存，以及确认未运行的 4 个旧 fixture 应用包；保留正式应用包、官方运行时缓存和由包管理器维护的存储目录。
- README 改为项目介绍、主要能力、开发／构建入口与文档导航，移除版本锁定、执行归属与运行边界等内部约束说明。详细规则仍由开发指南、规范和命令映射维护。
- 修正当前分支名、当前 sync 规划中的旧 force 描述及过期测试覆盖表述，旧版交付记录保持原日期，不改写历史验收。

检查：剩余前端源码均可由运行／测试入口到达（环境类型声明除外），本地 import 可解析；排除工具管理的缓存／构建目录后没有空目录。现有 10 项前端测试和 pnpm build 通过，保持既有大 chunk 提示。本次没有改原生执行或包装协议，不重跑技能变更或公网验收，也未调用技能或子 Agent。

最终文档本地链接 78 个全部可解析，git diff --check 通过。保留的功能／原生源码、图标与配置相对本轮起点未变，仅删除已确认未引用的 UI 源码。

## Agent 安装检测与技能归属交付（2026-10-14）

第一批第 1 项中的检测/共享展示已实施：安装证据与原版配置检测分离，技能图标、Agent 页面及技能数量按确认安装及实际目标关系展示，未确认 Agent 不列共享目录技能；移除“共享可用”标签；保留操作影响关联及原版 CLI 生命周期。本轮前端 16 项、原生 83 项通过，3 项公网测试忽略；完成常用 Agent 检测及复制/链接/失效目标回归，macOS 构建与实际全局/项目卡片和卸载确认核验通过。覆盖边界与完整记录见[检测验证记录](../research/agent-detection-review.md)。这不表示所有 Agent 自定义入口或所有平台均已验证，也不改变其他优化候选的状态。

## Agent 管理与排序（2026-10-14）

已接入 AgentOrder 偏好、统一列表顺序、长按拖动及键盘排序、零技能数量格式和设置布局精简；检测扩展覆盖固定上游定义及新增 CLI/应用/插件策略。实现与验证状态见[Agent 管理记录](../research/agent-management-order-review.md)，不将标准入口候选检查解释为全部真实产品安装验证。


## 全局与项目侧栏（2026-10-14）

已实施用户确认的 Agent 视角范围导航、项目名称/内置图标、无手柄标题拖动、单击折叠，以及旧项目偏好迁移。构建、18 项前端测试、5 项偏好测试与隔离桌面范围/编辑/排序/重启验证通过。新增第三项目与移除记录的完整路径通过；二级菜单阴影视觉未完成实测；完整证据和边界见[项目侧栏记录](../research/project-sidebar-review.md)。


## 安装向导与全局默认模式交付（2026-10-14）

已完成用户确认的来源提示精简、目标布局／Agent 筛选、确认信息分区及全局默认安装模式（符号链接／复制）。旧偏好兼容、保存重启、单次覆盖与原版强制复制语义通过；构建、23 项前端契约、7 项原生偏好及隔离 APP 实际复制／链接与失败重试验证完成。未重跑完整原生生命周期套件。完整结果见[界面核查记录](../research/ui-refresh-review.md)。


安装向导布局与结果页后续调整已完成：按步骤／内容分配高度、范围和模式紧凑并排、Agent 列表占剩余空间；日志控制符清理、结果文案精简、单组底部按钮及按操作范围进入技能空间。28 项前端契约、构建打包、隔离桌面列表首尾滚动／项目安装与查看跳转／完成关闭通过；原版 CLI 与原生生命周期规则保持。证据见[界面核查记录](../research/ui-refresh-review.md)。

## Hermes inventory follow-up (2026-10-15)

Hermes category and configured extra roots are now inspected read-only, with bundled/external origin and original CLI management boundaries. CLI mutation implementation remains unchanged; no implicit migration or adoption is added. Verification and upstream adoption findings are maintained in [Hermes inventory research](../research/hermes-skill-inventory.md).

## UI consistency follow-up (2026-10-15)

Implemented the accepted card/Pi presentation repairs and shared Textarea/Popover compositions under the active design baseline. The authorized follow-up also addresses Pi draft loss, skill-test controls/scrolling, detail/result copy and language-row ordering; scope and verification limits remain explicit. See the [consistency audit](../research/ui-consistency-audit-2026-10-15.md) for scope and evidence; the remaining optimization plan is not marked complete.


## Skill collections and configuration entry (2026-10-15)

Implemented the accepted managed/Agent skill inventory tabs and capability-specific actions, Pi configuration marker, and static non-configurable Agent cards. Pi skill configuration candidates remain research only. Verification and source classification rules are maintained in the [collection review](../research/skill-collections-review.md); no upstream lifecycle rewrite is implied.

## Workbench idea and current entry cleanup (2026-10-15)

The workbench remains a recorded idea requiring fresh research, not an implemented module. Current changes only hide existing creation/test entry points, move Add skill into the managed inventory toolbar, expose the displayed Agent directory as a clickable path with an icon, and hide empty action menus. Native lifecycle behavior remains unchanged. Scope and verification are recorded in the [entry cleanup notes](../research/skill-workbench-ideas.md).


## Inventory, Agent management and appearance presentation (2026-10-15)

Implemented the approved concept within the existing navigation, capabilities and palette system: soft inventory Card surfaces, a compact sortable Agent list, and grouped appearance rows with eight theme thumbnail choices. The subsequent authorized layout revision uses a 14rem sidebar and full-height content plane, collection counts in Tabs and a shared single-row search/filter/refresh and action toolbar below them, and consistent store/space/settings title-to-Tab spacing. Settings Tabs sit below the title; appearance uses three outer-framed control groups without divider lines. Existing themes, fonts, Pi controls, managed/native collections and lifecycle handlers remain. The macOS-only icon keeps the original artwork with transparent safe area and rounded corners; other platform icons are unchanged. Bounded build, desktop and persistence evidence is recorded in the [UI consistency audit](../research/ui-consistency-audit-2026-10-15.md); this does not complete the broader optimization plan.


## 同源安装性能优化（2026-10-16）

已实现同源显式清单的原版 CLI 批量安装，以及 Git 来源检查仓库的临时会话复用。安装前远端引用查询、变化时浅拉取／重查、安装后逐项内容／目标／适用锁及无关内容校验保留。正常来源不变时，两技能安装从原逐项流程的约四次克隆降为实测两次；返回来源重查未增加克隆。临时会话在关闭、来源替换、消费、过期和正常退出时释放，异常退出遗留目录有独立清理范围。

24 项针对性原生测试和 35 项前端合同／提示测试通过；隔离 HOME 的打包应用验证了来源重查复用、双技能安装、来源变化拦截及退出释放。构建、CLI 原始文件比对和限制见[安装来源复用记录](../research/installation-source-reuse.md)。未运行全量桌面回归或公网性能基准，未改动真实技能数据。

## Loading performance follow-up (2026-10-25)

Implemented the authorized Agent/plugin loading fixes: coalesced in-flight reads, reuse of verified native observations, locale-only discovery reads, bounded per-view editorial page reuse and parallel independent Agent inspection with unchanged merge order. This does not introduce a persistent inventory cache or a replacement lifecycle engine. Measurements, targeted results, the pre-existing DSH fixture failure and packaged verification are recorded in [the loading audit](../research/loading-performance-audit-2026-10-25.md); the broader optimization plan remains incomplete.


### Managed Codex inventory loading follow-up (2026-10-26)

The user reported slow/repeated managed-skill reads across global/project views. The previous Hook-only loading tests did not cover the full App/ScopeSidebar path. The full-component reproduction showed eager complete inventory reads for background sidebars, discarded completed scope observations and unnecessary account/catalog reads while showing managed skills. The implementation reuses session observations by scope/context, invalidates on explicit refresh/operations, uses a lightweight original Agent metadata reader for sidebars. Entering Codex automatically enriches the active scope once so the plugin count is available without opening its tab; unchanged scope/tab/locale returns reuse that observation. No persistent cache or new UI is added. Deterministic request counts, actual runtime measurements and verification limits are maintained in the loading performance audit; this does not complete the entire optimization plan.


The loaded plugin count follow-up corrects a regression in the above session reuse: read-only catalog enrichment must preserve other scopes' observations. Only actual writes and explicit refresh invalidate them. Acceptance now includes returning to a previously loaded global/project plugin count after reading the other scope's catalog, including visible numbers and request counts; details and remaining verification limits are in the loading audit.


### 2026-10-28 目录诊断归因与重复计数

同一问题跨全局／项目合并一次展示和计数，分组仍列出全部受影响范围；不同路径及不同插件包的问题保留各自身份。摘要不再把全部库存警告称作目录问题。DSH 桌面运行包读取及具体缺包归因见 [spec 0009](0009-dsh-native-skill-management.md#2026-10-28-桌面运行包读取兼容)。


## 2026-10-28 本地材料清理与进度对齐

- 清理前未发现 Cargo／Rust 编译任务；保留正在运行的正式 App，不重启、不修改真实 Agent 数据／凭据，也不触碰另一已注册 worktree。
- 删除项目链接用的松散 `skills_space_lib*.rcgu.o` 对象、Cargo incremental／flycheck 缓存；保留依赖库、build scripts、正式与唯一 QA App、dist 和官方 Node 下载缓存。后续修改项目 crate 时 Cargo 会重新生成相应对象／增量数据，本次不为验收重新制造这些缓存。
- 删除已提交批次的工作副本／索引快照、旧浏览器 preview 构建、经哈希确认重复的测试 Node runtime、无关语言包副本及旧 TypeScript/Finder 生成物。保留源码研究片段、结果摘要、原生验收截图／日志、React 测试依赖及可复用隔离数据。
- 唯一 QA App 的持久 `fixture/`、启动 allowlist、预期种子和证据均保留；移除已停止实验的 registry 标记。现有 `prepare-qa.py` 检查通过。结束的本地 issue 标为历史已完成，旧提交拆分计划不再留作活跃任务。
- 按同一口径实测目录占用减少约 27.3 GiB：target 约 34.8 → 7.9 GiB，.scratch 约 615 → 164 MiB；详细清单在本地 `.scratch/project-maintenance-20261028/report.json`。正式／QA 可执行文件、依赖锁和原版 Node 二进制哈希不变。
- 同步文档索引、0004／0005、Pi／Codex／DSH 状态、B5／B6 对账、ADR 范围与中英文 README：区分已实现／已提交、定点验收、历史失败、未观测范围和明确暂缓项。原始日期与测试结果保留，不创建第二套 roadmap。

验证仅针对此次维护：文件保留哈希、QA 准备入口、本地 Markdown 引用／锚点、提交引用和 diff 格式；未改产品代码，不重跑构建、生命周期、UI 或完整测试套件。本次维护改动尚未提交；此前七批提交已完成。


## 2026-10-28 Release 体积实测

用户要求在保留功能和原版 CLI／Node 的前提下构建一份正常 release，与现有 debug 比较，不新增测试 App。执行 `CI=false CARGO_NET_OFFLINE=true pnpm tauri build --bundles app` 成功，使用现有默认 release profile，未增加体积优化配置或改变产品代码。

| 组成（包内文件大小，MiB） | Debug | Release |
| --- | ---: | ---: |
| 主程序（含前端资源） | 54.37 | 18.89 |
| 官方 Node | 106.18 | 106.18 |
| CLI／依赖／其他资源 | 5.82 | 5.82 |
| 合计 | 166.37 | 130.89 |

合计减少 35.48 MiB（21.33%）；同口径磁盘占用从 168.13 MiB 到 132.65 MiB。正式产品标识和版本均为 `com.skills-space.desktop`／0.1.0，release 路径为 `src-tauri/target/release/bundle/macos/Skills Space.app`；原 debug 包所有 693 个文件哈希保持不变。Node 相同；CLI 及依赖 577 个文件、运行资源 689 个文件的相对路径和字节均一致。

本地测量与保留核验详见 `.scratch/release-size-comparison/comparison.json`。本次只构建和比较产物，不启动用户 App，不重跑完整功能／视觉验收；保留同一唯一 QA App，未建立新的测试 App。此记录不把 release 编译成功当作新一轮全流程验收。


## 2026-10-28 系统 Node 隔离对照（评估，未接入 App）

本机 Homebrew Node `/opt/homebrew/bin/node` 为 v25.9.0；App 随附官方 Node 为 v22.20.0。原版 skills 1.7.4 声明 Node >=22.20.0，Pi 1.4.0 声明 >=22.19.0；满足最低版本不等于任意新版本均已资格验证。

使用同一 release 资源、白名单环境和合成 HOME／项目，分别用两个 Node 执行：来源解析／发现、文档与哈希、Eve 转换、Pi 全局／项目技能与包读取、Hermes 技能、DSH 文档校验。10 类 helper 各重复 3 次，输出一致。Pi 仅引用已安装原版程序文件，设置由夹具构造，不读取现有用户配置／凭据，不执行扩展入口。原版 skills CLI 在全局／项目均完成 Git 来源安装→list→制造提交→update→检查安装内容→remove→检查删除；无公网 Git 访问。公开 npm 元数据 HTTPS 在正常网络对两版均成功；受限环境最初均为 DNS ENOTFOUND，不能归因为系统 Node 不兼容。

| 子进程样例中位数（ms） | 随附 22.20.0 | 系统 25.9.0 |
| --- | ---: | ---: |
| `--version` 启动，7 次 | 10.82 | 15.62 |
| 来源发现，3 次 | 41.76 | 68.14 |
| Pi 全局包读取，3 次 | 143.90 | 184.51 |

这是一台机器上的小夹具子进程对照，不是整 App、真实个人库存或网络加载速度结论；未观察到换系统 Node 带来的提速。

影响边界：当前 release `Engine::from_app` 固定选择同目录 `skills-space-node`，系统已安装 Node 也不会自动采用它。模拟桌面精简 PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) 找不到 `node`，绝对 Homebrew 路径存在；这不是对正在运行 App 环境的读取。若接入外部 Node，需要路径发现、版本资格、缺失／移除／升级处理；还未在真实原生窗口中切换该执行链，也未验证其他 Node 版本、系统或企业代理／证书环境。DSH 桌面 ASAR 的配置读取仍走其原版 Electron，是另一条运行时路径。

体积影响仅为推算：若将约 106.18 MiB Node 完全外置，当前 release 包内文件可由 130.89 MiB 降到约 24.71 MiB；尚未构建这种包。保留随附 Node 作后备则不会获得这部分包体缩减。

详细结果及计时在 `.scratch/node-runtime-comparison/results.json`，合成 HOME／项目已清理。第一次仅按 Codex 卸载仍留下共享 canonical 技能，两版均相同；随后将夹具改为在选定范围移除全部测试技能关联，保留更新文件与实际删除断言后通过。现有 App、Node 和业务代码未修改，未创建测试 App，未复用现有登录；不将此对照记作已完成系统 Node 接入。


## 2026-10-28 系统 Node 接入（用户已授权，未提交）

- 全局设置新增 Node.js：实际运行版本／目录、重新检测、选择可执行文件、恢复自动检测；不改 Agent、项目或其他偏好设置。
- 执行入口优先兼容系统 Node（>=22.20.0），或已选文件；发现 PATH 和常见版本管理器路径，不执行 shell 初始化脚本。失效的执行文件会重新检查；有效观察在进程内复用，切换语言不重新请求。
- 缺少兼容版本时才下载官方 22.20.0，使用仓库固定 SHA-256 校验归档，保留 Node、LICENSE 及发行包自带的原版 npm/npx 到应用数据目录（不含头文件和文档）；安装包移除 sidecar，构建仍随附原版 skills 1.7.4。
- 子进程 PATH 前置实际 Node 目录，临时使用会话也保留该优先级，避免 Finder 精简 PATH 中 Pi 默认 npm 操作找不到程序；不修改系统 PATH。
- 下载失败可在全局设置重新检测或手动选择，短时间并发调用复用失败结果，避免重复下载；不改系统 Node、不读取现有登录凭据。

### 构建、原版一致性与功能验证

- 最终 `pnpm build`、正常 debug/release 和复用的同一编译身份 QA App 均构建通过。正常包内 MacOS 目录只有 `skills-space`；debug 63,842,237 B（60.885 MiB），release 26,062,557 B（24.855 MiB，磁盘分配约 26.61 MiB）。与此前 release 文件合计 130.89 MiB 相比约减少 81%；未增建测试 App。
- debug/release 各 577 个原版 skills 1.7.4 与依赖文件逐字节对照均一致。过时的忽略生成 Node sidecar 已删除；保留官方归档证据／夹具缓存，不修改用户安装。
- 系统 Node 的版本边界、选择重启读取／重置与其他偏好字节保留、无效程序、缓存与 symlink 失效、shim 的实际执行路径、并发复用和 hash 损坏共 8 项通过；子进程 `env node`／原版 npm 优先级 2 项通过。
- 最终定向复验：临时使用 8 项、Pi 包记录 1 项、显式原版 Pi 1.4.0 全局／项目更新 1 项、原版 skills CLI 全局／项目完整生命周期 1 项、错误反馈 24 项通过。实际 Node/npm 官方 HTTPS 下载、固定 hash、可执行性、不保留 headers/docs、work 清理和下次复用通过；只使用合成 HOME／空 npmrc 和公开下载，不读取现有凭据。
- 一次较早全库结果为 218 通过、7 失败、27 忽略；后续 PATH／UI 修正使用上述定向复验，不重复整库。7 个 DSH 失败来自既有夹具缺原版 app-boot 运行包：同一夹具分别用旧官方 22.20.0 和系统 25.9.0 都返回相同 reader unavailable；未改断言、安装用户依赖或记为通过。
- 本地 Markdown 检查 168 文档／539 引用无失效，`git diff --check` 通过。原始验证证据保留在复用 QA 的 `evidence/node-runtime-*`。

### 实际 App 设计验收

- 使用同一个独立编译标识 QA Tauri App 和现有隔离 HOME，未用浏览器替代。正常自动检测、原生文件选择、手动选择重启保留、无效文件／旧版本反馈、恢复自动检测均已观察。
- 独立审查发现并修复：相同路径重复展示；普通文件误报权限错误；英文 18px 窄窗三按钮挤压路径；首次启动下载提示早于偏好加载导致语言未更新。最终正常／浅深色及 960×640 英文深色 18px 定向复验通过，按钮全文字与路径可读，空间不足时操作换行。
- 首次缺失 Node 的 sandbox 模拟曾因 linker 临时签名未绑定 Info.plist 时丢失 macOS LaunchServices 身份；对同一已编译独立 ID 的 QA bundle 做标准本地 ad-hoc 签名后已能绑定窗口，未加生产测试开关或新增 App。真实 App 缺失／下载失败后重新检测、真实官方备用 Node 就绪、系统 Node 隐藏且网络不可用时重启复用均已观察通过；最后使用仅限 QA 的有界慢失败代理，实际观察设置页 Downloading Node…、检测与选文件按钮禁用、唯一英文下载提示，失败后操作恢复。`aria-busy` 静态检查通过，原生 AX 观察到禁用而未单独暴露 busy；中途切语言恰在完成边界，不声明稳定中段窗口观察。新增实际 Hook 渲染回归验证中文→英文更新同一通知、不重复订阅或发起工作、结束／卸载后清理，1 项通过。

验收结论：本轮 Node 设置与运行依赖核心范围通过独立测试和实际 App 设计验收；其余旧功能、其他系统、账号服务和上述明确边界不扩大结论。QA／慢代理已停止，下载的 Node/npm 同盘恢复且哈希未变，没有残留第二份副本；未操作个人运行中的 App 或读取现有凭据，正常 debug/release 构建已更新。代码尚未提交。

## 技能商店性能与页面整理（2026-11-02）

当前提交状态：数据层 `1130aad`、共享界面与商店交互 `f5248be` 已本地提交；当前每页数量为12／24／48可选，完整验证及剩余手动检查见0004末尾记录。下列“尚未提交／未提交”是各轮历史检查点，不覆盖本段。

已实现并完成定向验证，正常 App 已打包更新，用户手动验收待完成，尚未提交。商店从 App.tsx 内联分支整理为独立 SkillStore 页面组合，复用现有库存卡片、工具栏、文档预览与安装向导；这不表示其余 App.tsx 模块拆分全部完成。

榜单改为官网公开 JSON 分页，复用 HTTP 连接、同页请求、内存结果和首批快照，刷新绕过缓存；搜索不再筛选已下载榜单或按安装量重排，保留服务端返回顺序。详情与简介现改为共享官网完整正文请求和缓存，浏览不克隆仓库；只有安装才进入原来源检查。网站来源的正文、简介与发布者链接一并修正。未提供未经测量的耗时百分比承诺。

定向代码、隔离原版 CLI 和正常 App 观察证据及其边界集中记录在[能力计划商店条目](0004-upstream-capability-completion-plan.md#技能商店优化2026-11-02)；输入／按钮实际等高、真实清除点击、键盘焦点、搜索清空恢复和安装预选均已检查。

后续共享交互增量：将管理页既有卡片点击和详情标题／元数据组合抽为共享组件，商店直接复用；SkillDocument增加仅供缺失原文时的HTML预览能力，正常商店详情由真实SKILL.md驱动既有预览／源码。原文数据源及限制见[调研](../research/store-skill-source-data.md)，实施与验证进度见0004对应条目。未增加依赖或页面样式。

该增量定向验证、正常App打包及实际卡片／预览源码／网站来源转换检查已完成；用户手动验收待完成，未提交。完整证据及未观察边界保留在0004，未重复旧安装验证。

网站安装／搜索分页／简介增量：复用完整网站来源接入既有安装流程、12项本地搜索分页及共用官网文档请求；补齐短正文与首段提取，移除卡片独立重试操作。源码、正文、安装来源能力分开判断，缺辅助地址不挡正文。定向验证、打包和用户手动检查状态见0004同名条目。

该增量的定向测试、唯一正常App构建及实际网站地址／分页／短正文转换检查已通过；正常App保留供用户手动验收，未提交。

商店详情元数据拓展已实施：共用详情和CodeBlock，补齐元数据与安装／概述Tab，修复Summary／正文分区及旧缓存补读，卡片拥挤动作与M/K文案按追加要求统一。定向测试、最终正常App打包、实际Tab／复制／可选字段／窄宽卡检查通过，用户手动验收待完成，未提交；完整证据与首包缓存修复记录见0004。

## 新项目发布前的目录与隐私清理（2026-11-02）

已清理约15.2 GiB可再生编译中间文件、下载缓存、旧任务日志及临时快照；保留正常与共享QA应用包（4份包内可执行文件哈希未变）、可复用QA数据及依赖目录，未修改应用数据或Agent配置。文档中一处个人绝对路径改为`~`，补充环境文件及证书／私钥文件的忽略规则。当前受Git管理文件（含二进制资源）按个人用户名／真实主目录及临时目录规则复查无命中，未跟踪日志、证书或编译产物；凭据样式命中已核对为明确的测试夹具。

本轮为本地清理及文档／忽略规则调整，未重建应用或运行功能测试。旧Git历史未重写；重新发布应从清理后的受管理文件创建新仓库，不复制旧`.git`、忽略目录或个人配置。清理时尚未提交的README改动已保留，现按用户授权与清理修改分批整理提交。

发布边界按用户最新要求修正：保留必要系统约定路径和明确的虚构路径测试，仅清除真实开发者机器路径及隐私。上一轮移出跟踪的114个安全开发文件已恢复跟踪，包括`.agents/`技能、`.codex/`审查配置、`AGENTS.md`／`CLAUDE.md`与开发技能锁文件；相关开发文档及引用恢复，供后续开发复用。真实本机`.pi/settings.json`含个人绝对路径，继续仅本地保留并沿用既有忽略规则，不发布实际配置。应用代码及运行行为不变。已清理的缓存、日志及个人路径不恢复；旧Git历史未重写，新项目仍应仅导入核验后的受管理文件。本轮仅跟踪边界、忽略规则及文档变化，按用户授权整理提交；未构建、推送或发布。

干净源码交付采用提交后文件快照，保留安全的Agent配置、开发技能、规则与开发文档；只导出受管理文件，不包含旧Git对象／远端／标签、本机`.pi/settings.json`、缓存、日志、依赖目录或构建包。源码目录不初始化Git；可据此创建独立新仓库。导出后核对文件内容、权限、隐私规则及压缩包内容，并生成逐文件和压缩包SHA-256校验。

## 独立仓库初始提交准备（2026-11-02）

新仓库为`arch3rPro/Skills-Space`，使用新的`main`根提交承接清理后的源码、安全Agent配置、开发文档和真实产品截图，不导入旧分支、标签或Git对象。旧项目保留为`arch3rPro/skills-space-bk`。中英文README使用新仓库地址，文档中旧哈希明确作为迁移前的证据；开发规则不再要求导入上游历史。初次推送仅上传源码，不创建标签、Release或发布安装包。隐私／文件清单／图片／本地链接检查复用并复查，本次未改应用行为或重复构建；剩余实际界面及跨平台检查按原记录保留。

## README核心能力与双语产品截图（2026-11-02）

中英文README将主要功能整理为紧凑的六行功能表，移除连续小标题与介绍段落，合并重复CLI说明；保留独立Agent适配表和双语真实截图，开发检查与构建命令折叠展示。全局／项目归入管理范围，原版CLI作为独立技术优势说明。移除每页数量／跳转等细节展示，Agent适配表保留具体支持边界。两份README分别使用真实运行中的正常Skills Space英文／中文技能空间截图，按用户选定滚动位置展示完整卡片；未使用隔离App、重绘UI或更改应用实现。用户授权在真实全局目录新增9个Anthropic／Vercel技能用于展示，原有条目保留，正常App托管数量由4增至13；新增技能保留待用户自行卸载，安装清单及本机路径不随项目分发。原版CLI结构化安装结果、实际技能文件及应用列表均已核对。图片与文档校验单独执行，本次不重复应用构建或旧功能测试。

README适配清单补充：按固定skills CLI 1.7.4声明列出全部通用支持Agent，排除已列入增强适配的Codex／Pi／Hermes及非Agent的Universal目录目标；常用Agent直接展示，完整清单折叠。双语页首图标与标题改为上下居中，消除行内基线错位。仅文档变更，未重新构建应用。

README信息层级调整：移除首页关于发现／运行时加载差异、操作资格和内部平台验证范围的提示；原有能力边界及平台验证记录继续保留在对应规范与计划中。首页保留DSH配套插件这一直接使用前提，未扩展平台支持声明。

README统一文案审查：原版CLI说明聚焦上游一致性；通用支持移除重复否定说明；DSH首页仅保留插件用途与安装前提，具体策略范围留在原规范；Node说明简化为自动检测／准备和手动选择；Codex适配表按现有设置实现明确列出技能目录预算、插件默认状态和账号工具设置。中英文同步，文档引用与差异检查通过后按用户授权提交并推送。
