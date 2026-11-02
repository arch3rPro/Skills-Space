# Pi Agent 管理：配置、版本与原生能力深度调研

调研日期：2026-10-15。状态：固定源码的静态调研和产品建议，未实施。范围包括 Pi 本体版本检测与更新、配置、模型连接、资源、MCP、提示文件和运行入口；参考项目另见 [CC Switch 源码分析](cc-switch-agent-management-reference.md)。

范围修订（同日）：用户已撤回完整 Agent 管理扩展。本体更新、插件更新和通用参数仅保留为历史调研，不是当前实施范围；后文的首批管理建议已停止推进。技能相关结论继续作为参考，当前方向见[技能管理重新调研](skill-management-scope-review.md)。

后续范围核对（2026-10-28）：Pi 扩展包／插件生命周期已由用户单独批准并按 [spec 0006](../specs/0006-pi-skill-management.md) 实施，当前适配包括 1.4.0。本报告原先撤回的完整 Agent 管理、本体更新与通用参数仍不作为待开发任务；旧版本数据只保留调研日期下的事实。

## 1. 结论与版本依据

Pi 适合作为从技能管理扩展到 Agent 管理的首个完整样本，但不能把它建模成一个大 JSON 表单。配置分布在多个文件，存在全局、项目、启动参数、会话状态、认证和包管理等不同责任边界。App 应管理原生配置与操作入口，Pi 负责解析、认证、请求和运行。

| 对象 | 固定依据 | 使用方式 |
| --- | --- | --- |
| Pi 稳定分支 | `abe508e1b89912adde45528136c3221eb69acdd7`，包版本 `1.1.0` | 本报告的默认接口基线 |
| Pi main | `b06c1f2cf1dea6af8748ddeee18c23587d2cb7c6`，包版本 `1.2.0` | 识别前瞻差异，不能当作已发布稳定能力 |
| CC Switch main | `51ac86f1c59abfefabadebd05ec5a5415b8ad72c`，包版本 `4.0.12` | 参考实现，不作为 Pi 官方合同 |
| 本机当前 PATH 首选 | `~/.local/bin/pi` 指向用户目录 npm 包，manifest 为 `1.1.0` | 仅核对链接和包元数据，未启动 CLI |
| 本机另一安装 | `/opt/homebrew/bin/pi` 指向另一 npm 包，manifest 为 `0.84.3` | 说明必须按安装实例检测；位于 Homebrew 前缀不等于 Homebrew formula 安装 |

旧 `badlogic/pi-mono` 仓库已重定向到 `earendil-works/pi`。源码仅下载至临时目录进行阅读；未安装依赖、执行下载代码、访问用户认证文件或修改 Pi 配置。本机四份随包文档（settings/models/mcp/configuration）与固定稳定分支逐字一致；这不证明全部已安装 JS 与源码一致，也不证明运行行为。

稳定版 `Settings` 接口有 **55 个顶层字段**，包含对象和内部状态字段，不是 55 个适合展示给用户的开关。main 引入共享 defaults、类型 Schema 和生成的 JSON Schema；不能依赖 1.1.0 不包含的 Schema 文件来验证它。

固定入口：[稳定版 package](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/package.json)、[稳定版 settings 实现](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/settings-manager.ts)、[main Schema](https://github.com/earendil-works/pi/blob/b06c1f2cf1dea6af8748ddeee18c23587d2cb7c6/packages/coding-agent/src/core/settings-schema.ts)。

## 2. 配置文件与作用域

`<agent-dir>` 默认 `~/.pi/agent`，可由 `PI_CODING_AGENT_DIR` 或 SDK `agentDir` 改变。项目 `.pi` 相对于启动工作目录；不能自动等同于 Git 仓库根目录。

| 文件／目录 | 全局 | 项目 | App 管理含义 |
| --- | --- | --- | --- |
| `settings.json` | `<agent-dir>/settings.json` | `<cwd>/.pi/settings.json` | 偏好、模型默认项、资源声明；显示配置来源和覆盖关系 |
| `models.json` | `<agent-dir>/models.json` | 没有在该原生合同中发现同构项目文件 | 显式供应商和模型覆盖；项目可选择默认模型，不等于有项目供应商文件 |
| `mcp.json` | `<agent-dir>/mcp.json` | `<cwd>/.pi/mcp.json` | MCP 定义和局部覆盖 |
| `keybindings.json` | `<agent-dir>/keybindings.json` | 未建立项目级合同 | 原生动作到快捷键的映射 |
| `auth.json`、`mcp-auth.json` | 原生认证状态 | 不应复制进项目 | Pi 登录和令牌刷新负责；App 不应复制为自己的账户数据库 |
| `trust.json` | 全局存储信任决定 | 决定关联实际目录 | 与技能启停分离，不自动设为信任 |
| `SYSTEM.md`、`APPEND_SYSTEM.md` | 支持 | 支持 | 替换／附加系统指令；对应项目文件优先，同名文件不拼接 |
| `AGENTS.override.md`、`AGENTS.md`、`CLAUDE.md` 等 | Agent 目录 | cwd 和祖先目录 | 上下文文件；同目录 override 只替换同目录普通文件 |
| `skills/`、`extensions/`、`prompts/`、`themes/` | 支持 | 支持 | 不同资源类型，不能一律按技能包处理 |
| `.agents/skills` | 用户 HOME 下共享目录 | cwd 向上至仓库边界的共享目录 | 遵循 Pi 原生扫描、信任、冲突和过滤逻辑 |
| 会话 JSONL | 默认会话根或指定目录 | 按工作目录关联 | 会话树和使用量观察；相对目录必须有 cwd |

来源：[配置目录](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/configuration.md)、[安全与项目信任](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/security.md)。

### 覆盖规则不能简化为“项目覆盖全局”

- 普通设置由项目覆盖全局，嵌套对象递归合并；普通数组不是自动逐项合并。
- 资源解析器分别消费两层 `packages/extensions/skills/prompts/themes`，按包身份、路径和过滤规则合成，不能拿普通 JSON merge 结果充当实际加载列表。
- `defaultTools` 的纯 `+name/-name` 列表修改继承值；包含普通名称时改变替换语义。
- `defaultProjectTrust`、`cacheWarming`、`httpProxy`、`deviceId` 有全局专用行为，不应在项目表单提供看似有效的覆盖。
- 大多数项目配置和资源要求项目信任，但启动选会话前已读取 `sessionDir`；上下文指令文件也不以项目获信任为加载前提。
- 启动参数和当前会话可覆盖磁盘默认值。“保存成功”“下一次启动默认值”“当前运行值”必须分开。
- settings 使用 JSON 解析（支持 BOM），不能因为其他文件支持注释就统一写成 JSON5。`models.json` 有自己的注释预处理，MCP 也有独立解析器。

## 3. settings.json 完整字段盘点（1.1.0）

以下按源码接口、访问器和官方 reference 交叉整理。“原生决定”表示没有一个适用于所有 provider／终端／运行环境的固定默认值；未设置应保留继承，而不是把当前解析值全部写回文件。

### 模型、工具和上下文

| 字段 | 类型／默认 | 作用与管理注意点 |
| --- | --- | --- |
| `defaultProvider` | string；自动选择 | 新会话默认供应商，不代表当前会话 |
| `defaultModel` | string；自动选择 | 默认模型 ID，须与 provider 结合 |
| `defaultThinkingLevel` | off/minimal/low/medium/high/xhigh/max；通常 medium，按模型限制 | 不支持的档位会被约束 |
| `modelThinkingLevels` | 按 `provider/modelId` 的档位映射 | 单模型默认思考档位 |
| `thinkingBudgets` | 对象；原生预算 | 子键 `minimal/low/medium/high`，数值为 token 预算；不等于所有思考档位均支持预算 |
| `enabledModels` | string[]；全部可用模型 | 模型轮换范围，可含模式和思考后缀；不是供应商启停 |
| `defaultTools` | string[]；read/bash/edit/write | 普通名称替换，`+/-` 修改；空数组不等于整个进程没有扩展工具 |
| `codemode` | 对象 | `mode: on/only`（on），`inlineBudget: number`（3000）；控制工具呈现，不是 OS 沙箱配置 |
| `compaction` | 对象 | 自动压缩参数，见下表 |
| `branchSummary` | 对象 | `reserveTokens`（16384），`skipPrompt`（false） |
| `sessionDir` | string；原生会话目录 | 相对路径基于 cwd；环境变量与 CLI 可覆盖 |
| `cacheWarming` | off/streaming/idle；streaming | 仅全局；可能产生请求成本，不与 provider 缓存保留时间混为一项 |

| `compaction` 子字段 | 默认／约束 | 含义 |
| --- | --- | --- |
| `enabled` | true | 自动压缩 |
| `reserveTokens` | 16384 | 为响应预留 token |
| `keepRecentTokens` | 20000 | 保留近期内容 token |
| `modelOverrides.<provider/modelId>.reserveTokens` | 继承 | 按精确模型 ID 覆盖 |
| `modelOverrides.<provider/modelId>.keepRecentTokens` | 继承 | 与 reserve 独立解析；token 值需为非负安全整数 |

### 资源与执行环境

| 字段 | 类型／默认 | 作用与管理注意点 |
| --- | --- | --- |
| `packages` | 字符串或对象数组；[] | npm/git/local 来源；对象支持 `source/autoload/extensions/skills/prompts/themes` |
| `extensions` | string[]；[] | 扩展路径和排除；内置 `builtin:mcp`、`builtin:llama.cpp`、`builtin:codemode`、`builtin:tool-search` 另有默认加载规则 |
| `skills` | string[]；[] | 附加路径和原生过滤，不是“全部安装技能的登记表” |
| `prompts` | string[]；[] | 提示模板路径和过滤 |
| `themes` | string[]；[] | Pi 终端主题资源，不是 Skills Space 配色 |
| `enableSkillCommands` | boolean；true | 命令发现／注册相关行为；不能作为技能完全停用开关 |
| `defaultProjectTrust` | ask/always/never；ask | 仅全局兜底；CLI、扩展和已保存决定可能先于它 |
| `shellPath` | string；平台 shell | 执行 shell，可展开前导 `~` |
| `shellCommandPrefix` | string；无 | shell 命令前缀，具有执行效果 |
| `npmCommand` | string[]；npm | argv 形式的包查询／安装入口；不能当作任意 shell 字符串拼接 |

### 传输与重试

| 字段 | 类型／默认 | 含义 |
| --- | --- | --- |
| `transport` | auto/sse/websocket/websocket-cached；auto | 按 provider 支持选择传输；不等于 MCP transport |
| `httpProxy` | string；无 | 仅全局，影响 Pi 管理的 HTTP 客户端；不是 App 代理开关 |
| `httpIdleTimeoutMs` | number；300000，0 关闭 | HTTP header/body 空闲超时 |
| `websocketConnectTimeoutMs` | number；15000，0 关闭 | WebSocket 建连超时 |
| `retry` | 对象 | Agent 级和 provider 级重试分开，见下表 |

| `retry` 子字段 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | true | Agent 级自动重试 |
| `maxRetries` | 3 | Agent 级次数 |
| `baseDelayMs` | 2000 | 退避起点 |
| `maxAgentDelayMs` | 60000 | Agent 级等待上限 |
| `provider.timeoutMs` | 文档描述继承 HTTP 超时，接口允许缺省 | 请求层超时；实际 provider 使用情况需测试 |
| `provider.maxRetries` | 文档建议／有效默认 0 | 避免与 Agent 级重复重试；不同 provider 需核对 |
| `provider.maxRetryDelayMs` | 60000 | 服务端建议等待上限，0 关闭限制 |

### 交互、终端、图片与告知

| 字段 | 类型／默认 | 含义 |
| --- | --- | --- |
| `steeringMode` | all/one-at-a-time；one-at-a-time | 运行中 steering 消息处理 |
| `followUpMode` | all/one-at-a-time；one-at-a-time | 后续消息队列处理 |
| `externalEditor` | string；VISUAL、EDITOR、平台默认 | 外部编辑器 |
| `doubleEscapeAction` | tree/fork/none；tree | 空输入时双 Escape 行为 |
| `treeFilterMode` | default/no-tools/user-only/labeled-only/all；default | 会话树初始筛选 |
| `theme` | string；system | Pi 终端配色 |
| `quietStartup` | boolean 或 header；false | 启动信息可见性 |
| `hideThinkingBlock` | boolean；false | 隐藏终端思考块，不会关闭模型思考 |
| `showCacheMissNotices` | boolean；false | 缓存成本与恢复提示 |
| `tuiMode` | regular/fullscreen；fullscreen | 终端界面模式 |
| `fullscreenExitOutput` | transcript/resume-hint；transcript | 退出全屏时输出 |
| `fullscreenScrollbar` | auto/always/hidden；auto | Pi 全屏滚动条 |
| `fullscreenCopyOnSelect` | boolean；true | Pi 全屏选中复制 |
| `fullscreenWheelScrollLines` | auto 或 number；auto，数值 1–100 | 滚轮步长，auto 有平台差异 |
| `editorPaddingX` | number；0，0–3 cells | 输入框横向留白 |
| `outputPad` | 0/1；1 | 输出横向留白 |
| `autocompleteMaxVisible` | number；5，3–20 | 自动补全列表高度 |
| `showHardwareCursor` | boolean；false | 终端硬件光标，环境变量可参与 |
| `terminal` | 对象 | 图片和终端能力，见下表 |
| `images` | 对象 | `autoResize: true`、`blockImages: false`；处理发给模型的图片 |
| `markdown` | 对象 | `codeBlockIndent: "  "`、`mermaid: off/final/streaming`（streaming） |
| `warnings` | 对象 | `anthropicExtraUsage: true`；用量提醒 |
| `collapseChangelog` | boolean；false | 更新日志折叠 |
| `enableInstallTelemetry` | boolean；true | 安装／更新告知与 provider attribution 行为，受环境变量影响 |
| `enableAnalytics` | boolean；false | 可选分析数据，不等同安装 telemetry |
| `lastChangelogVersion` | string；内部生成 | 已读更新版本；只读保留 |
| `trackingId` | string；内部生成 | 分析标识；不作为普通编辑项 |
| `deviceId` | string；内部生成，仅全局 | 登录相关安装标识；不可随意重新生成 |

| `terminal` 子字段 | 默认／值 | 含义 |
| --- | --- | --- |
| `showImages` | true | 终端内显示图片 |
| `imageWidthCells` | 60 | 显示宽度 |
| `clearOnShrink` | false | 内容收缩时清除空白行 |
| `showTerminalProgress` | false | OSC 9;4 进度 |
| `hyperlinks` | boolean/auto；auto | OSC 8 能力覆盖 |
| `images` | kitty/iterm2/auto/false；auto | 图片协议；不是发给模型的图片开关 |
| `trueColor` | boolean/auto；auto | 真彩能力覆盖 |

来源：[完整 settings reference](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/settings.md)、[类型、默认访问器和迁移](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/settings-manager.ts)。main 的 `sessionShareDestination` 不在稳定版 55 项内；旧 `queueMode/websockets/skills` 对象格式及旧 retry 延时字段属于兼容迁移，不应新增为普通表单项。main Schema 可接受 `"disabled"` 的超时写法也不能据此宣称稳定版类型合同相同。

## 4. models.json：供应商、模型与认证

根结构是 `providers.<精确 providerId>`。显式配置、Pi 内置模型目录、扩展提供的模型、当前会话选中模型是不同数据源。不能把运行时合成目录全部写回 `models.json`。

| 层级 | 字段 | 意义与类型 |
| --- | --- | --- |
| Provider | `name`、`baseUrl`、`api` | 显示名、端点、协议，string；协议应按 Pi 支持的 API 识别，不能只看模型名称 |
| Provider | `apiKey`、`headers`、`authHeader` | string、string 映射、boolean；认证表达式与 Header 应保留原始语义 |
| Provider | `oauth` | 稳定版 Schema 此处只接受 `radius`；不等于所有 OAuth 都写这里 |
| Provider | `models` | 模型定义数组 |
| Provider | `modelOverrides` | 按 ID 修改已有模型元数据，未知模型 ID 不应凭空生成模型 |
| Provider／Model | `compat`、`headers` | 原生支持的兼容参数和 Header；按协议核实 |
| Model | `id`、`name` | ID 必需且非空，显示名可选；ID 不做模糊归并 |
| Model | `api`、`baseUrl` | 单模型协议／端点覆盖；不能误认为所有模型都使用 provider 同一地址 |
| Model | `reasoning`、`thinkingLevelMap` | boolean；各档位映射 string/null，缺失、空对象、null 含义不同 |
| Model | `input` | text/image 数组，不能单凭名称推断多模态 |
| Model | `contextWindow`、`maxTokens` | 上下文和输出容量，不可混用 |
| Model | `cost` | input/output/cacheRead/cacheWrite 及 tiers（inputTokensAbove 与对应费率） |
| Model | `promptCache` | short/long 秒数，声明可预期缓存时长 |
| Model | `inputLimits` | 请求字节、图片数量和 resize（maxWidth/maxHeight/maxBytes/jpegQuality） |
| Model | `samplingParams` | 任意采样键值映射，是否使用取决于协议 |
| Model | `samplingParamsByThinkingLevel` | off 至 max 的逐档采样参数映射 |

`modelOverrides` 可改 name/reasoning/thinkingLevelMap/input/inputLimits/cost/promptCache/contextWindow/maxTokens/samplingParams/samplingParamsByThinkingLevel/headers/compat；不能假设它支持完整模型定义里的每个字段，例如单独重写 id/api/baseUrl。

兼容字段需要高级配置入口，首版不宜全部变为开关：

- Chat Completions：`supportsStore/supportsDeveloperRole/supportsReasoningEffort/supportsUsageInStreaming/supportsFinishReason`、`maxTokensField`、`requiresToolResultName/requiresAssistantAfterToolResult/requiresThinkingAsText/requiresReasoningContentOnAssistantMessages`、`thinkingFormat/chatTemplateKwargs/chatTemplateArgs`、`cacheControlFormat`、`openRouterRouting/vercelGatewayRouting`、`supportsOpenAIGrammarTools/supportsStrictMode`、`sendSessionAffinityHeaders/sessionAffinityFormat`、`supportsLongCacheRetention/vllmPriority`。
- Responses：`supportsDeveloperRole/sessionAffinityFormat/supportsLongCacheRetention/supportsStrictMode/supportsOpenAIGrammarTools/supportsMaxOutputTokens`。
- Anthropic Messages：`supportsEagerToolInputStreaming/supportsLongCacheRetention/sendSessionAffinityHeaders/supportsCacheControlOnTools/supportsTemperature/forceAdaptiveThinking/allowEmptySignature/supportsStrictTools/supportsMidConvoEffort/allowedFallbackModels`。
- OpenRouter 路由嵌套字段还包含 allow_fallbacks/require_parameters/data_collection/zdr/enforce_distillable_text/order/only/ignore/quantizations/sort/max_price/preferred_min_throughput/preferred_max_latency；Vercel 为 only/order。保留结构，按 provider 验证，不做跨协议自动翻译。

认证优先级按官方说明为启动 `--api-key`、Pi 保存的认证、models 配置认证、环境／云原生认证，扩展可能定义额外行为。`apiKey` 和 Header 支持变量及 `!command`：浏览、列表和预览不得执行它们。App 未来若提供凭证输入，应先设计 OS 凭证引用与 Pi 原生表达式的桥接；不能直接照搬参考项目把密钥写入普通数据库。

来源：[模型连接与认证](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/models.md)、[models 解析 Schema](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/model-config.ts)、[表达式解析](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/resolve-config-value.ts)。

## 5. MCP：连接、启停与工具暴露

原生 `mcp.json` 根为 `mcpServers`，另有 `autoEnableCodemode`（默认 true）。支持 stdio 和 streamable HTTP，不支持旧 SSE。

| 类别 | 参数 | 说明 |
| --- | --- | --- |
| 通用 | `enabled` | false 保留配置但不连接；默认 true |
| 通用 | `timeout` | 秒，默认 60；进度通知可重置，不是 settings 的毫秒超时 |
| 通用 | `description` | 服务说明 |
| 通用 | `exposure` | codemode/deferred/direct/hidden；旧 codemode-deferred 为兼容别名 |
| 通用 | `toolExposure` | 工具名／模式到暴露方式映射；精确名优先，模式按原生匹配顺序 |
| stdio | `type/command/args/env/cwd` | type 可省略；command 是可执行文件，args 单独传递，cwd 相对会话工作目录 |
| HTTP | `type/url/headers` | http/streamable-http 或省略；Header 可含变量／命令表达式 |
| HTTP | `auth.provider` | 使用 Pi provider 登录令牌；禁止项目配置设置它，不由 App 复制令牌 |
| OAuth | `clientId/clientSecret` | 预注册客户端；secret 可引用变量／命令 |
| OAuth | `callbackPort/callbackUrl` | loopback 回调，port 1–65535；不能接受任意远程回调 |
| OAuth | `scope/clientName` | 授权范围和注册名称 |
| OAuth | `clientRegistration` | dcr/cimd；后者与部分其他字段存在互斥限制 |
| OAuth | `authServerMetadataUrl` | HTTPS 或 loopback HTTP；配置授权服务器元数据 |

项目完整同名条目替换全局；不含 command/url/type 的项目条目只能覆盖 `enabled/exposure/toolExposure`，保留全局连接和凭证。服务器名限字母、数字、下划线和连字符，`a-b` 与 `a_b` 有命名空间冲突。

原生命令支持 `pi mcp add/remove/list/login/logout`，add/remove 默认全局，`--local` 写项目。`list --json` 会连接启用服务，不是纯文件读取：可能启动 stdio 子进程并发起网络请求；不要作为 App 自动打开页面时的无副作用状态探测。OAuth 由 Pi 保存和刷新。配置改动后按原生 `/reload` 生效。

来源：[MCP 文档](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/mcp.md)、[类型和验证](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/mcp-servers.ts)、[配置加载与局部覆盖](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/extensions/mcp/config.ts)。

## 6. 技能、扩展、包与提示文件的管理区别

1. 技能原生停用可使用资源过滤：`!pattern` 排除模式，`+path` 精确包含，`-path` 精确排除。相对路径有不同 baseDir，优先考虑明确定位后生成的精确规则，而不是按技能名过滤。
2. 全局、项目、自动发现、包内资源和显式 CLI 资源经过不同解析路径。项目规则不能未经验证就宣称能停用任意全局技能；CLI `--skill` 可显式加入，`--no-skills` 也不排除这些显式路径。
3. `enableSkillCommands` 不等于完整停用；`disable-model-invocation` 是保留手动调用的策略。优先写 Pi 配置过滤，避免修改多个 Agent 共享的 SKILL.md。
4. 同一物理文件经链接重复出现会去重；不同文件同名时出现 winner/loser 冲突诊断，App 不应把每个副本都标为生效。
5. Pi 包可同时含 extensions/skills/prompts/themes。用 `pi install/remove/update` 管理 Pi 包；`pi config` 选择包资源。单个技能停用不能导致整个包卸载；技能通过上游 skills CLI 安装时，继续保留原来的生命周期后端。
6. `SYSTEM.md` 是替换，`APPEND_SYSTEM.md` 是附加，AGENTS 是目录上下文，`prompts/*.md` 是显式命令模板，四者不能只合成一个“提示词开关”。

来源：[技能加载](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/skills.ts)、[资源解析和过滤](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/package-manager.ts)、[包](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/packages.md)、[模板](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/prompt-templates.md)。

## 7. Pi 本体版本检测、检查更新与执行更新

用户已明确将此能力纳入 Pi Agent 管理方向；不把它降级为只读配置管理。以下仍是设计研究，未执行更新。

### 安装实例与检测

- 枚举候选入口，保留实际可执行路径、链接目标、runtime、包名称／版本、安装来源、配置根和 PATH 优先级。当前使用版本与其他发现版本分别展示。
- 本机两个实例证明不能只读取固定 `/opt/homebrew` 或 `~/.local`。也不能只执行 PATH 中的 `pi update`，导致更新另一套安装。
- 未来用明确选中的入口执行 `--version` 并设置超时；与 manifest 证据不一致时显示异常。默认打开页面只做本机检测，联网检查由用户触发，缓存结果带检查时间。
- 新版本检查可参考官方 `https://pi.dev/api/latest-version`，返回 version/packageName/note；使用语义版本比较。稳定、预发布和开发构建不得按字符串大小判断。main 的 package 版本不是最新正式发布的证明。
- 官方检查实现有 10 秒默认超时，处理 `PI_OFFLINE`，启动自动检查还处理 `PI_SKIP_VERSION_CHECK`。App 的检查策略要明确，失败显示无法检查，保留旧结果时间，不显示已是最新。

### 原生更新入口与影响

| 操作 | Pi 1.1.0 原生入口 | 边界 |
| --- | --- | --- |
| 更新 Pi 本体 | `pi update` / `pi update --self` | 默认更新本体，不是扩展包 |
| 更新全部 Pi 包 | `pi update --extensions` | 不是所有通过 skills CLI 安装的技能 |
| 更新一个 Pi 包 | `pi update <source>` | 依来源和固定 ref 行为 |
| 刷新模型目录 | `pi update --models` | 不等于升级 Pi 或替换 models.json 自定义配置 |
| 一并更新 | `pi update --all` | 本体与包，不能作为普通“更新 Pi”的默认行为 |

| 安装方式 | 原生实现／建议 |
| --- | --- |
| pi.dev managed installer | 原生识别 managed marker；分阶段安装、验证版本，再切换 current-version，保留当前和运行中版本；优先调用原生更新，不由 App 重写安装器 |
| npm/pnpm/yarn/bun 全局包 | 原生按方法、全局根、写权限生成对应更新命令；App 以选定实例为目标，不强制转换安装方式 |
| Nix／外部包管理器／源码或未知包装 | 不推断为可自更新；确认来源后使用原安装方更新，尚未支持时给出准确入口 |
| Windows | 普通自更新原生仅支持 npm/pnpm；managed 分支单独处理；不能把 macOS 路径推到 Windows |
| 独立编译二进制 | 当前普通包管理更新分支不生成通用自动更新命令；按发布分发合同另行验证，不承诺任意覆盖即可更新 |

native `getSelfUpdatePlan` 会取最新发布版本并固定 install spec；managed 安装不支持 `--force`，需要修复时原生要求重跑安装器。不能在 App 中统一暴露一个无条件强制更新开关。保留官方自更新的依赖固定和安装方式判断，不另写下载解包引擎。

未来执行流程建议：选择实例 → 检查版本与来源 → 展示目标版本、实际入口、更新范围和生效方式 → 明确执行 → 重新解析同一安装入口及当前 PATH 首选 → 核验版本和配置兼容性。更新失败保留真实错误；更新后另一旧实例仍在时如实显示。现有会话不会因磁盘文件更新就自动变成新进程；更新运行中的安装应独立评估，不自动终止用户会话。不承诺所有安装方式都能回滚。

来源：[命令接口](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/cli.md)、[官方版本检查](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/utils/version-check.ts)、[安装方式与权限判断](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/config.ts)、[本体／包更新执行](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/package-manager-cli.ts)。

## 8. 快捷键、环境变量与运行入口

`keybindings.json` 是原生动作 ID 到 string/string[] 的映射；空数组解除该动作绑定，未设置继承默认。包含 tui.* 编辑／导航和 app.* 模型／会话等动作，动作集合须随版本取值，不把终端实际无法传递的组合显示为保证可用。修改后 `/reload`。完整动作和默认键位见[固定版快捷键参考](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/keybindings.md)。

环境变量按用途分开：

| 类别 | 关键变量 | App 边界 |
| --- | --- | --- |
| 根目录 | `PI_CODING_AGENT_DIR/PI_CODING_AGENT_SESSION_DIR/PI_PACKAGE_DIR` | 关联选定实例和启动配置，不改用户 shell 全局环境 |
| 网络和版本 | `PI_OFFLINE/PI_SKIP_VERSION_CHECK/HTTP_PROXY/HTTPS_PROXY` | 展示实际启动环境，不把桌面进程环境当成终端环境 |
| 缓存／统计 | `PI_CACHE_RETENTION/PI_TELEMETRY` | 与 settings 重叠时按原生规则解析 |
| 终端 | `PI_HARDWARE_CURSOR/PI_CLIPBOARD_OSC52/PI_HYPERLINKS/PI_PROGRAM_STATUS/PI_IMAGE_PROTOCOL/PI_TRUE_COLOR/PI_TUI_ESC_TIMEOUT` | 仅影响对应 Pi 进程 |
| 编辑／分享 | `VISUAL/EDITOR/PI_SHARE_VIEWER_URL/PI_RADIUS_GATEWAY` | 后两者有数据传出目标含义 |
| 凭证 | provider 的 API key／云认证环境 | 不自动读取值、导入 App 数据库或写进项目 |
| 运行态输出 | `AI_AGENT/PI_CODING_AGENT/PI_SESSION_ID/PI_SESSION_FILE/PI_PROVIDER/PI_MODEL/PI_REASONING_LEVEL` | 部分由 Pi 注入子进程，不是用户配置项 |

原生实现还使用 managed installer 的内部变量，例如 `PI_INSTALLER_API_BASE`；它们属于实现／测试边界，不作为首版普通设置项。环境参数完整公开列表见[固定版环境参考](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/environment-variables.md)。

运行入口分 interactive、print、JSONL、RPC；SDK 是嵌入方式，不是 CLI 参数。未来 App 发起任务优先隔离的进程边界，不能为显示配置就启动可加载扩展的完整 Agent。关键启动组选项包括 provider/model/thinking/models/api-key、session/continue/resume/fork/session-dir/no-session、tools/exclude-tools/no-tools/no-builtin-tools、extension/skill/prompt-template/theme 及各类 no-*、system-prompt/append-system-prompt/no-context-files、approve/no-approve。临时参数不能伪装为已经持久保存的配置。

RPC 能更改模型和操作会话，但不自动连接任意已运行的外部 Pi。JSON 模式不保证模型失败时进程非零；RPC prompt 成功只表示接收，`agent_settled` 才是自动工作结束边界。不得仅按 exit 0 或 prompt response 成功报告任务完成。来源：[CLI integration](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/cli-integration.md)、[RPC](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/rpc.md)。

## 9. 从技能管理扩展到 Agent 管理的建议

以下是供讨论的产品边界，不是新页面实施授权：

| 管理面 | 建议首批范围 | 留给 Pi／后续 |
| --- | --- | --- |
| 安装与版本 | 多实例检测、当前版本、检查新版本、按来源执行本体更新、更新后核验 | 未验证的安装器迁移、跨平台任意降级 |
| 常用配置 | 全局／项目来源、继承恢复、默认模型／思考、压缩／重试／终端 | 内部 ID、全部字段一次铺开 |
| 模型连接 | 显式 provider 和模型配置、保留未知字段、连接与模型能力检查 | 复制全部内置模型目录、接管 OAuth 刷新、按模型名猜能力 |
| 资源 | skills/extensions/prompts/themes/Pi 包、原生过滤与生命周期 | 中心库撤回分发式启停 |
| MCP | 连接定义、enabled、exposure、项目局部覆盖、用户发起连接检查 | 页面打开时自动连接全部服务、复制原生 tokens |
| 指令 | 区分 AGENTS、SYSTEM、APPEND、命令模板；定位来源和展示变更 | 自动改写用户全局指令或项目信任 |
| 会话 | 后续先做只读列表／打开／用量 | 编辑会话树、代理转发、完整内嵌终端 |

管理对象建议是“Agent 类型 → 安装实例 → 配置根／项目上下文”，但多个可执行实例可能共用同一配置根；两者要关联而不是一一绑定。功能按实例版本和配置上下文开放。Agent 页面可以承载这些管理面，当前侧栏、卡片和主题仍保留，具体布局另行讨论。

读写原则：原生文件反映用户实际配置；App 只保存自己的展示偏好和明确需要的元数据。显示原始值／来源／生效值，恢复默认应移除覆盖键而非写死默认。写入前重新读取、保留未知字段、检查外部修改、按目标节点修改、原子替换并核验；不能声称一次 revision 检查消除了所有跨进程竞争。认证继续走原生登录或经单独设计的 OS 凭证引用。

## 10. 实施前仍需验证

- 1.1.0 与 0.84.3 的配置／命令差异，不以版本号猜全部兼容能力；未来升级后重新检查能力。
- 原生资源过滤的全局／项目／包作用域、符号链接和显式 CLI 覆盖；不能承诺项目规则能覆盖所有全局资源。
- 每个字段 `/reload`、新会话和重启的实际生效边界，尤其 defaultTools 删除、proxy、model 文件和认证。
- 配置损坏、未知字段、并发外部编辑、只读安装路径、来源不明、多个实例和 GUI／shell PATH 差异。
- 在隔离 HOME／安装前缀执行版本查询、受控更新、失败恢复与更新后版本核验；本轮没有执行这些变更。
- 进入代码前协调 ADR 0004/0005、spec 0003、项目指令与 ADR 0007 的未来分工，避免把上游 CLI 扩展方向误认为已交付。

验证记录：固定三个源码提交；提取并对照稳定版 55 个 settings 顶层字段；核对关键配置加载器、过滤、MCP 和更新分支；只读核对本机安装链接及 package manifest；未启动 Pi／CC Switch，未调用模型／MCP 服务，未执行安装／更新／卸载或用户配置写入。文档链接与字段覆盖检查在交付时记录。


## 2026-10-29 补充：代码模式项目级配置核对（Pi 1.4.0）

本节只核对用户提出的“自动／始终开启、直接／脚本调用、工具预算、沙箱状态”，不授权新增管理页面。依据为本机已安装的 `@earendil-works/pi-coding-agent@1.4.0` 随包文档和实现，并与官方在线文档交叉核对；未修改个人 Pi 配置或应用代码，未调用子代理。

| 拟议配置 | 核对结果 | 原生映射与边界 |
| --- | --- | --- |
| 模式：自动／始终开启 | 行为基本正确；建议命名“启用方式” | Pi 不存在取值 auto/always 的 `codemode.mode`。自动激活由 `.pi/mcp.json` 顶层 `autoEnableCodemode`（默认 true）控制；会话启动即启用由 `.pi/settings.json` 的 `defaultTools` 包含 codemode 控制。 |
| 内置工具：直接调用／脚本调用 | 范围和选项措辞需修正 | 对应 `codemode.mode` 的 `on`／`only`，且仅在 codemode 激活时生效。`on` 保留直接声明，同时仍允许脚本调用；`only` 隐藏可从 codemode 调用的 active direct 工具声明，范围不止内置工具，还包括扩展工具和直接声明的 MCP 工具。建议“工具调用方式：保留直接调用／仅脚本调用”。 |
| 工具预算：默认 3000 token | 正确，但不是输出或会话预算 | `codemode.inlineBudget`，默认 3000 个估算 token（字符数 / 4），用于 codemode 工具描述中内联的工具声明；超出的工具仍可被搜索发现。0 只列命名空间；原实现接受有限非负数。 |
| 沙箱：是否可用，只读 | 可作为运行时探测结果，不是原生设置 | 指 QuickJS/WASM 脚本运行环境，无 sandbox 布尔配置或公开的现成可用状态设置。执行器和 WASM 在首次调用时懒加载，不能用扩展已加载或文件存在代替实际可用。未探测时应保留“未检测”，成功／失败才显示可用／不可用。不是 OS 文件、网络或 bash 权限隔离；工具调用仍通过 Pi 原工具管线和权限扩展。 |

### 项目配置映射

自动方式需要 `autoEnableCodemode: true`，同时启动工具选择中没有 codemode。如果全局已经在启动时启用 codemode，项目可用 `defaultTools: ["-codemode"]` 覆盖该启动选择，保留 MCP 后续自动激活；选择始终开启则用 `["+codemode"]`，无须改变其他工具选择。保存已有列表时应保留其他工具的选择及顺序，不能以示例数组直接覆盖用户列表。

自动激活发生在已连接服务器的有效工具 exposure 包含 `codemode` 时（包括单工具 exposure 覆盖）；只有 direct 或 deferred 工具的服务器不触发此条件。扩展必须实际加载并注册具有 reachesTools 能力的 codemode 工具。CLI 参数、扩展关闭和其他扩展对工具的修改可能影响实际会话；不能仅凭上述两个 UI 选项断言当前会话已启用。

两种启用方式是管理界面对多个原生设置的归纳，不是完整的原生状态枚举。已有 `autoEnableCodemode: false`、扩展排除或手工工具选择应如实保留，不在读取时悄悄归一化。项目级 `codemode.mode` 和 `codemode.inlineBudget` 写入 `.pi/settings.json`，自动激活标志写入 `.pi/mcp.json`；项目需被信任。`/reload` 会启用新增的默认工具，但不会因此卸载刚从 defaultTools 移除的活动工具，因此自动／始终开启首先描述后续会话启动行为。

### 证据与探测

- [官方 Settings Reference](https://pi.dev/docs/latest/settings#tools)：defaultTools、codemode.mode 和 inlineBudget。
- [官方 MCP exposure](https://pi.dev/docs/latest/mcp#control-tool-exposure)：服务器连接后的自动激活和 autoEnableCodemode。
- [官方 Codemode](https://pi.dev/docs/latest/codemode)：QuickJS 能力边界、工具调用与预算语义。
- 本机固定安装根：`~/.pi/agent/install/releases/1.4.0/node_modules/@earendil-works/pi-coding-agent/`。核对 `dist/extensions/codemode/index.js` 的 inactive 注册和预算读取、`tool.js` 的 prepareCodemodeLoadout、`execute.js` 的 WASM/worker 懒加载，以及 `dist/extensions/mcp/config.js`、`index.js` 的项目合并与自动激活条件。
- 主代理调用原版 `executeCodemode`，以无会话、无工具、models=false 执行纯计算：返回 answer=2，process/fetch/setTimeout 均为 undefined。证据脚本 `/tmp/pi-codemode-research/probe.mjs`，运行时 Node 25.9.0。本机该安装实例可执行 QuickJS；这不证明其他主机或未来会话永久可用。
- 在临时目录中调用原版 loadMcpConfig：全局 autoEnableCodemode=false、项目=true 时，可信项目读到 true，未信任项目读到 false。证据脚本 `/tmp/pi-codemode-research/config-probe.mjs`；临时测试目录已清理，无实际 MCP 服务器连接。
- 未验证真实 MCP 服务器连接的完整自动激活流程；其触发条件来自本机 1.4.0 实现和官方文档。未进行 UI 实现、App 验收或运行时构建。
