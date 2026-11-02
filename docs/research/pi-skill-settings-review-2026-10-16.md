# Pi 设置参数复核：技能管理范围

日期：2026-10-16。状态：只读调研与建议，未实施设置功能，未修改用户配置或技能文件。

## 版本与证据

本机 `/opt/homebrew/bin/pi --version` 返回 **1.2.0**。该入口链接至 `~/.pi/agent/bin/pi` 管理安装启动器，再根据 `install/current-version` 定位 `install/releases/1.2.0/node_modules/@earendil-works/pi-coding-agent`；包 manifest 同为 1.2.0。启动器所在前缀不能据此判为 Homebrew formula。只执行版本查询，未启动会话、模型、扩展或包管理操作。

本报告用官方 **v1.2.0 标签**文档与本机 1.2.0 的 `dist/core/{skills,package-manager,resource-loader,settings-manager,agent-session}.js`、交互模式实现交叉核实。标签比 main 明确，但本次未取得标签的提交 SHA，不宣称本机发行文件与某个源码提交逐字一致。官方网页已通过浏览工具读取；部分旧提交链接不可获取，未用它们代替当前证据。

前次 [Pi 全量调研](pi-agent-management.md) 的稳定版基线为 1.1.0；其中本机 1.1.0 / 0.84.3 双安装记录已过时。本报告重新核实当前安装和技能合同，不重复其全量字段表，也不重新启动完整 Agent 管理扩展。

## 先区分四件事

| 能力 | 原生入口 | 实际含义 |
| --- | --- | --- |
| 安装、更新、卸载 | 上游 `skills` CLI，或原属 Pi 包的生命周期 | 改变磁盘内容和来源记录 |
| 启用、停用 | `settings.json` 的 `skills` / 包级 `skills` 过滤 | 决定技能是否进入 Pi 加载集合；停用后不再通过正常 `/skill:name` 名称查找使用 |
| 自动考虑、仅手动调用 | `SKILL.md` 的 `disable-model-invocation` | 已加载技能是否出现在提供给模型的技能目录中；仅手动调用仍可用 `/skill:name` |
| 命令发现 | `settings.json` 的 `enableSkillCommands` | 是否展示技能命令补全；关闭后手输 `/skill:name` 仍可使用 |

“停用”不会撤回已经进入历史会话的内容；“仅手动调用”也不是文件访问或安全隔离，模型依然可能通过其他上下文知道并读取文件。依据：[技能文档](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/skills.md)、[技能加载实现](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/src/core/skills.ts)、[命令展开实现](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/src/core/agent-session.ts)。

## 技能相关设置与优先级

| 项目 | 类型、默认与作用 | 当前 App |
| --- | --- | --- |
| 顶层 `skills` | `string[]`，默认 `[]`；附加目录、Markdown 文件、包含和排除规则，不是安装清单 | Pi 管理页已有附加目录及规则；卡片已有启停 |
| `enableSkillCommands` | boolean，默认 `true`；命令发现开关 | 暂无编辑控件 |
| `packages[].skills` | 包对象内的资源筛选；省略为包允许的全部，`[]` 为全部不加载 | 卡片启停可修改普通包级筛选；非完整包管理页 |
| `packages[].autoload: false` | 项目包条目作为全局同身份包的增量筛选 | 当前 App 保守地交给 Pi 调整，不假装普通数组规则等价 |
| `disable-model-invocation` | **SKILL.md frontmatter** boolean；`true` 时不进入自动路由目录 | 原生检测模型已读取为 `manualOnly`，UI 尚无专用调用模式控件；详情可看 SKILL.md 原文 |

设置依据：[资源设置](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/settings.md#resources)、[包资源筛选](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/packages.md#select-package-resources)。App 依据：`src/components/pi-management.tsx`、`src/lib/pi.ts`、`src-tauri/src/upstream/pi.rs`、`scripts/inspect-pi-skills.mjs`。

路径与规则应保留以下原生语义：

- 全局普通资源路径相对 Agent 配置目录（默认 `~/.pi/agent`）；项目路径相对 `<cwd>/.pi`，也支持绝对路径及 `~`。共享自动目录使用自己的 `.agents` 基准，因此精确规则优先用规范化绝对路径，避免同一相对规则意外命中多个目录。
- 默认扫描包括 Pi 原生目录、HOME 的 `.agents/skills`、受信任项目的 `.pi/skills`，以及从 cwd 向上至仓库根目录的 `.agents/skills`。空 `skills: []` **不会关闭默认目录扫描**，与包级 `skills: []` 含义不同。
- 普通筛选的有效顺序为包含 → `!glob` 排除 → `+path` 精确包含 → `-path` 精确排除；`-path` 优先级最高。不能解释为所有规则简单按文本先后覆盖。`autoload:false` 的增量规则另有按顺序应用的语义。
- 包级规则只能收窄包 manifest 已公开的资源，不能把未声明文件强行纳入。项目同身份包通常替代全局条目；`autoload:false` 是例外，保留基础包并施加增量。
- 正常配置资源的同名优先级：项目显式路径 → 项目自动目录 → 全局显式路径 → 全局自动目录 → 包资源。同级保持解析顺序；全局自动目录内，Pi 目录先于 HOME 共享目录。相同真实文件的链接先去重；不同文件同名只保留先发现者，并报告 winner / loser。
- 启动参数、SDK 附加资源和运行时扩展可以改变集合，App 根据磁盘设置推导的结果不等于探测了任意已运行 Pi 进程。

依据：[包管理与过滤源码](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/src/core/package-manager.ts) 的 `resourcePrecedenceRank`、`applyPatterns`、`applyAutoloadDisabledPatterns`、`addAutoDiscoveredResources`、`toResolvedPaths`；[资源加载器](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/src/core/resource-loader.ts) 的 `reload`；[技能名称去重](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/src/core/skills.ts) 的 `loadSkills`。

## 配置生效边界

全局设置位于 `<agent-dir>/settings.json`，项目位于 `<cwd>/.pi/settings.json`；项目资源需要 Pi 项目信任。普通标量通常项目覆盖全局，但资源集合由专门解析器组合，不能将普通 JSON 合并结果当成已加载列表。`PI_CODING_AGENT_DIR` / SDK 可自定义 Agent 目录。

手工或 App 修改资源与配置后，在相应 Pi 会话运行 `/reload`，或下次启动加载。App 保存后只能确认磁盘写入和重新推导成功，不能宣称已向外部 Pi 进程热更新。对技能，重载重建后续可用集合，不清除历史内容。对所有设置统一承诺“保存即生效”也不准确，例如启动模型、会话目录和工具集合有独立运行边界。

依据：[配置与目录](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/configuration.md)、[设置参考](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/settings.md)、[重载实现](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/src/core/resource-loader.ts)。

## 建议的最小补充

1. **可补一个“技能命令补全”开关**，绑定 `enableSkillCommands`；说明仅为“在 Pi 命令列表中显示技能”，不要叫“手动调用开关”。项目需能恢复继承，不能总把解析默认值写入文件。
2. **先完善只读状态**：明确当前目录、过滤来源、同名生效/覆盖路径、仅手动调用状态；已有部分能力继续统一，避免重复功能或增加卡片标签。
3. **暂不直接编辑仅手动调用**：它属于技能文件，不是 Pi 专属全局设置；改 HOME 共享版本会影响支持此字段的其他 Agent，也可能被上游更新覆盖。不应为单独控制 Pi 自动调用而自动制造同名副本。若以后需要写入，先设计影响范围与上游更新行为。
4. **包级复杂规则继续由 Pi 管理**：保留普通资源启停，但暂不增加包安装、插件更新、增量规则表单、模型认证或完整参数控制台。Pi 包的技能仍应遵循其原属生命周期，不能交给上游 skills CLI 假装托管。

这些是后续建议，本次不授权新增 UI 或修改用户配置。当前页已实现的附加目录、排除规则和卡片启停仍是主干。

## 其他常用参数概览

以下仅说明设置覆盖面，暂不纳入 Skills Space 页面：

| 分类 | 常用项 | 用途 |
| --- | --- | --- |
| 模型 | `defaultProvider`、`defaultModel`、`defaultThinkingLevel`、`enabledModels`、`modelThinkingLevels` | 启动模型、思考档位与轮换；凭证另属 auth / models，不读写于本报告 |
| 工具 | `defaultTools`、`codemode.mode`、`codemode.inlineBudget` | 默认工具与工具呈现；`defaultTools` 普通名称替换、`+/-` 增减，不是技能启停 |
| 上下文 | `compaction.enabled`、`reserveTokens`、`keepRecentTokens`、`branchSummary.*`、`sessionDir` | 压缩、摘要与会话目录 |
| 交互与终端 | `theme`、`tuiMode`、`quietStartup`、`autocompleteMaxVisible`、`fullscreen*`、`terminal.*`、`images.*` | Pi 终端和图片行为，不是 App 外观 |
| 网络 | `transport`、`httpProxy`、`httpIdleTimeoutMs`、`websocketConnectTimeoutMs`、`retry.*`、`cacheWarming` | 通信、重试和缓存；`httpProxy`、`cacheWarming` 仅全局 |
| 资源与执行 | `packages`、`extensions`、`prompts`、`themes`、`shellPath`、`shellCommandPrefix`、`npmCommand` | 扩展资源及执行环境 |
| 信任与数据 | `defaultProjectTrust`、`enableInstallTelemetry`、`enableAnalytics` | 项目信任与数据选项，应留给用户明确设置 |

依据：[v1.2.0 设置参考](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/settings.md) 及同版本本机随包文档、默认值实现。避免为方便表单而一次写回所有默认参数。

## 验证与限制

已核对：本机入口与版本、官方标签文档与关键解析源码、App 当前编辑边界和保存/启停实现。未读取 auth / models 或输出完整用户 settings；未修改配置、安装/更新/删除技能、调用模型或连接 MCP；未做运行时全量验证。本次仅新增研究文档，不需要构建应用。未发现依据可承诺 App 已覆盖 Pi 1.2.0 的全部运行时资源扩展行为；现有只读扫描器注释仍标 1.1，其技能核心规则本次逐点复核，不能据此宣称全版本适配。
