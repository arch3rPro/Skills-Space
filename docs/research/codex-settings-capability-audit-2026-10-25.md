# Codex 设置：技能、插件与工具配置复核

日期：2026-10-25。性质：分析与后续调整建议，未修改产品代码、用户配置或现有登录。本报告不代表下列界面和能力已获准实施。

逐项功能、默认/继承、影响范围、注意事项与 Agent 管理推荐见[设置项目录](codex-settings-item-catalog-2026-10-25.md)。推荐是产品分析，不代表条目已实施。

本记录的字段与测试证据保留；其中页面安排以[最新设置页方案](codex-settings-item-catalog-2026-10-25.md)为准，技能规则按后续确认保留为只读，不能继续当成待移除功能。默认设置页面已由后续批准实现，当前代码及验证见 [spec 0010](../specs/0010-codex-skill-plugin-management.md)；本报告下文的“当前”指调研当时。

## 调研时的页面覆盖（历史快照）

`src/components/codex-settings.tsx` 的目标固定为用户全局配置，读取 `upstream_codex_settings` 的 `skillsOnly` 分支；页面只有本应用独立授权连接与技能规则编辑器。规则支持名称/路径、启停、顺序、移除覆盖和版本校验保存；管理员匹配项、未知规则保留。它不是 Codex 的完整扩展设置中心。

插件安装/卸载/更新、项目插件覆盖及账号插件启停已有独立插件管理入口；这些操作不应在设置页再做一份。现有设置页没有覆盖技能目录预算、内置技能开关、插件默认策略、连接器工具策略、插件 MCP 策略、Hook 状态或建议项。

## 证据与版本

- 本机原版独立 CLI：0.164.0；App 随附原版 CLI：0.164.0-alpha.11.1。此前 0.162.1 的笔记只作历史对照。
- 当前 App 静态包版本：26.1021.31345（21828）。只读取安装包资源和生成的接口定义，没有自动化官方 App 界面。
- 当前官方配置 JSON Schema，以及两个原版二进制分别生成的 App Server schema。
- 两个二进制各在临时 HOME、临时项目、ephemeral 凭据存储中验证配置类型、用户层批量写入和部分实际读回；没有连接模型或实际 MCP 服务，没有读现有登录文件或钥匙串。
- 配置项存在/类型识别、成功保存、运行时实际效果、账号服务允许是不同证据层级。下表不把“支持写入”当作所有工具操作已验证。

## 配置能力矩阵

| 类别 | 原版入口 | 当前证据 | 适合的位置/处理 |
| --- | --- | --- | --- |
| 单技能启停覆盖 | `skills.config[]` 的 `name` / `path` / `enabled` | 两版本有效性读回；现有规则编辑器已接入 | 技能规则作为高级设置；单技能仍在卡片管理 |
| 技能目录信息预算 | `skills.max_context_tokens` | 官方文档、schema、类型与用户写入通过；上限描述为 10000 | 设置页技能区，可恢复继承；这是初始可用技能目录预算，不是模型总上下文或扫描加速开关 |
| 自动技能说明块 | `skills.include_instructions` | 官方 schema、两版本类型识别与用户写入通过 | 高级选项；关闭说明块不等于禁用技能发现或所有调用 |
| Codex 自带技能 | `skills.bundled.enabled` | 官方 schema、两版本类型识别与用户写入通过 | 高级选项；不等于所有“官方插件”或全部运行环境资源 |
| 额外技能根 | `skills/extraRoots/set` | 当前进程能发现新增根，用户文件不变；新进程没有继承 | 运行期能力，不提供声称能永久改变官方 App 的目录控件；持久入口需另核实 |
| 技能自动/显式调用 | `agents/openai.yaml` 的 `policy.allow_implicit_invocation` | 官方技能文档；不在 `skills.config` 中 | 技能自身的元数据/创作设置；插件更新和共享内容需要按所有权处理，不能直接改缓存作为个人偏好 |
| 未单独配置插件的默认启用状态 | `plugins._default.enabled` | 官方 schema、两版本类型识别与用户写入通过；未做本轮真实插件运行验证 | 设置页“插件默认”，语义为继承默认而非强制全部开/关；不能启用被来源关闭的安装 |
| 单个本地市场插件启停 | `plugins."name@market".enabled` | 已有实现及前序隔离生命周期验证，官方文档支持可信项目覆盖 | 保留插件管理的全局默认/项目覆盖，设置只提供入口 |
| 官方账号插件启停/卸载 | 账号插件服务 | 已接入独立授权链路；本轮没有真实账号变更 | 继续按账号操作；不把本地 `apps`/`plugins` 配置开关伪装成账号停用 |
| 插件内 MCP 服务启停 | `plugins.<id>.mcp_servers.<server>.enabled` | 官方文档/schema；两版本类型与用户写入通过 | 具体插件详情中的服务设置，不修改插件 manifest 或运行注入文件；实际服务读回还需隔离 MCP 用例 |
| 插件内工具白/黑名单 | 同上 `enabled_tools` / `disabled_tools` | 官方文档/schema；未在本轮连接实际服务 | 插件详情；拒绝列表在允许列表之后生效 |
| 插件 MCP 审批/输出预算 | 同上 `default_tools_approval_mode`、`tools.<tool>.approval_mode` / `output_token_limit` | schema；审批和输出预算类型通过，用户写入通过 | 插件服务/工具详情；不能将其解释为全局账号授权 |
| 连接器工具默认与细分权限 | `apps._default.*`、`apps.<id>.*`、`apps.<id>.tools.<tool>.*`、`apps.<id>.links` | 原版协议和配置 schema；默认审批写入通过 | 设置提供默认策略，具体连接器/连接/工具放详情；账号端权限需独立授权接口另证 |
| 操作风险类别 | `destructive_enabled` / `open_world_enabled` | 官方 schema/配置参考 | 对应工具声明的风险提示，不是 OS 隐私授权、凭据访问或网络沙箱总开关 |
| Hook 定义、启停与信任 | `hooks` / `hooks.json`、`hooks.state`、`hooks/list` | 普通用户无副作用 Hook 已验证从 untrusted 到 trusted 并读回；两版本均通过 | 独立 Hook 列表，显示实际来源、事件、管理状态与当前哈希；信任当前定义，不是一键永久信任全部插件 |
| 插件 Hook 内容信任 | schema 有 `trusted_content_hash` 等状态 | 本轮只验证普通用户 Hook，未验证插件脚本变更后的内容信任 | 不提前宣称闭环；实施前补原版插件 Hook 变更/重新审阅用例 |
| 市场来源与刷新 | `marketplaces.<name>`、原版 `plugin marketplace` | 已有市场管理实现；schema 有来源/ref/sparse_paths/原版维护时间戳 | 留在插件市场，时间戳不是自动升级日程；不新增重复注册表 |
| 插件/连接器建议 | `tool_suggest.disabled_tools` / `discoverables` | 官方 schema/配置参考，类型识别通过 | 可选高级项；隐藏建议不是卸载/停用已装插件 |
| 能力总开关 | `features.apps` / `plugins` / `hooks` 等 | 当前 CLI feature list 显示相关 stable 标记 | 按检测到的版本与实际需求决定，避免把整个实验特性清单搬进 UI |
| 远程发布/预配置元数据 | `remote_plugin_id` / `release_id` / `auto_provision` | schema 明确记录元数据本身不触发或授权预配置 | 不做“填 ID 即安装/锁定账号版本”的承诺，继续原版授权和来源权限 |

## 本轮隔离验证的明确结果

两个二进制结果一致：

1. 用户层按 `SKILL.md` 文件路径禁用，原版 `skills/list` 返回 disabled；按精确名称也返回 disabled。将同一路径改为文件夹路径仍是 enabled。官方配置参考有一处“folder”描述，但官方技能教程示例及本机实际行为使用 `SKILL.md`；产品应遵从实测。
2. 相同技能禁用条目放到可信项目 `.codex/config.toml` 后没有停用该技能。因此项目插件覆盖与项目技能覆盖不能混为一谈。该结果覆盖本轮普通用户技能样例，不扩大为所有未来版本/所有字段的结论。
3. `config/value/write` 的 schema 虽然有 filePath，写项目配置仍返回 `configLayerReadonly`。项目插件的已批准原生有界编辑例外继续有必要；这不能用来绕过未生效的项目技能规则。
4. `skills.max_context_tokens`、`skills.include_instructions`、`skills.bundled.enabled`、`plugins._default.enabled`、插件 MCP 启停/审批/输出预算、连接器默认审批、Hook 状态、工具建议字段，均有有效类型接收/无效类型拒绝对照。选定的 8 个字段用原版 `config/batchWrite` 保存及 `config/read` 读回通过。
5. `skills/extraRoots/set` 让同一进程发现新增目录，用户配置逐字节不变；新进程没有这个目录。当前公开文档还介绍 perCwdExtraUserRoots，但本机生成的 SkillsListParams 只含 cwds/forceReload，不能仅照文档就认为当前二进制支持同一参数形态。
6. 仅在夹具中声明 `/usr/bin/true` Hook。`hooks/list` 返回 key/currentHash/trustStatus/isManaged；将对应用户状态写入后读到 trusted。没有发模型 turn，没有执行 Hook，也未信任实际用户或插件脚本。

## 与原版 App 的页面/调用逻辑差异

安装包静态证据：

- `skills-settings-9037a0397eaf.js` 将技能设置指向既有 Skills 页面，而不是一张包含所有 Codex 配置键的表单。
- `skill-card-55c250d17d58.js` 调用原版 `skills/config/write`：名称含 `:` 的技能按原生名称写规则，其他技能按路径写。当前 Skills Space 卡片主要生成路径规则，插件缓存目录随版本变化时，路径覆盖存在失效风险；应专项对齐命名空间技能身份与更新后的规则延续，不能拿显示名代替原生名称。
- `plugins-settings-762b0cdf70d3.js` 有 Apps/MCPs/Skills/Marketplace 等扩展入口，以及插件提供的 MCP 分组和独立服务编辑。
- `plugin-settings-section-98722dd6244f.js` 仅在插件已安装且存在适用 view 时呈现插件提供的 Settings。部分 view 是 read/update 工具驱动的配置界面，另一些打开插件自带设置应用。它们不是通用 TOML 字段，不能只按参考图虚构配置项。
- `plugin-settings-url-shared-e0971ec5298b.js` 将账号插件/连接设置路由到带 CODEX product-sku 的官方页面。这是账号服务操作，独立于用户 TOML 写入；不读取当前登录来冒充本应用授权。

## 推荐调整方式

仍保留“Codex 设置”作为入口，按现有 FieldGroup/Field 和共用确认框组织，不在卡片新增状态说明，也不堆置灰占位操作。

1. **技能**：目录信息预算和恢复继承；高级区域容纳内置技能、自动说明块与现有规则。原生技能卡片继续处理单技能操作。调用方式只在有真实元数据所有权的技能详情处理。
2. **插件与工具默认**：未单独配置插件的默认启用策略、连接器工具默认审批；两个配置类别单独命名和保存，避免一个“启用插件”总开关混淆账号状态与本地运行策略。详细工具权限不放全局大表。
3. **连接与来源**：保留本应用独立授权的连接状态与退出；链接到已有插件管理、插件市场及来源路径，不重复安装/卸载入口。
4. **高级规则与 Hook**：保留技能规则的排序/未知条目保护；Hook 若获准实施则使用有来源和管理状态的独立列表及逐项审阅，不创建自动信任或一键解除管理员要求的设置。
5. **具体插件详情**：MCP 服务开关、工具白/黑名单、审批及输出预算；原版自定义 Settings 只在真实可发现并适配时提供。

优先顺序：先修正设置与详情的作用域/继承信息，并对齐命名空间技能规则；再补已验证的常用默认项；然后针对实际 MCP、插件 Hook 和账号端工具权限补隔离/独立授权验证。仅“尚未接入”的项目不标成“不可用”；确有范围或持久性边界的按本轮证据说明。

每个设置区明确用户默认、当前项目、账号或技能文件归属。unset 与显式 true/false 分开，提供有实际语义的恢复继承；读有效值、用户值、配置来源及管理员限制；不因为值能写入就宣称会覆盖运行中的官方 App 会话。常用设置读取复用现有状态，规则编辑保留必要原版读取，不重新加载插件发现目录或整套 Agent。

## 来源与验证边界

- [官方配置参考](https://learn.chatgpt.com/docs/config-file/config-reference)
- [官方配置 Schema](https://learn.chatgpt.com/docs/config-schema.json)
- [官方技能文档](https://learn.chatgpt.com/docs/build-skills)
- [官方插件打包与安装后服务策略](https://developers.openai.com/plugins/build/plugins)
- [官方 Hook 文档](https://learn.chatgpt.com/docs/hooks)
- [官方 App Server 文档](https://learn.chatgpt.com/docs/app-server)

本轮只新增分析记录与索引，不调整产品代码、不保存真实设置、不执行真实账号/插件动作。尚未验证真实 MCP 工具执行、官方 App 当前会话热更新、账号端工具权限变更、插件 Hook 脚本内容变更信任；不因配置 schema 存在就声称这些已全部闭环。文档变更无需运行前端/原生全套构建测试。
