# Codex 插件管理、添加插件与插件市场：核查和调整方案

日期：2026-10-24。状态：实施与验证中；2026-10-24 用户明确暂缓压缩包上传和本地导入，本轮不提供入口。依据用户提供的两张官方页面截图、当前安装包公开代码、原版接口 schema、现有实现及隔离结果；不读取现有登录凭据，不操作官方受保护 GUI，不改真实插件或市场。

## 1. 页面职责与六项要求

| 用户要求 | 建议落地 | 边界 |
| --- | --- | --- |
| 管理页不显示未安装项，去掉安装状态筛选 | 插件管理只消费已安装列表；删除“全部插件／已安装／可安装”选择器 | 搜索、启停状态筛选和原有插件操作保留；不在卡片增加安装状态、说明或警告 |
| 按来源筛选，区分内置和单独添加市场 | 以真实来源 ID/提供方分类；来源选择器区分 App 内置、运行包、官方账号目录和逐个用户市场，按实际存在的来源生成 | 来源是分发渠道，不是作者；App 自动写入用户配置不等于用户添加 |
| 验证内置市场能否卸载及放置位置 | 插件市场页管理用户添加/项目提供的市场；App 内置与运行包不作为可卸载市场行 | 插件本身仍按原版逐操作策略管理；市场注册移除不等于删除提供方资源 |
| 添加下拉：插件、市场、压缩包 | 管理页右上使用现有 DropdownMenu：添加插件、插件市场，以及验证后确定的压缩包入口 | 不复制截图中的创建插件、自定义 MCP、录制技能；没有闭环的操作不放置灰项 |
| 添加市场仍在市场页 | 下拉“插件市场”只导航；插件市场页保留“添加插件市场”及原有添加/移除流程 | 不在下拉中再做第二套市场添加弹窗 |
| 单独添加插件页，可安装内容迁入 | 添加插件为独立页，承载目录浏览、搜索、来源/分类、详情和安装 | 可安装列表不再混入管理页；安装成功后由原版回读更新管理列表和数量 |

建议导航：

```text
插件管理（已安装）
  搜索 · 来源 · 启停状态 · 刷新 · 添加 ▾
                                      ├ 添加插件 → 添加插件页
                                      └ 插件市场 → 插件市场页 → 添加插件市场
```

“添加插件”页是普通完整页面，沿用现有返回导航和详情页；不额外增加侧栏主模块、全局路由系统或第二套安装后端。返回管理页时保留原搜索/来源选择，目录结果与已安装快照分开。来源菜单使用共享 SelectGroup/SelectLabel 分组，不在市场名称后拼接“用户添加／配置提供”等解释。

## 2. 官方页面实际区分的维度

用户截图显示公开／个人两个目录入口，并以热门、新品推荐、小型企业等区块组织内容。这些不是安装状态，也不是市场来源。当前安装包还根据工作区和团队能力出现 Workspace/Teams 入口。

| 维度 | 原版含义 | Skills Space 对应方式 |
| --- | --- | --- |
| 已安装管理 | 已安装项、启停、卸载、管理入口 | 插件管理页 |
| Public / Personal | 公开目录与用户创建/分享给用户的账号内容 | 添加页按已核实账号能力接入，不把本地目录冒充个人账号目录 |
| 热门、新品等栏目 | 服务端分类/推荐目录；热门对应 featured slug | 使用接口实际返回的栏目、标题、分页，不硬编码假分类或填充假数据 |
| market 来源 | 官方目录、本地/项目市场、App/运行包提供方 | 来源筛选；逐个用户市场可选 |
| 插件 category | 市场条目声明的 Engineering、Productivity 等元数据 | 本地市场可以按实际 category 过滤，不与上述推荐栏目强行等同 |
| skills / MCP / hooks / apps | 包内组件 | 用于详情和真实操作后果，不改为来源类别 |

原版公开静态资产证据：

- `plugins-skills-tabs-7479e4bbab9a.js`：Public、Personal、Workspace、Teams 入口，以及 Installed、Created by you、Shared with you 区块；可见性按账户/工作区条件生成。
- `plugins-query-aa6938ef2f96.js`：个人目录读取 `/ps/plugins/workspace/created`、`/ps/plugins/list?scope=USER`、`/ps/plugins/workspace/shared`，分别处理分页。
- `category-plugins-query-207f14a7cd11.js`：按 `/ps/plugin-categories/{category_slug}/plugins` 读取 GLOBAL 分类和搜索分页。
- `plugin-breadcrumbs-94341a391faa.js`：featured slug 显示 Popular；分类标题可由目录数据提供。
- `plugins-page-selectors-c875c177a097.js`：市场管理选择器 `U` 只返回 `!isBuiltIn && configuredMarketplaceNames.has(name)` 的市场。原版也没有把每个内置提供方都作为可移除市场展示。

以上资源从当前 `/Applications/ChatGPT.app/Contents/Resources/app.asar` 提取到 `.scratch/plugin-archive-research/catalog-assets/`；没有通过自动化访问官方 App 界面。

## 3. 内置市场与运行包：可移除什么

同版本原版隔离验证已经证明：在可写用户配置中显式注册的 `openai-bundled`、`openai-primary-runtime` 可以移除其注册记录，但提供方源目录仍存在。没有注册记录时，没有同样的用户注册可移除。其他生效配置层引用同名市场时，原版拒绝移除，避免破坏仍被使用的目录副本。

证据：`src-tauri/src/upstream/codex/markets.rs` 的 `original_provider_registrations_are_removable_without_deleting_provider_content`；同版本结果 `.scratch/market-origin-skills/provider-cli-tests.log` 与 `provider-app-cli-tests.log`；固定原版实现 `.scratch/codex-market-management/remove.rs`。当前版本 0.162.1 / App 0.164.0-alpha.11.1 与这些验证相同，因此复用结果，不重复运行整组测试。

| 对象/动作 | 验证结论 | 页面决策 |
| --- | --- | --- |
| 用户添加市场的注册/下载副本 | 原版可添加、移除，并保留原始本地目录及已安装缓存/技能规则 | 插件市场页面管理 |
| App/运行包市场的用户层注册记录 | 条件满足时可移除；不是卸载 App 或运行包，提供方可能重新同步注册 | 不将这个动作包装成“卸载内置市场” |
| App/运行包提供方文件本体 | `marketplace remove` 不删除这些资源；未发现以市场管理命令永久卸载提供方的接口 | 不在插件市场页提供删除 App/运行包资源的按钮 |
| 提供方中的单个插件 | 是另一层权限，由原版安装策略、账号/管理员约束及实际接口决定 | 已安装插件继续逐项管理，不按市场类型一刀切 |

因此建议：插件市场页面列出真正可供用户管理的市场来源；App 与运行包作为插件来源筛选项。内置来源可被用户辨认，不需要再放进市场列表造成“可卸载提供方”的误解。这是页面职责调整，不删除任何市场或插件文件。

## 4. 现有可安装读取：确实有，但范围不同

现有 [本地市场读取](../../src-tauri/src/upstream/codex.rs) 会执行：

```text
codex plugin list --marketplace <name> --available --json
```

它返回该已配置本地/Git 市场的 installed / available。可以复用在“添加插件”页，不必另造本地安装器。

当前 [账号目录适配](../../src-tauri/src/upstream/codex/catalog.rs) 有意只消费已安装记录，且把未请求的 available 清空；[独立账号读取](../../src-tauri/src/upstream/codex/account.rs) 的 `catalog()` 目前调用 `plugin/installed`。所以当前能力不能被称为已接通完整官方可安装目录。

原版 schema 已区分：

- `PluginInstalledParams`：已安装读取。`installSuggestionPluginNames` 是显式的未安装建议入口，管理页不应携带它。
- `PluginListParams`：发现目录，支持 `marketplaceKinds`（local、vertical、workspace-directory、shared-with-me、created-by-me-remote）、`cwds`、`forceRefetch`。
- `PluginListResponse`：含 marketplace/PluginSummary、可选 category、featuredPluginIds 与 marketplaceLoadErrors。

本地及当前已添加市场的可安装数据可以直接迁入新页；完整官方目录、账号个人内容及推荐分类需要补接真实读取及分页，使用本应用自己的独立授权。不得借用 Codex 现有登录，也不能因为原版有接口就声称本应用的授权已能调用所有目录。

页面统计只来自同一目标/账号上下文中读到的已安装记录。添加页目录不覆盖已安装快照，后台本地扫描也不应把尚未读取的账号插件当作消失；读取未完成时沿用现有加载控件，不展示一轮本地小计再切换到完整总数，不加卡片状态提示。

## 5. 压缩包：本地导入与账号上传是两个功能

完整证据和两个原版运行端的隔离结果见 [压缩包专题核查](codex-plugin-archive-import-2026-10-24.md)。

| 功能 | 当前结论 | 接入建议 |
| --- | --- | --- |
| CLI/RPC 直接安装 ZIP | 0.162.1 与 0.164.0-alpha.11.1 均无直接 ZIP 安装入参；直接命令已拒绝 | 不虚构 zip install 命令 |
| 本地解压导入后原版安装 | 已用生成压缩包隔离验证注册、安装、回读和卸载 | 可实现，准确命名“导入插件压缩包” |
| 截图的账号上传 | 原版是上传 URL → 文件上传 → 创建账号插件，受账号上传权限与开关控制 | 独立授权服务端接受尚未验证，不能与本地导入混为一谈 |

本地导入需要原生层校验压缩包路径、文件类型、大小、插件根目录和身份，再保留持久来源交给原版管理。不能在临时解压目录安装成功后立即删源，造成市场指向失效。这里是已证实可行的实施路线，不是已完成产品级恶意/加密/超大压缩包处理。

如果选择与截图一致的“上传”，应继续单独验证独立授权、真实账号权限、上传创建和回读；不得先放置一个空按钮或拿已有连接器授权推断上传权限。

## 6. 实施次序与验收

1. 先统一已安装数据读取和回读范围，修正数量抖动；管理页固定只显示已安装项，移除安装状态选择器。
2. 接入来源筛选及添加菜单，整理用户市场页面；不改卡片结构或增加状态文案。
3. 新建添加插件页面，复用本地可安装读取；补官方目录读取时使用独立授权和原版分类/分页，目录快照与已安装状态分开。
4. 压缩包上传和本地导入均保留为未来扩展方向；本轮不增加入口、解析、安装或账号上传逻辑。
5. 同步检查启用/停用/安装/卸载/更新的共同确认入口，落实同一设计基线。此前 GitHub 停用的原始错误未取得且用户已无法复现，不能在本研究中宣称已修复；保留具体目标和原始失败信息的闭环需在实施阶段完成。

最低验收：进入管理页自动得到完整数量；刷新/普通操作不让账号插件短暂消失；卸载后只出现在添加页；来源筛选能区分 App、运行包和用户市场；内置提供方无伪装的卸载按钮；从任一入口安装后能回读管理页；本轮无压缩包入口；通用确认与错误状态不遗漏。只运行与实际改动相关的用例及项目要求构建，不跑无关整组测试；完成后打包并使实际 App 加载，操作真实插件仍遵守授权范围。

最初调研阶段仅新增研究记录，未更改生产代码、界面、过滤行为、真实文件、插件状态或登录；没有运行构建/整组测试。新增执行仅为压缩包的受控原版探针；市场删除结果复用同版本已通过的隔离证据。

## 公开官方资料

- [Package your plugin](https://developers.openai.com/plugins/build/plugins)：本地市场、原版市场命令、来源与安装缓存的职责。
- [Plugin quickstart](https://developers.openai.com/plugins/quickstart)：ChatGPT 与 Codex 使用统一的公开目录；目录发现与个人创建插件是不同能力。
- [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission)：公开发布路径；不能拿其发布门户规则冒充所有私有账号上传条件。


## 2026-10-24 初版实施范围（发现数据方案已被下文纠偏替代）

用户明确暂缓压缩包上传和本地导入；专题调研保留作未来扩展依据。添加页使用独立的紧凑双列目录列表，包含图标、名称、简介和安装操作；按包/市场声明的实际分类分组。目录包含已安装与可安装条目，安装状态只决定是否提供安装操作，不追加状态徽章。目录读取结果与管理快照分开，管理数量只计确认已安装的唯一身份。官方目录使用本应用独立授权的原版 plugin/list（vertical）；未授权时通过“浏览官方插件”进入既有授权弹窗，授权后重读目录。不借用 Codex 现有登录；没有接入的 Personal 内容和服务端推荐栏目不填充假数据。

实施、构建和桌面验收结果统一记录在 spec 0010 的本次增量中。

## 2026-10-24 原版发现链路纠偏

用户指出发现范围、公开/个人页和分类与原版不符。此前把 `plugin/list` 的 vertical 集合以及包内 `interface.category` 当成公开目录，是实施错误；布局修改、分类大小写合并不能补足数据源。当前发现页不作为完成结果。

重新从当前安装包静态代码确认：

- `app-primary-c377f30f532d.js` 的 `dMn` 请求 `GET /ps/plugins/home`，`lMn` 使用真实 `sections` 的 `id/title/url_slug/plugins`。远端首页存在时，不使用包内分类生成首页栏目。原版首页每栏显示前 6 项，返回中最多保留 9 项；栏目以 `url_slug` 导航。
- `category-plugins-query-207f14a7cd11.js` 请求 `GET /ps/plugin-categories/{category_slug}/plugins`，参数 `scope=GLOBAL`、`q`、`limit=50`、`pageToken`，用 `pagination.next_page_token` 继续加载，并读取返回的 `category` 元数据。
- 个人页在 `plugins-skills-tabs-7479e4bbab9a.js` 的 `za` 合并用户创建内容、适用时的工作区内容和本地市场；本地市场按市场身份分组。`plugins-query-aa6938ef2f96.js` 的 USER、workspace-created、shared 各有自己的分页，不能用安装状态或包类别代替。
- 公共服务插件的显示字段由 `nMn` 映射：`id/display_name/short_description/icon_url/icon_url_dark/status/disabled_reason/installation_policy`；不把公开条目 ID 猜成原版插件名。
- 原版 `plugin-installation-content-2a840257292a.js` 区分 hosted 与 desktop：hosted 分支调用 `POST /ps/plugins/{plugin_id}/install?includeAppsNeedingAuth=true`，body 含 `install_attempt_id`，后续处理 `app_ids_needing_auth`；desktop 分支调用原版 `plugin/install`。`eIn/EPn/OPn` 表明远端 `pluginName` 是真实 `remotePluginId`，不是显示名或猜测的目录名；`xLn` 将服务插件映射到 `openai-curated-remote`。读取目录不等于安装/外部账号连接流程已验证。
- 原版详情读取 `GET /ps/plugins/{plugin_id}`；语言通过 `OAI-Language` 请求头传递。

已在本应用自己的独立授权会话中完成真实 **只读** 首页请求，没有访问原有 Codex 凭据、账号资料或执行插件变更。服务返回根字段 `sections`，共 17 个栏目，每栏 9 个条目：featured、new-and-noteworthy、small-business、productivity、communication、creativity、developer-tools、healthcare、finance、travel、entertainment、education-and-research、business-and-operations、data-and-analytics、scientific-research、security、other。这是服务实际返回，不是从截图手工创建的分类表。可审计的限定结构输出在 `.scratch/market-origin-skills/public-directory-probe.log` 中，以 `SKILLS_SPACE_PUBLIC_DIRECTORY_PROBE` 为前缀；仅包含公开栏目的字段名、标题、slug 和条数。

继续验证：分类真实下一页、USER 内容响应结构、中文语言头和公开插件详情。临时限定结构探针须在产品接入完成后移除，不保留生产调试日志。获取真实返回并核对前，不继续改发现页 UI，不将当前错误页面宣称为已完成。


第二轮只读实测：`OAI-Language: zh-CN` 返回 17 个中文栏目，与用户截图的栏目和热门前六项一致（Gmail、Google Drive、Google Calendar、GitHub、Slack、Outlook Email）。`productivity` 分类元数据为标题“效率”、说明“整理工作、自动化任务，完成更多事项。”；按原版参数 `scope=GLOBAL&limit=50` 请求，服务实际返回 660 条，存在下一页，按返回游标继续请求得到 684 条，两个响应的插件 ID 无重叠。不能把请求的 limit 当作实际返回条数或硬编码为终止条件。USER 请求返回 0 条，没有把未创建云端插件误判成缺少本地 Git 市场。公开详情 GET 成功，release 中存在 interface/app_ids/app_templates/mcp_servers/skills/version 等字段。只记录字段名、公开标题和条数，没有保存 USER 内容、账号资料、凭据或分页游标。限定结构证据前缀 `SKILLS_SPACE_DIRECTORY_PAGINATION_PROBE`，文件 `.scratch/market-origin-skills/public-directory-contract-probe.log`。

原版 UI 的公开首页每栏只显示 6 个条目，使用服务给出的栏目顺序与中文标题；点击真实 `url_slug` 进入分页详情。个人页应显示用户市场分组，而不是把已安装官方插件、App 资源和包内分类混入。当前错误的发现 UI 尚待替换，不视为完成验收。


## 2026-10-25 真实目录接入

生产发现页已改用服务端首页栏目和分类游标，不再用 vertical 列表或包内 category 拼出公开目录。公开首页按返回顺序与语言标题展示每栏前六项；分类查询及公开搜索分别使用已确认的原版接口，继续加载只使用返回游标。个人页合并 USER 创建内容与本地用户市场，按实际市场声明的名称分组；App 和运行包提供方不混入个人市场。

公开条目保留真实 remotePluginId，详情/安装准备通过独立授权的原版 plugin/read 读取并校验原版身份；安装继续交给原版 plugin/install。真实只读 plugin/read 已成功，未执行真实安装、卸载或启停，也不据此宣称第三方账号已连接。目录元数据只映射公开产品字段，远端图标仅允许无凭据 HTTPS 地址。临时探针已从生产代码移除。

安装管理仅显示确认已安装的唯一身份，移除安装状态集合筛选。来源选择按官方提供方和插件市场分组，批量选择位于主按钮“添加”左侧；添加菜单只有“添加插件”和“插件市场”。市场新增仍在市场页，提供方资源不冒充可删除市场，实际用户注册和插件权限分别判断。压缩包保持暂缓。

普通技能刷新不会用本地小计覆盖完整账号插件数；操作失败在共用确认框保留原始错误和重试。先恢复本应用自己的授权状态再读完整目录；没有独立授权时使用 ephemeral 凭据配置，移除旧的现有 CLI 登录回退。没有手动读取或向模型输出凭据。

代码验证：5 项相关前端用例、4 项目录契约用例、远端图标/路径元数据用例和操作状态语义指纹用例通过；严格前端构建通过。两套原版 CLI 隔离本地生命周期已在本轮前序验证通过。打包后页面观测结果另记，不将单元测试作为视觉验收。


打包桌面只读核对：实际公开首页显示 17 个服务栏目和每栏前六项；个人页实际仅显示 ArkSpace、mattpocock 两个用户市场，市场页同样不混入 App/运行包资源。从市场返回保留个人页选择。效率分类实际显示完整响应，下一页加载完成后继续保留服务游标；分类搜索 Notion 返回真实结果。Gmail 详情通过原版读取，安装确认可打开并取消，没有执行安装。管理页自动数量为 19，未点击更新。

公开首页搜索实测暴露 full-plugin 与首页 summary 的结构差异（Missing native plugin name）；分页解析现分别读取 release 与 summary 两种已确认结构，复用 USER 全量详情字段映射，相关契约用例加入 full-plugin 搜索结果断言。该修复需重新打包后复核，不以分类搜索通过代替公开搜索验收。


Final rebuild and read-only recheck (2026-10-25): the Tauri debug App bundle passed. Public search for Gmail returned Gmail and actual service search results without the previous name error. The restarted installed count remained 19. The application was left on the discovery homepage; no real plugin state was changed. Remaining limits: real public installation and external account connection were not executed; exhaustive theme/viewport coverage is not claimed.


### 图标与读取速度后续（2026-10-25）

卡片、公开目录和详情统一使用现有 CodexSkillIcon 的圆角框，完整比例显示非圆角、长方形和透明图标。市场页面去除“用户添加”标签，未据此修改操作资格。查询解除每次全量本地扫描的前置依赖，复用当前安装快照作显示匹配；原版详情及写操作仍实时复核。合并相同范围的并发读取，复用独立授权的 HTTP 连接；不增加持久缓存。真实界面单次同操作样本：Gmail 搜索约 3.6s→1.3s，切回 Codex 等到完整数量约 2.1s→1.3s。冷启动与网络延迟仍存在，详细验证与边界见 spec 0010 本次增量。原版市场升级逻辑的当前证据见市场升级专题，本轮未新增升级按钮。


### 已授权的单市场升级（2026-10-25）

用户明确要求后，市场行新增按实际有效 Git 配置和原版命令支持判断的升级操作。仅对可升级来源显示按钮；共用确认弹窗说明会刷新市场和其中已配置插件（包含停用插件）的文件。原版 CLI 始终传入单个市场名，检查结构化结果并回读市场和插件。隔离测试已覆盖来源过期拒绝、停用插件内容刷新与规则保留；隔离界面已观察错误展开、重试成功与返回列表。参见 spec 0010 和市场升级专题的本次增量。


### 来源筛选文案与层级（2026-10-25）

按用户最终指定，来源名称统一为“应用内置、运行环境、官方插件”，分组使用“官方内置、插件市场”。原生技能来源的具体插件收进“插件技能”二级菜单，显示插件图标与声明的显示名，以原生 ID 选择。已核对鼠标展开、具体插件筛选、键盘选择与恢复全部来源；构建和相关前端用例通过。该调整不改变来源权限或插件状态。
