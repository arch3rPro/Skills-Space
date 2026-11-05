# 项目文档索引与适用状态

核查日期：2026-11-02。本项目由重构后的完整源码独立初始化，仓库为 `arch3rPro/Skills-Space`。下文及历史记录中的旧提交编号属于迁移前的 `arch3rPro/skills-space-bk`，不表示新仓库保留了这些 Git 对象。现有能力、验证证据及尚待手测的边界继续有效；此索引不增加产品范围，也不证明未验证能力已交付。

## 当前入口及职责

| 文档 | 状态与用途 |
| --- | --- |
| [README](../README.md) | 项目介绍、主要能力、开发启动和文档导航；详细合同与限制由对应文档维护 |
| [AGENTS](../AGENTS.md) | 当前项目约束、质量要求、视觉保留与条件式阅读入口 |
| [CLAUDE](../CLAUDE.md) | 当前普通开发流程；按任务规模执行，不默认启动重型方法 |
| [CONTEXT](../CONTEXT.md) | 当前领域术语表及语义边界；不代替开发规范、产品需求或功能验收记录 |
| [发布指南](agents/release.md) | 手动构建、失败任务重跑、产物复用、版本说明和草稿发布流程 |
| [开发指南](agents/development.md) | 当前运行入口、历史代码边界与验证方式 |
| [UI 设计基线](design/ui-system.md) | UI 实现／审查前必读；tweakcn 主题、shadcn 组件清单、简约设计语言、信息层级与一致性验收的权威入口 |
| [Codex 设计基线推广](specs/0011-codex-inspired-design-baseline.md) | 已确认样板的全项目推广范围、实现归属及实际验证状态 |
| [完整组件目录](design/component-catalog.md) | 官方 Radix registry 全量组件、用途、安装状态和参考入口；已安装可复用，未安装可按需添加，空条目单独标明 |
| [创意工坊交互原型](design/skill-workshop-preview.md) | 新分支中的独立前端演示、打开方式、数据边界和本轮验证范围；不代表产品后端交付 |
| [领域文档约定](agents/domain.md) | 何时更新术语和 ADR；不维护第二套术语表 |
| [技能使用约定](agents/skill-usage.md) | UI 技能按任务触发必读；其他方法按需选择，不自动调用 TDD、多 Agent 或整套插件流程 |
| [本地任务记录](agents/issue-tracker.md) | 多任务交接需要时使用本地工单；简单修改不强制工单与状态模板 |

读产品范围时用有效 spec，读已接受架构取舍时用有效 ADR，核对目前是否实现时看运行代码和注明日期的验证证据。计划、研究和历史报告均不能替代完成证据。

**当前待办入口：** [0004 已完成／待开发／待验证／暂缓清单](specs/0004-upstream-capability-completion-plan.md#当前状态与剩余工作2026-11-02)。有日期的旧“未提交／未启动／待验收”段落是历史检查点，不能覆盖当前状态表；未观测的账号、平台和交互状态仍单列，不因代码已提交而自动通过。


## 产品规范与实施计划

| 文档 | 状态 | 适用关系 |
| --- | --- | --- |
| [0003 上游一致重构](specs/0003-upstream-aligned-refactoring.md) | 当前已确认基线；部分完成 | 原版 CLI、本机项目/全局、原有视觉与操作边界；受支持来源的核心闭环已补齐，完整上游能力仍待接入 |
| [0004 上游能力与闭环](specs/0004-upstream-capability-completion-plan.md) | 当前分阶段实施计划 | 核心生命周期已有 2026-10-13 交付记录；其余上游能力、来源/参数和平台验证仍待完成 |
| [0005 项目优化](specs/0005-project-optimization-plan.md) | 结构清理、加载／筛选修正及当前资料清理已实施；其余结构优化为候选 | 2026-10-13 移除退役实现、提取图标／弹窗／基础原生测试，补充现有验证入口；其余模块优化仍为计划 |
| [0013 创意工坊](specs/0013-skill-workshop.md) | 2026-11-05 创建／修改、内置技能、评估及优化已接入 | 四种原版Agent工作台、固定技能资源／检查更新、独立只读报告及对话优化已定向验证／QA打包；Codex 与 Pi 已实测方案和构建，Claude Code 与 Sarvam Code 待实机验证，独立试用／删除保护待完成 |
| [0009 DSH 原生技能管理补齐](specs/0009-dsh-native-skill-management.md) | 原生管理、通用配置 A—C 及桌面运行包读取已实施并提交 | 上下文检查、声明组合、Profile 覆盖／恢复、四种调用策略及独立文件废纸篓卸载；父 preset／动态只读 |
| [0012 DSH 设置与原生管理重做方案](specs/0012-dsh-settings-native-skills-rebuild.md) | DSH 配置、完整发现库存、托管/原生独立策略已随 `ec1feb3` 提交；版本反馈 `008a896`、共享筛选 `79b32ef`；各轮定向验证及待用户手测边界保留 |
| [0007 DeepSeek Harness 技能管理](specs/0007-deepseek-harness-skill-management.md) | 首批完成；完整原生回归通过 | DSH 只读检查、原版通用 CLI 生命周期及增强适配／通用支持分类 |
| [0006 Pi 原生技能配置](specs/0006-pi-skill-management.md) | 技能与扩展包管理已实施并提交；受影响页面已完成定点原生 App 验收 | 设置内 Pi 设置、原生目录／规则与卡片启停；Pi 扩展包安装／卸载、资源加载和 1.4.0 适配见最新增量，包更新委托原版 Pi，通用技能生命周期保持原版 CLI |
| [0008 Hermes 技能增强适配](specs/0008-hermes-skill-management.md) | 技能管理已实施并提交；验证范围见 0008 | 全局／项目／原生检测、Hermes 设置、项目信任、启停与预加载；后续范围单列 |
| [0010 Codex 技能与插件增强适配](specs/0010-codex-skill-plugin-management.md) | 本地管理及批准增量已实施并提交；B5 核心修复完成，B6 分项验收完成、全矩阵未闭合 | 各批范围与实际验证见 spec 和[全面对账](research/codex-implementation-reconciliation-2026-10-22.md)；构建不代表完整产品验收 |

## 架构决策

| 文档 | 当前状态 | 适用范围 |
| --- | --- | --- |
| [ADR 0002 本地配置与秘密](adr/0002-local-configuration-and-secrets.md) | 部分原则保留；旧范围历史化 | 保留非敏感本地偏好、显式项目及秘密分离；Server、Manifest、90 天历史等不作为首期要求或已实现能力 |
| [ADR 0004 上游锁文件](adr/0004-upstream-lockfile-authority.md) | 原则有效，已按 ADR 0005 修订 | 上游负责锁写入，桌面观察实际目录并核验；锁记录不证明实际安装或加载 |
| [ADR 0005 原版上游 CLI](adr/0005-use-unmodified-upstream-cli.md) | 当前有效 | 固定未修改的原版 CLI；目前拒绝非 local，SSH 未实现或验证 |
| [ADR 0006 临时使用会话](adr/0006-temporary-use-sessions.md) | 当前技术实现决策 | 原版 use、系统终端交互、内容核验与应用专属临时文件释放；验收记录见计划 0004 |
| [ADR 0007 Agent 原生技能适配方向](adr/0007-agent-native-management-direction.md) | 技能管理方向有效；后续已明确授权 Pi 扩展包、Codex 插件及独立账号授权的受控接入 | 通用 Agent 管理扩展已撤回；保留技能生命周期与原生技能设置边界 |

## 研究与设计记录

| 文档 | 状态与读取目的 |
| --- | --- |
| [Agent 管理与排序](research/agent-management-order-review.md) | 2026-10-14 的设置精简、持久排序、检测覆盖与验证边界 |
| [Agent 安装检测与技能归属](research/agent-detection-review.md) | 2026-10-14 的安装证据、共享展示规则及验证边界；保留上游生命周期行为 |
| [Hermes 技能管理与增强适配调研](research/hermes-skill-management-review-2026-10-17.md) | 2026-10-17 固定源码研究；首批已按计划 0008 实施，Hub／内置生命周期等仍待扩展 |
| [Codex App 与 CLI 技能插件调研](research/codex-skills-plugins-review-2026-10-21.md) | 0.162.1 固定源码、原生 schema 与隔离验证；区分 App／CLI、用户级规则、插件来源及生产接口边界 |
| [Codex 插件权限与接入能力核查](research/codex-plugin-permissions-audit-2026-10-24.md) | 2026-10-24 官方策略与接入对账；已实施逐操作判定、市场来源/注册权限与技能读取状态，构建和隔离页面验收通过；已追到原版 App Server 独立登录及工作区路由；已接入按需授权弹窗、独立钥匙串保持与退出；真实账号启停验收按用户选择延后 |
| [Codex 插件页面与市场调整方案](research/codex-plugin-pages-plan-2026-10-24.md) | 已实现：已安装管理、真实公开栏目／分类分页、个人市场、来源筛选和添加菜单；验收边界见研究记录，压缩包暂缓 |
| [Codex 插件压缩包能力核查](research/codex-plugin-archive-import-2026-10-24.md) | 未来扩展研究（本轮不实施）：本地导入经原版隔离验证可行；账号上传独立授权权限未验证 |
| [Codex 设置说明与页面安排](research/codex-settings-item-catalog-2026-10-25.md) | 用使用场景说明功能、影响范围、注意事项和页面归属；附技术字段与验证记录，已实施经确认的默认设置与只读技能规则；其他字段仅为研究 |
| [Codex 技能与插件设置复核](research/codex-settings-capability-audit-2026-10-25.md) | 分析建议：0.164.0 与 App CLI 配置字段、作用域、原版设置分工及隔离读写证据；默认设置与只读规则子集已实施；字段表的其余建议仍为研究 |
| [Agent 与插件加载性能核查](research/loading-performance-audit-2026-10-25.md) | 请求去重、范围缓存、侧栏轻量读取及数量回归已修复并提交；真实账号网络耗时未验证，旧 DSH 失败与本次定点修复分开记录 |
| [Codex 项目插件作用域与内部组件](research/codex-project-plugin-scope-2026-10-25.md) | 项目覆盖、用户默认、账号状态的写入边界；内部组件自动安装和运行注入证据 |
| [Codex 市场升级行为核实](research/codex-marketplace-upgrade-review-2026-10-23.md) | 原版单市场升级已授权接入；资格、实际影响、结构化结果与隔离验证，保留原调研边界 |
| [Hermes 技能检测](research/hermes-skill-inventory.md) | 分类目录、额外目录与 CLI 管理边界；接管研究及验证记录 |
| [常用 Agent 生命周期与启停能力](research/agent-lifecycle-capabilities.md) | Claude Code、Pi、Codex、Hermes、OpenClaw 和通用目录的首轮官方资料调研；已知能力、证据限制与待验证项 |
| [技能管理重新调研](research/skill-management-scope-review.md) | 当前研究方向；仅跨 Agent 技能生命周期、原生启停、目录／规则与来源差异，补充 Hermes 全局／平台禁用证据 |
| [DSH 技能、插件与分端配置复核（2026-10-29）](research/deepseek-harness-management-review-2026-10-29.md) | 固定 master 源码重核 CLI/Desktop/Web、技能所有权、scope、插件与 Agent 配置；附原调研时实现差异；后续已批准实施及验收见 0012 |
| [DSH Desktop/Web 与插件/Agent 证据](research/deepseek-harness-surfaces-evidence-2026-10-29.md) | 上述复核的固定源码逐项证据；明确不同 Profile/userData 文件与可读写边界 |
| [DSH 配置图形化管理可行性](research/deepseek-harness-config-editor-capabilities-2026-10-29.md) | 自定义预设发现范围、Settings 与完整 ConfigEditor 的区别、普通配置与继承覆盖的可编辑边界；调研建议，未实施通用编辑器 |
| [DSH 配置机制复核与补齐方案](research/deepseek-harness-configuration-mechanism-review-2026-10-18.md) | 2026-10-18 固定源码与发行包复核；A—C 已批准并实施，验收见 0009；父 preset 完整覆盖暂缓 |
| [DSH 原生配置与技能补齐调研](research/deepseek-harness-native-management-review-2026-10-17.md) | 已核查本机与固定上游源码；A—D 已批准，实施与验收状态见 0009 |
| [Pi 检测与官方加载器对照](research/pi-detector-loader-verification-2026-10-16.md) | 60 个隔离案例的差异、五类修复及保留的项目信任边界 |
| [Pi 配置与版本管理深度调研](research/pi-agent-management.md) | 保留参考；完整 Agent 管理、本体更新和通用参数建议保留历史；Pi 扩展包管理已由后续授权单独实施 |
| [Pi Codemode 与内置扩展设置设计](research/pi-codemode-builtins-design-2026-10-29.md) | 2026-10-29 官方文档与 Pi 1.4.0 核对；撤去内置扩展管理，代码模式为技能加载下方同级卡片；不管理 MCP，不含沙箱；已按确认方案实施，启动模式为带图标的默认开启／默认关闭二选一；验证见设计文档 |
| [CC Switch Agent 管理参考](research/cc-switch-agent-management-reference.md) | 保留固定源码参考；扩展综合 Agent 管理的建议已停止推进，未运行参考项目 |
| [安装来源复用](research/installation-source-reuse.md) | 2026-10-16 同源批量调用、临时检查会话、安装前复核和逐项结果验证；不修改原版 CLI |
| [上游命令映射](research/upstream-command-map.md) | 当前固定 `skills@1.7.4` 的集成参考；统一维护命令/参数与接入边界，不能解释为全部已交付 |
| [脱离 Fork 网络研究](research/leave-fork-network-upstream-sync.md) | 参考研究；本轮未重新联网核验，不自动执行其中 Git 命令 |

- [2026-10-15 UI 一致性走查](research/ui-consistency-audit-2026-10-15.md)：卡片／Pi／共享控件修复、实际走查结果和按优先级区分的待修项。
- [界面优化核查与交付](research/ui-refresh-review.md)：当前界面调整范围、逐项问题及本轮验证边界。
- [主题来源](research/ui-theme-sources.md)：八套导入配色与本地 Codex 配色、许可、字体与偏好兼容。

## 历史归档

历史规范、计划与报告已总结归档，不再保留分散的旧任务入口。原文可由归档说明中的 Git 提交追溯；归档中的测试数字保留原日期，不作为当前发布的通过证据。

| 文档 | 责任与状态 |
| --- | --- |
| [归档索引](archive/README.md) | 归档规则、来源与有效性边界 |
| [旧 managed 阶段总结](archive/legacy-managed-phase.md) | 汇总旧规格 0001／0002、ADR 0001／0003、被否决设计、13 份旧设计／计划／报告及本地工作记录 |
| [1.5.20 集成历史](archive/upstream-1.5.20-integration-history.md) | 原版 CLI 旧版本集成验收，单独保留 |
| [1.7.2 测试输出](archive/upstream-1.7.2-verification-log.md) | 已结束的四项能力测试日志，不是本次迁移重跑结果 |

## 历史规范收尾与证据边界（2026-10-13，功能实施前）

- 核对活跃入口 `src-tauri/src/lib.rs`、原生目标/检测/目录观察、前端契约与展示过滤、偏好存储及依赖 pin，修正文档中的 managed 所有权、检测含义、远程和完成状态。
- 保留 `CONTEXT.md` 作为当前术语表并更新定义；开发标准、产品范围、架构决策和事实证据由上表对应文档分别承担。
- 修复旧研究指向已退役规范、旧 ADR 仍被当作有效全量决策、旧计划强制技能指令及规范/指南被忽略的问题。`.gitignore` 允许上述 Markdown 文档纳入正常版本管理，私人参考、生成产物和 `.scratch` 临时任务记录继续忽略。
- 本轮只改文档与文档的 Git 忽略规则；未调用技能或子 Agent，未改功能代码，未重跑或新增运行测试。历史正文中的实现示例保留作历史证据，未重新逐例执行。
- 文档验收：36 份文档均有索引入口，124 个本地 Markdown 链接可解析，所有文档均未被 Git 忽略；167 个非文档文件的 SHA-256 与本轮开始时一致，`git diff --check` 通过。运行验证结果保留原始日期与缺口，不改写为本轮通过。

## 后续功能实施

技能管理闭环的功能变更和运行证据见[计划 0004](specs/0004-upstream-capability-completion-plan.md)。上述“仅改文档”和文件哈希检查只描述此前规范收尾，不表示后续未修改功能代码。

- [1.7.2 升级审计](research/upstream-1.7.2-upgrade-audit.md)：当前升级差异、适配与后续顺序。
- [1.5.20 集成历史](archive/upstream-1.5.20-integration-history.md)：历史证据；由当前命令映射和升级审计替代接口结论。

- [项目侧栏记录](research/project-sidebar-review.md)：全局/项目 Agent 导航、项目元数据与折叠排序、旧偏好迁移和桌面验证边界。

- [技能分类与 Pi 配置入口](research/skill-collections-review.md)：托管／原生技能分区、能力边界、Pi 可配置标记及候选配置与验证。
- [技能工作台想法与入口收敛](research/skill-workbench-ideas.md)：仅记录待重新调研的工作台草图；当前隐藏创建／测试入口、目录与添加技能入口位置的实施范围及验证。
- [创意工坊创建与评估选型](research/skill-workshop-creator-evaluation-2026-11-04.md)：官方 creator、darwin 与 SkillOpt 固定源码对比；Codex、Pi 最小验证及同一产物跨 Agent 试用已完成，未安装或接入页面。

- [Codex 实现整体复查](research/codex-implementation-audit-2026-10-21.md)：用户反馈后的界面职责、插件启停、来源覆盖与验收缺口；更正上一轮完成结论。

- [Codex 全面对账与分批修复](research/codex-implementation-reconciliation-2026-10-22.md)：已批准职责、33 项行为对账、10 项追加内容、B1–B6 依赖与验收、接口待核实项；B1–B4 已实施，B5/B6 最新状态以该文档当前批次表为准。

- [现有测试去重与精简](research/test-suite-rationalization-2026-11-03.md)：全部文件去留、重复覆盖迁移、实际流程削减和前后数量/耗时；2026-11-03本地结果，跨平台与原Agent专项边界单独保留。
