# Hermes 技能增强适配实施清单

状态：2026-10-17 首批及六项界面／文档修正已完成，针对性验收通过；已获确认并提交（`52aeaca`），共享界面修正见 `3b8c7de`。研究依据：[Hermes 调研](../research/hermes-skill-management-review-2026-10-17.md)。这份清单区分本次任务与后续候选，不代表未验证能力已经完成。

| 项目 | 本次范围 | 状态 |
| --- | --- | --- |
| 配置档根目录及安全配置读取 | 默认／显式 HERMES_HOME，不切换实际 Hermes 会话 | 已完成 |
| 全局／项目／原生库存 | 项目两目录、Git 根、全局继承隔离、内置与 Hub 来源 | 已完成 |
| 配置与目录状态解析 | 信任、发现、禁用及同名优先级；不代表实际会话加载 | 已完成 |
| 设置 → 智能体 → Hermes | 既有组件与返回方式、保存与草稿保护 | 已完成 |
| 目录配置 | external_dirs、create_dir，保留未知 YAML 与注释 | 已完成 |
| 项目发现与信任 | project_discovery、trusted_project_dirs；信任为明确用户操作 | 已完成 |
| 技能启停 | 当前配置档全渠道规则，必要时确认影响范围；不改技能正文 | 已完成 |
| 预加载 | auto_load；不伪造仅手动调用；按名称／加载键配置 | 已完成 |
| 并发与文件保护 | 配置版本校验、锁、原子写入、只写当前配置档 | 已完成 |
| 针对性验证与重启 | 配置／库存／原版 CLI 生命周期、隔离桌面验证 | 已完成 |
| Hub 原生更新、安装、卸载 | 本轮只读识别，不执行 Hermes Hub 生命周期 | 后续扩展 |
| 内置同步、diff/reset/opt-out | 本轮识别来源；不升级 Hermes 本体、不更改同步政策 | 后续扩展 |
| 渠道级禁用编辑 | 本轮保留并读取已有规则；编辑先限配置档全渠道 | 后续扩展 |
| 多配置档切换／创建／删除 | 本轮读取显式根；不建设配置档管理器 | 后续扩展 |
| 写审批、Curator、Bundle、动态插件设置 | 保留原值，不加入本次编辑范围 | 后续扩展 |
| 真实会话加载／扫描保证 | 不用离线配置检查宣称已加载；动态条件验证仅记录在详情／研究中 | 未做，不作完成承诺 |

配置启停属于 Hermes 原生技能设置扩展，托管安装／更新／卸载仍由固定未修改的 skills CLI 执行；不写 CLI 或 Hub 来源锁。App 观察安装内容与运行时资格分开，不自动信任项目，不执行 Hermes 插件、扫描器或 Agent 代码进行发现。项目已有文件即使未信任仍可展示，但不声称已加载。

## 首批验证记录（2026-10-17）

- `pnpm build`：通过；现有分包大小提示保留，没有新增运行依赖。
- `CI=false pnpm tauri build --debug --bundles app`：通过；复用已完成前端构建，跳过重复前置构建。原版 skills@1.7.2 与 Node 22.20.0 保持不变。
- `pnpm test:frontend-contracts`：通过；其中 Hermes 7 项测试覆盖项目物理库存／信任、同层歧义／跨层覆盖、Hub 精确路径归属、注释与未知 YAML、启停／预加载独立、过期版本及别名拒绝、支持目录与循环链接。
- Hermes 原生 4 项针对性测试：通过；覆盖原版 CLI 的复制／链接安装卸载、不接管分类技能、项目不混入全局、配置保存及过期版本拒绝、技能正文不变。未执行全量原生回归。
- 隔离 HOME 的打包应用：已观察设置入口、默认保存按钮禁用、目录保存、Tab 切换和关闭窗口的草稿保护、信任确认／保存、项目范围隔离、卡片启停／预加载即时更新，以及重启后的持久化。模拟外部修改后，保存被拒绝，草稿和外部修改均保留。采用现有返回、Field、Card、Switch、AlertDialog、Tooltip 和通知样式，没有更换主题或卡片布局。
- 检查与配置准备不运行 Hermes 代码，不初始化 `.hub`；测试修改只发生在隔离目录。没有执行真实 Hermes 会话／扫描器／联网更新；不承诺旧会话立即采纳配置。渠道级禁用保留原值，本轮显示的是配置档全渠道启停设置，不是特定渠道的最终可用性。

## 明确未做与后续完成条件

| 能力 | 当前处理 | 后续完成条件 |
| --- | --- | --- |
| Hub 安装／更新／卸载 | 只读来源识别 | 明确原生命令合同、保留本地修改保护，隔离 Hub 生命周期验证 |
| 内置同步／差异／恢复 | 读取内置清单，不改同步状态 | 明确版本与本地编辑策略，验证 diff/reset/opt-out |
| 渠道禁用编辑与有效状态 | 保留已有渠道规则，不提供渠道编辑 | 明确渠道上下文，与全渠道禁用取并集验证 |
| 多配置档管理 | 遵循当前进程显式 HERMES_HOME | 独立配置档选择／创建／隔离方案再确认 |
| 会话工具／插件条件、项目扫描 | 标记未验证，不执行扫描器 | 授权并建立隔离 Hermes 运行时验证，不以目录存在替代加载成功 |
| Curator、写审批、Bundle 与技能配置变量 | 未编辑 | 分别调研作用范围与安全写入合同，再确定 UI 子集 |

上述后续项均未承诺完成日期，也不纳入本次提交完成范围。

## 界面修正复核

- [x] 删除“常驻显示未验证”的错误设计要求；常规卡片仅保留可处理的阻碍／冲突。
- [x] 配置档设置和项目信任分组，项目选择仅位于信任区域。
- [x] 检测异常采用本地化的原因与路径，未知诊断不直接输出；移除目录字段的冗余帮助。
- [x] 当前项目只通过一个信任开关操作；列表仅显示其他已信任项目。
- [x] 将“原生加载状态已完成”纠正为“配置与目录状态解析已完成”。
- [x] 已确认悬浮组件统一标准，更新共享组件及 Pi／Hermes 调用控件。
- [x] 完成浅／暗、默认／窄窗、较大字号、中英文、键盘悬浮与确认弹窗的实际界面复核。

本次实际观察：

| 环境 | 已检查内容 | 结果 |
| --- | --- | --- |
| Vercel 暗色、中文、16px、1280×800 | Hermes 分组、项目选择、唯一信任入口、异常中文与路径、帮助 Popover | 已观察通过 |
| Vercel 浅色、英文、18px、1280×800 | 设置标题、字段、路径、表单及按钮可读性 | 已观察通过 |
| Vercel 浅色、英文、18px、约 960×640 | 纵向滚动可达项目／保存，Select 键盘选择、信任确认弹窗 | 已观察通过 |
| Claude 暗色、英文、18px、约 960×640 | 主题切换、侧栏底部 Popover、项目菜单碰撞翻转、项目原生卡片无常驻验证提示 | 已观察通过 |
| Pi 与 Hermes 原生卡片 | 键盘聚焦 Tooltip 均在上方居中，Escape 关闭 | 已观察通过 |

最小窗口和18px英文组合下，库存工具栏继续使用既有横向滚动兜底，保留搜索／筛选宽度；未将其描述为无横向溢出。检查没有覆盖所有配色、语言、尺寸的笛卡尔积，也未重新执行全量原生生命周期回归。鼠标 hover 的方向规则由与已观察键盘提示相同的 Radix Tooltip 配置提供；未单独声称完成所有鼠标悬浮入口的实测。

构建、打包与 `test:frontend-contracts` 通过；新增2项前端契约测试验证常规卡片不展示动态验证提示，以及诊断翻译／路径／未知消息隔离。没有改 Hermes 配置写入或原版 CLI 生命周期实现。shadcn CLI 的联网文档查询因 DNS 失败，改由官方网页和本地已安装 Radix 接口核对；未更新或重装基础组件。

最终已退出隔离测试应用并重启普通配置的打包应用，停留在“设置 → 智能体 → Hermes”。未提交，等待用户确认。


## 托管集合原生状态隔离（2026-10-18）

修正托管技能附带 Hermes 扫描数据时，详情误显示“项目未信任 · 按需加载”的问题。卡片异常提示、配置档启停、预加载按钮和详情状态统一通过原生集合资格判断，托管技能保留通用管理界面；不改变底层扫描数据、Hermes 配置或 CLI 生命周期。

验证：新增回归覆盖 CLI 托管、未记录但可由 CLI 管理、原生只读及无状态四种情况；Hermes 前端／helper 共 10 项测试通过。`pnpm build`、`CI=false pnpm tauri build --debug --bundles app` 及 `git diff --check` 通过。已使用测试 HOME 打开更新包；本次未重新自动操作桌面详情或执行原生生命周期全套回归。手动核对入口为全局／项目管理的托管集合：详情和卡片不显示 Hermes 原生状态及控制；原生集合保留原有状态和资格限制。未提交，保留其他并行修改。


## 当前 Agent 与配置操作边界修正（2026-10-18，用户确认）

上节按托管／原生集合隐藏所有 Hermes 状态与入口的规则已被本节替代。Hermes 启停和预加载只修改 `config.yaml`，因此托管与原生技能均可使用，但必须处于明确的 Hermes 上下文，并满足原有 `canToggle`／`canPreload` 条件。项目／同名范围确认保持不变。详情中的信任、禁用、加载状态只展示当前 Hermes 结果，不出现在 Pi、DSH 或“所有 Agent”视图。技能空间明确按 Hermes 筛选时与 Hermes 管理页保持一致。来源、路径和 CLI 共享保护不受此显示隔离影响；本轮不新增 Hermes 批量功能。

## 2026-10-20 loading controls correction

Native inventory filters include enabled, disabled, session preload and on-demand loading. Disabled skills do not match the two active loading filters. Clock and Zap distinguish deferred/on-demand loading and startup preload without treating on-demand loading as manual-only invocation. Ordinary disabled states use the existing switch rather than repeated detail prose. The native inventory reuses the existing bulk-selection bar for enable/disable and preload changes; a batch validates every selected document and the configuration revision before one atomic YAML write. Unknown fields and comments remain intact; a stale item prevents the complete batch from writing. Project/name-wide effects retain the existing confirmation.

Verification: Hermes frontend/helper contracts and five isolated native fixtures passed, including all-or-nothing batch writes, stale-item rejection, retained YAML/comments and restart inspection. The isolated packaged desktop flow exercised preload filtering, bulk disable/enable/preload, stale-document rejection without partial writes, restored-document retry and restart persistence. Dark/default and light/minimum-window card and bulk-bar layouts were observed. No Hermes runtime session or scanner was executed.

UI correction: card Switch labels/tooltips report current enabled/disabled state; loading hints consistently report on-demand/session-preload state. The batch Loading mode dropdown shows both choices with a chevron; each choice evaluates only the selected items whose mode would change. Already-matching items are omitted from the single batch request, retaining protection for actual read-only changes. Preload configuration remains editable while a skill is disabled, without enabling it; runtime disabling and preload preferences remain independent. Verification: focused frontend contracts passed; Hermes helper tests and the isolated native batch fixture confirm that loading-mode changes while disabled leave disabled state unchanged, preserve YAML and survive inspection/restart. Frontend build passed. This localized correction does not repeat the complete desktop sync workflow.

The loading-mode icon pair was corrected to Clock (deferred/on-demand loading) and Zap (session-start preload), retaining the existing icon-button size, treatment and current-mode Tooltip. Bulk mode choices use the same pair; the menu trigger retains its settings icon and dropdown chevron. This is a localized icon correction; no extra state label or card row is added.

Icon-only delivery: frontend and debug desktop bundle builds passed; the updated main application was opened and its prior Codex page restored. This step reused the preceding functional/isolation results and did not repeat lifecycle automation. Manual visual acceptance of the revised icon semantics remains with the user.

## Hermes inventory interaction parity correction

Managed and native Hermes collections share the existing bulk controls; Pi and Hermes use the same enable/disable button component. Managed selection uses skill names as in Pi managed inventory; native selection uses file identity, retaining selections outside the current filter. Each action selects only editable changed items, so the essential hermes-agent skill remains enabled without blocking other selected skills. All changes still use one native request and one configuration write, with actual completed-item count. Mode choices use the same installed DropdownMenu composition and left alignment as Pi.

Save failure reads current settings back into the inventory and open detail, retains selections/filters and closes a stale confirmation before retry. Applying a returned snapshot no longer causes an extra settings fetch on every inventory merge. Project/name-wide effects keep the existing confirmation. Verification: 18 targeted frontend contracts passed; the isolated packaged desktop flow verified an original-CLI-installed managed skill, native selection including the essential skill, preserved off-filter selections, changed-item counts, batch preload and both document/config revision failures. Failed saves retained external content, read back current state, closed stale confirmations and allowed direct user retry without manual refresh. No real skill or profile was changed. Final frontend/debug bundle checks are recorded below.

After successful skill-state readback, revision/eligibility failures ask the user to review and retry. Settings-editor failure guidance remains unchanged, and failed readback retains the original failure without claiming refreshed state.

The preload button now uses ghost/icon-sm in both states, matching neighboring card actions; the configured preload state no longer adds a secondary filled background. No icon size, card layout or hover/disabled primitive was changed.

Final verification: frontend and debug desktop bundle builds passed. The final isolated app retained managed/native enablement and preload settings after process restart. Dark/light observations confirmed transparent preload buttons in the enabled/preload state, with the standard glyph size and adjacent-action alignment. The test app was stopped; the main app was restarted after confirming no draft or operation was active. Real skill/configuration writes and Git commits were not performed.
