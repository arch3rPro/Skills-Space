# 2026-10-15 UI 一致性修复与产品走查

状态：初轮卡片／Pi 页面修复后，已继续修复下列走查问题；初轮与后续验证分别记录。验证与待修项分开记录；不表示所有产品流程、操作系统或每个运行分支均已验收。设计权威为 [UI 设计基线](../design/ui-system.md)，可选控件见 [组件目录](../design/component-catalog.md)。

## 已修复

| 位置 | 问题与最终行为 |
| --- | --- |
| `src/App.tsx:485` 技能卡片 | 同名冲突、核验状态、插件／Eve 信息不再追加正文；收进固定信息图标，完整说明在提示中可读，点击仍进入实际技能详情。名称一行、描述两行，描述缺失仍保留该区域；底部信息与操作对齐，网格统一行高。原有操作限制和 Agent 图标保留。 |
| `src/index.css` 卡片／工具栏 | 离屏卡片估算改为匹配卡片内容的相对单位，避免放大等高网格空白。工具栏随内容区宽度变化：窄区将刷新、批量选择的文字收为图标，保留可访问名称与提示，默认窗口保持文字。所有库存视图共用规则。 |
| `src/components/pi-management.tsx` | 保留配置路径、附加目录、规则和显式保存；用现有 Card／Field 组合及共享 Textarea。目录添加／移除为图标操作；删除需求约束文案和重复常驻说明。目录规则、生效方式分别收进标签旁的帮助入口；保存成功仅显示局部短反馈。SelectItem 补齐 SelectGroup。 |
| `src/components/ui/textarea.tsx`、`popover.tsx` | 经官方 CLI 的 add dry-run／view 取得 Radix Nova 源码，接入本地 cn 工具；Textarea 聚焦、无效与暗色状态对齐既有 Input；Popover 统一主题、边界、滚动和键盘行为。未引入重复 cn 依赖、未覆盖现有控件。 |
| `src/components/help-popover.tsx` | 共用标签侧帮助入口，支持键盘激活、Escape 关闭和焦点返回；较长规则示例使用可点击浮窗。 |
| `src/components/project-editor.tsx`、`sidebar-quick-settings.tsx` | 复用共享 Popover，移除各页的独立浮窗皮肤；项目图标搜索增加字段属性，保持选择行为与主题色。 |
| `src/components/flow-error.tsx` | 已识别错误只显示一条明确原因与处理建议；未知错误使用调用方建议，原始诊断保留折叠详情。避免“原因已说明下一步”后再重复泛化重试说明。 |
| `src/App.tsx` 商店／详情 | 榜单搜索图标居中；本地／Git 入口移除泛化引导段落，旧“临时使用”统一为“技能测试”；详情返回使用既有图标按钮。 |

## 产品走查结果

| 模块 | 实际检查 | 结果／范围 |
| --- | --- | --- |
| 技能空间、Pi 技能页 | 默认窗口的三列；同名、长名称、长描述、无描述；卡片信息入口、详情返回；启停后仍计数 | 卡片等高、底部对齐；原生限制仍生效。 |
| Pi 管理 | 配置读取／保存、短反馈、帮助打开／Escape／Enter、英文帮助换行、较大字号 | 指定布局与文案问题已修复；后续草稿保护验收见下节。 |
| 技能商店 | 榜单加载及分页入口、在线关键词搜索返回、Git／本地来源表单 | 读取成功；未从公网结果安装技能。 |
| 安装向导 | 无效本地来源错误、修正来源继续、勾选后反选、Agent 搜索保留已选、确认摘要 | 流程可继续；确认页保留同名替换和共享目录影响。未点击确认安装。 |
| 项目编辑 | 新增表单、图标搜索及选择、空表单错误、取消 | 共享浮窗正常；必填错误的重复说明由 FlowError 修复。未保存新项目。 |
| 外观／侧栏 | 深色 Vercel、浅色 Vercel／Claude、英文、18px、窄窗口 | 配色和控件保持主题关系；确认工具栏挤压后补充窄区图标布局。不是八套主题全状态矩阵验收。 |
| 技能测试 | 来源检查与技能／运行方式选择页 | 初轮发现旧单选和双重滚动；后续已修复，并验证选择与准备确认页。未启动实际 Agent 会话。 |
| Agent 管理、创建、项目依赖安装、锁文件恢复、更新／卸载结果 | 源码／现有组件静态走查 | 未执行完整变更流程，相关原生逻辑本轮未修改；不能将此项写成桌面闭环通过。 |

## 走查问题处理情况（后续已实现）

| 原优先级 | 位置 | 修复与验证 |
| --- | --- | --- |
| P1 | `src/components/pi-management.tsx`、`src/App.tsx` | 已修复：重新读取、返回、范围、Tab、侧栏导航和正常窗口关闭共用保存／放弃／继续编辑确认。隔离应用验证取消保留草稿、明确放弃后继续、保存成功后返回及重启读回；外部修改导致保存冲突时仍留在原处且不丢草稿。Tab 改为手动激活，复查 Escape 取消后焦点返回不再重开确认。 |
| P2 | `src/components/use-skill-flow.tsx`、`src/components/ui/radio-group.tsx` | 已修复：采用官方 CLI 取得的 Radix Nova RadioGroup，接入既有主题／聚焦处理；技能列表复用安装选择行的密度，去除 SKILL.md 展开与嵌套滚动。方向键单选、提示词／Codex 选择和确认摘要通过；英文 18px、960×660 窗口中正文单独滚动、固定底部动作可达。 |
| P2 | `src/components/use-skill-flow.tsx` | 已修复：内部技能说明对应“选择测试”；说明保留在更多设置内，来源页只保留不会安装至 Agent 目录的简短边界。 |
| P2 | `src/App.tsx` 详情、依赖／恢复结果 | 已修复：删除详情中的 CLI 管理归属与泛化来源解释。结果默认保留名称、状态、路径，诊断细节及日志可展开；删除重复的操作引导。隔离项目实际执行依赖安装与锁恢复成功，结果状态、路径与文件／锁记录核对；共享影响、覆盖风险及失败／不确定状态仍保留。 |
| P3 | `src/components/appearance-settings.tsx` | 已修复：语言位于整个外观页第一行，显示模式仍在配色主题之前；中文／英文已核对。 |

本次未恢复旧分发逻辑，未修改原版 CLI、安装／更新／卸载或 Pi 配置写入逻辑。保存按钮旁的帮助已删除；目录路径和规则语法仅保留必要的按需帮助，不把冗余说明一律转入问号。

## 初轮验证证据与边界

- `pnpm build`、39 项前端契约与调试 app 打包已完成；最终工具栏／错误修正另行重建并复查。原有大 chunk 提示保留。
- 实际 Tauri 调试包使用临时 HOME／项目：额外生成同名、长名、无描述技能；修改 Pi 配置和外观仅限夹具。结束时已核对所有夹具技能和真实用户 Pi 设置／偏好／技能的 SHA-256 均未变化；Pi 与外观的配置读回正常，重启保留状态。
- 本轮未修改原生生命周期实现、上游 CLI 或依赖版本，未重跑完整 native 生命周期套件，未将源码核查冒称为新的安装／更新／卸载验证。
- 最终包复查：英文／18px／窄窗口中刷新和批量选择收为图标，搜索空间恢复、卡片不再因离屏估算过大而拉长；重启保留配色、字号与 Pi 停用状态。项目英文必填错误显示具体原因且不重复；未知错误回退行为由既有契约保留。组件目录已更新为 23 项已安装、40 项可添加、1 项空条目，并与 CLI／本地文件核对；84 个受影响文档本地链接、严格 TS、构建和 diff 检查通过。未提交。


## 后续修复验证（2026-10-15）

- `pnpm test:frontend-contracts`：39 项通过；严格 TypeScript 与 `pnpm build` 通过。最终 Tab 修正后再次执行 `CI=false pnpm tauri build --debug --bundles app`，包含前端构建、Rust 编译和应用打包，通过；原有大 chunk 提示保留。
- Pi 草稿：实际桌面覆盖重新读取／返回／范围选择／侧栏导航／Tab／窗口关闭确认、取消和保存冲突。保存成功后读取配置、重启再读回相同规则，并确认外部增加的无关字段保留。WebView beforeunload 由源码检查；未声称可阻止强制终止进程或系统强制退出。
- 关闭保护仅新增 `core:window:allow-destroy`：已核对安装版 Tauri API，`onCloseRequested` 默认通过 `destroy()` 完成关闭；草稿确认后同样使用该方法结束窗口。不扩大文件／网络权限。
- 技能测试：实际读取三技能隔离来源，方向键从 alpha 切换 beta，运行模式在提示词／Codex 间切换，准备后的确认页与选择一致；随后返回释放准备计划。未启动真实 Agent 进程。浅色 Claude／英文／18px／窄窗口检查正文滚动、长路径截断、底部按钮与单选主题色；深色 Vercel／中文默认窗口也已检查。
- 依赖与锁恢复：仅在临时项目中新增 `layout-fixture` 依赖，原版 CLI 安装 `dependency-layout-fixture` 到 Codex 共用目录并生成项目锁；随后实际恢复。依赖结果为已安装、恢复结果为已满足，默认诊断折叠，展开内容可读。未据此声称联网更新、卸载或所有失败／不确定分支均已重新桌面验证；其结果状态映射未改。
- 原有真实用户 Pi 设置／应用偏好／技能及原夹具技能通过哈希核对；本次新增技能及锁变更仅位于临时项目。应用结束时恢复正常启动。组件目录更新为 24 已安装、39 按需添加、1 空条目；无新增运行时依赖。未提交。

## 已确认样稿的三页实现与 macOS 图标（2026-10-15）

- 技能空间／Agent 技能页继续共用托管与原生页签、工具栏和卡片。卡片改用共享 `Card` 的 inventory variant，保留品牌图标、来源、更新状态、同名／诊断提示、卸载／打开目录和 Pi 启停；描述固定占两行，长名称、空描述和提示不增加卡片高度。加载态沿用同一网格和卡片分区。
- AGENT管理改为单列管理行，名称／路径、数量／状态、Pi 设置预留位和显示开关对齐；保留四种状态筛选、搜索、检测、鼠标长按／拖动、方向键排序和持久化。浮动拖动行保留当前容器的列布局。静态 Agent 不新增配置入口。
- 外观页改为语言、显示与主题、字体与字号三组；显示模式使用共享 ToggleGroup 预览 variant，主题保留全部八个现有选项并显示当前预览，字号仍为 14／16／18，模式、配色、字体、语言和字号继续独立保存。没有把样稿的 Linear／Vercel 参考数据替换进正式主题库。
- macOS ICNS 从原始图标等比生成：1024 画布中可见边界为 `(92,92)-(932,932)`，四周约 9% 透明留白，主体圆角为边长的 22%。`scripts/build-macos-icon.swift` 记录可重现的 AppKit／iconutil 打包；原始标志、侧栏图片、Windows／移动端图标未变。已核对打包 ICNS 与源码文件一致；实际 Dock 与系统缓存观感仍需用户确认。
- `pnpm test:frontend-contracts` 共 40 项通过。严格前端构建和 `CI=false pnpm tauri build --debug --bundles app` 通过，保留既有的大 chunk 提示。最终极小的搜索提示调整后再次构建打包；未重跑原生生命周期全套。
- 实际打包应用使用隔离 HOME：覆盖中文／深色 Vercel／16px、英文／浅色 Claude／18px，默认窗口与约 960×660 窄窗口；默认三列、窄窗口两列，检查长名、两行描述、空描述、同名提示、来源与底部控件对齐。修复 CardHeader 的固有列宽造成描述截断，并缩短窄窗口搜索提示。
- 实际桌面覆盖搜索、安装状态筛选、鼠标与方向键排序、侧栏顺序同步、Pi 设置进入／返回、Pi 卡片开关状态、添加技能入口及取消。重启后读回语言、配色、字号和排序。未执行新的安装、更新、卸载或修改真实 Pi 配置；真实用户偏好和 Pi 设置与本轮开始的哈希一致。
- 尚未提交，等待用户确认。


## 实际界面再调整（2026-10-15）

- 根据用户对实际效果的反馈，取消继续制作独立样稿，直接调整现有应用。外观页恢复八个可直接选择的主题缩略卡片，去除分组外框和单一大预览；显示模式使用紧凑图标与文字，设置内容宽度统一收紧。现有主题数据、字体、字号及保存逻辑保留。
- AGENT 行去除横向分隔线，改为有间距的圆角轻背景 hover；状态复用共享 Badge 的 dot-and-text presentation，保留三种状态颜色。身份、数量、状态、Pi 设置位和开关继续对齐，窄窗口保留名称下方的数量和状态。
- 技能卡片标题与描述采用更紧凑的共享 inventory 字号；既有卡片内容与所有操作保留。页面标题字重调轻，未改导航与生命周期行为。
- `pnpm build` 通过；最后样式修正后 `CI=false pnpm tauri build --debug --bundles app` 再次通过。实际打包应用以当前深色 Vercel／中文／16px 检查技能空间、AGENT管理和外观，覆盖默认及约 960×660 窗口，观察 AGENT 圆角 hover 和状态无底色。未重新运行安装／更新／卸载流程或全量 APP 自动测试；未声称本轮重新覆盖其他主题与语言。
- 应用已重启加载本次样式；尚未提交，等待用户查看实际效果。


## 页面结构调整（2026-10-15，用户再次授权）

- 侧栏由 15rem 调整为 14rem，品牌区使用紧凑比例；保留全局／项目 Agent 导航、折叠、排序、菜单与底部快捷入口。正文从整块圆角 inset 改为全高内容平面，以侧栏分隔线划分导航与内容，未改主题调色板。
- 技能空间与 Agent 技能页共用新的分类／搜索／筛选／刷新导航行；当前集合的数量、检查更新、批量选择、更多与添加技能位于卡片上方的操作行。刷新与检查更新分区放置，添加技能仍只属于托管技能。Agent 路径与范围并列，保持两种页面的内容起点；卡片能力、数据和事件处理保持原实现。
- 设置标题与三个 Tab 并排，当前面板在下面使用统一内容宽度；外观按语言／模式、八主题卡片、字体／字号分组。宽窗口主题标题与缩略卡片分列，窄窗口上下排列。共享 Tabs 增加 quiet variant，保留原有 default／line 消费者。
- `pnpm build` 通过。布局收尾后再次执行 `CI=false pnpm tauri build --debug --bundles app`，完成严格 TypeScript、Vite、Rust 和 app 打包；既有 chunk 大小提示保留。修改文档本地链接与 `git diff --check` 核对。
- 实际桌面以当前 Supabase 深色／中文／16px 查看技能空间、AGENT管理、外观及 Pi 技能页，覆盖 1280×828 与约 960×660；窄窗口分类和搜索同行、Agent 数量／状态与操作列对齐、主题卡片可读。筛选宽度和 Agent 路径行的最后修正另行重建并复查。八主题数据与外观持久化逻辑未修改；未声称本轮重新覆盖所有配色、语言和字号。
- 本轮没有全量功能回归，也未执行技能安装／更新／卸载、改变 Agent 显示开关或 Pi 配置。通过 macOS 正常启动方式重启后，已确认技能空间与 Pi 页面切换可操作，最终停在默认大小的技能空间供用户查看；尚未提交。


### 分隔线与内容圆角收尾（2026-10-15）

按用户要求，侧栏右侧及底部快捷入口上方分隔线统一使用主题 sidebar-border 的 35% 透明度；正文采用小号主题圆角（最大 .5rem），上／右／下保留 .375rem 窄留白。保留当前宽度、分组和功能，不增加外框或阴影。前端构建、调试应用打包与 diff 检查通过；重启应用检查实际效果，本轮不做功能流程回归，尚未提交。


### 圆角边界与外壳滚动修复（2026-10-15）

前一轮只给内容区增加 margin 和圆角，未限制外层文档高度，也没有裁剪正文；侧栏仍有贯穿窗口的边框，造成圆角旁线段突出和外层越界滚动。本轮将 html／body／root 与应用外壳限制在视口，正文改为内容区内唯一的纵向滚动面，并在圆角容器内裁剪；侧栏保留独立滚动，禁止滚动串联与边界回弹。竖分隔线改为固定侧栏内的限定线段，两端避开正文圆角。Agent 拖动的边缘滚动既有实现会查找最近可滚动父容器，无需更改。

`pnpm build`、`CI=false pnpm tauri build --debug --bundles app` 及 diff 检查通过。实际 Vercel 深色应用检查 AGENT 长列表滚动到最后的 Universal、继续下滚、回到顶部并继续上滚：左侧导航与底部入口位置稳定，正文没有额外区域，内容与分隔线保持在圆角边界内。没有运行安装／更新／卸载或全量功能回归。应用已重启并停在技能空间；未提交。


### 去除分隔线与 Vercel 文字收尾（2026-10-15）

按用户要求彻底移除侧栏竖线与底部快捷入口横线，正文细滚动条使用透明、无边框轨道。Vercel 深浅模式的主要文字分别改为柔和白（OKLCH L=0.90）和深灰（L=0.30），同步调整相关前景文字与次级说明；其他七套主题和背景／primary 填充不变。具体本地偏离记录在主题来源文档。

按 development.md 的小改动路径，仅执行前端构建、应用打包和静态 diff／token 检查，重启供用户手动查看；未自动点击／滚动检查页面，未运行单元套件或功能回归。手动检查要点：Vercel 深浅切换后的标题、正文、说明和按钮文字是否舒适；侧栏及滚动条旁没有分隔线。尚未提交。


### 页头、Tab 与外观分组收尾

- 移除技能空间标题下的范围副标题；技能商店、技能空间和设置共用标题字号及标题到 Tab 的间距。设置 Tab 移到标题下方，保留 Pi 草稿切换保护与原有面板状态。
- 三处主导航统一使用共享 quiet 胶囊 Tab；托管／原生增加 Package／Folder 图标，设置使用对应的小图标。移除集合导航和设置页头横线。
- 外观复用小号 Card／CardContent 承载原有三组 Field／FieldSet，使用外边框，删除全部 Separator；主题、模式、字体和字号的变更处理保持不变。
- 前端构建、调试 app 打包及 diff／文档引用检查通过。遵循小改动路径：只更新并重启应用供手动查看，没有自动切换页面、点击或滚动测试，也未运行功能回归。手动查看重点为三页标题／Tab 起始位置、分类图标、无分隔线和外观的三组外边框。尚未提交。


### 工具栏与可点击路径规范（2026-10-16）

技能空间及全局／项目 Agent 技能页共用一行工具栏：搜索、筛选、刷新居左，集合操作居右；移除卡片上方重复数量，统计仅留在集合 Tab。刷新默认保留文字；空间较窄时副操作收为图标，保留 aria-label/title。搜索／筛选／主按钮不参与 flex 压缩，极窄或长翻译时工具栏本身横向滚动，不挤压页面。技能商店子级总榜／趋势／热门保留 segmented ToggleGroup 左对齐，搜索在右侧，作为第二种布局参照。

顶部目录图标与路径作为同一点击区域，统一 interactive-path 的手型、轻背景／文字 hover、键盘焦点与禁用态；详情中的目录路径同样复用。两种工具栏、宽度保护、响应式降级和路径行为已写入 UI 设计基线；上游流程和数据逻辑不变。

`pnpm build`、`CI=false pnpm tauri build --debug --bundles app`、diff 与受影响文档引用检查通过。遵循小改动路径，仅构建、静态检查并重启，没有自动切换／点击／滚动测试或功能回归。手动检查重点：技能空间与全局／项目技能页工具栏在默认／窄窗口的对齐与副操作文字，以及目录图标和路径的 hover。尚未提交。


### 批量选择与工具栏纵向溢出修复（2026-10-16）

前一轮将工具栏设为 overflow-x:auto，未显式约束 overflow-y；浏览器会将纵向计算为 auto，紧贴按钮高度的容器可能因按下位移等边缘溢出产生竖滚动条。本轮明确 overflow-y:hidden 并保留 2px 上下空间；副操作统一在较窄容器中收起文字，保留搜索／筛选／主按钮宽度。批量选择仍在右侧操作区，默认显示图标与文字，按同一规则收为图标；开关两种文字在同一网格预留最大宽度，防止切换时挤动相邻按钮。布局规范同步明确批量选择属于副操作，以及工具栏不得产生竖滚动条。

前端构建、调试 app 打包与 diff 检查通过。仅构建、静态检查及重启，没有自动切换页面、点击或滚动测试，未运行功能回归。手动查看重点：默认／窄窗口的副操作标签、切换批量选择前后宽度，以及操作行右侧不再出现竖滚动条。尚未提交。


### 批量选择整卡交互（2026-10-16）

批量模式下，卡片本身作为唯一可聚焦 checkbox，点击任意位置或按 Space／Enter 切换选择；卡片 Header／Footer 暂时 inert，名称、描述、信息入口和 Agent 图标不再跳转，单卡更新／卸载与 Pi 启停也不响应，避免误操作。保留原有 selectable／busy 限制、选择名称语义和可见小勾选框，不通过嵌套控件重复切换。退出批量模式后恢复原有详情和单卡操作。

前端构建、调试 app 打包及 diff 检查通过；仅静态检查事件与可访问性处理并重启，没有自动点击卡片／勾选或功能流程回归。手动检查要点：批量模式点击标题、描述、底部和空白均只勾选；同一张卡第二次点击取消；键盘 Space／Enter 切换；退出后标题正常进入详情。尚未提交。


批量卡片对齐收尾（2026-10-16）：勾选框与标题放入同一垂直居中的内层行，删除勾选框 mt-0.5 硬偏移；外层继续承载 Pi 开关，不用其高度参与标题／勾选框居中计算。前端构建、调试应用打包、diff 检查通过；仅重启供手动查看，无 APP 自动测试，未提交。


设置宽度对齐收尾（2026-10-16）：设置页外层 max-w-5xl 曾与面板／外观中的 max-w-4xl + mx-auto 叠加，导致内容比标题和 Tab 内缩。删除面板和外观的二次居中限宽，所有设置面板继承同一页级容器的左右边界，并在设计基线中明确单一宽度归属。前端构建、调试 app 打包和 diff 检查通过；只重启供手动查看，不自动切换页面或运行功能回归，未提交。

## Transient feedback follow-up — 2026-10-16

- Removed persistent page-top and modal error banners from inventory/detail, installation, source inspection, project editing and Pi settings. A shared Sonner host uses existing palette tokens, bottom-right entry, close controls and 3s/6s success/error expiry. Failure state remains available for retry controls; repeated polling failures are coalesced.
- Success feedback for Pi saves/toggles, installation/update/removal, project saves, dependency installation, restoration, creation, copying and directory checks uses the same host. Confirmations, dirty-state protection, detailed results and diagnostic records remain in their existing flows.
- Source removal remains unchanged: pinned original skills@1.7.2 accepts an exact lock source as a remove positional argument; the App expands exact source membership into reviewed explicit skill names and Agent targets before invoking original remove.
- Validation: `pnpm build`, `pnpm run test:error-summary` (9 tests), `CI=false pnpm tauri build --debug --bundles app` and `git diff --check` passed. Restarted the packaged app. Focused native observation verified bottom-right error placement, manual dismissal while a dialog is open, repeated triggering after dismissal, 6s error expiry and 3s success expiry through a read-only directory check. The invalid project form was cancelled; no project, skill or Pi configuration was changed. No lifecycle mutation or full regression was run.

## Source removal ownership follow-up — 2026-10-16

- A source-removal plan incorrectly mixed same-name native Pi copies with CLI installations. Source planning now takes only CLI-managed inventory records and their CLI-addressable Agent associations; confirmation and execution use the same boundary. Same-name native records are included in preservation signatures, so changed native content prevents a complete result.
- Extended the original CLI fixture to cover global and project source removal with a native same-name Pi copy, exact source membership rechecks, lock-only cleanup and preservation of unrelated skills/native bytes. This targeted test and the existing Pi out-of-path uninstall protection test passed. Ten error-summary/notification formatting tests passed; native Pi/Hermes path restrictions have localized summaries.
- `pnpm build`, debug Tauri app bundling and `git diff --check` passed. No real skill removal or full native regression was run.
- Packaged-app observation: weknora → More → 同源卸载 now opens the confirmation for the six `arch3rPro/Ark-Space` lock members. The displayed deletion paths cover shared CLI content and the Hermes link; Pi independent research/browser copies are absent from the deletion targets. Closed the confirmation without executing removal.

## Source removal confirmation presentation — 2026-10-16

- Reused Modal/ModalActions, Badge, Button and the InstallReview information hierarchy for the source-removal confirmation. Source/scope, a compact skill-name group and installed affected Agents replace repeated per-skill cards and the full catalog Agent list. Shared impact remains visible once; paths expand on demand in the existing modal-body scroll surface. Conditional independent-copy inclusion, shared cleanup and Eve scope notices remain available.
- Only the source-removal presentation changes. Normal uninstall/update confirmations and CLI operation payloads retain their existing behavior. No new primitive, theme, lifecycle mutation or full regression is required.
- Static review covers long wrapping names/paths, project scopes, missing/uninstalled Agent metadata, busy controls, optional notices, existing theme tokens and dialog scroll/footer placement. `pnpm build`, `CI=false pnpm tauri build --debug --bundles app` and `git diff --check` passed; the packaged app was restarted. No automated APP interaction or lifecycle regression was run for this presentation change. Manual check: open a skill detail → More → 同源卸载; review the compact default view, expand paths and cancel. Narrow-window/large-text appearance remains a manual check.

## Results and source recheck follow-up — 2026-10-16

- Replaced per-skill result cards, repeated summaries/Agent associations/source-record messages and the duplicate result heading with a single completion count, compact successful skill names and concise incomplete-item causes. Original diagnostics remain in one expandable log. Uninstall results offer Done and an applicable Check again action; View skills is limited to install/update results.
- Confirmation/result paths share directory prefixes and group names by actual outcome. Removed repeated path-kind rows and per-path Agent catalogs. Both use the owning modal-body scroll region.
- Fixed source-removal recovery losing its source context through ordinary name-based prepare. Recheck reads current inventory and requests a fresh source-removal plan in the original target, rejecting changed sources. Missing installs/locks finish without another removal; lock-only entries remain reviewable, and inspection errors are not swallowed. Removed paths are excluded from retry when the applicable lock is absent/removed. Successful rows are never selected for retry.
- Targeted frontend tests cover retry eligibility, surviving native same-name records, grouped paths, scope/source preservation, removed installs, lock-only entries and inspection errors. `pnpm run test:upstream` (24 tests), `pnpm run test:error-summary` (10 tests), `pnpm build`, debug Tauri app bundling and `git diff --check` passed. Restarted the packaged app. This localized repair used targeted tests without a full APP regression or real skill mutations. Manual checks: compact completed/incomplete results, grouped paths and the Check again → fresh confirmation → Cancel sequence; no uninstall is needed to inspect the confirmation. Missing source records with surviving CLI paths are reported as unresolved rather than treated as removed.

## Installation presentation follow-up — 2026-10-16

- Skill selection uses equal-height shared Card selection variants, aligned real checkboxes/titles, two-line descriptions and a stable metadata region. Whole-card clicks and native checkbox keyboard operation retain the selection behavior; all/deselect/invert controls are unchanged.
- Agent selection has one lower-left Selected N badge followed by the selected names, including selections hidden by the current filter. Removed the duplicate header count and Selected prefix.
- Installation review shows source/scope/mode, skill-name badges and compact Agent identities; skill descriptions/plugin metadata and repeated Agent-path cards are removed. Exceptional Eve destinations and download addresses/file counts remain available on demand. Product labels use 安装来源 / Installation source.
- Shared ExecutionLog gives operation/dependency/restoration/creation logs a theme-token terminal surface, monospace text and a collapsible header. It reuses the existing ANSI/control-sequence formatter, renders text only, and adds no nested log scroll region or fake command output.
- Static review covers long names/descriptions, metadata-free cards, zero/many Agent selections, disabled controls, light/dark theme tokens, scope/path wrapping and exceptional review details. `pnpm build`, `pnpm run test:execution-log` (5 tests), debug Tauri app bundling and `git diff --check` passed; the packaged app was restarted. No automated APP interaction or lifecycle regression was run for these presentation changes. Manual check: skill card/checkbox selection, filtered Agent selection footer, compact review and expanded terminal output in a narrow window/larger font.


## Installation density follow-up — 2026-10-16

- Reduced terminal log line height and selection-card padding. Skill descriptions now default to one truncated line, with the existing overflow disclosure retaining access to the full description. Target Agents use three columns at normal dialog width and retain one column on narrow screens.
- Copy-only reasons use the existing HelpPopover beside the installation-mode label, with a permanently reserved label slot; changing target selection no longer inserts a standalone explanation row. Kept a concise visible replacement/shared-directory warning in review. Source removal now opens with one sentence defining its current-scope, same-source, managed-skill boundary.
- Source inspection audit of pinned skills@1.7.2: Git sources use temporary shallow clones and remove them afterward. The current App inspects before selection and again before apply, then invokes original add separately per selected skill; a regular successful N-skill Git install therefore generally performs N+2 clones. This is source analysis, not a timing benchmark. No CLI, cache or execution behavior was changed.
- `pnpm build`, final debug app bundling (including TypeScript/Vite checks) and `git diff --check` passed; the packaged app was reopened. No automated APP interaction or lifecycle regression is required for this presentation change. Manual checks remain: compact cards/logs, three-column target rows, target changes without explanation-induced layout shifts, and the concise confirmation copy.


Description wrapping correction — 2026-10-16: selection descriptions use normal wrapping with a two-line clamp, rather than single-line truncation. Compact padding and the existing overflow disclosure remain. This supersedes the one-line choice in the preceding density follow-up.


Selection-card empty-region correction — 2026-10-16: metadata content is rendered only when plugin/internal/download metadata actually exists. Metadata-free cards no longer reserve an empty footer-height region beneath their two-line descriptions. The final frontend/type and packaged-app build cover this presentation correction; the previously passed installation lifecycle checks are reused without another functional regression.


## Remaining uninstall confirmation branches — 2026-10-16

The earlier compact confirmation only covered source removal. Ordinary and bulk uninstall still used the old per-skill/per-path renderer with repeated Agent, cleanup and lock explanations. Removed that renderer and routed all remove confirmations through shared RemovalReview, retaining the existing confirmation payload, copy-inclusion callback, busy state and original CLI execution. Ordinary removal omits the source-only introduction/source field; scope, compact skill names and affected Agents remain visible. Paths stay grouped and collapsed, with shared-content, independent-copy and Eve consequences retained once. Update confirmation remains separate.

Validation is included in the broader visible-surface review below. No real uninstall is needed to inspect the confirmation presentation.


## Visible-surface legacy-content review — 2026-10-16

Scope: Skills Space and Agent inventory/detail, store/source entry, installation, ordinary/bulk/source removal, update confirmation, project dependency installation/restoration, General/Agent/Appearance settings and project editing. The already-hidden creation/test features remain outside the visible redesign. Reference: the current UI baseline and [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), retrieved on this date.

Findings and repairs:

- `src/App.tsx:662`: ordinary/bulk uninstall retained a separate verbose renderer; every uninstall now uses RemovalReview. Update confirmation uses one scope block, skill-name badges, concise overwrite/shared-source consequences and explicit Cancel. Necessary shared-content, independent-copy and Eve notices remain visible once.
- `src/App.tsx:607`, `src/components/project-skill-review.tsx:23`: dependency and restore previews/results used repeated per-target cards, default paths and lock-verification prose. Defaults now show skill groups, affected Agents and actionable exceptions; grouped paths and source details expand on demand. Full result observations remain in the terminal log alongside original output. Existing options and scan/execute endpoints are retained.
- `src/App.tsx:614`: copy mode used a different checkbox sentence from the installation picker. Dependency installation now uses InstallModeField; advanced filters use shared Fields with linked labels/names. Both project flows already sent a force parameter but offered no control despite instructions referring to it; a default-off Reinstall dependency skills checkbox now exposes that existing parameter and invalidates stale plans.
- `src/lib/project-operation-results.ts:4`: results group skill targets without counting one skill repeatedly. A failed/uncertain target prevents the group being shown as fully complete; cleanup/install records with the same name stay separate. Tests cover aggregation, mixed outcomes, action identity and unchanged input records.
- `src/components/directory-diagnostics.tsx`: an expanded scope repeated the same failure in a second alert card; it now shows the concise cause and original diagnostic log. Transient feedback remains in the shared toast.
- `src/components/project-editor.tsx`, `src/App.tsx`: removed project-display filler and shortened Eve/download-target notices while retaining actual mode and target restrictions.
- Inventory/store, Agent management, Appearance and Pi settings were statically checked for duplicated containers, headings, action placement, accessible labels, long text, busy/disabled controls, theme tokens and existing draft guards. Existing conforming layouts were preserved.

Validation: 26 frontend upstream/result contracts passed, including mixed-target aggregation tests. Final `pnpm build` and `CI=false pnpm tauri build --debug --bundles app` passed, including the final two presentation corrections. Diff checks passed. In an isolated HOME/project, the packaged app opened ordinary uninstall, bulk update, dependency preview and lock restoration without executing any confirmation. Dependency preview found one local skill; restore preview showed two locked skills. The reinstall checkbox was initially off and invalidated the old restore plan when toggled.

Two additional observed defects were repaired: ordinary uninstall listed every universal-directory association despite many Agents being absent; its default impact list now retains confirmed Agents and selected dedicated directories with actual contents, while grouped paths preserve the complete reviewed targets. Dependency preview kept its large picker above the actual confirmation; after inspection it now shows a compact mode/skill/impact review, with Back to settings to edit choices. The final packaged-app recheck confirmed that the uninstall impact list shrank to the actual confirmed/dedicated targets (Claude Code, Codex and Pi in the isolated fixture), with one shared-content notice and collapsed paths. The final dependency settings/review separation is type/build/static verified; its final screenshot remains a manual check. Result success/failure rendering was statically reviewed and covered by grouping contracts; no install/update/uninstall/restore was executed from the app in this review. Narrow-window/larger-font variants remain static/manual checks. No full application regression was run. Native lifecycle code and the original CLI remain unchanged.

Normal HOME was restored and verified after the isolated checks; the usual projects and seven managed skills were visible. This batch remains uncommitted pending user confirmation.

### Uninstall confirmation spacing follow-up

The ordinary confirmation screenshot exposed uneven composition despite shorter copy. RemovalReview now places skill identity and scope on one wrapping summary row, presents affected Agents inline, and keeps the shared-content consequence adjacent. The full-width scope well and duplicate skill-count heading were removed. Uninstall confirmations use the shared Modal with an optional 560px compact width; other consumers retain their existing width. Source identity, copy selection, Eve consequences and expandable complete paths remain available.

Validation: frontend and debug app builds passed; diff checks passed. The normal app was restarted. Opening and cancelling the gh-repo confirmation verified the new summary/Agent/path structure in the accessibility tree without uninstalling anything. The screenshot capture omitted the dialog layer despite its presence in the accessibility tree, so final visual judgment remains a manual check in the restarted app. No full regression was run; the existing 26 passing contracts are reused because this follow-up changes presentation only. Still uncommitted.

### Detail menu and source-based Agent installation shortcut

Removed the duplicate Open folder item from the detail menu; the clickable skill path remains. The user selected original-source reinstallation for the renamed Sync to other Agents action. It automatically inspects that recorded source, locks the exact current skill and opens target selection, followed by confirmation and results. The existing Agent picker, mode/scope controls, original CLI add execution, inspection session/fingerprints and per-item verification are reused. The shortcut never substitutes the installed directory for a missing source. Missing or duplicate source matches stop instead of selecting other skills. Internal discovery is enabled only to resolve the fixed installed skill; no additional hidden skills become selected. Back navigation is bounded to targets/review; validation failures require reinspection.

Validation: 28 frontend contracts passed, including exact-name/ambiguity/missing-source tests and preservation of session/hash identity. Frontend and debug app builds passed. In the existing isolated HOME/repository, the packaged app showed only Uninstall by source in the detail menu, opened directly on Agent selection, retained two selected Agents and symbolic-link mode across review/back, and showed only the selected skill and its original source in confirmation. Temporarily making the fixture repository unavailable blocked progression and offered reinspection; restoring it and retrying returned to target selection. No installation confirmation was executed and no user skill content was changed. The normal app was restarted afterward. No full lifecycle regression was run; native lifecycle code and CLI files are unchanged. This batch remains uncommitted pending confirmation.

Follow-up wording: the detail button and dialog now both read Sync skill / 同步技能. Frontend and debug app builds passed and the normal app was restarted; no workflow regression was repeated for this copy change. The user raised two unresolved behavior questions: already-installed targets remain selectable, and reinspection of an unpinned original source may obtain newer content than the existing installation. Current fingerprints protect preview-to-execution consistency, not equality with the installed version; shared-root replacement can also affect existing Agents. A version-preserving sync policy and target-skip behavior are under discussion, not implemented or accepted by this wording change.

### 2026-10-16: Content-consistent skill synchronization

The previously recorded version/target questions are now accepted and implemented. The native skill_sync module compares the exact recorded origin with the freshly inspected source using the existing bounded byte signatures and upstream copy exclusions. Missing, ambiguous, changed or unverifiable content stops sync. Target records distinguish matching installs, different independent copies and unknown directory collisions; all occupied targets are excluded. Shared-store content/provenance conflicts also stop the operation even when a dedicated Agent was chosen. The original add command still owns copy/link, forced-copy behavior, content writes and lock records. Execution repeats eligibility after source fingerprint validation, before invoking the CLI. Existing post-install verification is retained.

The existing picker now shows a compact skill-specific unavailable reason in its status slot with an accessible description and disabled checkbox. It preserves its search, Agent installation filter, brand icons and row layout. A stopped sync uses the shared Alert, short cause, Cancel, Check updates and Recheck; no default-latest installation is offered. Switching scope invalidates the prior review and clears target/subagent choices. Retry of incomplete synchronization retains the origin guard and recomputes eligibility rather than opening unrestricted normal installation. Normal add/update/remove paths retain their existing semantics.

Verification: 6 isolated original-CLI sync fixtures passed (single-directory forced copy, multi-directory links/copies, retained remote provenance, source/local edits, unknown content, occupied and changed targets, project isolation/shared conflicts, missing/duplicate skills and Git branch movement after preview). Each negative mutation assertion checks retained content/locks as applicable. The 7 existing source-session/batch-install regressions passed. Frontend contracts: 28 upstream/result tests and 12 error/notification tests passed. Final pnpm build and CI=false pnpm tauri build --debug --bundles app passed; diff and local document links passed. No original CLI resource changed. No full app/native regression was run.

In the packaged app with the existing isolated HOME, Alpha had an extra source file absent from its installed copy: the app displayed Source and local content differ, offered no continuation, and used the compact shared dialog/Alert layout. Beta matched: already installed/shared targets were disabled with Skill installed, Windsurf remained selectable, and review retained the original URL, one skill, one target and the upstream forced-copy choice. Review/back retained the choice. These screens were inspected in actual screenshots at the default dark window size. No application install confirmation was executed; mutation coverage is in isolated native fixtures. Automated scope-menu interaction subsequently returned transient noWindowsAvailable and exposed only its current choice, so final GUI project switching remains a manual check; native project isolation/scope eligibility passed. Light/narrow/large-font states were statically reviewed through the unchanged shared component contracts, not individually exercised. The normal app was restarted and its usual projects and 7/77 inventory verified. All changes remain uncommitted pending confirmation.

Component lookup note: the local shadcn CLI info/docs lookup failed with DNS resolution for ui.shadcn.com. The installed component/config sources and official Radix Alert/Checkbox documentation were inspected through the web fallback; no component or theme was reinstalled. References: https://ui.shadcn.com/docs/components/radix/alert and https://ui.shadcn.com/docs/components/radix/checkbox.

### 2026-10-16: Installed-Agent default filter

The Install skills wizard and its sync shortcut now pass an Installed default to the existing AgentPicker. All, Installed, Configuration found and Not installed remain selectable. The dependency-install picker retains its existing default. Search/filter only controls row visibility: selected targets remain in the summary, and the independent unavailable map still disables installed/conflicting sync targets in every filter. No Agent detection, native eligibility or CLI behavior changed.

Validation: 28 frontend upstream/result contracts, pnpm build, CI=false pnpm tauri build --debug --bundles app and diff checks passed. The default wiring and all filter options were statically checked against the unchanged unavailable-checkbox rule; existing native sync results are reused. The normal app was reopened. This small default-state adjustment used the lightweight verification path with no automated app workflow or full regression. Manual check: open installation/sync target selection, verify Installed initially, switch each filter, and confirm Skill installed targets stay disabled in sync. Uncommitted pending confirmation.

### 2026-10-16: Sync checkbox semantics

Matching existing targets are now checked and disabled using the shared Checkbox muted variant, with no selected-row emphasis. Different/unknown targets remain unchecked and disabled. AgentStatusBadge is always retained beneath the Agent name. Existing-content/conflict reasons use a shared surface Tooltip on the focusable disabled-target row and a screen-reader checkbox description, rather than replacing the Agent status. Native eligibility remains independent of every filter.

The footer reads Sync targets / 本次同步 only for sync and counts newly selected eligible IDs. Existing checks are display-only; even stale blocked IDs in the selection are excluded from the displayed count, names and checkbox change callbacks. Normal installation keeps its Selected summary and default checkbox styling. No lifecycle/native implementation changed.

Validation: pnpm build, CI=false pnpm tauri build --debug --bundles app and diff checks passed. A bounded server-render probe of the actual AgentPicker/Checkbox/Radix components passed six groups: matching checked/disabled/muted, conflicts and unknown unchecked/disabled, new-target-only count with a deliberately stale existing ID, retained Agent states, four filter defaults, and unchanged normal-install checked styling/summary. The probe at .scratch/agent-picker-state-check/check.mjs replaces only AgentLogo to avoid Vite asset-glob loading in Node; it does not establish visual or client hover/focus behavior. Tooltip behavior was checked against the installed primitive and official Radix docs after the shadcn CLI DNS lookup failed: https://ui.shadcn.com/docs/components/radix/tooltip. Theme/focus tokens and tooltip description wiring were statically reviewed. The normal app was restarted; no automated desktop workflow or full regression was run for this local control presentation change. Manual check: matching targets show dim gray ticks with Agent status preserved; hover/focus reveals the reason; only newly checked targets increment 本次同步. Still uncommitted pending confirmation.

### Pi same-name precedence paths

Skill details now replace the single location row with aligned, clickable same-name paths when multiple physical installations exist. Compact shared Badges identify Pi Active, Overridden, Disabled or Unverified from the existing Pi inspection results; other Agent directories carry no inferred loading state. The current detail path retains aria-current. Card indicators distinguish actual Pi shadowing from multiple installation directories without adding card regions. No skill files, Pi rules, lifecycle operations or precedence detection were changed.

Validation: 29 frontend contracts passed, covering Pi precedence versus CLI ownership, disabled copies, unrelated Agent directories, duplicate paths, missing names and inconsistent winners. A read-only local browser inspection confirmed the Pi directory as active and the shared directory as shadowed through the new presentation helper. Frontend and debug app builds and diff checks passed; the normal app was restarted. Shared Badge and interactive-path tokens, wrapped paths, aligned columns and bilingual copy were statically reviewed. shadcn CLI registry access failed DNS; the official Badge documentation and installed local API were checked instead. No automated desktop workflow or full regression was run for this localized display change. Manual check: open browser details from either collection and inspect the two labeled paths at default/narrow widths and larger text; opening a path must retain the existing native folder action. Still uncommitted pending confirmation.

Detail header follow-up: the existing Back icon button now shares the skill-title row, removing its standalone row and section gap. The existing ghost icon-button, accessible name, tooltip and return handler are retained. Static review covers long title wrapping, non-shrinking Back control and unchanged action grouping. Frontend build, debug app packaging (reusing the completed frontend build) and diff checks passed; app restarted. No automated desktop workflow or full regression for this spacing-only adjustment. Manual check: open a skill detail and confirm Back/title/actions share the header at the normal window size. Uncommitted.

### Approved delivery batch — 2026-10-16

The user authorized committing the accumulated lifecycle-review, source-based skill-sync, Agent selection and Pi detail presentation changes. This delivery supersedes the pending-confirmation markers in the dated entries above. Unrelated local skill installation files are excluded. The current frontend contracts passed again; the unchanged frontend/debug app builds and bounded desktop observations recorded above remain applicable. The six isolated skill-sync native cases are checked separately from full regression. No user skill files are cleaned up and no remote push is authorized.

### Pi command completion, invocation, bulk actions and two-column Agent ordering — 2026-10-16

Pi management adds the native enableSkillCommands setting using the shared Field/Switch composition and the existing explicit-save/draft-protection flow. Project inheritance and restoration of inherited/default values are preserved. Pi skill cards retain one enable/disable Switch; a bottom icon menu shows Sparkles for automatic selection and Hand for manual-only invocation, with radio choices and accessible current-state labels. Only unchanged independent files inside Pi's own skill directory are editable; shared/managed paths, packages, links, hard links and other-scope records remain read-only. The native writer checks settings dependencies, file content revisions and inventory ownership, edits only the frontmatter scalar, preserves body/comment/unrelated-YAML bytes and uses an atomic permission-preserving replacement. It never creates a same-name copy. Native bulk selection uses exact files, gates each action, executes sequentially with fresh snapshots and per-item checks, stops on failure and retains completion counts in concise feedback. No native uninstall is added.

Native collections now use the existing compact Card size, retaining two description lines, equal grid heights and bottom-aligned actions. BackButton centralizes the Pi management ArrowLeft/ghost/icon-sm control and is reused in skill details. Agent management uses a two-column card grid, falling back to one column below the container threshold. Existing pointer dragging, floating cards, search/filter/order storage and visibility/settings controls are retained; keyboard arrows follow grid columns.

Validation: frontend contracts and the strict frontend build passed; Pi tests include 2 TypeScript cases, 9 read-only inspection/transformation cases and 9 isolated native cases. The native cases cover command completion inheritance, preservation of unknown settings, invocation persistence, stale-content refusal, shared/symbolic/hard-link protection and unchanged original CLI copy/link lifecycle. Initial tests exposed macOS /var canonical-path aliases and unwanted YAML reformatting; both were corrected without weakening the assertions. A final error-summary check additionally verifies partial-batch completion counts. Debug application packaging passed using the completed frontend build. No full native or desktop regression was run.

Bounded packaged-app checks used /private/tmp/skills-space-pi-ui-e05bvsr5/home: single and bulk invocation change, whole-card bulk selection, bulk disable, command-completion Save/Save-and-continue draft protection and restart persistence were observed. The two-column layout and compact equal-height native cards were inspected in a default-size dark screenshot. Keyboard cross-column movement and mouse dragging both changed the saved Agent order. An initial sorting attempt was rejected because the test preference used zh rather than the supported zh-CN; the fixture was corrected, with no product relaxation. Some CUA coordinate attempts failed transiently before fresh state capture; later drag and pointer actions succeeded. Real Pi settings/browser files and the shared fixture retained their baseline hashes. No real skill or Pi settings were changed. Narrow/light/large-text layout is statically reviewed rather than claimed as a desktop screenshot check; real Pi /reload behavior remains outside this app verification. The normal HOME application is restored for review. Uncommitted pending user confirmation.

### Terminology, bulk selection and compact animated controls — 2026-10-16

Settings now names its Agent tab 智能体 (Agents), with matching search and Pi return labels. BulkSelectionBar unifies managed/native selection, install skill selection and Agent target selection: Select all and Invert selection precede the existing actions on the left; the selection count stays right. The sync count retains its distinct Sync targets meaning, excluding existing disabled checks. All never changes into Deselect all; inversion respects eligible visible identities and preserves selections outside the filter. The selection-mode exit action remains separate. This composition is now the active design baseline.

The shared Switch track changes from 20×36 to 18×32 with a 14px thumb, retaining existing colors, focus/disabled semantics and reduced-motion behavior. Invocation mode remains an icon radio menu; fixed overlapping Hand/Sparkles icons crossfade and scale over 180ms only after a successful native result. Single and bulk Pi state changes merge returned snapshots into existing cards instead of triggering full-grid loading skeletons, preserving keyed cards, sort/filter/scroll and checked selections. Errors re-read Pi state without entering the inventory loading state; unchanged-scope snapshots are retained during background validation so the icon transition is not interrupted by disabled-state flicker. No new animation dependency or optimistic file state is introduced.

Validation: strict frontend build and 30 upstream/pure UI contracts passed, including visible eligible all/invert behavior. The actual AgentPicker server-render probe still passed its six groups for existing muted checks, disabled conflicts, new-target-only counts, Agent statuses, filters and normal installation styling. UI component APIs reuse the verified installed Radix controls; no native contract changed. Debug app packaging is refreshed from the completed frontend build, and the normal app is restarted for review. No full regression or automated desktop workflow is required for this localized presentation follow-up. Manual review: check the new settings label, action/count alignment in each selection surface, smaller switches, and invocation transition after changing a private Pi skill. Uncommitted pending confirmation.

Pi refresh follow-up: all enable/disable/invocation handlers now use state reconciliation, including per-item bulk results and failure reinspection. No handler calls inventory refresh or clears selection. A dedicated Pi helper contract checks exact-file identity with same-name records, stable ordering, untouched non-Pi records and non-mutating input state. Native inspectors still read the resource state for safety; this change removes list replacement/loading presentation, not native verification. The strict build and Pi helper/script checks pass; full native tests are reused unchanged from the preceding batch.

### One inventory-card density across collections and scopes — 2026-10-16

The earlier native-only Card size branch did not address the main blank area: offscreen inventory cards used content-visibility:auto and a later 10rem intrinsic placeholder, which could set the height of all auto-rows-fr rows. Removed both skill-card intrinsic-height declarations and skill-card content visibility so equal rows derive from actual content. Agent-picker visibility optimization is outside this change. The user clarified that managed/native cards must share metrics, so the collection-specific size branch is removed entirely. The single inventory variant now owns 12px padding and an 8px header-to-footer gap for every inventory; managed/native/global/project cards retain the same two-line description allocation, grid equal heights and bottom action alignment. Actions, capabilities and identity icons remain conditional. This supersedes prior native-only compact-size notes.

Validation: strict frontend build and diff checks passed; debug packaging is refreshed using that build. Shared-renderer and Card-variant inspection confirms there is no collection/scope/Agent-specific size branch. This spacing-only correction uses the lightweight app-open path, without new automated APP workflows or full functional regression. Manual check in the updated app: compare managed/native collections in Skill Space and global/project Agent pages, including a long native list with offscreen cards; the middle placeholder gap should be gone while two-line descriptions and footer alignment remain. Uncommitted pending confirmation.

### Native-only direct invocation toggle — 2026-10-16

Managed skill cards now omit invocation controls. Pi native cards use a single icon button that directly toggles automatic selection/manual invocation, replacing the per-card dropdown. Existing crossfade/scale animation and Tooltip report the current state and next action. Unsupported shared/package/overridden entries remain read-only; no shared SKILL.md is modified. Explicit target actions in the bulk menu remain suitable for mixed selections. This supersedes the earlier per-card icon-menu design.

Validation: strict frontend build, diff checks and debug application packaging passed. No native behavior changed; preceding isolated mutation checks remain applicable. The application is restarted for manual review of icon placement and click interaction. No full functional regression was run. Uncommitted pending confirmation.

### Full-width scroll viewport — 2026-10-16

The main element combined scrolling with max-w-7xl and auto margins, leaving the scrollbar inset on wide/fullscreen windows. The scroll viewport now fills the content pane; a separate inner wrapper retains the existing centered content width and horizontal padding. Existing responsive top spacing moves to the stationary pane so the scrollbar begins below its top edge. Thin scrollbar colors, sidebar containment and page content are unchanged.

Validation: strict frontend build and diff checks passed; debug packaging refreshed for the updated app. This localized layout fix follows the lightweight app-open verification path, without automated desktop flows or full regression. Manual review: fullscreen a long native-skill list and confirm the scrollbar is at the pane right edge, begins below the top inset and does not move the sidebar; repeat at normal width. Uncommitted pending confirmation.

### Pi detector parity and skill Markdown details — 2026-10-16

Reference: existing inventory/detail layout, compact segmented ToggleGroup, native opener and theme tokens. Applied the project shadcn and React skills. The shadcn info request failed DNS again; inspected installed Radix exports and fetched official ToggleGroup documentation instead. No shared component API was guessed or replaced.

Pi inspection fixes five verified differences: empty manifest versus absent resources for object packages; normalized Git package identity; filesystem same-rank collision order with separate lexicographic manifest-glob order; rejection of invalid descriptions before reserving names; empty-name fallback. It remains a read-only adapter and does not import Pi or run packages. Project trust presentation is explicitly deferred. Official Pi 1.2.0 / bundled Node 22.20.0 differential rerun: 59/60 agree; only the intentionally deferred untrusted-project case differs. See [parity record](pi-detector-loader-verification-2026-10-16.md).

SkillDocument provides a default Markdown preview and complete Source view in the existing segmented-control style. The body omits metadata already presented by the detail header; source bytes remain unchanged. react-markdown 10.1.0 and remark-gfm 4.0.1 supply CommonMark/GFM rendering, loaded only when a detail opens (approximately 48 KiB gzip as a separate chunk). No raw HTML execution, WebView navigation or native filesystem expansion was added. HTTP(S) links use the existing opener; HTTP(S) images use lazy loading and no referrer. Unsupported local/relative references remain text. Typography, code, tables and quotes use shared semantic tokens, page scrolling and bounded sideways overflow. The existing sidebar, cards and themes are preserved.

Validation completed: strict frontend build; 3 Pi TypeScript +14 Pi script tests; 9 isolated native Pi tests (including original CLI copy/link installation, toggle and uninstall); 2 document helper +2 actual-component SSR tests; differential 60-case rerun; debug application packaging and diff checks. The staged upstream cli.mjs SHA256 matches the installed pinned original. Initial new test failures were fixture assertions comparing macOS /var aliases and an exact ul tag without GFM task-list attributes; assertions now compare canonical paths and semantic list output, without relaxing behavior.

The normal packaged app was restarted. In gh-repo details, observed parsed headings, ordered lists, emphasis and inline code in the existing dark theme; switching to Source showed complete frontmatter and Markdown, then switching back restored preview. A first stale AX index clicked a heading; a fresh tree allowed successful source/preview checks. GFM tables, task lists, fenced code and hostile HTML/URLs were exercised in actual-component SSR tests. Light/narrow/large-text consistency was statically reviewed through tokens, relative type sizing and wrapping; not claimed as desktop screenshots. No full application regression, real Pi reload or real skill mutation. Uncommitted pending user confirmation.


### Pi local Trash removal and native filters — 2026-10-16

Reference: the existing compact RemovalReview, inventory footer icon actions and shared Choice toolbar controls. Independent local Pi native skills gain a Trash action on cards and details. Native preflight and execution recheck exact scope, canonical path, inventory associations, settings dependencies and the whole bounded tree hash. Shared/CLI-managed resources, packages, symbolic/hard links, protected roots and nested skills are refused. macOS uses NSFileManager through trash 5.2.9, with no permanent-delete fallback. Existing upstream CLI lifecycle is unchanged.

Pi global/project native pages add combinable status/invocation and package-source filters, alongside the existing search. Source options include local directories and each detected package; filtering retains exact-file selection identities. No new component style or per-package mutation was introduced.

Validation passed: strict frontend build; 4 Pi TypeScript and 14 Pi script tests; 14 error-summary tests; 5 isolated native removal tests; debug app packaging; formatting/diff checks. The native suite covers content/settings drift, failed Trash moves preserving content, shared/package/root/link/hardlink protection and project/configured-file scope. Initial failures were canonical temporary-path and missing fixture-HOME setup issues; fixed without relaxing assertions. Previous unchanged native Pi checks are reused. No full functional regression.

Packaged-app verification used /private/tmp/skills-space-pi-trash-ui-20261016/home. Selecting ./fixture-package displayed exactly its two skills; combining manual-invocation filtering displayed package-two only. Package and linked cards had no uninstall action. The compact confirmation displayed the precise disposable skill path. Executing removal reduced the native count from six to five and showed a dismissible success toast. Read-back verified the unique skill and support file in the real system Trash, with identical SKILL.md SHA256; source removal, unchanged settings hash and preserved siblings/package/link targets were verified. No real user skill/settings mutation. The disposable item remains recoverable in Trash. Normal HOME was restored and the application restarted on the Pi native list with both filters visible. Light/narrow/large-text layout was reviewed structurally, not claimed as a desktop screenshot pass. Uncommitted pending user confirmation.


### Pi invocation labels and footer order — 2026-10-17

Native status filters and invocation tooltips now use 自动选择 / 手动调用 (Automatic selection / Manual invocation). Removed redundant click-to-change instructions while retaining unsupported-action reasons and accessible pressed state. Native card actions place local uninstall after Open folder. Existing icons, theme, spacing and capability checks remain unchanged. This localized copy/order change uses strict frontend build, diff checks and application restart for manual review; no automated desktop or lifecycle regression.


### Pi native uninstall confirmation density — 2026-10-17

The Trash branch of RemovalReview now shows only a recoverability notice, skill name and full HOME-abbreviated path. Scope, affected-Agent identities, repeated path-state text and path disclosure are omitted for this single native skill. The destructive footer action is simply 卸载 / Uninstall. Managed CLI removal reviews retain their existing scope/impact information. Existing modal, typography and theme tokens are reused; native execution/preflight is unchanged. Verification uses the localized presentation path: strict frontend build, diff review and refreshed packaged application; no automated APP workflow or full regression.


### shadcn baseline audit and compact native confirmation — 2026-10-17

Reviewed the full baseline and 64-entry catalog against the selected shadcn composition/styling rules and local files. The catalog already covered available primitives; the gaps were enforceable selection and integration rules: short destructive decisions versus editing/long workflows, mandatory primitive nesting, page layout versus shared visual variants, asynchronous confirmation/focus behavior, and generated dependency/overwrite review. Added these to the authoritative baseline without copying a second catalog or authorizing unrelated page repairs. Local installed entries match all 26 UI wrappers exactly; registry availability remains the explicitly dated snapshot, not a fresh claim of every current upstream component.

Pi local uninstall now uses the official radix-nova AlertDialog composition with a centrally adapted compact width, left-aligned heading/description, one identity/path group and right-aligned Cancel/destructive Action. No interior dividers, tinted footer or duplicate close control. Cancel receives the primitive's default focus. Pending confirmation prevents Action's automatic close and Escape dismissal; the existing successful native handler closes it. Preflight, Trash execution, failure feedback and managed CLI flows are unchanged.

CLI docs initially failed sandbox DNS; official Radix documentation was retrieved independently. Installing the component exposed a Button overwrite prompt and automatic review rejected retrying the interactive installation. A permitted read-only CLI dry-run/view retrieved the new file only; existing Button was retained. Registry import cn was replaced with the project's existing utility and the unnecessary dependency removed. Initial build attempts hit a pnpm store mismatch, resolved by selecting the already-used store, without dependency upgrades.

Validation: strict frontend build, debug app packaging and git diff checks passed. Existing Button has no diff; no new runtime dependency was retained. Actual Radix AlertDialog exports were verified from the installed package. Catalog/local-file identity check reports 26/26 with no missing or uncatalogued wrappers. Normal application restarted successfully. This localized presentation change did not rerun automated APP flows, deletion or full regression. Manual review: open a Pi native skill uninstall confirmation, inspect the compact layout/long path and Cancel focus, then cancel. Pending and deletion behavior are statically reviewed and retain the previously verified handler. Uncommitted pending confirmation.


### Confirmation coverage follow-up — 2026-10-17

The prior change applied compact confirmation only to Pi local uninstall; the user identified the incomplete adoption. All existing standalone confirmation surfaces now use the shared AlertDialog composition: managed single/bulk removal, same-source removal, update confirmation, and Pi unsaved-draft navigation. Removal retains necessary scope, affected Agents, shared-content consequences, independent-copy inclusion and expandable paths. Same-source purpose appears once in the description. Update retains scope, selected skills and local-edit/shared/undetected-copy consequences without the former scope Card. Async actions prevent primitive auto-close and use unchanged handlers. Draft confirmation retains Keep editing, Discard changes and Save-and-continue behavior.

Project editing, installation/sync/dependency/restore/test flows and operation results remain task Modals. Project forgetting currently has no confirmation; no extra confirmation was introduced. No existing confirmation route remains on the flow Modal. This is a presentation/composition correction, not a lifecycle or project-removal behavior change.

Verification: strict frontend build, debug packaging and diff checks passed; the normal application was restarted. Source review confirms that handlers, eligibility conditions, copy inclusion and update/removal data remain unchanged. Manual checks left for review are each confirmation's layout, Cancel focus, long skill groups/path wrapping and unsaved-settings action order. No real skill mutation, automated APP workflow or full regression was run for this localized composition correction. Uncommitted pending confirmation.


### Confirmation width correction — 2026-10-17

The 420px cap was too narrow for desktop skill paths and review information. Shared AlertDialog now uses a 520px standard width (including its existing sm consumers), with a 600px wide variant selected for batch/same-source reviews and multi-skill update confirmation. All sizes retain 16px minimum viewport gutters, natural height and the existing bounded long-list scroll region. Compact denotes information/spacing density rather than a mandatory narrow width. The baseline now records this distinction and corrects its outdated native RemovalReview reference. Native handlers and review eligibility are unchanged.

Validation: strict frontend build, debug packaging and diff checks passed. Normal application restarted. Width variants and viewport bounds were statically reviewed; manual review remains opening a single and batch/source confirmation at normal/narrow widths. No automated APP regression or real deletion. Uncommitted pending confirmation.


### All-dialog content and state audit — 2026-10-17

Reviewed all application-owned Modal/AlertDialog call sites and their child review/results components against the design baseline, shadcn composition/styling rules and current Web Interface Guidelines (https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). This is a source/composition audit, not a claim that every native/system dialog or every runtime state has been observed. Existing native folder pickers and hidden authoring/test flows were included in the ownership review without re-enabling them.

| Surface | Findings and resolution |
| --- | --- |
| Managed single/bulk/source uninstall | Single review repeated scope, impact labels and path fragments. Removed standalone Agent row and redundant single scope; consolidated affected identity/shared impact. Up to three paths are directly visible, larger plans retain disclosure. Copy inclusion, Eve and shared cleanup consequences remain. |
| Pi native uninstall | Retained compact identity/path and Trash action. Corrected consequence wording: reload is required, and an overridden same-name skill may become effective; do not promise no skill with that name can load. |
| Standalone update | Retains concise scope/skill/local-edit/shared impact and explicit confirmation; no extra path receipt or dead navigation added. |
| Generic install/update/remove results | Completed paths were rendered indiscriminately. Now only incomplete filesystem/content exceptions expose paths; completed removals and retained unselected copies are omitted. View skills now requires a completed result confirmed in returned inventory. Standalone result uses compact task width. |
| Dependency installation | Reviewed settings, preflight, cleanup warnings, partial/success results and navigation. Results remove successful path receipts and successful verification JSON; incomplete paths/log data remain. Preflight paths, missing-root and cleanup consequences remain necessary. |
| Lock restoration | Same exception-only result rule; preserve source-change/overwrite, independent-copy and issue details before execution. |
| Install/sync wizard | Source/selection/target/review/result reviewed. Existing protected toolbar, bounded selections, scope/mode and conflict warnings remain. Shared result and navigation fixes apply here too. No deletion/empty result offers View skills. No lifecycle/state transition change. |
| Project editor/icon popover | Editing dialog unnecessarily used the 760px flow width. Uses compact task width. Name/directory validation and icon search/selection remain; long paths wrap. |
| Unsaved Pi settings | Reviewed Keep editing/Discard/Save flow, saving close guard and failure retention. Existing AlertDialog composition retained. |
| Hidden skill creation | Success repeated verification prose/detail. Reduced success copy and limited diagnostic detail to unsuccessful results; paths/open/edit/install actions stay because created files are the next work object. |
| Hidden skill test/session | Reviewed source/select/review/session, stop/release and error states. Working/support paths and lifecycle notice remain meaningful; successful release clears session and returns to source, so no deleted-directory control remains. |
| Shared shells/logging | Existing focus titles, cancel-first confirmation, guarded async actions, footer wrapping and owning scroll regions retained. Empty ExecutionLog now renders nothing across all consumers. No new decorative badges/help or generic notices added. |

Added actual-component SSR checks covering successful removal, mixed removal outcomes, dependency/restore results, simple review content and empty logging. The first harness run encountered Vite-only icon import.meta.glob in Node; the test substitutes only the asset URL mapping, preserving actual review/result components. Four checks passed. No real skill mutation is needed to verify presentation eligibility.

Follow-up checks of hidden creation also found legacy raw label compositions and a nested fixed-height source preview. Reused Field/FieldLabel, associated the name input explicitly, shortened template copy and let the owning Modal body scroll the source preview. The feature remains hidden. No new help blocks, installation stages or source mutation behavior were added.

Verification completed: pnpm test:dialog-results (4 actual-component checks), pnpm build, debug app packaging and git diff --check passed. Normal application restarted. No real lifecycle mutations or full APP regression were executed. Focus/close/busy behavior and non-result surfaces were reviewed in source; light/narrow/large-text and every runtime failure state are not claimed as observed screenshots. Existing operation preflight, mutation and post-verification logic is unchanged. Uncommitted pending user confirmation.


### Sidebar composition refinement — 2026-10-17

Reference: official Radix Sidebar documentation (https://ui.shadcn.com/docs/components/radix/sidebar), installed radix-nova exports and the existing desktop/sidebar scope contract. Applied the already-read shadcn/React skills. CLI docs again failed sandbox DNS; official documentation and local interfaces were inspected instead. No registry overwrite, preset or dependency change.

Scope headings now use SidebarGroupLabel and SidebarGroupAction, with SidebarGroupContent owning grouped navigation. Project rows use the same SidebarMenuButton as ordinary navigation and official SidebarMenuAction for the separately anchored more menu; existing drag/header identities and pointer/keyboard sort handlers remain. ActionMenu accepts an optional existing primitive trigger while preserving every default consumer. Shared navigation rows use one 36px height and expose aria-current for selected destinations. Top-level navigation and scope groups have explicit spacing without divider lines. The smaller brand row includes an accessible collapse/expand trigger. Footer controls form one icon column when collapsed, avoiding compressed three-column labels; Agent menu indentation resets in icon mode to prevent clipped icons. Existing scope navigation, category hover controls, single-click project folds, saved order, theme tokens and brand icons remain.

Verification: strict frontend build, debug packaging and diff checks passed after the final menu-action vertical alignment adjustment. Normal app restarted; expanded dark default-size screenshot observed the new header trigger, shared row metrics, scoped Agent alignment, project row actions and fixed footer. Collapsed/light/narrow/large-text composition was statically reviewed, not claimed as automated desktop coverage. Drag persistence handlers/data were retained; no real project-order mutation or full functional regression was run for this UI change. Manual review: collapse/expand the sidebar, hover category/project actions, open a project menu and compare global/project Agent navigation. Uncommitted pending user confirmation.


### Brand and sidebar trigger correction — 2026-10-17

Restored the 28px brand asset and original base-size brand text. The brand row no longer shares width with the collapse control. SidebarTrigger moves into the content pane's already-reserved top inset, staying reachable in both sidebar states without adding toolbar height. The fixed icon slot renders PanelLeftClose when expanded and PanelLeftOpen when collapsed; decorative icons remain hidden from accessibility and the localized control label is retained. Existing sidebar state/navigation/theme logic is unchanged.

Collapsed-scope follow-up: the user found that the official GroupLabel hide/negative-margin treatment erased Global/Projects identity in icon mode. Scope labels now explicitly retain their row and show short 全局 / 项目 labels with full accessible names/tooltips. Project/Agent entries and fold logic remain intact. This supersedes the inherited hidden-heading behavior and is recorded in the baseline.

Actual packaged-app collapsed screenshot verified: 28px brand remains in the rail; Global/Projects short labels, all existing project/Agent icons and footer icons remain visible; the PanelLeftOpen control is in the content inset. Expanded/collapsed labels retain full accessible names. The observation also exposed unnamed icon navigation buttons because their visible spans were hidden; SidebarMenuButton now derives aria-label from its existing string tooltip unless a caller supplies one. No navigation/action handler change. This bounded visual/accessibility check addresses the user's reported collapse failure, not a full functional regression.

Final verification: frontend build/type checks and debug packaging passed with the final source; diff check passed. Normal app restarted, then collapsed again: accessible names for scope/category, navigation and project buttons remain present. Left the app collapsed for review. No full regression or project/skill mutation. Uncommitted pending confirmation.


### Language-independent collapsed scope identity — 2026-10-17

User review found English short labels unsuitable for the icon rail. Replaced collapsed scope text with Globe (global) and Folders (projects), retaining localized full aria-label/title, scope folding and expanded labels. Existing semantic icon sizing/color and brand assets are unchanged. This supersedes the short-label choice above.

Validation: frontend/type build, debug packaging and diff checks passed. Restarted the normal app using the user-selected English language, then observed its collapsed screenshot: Globe and Folders category icons are visible with localized full accessible names, without abbreviated English text. Left the app collapsed for review. No full functional regression or real-data mutation. Uncommitted pending confirmation.


### Reference sidebar window/brand hierarchy — 2026-10-17

User supplied a desktop sidebar reference with native window controls/collapse in one top row and a separate brand beneath. Implemented this shell hierarchy without copying its new-session/workspace product entries or palette. Sidebar width becomes the standard 16rem with consistent inset navigation and a separate 28px brand row. macOS uses a native Overlay title bar with hidden centered title and native traffic-light positioning; the existing appearance command retains Overlay when applying theme background. A 44px HTML drag region positions SidebarTrigger near the expanded sidebar edge, moving beyond traffic lights in icon mode. Only the core window dragging capability is added. No custom close/minimize/maximize buttons or new dependency. Non-macOS keeps its existing content-inset trigger and native decorations; macOS-only config options are ignored there. Content top padding compensates for the removed native title-bar inset, retaining page heading placement. Category/project/Agent navigation, compact icons, project menus, sort/fold persistence and footer actions remain.

Validation: frontend/type build and required debug Tauri packaging passed with final source; appearance tests passed 3/3, Rust formatting and diff checks passed. Local installed Tauri schema verified Overlay/hiddenTitle/trafficLightPosition and the start-dragging permission before implementation. Packaged macOS screenshots observed native traffic lights and collapse control on the top row, the separate 28px brand row, unchanged theme and navigable scope groups. Collapsed screenshot retained category/project/Agent icons and placed the toggle beyond native controls; restored expanded state for user review. Native close/minimize/fullscreen and actual window dragging were not automated, other OS rendering was not observed, and no full lifecycle regression or real skill/project mutation was performed. Uncommitted pending user confirmation.


### Invocation tooltip copy — 2026-10-17

Per user correction, invocation buttons show only 自动选择 / 手动调用 (Automatic selection / Manual invocation), without capability, read-only or shadowing explanations appended. Accessible names retain skill identity and the current mode; editability, disabled semantics and mutation guards are unchanged.

Validation: strict frontend build, debug packaging and diff checks passed. Normal app restarted; no automated workflow or state mutation was needed for this tooltip-only change. Uncommitted pending confirmation.

### Read-only invocation control — 2026-10-17

Read-only invocation buttons now use the shared Button's native disabled state and opacity, rather than only aria-disabled. A focusable wrapper preserves the mode-only Tooltip for unavailable controls; editable controls retain their direct toggle. No additional explanatory copy or mutation behavior changed.

Validation: frontend/type build, debug application packaging and diff checks passed. Normal app restarted. No full application regression or skill mutation; hover/focus appearance remains available for user review. Uncommitted pending confirmation.

### Inventory toolbar label fitting — 2026-10-17

Replaced the blanket 60rem label-hiding query with InventoryToolbar, which measures its existing non-shrinking groups before paint and on resize/font readiness. It keeps all labels whenever they fit, otherwise compacts Select multiple, Check updates, then Refresh in order. Shared inventory markup covers Skill Space and global/project Agent collections, including the extra Pi filters. Search, Selects and primary actions retain their widths; the existing horizontal-only overflow remains the final narrow-width fallback. Button variants, action callbacks, accessible names and titles are unchanged. The design baseline now records actual-width progressive fitting.

Validation: pnpm build, debug application packaging and git diff --check passed. Restarted the normal app and observed the 1280×800 desktop window: Refresh, Check updates and Select multiple labels are all visible with Search, Agent filter and Add skill on one row; no toolbar scrollbar was visible. Narrow windows, English and larger type were reviewed in source but not separately exercised in the app. No full functional regression or lifecycle mutation. shadcn CLI docs lookup failed with DNS resolution; official Button documentation was retrieved through the web fallback and local Button APIs inspected. Uncommitted pending confirmation.

### Shared inventory empty states — 2026-10-17

Skill Space and global/project Agent collections now reuse InventoryEmpty with the installed shadcn Empty composition. Removed the enclosing dashed frame, retained a bounded centered layout, and selected icons/content by failed read, uninstalled Agent, filtered result, native empty or first-use managed state. Descriptions are conditional and native empty states do not manufacture an action. Failure takes priority over filters and offers Retry; no-match detection includes Pi status/package filters and ignores the selected Agent as a navigation context. Clear filters resets search, optional Agent, Pi status/package and selections together. Managed Add skill preserves the current Agent target. Existing inventory loading and lifecycle handlers remain.

Validation: strict frontend build passed; existing upstream inventory/filter contracts passed 31/31. Targeted rendering checks passed all five states in Chinese and English (10 combinations), including native action omission and failure/no-match actions. Diff checks passed. Full application regression and real skill mutations were not run. Native empty, no-match and failed-read visual states remain manual review items after application restart. shadcn Empty documentation was read through the official web fallback after the CLI's DNS lookup failed; existing local APIs were reused.

Debug application packaging also passed. Restarted the normal application and confirmed Skill Space loaded its inventory. No automated desktop workflow was run for this localized UI adjustment. Uncommitted pending user confirmation.

### Pi project installation versus inheritance — 2026-10-17

Fixed the native inventory augmentation's scope boundary without removing inherited resources from Pi's loader snapshot. Added inScope ownership to automatic/configured/package inspection; ancestor-only entries no longer enter the current project's collection, CLI target eligibility or Trash eligibility. A real project entry linked to user content remains project-owned. HOME's shared root is excluded from project ancestor discovery, matching official Pi, so it retains user exclusions/precedence instead of being first registered with project settings. Runtime configuration scope is kept distinct from ownership. CLI source records remain scoped; no global lock metadata is borrowed to conceal a wrongly scoped row. Original CLI files and lifecycle behavior are unchanged.

Validation: Pi TypeScript contracts 4/4, detection/invocation scripts 17/17, native Pi tests 10/10 and native Trash-protection tests 5/5 passed. Native tests include original CLI copy/link install/toggle/uninstall in isolated fixtures. Four bounded loading/precedence/exclusion/link cases matched official Pi 1.2.0 and 1.3.0 (8 comparisons); no full 60-case replay was claimed because its prior temporary fixtures are absent. Frontend build, debug application bundle, Rust formatting and diff checks passed.

Restarted the normal app and performed only scope-switching inventory verification: SelfGuard → Pi now shows managed 0/native 0; Skills-Space → Pi shows its four actual managed skills, all with Git source labels; global → Pi still shows managed 7/native 18. Switched back to SelfGuard → Pi for review. These observations agree with read-only CLI/project and helper inspections. No real skill/configuration changes or full application regression. Specification 0006 and the loader comparison report were synchronized. Uncommitted pending confirmation.


## 2026-10-17 Hermes correction and overlay review

Scope: the Hermes management page, its inventory notices and shared Tooltip/Popover/DropdownMenu/Select placement. This is not a complete product audit. The accepted overlay standard and location exceptions are recorded in [the design baseline](../design/ui-system.md#surface-contracts), with actual UI checks in [spec 0008](../specs/0008-hermes-skill-management.md#界面修正复核).

- `src/components/hermes-management.tsx`: profile settings and project trust are distinct groups; no duplicate current-project untrust action; readable localized inspection issues; labeled inputs and named icon buttons; existing dirty-state guard retained.
- `src/App.tsx`: routine runtime-verification notices are omitted from cards, actionable trust/discovery/conflict notices remain. Profile enabling is not described as successful session loading.
- `src/components/ui/tooltip.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `select.tsx`: shared placement, offsets, collision padding and theme surfaces; inherited reduced-motion behavior remains. Pi and Hermes invocation/preload tips use the same defaults.
- Static accessibility/content review used the current [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), subject to the project's desktop navigation, explicit save and protected toolbar-width contracts. Input spellcheck/autocomplete and decorative icon attributes were tightened. No claim is made that every existing native title hint or every product surface was migrated or tested.

No all-theme/all-size/full-runtime acceptance claim is made. The narrow-window toolbar retains its existing horizontal-scroll fallback; remaining native title hints outside the changed controls have not been comprehensively migrated.

### Application-wide native hint migration — 2026-10-17

Status: implemented, pending user review and commit. This is a presentation/accessibility change; skill lifecycle handlers, themes and configuration ownership remain unchanged.

| Surface | Migration/review |
| --- | --- |
| Store | Name/source identity and unavailable-preview reason use shared Tooltip; the disabled button has a focusable proxy. |
| Skill Space / global / project inventories | Refresh, updates, selection, add, Agent icons, overflow count, native uninstall, directory paths and bulk invocation reuse shared hints. |
| Skill detail | Back, more actions, unavailable sync/removal, source-directory and skill-directory actions use shared hints. |
| Sidebar | Project path/actions, failed-read retry, collapse control and footer settings/theme/language use shared hints. Collapsed headings/project labels prefer right; footer hints prefer top. Hidden text retains an explicit accessible name. Removed the redundant Rail native title; the dedicated toggle remains keyboard accessible. |
| Settings | Agent status evidence/configuration entry, Pi reload/reset/add/remove, Hermes reload/add/trusted paths use shared hints. DSH's current shared-hint composition was included in the source audit. |
| Project editor / diagnostics / installer | Every built-in icon uses shared Tooltip. Diagnostic project summaries expose their path on hover/focus. Installation status evidence uses AgentStatusBadge's hint prop; blocked targets retain their accessible reason and Tooltip. |
| Hidden skill-test flow | Remaining Agent executable-path title migrated in source; the feature stays hidden and was not exposed for testing. |

`Hint` composes the installed Radix Tooltip without adding layout wrappers for enabled controls. Disabled controls retain their native disabled state inside a focusable proxy. Activation closes the hint; menu/popover triggers retain their original asChild chain. Semantic Modal/FlowError/SkillNames title props remain intact. `test:overlays` audits all TS/TSX sources against native/forwarded title attributes and is included in frontend contracts.

Observed targeted checks: the actual React App with isolated read-only native responses was exercised through browser UI, not a copied gallery. 51 distinct hint labels were checked for mouse movement, keyboard focus and Escape dismissal across inventories, detail, settings, project icon selection, store and diagnostics. Additional checks covered the Pi card switch's descendant focus, keyboard Enter/arrow/Escape on project menus, focus return to the project trigger, help Popover opening/closing, and disabled preview Enter causing no action. Unclipped OverflowText intentionally has no tooltip. Top-window collision flipped the sidebar toggle below; collapsed section labels opened right; footer hints opened above. Project-icon hints were individually checked for all 16 built-in icons.

Coverage limits: fixture responses verify frontend overlays and composition, not native lifecycle behavior. Hidden skill-test UI, every Agent/long-path/error permutation and every theme were source-reviewed rather than exhaustively interacted with. No full lifecycle regression or real skill mutation was run for this change. Desktop packaged review and final build results are recorded below when complete.

Final checks: `pnpm build`, `CI=false pnpm tauri build --debug --bundles app`, `node --test scripts/overlay-hints.test.mjs` and `git diff --check` passed. The usual non-blocking Vite chunk-size warning remains. The 960×640 light/English/18px fixture displayed the wrapped unavailable-preview hint fully inside the viewport. Browser viewport override was reset and the temporary tab closed.

Restarted the ordinary packaged app with the real profile. Its Skill Space loaded with the existing theme and three-column cards; a shared toolbar hint appeared above Refresh. macOS WebView Option-Tab exposed clipped skill descriptions through the shared Tooltip; Escape dismissed them. The footer Appearance Popover opened, Escape closed it and returned focus to its trigger, and a subsequent Escape dismissed that trigger's focus hint. No preference or skill mutation was performed in this desktop check. The hidden skill-test flow remains source-only coverage. Changes have not been staged or committed.

### Collapsed sidebar scrolling and Vercel light separation — 2026-10-17

Removed SidebarContent's icon-state overflow-hidden override. Both expanded and collapsed states now allow vertical scrolling, clip horizontal overflow and retain shadcn's existing no-scrollbar utility (including WebKit hiding). Header/footer remain outside the scroll region. Vercel light sidebar now uses neutral OKLCH L=0.96 against the unchanged L=0.99 main background; dark and other palettes remain unchanged. Updated theme provenance with this authorized local adjustment.

Validation: frontend build, existing appearance tests (3/3), generated scrolling/token inspection and diff checks passed. This small CSS/token change uses build/open/manual-review verification; no automated app interaction, added UI tests or full regression. Manual review: collapse the sidebar and scroll down/up to reach project icons with no visible scrollbar; select Vercel + Light and compare sidebar/main surfaces. shadcn CLI docs lookup encountered DNS failure; official Sidebar documentation and installed component/utility source were checked through the available fallback.

Debug application packaging also passed. Restarted the normal packaged app and confirmed its inventory loaded; preserved the user's selected theme. Changes remain uncommitted pending confirmation.

### All-theme sidebar/main separation — 2026-10-17

Reviewed all eight themes in both modes (16 token pairs). In addition to Vercel light and Supabase light/dark, adjusted Claude light, Caffeine light, Darkmatter dark, Modern Minimal light/dark, Twitter light and Dark Forge dark where backgrounds matched or were too close. Other pairs were retained. Changes remain confined to sidebar tokens, preserving main surfaces, accent/text colors, focus, borders and theme identity; native chrome continues to derive its background from sidebar. Exact changes are recorded in ui-theme-sources.md.

Verification: strict frontend build, existing appearance tests (3/3, including all 16 palette applications), comparison confirming only sidebar fields changed, and diff checks passed. This is a token/source review with build/open verification, not a claim of automated visual acceptance of every palette. No full functional regression or automated desktop interaction was run. Manual review should switch each light/dark theme and compare navigation/main surfaces and selected/hover states.

Final debug packaging passed and the normal packaged app was restarted with its existing profile. Inventory loaded successfully. Theme switching and per-palette visual acceptance remain manual review, as appropriate for this small token-only change. Uncommitted pending user confirmation.


### Confirmed batch delivery — 2026-10-17

The user explicitly confirmed the reviewed commit plan. Earlier uncommitted/pending statements above describe their original checkpoints and are superseded by this delivery record.

| Commit | Scope |
| --- | --- |
| `294b302` | Pi project installation ownership and inherited-resource isolation |
| `52aeaca` | Hermes inspection/settings/card integration; required shared Hint prerequisite |
| `cc03d9e` | Guarded DSH configuration, invocation and Trash removal |
| `6257910` | Nested documents belonging to reviewed installation destinations |
| `3b8c7de` | Shared overlay defaults, app-wide native title migration, empty states and collapsed scrolling |
| `bf6c4ed` | Sidebar/main separation across light/dark theme palettes |

The full current frontend/helper contract command passed before committing. Intermediate Hermes, DSH and shared-UI index snapshots passed strict TypeScript checks after resolving commit-boundary dependencies; the UI snapshot also passed the native-title audit. Final runtime sources are unchanged from the previously successful frontend/debug builds. This organization did not rerun a full native or desktop workflow: prior native evidence and its runtime-copy interference/rerun qualification remain as recorded in spec 0009. No upstream CLI bytes, dependencies, real skill files or user preferences were changed by staging. Commits are local; no push is included.

### Content pane top spacing — 2026-10-17

Removed the width-dependent top padding increase from the shared desktop content pane. macOS now reserves the same 2.75rem as its existing native title row (44px at the default base size), instead of 3.75rem/4.5rem; other platforms keep 1.75rem without the former wide-window increase. Store, Skill Space, Agent/project inventory, details and Settings inherit the same pane inset. The stationary shell, content corner radius, scroll viewport top inset and page-internal spacing remain unchanged.

Verification follows the small-style-change path: strict frontend build and diff checks passed; no added UI tests or automated application/full lifecycle workflow. shadcn CLI documentation lookup failed with DNS resolution; the previously verified official Sidebar structure and unchanged local SidebarInset interface were reused. Manual review: compare page-title starting positions in store/space/settings and a skill detail, including a wide window; titles should sit below the native title row without the previous excess blank band. Pending user review and commit.

Debug application packaging passed. Restarted the normal app and observed the Skill Space title below the native title row with the reduced top band; inventory then finished loading. No page-switching or automated interaction was performed for this small adjustment. Changes remain uncommitted.

### Collapsed rail icon clipping — 2026-10-17

Observed the existing collapsed desktop rail: the 28px brand image was clipped by expanded-header horizontal padding inside the 48px rail; menu buttons also left only 16px between their collapsed padding, insufficient for the existing 18px Agent icon wrapper. Increased the icon rail to 3.5rem, collapsed menu/footer hit areas to 2.25rem and centered them. Collapsed header horizontal padding is 0.5rem, preserving the actual brand dimensions. Header/footer/groups do not flex-shrink vertically; the existing sidebar content viewport owns overflow and keeps scrollbars hidden. Footer icons use the shared 1rem collapsed size. Expanded navigation, brand assets and functional actions are unchanged.

Validation: strict frontend build and diff checks passed. This is a small layout fix; no new mirrored tests, automated app flow or full regression. Manual review: collapse/expand, check the full square brand Logo and Agent/project icons, then scroll a longer menu; fixed icon/button sizes should remain while the menu scrolls. Pending user review and commit.

Debug packaging passed and the normal app was restarted; inventory loaded successfully. Collapsed-state acceptance is left for manual review rather than an automated interaction run. No preference/skill mutations or Git commit were made.

Delivery update: the user confirmed combining the top-spacing and collapsed-icon fixes into one local commit. This supersedes the pending-commit notes at those two checkpoints. Runtime source is unchanged from the successful build/debug bundle above; no redundant full regression was run during commit preparation. No push is included.


## 2026-10-18 当前 Agent 与技能动作边界修正

用户确认的边界：不修改托管技能内容、仅修改 Agent 配置的增强功能可以保留；增强功能和状态只属于当前 Agent；批量逐动作判断资格。撤销“托管只提供通用功能”的一刀切规则。

| 已调整位置 | 最终行为与用途 |
| --- | --- |
| `src/lib/agent-skill-actions.ts` | 分离当前 Agent 的只读状态、配置动作与技能内容动作。CLI 托管身份不阻止 Pi 启停或 Hermes 启停／预加载，但阻止原生调用元数据写入和原生废纸篓操作。每个动作仍检查扫描资格、文件归属和共享限制。 |
| `src/App.tsx` 卡片／详情 | Agent 管理页取当前 Agent；技能空间取明确的 Agent 筛选。Pi 不显示 Hermes 信任／预加载或 DSH 调用状态；Hermes 不显示 Pi 或 DSH 功能；所有 Agent 视图不叠加这些专属信息。真实安装来源、路径及关联 Agent 图标保留。 |
| Pi/Hermes 配置读取 | 当前 Agent 明确时读取所需设置，托管集合不再被一刀切排除；切换 Agent 取消旧请求，切换上下文清理筛选。 |
| 托管 Pi 批量栏 | 保留按名称选择及原版 CLI 更新／卸载；复用既有 Pi 批量按钮提供配置启停，不提供调用方式。选中记录逐动作检查，不能因某项动作可用而放开另一项。 |
| 原生批量与文件动作 | 保留原生文件身份；Pi/DSH 调用、废纸篓动作增加当前 Agent 入口保护，原有独立文件及共享内容保护不放宽。 |
| Pi 来源搜索与同名路径 | 恢复真实包来源搜索／兜底来源。Pi 生效与覆盖说明只在当前 Pi 上下文展示；其他上下文保留通用多目录提示。 |
| Hermes 确认流程 | 实测配置保存成功后出现无技能名称的残留确认框；改为仅在有待确认操作时挂载该确认框。最终包保存后已观察到确认框关闭和控件状态更新。 |

### 本轮验证证据

- 前端／helper 契约 111 项通过，新增覆盖当前 Agent 隔离、托管配置允许／内容写入禁止、混合选择逐动作资格、只读规则和 DSH 文件保护；原断言随本次用户确认的契约调整，未删除原生／共享保护断言。
- 针对性原生测试 5 项通过：Pi 原版 CLI 复制／链接安装均可通过配置停用，技能原文不变，并可继续使用原版卸载；Hermes 4 项覆盖目录／所有权、配置格式、注释及未知字段保留、过期请求拒绝和项目信任。未重跑全量 130 项原生套件。
- `pnpm build` 与 `CI=false pnpm tauri build --debug --bundles app` 通过，TypeScript 严格检查和 Rust 编译通过。Vite 保留既有大分块警告。
- macOS arm64 独立 HOME，使用固定原版 CLI 在全局／项目安装两项测试技能。DSH 使用既有 universal 映射；没有修改上游 CLI，也没有启动真实 Agent 会话。
- 桌面实测全局 Pi 托管两项批量停用，仅改变全局 Pi 设置；项目两项批量停用，仅改变项目 Pi 设置。批量栏实测更新不可用而卸载／配置启停可用，且没有托管调用方式入口。混合归属和只读动作拒绝由契约测试验证，未声称每个批量组合均已桌面实测。
- Hermes 托管技能预加载／停用经过同名作用范围确认，实际只改变 Hermes 配置；Pi 配置不变。项目 Hermes 详情保留“Project not trusted / Session preload”，相同项目技能进入 Pi 详情不显示 Hermes 字段。DSH 原生详情保留自身调用字段，DSH 托管页无 Pi/Hermes 控件；所有 Agent 详情只有通用信息。
- 最终包重启后，全局与项目 Pi 停用、Hermes 停用及预加载值保持。11 份技能文件、2 份 CLI 锁记录前后 SHA-256 一致。所有写入均在隔离 HOME；并行窗口／侧栏改动保留。本批当前 Agent 修正已获用户确认本地提交，不推送。
- 补充手动验证（2026-10-18，用户反馈）：Agent 筛选菜单手动测试正常，没有菜单残留。该项记录为用户确认通过，区别于代理自动化验证结果；未据此修改共享 Select 组件。

### 验证限制与自动化环境记录

- 自动化曾在技能空间选择 Pi 后观察到筛选菜单残留、Escape 未清除，但 Pi 开关与保存状态显示正确。用户后续手动测试未复现，故不再将其列为已确认的产品缺陷或未解决产品项；自动化环境中该现象的原因仍未确认。其他 Agent 筛选的完整代理自动化流程未逐一重跑。
- 初始放在系统临时目录的隔离包报 `unknown path`；将包和测试 HOME 放到 `/private/tmp` 后库存恢复。没有据此修改产品路径解析或宣称已修复根因。首次直接 CLI 测试使用应用 DSH ID 被原版拒绝，按现有 universal 映射重试后全局／项目安装通过。
- 本轮实际观察浅色英文默认窗口；未重新遍历全部主题、字号、窄窗口和操作系统，也未验证已认证 Agent 会话加载结果。

本机证据：`.scratch/agent-context-actions-tests.log`、`agent-context-actions-build.log`、`agent-context-actions-app-build.log`、`agent-context-pi-native-tests.log`、`agent-context-hermes-native-tests.log`、`agent-context-qa.json`，不纳入版本控制。
