# CC Switch 参考：从技能管理扩展到 Agent 管理

调研日期：2026-10-15。固定提交：`51ac86f1c59abfefabadebd05ec5a5415b8ad72c`，package 版本 `4.0.12`。状态：公开源码静态阅读；未运行参考项目、未重跑其测试、未复制实现代码。配套：[Pi 配置与版本管理调研](pi-agent-management.md)、[阶段性方向 ADR 0007](../adr/0007-agent-native-management-direction.md)。

范围修订（同日）：完整 Agent 管理方向已被用户撤回。本文保留参考价值，第 5 节的扩展建议不再作为实施方向；仅保留与技能有关的适配思路。当前研究见[技能管理重新调研](skill-management-scope-review.md)。

## 1. 项目实际提供了什么

CC Switch 不只是 API key 切换器。当前 README 展示供应商连接、MCP、技能、提示文件、项目／会话和用量管理，并按目标工具提供不同能力；有些工具支持代理／路由／聚合，有些仅写原生配置。

固定版 Pi 支持表是共存供应商、MCP、技能、AGENTS／SYSTEM／提示模板、会话和用量；不支持 Pi 路由、聚合和托盘切换。其他 Agent 的能力不能直接推导为 Pi 的能力。来源：[README](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/README.md)。

本轮进一步阅读 Pi 原生契约、供应商同步、models 文件适配、MCP、提示文件和会话用量模块，确认下面的边界，不把 README 的整体能力列表当作每个模块都实现的证据。

## 2. Pi 适配不是完整配置镜像

| 对象 | CC Switch 固定版行为 | 对 Skills Space 的启发 |
| --- | --- | --- |
| 显式供应商 | 读取／同步／修改 `models.json.providers`；内置 provider ID 的显式节点也纳入 | 根据真实节点和来源识别，不按名称判断是否“自己的配置” |
| 模型默认值 | 只读全局 `defaultProvider/defaultModel`，不改写 | 配置成员、启动默认值和当前会话模型分离 |
| 原生认证 | 不读取／写入／刷新 `auth.json` | 不接管 Pi 登录和令牌生命周期 |
| 配置表达式 | 不替用户解析执行 apiKey/Header 的变量和命令 | 浏览配置不应触发命令或暴露凭证 |
| models 未知字段 | 保留完整节点，表单只编辑部分已消费字段 | 支持有限表单并保留扩展，而不是一次覆盖所有配置 |
| 项目默认值 | 供应商页无项目上下文，不猜测 `.pi/settings.json` 或会话当前值 | Skills Space 已有项目上下文，可进一步提供作用域管理，但需要独立设计 |
| 会话目录 | 相对 sessionDir 缺上下文时明确无法定位 | 不把一个拼接路径当作实际运行目录 |

来源：[Pi 原生契约](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/docs/pi-native-contract-zh.md)、[显式供应商同步需求](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/docs/pi-live-provider-sync-requirements-zh.md)。这些文档表达其项目合同；实现交叉依据见下一节。

## 3. 源码上可借鉴的做法

### 3.1 原生文件适配独立于界面和产品数据库

`pi_config` 负责配置根、文件解析和 provider 节点修改；`services/provider/pi` 协调原生文件和数据库；`pi_state` 只读成员身份及默认项，避免把它们混为当前运行状态。

配置根解析先用 CC Switch 自己的目录覆盖，再用 `PI_CODING_AGENT_DIR`，最后使用默认目录，并验证绝对路径。对我们的启发是允许明确选择配置根，但不能假定 App 的覆盖项会自动改变用户从终端启动 Pi 时的环境。

来源：[pi_config](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/src-tauri/src/pi_config/mod.rs)、[Pi state](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/src-tauri/src/services/pi_state.rs)。

### 3.2 保留用户外部修改，修改精确节点

供应商列表刷新会从原生文件同步显式节点；文件中有节点代表显式配置成员，不代表认证成功或正在使用。编辑／移除以精确 provider ID 定位，保留其他节点和顶层字段。移除其显式节点不等于退出 Pi 登录；内置供应商也可能仍然存在于 Pi 运行时目录。

文件适配有大小限制、进程内锁、revision 比较和原子写入；服务层还有数据库失败后的条件恢复。这值得借鉴，但不能把原子替换和一次 revision 比较描述成跨进程事务：检查与替换之间的竞争仍需独立处理。

来源：[provider Pi service](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/src-tauri/src/services/provider/pi.rs)、[文件写入／revision](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/src-tauri/src/pi_config/mod.rs)。

### 3.3 MCP 的停用采用原生 enabled

Pi MCP 适配区分 Enable、Disable、Remove。Disable 写 `enabled: false` 保留连接条目，Remove 才删条目；更新连接字段时保留 Pi 自己的 timeout/exposure/toolExposure/oauth/auth 等设置。它拒绝 SSE，并验证服务器命名冲突。该模块仅处理用户级 mcp.json，不覆盖项目适配。

这是使用原生能力的合理例子，符合“不移动文件或撤回链接模拟停用”。但不要把“对多个工具同步一份 MCP 定义”与“所有工具支持相同认证、transport 和 exposure”混为一谈。

来源：[Pi MCP adapter](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/src-tauri/src/mcp/pi.rs)。

### 3.4 提示与会话按原生格式处理

Pi 提示模块区分 AGENTS、SYSTEM、APPEND 和模板，提供大小限制、revision 与原子修改。会话用量模块读取 JSONL 并进行增量导入和去重；不需要把所有请求经由代理才能观察使用量。

可参考原生文件读取和来源定位；是否加入会话导入／统计数据库，应由实际产品需求决定。没有核对完整会话解析器和全部路径，不将该项目的所有会话功能宣称为已审计。

来源：[Pi prompt files](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/src-tauri/src/services/pi_prompt_files.rs)、[Pi usage importer](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/src-tauri/src/services/session_usage_pi.rs)。

## 4. 不应直接照搬的部分

| 做法 | 不直接采用的原因 |
| --- | --- |
| 中心技能 SSOT，再向各工具同步链接／副本 | `services/skill.rs` 明确采用该模型；用户已排除恢复保留内容、撤回分发式启停 |
| 数据库存储完整供应商档案，包括输入的 key | 本项目要求秘密在 OS 凭证存储中；必须独立设计引用和 Pi 兼容性 |
| 卡片“已启用”代表 provider 节点存在 | 这是参考项目自己的语义，不能扩展成 Agent 已运行、已认证或技能已加载 |
| 直接套全部代理／聚合／故障转移功能 | 当前 Pi 适配本身没有这些能力，且会显著扩大执行和请求责任 |
| 只做供应商，不做 settings／版本 | 本次用户要求包含详细设置、Pi 本体检测和更新，参考项目的范围不是我们的上限 |
| 按最新版本开发，不维护兼容矩阵 | 本机已存在 1.1.0 与 0.84.3 两套安装，实际版本差异必须可观察 |
| 复制统一开关与统一配置格式 | Agent 和资源类型有不同作用域、协议和生效条件，应复用呈现模式而不是抹平语义 |

来源：[中心技能模型](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/src-tauri/src/services/skill.rs)、[原生契约的认证和范围边界](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/docs/pi-native-contract-zh.md)。参考项目允许供应商配置档案保留和再次加入，不构成恢复本项目旧技能分发机制的理由。

## 5. 对本项目的具体建议

1. 将 Agent 视角扩展为安装与版本、配置与模型、资源、MCP、指令等管理面；保留现有全局／项目导航。具体页面方案仍待讨论。
2. 先做好 Pi：检测所有安装实例与配置根，明确当前入口，提供版本检查和按安装方执行的更新；与 Pi 包及模型目录更新分开。
3. 配置写入能力按文件和节点实现；先支持常用设置和高级原始配置，再增加高级字段表单。显示原始值、继承来源和实际适用条件。
4. 生命周期后端按对象选择：skills CLI 安装继续用其生命周期，Pi 包和本体由 Pi 管理，启停走 Pi 原生过滤／enabled，不替换成分发撤回。
5. 引入原生适配器前先明确版本与能力合同、配置并发、凭证存储和结果核验；不为模仿参考项目先建设供应商数据库、代理或中心库。

这是调研后的建议，不自动扩展已批准的实施任务。引用项目为 MIT 许可；本轮只有分析和链接，未复用代码。将来如复用代码须保留对应许可证与版权声明。[许可证](https://github.com/farion1231/cc-switch/blob/51ac86f1c59abfefabadebd05ec5a5415b8ad72c/LICENSE)

## 6. 证据与缺口

已完成：固定提交、核对 manifest、阅读上述文档及实现、区分 README 宣称与具体模块边界。未完成：运行 CC Switch、复跑其测试、真实 Pi 连接／启停／更新验收、其他 Agent 的逐模块源码审计。参考项目不能代替 Pi 官方配置合同或本项目验证。
