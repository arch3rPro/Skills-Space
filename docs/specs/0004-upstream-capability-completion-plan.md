# 上游能力补齐与技能管理闭环计划

迁移说明（2026-11-02）：本项目已作为 `arch3rPro/Skills-Space` 独立初始化。本文旧提交／分支及“已提交”记录是备份仓库中的历史证据，不是新仓库的 Git 历史；不据此推定新版本的手动检查或跨平台验证已完成。

日期：2026-10-12；当前状态核对：2026-11-02。状态：受支持来源的核心生命周期、已批准原生适配及后续插件增量已实施并提交；剩余范围与验证缺口见下表。优先级依据：先补齐上游能力与技能管理全流程，再考虑远程等扩展。当前主线为 `main`（原 `codex/upstream-native-refactor`）；保留原版布局、主题、卡片及 Agent 图标，不新增中心库。

2026-11-02 分批提交：共享 UI `79b32ef`、Node 运行时 `cd1ae2a`、Pi 设置 `260221e`、DSH 管理 `ec1feb3`、通用版本加载反馈 `008a896`。本次只整理既有实现及验证记录，不将未观测的视觉、会话或跨平台行为补记为通过。

本文件同时记录原始分阶段计划与注明日期的交付证据；实施状态以最新交付段落和上游命令映射为准，旧阶段的参数、测试数字与完成状态仅描述当时版本，不自动成为当前待办。0003 仍定义当前架构与安全边界；本计划调整后续能力接入的顺序。

2026-11-12 DSH 补充：下表是 2026-11-02 的历史对账，不涵盖后续独立 `dsh-skills-space` 伴随插件 0.2.2 的未提交工作。当前隔离 Host 的页面检查、完整插件与精简策略插件的生效归属及剩余生命周期顺序，以[0012 第 38.15 节](0012-dsh-settings-native-skills-rebuild.md#3815-clean-host-acceptance-and-policy-reconciliation-2026-11-12)为准；版本读取已实现，更新／同步／差异等仍待开发。

<a id="当前状态与剩余工作2026-10-28"></a>

## 当前状态与剩余工作（2026-11-02）

核对依据：当前源码、固定的 `skills@1.7.4`、各 spec 的有日期验证记录，以及 `main` 截至 `da8ee87` 的提交。以下四类是当前工作入口；后面的原始阶段清单与历史验证记录保留原日期、结果和限制，不重新计入待办，也不把已提交解释为所有场景验收通过。保留旧日期锚点，兼容既有引用。

### 已完成

这里表示已实施并提交；各项验证覆盖仍以对应记录为准，未观测部分单列到“待验证”。

| 能力 | 当前交付 | 依据与边界 |
| --- | --- | --- |
| 核心技能生命周期 | 发现、预览、安装、同步、检查更新、卸载和失败回读已接入原版 CLI | 受支持来源有隔离证据；全部来源、参数和平台覆盖不作推定，见[命令映射](../research/upstream-command-map.md) |
| 安装结构化结果 | 非 well-known 的 `add` 已使用 `--json` 并适配结构化结果；well-known 保留独立 provider 路径 | 成功仍需核验实际文件与锁记录；不能再把全部 `add --json` 列为待开发 |
| 商店／项目工具 | 排行榜与搜索、依赖安装、项目锁恢复的受支持路径已交付 | 锁恢复的特定条目扩展列入待开发，不把现有恢复流程整体标为未实现 |
| 创建与临时使用 | `init`、`use` 后端及流程已实现；普通页面入口按用户要求隐藏 | `showSkillAuthoringActions=false`；不重新开放入口，也不宣传为当前可用页面功能 |
| Pi 设置及扩展包 | 原有扩展包管理已交付；代码模式、目录设置和所属扩展入口已随 `260221e` 提交 | 见[0006](0006-pi-skill-management.md)；不扩展为通用 Agent 管理 |
| Codex 技能及插件 | B1–B4 本地管理、市场、默认设置、项目覆盖和更新流程已提交；B5 核心加载协调已修复 | 真实账号插件及 B5/B6 剩余验证分列下方，见[0010](0010-codex-skill-plugin-management.md) |
| DSH 配置与技能管理 | `ec1feb3` 已提交配置文件／预设读取、技能目录用户覆盖、完整发现库存、全局／项目托管及原生技能的独立启停与调用策略 | 策略不修改技能文件；本地集成的配套插件版本为 v0.2.2，本次合并未改版本。目录设置父 preset 覆盖已纳入，完整预设编辑及插件市场管理未纳入；见[0012](0012-dsh-settings-native-skills-rebuild.md) |
| 系统 Node 与备用下载 | `cd1ae2a` 已提交兼容系统 Node、显式可执行文件选择、受控官方备用下载及全局设置 | 原版 CLI 不变，正常 debug/release 不随包携带 Node；平台验证边界见[0005](0005-project-optimization-plan.md) |
| 共享界面与读取反馈 | `79b32ef` 统一共享控件和来源筛选居中；`008a896` 区分版本加载、确认未知与读取失败，并修复旧详情回包覆盖 | UI 基线已推广且有分项证据；构建及静态通过不替代尚未记录的实际交互 |

### 待开发

以下是已识别缺口或后续候选，不表示已批准设计、排期或自动开工。涉及范围或副作用变化时，先明确方案；不从原始阶段清单批量重做已完成功能。

| 事项 | 尚缺内容 | 安排前提 |
| --- | --- | --- |
| 项目锁恢复扩展 | 当前仍拒绝 subagent/plugin 锁条目；Provider、Eve 等组合保留命令映射中的覆盖边界 | 按条目核对原版合同、完整恢复范围及隔离验证，再决定接入子集 |
| 来源与参数扩展 | Azure Repos 特殊 URL、带认证信息的下载地址及其他尚未支持组合仍有限制 | 区分已实现但未验收与确实不支持，先确定产品及认证边界；别名、关闭的遥测及隐式全 Agent 快捷方式不自动成为待办 |
| Hermes 后续候选 | Hub 原生安装／更新／卸载、内置同步／差异恢复、渠道禁用、多配置管理及其他配置能力 | [0008 后续清单](0008-hermes-skill-management.md#明确未做与后续完成条件)未承诺日期，需分别确认合同和 UI 子集 |
| 创意工坊后续 | Codex／Pi 最小验证及同一产物跨 Agent 试用已完成；[0013](0013-skill-workshop.md) 已整理功能、页面与 A—D 开发建议 | 正式入口、草稿／文件、Codex／Pi／Claude Code／Sarvam Code 结构化对话、原安装交接、详情元数据、统一目录入口及工坊主路径已在本地 `main` 集成；内置三技能版本固定／检查更新、只读评估与对话优化已接入。此前 Codex 评估／优化与应用、Pi 方案与构建已有实测记录；本次合并仅完成本机定向测试和构建，未重新实测完整界面。Claude Code／Sarvam Code 实账号模型回合、真实远程更新、删除保护、独立试用和跨平台实机仍待验证；见[独立原型](../design/skill-workshop-preview.md) |
| 结构收拢 | 前端安装状态、库存／操作协调以及原生进程／库存核验的后续模块提取 | 按[0005](0005-project-optimization-plan.md#优化顺序)的实际变更热点推进，不以整体重构延后功能质量 |
| 构建与发布 | 已配置仅手动触发的四平台构建与独立Release草稿入口；本地13项隔离测试及actionlint通过，GitHub运行待明确构建授权 | 失败任务单独重跑、复用同一构建产物；版本说明按上一正式版归类；见[发布指南](../agents/release.md) |

### 待验证

这些事项已有对应实现或实验性支持，不能当成待写功能，也不能从历史定向结果推定全部通过。

- Codex 真实账号插件：独立授权、GitHub／Writing Style 启停、工作区路由、状态读回及相关重启行为，见 0010。
- 认证来源：私有／SSH／企业来源的真实授权宿主验收；已有匿名或隔离夹具证据不能代替。
- B5 性能：真实账号网络和完整库存的端到端耗时；缓存、在途合并和非阻塞检查的核心修复已完成，见[加载记录](../research/loading-performance-audit-2026-10-25.md)。
- B6 与近期局部修复：各记录明确未观测的条件、失败和显示状态，以及最新 DSH 托管／原生、版本加载和来源筛选的实际交互。只补有具体缺口的场景，不据此重跑整套主题／窗口矩阵。
- 跨平台及发行包兼容性：Windows/Linux、更多 DSH 发行版本和运行环境；当前 macOS 及原版隔离结果不作跨平台保证。
- 现有记录未给出当前版本整套回归全绿结论；旧 DSH 夹具失败与后续定点修复分别保留，不能把旧失败自动归为当前产品缺陷，也不能改写为已全部通过。

### 暂缓及本期不做

- DSH 完整预设编辑、复杂动态配置写入及完整插件／插件市场管理；已经交付的配套策略插件不等于开放完整插件管理。
- 插件压缩包导入、账号上传。
- 远程管理、Agent 本体更新、通用模型／Provider／会话管理、定时自动更新。

后续对某个受控插件或账号操作的授权，不自动扩展为上述范围。

**提交与证据：** 本轮功能提交为 `79b32ef`、`cd1ae2a`、`260221e`、`ec1feb3`、`008a896`；文档对账 `af9438d`、项目规则 `da8ee87`。此前 `a788089`、`2c959ae`、`0a836e3`、`05cb50f`、`c068139`、`6021d66`、`0391e9a` 仍是各历史增量的证据。本次只同步文档，未执行新构建、运行时或 UI 验证，不改变原记录的通过／失败／跳过／未观测状态。

## 目标与原则

- 执行层始终使用未修改、固定版本的原版 CLI，不重新实现安装、更新、卸载或锁文件恢复。
- 固定使用未修改的 skills@1.7.4；Node 最低 22.20.0，遵循显式选择、兼容系统运行时及固定官方备用版本的现有解析规则，不再要求所有用户随包使用同一 Node。升级必须单独核对命令、参数、锁文件、Agent 路径及 Node 需求，不能直接替换依赖。
- 完成“发现/输入来源 → 预览 → 选择 → 安装 → 查看 → 检查/更新 → 卸载 → 刷新核验”的主流程，以及失败后的人工恢复路径。
- 上游命令、别名和参数逐项记录为已接入、待接入或明确不适用；别名无需各自占一个按钮。CLI 终端文案只用于诊断，不据此宣称操作成功。
- 项目补充能力优先解决上游缺少的可靠预览、状态解释与结果核验；不扩展差异矩阵、自动同步或远程；2026-10-13 用户明确恢复原排行榜浏览，与搜索一并作为来源发现入口。
- GUI 只展示操作、状态与实际影响。实现归属、打包版本和未来规划写在文档里。

状态术语以 [CONTEXT.md](../../CONTEXT.md) 为准；本计划中的“已检测”不证明 Agent 可执行程序已安装或已加载技能。

## 原始第一阶段：状态准确与目录显示

1. 区分 Agent 已检测、技能目录存在、目录中有技能三件事；上游检测通常基于配置路径，不等同于可执行程序验证或技能实际加载验证。
2. 未检测到的 Agent 不出现在技能卡片的“已安装 Agent”图标中；其设置卡片和手动打开的页面标为“目录中的技能”，不隐藏物理内容。
3. 保留原始目录关系作为共享变更影响核验依据，不能因 Agent 未检测到而漏报共享目录被删除的影响。
4. 用户 HOME 下的目录在界面、悬浮提示、选择器标签、确认摘要和应用生成的诊断中显示为 `~`；内部仍使用绝对路径。支持输入 `~/...` 后展开为执行路径。用户技能文档原文不做内容改写。

验收：只有 `.agents/skills` 而没有 Cursor 配置的 fixture，不把 Cursor 标为已检测，也不把它列入技能卡片的 Agent 图标；已有技能仍可查看。HOME 缩写不误替换相似用户名路径，打开目录与安装传参不受影响。

## 原始第二阶段：核心生命周期闭环（最高功能优先级）

| 环节 | 补齐内容 | 验收结果 |
| --- | --- | --- |
| 来源 | 对照原版全部来源形式，包括仓库子目录/树链接、SSH/私有仓库、下载及其他原版支持形式，逐类验证，不自行推定支持 | 已支持的来源能预览并交给原版安装；暂不能可靠预览的来源明确失败，无隐式全量安装 |
| 预览 | 对齐原版技能发现与元数据语义，减少保守 YAML 子集导致的误拒绝；覆盖隐藏/内部技能、同名技能及深度限制 | GUI 所选技能与原版实际安装一致；复杂和冲突样例有结果 |
| 安装 | 全局/项目、多技能/多 Agent、链接/复制、重新安装及覆盖确认；盘点 metadata、subagent、full-depth、all 等参数的适用入口 | 安装后目录、内容、来源记录和锁文件结果符合原版；共享影响有提示 |
| 库存 | 同名不同来源、手动放置、未知来源、失效链接、Agent 未检测及共享目录；安装到其他 Agent 的快捷入口 | 不丢记录、不误合并、不声称 Agent 实际加载；可重建来源时可重新发起安装 |
| 检查与更新 | 明确只读检查覆盖；项目/全局、指定技能/多技能更新；准确表达跨 Agent 影响 | 有真实来源变更的端到端证据；前后内容与锁信息可确认时判成功，否则待确认；不把 check 别名当只读命令 |
| 卸载 | 单项/批量/指定 Agent，共享内容、独立副本和锁记录清理 | 目标状态与非目标影响核验一致；失败、部分成功、待确认均可回到当前库存 |
| 失败恢复 | 无网络、权限、来源消失、超时、部分失败、退出码零但未改变、同名歧义 | 不误报成功；刷新实际状态；保留可复查结果，用户能按剩余目标重新发起操作，无自动回滚/重试 |

验证先在隔离 HOME/临时项目中运行真实原版 CLI：本地 Git 仓库可确定性制造更新；再验证真实 HTTPS 来源及授权可用的私有/SSH 来源。无凭据时不能宣称私有来源通过。覆盖 GUI 完整操作，不只验证 native 方法。

本阶段完成门槛：至少一个项目来源和一个全局来源各完成安装、查看、制造更新、检查、更新、卸载；覆盖一个共享 Agent 与一个独立目录 Agent；全部失败分支有可理解的返回路径。

## 原始第三阶段：补齐常用上游入口

| 命令 | 计划入口与闭环 | 验收 |
| --- | --- | --- |
| `find` / `search` | 在原版技能商店来源区域增加搜索；结果进入既有安装流程，支持 owner 限定 | 核验固定版本真实搜索接口、空结果、断网和分页/截断；来源身份不丢失；排行榜按用户补充要求单独恢复 |
| `init` | 在技能空间增加创建技能入口；选择项目或目录、命名，调用原版生成模板；创建后查看并进入安装 | 模板生成、已有文件不覆盖、创建不等于安装，后续安装可完成 |
| `add` 剩余参数 | 按前一阶段盘点逐项接入，只有适用操作才显示对应控件 | 每个支持参数有真实 CLI fixture；危险或隐式批量行为必须有具体摘要确认 |
| help/version | 命令清单和开发诊断维护，不把执行层宣传放在普通页面 | 固定版本及命令映射可追溯 |

搜索是来源发现，创建是来源生产；都复用既有预览、确认、执行和结果流程，不另起一套安装逻辑。

## 原始第四阶段：上游其余独立工作流

1. `use`：临时使用技能，核验该版本支持的执行 Agent、进程交互、退出与清理；与持久安装分开，不能把临时使用展示为已安装。
2. `experimental_install`：从选定项目锁文件恢复；显示恢复范围及覆盖影响，调用原版，完成后核验库存与锁记录。
3. `experimental_sync`：从选定项目的依赖与可选 Git 声明发现技能，选择 Agent、复制／链接及筛选／清理选项后确认完整清单；1.7.2 不再提供 force，遵循上游语义，不包装成 Agent 间自动同步。
4. 对照命令清单做最终覆盖审计。仍不能接入的参数/平台必须记录原因、替代路径和验收条件，不能把按钮占位当作完成。

上述为原始工作安排；已接入与隐藏入口状态见本文件当前状态表，不能继续将整组列为未实施。

## 完成判定与范围

- 每一阶段交付代码、命令映射、隔离行为测试及桌面操作验证记录。
- 构建通过不是闭环完成；真实来源变更、结果核验和失败恢复必须有证据。
- 2026-10-12 的交付修正了第一阶段界面表达并制定本计划；其余能力仍须逐项实施和验收。2026-10-13 的规范收尾不修改功能代码。
- 远程管理、差异对比、定时/自动更新、旧中心库迁移不进入此轮。跨平台测试仍应进入发布验收，不能用 macOS 结果代替。

## 历史交付与核验记录（2026-10-12，macOS）

以下保留该次验证结果，本轮文档核查未重跑这些测试或桌面流程。

- 第一阶段的 GUI 表达与 HOME 缩写已实施；其余阶段为待执行计划。
- 根因：固定上游的 getAgentBaseDir 对通用 Agent 返回共同 canonical 目录；本项目 inventory 的补充扫描遍历所有 Agent 路径，并把目录中内容关联到每个共享 Agent。GUI 原先把这种物理关系直接当作“已安装 Agent”，导致未检测 Agent 的误导。
- 回归测试先复现了 Codex 已检测、Cursor 未检测但共用技能目录时，Cursor 被算入已安装展示的错误；修复后通过。目录关系仍留给原生变更核验使用。
- `pnpm test:frontend-contracts`：7 项通过；`pnpm build`、macOS debug app 打包与 `git diff --check` 通过。无新增依赖。
- 桌面核验：Cursor 显示“未检测到”和“2 个目录中的技能”；目录为 `~/.agents/skills`。进入 Cursor 页面有未检测提示。Agent 设置页未再显示 HOME 的绝对路径。未改变用户真实技能。

## 本轮交付与验证（2026-10-13，macOS arm64）

### 已实施

- 沿用现有页面、侧栏、字体、主题、卡片与 Agent 品牌图标，仅补齐原有弹窗和结果区的操作反馈；未调用技能或子 Agent，无新增运行时依赖。
- 来源预览改用随原版 CLI 打包的 YAML 依赖，支持注释、多行描述与嵌套元数据；支持仓库子目录、GitHub/GitLab 树链接及 Git URL/ref；内部技能默认隐藏，同名冲突（含隐藏技能）明确阻止。安装前再次核对所选预览指纹，避免来源已变化仍执行旧确认。
- 全局/项目 GitHub、GitLab、Git 来源只读检查，比较上游锁记录与来源内容，并核对实际安装内容。兼容 GitHub 目录 Git SHA 与上游回退 SHA-256，不将本地改动误判为最新。检查不调用有写入副作用的 `check` 别名。
- 原版更新后按技能核对实际内容、原有目标关系、非目标技能及锁记录；同一可靠来源的独立副本可一起更新，但保持各自库存记录。不同或未知来源仍阻止按名称更新。
- 结果区提供逐项核验说明、当前技能入口、重新确认未完成项及未完成更新的来源重装入口。重试先回到确认或来源预览，不自动执行、不重做已验证项、不回滚。
- 从详情进入安装可预填含 ref 的来源及技能；来源不明时可由用户补充来源。安装完成后主视图切至实际安装范围；刷新清除过期更新状态。
- 隔离启动应用时继承的 coding-Agent 环境标记，防止上游 update 意外只面向启动应用的 Agent。进程超时后终止进程组，避免子进程继续写入。

### 行为与构建证据

- `pnpm test:frontend-contracts`：9 项通过，涵盖原有库存/路径规则、同源副本更新资格及仅选择未完成项的恢复规则。
- 标准 Rust 测试：13 项通过，1 项联网测试默认忽略。真实原版 CLI 在临时 HOME/项目中完成全局链接和项目复制安装、制造来源版本变更、只读检查、更新核验、卸载与锁清理；覆盖未检测 Agent 副本未更新后的手动重装、共享卸载影响、来源变化、部分失败/零退出码无变更以及超时子进程终止。
- 单独运行 `real_https_git_source_lifecycle`：1 项通过，公共 GitHub 来源预览、安装、只读检查、原版更新及卸载均在临时 HOME 完成。此网络测试的 update 为无版本变更核验；真正的新版本更新由确定性 Git fixture 验证，未修改公共仓库。
- `git diff --check` 通过；36 份文档的 127 个本地链接可解析，包内 15 个原版 bin/dist 文件逐字节一致，正式应用 identifier 未被测试配置替换。
- `pnpm build` 与 `CI=false pnpm tauri build --debug --bundles app` 通过；Vite 保留已有大 chunk 提示。打包原版 CLI、官方 Node、YAML、许可证及内部只读检查脚本。
- 独立 bundle identifier 的桌面测试应用使用临时 HOME 和本地 Git fixture：全局完成来源预览、多 Agent 链接安装、查看 Version 1、来源提交 Version 2、只读检查（磁盘仍为 Version 1）、更新并查看 Version 2、卸载后库存为空。项目完成从 Codex 页面进入、预选 Agent、复制安装两个独立副本、来源 Version 3 更新核验；范围和目录显示为 `~`。随后将 Claude Code 设为未检测并保留旧副本，更新结果正确显示待确认；点击“从来源重新安装”返回来源预览，保留所选技能、重新选择目标并确认后恢复为已验证；最后批量卸载项目内所选安装关系，结果已验证，界面库存与实际目录/锁记录均为空。

### 尚未交付或验证

- 当时第三/四阶段的 `find`、`init`、`use`、`experimental_install`、`experimental_sync` 尚未接入；`metadata`、`subagent`、内部技能显式选择及其余批量参数未全部开放。`--full-depth` 已由预览/安装流程使用，`--all` 不隐式启用。
- 直接下载、well-known、不能可靠枚举的来源和同名冲突仍暂缓 GUI 安装；深度、数量、文件大小等核验边界外保留明确限制或待确认，不声称全来源覆盖。
- SSH/私有 Git 地址可走已有认证的 Git 预览路径，但尚无真实私有仓库/SSH 认证验收；远程主机管理未实现。Windows/Linux 的打包和进程终止仍需平台验证。
- 核验不是事务保证。上游更新可能影响同源其他技能，未检测 Agent 的独立副本可能保留旧内容；共享卸载可能清理其他目录关系。发现不符时刷新并报告待确认，由用户核对、确认并恢复。

## 卸载修正交付（2026-10-13，macOS arm64）

- 保留技能空间及 Agent 页的“卸载”按钮、原有侧栏/卡片/主题与弹窗布局。新增只读卸载清单，不新增删除执行器，所有路径/锁写入仍由未修改的上游 `remove` 完成。
- 共享目录按技能展开到共用该实体内容的 Agent 及相关链接，在确认页列出实际路径、共享内容/副本/链接类型、已检测的受影响 Agent；未检测的目录关联单独折叠说明，不当作已安装 Agent。
- 上游以剩余已检测 Agent 路径是否存在决定保留共享内容，独立副本也可能阻止共享清理。确认页明确提示，并提供“将这些副本加入卸载清单”；重新生成清单后再次确认，不静默删除独立副本。批量展开按技能隔离，不能把某技能新增的目标应用到另一技能。
- 执行前重新核对清单；安装关系、链接目标或来源记录变化时拒绝旧确认。恢复操作重新预览当前状态，不重用过期清单。
- 结果逐路径展示已删除共享内容、已删除副本、已删除链接、已保留、未删除、失效链接或无法读取，并报告来源记录清理状态及其他技能核验情况。目标仍存在时显示“未完全卸载”，不再只有通用“待确认”。额外共享影响仍保守标注，但给出实际路径结果。
- 验证：前端既有 9 项通过；标准 Rust 16 项通过，1 项 HTTPS 测试默认忽略（本次不涉及网络集成，未重跑）。新增真实 CLI fixture 覆盖全局/项目共享清理、剩余副本阻止清理与明确选择后的清理、批量目标隔离及确认后新增安装拒绝；已有链接、副本、共享额外影响和零退出码未删除回归核对结构化结果。
- `pnpm build` 与正式 `CI=false pnpm tauri build --debug --bundles app` 通过，保留已有大 chunk 提示。正式包 identifier 正确，15 个原版 bin/dist 文件与依赖包逐字节一致，无新增依赖。
- 独立桌面测试应用在临时 HOME 验证：Claude Code 页副本卸载显示已删除副本/保留共享内容，链接卸载显示已删除链接/保留共享内容；Codex 页共享卸载列出 Codex、OpenCode 与 Claude Code 链接影响，Pi 副本未选择时实际保留共享内容，结果明确显示已删链接、未删共享内容及保留副本；未完成项重新预览后明确加入 Pi 副本再确认，再次执行后共享内容与 Pi 副本均显示已删除、结果已验证；实际目录核对一致，其他两项共享技能保留。
- 仍需 Windows/Linux 验收；没有修改或重新卸载用户真实技能，没有调用技能或子 Agent。


## 排行榜恢复与搜索交付（2026-10-13，macOS arm64）

- 用户明确恢复原排行榜浏览，覆盖之前 D11 的移除决定。沿用原版商店页签、总榜/趋势/热门、三列卡片及分页；增加搜索页签，不修改侧栏、主题、字体或 Agent 图标。
- 榜单只读解析网页明确的 initialSkills 数组，保持榜单顺序，五分钟缓存；筛选和每页 12 项分页只针对已加载条目，界面不把网页总量冒充可浏览总量。网页/HTTP/解析失败明确显示错误和重试。
- 搜索使用固定上游 find 的同一 JSON 接口和 q/limit=10/owner 参数，不解析终端文案；每次最多 10 项，不伪造全站分页。支持 owner 验证、无结果、错误详情与重试；编辑条件使旧请求失效。
- 两种发现结果都保留仓库来源和技能标识，进入现有安装向导并预选所选技能；来源预览后找不到标识时要求核对与重新选择，不能隐式安装全部。非 Git 来源保留展示，明确暂不支持可靠预览。
- 搜索安装联调修正来源内容期望：按照原版 copyDirectory 排除 metadata.json、__pycache__、__pypackages__；已安装内容和非目标内容仍完整观察。预览指纹和锁哈希语义不变，不修改 CLI 或增加写入执行器。
- 标准 Rust 测试 20 项通过、2 项联网测试默认忽略；单独真实发现测试通过三个榜单（各 600 条已加载记录）、owner 搜索（10 项）和无结果查询。HTTP 503 fixture、异常/缺失 JSON、owner 不符、Next Flight 跨块解析、榜单分页、命名空间技能与真实 CLI 排除文件行为均有覆盖。前端既有 9 项通过。
- 桌面隔离 HOME 已核对原版卡片风格、排行榜翻页、owner 搜索、无匹配提示和错误重试入口；榜单 find-skills 完成预览、预选、Codex 安装并显示已验证。搜索 vercel-react-best-practices 同样准确预选并安装到 Codex，排除文件核验修正后复测显示已验证；实际目录与来源记录一致，原有 find-skills 保留。
- 前端与正式 macOS debug app 构建通过，保留既有大 chunk 提示；正式 identifier 正确，包内 15 个原版 bin/dist 文件逐字节一致。36 份文档的 127 个本地链接可解析，格式检查通过。
- 无新增运行时依赖；未调用技能或子 Agent，未修改真实用户技能。Windows/Linux 和完整网站榜单远端分页仍未验收；其余上游命令按原计划继续。


## Init 创建流程交付（2026-10-13，macOS arm64）

- 技能空间原有工具栏增加“创建技能”，复用原有弹窗、按钮、主题与卡片样式；不新增导航或改变 Agent 显示。
- 支持选择已有目录，在同名子目录或所选目录直接生成 SKILL.md。先只读检查和展示实际生成路径，再明确确认；目录以 ~ 展示。GUI 名称使用 1–64 位小写字母、数字、连字符或下划线，以字母或数字开头，避免上游直接拼接路径/YAML 造成无效模板。
- 写入只调用未修改的原版 init。确认前存在 SKILL.md（包括失效链接）、目标为文件/符号链接或确认内容变化时停止；执行后核对普通文件、可读内容、名称和描述。没有模板不能因退出码零判成功；不自动重试或覆盖。
- 创建结果显示实际路径和模板，可打开文件编辑、打开目录检查，再明确进入原有预览安装流程；安装前重新读取文件并预选技能。创建位置与安装范围分开，创建本身不安装或写锁记录。失败/无法核验时保留路径、日志和回到创建入口。
- 新增 3 项真实 CLI/边界回归：两种 init 用法、创建未安装/未写锁、全局与项目的预览安装卸载并保留源文件、已有文件不覆盖、无效名称/路径/链接、确认后已有文件或篡改计划拒绝、零退出码无模板失败。完整原生测试 23 项通过、2 项联网测试默认忽略；随后对打开目录的只读守卫调整，创建相关 3 项复测通过。前端既有 9 项通过。
- 桌面隔离 HOME 验证：新建子目录 → 只读路径检查（磁盘尚无文件）→ 创建并显示模板 → 打开文件/目录；通过隔离文件修改核对安装预览读取新内容且准确预选，随后 Codex 全局安装显示已验证。重复创建显示已有 SKILL.md、拒绝覆盖，文件与安装内容仍一致。项目范围默认带入项目目录，选择现有 current-skill 目录直接创建后，以复制选项安装到项目范围，结果已验证；实际安装文件与源文件一致，两个来源模板均保留。弹窗、工具栏、主题、侧栏与 Agent 图标沿用原有样式，路径显示 ~。
- `pnpm build` 和正式 `CI=false pnpm tauri build --debug --bundles app` 通过，保留既有大 chunk 提示；正式 identifier 正确，15 个原版 bin/dist 文件逐字节一致。格式检查与本地文档链接检查通过。
- 无新增依赖，未调用技能或子 Agent；测试仅写临时 HOME/项目。原版 init 不是对外部并发文件写入的原子事务，不承诺跨进程防覆盖保证。Windows/Linux 仍待验收；本轮仅实施 init，后续按项目锁恢复、node_modules 技能发现、参数/来源、use 的顺序继续。


## 项目锁恢复交付（2026-10-13，macOS arm64）

- 项目技能空间原有工具栏增加“从锁文件恢复”，复用现有弹窗、主题、卡片和 Agent 图标，不新增页面。固定调用原版 experimental_install，不写自有恢复器或重写用户锁文件。
- 检查严格校验 version 1 的普通 skills-lock.json，展示当前来源、共享目标、已检测 Agent/其他目录关联，以及独立副本保留路径。恢复使用当前本地/Git 来源内容，来源不同于记录时明确提示；不声称固定内容回滚，不重建独立 Agent 分发。
- 锁含 node_modules 时，按上游发现规则预览整个依赖扫描范围（含 scoped/pnpm 链接包）；额外技能明确列入确认。默认匹配锁哈希可能跳过缺失目标，允许明确选择重装依赖，再重新检查整个清单；该选项只影响依赖阶段。
- 锁 SHA-256、来源内容、目标类型/链接/哈希和实际目录关系变化时拒绝旧确认。重复/冲突名称、缺失或不可核验来源、未知版本、内部/plugin/subagent 来源以及共享根目录链接等不可靠边界明确限制，不将预览错误视为空锁或静默跳过。
- 结果逐项报告目标存在性、实际内容与来源是否符合、锁记录是否符合/变化，以及已恢复、已满足、未恢复或需核对；非目标内容/关系/记录异常另列路径。退出码零、部分恢复和默认跳过缺失文件都有明确结果。恢复操作重新检查整个清单并再次确认，无自动重试/回滚。
- 新增 7 项恢复回归覆盖真实本地 init 来源、Git 来源变化及锁刷新/独立副本保留、依赖额外项和 force 修复缺失目标、无效锁与锁/来源/目标/确认变化拒绝、缺失 generic Git sourceUrl 与凭据隐藏、部分实际结果和零退出码未变更。完整原生测试 30 项通过，2 项联网测试默认忽略；随后对已知共享失效链接提示过滤调整，恢复相关 7 项复测通过。前端既有 9 项通过。
- 桌面隔离 HOME 验证：只读预览没有恢复文件；清单后修改锁文件时拒绝旧确认，目录与独立副本不变。最新清单正确显示本地来源 ~、额外依赖、共享 Codex/Claude Code 和保留 Pi 副本；默认恢复实际得到 2 项符合、1 项目标不存在，结果分别显示已恢复/未恢复。明确勾选依赖重装、重新检查并再次确认后，缺失依赖已恢复，3 项内容与记录符合，其他项显示已满足；项目库存刷新为 5 条，保留同名独立副本。实际三项内容/锁哈希、Claude 链接修复、来源文件、独立副本、无关技能及全局未写入均核对一致。弹窗截图核对原有主题/卡片/侧栏与 Agent 图标，目录使用 ~。
- `pnpm build` 与正式 `CI=false pnpm tauri build --debug --bundles app` 通过，保留既有大 chunk 提示；正式 identifier 正确，15 个原版 bin/dist 文件逐字节一致，包内文件哈希读取实际验证通过。36 份文档的 127 个本地链接可解析，格式检查通过。
- 无新增运行时依赖，未调用技能或子 Agent，未修改用户真实技能；Node 辅助脚本只增加文件哈希读取，Agent 通用可见性从固定上游表派生。独立 experimental_sync 入口仍待下一步，远程与 Windows/Linux 未因此交付或验收。


## 独立依赖安装交付（2026-10-13，macOS arm64）

- 项目技能空间和 Agent 页面增加“从依赖安装”，沿用工具栏、弹窗、主题、卡片和 Agent 品牌图标；从 Agent 页面进入预选当前目标。全局范围不展示此入口。目录使用 ~，不增加执行层或发布阶段宣传。
- 只读扫描 node_modules，复用锁恢复的依赖发现与路径观察，支持根技能优先、普通包、scoped 包和 pnpm 包链接。选择明确 Agent 后确认整个扫描清单；原版 experimental_sync 没有单技能筛选或复制选项，GUI 不补造这些参数。
- 上游匹配锁哈希时默认跳过，目标缺失或新增 Agent 也不例外。确认页逐项说明跳过、安装/替换、共享影响及来源记录替换；重新安装选项处理全部发现技能。项目 Agent 根目录缺失时，上游可能只写共享内容，确认页提示，结果分别报告共享内容和 Agent 目标，不能因 CLI 报成功而视为安装到目标。
- 写入仅调用未修改的原版 experimental_sync --yes --agent [IDs]，force 只在用户明确选择后传入。执行前重新生成计划，来源哈希、锁哈希、目标类型/内容/链接或 Agent 根目录情况变化时拒绝旧确认。无技能、名称冲突、异常锁、符号链接安装根目录、超出有界核验范围均明确限制。Eve 会转换文档格式，暂不开放本入口；保留原版 CLI 使用路径，后续需专项核验。
- 结果逐技能/Agent/共享路径显示实际目录或副本、链接目标、内容、安装关系及锁记录核对状态。缺失目标显示未安装到目标；按哈希跳过也报告实际结果。未选择的独立副本与其他锁记录逐项观察，不自动重试或回滚；重试回到目标选择与新清单确认。内部技能环境标志对依赖安装和恢复统一清除，与预览默认隐藏保持一致。
- 新增 6 项真实原版 CLI/边界回归：scoped/root 优先、独立副本保留、默认跳过缺失目标与 force 修复、项目 Agent 根缺失的部分结果、所选副本转链接与来源记录替换/无关锁保留、确认后来源/锁/目标/Agent 根变化拒绝、空发现、同名冲突、无效锁、pnpm 链接包与符号链接写入根限制、零退出码未变更。前端既有 9 项通过；正式打包后的原生完整回归 36 项通过、2 项联网测试默认忽略，本次没有重跑联网测试。
- pnpm build 与正式 macOS debug app 构建通过，保留既有大 chunk 提示。正式 identifier 正确，包内 15 个原版 bin/dist 文件逐字节一致；格式检查通过，23 份当前入口/规范文档的 88 个本地链接可解析。无新增依赖，未调用技能或子 Agent，未修改用户真实技能。
- 桌面隔离 HOME 读取全局/项目库存，核对项目工具栏入口、原有布局与 Agent 图标、~ 路径；临时项目来源/独立副本保留且未生成安装目录或锁。完整弹窗点击验收未完成：窗口自动化坐标操作持续返回 noWindowsAvailable，键盘无法关闭范围菜单，重新建立连接和系统启动服务启动后仍复现。此项是待补桌面验证，不能用原生回归或构建替代。工具在关闭窗口后曾自动以正常 HOME 重启测试包，仅只读查看后关闭，未执行真实技能变更。
- Windows/Linux、真实私有/SSH 来源及远程管理未因此交付或验收。后续继续参数/来源覆盖审计，再接入 use 的临时使用流程；不把依赖安装称为 Agent 间自动同步。


## 内部技能选择与参数盘点（2026-10-13，macOS arm64）

- 沿用原有来源 → 技能 → 安装目标 → 确认 → 结果向导，来源步骤新增“显示内部技能”，默认关闭。开启仅改变只读预览，不自动选中；变更选项清空旧预览和技能选择。列表标注内部技能，确认摘要列出实际所选内部项；普通布局、主题、导航和 Agent 图标保持。
- 选项随安装请求及未完成项恢复保留，确认前按同一选项重新读取来源并核对内容指纹。内部/公开同名冲突仍拒绝执行，内部-only 来源默认不给出可安装清单；显示后仍需明确选择。执行继续传具体 --skill 名称，由原版 add 的 includeInternal 语义完成安装，不使用通配符或自有写入器。
- 原版默认 list 会过滤内部技能，实际文件虽可被目录观察到，却缺少原版来源信息。只读 list 现显式开启上游 INSTALL_INTERNAL_SKILLS，以完整读取已安装内部技能及来源；实际更新仅在当前来源快照验证为内部技能时向原版 update 及其子进程开启该标志。其他写入清除继承的内部技能环境开关，避免桌面启动环境改变范围。项目锁恢复、依赖安装仍保留既有内部技能限制。
- 新增 3 项回归覆盖：全局/项目默认隐藏与显式安装，未选内部项不安装，副本/链接与卸载保留源文件；内容/选择标志变化和公开/内部同名冲突拒绝；内部 Git 来源在两种范围完成安装、当前检查、制造来源变更、检查可更新、原版更新、实际内容核对、再次检查及卸载。全局本地目录安装不产生来源锁，按原版实际行为核对，不伪造锁记录。
- 参数与来源逐项盘点集中在上游命令映射：metadata 仅是遥测 JSON，本项目关闭遥测，不新增普通 GUI 控件；all 同时扩展全部技能与全部 Agent，不能当作“全选可见技能”；subagent 是 Eve 专属路径/格式，需要专项库存、更新及卸载核验后接入。前缀、别名、@skill、片段过滤、自定义 GitHub host、provider 来源仍有适配/验证缺口，没有宣称全部来源和参数完成。
- 完整原生回归 39 项通过，2 项联网测试默认忽略，本次未重跑联网测试；前端既有 9 项通过。桌面隔离 HOME 完成默认只见公开技能、开启后内部技能未自动选中、只选内部项并确认 Codex、安装显示已验证、查看完整文档与 ~ 路径、共享卸载显示已删内容、库存归零；实际目录与结果一致，未选公开技能没有安装，两个来源文件均保留。确认页截图核对原有弹窗、主题、侧栏、卡片和品牌图标。本轮使用 AX 控件与 setValue 完成路径输入及操作，没有依赖此前故障的坐标/范围菜单操作，不据此宣称上轮依赖安装弹窗已补验。
- pnpm build 与正式 macOS debug app 构建通过，保留既有大 chunk 提示；正式 identifier 正确，包内 15 个原版 bin/dist 文件逐字节一致。格式检查通过，23 份当前入口/规范文档的 88 个本地链接可解析。无新增依赖，未调用技能或子 Agent；未修改真实用户技能。Windows/Linux、私有/SSH 来源和其他未接入参数/来源仍待专项验收。


## 来源语法接入（2026-10-13，macOS arm64）

- 来源预览与 Git 来源快照直接读取固定原版包的 parseSource 函数及其只读依赖块，支持上游前缀、精确仓库别名、返回的技能过滤与分支引用。旧 Rust 来源语义解析分支已移除，只保留协议/凭据/路径边界；不维护第二套别名表或自有安装器。
- 原版包未导出解析器，新增只读 Node helper 从未修改的 dist 文件读取已知函数边界，在受限 VM 中调用，输入作为数据绑定。缺少边界、解析失败或未知来源类型时拒绝预览。打包阶段增加原版引用/过滤结果的只读冒烟检查；原版 CLI 文件不修改，helper 不启动 main、不提供写入或网络能力，无新增运行时依赖。
- 继承的 GH_HOST 与原版执行使用同一环境解析；测试默认隔离该变量，专项只读 fixture 验证企业主机简写。没有新增主机配置页面，也没有宣称真实企业 GitHub/私有认证验收。绝对本地路径使用上游 resolve 结果，~ 仍由既有界面展开；相对路径暂不开放，以免预览与项目执行 cwd 不一致。
- 来源返回 skillFilter 时，只展示一个可见的、大小写不敏感匹配的元数据技能，沿用现有列表说明来源指定项并预选其实际名称；仍需选择 Agent/范围和明确确认。执行前同样重新预览，不允许在请求中追加未预览技能。缺失、隐藏、通配符、公开/内部或大小写同名冲突、无法可靠识别的 plugin 展示名均拒绝，不将失败当作空仓库或默认全选。
- 原始来源字符串仍交给原版 add，解析结果与其追加过滤行为一致。保留上游精确别名与部分前缀/片段组合丢弃过滤的语义，不自行修正或笼统承诺所有 @/片段组合有效；未返回过滤的来源走普通逐项选择。直接下载/well-known、完整 plugin 身份和真实私有/SSH 来源仍有接入或验收缺口。
- 新增 3 项来源回归覆盖：前缀、两项上游别名、过滤优先级、编码分支和 GH_HOST 解析，凭据/越界/通配符限制；真实 Git 通过重写到隔离仓库验证 7 种输入（含 release/one 分支）交替覆盖全局和项目范围的明确安装、仅安装所选项、锁记录及卸载；缺失/隐藏过滤、额外技能请求和大小写冲突拒绝。零退出码 fixture 增补只读解析资源，继续验证没有实际变更时不能报成功。
- 前端既有 9 项通过；原生完整回归 42 项通过、2 项联网测试默认忽略，本次未重跑联网测试。前端构建通过，保留既有大 chunk 提示。
- 桌面隔离 HOME 验证 github:fixture/repo@FIXTURE-SKILL 只显示并预选 fixture-skill，选择 Codex 后确认页保留原始来源、只列所选技能，安装结果已验证且库存只有 1 项。不存在的过滤停留来源步骤；改为 #main@other-skill 后只读预览正确定位并预选另一项，未执行安装。实际内容与来源一致，全局锁只有所选项，未选技能不存在；截图核对原有弹窗、卡片、主题、侧栏与品牌图标。测试 Git URL 只重写到隔离本地仓库，未修改真实技能或真实 Git 配置。
- 收尾核查补充原始 HTTP(S) URL 的凭据/查询参数检查（含来源前缀），避免上游规范化清除这些字段后绕过既有拒绝边界；补充 fixture 后来源相关 6 项复测通过，1 项 HTTPS 测试按默认忽略。此前完整 42 项通过记录保留，未将专项复测当作再次完整回归。
- 正式 macOS debug app 构建通过；identifier 正确，15 个原版 bin/dist 文件逐字节一致，新只读 helper 与源码一致，实际使用包内 Node/解析脚本完成前缀过滤冒烟验证。格式检查通过，23 份当前入口/规范文档的 88 个本地链接可解析。无新增依赖，未调用技能或子 Agent；真实私有/企业认证、其他操作系统、provider/plugin 和 Eve 子 Agent 仍待专项接入或验收。


## Eve 根与子 Agent 管理（2026-10-13，macOS arm64）

- 沿用原安装向导和原版卡片/侧栏/主题/品牌图标，项目目标选择 Eve 后可勾选根 Agent 与现有子 Agent，确认页显示实际路径与文档转换；全局不提供 Eve。库存保留每个物理记录，卡片标注 Eve 根/子 Agent 位置，不引入新的 Agent ID 或专门页面。
- 所有写入继续调用原版 add/update/remove。只读 helper 读取固定包的 parseFrontmatter 与 stripIgnoredEveFrontmatter，构建转换内容期望，不写替代模板。Eve 使用自身独立目录，根与各子 Agent 不共享普通 .agents/skills；混合安装时其他 Agent 仍按正常复制/链接语义执行。结果逐 Eve 路径显示实际目录/链接、内容符合或目标缺失，不能只凭退出码或任一位置成功判断全部完成。
- 确认和核验采用原版项目锁 subagents；安装子集会更新同名锁记录为本次选择，未选旧副本保留但可能变为来源未知，不能承诺自动更新。可靠 Git 来源检查比较转换内容，原版项目更新重放记录的位置并核验每个目标、转换内容、锁哈希与位置列表。异常锁位置、非法/缺失目录、符号链接父目录、不可可靠映射名称在执行前拒绝；不根据残留配置宣称 Eve 程序已安装/加载。
- 原版 remove 没有 --subagent。选择 Eve 的卸载清单覆盖项目根和所有子 Agent 的同名目录/链接，包含无有效元数据的残留目标；确认页明确整体影响，原版 remove 执行，逐路径报告实际删除/保留及锁清理。只对 Eve 多位置放开整体卸载，其他 Agent 的同名歧义守卫保留；不新增按子 Agent 物理删除器。
- 有界支持：最多 100 个现有可映射子 Agent；Eve 技能名称当前限唯一、非空、200 字符内 ASCII 目标；转换 JSON 输入限 64 KiB，并沿用普通文档/树限额。保留 root 规范化选择，不自动创建新的子 Agent。Eve 全局、扁平 provider .md 文件、依赖安装的 Eve 独立 canonical 计划、锁恢复的 subagents 仍待扩展；扁平文件以库存路径警告提示直接检查，不伪装成已支持的目录技能。
- 目录 SHA-256 与元数据校验分离：没有 name 的转换文档仍可只读观察内容；无有效元数据的普通来源不会因此被当作可安装技能。新增依赖安装、锁恢复回归确认未相关的 Eve 内容保持不变，避免其缺少 name 导致原有流程误报无法核验。
- 新增 4 项 Eve 回归：混合 Codex/Eve 根及多个子 Agent 的转换、二进制/嵌套 SKILL 文件和锁/实际目录；整体 Eve 卸载包含无元数据残留并保留其他 Agent/来源；Git 当前检查、来源变化、更新重放全部记录位置；复制子集保留旧位置且不冒用来源；无效位置、全局、链接父目录、部分零退出与内容正确但仍为链接的零变更不报成功。另有 2 项跨工作流保留回归、1 项前端整体 Eve 删除/其他 Agent 歧义边界回归。
- 前端 10 项通过；完整原生回归 48 项通过、2 项联网测试默认忽略，收尾链接/名称边界后 Eve 相关 4 项复测通过。本次不重跑公网来源测试，不将普通 fixture 当作真实 Eve 执行或私有认证验收。
- 桌面隔离 HOME 核对项目范围、Eve 侧栏与原有布局、主题、品牌图标，项目路径使用 ~。范围选择实际已切换，但系统下拉菜单无法经 AX/键盘收起，坐标操作仍返回 noWindowsAvailable；因此本轮 Eve 安装弹窗、结果与卸载确认的桌面全流程仍待补验，不以原生回归代替。测试窗口已关闭，未执行真实用户技能变更。
- pnpm build 与正式 CI=false pnpm tauri build --debug --bundles app 通过，保留既有大 chunk 提示。正式 identifier 正确，包内 15 个原版 bin/dist 文件逐字节一致，inspect-eve.mjs 与源码一致，包内 Node 实际完成原版转换冒烟验证。格式检查通过；无新增运行时依赖，未调用技能或子 Agent。Windows/Linux、真实 Eve 程序加载、provider/plugin 与 use 仍待后续接入或专项验收。


## 插件清单分组接入（2026-10-13，macOS arm64）

- 来源预览读取固定原版 getPluginSkillPaths/getPluginGroupings；只读 helper 仅接收预读清单，不启动 CLI 主入口、不提供写入或网络。读取 standalone plugin.json、marketplace.json 的 pluginRoot/source/skills，补充原版优先目录中的立即子项发现；规范化临时仓库实际根，避免 macOS /var 与 /private/var 重复观察。
- 原有技能选择卡片增加插件分组标记，确认页逐所选技能列出分组；布局、主题、侧栏、卡片与 Agent 品牌图标保持。上游 1.5.20 安装身份仍为技能原名，原版过滤按原名大小写不敏感匹配，不支持虚构的插件命名空间；同名歧义仍拒绝。分组加入确认指纹，清单分组变化即使技能文件未变也要求重新预览，普通锁哈希保持原值。
- 原版 add/update/remove 执行全部变更。全局来源锁保存 pluginName 时核验实际分组并在库存卡片展示；项目锁不保存分组，GUI 不补造。原版 getOwnerRepo 由既有只读解析 helper 返回，用于区分会记录全局来源的 URL 与本地/file:// 无全局锁的实际行为。可靠 Git 来源继续检查更新及逐内容核验；同源更新可能安装其他分组技能，不承诺仅当前分组受影响。
- 清单每份限 1 MiB、最多 200 个插件及每插件 200 个路径引用；输出路径/分组及优先目录扫描条目最多 2000，保留普通 200 技能与内容限额。异常 JSON/类型、链接清单/父目录与越界目标拒绝，不把失败当作空来源。原版忽略的外部/对象 source 不被扩展成新来源。
- 新增 3 项回归覆盖 marketplace/root/source 与 standalone 深目录分组、原名过滤和命名空间拒绝、默认仅安装所选项、分组变化拒绝旧确认、重复名/无效 JSON/类型/链接清单拒绝；原版 Git 在全局/项目安装、实际来源变更、检查更新、更新及卸载；全局分组锁/项目无分组锁、本地及 file:// 全局无来源锁、同源更新额外技能和源文件保留。
- 前端 10 项通过；完整原生回归 50 项通过、2 项联网测试默认忽略、1 项既有 HTTP fixture 因沙箱禁止回环监听失败。该 HTTP 测试随后在允许本机监听的环境补跑通过；收尾条目上限与 file:// 边界后插件 3 项专项复测通过，不将专项复测说成再次完整回归。前端严格构建通过，保留既有大 chunk 提示。
- 桌面隔离 HOME 完成：插件来源预览显示两项分组且均未默认选中；只选 fixture-skill、选择 Codex 后确认页列出 review-tools，原版安装结果已验证，库存仅 1 项且显示锁内分组；卸载明确显示 ~ 共享路径、已删除共享内容和来源记录，库存归零。实际目标不存在、未选 other-skill 没有安装、两个来源文档保留且全局来源锁为空。确认页截图核对原有弹窗、主题、侧栏、卡片与品牌图标。测试包已关闭，无真实用户技能变更；不据此宣称此前项目范围菜单受阻的 Eve/依赖安装桌面流程已补验。
- 正式 macOS debug app 构建通过，identifier 正确；包内 15 个上游 bin/dist 文件逐字节一致，新增插件 helper 和更新的解析 helper 均与源码一致，包内 Node 实际完成双技能分组与 getOwnerRepo 冒烟验证。格式检查通过，20 份当前规范/入口文档的 80 个本地链接可解析。无新增运行时依赖，未调用技能或子 Agent；直接下载/well-known、Eve 依赖/锁恢复、use、真实私有认证与其他系统仍待后续接入或验收。


## well-known 与索引下载接入（2026-10-13，macOS arm64）

- 复用原有来源 → 技能 → 目标 → 确认 → 结果向导；预览与确认增加下载地址、文件数量，保留页面、弹窗、卡片、主题、侧栏及 Agent 品牌图标。来源输入提示支持 HTTP(S)。普通 URL 按原版 well-known 索引发现，没有有效索引的任意 Markdown/压缩包直链不另写安装器。
- 只读 helper 读取固定原版 WellKnownProvider、parseFrontmatter 与 sanitizeMetadata，在有界网络/解压环境读取 v1 多文件技能、v2 SHA-256 Markdown、ZIP/TAR.GZ；不写技能文件或安装目录。原版候选顺序及路径/root 回退保留，所选候选部分下载失败则阻止预览，不默认全选或忽略未知项。旧版附件及二进制内容完整比较，metadata.json 等保留文件不套用普通 Git 复制排除规则。
- 明确选择后复核文件内容、索引条目与下载 URL 指纹，原版 add 执行变更；核验每个所选 Agent 的实际内容和原版来源标识、锁记录。全局锁为 sourceType well-known、sourceUrl 和空版本哈希，项目锁只有主机标识和 computedHash。单一安装区原版强制复制，多安装区可使用链接，目标选择与确认按此表达。
- 下载来源检查更新明确返回无法自动核验；详情提供重新预览安装及来源重新输入说明，刷新走原版 add。仅全局 /.well-known/ 记录可可靠还原发现 base；任意 artifact URL 与项目 hostname 不当成可靠发现来源。Eve 下载处理不采用 --subagent 语义且转换哈希不同，GUI 与原生均拒绝 Eve 目标，不宣称普通 Eve 子 Agent 流程已覆盖下载。
- 有界支持：200 技能、每项 200 文件、合计 2000 文件、索引每份 1 MiB、单响应下载和合计技能内容 512 KiB、总响应字节 4 MiB、解压每次 1 MiB、请求 10 秒/最多 5 次重定向，沿用进程 120 秒限制。无索引、索引/文档名称不同、同名/大小写路径冲突、缺失文件、坏摘要、危险路径、凭据/query/fragment 或非 HTTP(S) 下载/重定向拒绝，不能把不可预览当作空来源。错误只显示说明，不把 Node 堆栈/版本放到普通预览错误中。
- 新增 4 项回归覆盖原版全局/项目多文件安装、目录/锁与二进制/metadata.json 保留、只读检查无法自动更新、内容变化拒绝旧预览与确认后重装、卸载；v2 独立 Markdown/ZIP/TAR.GZ、只安装所选项、单 Pi 强制复制、路径/root 回退；摘要/附件/危险压缩包/内部项/名称身份/Eve/query 边界；正常与非法重定向、部分发现失败、零退出无写入不报成功。测试只修改临时 HOME/项目，HTTP fixture 仅监听回环地址。
- 完整原生回归 55 项通过、2 项公网测试默认忽略；最终来源标识/URL 适配后下载专项 4 项复测通过。前端 10 项通过，严格构建通过；保留既有大 chunk 提示。macOS HTTP fixture 已修正 accepted socket 继承非阻塞状态造成的间歇请求丢失，不修改原版 CLI 来掩盖失败。
- 桌面隔离 HOME 完成两项下载技能预览：默认均未选中，选择 ZIP 项后确认显示 3 个文件、artifact URL、Codex 与实际复制方式；安装已验证且库存仅 1 项。实际 SKILL.md、二进制附件、metadata.json 和 provider 来源锁一致，未选 Markdown 项未安装。详情显示 ~ 路径、文档、无法自动更新说明及重新预览入口，artifact URL 无法还原发现来源时回到空来源输入；检查更新返回无法确认并说明重新预览安装。
- 桌面失败验证：保留原索引摘要但修改 ZIP 内容后，来源步骤明确报告预览不完整且未开始安装，未静默只展示可读取的另一项；原已安装内容保持、未选项不存在，普通错误不带 Node 堆栈/版本。随后原版卸载显示实际共享内容及来源记录已删除，库存归零；实际目录不存在、锁 skills 为空，来源 artifact 保留并恢复。截图核对原有布局、弹窗、主题、卡片和 Agent 图标，测试窗口已关闭，未修改真实用户技能。本轮仍未补验此前项目范围菜单受阻的 Eve/依赖桌面流程。
- 正式 macOS debug app 构建通过，最后前端 pnpm build 通过；identifier 正确，包内 15 个原版 bin/dist 文件逐字节一致。包内只读 provider helper 与源码一致，实际使用包内 Node 读取回环索引、解压 ZIP、核对三文件和二进制内容，未生成安装目标。临时 HTTP 服务已停止；格式检查通过，20 份当前规范/入口文档的 80 个本地链接可解析。无新增运行时依赖，未调用技能或子 Agent。真实公网 provider、认证来源、Windows/Linux、索引身份别名、Eve 下载与 provider 锁恢复仍待扩展或专项验收，不据此宣称全部来源覆盖。


## use 临时使用闭环（2026-10-13，macOS arm64）

- 沿用原有页面、弹窗、主题、卡片、侧栏及 Agent 品牌图标，技能空间工具栏和技能详情提供临时使用入口。向导依次完成来源预览、单个技能选择、工作目录与运行方式、确认和会话结果；支持 HOME 或已登记项目。HOME 路径显示为 ~，复制的原始提示词保留支持文件所需绝对路径。
- 原版 use 负责取源、物化、提示词和 Agent 调用。支持生成提示词，以及原版仅有的 Codex/Claude Code 交互模式；可执行命令独立检测并在确认后复查，不把 Agent 配置目录当作程序可用证据。OpenClaw 来源必须显式勾选原版风险接受项，默认不接受。不安装技能、不写技能锁或 Agent 技能目录。
- 私有应用缓存保存会话与临时文件；原版删除 Git 克隆、保留 skills-use 支持目录的行为保持。普通 use 内容签名按原版复制排除 metadata.json、.git 目录及 Python 缓存目录，保留 node_modules 与 worktree .git 文件；provider 保留完整文件映射。确认与执行重新核对来源，私有命令桥在实际 Agent 启动前比较物化字节和原版 buildUsePrompt 输出，零退出但没有实际提示词/Agent 调用不能报成功。原版 CLI 文件不改动，没有第二套安装器或提示词模板。
- macOS 使用系统 Terminal 提供真实 TTY；只在该会话子进程 PATH 中插入桥，最终调用已确认的绝对 Agent 命令。会话结果显示进程状态/退出码、提示词复制、临时目录、停止与释放，不将进程结束宣称为任务完成。关闭弹窗保留会话，重开恢复。正常退出仍有进程组任务时保留它们及支持文件；明确停止结束自有进程组。释放只清理已无自有进程的会话，文件所有权声明防止延迟终端启动与释放竞态。
- 准备阶段限 120 秒，实际 Agent 启动后不设固定会话时长；上限 50 个保留会话、4 MiB 技能内容和 2000 个树条目，提示词 512 KiB、诊断 64 KiB。未知孤儿进程/崩溃状态保留核对，不猜 PID 清理；主动脱离进程组的守护进程不属于进程组约束保证。Unix 提示词模式、macOS 终端模式接入；Windows 进程控制与 Linux 终端启动未开放。
- 完整原生回归 61 项通过、2 项公网测试默认忽略；最后 worktree .git 文件适配后 use 专项 6 项复测通过。覆盖全局/项目工作目录、提示词及支持文件、来源变化拦截、Git/OpenClaw 显式确认及克隆清理、provider 二进制/metadata、真实 PTY 输入和退出码、停止顽固后代、正常保留后台任务、延迟启动/释放竞态、外来路径拒绝与零退出无物化失败。前端既有 10 项通过，严格构建通过，保留既有大 chunk 提示。
- 桌面隔离 HOME 验证提示词全流程：来源只选一项，确认使用 ~，生成后复制按钮反馈已复制；支持文件实际存在且原始提示词含绝对路径，关闭重开恢复同一会话，释放后缓存会话归零。交互模式仅调用测试 HOME 的 ~/.local/bin/codex，实际系统终端启动，fixture 记录 stdin/stdout 均为 TTY、只有一个原版提示词参数、HOME/cwd 均为隔离目录；界面显示 Agent 运行中且禁止释放，点击停止后已停止并允许释放。两个会话释放后库存仍为零、无安装锁/技能目录、来源文档及附件完整保留；截图核对原有布局与风格，测试应用已关闭。
- 桌面验收工具明确禁止操作 Terminal，未向桌面终端输入回复；输入与非零退出语义由 /usr/bin/script 的真实 PTY 专项验证，不混同为桌面手动输入验收。未运行真实已认证 Codex/Claude 任务，不消费用户会话；其他系统及真实认证 Agent 仍需专项验收。
- 正式 macOS debug app 构建通过；identifier 为 com.skills-space.desktop，15 个原版 bin/dist 文件逐字节一致，会话 runner 与源码一致、Agent 配置由原版提取。实际使用包内 Node/runner/CLI 生成提示词并核验支持文件，未产生安装锁，随后清理测试会话。无新增运行时依赖，未调用技能或子 Agent，未修改真实用户技能。


## 升级至 1.7.2 与现有流程回归（2026-10-13，macOS arm64）

- 用户明确要求先升级、差异审计与回归，再按新版补齐。当前精确依赖和打包守卫均为 skills@1.7.2，Node 保持官方 22.20.0；没有改写上游 CLI、覆盖用户命令或修改真实技能。[新版审计](../research/upstream-1.7.2-upgrade-audit.md)记录实际解析器、目录、锁、来源和参数差异；[命令映射](../research/upstream-command-map.md)已改为当前版本，旧版内容移到明确标记的历史记录，不将旧证据算作新版验收。
- 适配 79 个上游 Agent 定义（全局可用 77 个）、Pi/Droid/Kilo 共享目录、Codex 全局声明、Sarvam HOME 与辅助检测；BOM 文档解析、local 全局来源锁和项目相对来源重建；Eve 新版 YAML 格式与保留字段；单安装区强制复制；卸载保留仍被使用的来源记录并核对其未变。原有布局、主题、弹窗、侧栏、卡片和品牌图标保持。
- use 新增原版 Sarvam 命令，移除已被上游删除的 OpenClaw 专用参数与旧确认；Codex/Claude/Sarvam 三种命令均由原版配置派生，真实 PTY 验证单提示词参数、输入、退出码与隔离工作目录。原有来源变化拦截、进程停止/后台保留、提示词复制/会话恢复与临时文件释放回归通过。
- 依赖发现切换为只读原版函数，支持 direct/dev/optional/peer、dist/skills 和 npm 声明；不再维护旧扫描器。现有复制安装/锁恢复显式传 --copy --no-cleanup --no-remote，避免新版默认链接、清理及远程声明扩大未确认的变更范围。移除旧 force 控件及锁哈希跳过说明，缺失目标正常重装；独立目标复制不会误要求未选择的共享区同步变化。已明确安装来源冲突时阻止同步，保留实际副本和锁。
- 最终完整原生回归：63 项通过、2 项公网测试默认忽略；随后单独补跑两项公网测试均通过，分别为真实 skills.sh 搜索/榜单接口和公共 GitHub 来源预览、安装、检查、更新及卸载。实际来源版本变更由隔离 Git fixture 覆盖，公网 update 仍是无变更核验。前端 10 项通过；pnpm build 通过，保留既有大 chunk 提示。新增版本专项覆盖共享路径/BOM/constructor 锁身份、项目相对来源重新预览、依赖 direct/optional/peer/npm 声明、未声明包排除以及不自动清理/远程安装。
- 桌面隔离 HOME：BOM 来源预览只选 upgrade-fixture，选择 Claude/Codex 两安装区后确认显示链接，安装已验证。Claude 页面卸载只删链接，明确报告共享内容和来源记录保留；Codex 页面卸载共享内容，报告来源记录删除，库存归零，实际目录及锁一致。临时使用选择测试专用 ~/.local/bin/sarvam-code，系统 Terminal 启动后 fixture 记录 stdin/stdout 为 TTY、一个原版提示词参数、隔离 HOME/cwd；界面显示退出码 0，释放后会话目录归零，未重新安装技能。来源文档及附件完整保留，截图核对原有布局和图标，测试窗口已关闭。
- 桌面启动核查发现测试偏好误加 version 字段导致 fixture 退出，工具随后以默认环境重启应用并只读显示真实库存；没有执行真实库存变更。关闭后修正测试文件，以直接可执行文件启动并只输出核对 HOME/USERPROFILE，确认隔离后才进行上述变更验收。未修改产品偏好解析规则来掩盖测试错误。
- 其他系统、真实已认证 Agent、私有/企业仓库、此前项目范围菜单受阻的桌面流程仍需专项验收，不以 native 或 macOS 全局桌面结果替代。新 direct download、按来源卸载、well-known 自动更新/锁恢复、workspace/过滤/远程声明/失效清理按新版审计顺序接入；本条记录的是升级适配及回归，不宣称这些新版能力全部交付。
- 正式 CI=false pnpm tauri build --debug --bundles app 通过；identifier 为 com.skills-space.desktop，包内版本为 1.7.2 / Node 22.20.0，15 个原版 bin/dist 文件逐字节一致，所有随包 helper 与源码一致，79 Agent/3 use 命令配置一致。官方下载包 SHA-512 与 npm integrity 一致；实际包内 Node/runner/CLI 完成 BOM 文档提示词与支持文件冒烟，未产生锁，测试临时会话已清理。格式检查通过，26 份当前/引用研究文档的 102 个本地链接可解析。新增运行时依赖仅来自上游 tar 及其传递依赖；未调用技能或子 Agent，未提交或推送。


## 新版直接下载、来源卸载、well-known 更新与同步选项（2026-10-13）

本节是 1.7.2 升级回归后的后续交付，不改写前节升级时的功能状态与测试计数。沿用原页面、侧栏、卡片、主题、品牌图标和既有弹窗；所有安装、更新、卸载、同步写入仍由随应用提供的原版 skills@1.7.2 执行。

- 直接下载：原版 Markdown、ZIP、TAR/TAR.GZ/TGZ 下载器在应用专属临时树中预览，接入现有选择、确认、安装、临时使用和卸载。展示下载地址及文件数量；预览失败、来源变化和危险压缩包阻止安装。HTTP(S) 不接受凭据／查询／片段；预览限 4 MiB 下载／解压、2,000 文件、5 次重定向。按原版不新增来源锁，旧同名来源记录不得被虚构成下载 URL，现有锁保持原状；不承诺直接下载的自动更新或锁恢复。
- 按来源卸载：从技能详情进入，读取当前锁的精确 source，展开技能、物理路径、共享影响和锁清理，支持只有锁记录的成员；执行前重检来源成员及目录状态。实际传入原版 remove 的是确认过的技能名；不隐式全选或自行删除。结果逐项显示实际删除／保留。
- well-known：读取原版 sourceBaseUrl／wellKnownDigest，使用原版摘要与检查函数区分当前、变化、来源已移除。更新由原版 update 写入并核验实际内容／锁；来源移除只提示并保留本地文件，可进入原卸载确认。支持全局／项目；索引失败不能回落为空仓库，带范围 URL 不静默替换为根索引。下载锁恢复仍未接入。
- 新版依赖同步：原弹窗提供本地复制／链接、工作区递归、包含／排除、声明的 Git 来源与失效清理，默认仍为复制、不清理、不安装远程声明。原版发现／冲突／筛选／dry-run 清理函数生成只读计划；重新核对清单与声明指纹后执行。Git 声明遵循原版来源链接模式；已满足的声明不重复安装。清理展开全部实际路径，包含未选 Agent；源目录保留。损坏／含秘密的声明、扫描失败及不完整计划阻止清理。

验证证据：

- 完整原生回归 71 项通过、0 失败，2 项公网测试默认忽略；随后扩展同来源卸载用例同时覆盖全局／项目并单独通过。新增真实 HTTPS 下载测试后，3 项公网测试单独全部通过（技能发现接口、公共 Git 生命周期、公共直接下载生命周期），当前总计 74 项原生用例。测试只修改隔离 HOME／项目。
- 本地 fixture 覆盖 Markdown／ZIP／TAR.GZ、二进制附件、无来源锁、危险压缩包与过期预览；well-known 全局／项目摘要变化、更新、无变化、来源移除及显式卸载；来源成员变化拦截、锁单独成员、其他来源保留；递归／筛选／链接、Git 声明与清理、未选 Agent 路径和损坏／秘密声明拦截。
- macOS arm64 隔离桌面验收：直接 ZIP 预览显示 URL／2 文件，安装已验证，卸载显示实际共享路径删除；本地 alpha／beta 同来源安装后，详情发起来源卸载，确认列出两技能／路径／Codex，结果分别已验证，原始来源保留。well-known Version 1 安装后切换 Version 2，检查可更新、确认更新、结果已验证，实际文件 Version 2；随后空索引显示“来源已移除”且保留本地内容，经卸载确认删除共享内容与 Claude 链接，锁清理。
- 本轮项目范围下拉操作正常完成。桌面项目同步选择 Claude／Codex、链接、递归及 local-package#dependency-*，确认后两个路径均已安装并显示实际链接目标。删除测试依赖声明后，仅选择 Codex 并勾选清理，确认页仍列出 Claude 与共享区两路径，结果全部已清理；实际目标消失、项目锁为空、node_modules 源文件保留。截图核对原布局和图标。桌面发现清理保留说明及结果标签容易误解，随后仅修正文案，最终严格前端构建核对。
- 前端契约 10 项通过；最终 pnpm build 通过，保留既有大 chunk 提示。无新增自有运行时依赖；复用上游已有 tar／yaml 及其传递依赖。

真实已认证 Agent、私有／企业来源、Azure Repos 特殊形式、下载来源锁恢复、Eve 同步／恢复组合与其他平台仍需专项验证，不宣称全部上游能力完成。未调用技能、TDD 或子 Agent，未提交或推送。

正式 CI=false pnpm tauri build --debug --bundles app 通过。包内 identifier=com.skills-space.desktop，skills=1.7.2、Node=22.20.0；15 个原版 bin/dist 文件与官方包逐字节一致，8 个 helper 与当前源码一致，yaml/tar 在包中。实际正式包内 Node／下载 helper／原版 CLI 在临时 HOME 完成 ZIP 预览、二进制附件核验、安装及卸载，无新增来源锁；临时树释放、桌面测试窗口及 HTTP 服务关闭。Rustfmt、Node helper 语法检查和 git diff --check 通过。


## DeepSeek Harness 首批扩展（2026-10-17）

[方案 0007](0007-deepseek-harness-skill-management.md) 已实施：复用原版通用目录及 CLI，增加 DSH 只读检查与“增强适配 / 通用支持”分类。专项生命周期、桌面排序及重启持久化通过；既有批量结果测试预期已修正，完整原生回归 120 项通过、0 项失败、3 项公网测试忽略；未覆盖范围详见该方案验收记录。本扩展不改变本计划其他未完成能力的状态。


## 2026-10-18 Pi invocation and update safety increment

Authorized current work: CLI-managed visibility remains external; native Pi invocation uses true/false/source-default metadata, with independent update/local-content evidence, no automatic local-edit overwrite and field-only recovery after original lifecycle updates. See [spec 0006](0006-pi-skill-management.md) for the source, lock, preference-journal and package-owner contract. Original CLI lock authority and non-local execution boundaries remain unchanged. Implementation and isolated acceptance evidence are recorded in that spec; earlier all-external Pi acceptance does not cover this increment.


### 2026-10-18 — 原版预览发现与选择规则补齐

用户批准按上游通用规则修复，不针对单一仓库。已移除独立递归扫描，复用固定原版 `discoverSkills`、`filterSkills`、frontmatter 解析和元数据净化；补齐目录优先级、同名去重与内部过滤顺序、仓库根锁及子目录范围。实际 GitHub 根地址在隔离桌面包中预览一个技能并安装成功，正文与附件和所选来源逐字节一致；本地/Git × 全局/项目的通用原版 CLI 回归也比较完整目录。136 项原生通过、3 项可选忽略，134 项前端/脚本通过；同名大小写歧义、危险链接、超限及过期确认保护保留。适用范围、其他来源审计、构建和验证边界见 [上游命令映射](../research/upstream-command-map.md#preview-discovery-alignment--2026-10-18)。

## 2026-10-19 — 分批交付与汇总验证

按用户授权，将当前修改分为项目约束、macOS 窗口与侧栏、原版技能发现对齐、DSH 配置与上下文、Pi 调用配置／更新保护／差异恢复、弹窗溢出修复六批本地提交；不推送远端。本机 `.pi/settings.json` 含绝对路径，保留为未跟踪配置。此前验收记录中的“未提交”描述对应历史检查点。

- 汇总前端契约 149 项通过。拆分后的窗口、DSH、Pi 快照分别通过 TypeScript 检查；发现规则及 DSH 快照通过 Rust 测试编译。最终应用代码沿用已通过的 debug 应用构建，不因提交拆分重复打包。
- 汇总原生回归首次为 151 通过、1 失败、4 个可选测试忽略。失败项为同源卸载夹具缺少 Pi 显式项目信任；仅补齐临时项目的 trust.json，保留全部卸载保护断言，定向复测 1 项通过。合并证据覆盖 152 项通过；这是整轮结果加修正后定向复测，不宣称修正后重新跑过完整套件。公网及显式原版 Pi 安装选择测试本轮未执行。
- 弹窗隔离桌面验证覆盖 78 个 Agent 多选／安装确认、32 个技能的长卸载清单和路径展开、小窗口正文滚动与固定标题／操作区；未执行安装或卸载，35 份夹具技能／配置／锁文件哈希不变。应用已重启；文档链接和最终差异检查通过。


## 2026-10-20 Explicit lifecycle restriction cleanup

Completed the authorized cross-flow correction in spec 0003 and Pi field-recovery correction in spec 0006. Auxiliary baselines and local-content differences no longer disable explicit install/sync/update/uninstall; automatic associated-copy propagation retains edited targets, and invocation recovery is field-scoped. Package confirmation now uses the shared AlertDialog composition. Targeted isolated/native/package checks and packaged GUI install/update/sync/remove/restart acceptance passed as recorded in those specs. This does not expand remote execution, native package installation or other deferred capability scope; original CLI ownership remains unchanged. No new full-suite claim, commit or push is made for this increment.


2026-10-20 feedback correction: completed the authorized two batches (remove non-actionable feedback; repair existing action closure). Detail/package state, Diff retry, per-target association results and contextual error summaries now follow the updated UI baseline. Original managed/native invocation ownership, Diff restoration and sync capabilities remain. Scoped build/test and isolated desktop evidence is recorded in spec 0003's feedback correction; no new lifecycle gate, button or explanatory surface was added.


2026-10-20 copy-audit completion: concise configuration terminology, action-specific feedback and observable result causes are implemented without new controls. Original Pi interrupted updates and failed installed-reference persistence reuse existing update/recheck paths; temporary-session history refresh is separate from session startup. Scoped verification and its limits are recorded in spec 0003; this does not mark deferred capabilities complete.


2026-10-20 follow-up decision: keep the existing creation/testing entrances disabled. Creation repair and session-history failure recovery retain native regression coverage; this does not establish desktop acceptance of hidden authoring flows. Additional fault-path and external-editor verification boundaries are recorded in spec 0003.


2026-10-21 increment: the approved 1.7.4 and global-version-check scope follows the contracts and verification record in spec 0003. It does not extend remote execution or automatic updates. Implementation and isolated acceptance are tracked there rather than inferred from older 1.7.2 evidence.


2026-10-21 project-flow increment: the accepted 项目导入 / 重新安装 changes, source-first selection, local-record preview and temporary-source/batched-read optimizations are implemented. Scoped native and packaged functional evidence, including the corrected Git fixture and the remaining screenshot/visual acceptance limitation, is recorded in spec 0003. Whole-record restoration and original CLI ownership remain unchanged.

## 2026-10-25 Pi extension package increment

Status: package/Agent ownership separation and functional checks are recorded in spec 0006. The user rejected the package detail presentation; its previous consistency conclusion is withdrawn. A direct Codex-reference correction is rebuilt, independently test-reviewed and UI-reviewed with default/light window evidence. Remaining pointer-hover and alternate-size/theme manual checks and the scope-limited acceptance status are recorded in spec 0006; no blanket design or user acceptance is claimed.

The user authorized scoped Pi package inventory, installation/removal, existing update/recovery reuse and resource loading controls. Implementation and verification status are maintained in [spec 0006](0006-pi-skill-management.md#2026-10-25-pi-extension-package-management-authorized). This increment does not reopen the deferred full Agent/model/account/session management plan.


2026-10-26 authorized Pi increment: whole-package card enablement, batch enable/disable/uninstall, source labels and native Plugin skills submenus are implemented for review. Original Pi selector/lifecycle ownership and project-only overrides remain in force. Independent targeted tests and scoped default/narrow UI workflow checks are complete in spec 0006, including failure/retry and project isolation. Static and actual narrow-toolbar findings were corrected and rechecked. Unobserved pointer-hover/English/extreme source-label states remain explicitly outside the acceptance evidence; no project-wide or user approval is claimed.


2026-10-26 Pi detail follow-up: source labels/npm artwork, scoped display names, Codex-style detail/manage modes and actual package-skill navigation are implemented. Ten frontend semantic tests and rebuilt app artifacts passed; independent static review found no blocking issue. Scoped actual navigation/visual checks are complete in spec 0006, including both modes’ skill-document round trips and default/light plus narrow/dark/18px. Hover, skill-row focus, over-six expansion and English remain unobserved, not accepted. No lifecycle backend change or new full-suite claim is made.


2026-10-26 Pi repeated-read/management closure: App-session scope caches and in-flight sharing eliminate unchanged menu remount reads; refresh, writes and settings changes invalidate the required contexts. Actual-component request-count regressions and scoped Tauri counters cover ordinary menu/language/mode/document round trips, refresh/scope rereads and mutation readbacks. Card default glyph removal, body introduction alignment and management skill count/Switch are implemented. Inherited project package skills use real original Pi metadata without adding global-owned skills to the project's inventory; project off/on and global-byte preservation passed actual application checks. Detailed evidence and the statically-only Codex rendered boundary are in spec 0006. No unrelated backend suite or project-wide/user acceptance is claimed.


2026-10-26 plugin-page consolidation: the user approved one content-and-management page per Agent, superseding the Pi/Codex Details/Manage presentation above. Both existing components remove mode switching and retain actual permissions, skill navigation, scopes and confirmation flows. Current implementation and verification records are in specs 0006 and 0010; this does not add or change a native lifecycle capability.

2026-10-26 historical scope audit (both findings corrected in the following delivery): whole-plugin Codex project overrides and Pi scoped lifecycle pass isolated original-runtime checks. Two gaps remain open: the Codex project inherited-plugin skill Switch can be offered then rejected by native scope validation; Pi update confirmation does not disclose a sole global installation when entered from a project. Detailed reproduction and verification boundaries are in specs 0010 and 0006. These findings supersede any inference of complete scope closure from the earlier unified-page default-window acceptance.

2026-10-26 App-call correction: the temporary project-skill read-only restriction was incorrect. Original App static code uses skills/config/write from the project view, selecting plugin skills by name and ordinary skills by path; project-config enablement probes tested a different operation. Restore that actual operation, retain real snapshot readback and remove the generic cannot-toggle tooltip. Whole-plugin project overrides remain isolated; Pi update scope disclosure remains intact. See spec 0010 for the corrected evidence and scope effects, and spec 0006 for Pi. Live account-service qualification is not expanded.

## 技能商店优化（2026-11-02）

当前状态：数据层已提交为 `1130aad`，商店界面与交互已提交为 `f5248be`，定向检查及正常应用打包通过。早期商店流程的实际App观察证据保持有效；后续指标／分页修改的实际窗口位置、跳转操作及重启恢复仍待用户手动检查。下方各轮“未提交”等文字保留为历史检查点，以本段及末尾提交记录为当前状态。已批准的用户任务见 [0003 技能商店重构](0003-upstream-aligned-refactoring.md#技能商店重构2026-11-02已授权实施)，上游读取契约见[命令映射](../research/upstream-command-map.md#skills-store-public-discovery--2026-11-02)。

- 官网公开 JSON 榜单分页、共享连接／分页缓存／首批快照、真实刷新；总榜／24h 趋势／热榜指标及服务顺序保留。服务端记录减少后夹回有效页，不将目录总量当成当前榜单可翻页总量。
- 榜单与搜索共用一行工具栏和同一卡片，搜索框自适应宽度，图标加文字刷新及直接安装按钮。紧凑分段选项和已有输入／按钮实际高度统一为32px，未新增页面皮肤；卡片无排名、安装量简写，描述只采用真实数据。
- 两字符起在线搜索、防抖与中文输入、清空恢复原榜单页码；保留服务搜索顺序，错误／等待下展示旧结果时明确原查询身份。
- 详情当前读取官网完整正文，简介与正文共享请求和缓存，不触发来源检查或克隆。安装仍从既有 SourceField 五步弹窗进入并执行原来源检查；首轮检查会话交接的实现及验证记录保留在下方历史证据中。
- 仅安装动作等待当前库存／Agent 目录就绪，榜单、搜索、详情不依赖库存完成。原版 CLI 内容写入与核验不变；不提交，不运行个人技能安装。

定向验证记录：

- 原生商店回归 9/9、现有前端契约命令 86/86 通过。新增覆盖 JSON 契约与热榜顺序、搜索顺序、跨 200 项分页、总页数缩减、快照校验、错误区分、简写数字、指标含义及原版技能名称精确匹配。回环 HTTP 测试首次因环境监听限制未运行成功；允许本机监听后原命令通过。
- 构建后运行现有原版 CLI 检查会话 fixture：全局／项目 × 复制／链接的两技能多 Agent 安装通过，比较实际内容、锁、会话消费与克隆次数。所有安装写入均在隔离 HOME／项目，正常 App 只读流程未确认安装。
- 正常 App 1280×800 深色实际观察：真实总榜 1/826；热榜小时指标及第 2 页；中文“前端设计”返回 100 项共用卡片，键盘清空恢复热榜第 2 页；真实来源克隆进度／SKILL.md；详情进入原安装向导、find-skills 预选、实际 Agent／范围／复制模式和确认内容正确，随后取消；顶部安装直接原 SourceField 五步流程；返回显示已读取的真实简介；刷新期间已有卡片保留。
- 首包实际操作发现清除按钮按下位移和切榜抢搜索焦点，集中修正后完成一次必要重打包。最终包实际指针点击清除恢复总榜第 2 页（2/826），连续键盘切榜焦点保留在分段控件，两项回查通过；未重复已有原生／前端／CLI 结果和完整 App 流程。
- 观察边界：中文通过受支持的文本粘贴送达，不等同完整操作系统候选字输入模拟。100 项结果的主内容可视、操作正常，但自动化 AX 子树不可读取；一次完整树恢复未解决后停止该工具路径，使用已支持的截图／键盘完成既定只读流程，返回榜单后 AX 恢复。未做全主题／窗口矩阵，也未实际诱发网络失败／来源移除界面；失败分支有代码与原生回归证据。用户手动验收仍待完成。

### 列表简介补齐（2026-11-02）

首次交付只在详情读取后回填简介，未覆盖“未打开详情时卡片能读到简介”的用户任务。现已接入官网详情 JSON-LD 的完整原作者描述，可见卡片后台加载、三并发／同ID订阅共享、离屏撤销未启动任务、24小时／256条缓存；确认无描述与失败重试区分。榜单及搜索复用同一卡片，无Git克隆，不阻塞列表首屏。

本轮增量原生13/13、前端目标文件47/47通过，新增完整描述与canonical身份校验、缓存、三并发、订阅取消／接手、跨页面复用与失败立即重试断言。正常应用已打包更新；普通 App 首屏已实际显示 find-skills、grill-me、hyperframes-cli、agent-browser 等真实简介，两行省略及仓库／操作布局正常，不需要先打开详情。首张完整截图时简介已加载完，未额外清缓存补拍 Skeleton；搜索共用组件、缓存及取消复用静态／定向用例证据。未重跑此前安装／CLI／完整 App 流程，未提交。

### 无克隆详情调研（2026-11-02，已授权实施）

用户指出仅查看介绍仍触发完整工作区下载。已核验官网详情包含完整展示正文，且当前简介请求已下载同一页面，可复用读取结果缓存正文，浏览不创建Git工作区；GitHub目录树＋单文件也可行，但须解决原版名称／同名优先级及匿名60次/小时限制。官方v1文件快照接口匿名实测401，不作为当前桌面默认。网站来源还需正确使用官网 `/site/{domain}/{skill}` 路由，统一检查详情／简介／来源链接消费者。

建议将商店浏览文档与安装Inspection分开，仅显式安装进入原检查／原版CLI；官网正文不是原始Markdown，“源码”能力需单独确定，不能伪造源文档。完整证据及候选方案见[无克隆详情调研](../research/upstream-command-map.md#clone-free-store-details-research--2026-11-02-proposal-only)。该段保留调研结论；后续用户已授权实施，进展见下方记录。

无克隆详情实施：商店浏览已改为官网完整正文 DTO，复用简介同一请求及缓存；原检查会话／Git调用从详情移除，安装恢复原来源检查入口。网站详情、简介及来源链接已按来源类型统一处理，正文使用共享文档组件的安全结构投影，不冒充原始Markdown。旧仅简介缓存可恢复，按需补正文；缓存带记录数与字节预算。定向代码验证、正常App打包及实际App定向检查通过；用户手动检查待完成，未提交。

本轮定向代码验证：原生合成24项通过，覆盖完整Flight正文、UTF-8长度／跨块／引用、页面身份、共用一次请求、旧缓存迁移、失败不覆盖已有完整快照及缓存预算；真实官网契约1项通过，正式解析器读取find-skills、frontend-design及网站来源ui-taste，完整正文分别为7322／9370／9385字节，无Git调用。前端纯函数50项、共享Markdown／HTML渲染12项通过，包含可信官网相对图片／链接、危险属性剔除、只读清单及正文尾部。此前安装写入与完整商店流程证据复用，未重跑个人环境安装。

实际App增量检查：新正常debug包中find-skills正文可读至“When No Skills Are Found”及末尾`npx skills init my-xyz-skill`，表格／列表／代码块可见；网站来源ui-taste的简介、正文和官网根相对横幅已加载。浏览前后两处固定`skills-space-inspection-*`快照均为0且一致，未创建检查会话。点击安装进入原五步向导第1步，仓库预填`vercel-labs/skills`，随后取消，未触发来源检查或安装。网站发布者目标`https://uizze.sh/`由代码／定向测试确认，本轮未实际打开外站。末段截图保存在`.scratch/store-document-review/find-skills-document-end.png`；正常应用保持商店ui-taste搜索结果供用户手动检查。仅上述新增流程实际观察通过，未扩大到全主题／窗口矩阵。

### 共享卡片／详情及真实源码（2026-11-02）

用户确认原始文档数据源后实施：管理页和商店共用InventoryCard普通点击、SkillDetail/Header/Metadata布局及SkillDocument预览／源码。GitHub来源读取原版公开download中的SKILL.md，网站使用原版well-known helper新增只读document模式，v1只读SKILL.md、v2保留digest／归档解析，不创建Inspection或Git工作区；会话内合并原文请求并复用缓存。同份Markdown驱动预览及源码；原文不可用保留官网HTML预览并禁用源码，提供原文重试。安装仍走原来源检查。定向代码验证、唯一正常App打包及本轮实际App定向检查通过；用户手动验收待完成，未提交。此前HTML正文观察不作为本轮源码切换的通过证据。

本轮定向证据：前端52/52（原文请求合并、精确字节缓存、失败立即重试），共享组件SSR／交互14/14（普通内容点击、独立操作隔离、批量归属与HTML降级源码禁用），快照边界2/2，原版well-known只读夹具1/1均通过。网站夹具在唯一打包／staging完成后顺序执行：v1仅请求选中SKILL.md，不请求其他技能或支持文件；v2归档成功与错误digest拒绝均沿用原版，临时HOME无技能写入。构建含严格tsc／Vite／Rust；旧安装与整套商店流程未重复运行。

本轮新正常App实际观察：商店find-skills点击简介进入详情，源码包含完整frontmatter，预览／源码往返正常，返回保留原总榜；独立安装按钮只打开原来源向导，取消仍为榜单，未检查来源／安装。网站ui-taste原文读取成功，源码包含license、metadata.version 0.3.0和原始图片Markdown；返回保留ui-taste查询及33项结果，再从卡片空白处进入详情成功。管理页find-skills共享标题／简介／元数据及原操作普通观察正常。静态发现的简介首开漏读、加载后HTML降级仍选中源码两项已集中修正并复查；HTML降级／失败采用定向夹具证据，未制造真实外网故障。新正常App保持商店供用户手动检查，未扩展主题／窗口矩阵，未提交。

### 网站安装／搜索分页／简介修正（2026-11-02）

用户授权后已实施：网站来源纳入安装资格，官网Installation声明的完整URL（包括子路径）用于原安装向导、well-known原文读取及来源链接，不执行网页命令、不猜路径；网站旧缓存缺来源地址时重新读取。来源提取失败返回独立诊断，保留有效正文，只有需要来源的操作才失败；再次显式操作重读缺来源缓存。正文解析补齐短正文prose HTML，简介允许标题先于首段；移除卡片重试按钮，保留失败与无简介区分，列表刷新重读失败简介，成功缓存复用。

搜索保持官网公开limit100／服务顺序，改为本地12项分页并复用榜单分页布局；切页不重复搜索、只渲染当前页，新查询／来源切换回第一页，详情返回／会话内页面往返保留页码，清空搜索恢复原榜单。搜索远端响应延迟未宣称已消除。

定向证据：原生29项（含后续安装来源解耦边界1项），前端54项、共享组件14项均通过；包含短正文／折叠正文、同源完整地址与旧缓存迁移、source缺失/歧义/异主机仍可浏览、缓存合并及失败重试、100项本地分页顺序和末页。唯一正常App打包及本轮实际App定向检查通过，用户手动验收待完成，未提交。此前原CLI安装／网站helper／完整商店证据复用，没有重复个人安装或额外构建。

本轮正常App实际证据：ui-taste卡片安装进入原五步向导，下载地址预填`https://uizze.sh/`；飞书lark-note详情与向导均使用`https://open.feishu.cn/lark-cli/skills/regular`。两次均取消，未检查来源或安装。lark查询100项只显示12卡，1/9切至2/9，进入lark-event详情后返回仍2/9；新查lark-note重置1/2。短正文lark-note已显示真实简介，无独立重试按钮；列表刷新保留成功简介；清空恢复原总榜1/826。App保持打开供手动检查。忙碌spinner短暂状态未单独截图，失败／无安装来源的解耦以静态与原生夹具验证，未制造外网故障；没有扩大主题／窗口或重复旧安装流程。

### 商店详情元数据初版方案（2026-11-02，历史记录）

已整理[字段提取与页面方案](../research/store-detail-metadata-design.md)，并制作可切换GitHub／网站示例的详情原型。推荐从现有官网响应共用读取并提取Installation、Summary、Repository／Source、GitHub Stars显示值和技能Topics；简介下复用元数据布局，长Summary／Command／Prompt放入新增摘要／安装说明Tab。缺失字段不造值，其他Agent页面不增加商店字段。实施需先修正Summary与短正文共同使用prose导致候选混淆的解析规则。该段保留初版方案时的状态：当时仅方案和原型完成。随后用户已授权并调整命名／顺序，实施及当前验证状态以下方交付记录为准。

### 商店详情元数据与文档Tab实施（2026-11-02）

用户确认并追加命名／排序要求后，复用SkillDetailMetadata、Badge、SkillDocument及原CodeBlock／复制实现：简介下补齐仓库／Source、GitHub Stars可见值、技能Topics；Tab按安装／概述／预览／源码排列，商店优先首可用项，其他Agent维持默认预览及原差异。完整Command／Prompt仅阅读和复制，不执行网页命令；Prompt使用已有wrap能力。缺字段不造值或放空Tab。卡片以局部container query组合现有sm／icon-sm安装按钮，窄卡仅图标，宽卡保留文字，无新增页面皮肤。安装量统一M/K，中文累计标签改为安装量，趋势／小时语义保留。

官网读取继续一次响应／缓存，元数据按需补读旧记录；Summary与SKILL.md按真实语义标题和Flight兄弟group定位、解析引用，排除祖先容器误判及页脚Topics。安装来源使用同一已解码Command；正文缺失不剥夺可用安装／概述，源码和无正文预览保持正确资格。UI保留先到元数据并合并information Promise，原文失败时不会额外抓同页。

定向代码验证完成：正式Rust对三份真实保存响应及canonical已核验，find-skills正文7322字节／概述702、frontend-design正文9370／概述782，均有独立完整Command／Prompt、Stars和单个技能Topic；lark-note正文382字节，没有概述／仓库／Stars／Topics而保留真实安装内容。原生受影响集34项、真实页面契约1项、前端55项、共享组件17项通过；最终缓存修复后仅重验相关5项且全部通过。最终正常App构建及实际App定向检查通过，用户手动验收待完成。旧安装／搜索分页／网站helper证据复用，不执行个人环境安装，未提交。

构建边界记录：首包完成后，新增HTTP成功但Flight失配的旧缓存补读回归发现覆盖成功预览的问题，修复后重新完成最终正常包。首包未交UI，也未进行界面操作；仅最终包用于本轮实际检查。末次修复保留旧正文，不复用失败／冲突的安装来源，不重复已有效的解析、前端及旧生命周期证据。

最终App实际证据：find-skills显示仓库、Stars 37.5K、安装量及Agent workflows主题，安装／概述／预览／源码顺序正确，信息到达后默认安装；Command及完整Prompt可见，命令复制提示已复制且未执行。概述为独立Summary段落／要点，预览仍Find Skills正文，源码含frontmatter。lark-note显示完整飞书子路径，缺少Stars／Topics／概述时无空行／空Tab，安装内容保留实际子路径，原文正常。1280窄卡仅icon-sm，原生窗口宽化至1920后恢复图标＋文字，随后还原尺寸。管理页仍默认预览／源码且无商店字段。App保留商店供用户手动检查，未提交。错误／metadata-only／缓存失败采用静态与定向夹具，未注入真实网络故障；Hint文案与焦点代理静态核对，未补做悬浮自动化；未扩展主题矩阵、旧完整流程或个人环境安装。

### 商店详情对齐与卡片按钮修正（2026-11-02）

用户指出收藏／主题标题的额外上偏移与数值不齐、安装量标题混在值中、英文概述命名及卡片按钮变体不一致。本轮小范围修正：普通文本／标签值移除无依据的标题mt偏移，保留可点击来源所需的路径padding对齐；安装指标拆成标题与值，标题使用元数据的muted样式且保留趋势／小时含义；中文Stars为收藏，英文仍GitHub Stars，概述英文为Summary。仅商店卡片安装按钮改为已有ghost变体，保留窄icon-sm／宽sm的响应式规则。验证选择轻量分支：既有定向检查与唯一最终App构建、普通App外观观察，不做脚本化状态转换或整套UI自动化。既有前端55项、组件17项与正常App构建通过，最终正常App普通外观观察通过，用户手动验收待完成，未提交。

本轮普通App观察：沿用用户原英文偏好，卡片ghost安装图标与顶部主按钮样式范围正确；find-skills详情Stars与37.5K居中、Topics与Badge首行对齐、Installs为muted小标题与独立数字、Repository路径标题和值对齐，Tab显示Summary。中文收藏／主题／安装量静态核对；没有切语言、缩放或脚本化状态流。新App保持find-skills详情供用户检查，未安装，未提交。

### 趋势／热门指标核对与显示（2026-11-02）

已按官网文档与当前公开JSON核对：trending.installs为24h数量；hot.installs为1h数量，installsYesterday为昨日同一小时，change为两者差值。实际样本291／72／219相符；保留服务顺序，详情使用进入时的榜单记录和时间范围，网页正文元数据不覆盖为累计量。

用户授权将标签统一为24h安装量／1h安装量（英文24h Installs／1h Installs）。卡片与详情的变化量使用同一已有Hint／Lucide图标组合：上升／下降箭头加绝对变化量，0为中性横线，缺数据不显示；完整昨日同时段文案进入悬浮及键盘焦点提示，不作为详情常驻长文字。总榜／搜索仍为安装量，M/K仅紧凑显示，详情与提示保留完整数值。轻量验证：定向字段／正负零缺失断言、普通App趋势／热门卡片和详情阅读，不做整套UI自动化／语言窗口矩阵或旧安装验证。前端57项、共享组件18项及正常App更新构建通过，静态UI审查通过；实际普通App阅读未完成，未提交。

本轮字段核对追加证据：保存的trending样本200项只含榜单数量；hot样本200项全部符合installs-installsYesterday==change，源适配保留服务change和顺序。方向与零／缺失、M/K卡片／完整详情、aria及Hint完整说明由定向断言覆盖，未为了找负值遍历远端榜单。原安装／网站helper／元数据解析证据复用，无新增Native或网络回归。

本轮界面检查边界：桌面退出调用超时，使用原API恢复一次仍超时，依有界恢复规则停止；未确认新包已启动，趋势／热门卡片和详情的实际阅读及悬浮提示留待用户手动检查。没有因工具故障重复构建或改跑整套自动化。更新包位于src-tauri/target/debug/bundle/macos/Skills Space.app。

### 热门安装量与变化量分字段（2026-11-02）

用户要求卡片及详情将1h安装量与较昨日同时段拆成独立字段。本轮卡片保留独立下载数量与方向变化值，各自Hint仅说明自身指标；详情使用两个独立元数据字段，变化字段保留上升／下降／持平及完整悬浮说明，缺失变化不显示空字段。轻量分支，仅定向检查与必要构建，不重复旧流程或桌面工具故障恢复。定向前端57项、组件19项及静态UI审查通过；正常App更新包构建通过。本轮沿用桌面工具故障停止条件，实际界面待用户手动检查，未提交。

后续字段命名修正：仅热门详情将独立比较字段改为“活跃度”（Activity），使用Lucide Activity图标及既有元数据标题布局；卡片、计算和悬浮比较语义保持原样。静态UI及影响范围审查通过，复用前轮57／19项语义证据；严格编译与正常App更新构建通过，实际外观待用户手测，未提交。

### 商店分页与每页数量（2026-11-02）

用户确认：默认12项，可选24／48项，沿用应用偏好保存并在重启恢复；榜单按需读取原200项分块，展示缓存按每页数量区分，顺序不变；搜索仍最多100项并按所选数量本地分页。卡片区独立滚动，分页固定列表区域底部，提供上一页／当前页总页数／下一页及指定页码跳转，支持回车和范围校验。切换每页数量、榜单或查询回第一页，详情返回保留列表位置。其他Agent布局不变。验证采用轻量分支，定向跨块分页／搜索／偏好兼容与保存恢复检查及一次正常包；未重复旧安装网络流程，实际界面待用户手动检查。定向前端58项、组件19项、原生多尺寸跨块分页1项及偏好模块4项通过，严格编译与唯一正常App构建通过。覆盖12／24／48项跨200分块顺序及末页、空列表、缩榜、无效数量、溢出与旧偏好默认12及序列化恢复；静态UI复查已确认固定高度父链、加载／失败分页保留、搜索尺寸变更不重搜、保存成功后原子切页和筛选回顶。实际窗口底部位置、跳转操作及应用重启恢复未做桌面观察，留待用户手测；序列化恢复不等同实际重启证据。未提交。

### 本轮整理提交（2026-11-02）

- `1130aad`：数据层与原生回归，含公开榜单／搜索、缓存、免克隆文档、官网元数据及原版well-known只读读取、可变分页和偏好保存。
- `f5248be`：共享商店卡片／详情、安装／概述／预览／源码、指标与活跃度、可变分页／跳转及前端回归。
- 文档另批同步：本轮调研、规范、命令映射和roadmap，保留历史验证记录。

复用已有效证据，本次整理未重复构建或运行测试。最新定向结果：前端58／58、组件19／19、原生多尺寸分页1／1、偏好模块4／4及正常App构建通过；其余较早原文读取／元数据解析／隔离CLI与实际App证据按对应条目范围有效。当前待手动检查仍为最终分页窗口布局、跳转操作、列表滚动和真实应用重启恢复；代码提交不代表这些观察已完成。全部为本地提交，未推送。

## 手动构建与版本发布（2026-11-02）

用户明确要求所有提交／推送均不自动触发构建。新增两个仅workflow_dispatch入口：四平台安装包构建、复用指定成功run的Release草稿。矩阵不连带取消其他平台，支持GitHub仅重跑失败任务；不同提交不混用产物。无证书阶段macOS采用ad-hoc签名、Windows未签名，未接入自动更新。首版说明按新增功能／功能优化／Bug修复组织，后续必须基于上一已发布正式版的实际差异总结。当前未触发GitHub构建、创建标签／草稿或发布。独立测试审查新增13项隔离回归并全部通过，覆盖五份安装包汇总、缺失平台、跨提交／run／版本混用、校验和、Windows换行、发布说明基线／分类及既有tag冲突；两个工作流通过actionlint和YAML解析。修复审查发现的Tauri透传--locked参数位置、Windows锁文件CRLF解析、既有草稿目标提交同步及发布说明忽略规则；原生测试前置到打包前。未改应用界面，跳过UI审查；本地未运行应用构建；用户随后授权提交、推送并手动触发四平台构建，GitHub runner执行结果、签名产物及实际安装结果分别记录，不预先标记通过。未授权创建Release草稿或发布。

首轮GitHub构建`41429844229`：选择任务通过，四个平台均在前端合同测试因随包脚本尚未staging而失败，未生成成功安装包。修复工作流顺序为安装依赖→版本校验→资源准备→前端测试→原生测试→打包；同步README／开发及发布指南的干净检出前置步骤。不删除或放宽失败检查项。干净检出按锁安装及staging后，前序合同测试通过，末尾overlay检查发现既有语义标题名单漏项：SkillDetailHeader和DshSettingsDisclosure将title渲染为可见内容，非DOM提示。精确补充名单，并新增Button／button原生title仍被拦截的回归；overlay定向3/3通过，复用其余已通过结果；宿主限定Pi2项／DSH30项仍按既有条件跳过。actionlint及文档引用检查通过，生产组件未修改。修复后构建与后续平台结果待记录，不创建Release。

后续构建`41430691986`已通过资源准备；Windows前端测试揭示Pi路径问题：测试数据以Unix分隔符识别全局配置导致项目信任默认值被意外清除，另有规则路径检查项写死分隔符；同时Git根比较改用系统原生realpath展开Windows短路径，返回原有根路径拼写以保持技能文件／恢复记录的匹配。staging后Pi定向50项：48通过、2项原宿主限定跳过、0失败；新增Git根直接识别和嵌套包归属边界回归。Windows真实短／长路径结果待专用构建验证；其他平台原任务继续，不重复成功安装包。

Windows专项`41431497384`已通过全部Pi测试，验证Git短路径修复；随后仅DSH私有文件可编辑测试失败，原因是隔离HOME未规范化而触发文件别名保护。测试数据改为realpath(mkdtemp)，未放宽生产保护；DSH定向38项：8通过、30原宿主限定跳过。仅Windows继续专项验证，macOS／Linux原任务不重跑。

Windows专项`41432030219`前端全通过；原生测试编译发现两个原本ignored的Unix shell测试缺cfg(unix)，以及链接清理测试只调用Unix symlink。按真实平台能力补测试限定及Windows链接创建／删除分支，保留替换目录不得删除的检查项。构建增加失败时保存Rust依赖缓存，避免测试错误导致依赖编译缓存丢失。实际Windows原生结果待下一次专项验证，其他平台不重复触发。

### 首轮构建集中排查（2026-11-03）

`41430691986`的macOS ARM和Intel均已成功，分别保留installers-macos-arm64及installers-macos-x64产物，不重建。Linux检查注释明确为hosted runner与服务器失联，原生步骤无最终日志；仅重试其原job，不把失联推断为代码报错。Windows`41433124473`原生测试138通过、90失败、27忽略，按共同原因集中修复：33项直接路径前缀不一致、16项Git文件URI测试数据转义错误，其余逐项核对库存／共享身份及平台合同。

局部使用锁内dunce 1.0.5规范Rust↔Node／CLI路径边界，保留contains／符号链接／共享所有权校验；修复Windows目录链接删除方式。测试Git URI改为标准URL构造，平台路径预期不再写死POSIX；已有Unix专属临时使用控制测试按实际平台合同限定，并新增Windows拒绝操作且无内容／锁写入的回归。没有整树替换路径API或移除失败检查项。集中修复已通过独立静态审查、全部修改Rust文件语法解析及locked/offline依赖元数据检查；补齐审查发现的共享链接／恢复／Pi扩展消费链遗漏，并新增文件URI往返、Rust↔Node真实路径及Windows不支持操作无写入回归。Windows真实编译、原生测试和安装包仍待本次专项运行，不将静态检查记作90项已恢复。当前修改尚未提交、推送或发布。

### 统一重建前完整检查（2026-11-03）

用户要求完整检查全部首轮构建以来的修复后，从同一提交重新构建四个平台，覆盖先前仅重试失败平台的安排；仍不发布。Windows`41481039641`仅在新增测试的Option字段构造处编译失败，该字段改为None；纯平台运行合同采用cfg_attr忽略执行而非移除代码，使输入构造参与本机真实类型检查。Rust↔Node路径一致性回归改为所有平台执行。

完整结果：资源准备通过；前端313项（281通过、32既有宿主限定跳过、0失败）与严格前端构建通过；发布基础设施13/13通过；实际Rust编译及完整原生307项（268通过、39既有宿主／平台合同忽略、0失败）通过；唯一Tauri debug App打包通过。包内原版CLI入口与published源字节一致，21份辅助脚本一致，许可／DSH插件／79-Agent元数据齐全，无Node sidecar。没有启动App或执行UI自动化。假CLI资格探测测试中的32条进程组终止权限诊断保留原日志，测试通过，未据此推断Linux失联原因。

旧Linux重试已取消完成，旧macOS成功产物保留。按用户授权提交本次检查收尾并手动触发同一提交的四平台构建；本机结果不代替Windows／Linux及正式安装包结果，云端结果另行记录。没有创建标签、Release草稿或发布。

### Windows 后续失败与 Linux 耗时核对（2026-11-03）

统一构建 `41485274762`：macOS ARM／Intel 成功；Windows 原生测试210通过、16失败、27忽略，未打包；Linux 再次报告 hosted runner lost communication，未打包。Linux 准备与前端检查1分11秒，随后合并的编译／原生测试步骤到任务失败经过50分50秒；job日志404且整次日志包不含Linux，无法区分实际编译、测试执行及失联检测等待时间，不将全部时间记为编译耗时。

16项Windows失败集中核对后，修复计划／库存路径的组件身份比较、Node来源路径规范化、DSH创建目录匹配和provider签名相对成员名；保持文件原字节、名称、归属及范围校验。测试数据的Git换行策略显式声明为保留字节；其余路径检查项按系统路径身份比较，保留原内容、共享替换、并发变更及越界保护。大媒体失败只输出长度和首差异位置，避免输出完整二进制数组。原依赖修复中的通用失败检查项补实际结果和警告；其Windows最终状态仍待执行确认。

实际本机Rust测试编译通过（16.98秒）；25项定向原生测试通过（118.12秒，0失败／忽略），覆盖原16项失败对应流程与9项安全保护／签名回归。未重复前端或App打包；未触发新云端构建。以上为macOS执行证据，不代表Windows已通过。Windows旧开发版更新记录的树签名可能因成员名格式变化先被判为有修改；实际源和安装字节校验一致后保存新基线，不盲目迁移，不改变原版CLI锁哈希或local-sync独立指纹。

工作流仅拆分原生测试编译和执行两步，参数、环境及资源不变，执行复用编译产物；YAML解析、相邻步骤参数一致性、仅手动触发及diff空白检查通过。未声称此拆分修复Linux失联。项目规则补自然中文术语与跨平台失败复查要求。当前修改未提交、推送或发布；Linux具体失联原因、Windows目标执行及对应安装包仍待验证。

### 原生测试耗时核对（2026-11-03）

从同次运行日志核实：macOS ARM测试执行1222.37秒（20分22秒）、Intel1776.52秒（29分37秒），均268通过／39忽略；这些时间不含前序Rust编译。Windows测试执行1021.33秒（17分1秒）。工作流对完整lib套件使用test-threads=1；多项测试包含真实CLI安装／更新／卸载、全局／项目及复制／链接组合，并重复库存读取与Agent检查。按串行日志完成间隔估算，完整Git生命周期单项ARM约75秒、Intel113秒；来源别名／筛选流程约53／67秒，DSH生命周期约38／57秒。这些间隔用于定位慢项，不是精确的内部调用剖析。

当前仅拆分编译／执行，提高耗时可辨认性，尚未优化全量测试执行。25项本机定向检查约2分钟属于较小验证范围，不能记为完整套件已提速。不得通过删除失败检查项、跳过关键生命周期保护或直接放开共享状态并发来缩短时间。Linux缺少原生日志，其50分50秒不能套用macOS耗时归因；尚未触发新构建。

### 测试精简与CI评估（2026-11-03）

状态：按用户“给出方案并解决”的要求推进首批实际精简；初步候选项与本次落地结果分别记录。禁止以通过数或数量目标代替功能质量。当前仅定向验证，不触发完整测试、云端构建或发布。

#### 范围与计数

包含嵌套子检查后，当前源码有665处测试注册／定义：前端185、脚本172、Rust308，分布78个文件。此前“至少646”遗漏单独计算19处嵌套子检查，此处补全；循环还可能生成更多实际项目。上一轮macOS工作流登记620项，实际执行549项、跳过71项，反映当次执行范围，不能与源码注册数混为一谈。

#### 去留原则

每项检查先对应具体用户任务、外部接口约定或已出现的问题，明确唯一主要负责层。纯逻辑采用小输入直接校验；原版CLI真实流程负责确认边界接通和磁盘／锁结果；交互需要相关组件或实际界面证据。新增检查须说明现有覆盖缺口，维护同一检查优先于追加一条近似检查。不能通过移出默认命令、永久跳过或删掉必要保护来制造提速。

#### 初步候选清单（具体实施范围见下文）

| 现有位置／检查 | 处理 | 保留的实际价值与验收依据 |
| --- | --- | --- |
| `upstream/tests.rs` 的 `real_upstream_git_lifecycle_checks_updates_and_removes_in_both_scopes` | 拆除单个用例内混杂的Git生命周期、文本差异、二进制识别、文件添加／删除、逐文件恢复、过期操作及旧更新记录组合。差异计算与本地保护移到对应模块直接检查；真实Git流程保留两种范围的必要衔接 | 原版CLI安装／更新／卸载与内容、锁结果；一次真实差异／恢复接通；具体文件分支有独立快速覆盖。先建立替代覆盖再移除旧重复部分 |
| 同文件 `real_source_alias_prefix_and_filter_install_only_reviewed_skill_in_both_scopes` | 七种来源写法的解析、分支和过滤预期在原版只读解析／发现层直接检查；完整安装和卸载保留代表性边界，移除每个别名重复完整生命周期 | 七种来源的真实解析结果仍全部核对；预览选择与实际安装的一致性保留真实流程，不让每一种字符串别名都承担整套安装成本 |
| 文本／二进制差异与逐文件恢复 | 在 `document_diff` 对应数据处理和受保护文件操作处直接检查；保留源版本、内容过期和路径越界的必要接通验证 | 仍能发现文件增删、二进制、原字节、过期请求及越界问题；避免每个文件变化都重新克隆仓库和发现全部Agent |
| 更新状态与旧记录处理 | 将已更新／可更新、本地修改、旧记录缺失等状态判断与真实CLI更新流程分层；合并各Agent或生命周期用例内相同分支 | 真实更新和保留本地修改有接通覆盖；状态组合由直接输入负责，明确Windows路径与旧签名是具体风险而非任意排列组合 |
| `scripts/overlay-hints.test.mjs` 的全源码扫描与白名单 | 将项目样式规范归入静态规范检查／审查；评估移除依赖组件名白名单的测试。保留真实Switch与Tooltip状态冲突的行为检查 | 避免组件改名或新增正常标题造成虚假失败；真实开关显示问题继续有明确检查 |
| `scripts/version-loading.test.mjs`、`pi-loading.test.mjs` 等提取源码并动态执行的检查 | 审核其是否覆盖实际挂载行为；抽取函数名和手工拼接环境的替代测试，在真正行为覆盖具备后删除或替换。不是直接删除所有异步检查 | 详情切换后的旧结果不得覆盖新内容、加载与失败状态仍需验证；验证对象使用实际模块公开行为 |
| `src/lib/agent-skill-actions.test.ts`、范围／归属／共享保护及路径检查 | 保留直接输入、快速且边界明确的检查；对重复业务场景合并测试数据；操作权限与原生文件保护分别承担各自边界 | 当前Agent隔离、托管技能仅改Agent配置、批量按动作资格判断；未经授权的写入与删除受保护 |
| 原版CLI生命周期的其余重复组合 | 按安装、更新、卸载、预览／实际一致、项目隔离等任务逐组建立覆盖表，确认每种范围／来源／模式差异是否需要完整流程；没有独立风险的交叉组合移除 | 先明确某组合能发现的独有错误；不能仅因组合可枚举就全量执行，也不能仅因耗时长就删除真实边界检查 |
| 发布元数据／产物校验的13项 | 保留小规模隔离数据检查，审查重复准备是否可合并 | 防止错误版本、缺失／混合产物、校验和与发布说明基线错误，不依赖真实应用安装 |
| 条件跳过的Agent／组件检查 | 标明其真实依赖和负责的行为；合并替代检查，淘汰与当前架构不符的旧检查 | 跳过不计为已验证；避免保留一个默认不会执行的检查来声称已有质量保障 |

#### 实施顺序与交付

1. 按用户任务建立覆盖关系，先明确现有主要负责检查与替代方式。首批以以上可定位用例和脚本为范围，不宣称已逐项审查665处定义。
2. 集中完成测试本身的分层、合并和清理。产品逻辑保持原任务边界；必要的可测试接口调整须具体说明，不新增通用测试框架或无关抽象。
3. 仅执行本次改动的直接检查与必要接通流程，提供精简前后相同验证范围的耗时、保留覆盖和删除依据。静态计数降低不算提速证据，较小范围的耗时不冒充整套测试优化。
4. 根据下述逐类评估实施CI范围调整，与测试本身的精简分别交付。当前Windows修复和成功平台产物保留，未知的Linux失联原因继续按未知记录。

#### 用户补充的两项独立范围（2026-11-03）

**一、精简现有测试本身。** 实际删除重复业务覆盖、紧贴内部实现且没有独立风险价值的检查，合并重复环境准备，将纯逻辑分支从真实安装流程中移出；合并测试名称或换一种计数不算完成。保留明确风险对应的最小检查与少量真实CLI流程，记录删减依据、覆盖归属和同范围耗时变化。测试数量和执行成本都需要下降，不能仅把原有慢测试移到另一个入口。

**二、客观评估CI检查范围。** 先前“移除整套前端／原生测试及测试编译”的建议未获证据支持，已撤回，未照此修改工作流。依据实际成本与发现问题的记录，实施以下安排：

| CI检查 | 证据与价值 | 本次安排 |
| --- | --- | --- |
| 前端与脚本检查 | 既有步骤约7秒，实际发现过Windows路径与测试数据问题；保留并不导致20～30分钟的原生执行成本 | 保留；仅移除两项依赖组件名称白名单的源码规则检查，实际Switch／Tooltip状态行为继续校验 |
| 发布脚本13项 | 以小数据验证版本、产物来源、缺失／混用平台、校验和和说明基线，不启动真实应用 | 保留，矩阵选择时运行一次 |
| 原生测试编译 | 之前Windows发生过被忽略测试中的输入字段类型错误，应用编译不会检查测试专属构造 | 保留真实编译，单独显示耗时；后续执行复用产物 |
| 默认原生执行 | 整套串行测试macOS ARM20分22秒／Intel29分37秒，具有大量昂贵的扩展组合；另一方面确实发现了Windows实际路径／签名问题 | 默认选择明确列出的风险清单：Windows81项、Unix84项（含快速独立数据检查）。完整保留已出现的16项Windows失败对应流程，另覆盖真实Git生命周期、来源／预览一致、Node约束、配置写入、共享／本地内容保护与删除失败保护 |
| 完整原生回归 | 扩展功能组合、来源协议、旧记录和特定Agent能力有维护价值；并非每次安装包构建都需重新覆盖全部分支 | 在同一个手动构建入口提供critical／full选择，默认critical；跨模块大改或升级原版CLI时显式选full；不新增自动触发 |
| 目标平台编译和产物 | 必须确认目标代码实际编译、资源齐全、产物格式与来源可追溯 | 保留Tauri原有正式构建、资源准备与产物收集校验 |

默认风险清单集中在 `scripts/test-native-ci.mjs`。执行前使用实际编译程序的列表核对名称存在和未被忽略，避免改名／删除后静默少测。Unix专属的链接检查不伪装成Windows已覆盖。默认执行步骤设10分钟预算，来自此前25项本机约2分钟的基线及慢平台余量；full使用40分钟预算，覆盖此前Intel原生执行约30分钟的基线。该预算用于让异常执行及时失败，不是已实现的耗时承诺或Linux根因修复。

Codex原版CLI的完整配置读写仍属于显式安装条件下的专项验证，当前CI没有该CLI，不用被忽略项目冒充已验证；前端范围／规则逻辑及原生测试编译依旧保留。full也不自动执行这些有专门环境依赖的项目。需要发布时，真实安装、启动及上述原CLI专项仍分别记录验证状态。

#### 本次实际精简（2026-11-03）

- 来源格式逐一用固定原版解析器核对URL、分支、技能过滤和平台类型，七种全部保留；真实克隆／发现／安装／卸载由七轮减为三轮，覆盖GitHub大小写过滤、GitLab无过滤、编码分支。其他拼写不重复执行整套生命周期。
- 完整Git用例仍真实验证全局／项目安装、差异读取、一次实际文件恢复、更新、本地修改保护及卸载。逐文件增删改／二进制／过期内容／越界／未选择内容保护移至实际文件操作函数直接检查，避免每个文件分支重新克隆和发现全部Agent。
- `document_diff`只抽出实际使用的私有差异与恢复操作，原入口仍核验归属、当前内容及源版本；返回的锁由原入口持有到更新记录刷新结束。直接检查确认锁存活与释放，真实流程删除旧更新记录后再恢复，确认确实重建记录而非沿用旧值。
- 删除两项依赖全源码扫描和组件名白名单的规则检查。它们不能确认属性最终是否透传DOM，曾对正常语义标题误报并阻断验证流程；真实Switch与Tooltip状态冲突继续由组件渲染检查负责。UI规范仍由设计基线及对应界面审查执行。
- 其余快速且风险独立的检查保留。这里没有完成对665处定义的逐项删减，也不宣称整个扩展套件已全面提速；本次集中解决已证实的重复真实流程和默认CI高成本问题。上方源码提取／动态执行等候选检查尚未替换，仍待对应行为覆盖评估。

独立审查已补入废纸篓失败保留、DSH配置并发写入及Unix链接保护；没有创建额外测试框架、结果数据库、自动触发或并行执行器。UI无改动，跳过UI代理；测试审查由release_verification承担一次集中编译和定向执行。结果见下文，不以本机结果替代Windows／Linux。

#### 本轮实际结果（2026-11-03）

独立审查补齐：真实文件恢复前删除旧更新记录后再验证clean，避免沿用旧记录掩盖刷新缺失；直接文件检查确认返回锁在持有期间阻止第二次获取，释放后可重新获取；默认CI补入删除失败保留、DSH并发／链接写入保护、偏好／商店／版本独立数据检查。

| 范围 | 实际结果 |
| --- | --- |
| Rust测试程序真实编译 | 通过，8.32秒 |
| 完整Git两范围用例 | 通过，同机41.66秒→33.448秒，约减少19.7% |
| 七来源格式／三实际流程 | 通过，同机32.70秒→15.046秒，约减少54.0% |
| 其余35项风险检查 | 全通过，130.838秒；未重复前两项 |
| 47项独立快速数据检查 | 全通过，1.330秒；覆盖偏好9、商店36、版本2 |
| 默认Unix84项合计 | 名称集合与最终选择器一致，全通过，无忽略，执行约180.662秒；未再合并重跑 |
| Windows81项清单 | 仅核对选择范围／平台限定与已知失败覆盖，未在Windows执行 |
| Tooltip与Switch行为 | 通过，318毫秒，移除静态白名单后未重复执行 |
| 新选择器 | 六个模拟入口分支通过：精确选择、缺失拒绝、必选忽略拒绝、快模块无可运行检查拒绝、失败码及full／target透传；未据此声称目标平台通过 |
| 唯一正常Tauri调试包 | 通过，约34.27秒，内含Vite7.25秒、Rust dev19.62秒；未另跑前端build，未启动App |
| 语法与文档 | 新JS入口语法、YAML解析及手动触发／顺序检查、diff空白检查通过；最新工作流未运行actionlint，当前环境未提供该工具 |

未受影响的前端与发布脚本检查复用已有证据。本轮两个慢用例合计减少25.87秒，不据此推算完整扩展套件的总耗时。源码测试定义665→664（移除两个源码白名单检查，增加一个直接文件行为检查）；真实安装／卸载循环七轮→三轮、文件分支不再各自克隆和扫描，属于实际执行工作删减，而非只改测试名称或计数。大量快速且独立的检查因实测成本低、覆盖真实功能而保留；其余候选测试尚未逐项精简，不记为全部完成。

本地默认 `pnpm test:native` 使用critical，`pnpm test:native:full` 显式选择完整默认库套件；开发文档和AGENTS已同步，避免后续会话根据旧说明默认运行全套。原版Agent的环境限定检查仍独立，跳过不计通过。

Windows实际运行、Linux执行器失联原因及目标系统安装／启动仍未验证。当前所有修改未提交、未推送、未触发新的云端任务，未创建标签、Release草稿或发布。产物仅为本地debug App，没有更新或启动用户当前应用。


#### 现有测试全盘去重与精简完成（2026-11-03）

按用户追加要求审查全部34个前端/脚本候选文件、45个含测试的Rust文件，保留独立风险，退役无正式消费者的测试专属实现，迁移独有输入后合并重复覆盖，并减少真实CLI重复组合。逐文件决定、具体删减及主要覆盖归属见[完整清单](../research/test-suite-rationalization-2026-11-03.md)。本段接续前阶段“尚未全盘精简”的记录，不改写历史。

本轮直接注册/定义664→637（TS185→166、脚本170→169、Rust309→302）；连同前阶段累计665→637。前端完整命令311→291项，279→259通过、32跳过不变，12.549→11.760秒。发布脚本13→10项全通过，Node内部361.066→315.105毫秒。完整本地原生263通过、39跳过、0失败，内部耗时669.23秒；历史基线268通过、39跳过、729.82秒，比本轮实施前源码少两项新增检查且早于前阶段优化，不能归为严格同源码的本轮收益。

严格TS检查通过5.378秒，测试程序真实编译通过18.594秒。独立审查发现并修正了合并搜索数据的未知安装身份和完整市场ID；发布、编译、原生不重复执行。真实编译列表校验关键清单Unix81/理论Windows78，无缺失或选中ignored，完整原生通过后不重复执行该子集。产品代码在本轮不变，复用前阶段有效App构建，无UI审查/自动化或重复打包。Windows执行、Linux此前失联原因和原Agent环境限定项目仍保持未验证。未提交、推送或触发云端构建，未准备发布。


#### 修复提交与重新构建授权（2026-11-03）

用户在上述全盘精简交付后要求修复线上构建问题并重新构建，替代此前“不提交/不触发云端”的本次操作限制。重新核对41485274762完整Windows日志的16项失败与现有修复，保留刚通过的本地编译、完整前端/原生和发布检查，不重复运行。旧Linux任务仍是执行器失联，不能将缺失日志归因为已确认的编译或测试缺陷。

按原生修复及测试精简、前端/脚本去重、CI/规范与记录三批提交推送；从最终同一提交手动选择all+critical，重新构建四个平台。检查成功的平台不因其他平台失败而重跑；修改了共享来源时另按实际影响决定重建范围。保持仅workflow_dispatch触发，不创建标签、Release草稿或发布。云端实际结果在本段后续追加，不将本机通过写作Windows/Linux已通过。


#### Windows 同步传播剩余失败（2026-11-03）

三批修复已提交a8f2174/b6b9beb/9f7992d并推送，从9f7992d手动触发四平台critical构建41540983932。Windows测试程序实际编译通过，关键检查77通过、1失败、0忽略，执行303.62秒；旧16项失败中剩余的单文件同步流程已推进到更深的传播阶段：库存入口改为路径比较后，propagate仍用字符串contains筛选来源，Windows斜杠写法不同使结果为空。其余15项旧失败已通过，不宣称该单项此前已修复完整。

在现有单文件复制/链接测试补入规范等价的/./与正斜杠来源，明确要求失败结果和重试结果各有1项。本机先真实复现0项（编译4.463秒、执行5.624秒），再集中修复同模块11处来源/目标身份比较，统一Path语义，不增加符号链接解析，不修改URL/hash/范围/存储格式。独立审查确认内容/共享/并发/链接与移除保护保留；实际编译3.853秒，skill_sync全部12项通过（71.362秒、0失败/忽略），不重复整套、前端或App打包。

原任务Linux和macOS ARM安装包已成功，Intel macOS关键检查通过且正在打包。提交此局部补丁后仅触发Windows；成功平台不重复构建。Windows补丁来源提交与原任务不同，不混合为同来源发布产物；本次不准备Release。最终目标执行和安装包状态另行追加。


#### CI 编译产物直接复用（2026-11-03）

41540983932日志证明原“编译/执行参数一致即可避免重复编译”的假设不成立：Intel macOS编译步骤1分44秒结束后，执行步骤第一次cargo --list再次Compiling skills-space、耗1分37秒；实际81项执行487.49秒，而执行步骤总计589秒。不是第二遍测试，仍是额外编译。

工作流编译步骤保存Cargo --message-format=json；执行步骤通过NATIVE_TEST_ARTIFACTS读取唯一skills_space_lib测试可执行文件，列表/忽略名单/执行都直接调用它，不再调用Cargo。原本地入口、critical/full、选择清单、超时与测试参数保留。独立审查16个模拟入口/错误分支通过，真实Cargo JSON及真实二进制仅列表读取确认302项、39忽略、Unix81/理论Windows78；JS语法与diff检查通过，没有重跑测试、编译或App。此优化只影响后续构建，当前Windows补丁任务仍使用a9d8144中原工作流；不为本项额外启动云端构建，目标平台的新入口执行尚未验证。

截至本记录，41540983932的Linux/macOS ARM/Intel安装包均已成功并上传；Windows补丁任务41543335879已通过原生测试编译及78项关键检查，正在打包。最终状态待后续记录；没有准备或发布Release。


#### 本次四平台构建最终结果（2026-11-03）

| 平台 | 构建任务/来源 | 原生关键检查 | 安装包/产物 |
| --- | --- | --- | --- |
| macOS ARM | [41540983932](https://github.com/arch3rPro/Skills-Space/actions/runs/41540983932/job/125604871501)，9f7992d | 81通过、0失败/忽略；286.72秒 | 打包成功，installers-macos-arm64上传完成 |
| macOS Intel | [41540983932](https://github.com/arch3rPro/Skills-Space/actions/runs/41540983932/job/125604871451)，9f7992d | 81通过、0失败/忽略；487.49秒 | 打包成功，installers-macos-x64上传完成 |
| Linux x64 | [41540983932](https://github.com/arch3rPro/Skills-Space/actions/runs/41540983932/job/125604871485)，9f7992d | 81通过、0失败/忽略；176.47秒 | deb/AppImage打包成功，installers-linux-x64上传完成 |
| Windows x64 | [41543335879](https://github.com/arch3rPro/Skills-Space/actions/runs/41543335879/job/125612824215)，a9d8144 | 78通过、0失败/忽略；296.99秒 | NSIS打包成功，installers-windows-x64上传完成 |

四个平台均通过实际测试程序编译、前端合同检查、选定原生检查、优化安装包构建及产物收集/上传。API确认四个产物均未过期。Windows补丁实际验证修复了剩余同步漏选，其他三个成功平台没有重复构建。Windows任务总计16分16秒，其中原生测试编译90秒、执行步骤330秒（测试程序内部296.99秒）、安装包构建416秒；测试、编译与打包分别记录，不混算。

原四平台运行因早期Windows单项失败总体仍显示failure；后续Windows专项运行总体success。它们的来源提交不同，保留为构建验证产物，不混为同提交Release输入。当前main另含59c484b的CI直接执行测试程序改进，只做了入口校验，未额外触发云端；其云端执行与节省耗时需在后续用户明确要求构建时确认。Linux旧任务失联原因仍无确证，本次Linux完整任务成功，不将其解释为已经找到旧失联根因。

验证仅涵盖构建与选定代码检查，未在目标系统手动安装/启动。未创建标签、Release草稿或发布。所有本次修复及记录提交推送；push不触发额外构建。


#### v0.1.0 草稿准备：复用成功平台（2026-11-03）

用户要求直接解决发布流程冲突，按已提出的复用方案实施，不再触发安装包构建、不正式发布。草稿流程从“同一成功运行/提交”改为显式选择每个平台的成功任务：基础41540983932，Windows覆盖41543335879。只下载现有五个安装包；验证手动构建身份、所选任务成功、源提交属于发布记录提交的祖先、统一版本、原manifest来源、完整格式及SHA-256。原构建元数据不改写，生成BUILD_SOURCES.json并在Release Notes列明各平台真实提交/任务。版本保持首次发布0.1.0，上一正式版本none，保留新增功能/功能优化/Bug修复三个栏目。

新增两个快速行为检查分别负责跨任务选择/失败拒绝及显式来源匹配/产物校验，不重跑前端、Rust或App。草稿和实际附件验证结果在完成后补记。


发布入口独立审查完成：补齐多来源模式对发布记录SHA的统一校验，缺失/非法SHA在输出前拒绝；12项发布检查通过（约303毫秒）。模拟gh resolve→download覆盖失败base的成功任务、Windows覆盖、2次run读取/4个精确下载目录、非祖先拒绝；真实GH元数据resolve验证成功。版本0.1.0、JS语法、YAML及diff检查通过；actionlint未安装。没有运行前端/Rust/App或安装包构建。准备提交并只触发草稿工作流，正式发布仍未授权。


v0.1.0草稿已生成：[Release草稿](https://github.com/arch3rPro/Skills-Space/releases/tag/untagged-62b410644e265fcf1b2f)，[准备任务41563992204](https://github.com/arch3rPro/Skills-Space/actions/runs/41563992204)成功。发布记录提交592e43d，保留Mac/Linux的9f7992d和Windows的a9d8144。5个原安装包+SHA256SUMS.txt+BUILD_SOURCES.json共7附件齐全；只下载2个元数据文件，逐一核对GitHub上传摘要、5份安装包校验和、4个平台原manifest来源及发布记录提交，全部匹配。API确认isDraft=true、publishedAt=null；没有重新构建安装包或正式发布。

首次草稿dispatch在解析阶段因job级env不支持runner.temp被422拒绝，没有创建执行任务；改为工作区相对.release-build-sources.json后成功执行。独立静态复核三个命令工作目录一致、临时文件不随附件上传、其余表达式作用域正确；复用原12项脚本检查，没有重新跑测试或安装包构建。


#### v0.1.0 正式发布（2026-11-03）

用户明确授权“发布”后，已将验证完成的草稿发布为最新正式版本：[v0.1.0](https://github.com/arch3rPro/Skills-Space/releases/tag/v0.1.0)。发布时间北京时间2026-11-03 10:12:05；API确认isDraft=false、isPrerelease=false。五个安装包、SHA256SUMS.txt和BUILD_SOURCES.json共七个附件保留，发布说明和各平台真实构建来源不变。没有重新编译、触发构建或改写已上传安装包。


#### 发布后 Pi 扩展包读取修复（2026-11-03）

用户报告正式版Pi扩展包读取失败，实际包复现为固定1.3/1.4版本门槛拒绝已安装官方1.5.0。已统一两个读取入口的稳定版本最低1.3.0资格判断（无主版本上限），保留管理安装身份与原版接口，复用现有测试补齐直接originalRuntime回归，不增加测试定义。实际SDK回归36项通过；唯一调试App及App内实际只读读取通过（6包/4内置项、配置/信任摘要不变）。补强后的默认发现28项也全部通过。详见[Pi修复记录](0006-pi-skill-management.md)。当前代码/记录未提交，未替换正常应用，未触发云端或更改已发布附件；新App仅供本地检查。


Pi版本资格按用户补充要求仅保留稳定版本最低1.3.0，不限制major；官方安装身份及原版接口检查不变。只更新现有资格边界回归并定向检查，不重新打包或启动云端，先前1.5功能证据保留；较新主版本仅为资格规则验证。


本轮整理提交状态：Pi最低版本修复及现有验证记录纳入本地功能修复提交；后续QA包包含该增量，正式应用及已发布附件不变，未推送。


#### 版本栏、更新检查和版本说明（2026-11-03，实施与验收任务）

按用户参考图整理现有设置版本区域：左侧产品标识、Skills Space当前版本与随包CLI信息；右侧等高的检查更新、帮助、报告问题、版本说明、GitHub按钮。去除导出日志及官网入口，不增加全局页脚或其他Agent专属样式。窄窗口按钮自然换行，不挤压标题或拆开图标文字。

已复现匿名GitHub API返回403/rate-limit=0，npm dist-tags正常。应用最新稳定版改读官方releases/latest跳转，说明与历史条目取官方releases.atom；不使用个人令牌或环境专属代理。应用与CLI检查结果分别处理，读取失败可重试，不把CLI更新当作应用更新或自动改写随包CLI。

版本说明复用Modal、Collapsible及SkillHtml安全正文组件：最新正式版默认展开，其他已读取公开历史条目默认折叠，显示实际正文；加载、无发布和读取失败/重试状态完整，关闭不阻止，重新打开复用已有结果，切换语言不重复获取。来源为公开订阅源提供的条目，不承诺无限历史分页。

本次采用局部轻量验证：相关HTTP/解析与组件检查、同一个QA App打包及普通App观察版本栏与说明弹窗，不跑整套UI自动化/其他Agent流程。Pi已有修改保留并复用有效验证，不提交或发布本轮代码。


定向检查结果：版本服务4项、共享正文/链接19项、真实React版本组件流程2项全部通过；TypeScript及Rust编译通过。组件检查覆盖延迟读取、关闭/重开复用、失败重试、空结果、最新版本变化后的缓存失效、旧请求不能覆盖新结果，以及应用/CLI检查结果分离。CI清单只做列表校验，当前Unix83/理论Windows80项，无漏选或重复执行；没有运行整套CI。

独立界面静态审查发现的加载态、降低动态效果偏好和品牌图标入口已统一到现有组件；安全HTML复用增加显式来源，使GitHub相对链接按GitHub解析，商店默认来源不变。首次QA包完成后收到版本加载态意见，修正为现有VersionValue，需最终更新同一个QA包；不把两次打包记为一次。QA包识别签名曾阻塞桌面工具，已对同包补签并核验标识；实际界面观察结果及最终包状态另行补记。原正式应用、既有发布附件及Pi有效验证不变；未提交、推送或触发云端构建。


实际界面检查未完成：桌面工具按bundleId绑定时报告旧/新测试包路径歧义，唯一恢复为新QA包绝对路径；该getApp调用1701.7秒未返回，已中止。QA进程启动及后续补签成功不等于界面通过，未取得版本栏或弹窗截图，不声明设计验收通过。停止继续恢复工具，由用户手动检查最终本地QA包。此次工具等待显著超出既定恢复时限，记录为执行流程问题，不记为测试执行用时。


最终同一个QA包更新成功，Tauri构建19.769秒（包含前端严格构建）；随后ad hoc补签、codesign --verify --strict通过，标识com.skills-space.directory-actions-native-qa。未重跑已有功能检查，未启动或替换正常App。包位于src-tauri/target/debug/bundle/macos/Skills Space Directory Native QA.app，仅供本地手动检查；实际界面未验证的范围保留。


#### 版本区域交互修正（2026-11-03）

按用户补充要求：帮助在应用内展示快速上手及技能空间、商店、范围、原生技能、更新卸载和设置的用途，不再跳转README。版本说明只展示发布正文中新增功能、功能优化和Bug修复的实际功能列表，不展示下载、签名、构建来源、校验内容，也不展示首次发布无上一版本的占位段；最新展开、旧版折叠机制保留。当前应用及随包CLI版本前统一显示v。

固定原版skills CLI 1.7.4尚无独立升级及兼容资格流程；应用更新检查仅检查Skills Space，不访问npm检查上游或提示升级CLI。CLI继续随应用经过兼容验证后升级，本轮不引入动态替换。沿用局部轻量分支，两个reviewer只复核受影响行为与静态界面，复用未失效证据；上轮桌面绑定阻塞未消除，不再尝试CUA，由用户手动确认本地包实际显示。


本轮定向结果：版本模块4项通过，版本组件2项通过（2.259秒），共享正文20项通过（0.508秒）。直接以当前公开Atom正文运行实际摘要函数，确认只保留六条新增功能，排除占位、下载、构建来源。独立静态界面复核未发现待修项；应用内帮助不打开外链、CLI不参与更新结果、v前缀及说明筛选有对应检查。未调用桌面工具，实际排版与键盘操作仍待手动观察；既有未受影响检查不重跑。


本轮唯一QA更新构建成功（34.094秒，含严格前端构建），ad hoc签名与verify --strict通过。沿用同一Skills Space Directory Native QA.app；正常应用未替换，未提交或推送，未触发云端构建。


本轮整理提交状态：版本检查、应用内帮助和用户更新摘要及其定向验证记录纳入本地功能修复提交。保留历史验证和实际界面未观察的边界，未推送或发布。
