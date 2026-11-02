# Codex App 与 CLI 技能插件调研

日期：2026-10-21。状态：初次调研已完成，后续实现与验证见方案；本文早期结论保留其历史上下文，以末尾最新核验为准。实施提案见 [0010 Codex 增强适配方案](../specs/0010-codex-skill-plugin-management.md)。

## 结论

Codex 适合成为 Skills Space 的增强适配 Agent。建议保留现有原版 `skills` CLI 管理普通技能内容，使用用户安装的原版 Codex 获取原生库存、修改用户级技能启停，使用 `codex plugin` 管理符合条件的本地市场插件。Pi 可复用的是库存归属、操作能力判断、批量动作和结果刷新模式；其加载优先级、项目设置、调用策略扩展和包驱动不能直接移植。

首批应交付普通技能与插件技能的识别、原生技能启停、插件整包启停及本地市场插件安装／卸载。插件更新按来源分阶段接入；远程目录、工作区受管理插件和桌面内置插件保留实际能力边界。桌面 App 与 CLI 作为一个 Codex Agent 的不同运行端，不能仅因共享目录便声称状态完全一致。

本轮最关键的版本事实：

| 问题 | 核验结果 | 对方案的影响 |
| --- | --- | --- |
| 技能禁用路径 | `SKILL.md` 文件路径有效；目录路径写入返回成功，但实际技能仍启用 | 使用原生列表返回的文档路径，写后重读，不只看写入响应 |
| 技能项目级开关 | `0.162.1` 仅从 User 和 SessionFlags 层合并启停规则 | 项目页操作仍是用户级路径规则，不能标为项目专属设置 |
| 同名技能 | 不同物理路径的同名技能均保留；按名称禁用会同时匹配 | 以路径为身份，默认不使用名称写入 |
| 插件管理接口 | CLI 有 JSON 输出；App Server 的插件列表／安装等接口在文档中明确禁止生产客户端使用 | 插件生命周期优先 CLI，不把实验 RPC 当正式集成协议 |
| 已禁用插件 | 插件仍在已安装列表中，但其技能退出 `skills/list` | 不能把有效技能列表当完整安装库存 |
| 插件版本检查 | CLI 列表中的已安装项 `version` 优先表示安装版本 | 不能用这一字段同时表示远端最新版 |

## 核验基线与证据范围

- 用户指定仓库：[openai/codex](https://github.com/openai/codex)。本机 `codex --version`：`codex-cli 0.162.1`。
- 对应发行标签：`rust-v0.162.1`；标签对象 `7a078f6bb4ce0dc2a81408b334ce52979d92c603`，解引用提交 **`092d3acd6bec3e3a14bdc7e7a2810ab628ab759d`**。由 `git ls-remote` 核验。本文不声称该版本是最新发布。
- 项目基准 HEAD：`535a9855d002678d1ae187a8a734f48fdf0f4d4a`；分析的是包含既有未提交改动的工作区，尤其 Pi 已有较 HEAD 更新的能力。
- 固定仓库是 CLI、Rust 核心及 App Server 的公开源码证据，不是完整桌面 UI 的源码。没有据此推断桌面私有接口、账号策略或实际 App 版本。
- 原版仓库为 Apache-2.0；本方案调用原版二进制和协议，不复制其实现。若以后复制代码，需保留许可证与相关声明。[README](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/README.md#L1-L81)、[LICENSE](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/LICENSE#L1-L201)
- 成熟度判断：可核验发行版、工作区版本一致、具备原生 CLI、协议生成器和针对性测试；但接口仍在快速变化，插件 RPC 的公开限制及文档／发行版差异意味着不能按“最新版文档”无条件开放操作。[Cargo manifest](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/Cargo.toml#L1-L164)

## 项目现状与 Pi 参考

| 当前实现 | 可复用内容 | Codex 必须不同的部分 |
| --- | --- | --- |
| `src/lib/upstream.ts` 的 `agentEnhancement` | 增强适配／通用支持分组 | 当前 Codex 仍为通用支持，不能只改分组就宣称适配完成 |
| `src-tauri/src/upstream/detection.rs` | 可执行文件、App、配置目录的证据等级 | 检测到 App 不代表有可调用且版本兼容的 CLI |
| `src-tauri/src/upstream/pi.rs` 的 `augment` | 将原生状态附加到现有记录，补充原生库存 | Codex 按规范化文档路径关联；不同路径同名技能不合并 |
| `scripts/inspect-pi-skills.mjs` 的 `inScope` | 管理归属与实际加载范围分离 | Codex 运行时会按真实路径去重，项目链接仍需由物理安装观察保留 |
| `src/lib/agent-skill-actions.ts` | 单项与批量操作共用能力判断 | 技能用户级规则与插件整包规则分别判断 |
| Pi 设置、批量栏、详情、结果组件 | 草稿保护、显式保存、逐项结果、已有反馈 | 不复制 Pi 路径 glob、`/reload`、`disable-model-invocation` 或可见性扩展 |
| `scripts/inspect-upstream-plugins.mjs` | 原版 skills 来源预览中的插件分组 | 该文件处理 `.claude-plugin` 来源元数据，不是 Codex 插件管理器 |

固定依赖 `skills@1.7.4` 的 Codex 目标是项目 `.agents/skills`、全局 `~/.agents/skills`。用户的 `CODEX_HOME` 支持 Codex 本体配置与旧技能目录，不能因此把原版 skills 的全局安装目标改成 `$CODEX_HOME/skills`。依据：本机 `node_modules/skills/dist/cli.mjs` 的 Codex Agent 定义，及 [ADR 0005](../adr/0005-use-unmodified-upstream-cli.md)。

现有 [ADR 0007](../adr/0007-agent-native-management-direction.md) 将范围收敛为技能管理。本次用户明确要求调研插件，因此方案覆盖插件作为技能分发单元的管理；并不扩大为模型、账号、MCP 编辑器、Agent 本体升级或会话管理产品。

## Codex 配置与技能发现

### 配置层与范围

`CODEX_HOME` 默认对应 `~/.codex`。用户配置、项目配置、系统／受管理设置及会话覆盖需要分别读取。应通过 `config/read` 的 `cwd`、`includeLayers` 获取来源与版本，而不是把多个 TOML 简单拼接。项目未信任时，配置层响应可包含 `disabledReason`；这种状态不等于项目技能文件不存在。[官方配置说明](https://learn.chatgpt.com/docs/config-file/config-basic)

本版本有更窄的技能启停规则：`skill_config_rules_from_stack` 只接受 `ConfigLayerSource::User` 和 `SessionFlags`。规则保持顺序，后匹配规则可覆盖前规则；路径选择器规范化为文档真实路径。空选择器、同时指定 path 与 name 的条目不生效。项目级 TOML 即使被读取，也不能据此推断其中的技能启停条目生效。[规则实现](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/config/src/skills_config.rs#L81-L224)

### 发现目录

| 来源 | 路径或依据 | 管理含义 |
| --- | --- | --- |
| 共享用户技能 | `~/.agents/skills` | 可能被多个 Agent 使用；Codex 禁用不得删除共享内容 |
| 兼容用户技能 | `$CODEX_HOME/skills` | 源码标为兼容旧位置；仍需纳入库存 |
| 内置技能 | `$CODEX_HOME/skills/.system` | Codex 可按内置内容指纹重建；不交给普通卸载或内容更新 |
| 仓库技能 | 项目根至 cwd 的 `.agents/skills` | 按 Codex 的项目根标记查找，不能直接复用 Pi 的祖先遍历 |
| 项目配置旁技能 | 配置层对应的 `.codex/skills` | 依据实际配置层与原生响应观察，不只扫描当前目录 |
| 管理员技能 | 系统配置目录下的 `skills` | 标记管理来源，首批不提供内容删除 |
| 插件技能 | 已解析的插件技能根 | 关联插件 ID；禁用插件后可能不在有效列表中 |
| 额外运行时根 | HostSkillsService 的 extra roots | 属于进程上下文，不能当作稳定的用户持久配置 |

源码从配置层构建根，再加入插件、额外根、仓库目录，按根路径去重。无项目根标记时仓库查找回退到 cwd。根扫描与缓存由原生服务维护。[根解析](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/ext/skills/src/host_roots.rs#L28-L278)、[缓存与刷新](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/ext/skills/src/host_service.rs#L118-L300)

技能合并按文档路径去重，并按 scope、名称、路径排序；不是按名称只保留一个。隔离项目链接指向全局技能时，原生列表只保留相同真实文档的一个记录，因此应用应保留“项目安装链接”与“运行时文档”两种身份。[合并实现](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/ext/skills/src/loader/host_merge.rs#L198-L270)

### 技能启停与调用策略

本版本已验证的用户配置形式：

```toml
[[skills.config]]
path = "/absolute/path/to/skill/SKILL.md"
enabled = false
```

原生接口 `skills/config/write` 支持 path 或 name，返回 `effectiveEnabled`。单独写目录路径也可能返回 false，但没有匹配到技能；必须重读 `skills/list` 验证目标状态。按名称规则属于多路径操作，不适合作为单卡默认开关。上述行为同时有源码、生成 schema 与隔离结果支持。

自动选择与启停不同。已读元数据加载器解析 `policy.allow_implicit_invocation`、interface 和 dependencies；本机对照 fixture 同时存在 `agents/openai.yaml` 和根目录 `SKILL.json` 时，列表展示的是 YAML 的 display name。当前文档及 schema 注释存在不同代际描述，不宜直接照文档替换元数据文件。[元数据加载](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/ext/skills/src/loader/metadata.rs#L28-L175)、[技能说明](https://learn.chatgpt.com/docs/build-skills)

首批只读展示能可靠识别的调用策略，不写共享技能或插件缓存的元数据。`skills/list` 的已生成公开结果没有 policy 字段；读取文件也只能证明配置值，不能证明实际模型调用。未来若开放独立原生技能的调用策略编辑，需要针对版本验证文件格式、更新覆盖、显式调用与自动调用差异。

## 插件配置与生命周期

### 四种对象必须分开

| 对象 | 作用 | 不应误认成 |
| --- | --- | --- |
| Skill | 一份工作流及资源 | 独立插件或 MCP 连接 |
| Plugin | 一组技能及可能的 MCP、Apps、Hooks 等能力 | 可逐技能任意删除的目录集合 |
| Marketplace | 插件来源目录及策略 | 已安装插件清单 |
| Connector／App | 连接服务及其授权状态 | 插件已安装即已授权、可调用 |

官方格式包括便携根 `plugin.json` 与 Codex 兼容清单 `.codex-plugin/plugin.json`。固定源码将根清单与兼容清单分流解析；支持的技能根、MCP 和其他组成由清单解析器确定，应用不应只检查一个固定 `skills/` 路径。[清单分流与资源解析](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/manifest.rs#L230-L393)

市场可来自项目或用户 `.agents/plugins/marketplace.json`、兼容目录及显式配置的来源。插件安装缓存与市场源目录是不同对象。官方文档给出的缓存布局是 `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`；本轮带 version 的本地插件实际安装到 `1.0.0` 和 `1.1.0` 子目录，不能把“本地来源”硬编码成 `local` 目录。插件 ID 应保留完整 `name@marketplace`。[官方插件打包与市场说明](https://developers.openai.com/plugins/build/plugins)

### 原生接口表

| 任务 | 已核验入口 | 结果与边界 |
| --- | --- | --- |
| 列插件 | `codex plugin list --json` | `{installed, available}`；默认 available 不包含未安装项 |
| 列可安装项 | `codex plugin list --available --json` | 支持 `--marketplace` 限定来源；不能假定完全离线 |
| 安装 | `codex plugin add name@marketplace --json` | 返回 pluginId、version、installedPath、authPolicy |
| 卸载 | `codex plugin remove name@marketplace --json` | 整包操作；返回身份，仍需检查缓存与有效列表 |
| 添加市场 | `codex plugin marketplace add SOURCE --json` | 修改市场配置；本地路径与 Git 来源需分别审查 |
| 刷新市场 | `codex plugin marketplace upgrade [name]` | Git 市场快照刷新；不是通用“升级所有已装插件”承诺 |
| 插件开关 | `config/value/write` 写 `plugins.<id>.enabled` | 本地 fixture 已验证整包技能退出／进入有效列表 |
| 技能列表 | App Server `skills/list` | 本机 schema 支持 cwds、forceReload，包含 enabled、scope、pluginId、errors |
| 技能开关 | App Server `skills/config/write` | 用户级；用准确文档 path，避免 name 扩大影响 |
| 原生配置读取 | `config/read` | includeLayers 提供文件版本与来源 |
| 原生配置提交 | `config/value/write`／`config/batchWrite` | 有 expectedVersion；本机只允许用户配置写入 |

CLI 调用链为 `cli/main.rs` 分派到 `plugin_cmd.rs`，再调用 `PluginsManager`。本地市场与远程目录走不同分支；远程分支涉及认证和服务端操作。JSON 成功输出不会替代失败时的退出码与 stderr 诊断。[入口](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/cli/src/main.rs#L1201-L1235)、[安装与列表](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/cli/src/plugin_cmd.rs#L137-L316)、[列表字段](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/cli/src/plugin_cmd.rs#L446-L519)、[卸载与认证上下文](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/cli/src/plugin_cmd.rs#L645-L757)

官方 App Server 文档将 `plugin/list`、`plugin/read`、`plugin/install`、`plugin/uninstall` 标为开发中，并明确要求生产客户端暂不调用。因此方案不能为了统一 JSON-RPC 而绕过该限制；技能和配置 RPC 与插件生命周期 CLI 可以并存。[App Server 方法说明](https://learn.chatgpt.com/docs/app-server)

还需注意接口版本差异：在线文档描述 `skills/list.perCwdExtraUserRoots`，而本机 0.162.1 生成的该请求 schema 只有 `cwds` 与 `forceReload`。同样，配置写请求包含 `filePath` 并不表示允许写任意配置层；实际项目路径被原生服务拒绝。能力判断应核对 schema 和执行契约，不能仅看参数存在。

### 更新语义

本地市场 fixture 从 `1.0.0` 改为 `1.1.0` 后，`plugin list --json` 仍报告已安装版本 `1.0.0`；显式再次执行 `plugin add` 才得到新缓存、新版本和新内容。此结果只证明该本地来源案例，不证明 Git、npm、远程目录同样支持无损更新，也未证明重新安装保留禁用状态或用户缓存修改。

`marketplace_upgrade.rs` 的核心行为是获取 Git revision、准备新市场快照、校验名称、激活快照；其本身不是逐技能更新器。[市场刷新实现](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/marketplace_upgrade.rs#L225-L298)

因此应把“刷新市场”“检查插件版本”“重新安装插件”分开。缺少候选版本证据时显示未知，不把安装版本当最新版；未知辅助历史也不能永久阻止用户明确确认的原生命令。整包重装需列出技能及其他组件影响，并独立验证内容和启停状态。

## App 与 CLI 的共同点及边界

| 维度 | CLI 已确认 | 桌面 App 方案边界 |
| --- | --- | --- |
| 配置根 | 支持明确 CODEX_HOME；本轮临时根有效 | 不假定桌面进程继承相同 shell 环境；需单独确认使用根 |
| 技能加载 | 用户／仓库／系统／管理员／插件来源 | 桌面可能附加进程级技能根，外部 CLI 不一定完整看到 |
| 插件 | 本地市场原生命令已实测 | 受管理、远程、内置插件不能靠缓存路径推断所有权 |
| 变更生效 | 本轮新建 stdio 服务、forceReload 后可见 | 不能宣称已改变正在运行的桌面会话；不自动重启 App |
| 会话覆盖 | 源码支持 SessionFlags 覆盖用户规则 | 外部服务快照不包含另一个会话的全部覆盖 |
| 安装证据 | CLI 二进制及版本可独立验证 | 当前项目 App 检测只认 Codex.app；产品包装变化应单独核验 |

本轮没有读取真实用户认证文件，没有调用真实账号插件安装／卸载，也没有通过桌面私有数据库或解包 UI 寻找写入口。当前聊天提供的内部 App 工具不是 Skills Space 可依赖的公开接口。

## 隔离验证结果

所有写入均发生在临时 HOME、CODEX_HOME、临时 Git 项目和自建本地插件中。没有创建模型 turn、没有发送推理请求，也没有执行下载的仓库代码。使用的是用户已安装的原版 Codex。表中“观察到”限定为接口和磁盘状态，不等于模型执行验证。

| 案例 | 观察结果 |
| --- | --- |
| 自定义 HOME 与 CODEX_HOME | 两类用户技能均可发现；内置技能写入临时 `.system` |
| 仓库根／子目录技能 | 两者发现；仓库外祖先技能未混入 |
| 用户文档路径禁用 | 返回 false，重读 enabled=false；启用后恢复 true |
| 用户目录路径禁用 | 返回 false，但重读 enabled=true；确定存在写入成功与效果不一致 |
| 两个路径同名 | 同时列出；name 禁用后两者均为 false |
| 项目层技能规则 | config/read 可见规则，skills/list 不采用；补读源码确认仅 User／SessionFlags 适用 |
| 项目信任 | untrusted 时 config/read 提供 disabledReason；技能列表仍有项目条目，不能用信任状态过滤已安装库存 |
| 项目配置 API 写入 | 拒绝，`configLayerReadonly`，Only writes to the user config are allowed |
| 过期配置版本 | 拒绝，`configVersionConflict` |
| 项目链接指向全局文档 | 原生结果按真实路径保留一份；物理项目链接需独立记录 |
| YAML 与 JSON 元数据同时存在 | 原生接口展示 YAML Fixture，不能声称 JSON 优先 |
| 添加本地市场与插件 | 原生命令成功；两个插件技能带 `demo:` 前缀及 `pluginId=demo@fixture` |
| 插件禁用 | installed 仍为 true，enabled=false；其技能从有效列表退出 |
| 本地插件版本变更 | 源变更后列表仍为旧安装版本；显式 add 后安装版本与缓存正文变新 |
| 插件卸载 | 原生命令成功；已安装列表为空 |

复核命令包括 `codex --version`、各子命令 `--help`、`codex app-server generate-json-schema --experimental --out <temporary-directory>`，以及初始化独立 `codex app-server --stdio` 后的上述 RPC。最初项目只有 `.git` 标记而非完整 Git 仓库；随后使用真实临时 Git 仓库复核，项目配置层与兼容目录结论以后一轮为准。

上游测试已阅读，未执行：技能规则的 session 覆盖、路径／名称顺序测试，CLI 参数解析测试，插件配置候选收集测试。没有把阅读测试算作测试通过。[规则测试](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/config/src/skills_config_tests.rs#L88-L240)、[CLI 测试](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/cli/src/main.rs#L3448-L3528)、[插件配置测试](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/toggles.rs#L45-L100)

## 获取记录与未验证项

初始源码获取限制为单仓库、每文件 200 KiB、总量 2 MiB、20 次请求。沙箱 DNS 请求失败后切换经许可网络；匿名 REST 返回主配额耗尽后停止该路由，通过有界 git 引用查询与固定 SHA raw 文件继续。若干旧模块路径为 404，未把缺失解释为功能不存在。用户选择自行登录后，`gh auth status` 联网验证通过；明确补查三个目录与八个文件，源码内容总量仍低于 2 MiB。所有成功获取文件均固定在同一 SHA，无仓库克隆、无依赖安装、无上游构建。

仅临时证据保留在 `/tmp/codex-adapter-research`，包括源码、生成 schema、fixture 脚本和结果；它不是项目运行依赖，系统清理后可按本文接口和固定链接复核。测试插件已原生卸载，临时目录未自动删除。没有读取或输出 GitHub token。

尚未验证：桌面 App 版本与 CLI 的对应关系、真实桌面会话热刷新、不同版本／操作系统、远程目录与工作区安装策略、OAuth、含 MCP／Hook 的插件执行、Git／npm 插件更新、点号等特殊插件 ID 的配置 keyPath 编码、批量配置在并发编辑下的完整行为。上述项不影响首批方案评审，但各自能力开放前需要对应验收。


## 四项反馈的最新核验（2026-10-21）

### App 截图与实际原生库存对账

用户提供的 App「插件」页为 4 项，另有 MCP 1、技能 2、市场 2。四个维度不能相加，也不能将所有技能缓存对应的插件都当作该页面中的用户插件。

只读执行原版 `codex plugin list --json`，返回 21 个已安装项：4 个用户插件、12 个本地隐式运行时组件、5 个远程默认组件。用应用实际解析函数对该 JSON 做显式样本测试，得到用户集合恰为以下四项（顺序不影响集合）。未修改真实插件状态。

| App 名称 | 原生 ID | 原生来源与状态 | Skills Space 行为 |
| --- | --- | --- | --- |
| Writing Style | `write-like-me@openai-curated-remote` | remote，已安装、已启用，AVAILABLE | 保留安装身份与开关状态；远程写操作置灰，可隐藏，无跳转 |
| GitHub | `github@openai-curated-remote` | remote，已安装、已启用，AVAILABLE | 同上 |
| ArkSpace | `arkspace@arkspace-dev` | Git 市场，本地插件内容，已安装、已启用 | 用户配置允许时整插件启停；本轮不扩展 Git 市场安装／卸载 |
| Mattpocock Skills | `mattpocock-skills@mattpocock` | Git 市场，本地插件内容，已安装、已启用 | 同上 |

名称显示优先使用当前原生已安装版本的 manifest `interface.displayName`。缺少 manifest 时保留原生名称，不以名称白名单补条目、不遍历缓存反推安装状态。缓存只能补充已确认安装对象的展示元数据。

### App 与 CLI 的能力及计数差异

| 对象 | Codex App | 原版 CLI／本次适配 |
| --- | --- | --- |
| 用户安装插件 | 截图显示 4 项，App 可提供自身的远程授权和管理流程 | CLI 全局 JSON 同样能返回远程安装记录；此前按本地市场查询漏掉远程项。不是 CLI 天生不支持远程 |
| 本地内置运行时 | 不计入截图四个用户插件 | CLI 返回 12 项。按官方 CLI 的隐式市场身份规则识别：市场名与相对目录后缀同时匹配，不绑定 HOME、App 版本或安装路径 |
| 远程默认组件 | 截图未列为四个用户插件 | CLI 返回 5 项，安装策略为 `INSTALLED_BY_DEFAULT`；单独放入“内置／默认组件”，不计入用户安装插件 |
| 可安装目录 | App 有“浏览目录”，内容受账号、权限与环境影响 | CLI `--available` 明确纳入未安装项。本轮只保留已资格验证的本地可安装项，不把整个远程目录铺到安装库存 |
| 独立技能 | 名称、路径规则与所属插件的整体状态共同影响可用性 | 插件开启时，user/repo 技能可按原生 SKILL.md 路径单独开关；整插件关闭时不能通过技能开关反向开启插件 |
| 进程／账号差异 | App 当前账号、配置根、运行时注入和正在运行的会话 | CLI 由发现的可执行文件、配置根及认证决定。相同配置根不等于当前 App 会话已热加载；不同账号／目录不能承诺计数相同 |

研究样本 `plugin/list` RPC 返回的默认来源为 `IMPLICIT_CANONICAL_APP`，可用于解释该样本；**产品不调用该 RPC**。[官方 App Server 文档](https://learn.chatgpt.com/docs/app-server) 仍明确标记其为开发中、暂不供生产客户端调用。产品只用公开 CLI JSON 中的安装策略区分远程默认组件；该字段不具备 RPC 的细分来源信息，不能据此断言其他组织／账号的默认策略都是 App 隐式配置。

原版 CLI 的全局列表可能因远程网络问题返回本地子集并附诊断。应用保留可证实的本地结果，将读取标记为不完整，缺失旧项保留为不可操作状态；不解析终端文案构造插件状态。全局目录冷读取样本约 78 秒，应用为该只读调用单独设置 120 秒有界超时；超时保留本地已核实项和不完整提示。失败不改变普通技能的生命周期权限。

依据：[原版 CLI 列表／隐式市场实现](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/cli/src/plugin_cmd.rs)、[官方技能说明](https://learn.chatgpt.com/docs/build-skills)、[App Server 接口边界](https://learn.chatgpt.com/docs/app-server)。本机只是行为验证样本；上述 ID 只用于本节对账和显式样本验证，不进入产品白名单。

## 哈希、安装版本与更新机制补充核验（2026-10-21）

本节回答“Codex 原生有没有 hash、如何检查更新”，并覆盖此前将未知版本简单隐藏的建议。以下是调研结果与待批准实施方案，不表示项目已实现原生更新。已批准的图标位置、详情显示名称和移除详情启停独立交付。

### 证据与边界

本轮重新获取官方文档、固定公开提交 `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d` 的文件，并运行原版 CLI 0.162.1 的临时 HOME fixture。这个版本只是可复现样本，不是适配版本白名单。完整桌面 App UI、账号后端及其调度策略没有全部公开；不能把公开 App Server 核心的行为当作所有桌面发行版和账号的实测行为。未操作真实插件、未调用私有后端，未运行生产受限的插件 RPC。

### 四种不同的身份与版本证据

| 数据 | 官方／项目实际含义 | 能否直接判断远端更新 |
| --- | --- | --- |
| 独立技能 `skills/list` 元数据 | name、description、interface、path、scope、enabled、pluginId；固定协议没有安装 hash、安装版本、远端版本字段 | 不能。缺少字段不是“文件没有哈希”，而是原生列表没有提供安装基线与更新契约 |
| 插件安装版本 | 已安装缓存的版本标识；通常源 manifest version，部分兼容包缺失时为默认值，远程包为服务端 release.version | 需要独立取得候选发布版本后比较；安装版本本身不是最新版 |
| Git revision／精选插件缓存 SHA | 某些精选 Git 插件以仓库 commit 的前 8 位作为缓存版本；市场快照另有 Git revision | 是仓库／快照版本证据，不是每个技能目录的内容哈希；不能将任意 8 位字符串都认定为技能 hash |
| 本地内容指纹 | Skills Space 在详情读取时对有界、排序的路径与内容序列计算 SHA-256；排除 .git、node_modules，遇不支持的符号链接／限额返回不可核实 | 可以检测两次内容差异；没有安装基线／候选来源时，不能断言“本地被修改”“发现更新”或“已是最新” |

固定协议：[SkillMetadata](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server-protocol/schema/typescript/v2/SkillMetadata.ts)。缓存版本：[installed.rs](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugin-common/src/installed.rs#L10-L68)、[精选 SHA 处理](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/loader.rs#L436-L497)。

源码确实使用 SHA-256，但不能见到 hash 就当作技能更新机制：PluginStore 的数据目录哈希取自市场名与插件名；兼容版本字符串不适合做路径时，对版本字符串哈希；这两处都不是技能内容基线。远程 `.codex-remote-plugin-install.json` 保存 schema_version 与 remote_plugin_id，不保存技能目录 hash。[store.rs](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/store.rs#L125-L137)、[版本字符串处理](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/store.rs#L425-L448)。

### App 与 CLI 逐项对照

| 对象／动作 | Codex App／公开 App Server 核心 | 原版 CLI／可供项目采用的证据 |
| --- | --- | --- |
| 独立本地技能 | 加载本地技能元数据；目前未找到官方承诺的通用技能远端更新 API | 原生技能列表不提供安装基线；通过 skills CLI 安装的技能仍由其原有来源／锁记录管理，不能因运行端是 Codex 就转为无来源技能 |
| 本地／Git 来源插件 | 核心提供 IfVersionChanged 缓存刷新；相同版本会跳过，也有强制重新安装路径 | `plugin list --available --json` 的 available 是未安装项，并不是所有已安装插件的候选最新版；必须独立读取来源 manifest／已刷新的市场快照 |
| Git 市场升级 | 取得远端 revision、准备并激活市场快照，具体客户端可能另行调度缓存刷新 | `plugin marketplace upgrade --json` 是有写入的市场刷新，不能包装成无副作用的“仅检查”；也不能仅凭市场升级成功断言每个插件／技能已升级 |
| 远程插件 | 核心对经认证安装快照中的 release.version 与本地 active version 比较，相同则跳过包下载；不同则物化新包，并处理相关运行时刷新 | CLI JSON 折叠了部分安装／候选字段，远程项优先 localVersion；单靠这一字段不足以给出可靠更新提示。项目不得直接调用私有远程后端 |
| 内置／默认运行时组件 | 可能随宿主运行时或官方远程发布同步；与用户独立安装项不同 | 不在技能卡片上逐技能覆盖内置文件，不把 Agent 软件更新等同于插件更新 |

源码：[本地插件版本比较](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/loader.rs#L660-L699)、[CLI 版本映射](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/cli/src/plugin_cmd.rs#L401-L432)、[远程版本同步](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/remote/remote_installed_plugin_sync.rs#L215-L280)、[市场升级](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/marketplace_upgrade.rs#L225-L298)。

官方 App Server 文档明确区分远程 version、本地 localVersion，并仍禁止生产客户端调用 plugin/list、plugin/read、plugin/install、plugin/uninstall。源码中的 plugin/reconcile 还涉及下载／缓存与 Hook 信任和运行时处理；它不是无副作用的更新检查接口，不因源码可见就纳入生产接入。[App Server 文档](https://learn.chatgpt.com/docs/app-server)、[reconcile 实现](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/app-server/src/request_processors/plugins/reconcile.rs#L15-L85)。

发布者上传新 ZIP 并发布会产生／替换插件包版本；这是发布机制，不证明消费者桌面何时更新缓存。MCP 服务端工具扫描又是另一条更新通道，不等于技能包升级。[官方发布更新说明](https://developers.openai.com/plugins/deploy/submission#update-your-published-plugin)。本轮没有证据支持“所有 App 插件自动更新的固定周期”或“App 有可对外复用的统一只读检查更新 API”，这两项保持未确认。

### 本轮可复现实验

原版 CLI，临时 HOME／CODEX_HOME，本地测试市场，无账号凭据、模型调用及真实插件写入：

| 步骤 | 观测 |
| --- | --- |
| 安装源版本 1.0.0 | 已安装版本 1.0.0 |
| 源内容改变但版本仍为 1.0.0，再 list | 安装版本仍为 1.0.0，缓存 SKILL.md 哈希不变 |
| 源升到 1.1.0，再 list | 安装版本仍为 1.0.0，缓存哈希不变 |
| 先停用整包，再执行 plugin add | 安装版本变为 1.1.0、缓存内容改变，但整包 enabled 变为 true |
| 同时保留名称级技能停用规则 | add 后该规则仍存在；不能据此证明旧版本目录的路径规则自动迁移 |

实验脚本／结果保存在 `.scratch/codex-update-research/probe.py`、`probe-result.json`，不是生产实现。验证的是本地来源路径，不外推 Git/npm/远程包全部具备相同保留行为。

### 项目可落地方案（待批准实施）

**数据口径与详情。** 在现有 Codex 原生快照／详情模型中明确区分 `installedVersion`、`candidateVersion`、`currentContentFingerprint`、`baselineContentFingerprint`、`sourceRevision` 和检查结果，不复用一个 version 字段装不同含义。仅实现当前来源需要的字段；本地内容指纹沿用现有有界算法，不创建第二套生命周期后端。运行时能力和身份通过公开命令／schema 及实际结果核验，不固定本机版本或路径。

详情保留原信息布局：插件技能显示“插件版本”；本地内容指纹标为“内容指纹”，可查看完整值。没有插件版本时不伪装成未知发布版本，也不把内容指纹标成发布版本。与其他 Agent 共用物理技能时按当前 Agent 上下文选择元数据，保留原内部 name／path 身份。完整字段与更新机制一起落地，本轮不以隐藏未知字段宣称完成。

**独立技能。**

- 有原版 skills CLI 来源与锁记录：继续复用现有检查更新、差异、确认和原版 CLI 更新，不转入插件生命周期。
- 仅本地目录：可展示内容指纹；没有上次基线时只说明当前内容，不能显示“已修改”。若确有现有本地同步关系，复用同步来源比较；否则没有可声明的远端更新目标，不新增自动来源猜测或默认 Git pull。
- 仅因为位于 Git 仓库中，不代表应用拥有该仓库或可更新整个仓库。若将来接入只读候选检查，须取得明确仓库、相对技能路径、跟踪 ref，比较该子目录而非整个仓库 HEAD；写入仍需要单独的已批准生命周期路径。
- 内置／管理员技能保持只读，来源版本缺失时报告未提供，不能调用通用更新覆盖系统文件。

**插件技能。** 更新单元为插件，入口位于插件 Tab，技能详情只提供对应版本和所属插件定位；不得逐技能重装或将同包技能列为多个独立更新任务。

1. 首批只接入已验证的本地市场插件：只读比较当前安装版本／内容与来源 manifest／内容，明确来源为当前本地目录，不冒充远程最新版。
2. Git 市场：将“刷新市场”和“检查插件”分开。可先比较当前市场快照；需要最新远端时显式执行官方 marketplace upgrade，再核验市场 revision 和候选插件。首批实施前增加原版 CLI Git fixture，验证升级、配置保留、市场名冲突和失败恢复，不仅复用本地案例。
3. npm／包注册表：仅安装字段不够；需核实原生包来源、版本选择器及完整性合同。本轮不开放“更新”按钮，也不自己实现 npm 插件安装后端。
4. 远程目录及 App-only 组件：身份、安装版本可证实时展示；无法通过合格公开接口取得候选版本时状态为“无法检查”，相关操作置灰并支持隐藏，不跳转官方 App，不调用私有接口或猜测最新版。

**检查结果。** 使用互斥语义：尚未检查、与已核实来源一致、发现新发布版本、来源内容变化但版本未变、无法检查、源已移除。失败／缺失不能显示已是最新。版本标识非 SemVer 时不自行认定大小；若只能确认不一致，展示不一致而非强称升级。

**更新执行与保留。** 复用现有整包确认流程，列出插件和关联组件影响；原版 CLI add 作为本地已验证的安装动作，不直接改缓存。执行前记录整包启停和相关技能规则；成功后重读安装版本、内容与有效状态，恢复用户原整包停用状态。路径规则含版本目录时，按已核实的旧／新插件相对技能路径迁移，保留名称规则、无关规则和并发更改；若映射不明确，不默默丢弃。源版本、安装指纹或配置 revision 在确认后变化，重新核验再执行。

若已有安装基线且发现缓存本地修改，沿用差异／确认机制，不自动覆盖；缺少历史基线仅能称状态未确认，不能假设干净，也不能永久阻止用户明确确认的整包重新安装。安装失败、规则恢复失败、内容验证失败分别报告，不以命令退出码单独宣称完整成功。成功后记录经过核验的新基线。

**性能与位置。** 列表首次打开仅本地库存；完整插件目录和更新检查仍按需执行，不重新加入全局／项目 Agent 加载关键路径。哈希在详情／检查任务中计算；同次检查内复用结果，不每次 React 渲染或每张卡片同步扫描。沿用原 Card、信息提示、版本行与确认弹窗；无基线条款变更。

### 实施与验收顺序

| 顺序 | 交付 | 必须验证 |
| --- | --- | --- |
| 1 | 分离版本／内容指纹／来源 revision，详情按真实含义展示 | 无版本、同版本不同内容、hash 相同、非 SemVer、只读内置、Agent 上下文隔离；不改托管技能差异合同 |
| 2 | 本地插件只读检查与现有插件 Tab 状态 | 检查前后配置与缓存字节不变，离线／源消失不标为最新，重复技能不重复任务 |
| 3 | 本地整包更新与规则保留 | 原先停用保持停用；新缓存路径迁移单技能规则；同名技能、用户修改、并发变更、部分失败、重启持久化 |
| 4 | Git 市场来源扩展 | 官方市场刷新与安装分别核验，快照 revision、版本未提升但内容变化、Git 失败／回滚；不得伪装无副作用检查 |

远程私有更新和 npm 插件更新不混入上述可验收首批。此方案补齐实际更新语义，不是仅隐藏未知字段；实施范围需据此确认，本轮仅完成既定三项 UI 修正与研究。

### 首批实施状态（2026-10-21）

后续用户已明确批准并实施上表第 1—3 项的本地范围，状态以 [spec 0010](../specs/0010-codex-skill-plugin-management.md) 的“本地插件检查、整包更新与内容指纹”小节为准。哈希是 Skills Space 按既有有界目录算法计算的 SHA-256（相对路径与文件内容，沿用 `.git`／`node_modules` 排除及文件数／大小／符号链接边界），不是 Codex 官方提供的独立技能发布版本或插件完整性签名。只读检查不创建安装基线；首次明确确认更新并核验成功后才建立可比较基线。

原版 CLI 隔离扩展验证还覆盖同版本内容替换、配置恢复中断后重试、并发无关规则保留、规则冲突保留及失败后重新检查；macOS 路径别名须在安装前记录映射。Git／npm／远程 App 更新仍未实施。

## 管理能力复核：来源标签不等于操作权限（2026-10-22）

本轮依据官方[插件使用文档](https://learn.chatgpt.com/docs/plugins)、[插件配置文档](https://developers.openai.com/plugins/build/plugins)，以及固定修订 `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d` 的原版源码复核。版本仅是验证样本，应用不按本机版本或绝对路径绑定。

- `cli/src/plugin_cmd.rs`：公开 `plugin add/remove` 将 `openai-curated-remote` 转交原生远程生命周期；其余配置市场使用原生安装存储。此前把 GitHub、Writing Style 全部禁用是适配遗漏，不能用“来源不支持”概括。
- `core-plugins/src/loader.rs::merge_remote_plugin_config`：远程安装记录的 `enabled` 覆盖本地配置，仅继承本地 `mcp_servers`。`tui/src/app/background_requests.rs::write_plugin_enabled` 虽调用 `config/value/write`，该配置处理链不构成远程启停写接口。不能据此向用户承诺远程插件开关已生效。
- GitHub 与 Writing Style 在此前原生 CLI JSON 样本中的身份分别为 `github@openai-curated-remote`、`write-like-me@openai-curated-remote`，安装策略均为 `AVAILABLE`。原生 CLI 支持它们的安装／卸载；本轮不调用非公开服务、不复用桌面私有授权，不以卸载模拟停用。
- 官方文档允许本地市场插件通过配置启停，并说明默认／工作区插件可能不提供卸载动作。因此本地内置标签不能禁用开关；`INSTALLED_BY_DEFAULT` 只用于判断不可单独卸载，不能与远程来源或实际启停混为一谈。
- 安装策略与实际服务授权分开。已有安装记录不附加“授权未确认”推测。安装版本只表示原生接口返回的安装标识；更新检查必须有独立能力，不能复用卸载权限。

源码入口：[CLI 插件命令](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/cli/src/plugin_cmd.rs)、[加载与配置合并](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/loader.rs)、[TUI 写入](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/tui/src/app/background_requests.rs)。

## 完整目录、读取耗时与 Git 市场副作用复核（2026-10-22）

- 本机只读样本 `codex plugin list --available --json` 返回 3,547,591 字节，21 个已安装记录、7,914 个可安装记录，stderr 为空，约 0.94 秒。原适配器共用的 2 MiB 输出上限截断了合法 JSON，造成目录解析失败；不能将该失败归因于插件授权或安装异常。样本数量不是产品硬编码或通用断言。
- 普通 Agent 读取还对每个本地插件调用整包 `tree_signature`。移除列表阶段的内容扫描后，同机同路径观察到 Codex 读取约 1.88s → 0.78s，完整库存约 2.41s → 1.32s。版本/配置/manifest 身份校验仍保留；更新审查继续验证整包内容，性能数据不代表所有机器。
- 完整远程目录改为进入 Codex Agent 后异步读取，不阻塞已取得的技能列表；目录需要独立的较大有界输出容量。数千个条目需要分页而不能一次挂载所有卡片。
- `skills/list` 返回启停字段时直接使用原生状态。仅在已安装插件目录发现、但原生列表没有返回的技能，标记为“未载入当前 CLI”，不推断已启用、未授权或读取失败；插件停用时仍可确认其技能不生效。App 安装记录不等同于独立 CLI 已载入该技能。
- 原版 `plugin marketplace upgrade NAME --json` **不是纯来源刷新**。固定研究修订 `092d3acd6bec3e3a14bdc7e7a2810ab628ab759d` 的 [manager.rs](https://github.com/openai/codex/blob/092d3acd6bec3e3a14bdc7e7a2810ab628ab759d/codex-rs/core-plugins/src/manager.rs#L2941) 在刷新市场后调用 `refresh_non_curated_plugin_cache_force_reinstall_detailed`。隔离 Git 仓库实验也观察到调用后安装缓存立即出现新内容。因此不能把该命令放入单插件“检查”动作，否则未经整包确认就会更新同市场的其他插件。
- 当前安全边界：具有本地源内容的普通、内置和 Git 市场插件均可比较安装目录与当前来源副本；Git 明确显示“市场本地副本、未查询远端”。满足原生安装/配置策略时，可沿用已有确认流程按当前副本更新所选整包。默认策略只允许比较时不开放整包更新。远程服务组件没有可比较的本地源则不显示伪造的检查结果，动作提示说明接口边界。Git 远端最新版本检查及整市场升级不作为本轮已完成功能。


### 2026-10-22 已识别插件范围纠正

撤回全量市场目录读取。原版 `cli/src/plugin_cmd.rs::JsonPluginListOutput::from_marketplaces` 仅在 `include_available` 为真时输出未安装项；应用改用 `plugin list --json`，不请求全局 available。`run_plugin_list` 仍先调用 `fetch_remote_marketplaces`，因此不能宣称去掉参数即可让 CLI 内部完全不访问目录服务。应用将该调用限制在插件页面，Agent 本地读取不等待它。已安装计数只看 installed + installationKnown；未请求的 available 内容不进入快照。已识别远程插件卸载后的重新安装用当前进程内已核实身份及完整安装结果确认，实际操作仍由原版 CLI 裁决。此身份记录不跨应用重启持久保存。
