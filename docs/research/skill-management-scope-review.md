# 跨 Agent 技能管理重新调研

日期：2026-10-15。状态：收缩范围后的研究与建议，未实施；替代之前从 Skills Space 扩展为完整 Agent 管理的推进建议。

## 1. 当前目标与不推进的方向

围绕技能发现、安装、更新、卸载、原生启停及必要的技能目录／规则配置。Agent 仍是管理技能的视角，不发展为 Agent 本体、供应商、模型参数、MCP、插件包、认证和会话的综合控制台。

Pi 本体更新、插件更新和常用运行参数不再属于实施方向。为判断技能配置是否适用而读取 Agent 版本或配置根，仍属于必要检测，不等于建设 Agent 版本管理。此前 Pi 与 CC Switch 研究保留参考，不能继续据此推进产品功能。

不恢复中心技能库、技能分发台账或移走目录／撤回链接式启停。不为绕过上游限制而伪造来源锁，也不在本轮建设特殊路径写入引擎。

## 2. 本轮证据

- 重新阅读项目实际安装及打包的 `skills@1.7.2`；两个 `dist/cli.mjs` SHA-256 都是 `72f1805ea4f6c62b0532cb77a9f021e7930bb7ca962f87a3fbf985d1ada5d56d`。核对 list、update 参数、来源哈希和更新再安装分支。
- Pi 使用已获取的稳定提交 `abe508e1b89912adde45528136c3221eb69acdd7`（1.1.0）资源解析与加载源码，不再扩大到完整参数。
- Hermes 新固定提交 `379cf1220fe289b5ecfe8bcf61cd4d5126e140cd`，读取 `hermes_cli/skills_config.py`、`agent/skill_utils.py`、`tools/skills_tool.py`。这是源码版本，尚未与用户已安装版本建立兼容性结论。
- 重新联网核对 Claude Code、Codex、Hermes、OpenClaw 官方技能文档及 OpenClaw 技能 CLI 文档。官方文档为当日动态页面，不能证明所有旧版本支持。
- 没有执行 Agent、模型请求、原生配置写入、安装／更新／卸载或启停验收；本轮结论分为源码事实、文档合同和建议，均不代表已接入 App。

## 3. 上游 CLI 仍适合承担的工作

| 操作 | 已核对能力 | 需要 App 补充的边界 |
| --- | --- | --- |
| 安装 | 来源发现、选择技能、选择 Agent、全局／项目、复制／链接 | 真实目标和共享影响；不据此声明已加载 |
| 列出 | 扫描安装根中的直接子目录 | 递归／额外根、实际物理路径和同名副本；不能把名称合并结果直接当唯一安装身份 |
| 更新 | 按来源记录、技能名和全局／项目检查并再安装 | 不是按 Agent 精确更新；不要让页面 Agent 筛选造成错误范围承诺 |
| 卸载 | 按上游支持的技能和 Agent 目标移除 | 只对可寻址目标执行，核对共享与同名影响 |
| 启停 | 没有统一原生 Agent 配置适配 | 需要读取／编辑对应 Agent 的技能配置，而非调用卸载 |

`parseUpdateOptions` 没有 Agent 定向更新参数。全局更新对来源记录的哈希进行比较，随后以 `add --skill ... -g -y` 再安装；该来源检查不能直接证明所有本地副本未修改。Git 树哈希也不能与任意本地文件 SHA-256 直接比较。

项目命令映射还已记录 `check` 是更新的别名，存在写入行为；App 的“检查更新”必须继续使用只读检查，而不是直接调用这个名字看似只读的命令。来源：[当前命令映射](upstream-command-map.md)、项目实际固定包 `node_modules/skills/dist/cli.mjs` 的上述函数。

## 4. 各 Agent 的技能启停与调用语义

| Agent | 原生机制 | 作用对象／范围 | 不能忽略的限制 |
| --- | --- | --- | --- |
| Claude Code | `skillOverrides` 的 on/name-only/user-invocable-only/off | 按技能名和设置来源控制 | plugin skills 不受该配置影响；别名、策略和同名行为要按版本验证 |
| Pi 1.1.0 | settings 资源数组中的 `!pattern/+path/-path` | 按资源路径和来源规则过滤 | 全局、项目、包和显式 CLI 路径不同；不能承诺一个项目规则能关闭所有全局来源 |
| Codex | `[[skills.config]]`，path 指向 SKILL.md，enabled=false | 本地技能路径；官方例子为用户 config | 文档要求重启；项目局部开关和插件适用性需要单独证明 |
| Hermes | `skills.disabled` 与 `skills.platform_disabled.<platform>` | 当前 profile 的全局／平台技能名或原生可识别名称 | 全局禁用与平台禁用取并集；必需技能受保护；不是项目级启停 |
| OpenClaw | `skills.entries.<key>.enabled=false` | name 或 metadata.openclaw.skillKey | 与内部 agent allowlist、依赖、快照共同影响；不能直接等同 App 项目范围 |
| 通用目录 | 没有跨 Agent 统一开关 | 共享物理文件 | 必须由使用它的各 Agent 配置分别控制 |

Claude `off` 隐藏并拒绝通过原生技能调用机制调用；`user-invocable-only` 保留手动方式。Codex `allow_implicit_invocation: false`、Pi 的 `disable-model-invocation` 属于另一维度，不能当完整禁用。不得为了单 Agent 的开关改写多 Agent 共用的技能 frontmatter。

官方依据：[Claude 技能设置](https://code.claude.com/docs/en/skills#override-skill-visibility-from-settings)、[Codex 技能](https://developers.openai.com/codex/skills/)、[OpenClaw 配置](https://docs.openclaw.ai/tools/skills-config)。Pi 依据：[稳定版过滤](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/package-manager.ts)、[加载](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/src/core/resource-loader.ts)。

### Hermes：补充并修正此前证据缺口

此前研究仅检查技术技能总览，未建立单技能开关合同。本轮补查日常技能指南与实际源码，确认有全局／平台级启停，而不是只能控制项目 trust 或 bundle seeding。

固定源码中 `get_disabled_skill_names` 合并两层禁用集合；`save_disabled_skills` 写回相应配置并去除必需技能（当前包含 hermes-agent）。技能列表过滤禁用项，`skill_view` 对相应禁用名称／路径也存在拒绝分支。不能把它描述成“只从自动选择列表隐藏，仍可正常 skill_view”。但该配置不是磁盘访问安全边界，也不能撤回已进入会话的内容。

平台禁用与全局禁用不是双向覆盖：全局关掉的技能不能只靠平台启用恢复。实现必须保留平台差异和必需技能约束，不能写一个替换整组设置的简单开关。原生 TUI 是 `hermes skills`；本轮没有建立稳定的非交互单项 toggle 命令，不能猜造 enable/disable 参数。

依据：[操作指南](https://hermes-agent.nousresearch.com/docs/guides/work-with-skills#per-platform-skill-management)、[固定配置源码](https://github.com/NousResearch/hermes-agent/blob/379cf1220fe289b5ecfe8bcf61cd4d5126e140cd/hermes_cli/skills_config.py)、[禁用集合与必需技能](https://github.com/NousResearch/hermes-agent/blob/379cf1220fe289b5ecfe8bcf61cd4d5126e140cd/agent/skill_utils.py)、[列表与 skill_view](https://github.com/NousResearch/hermes-agent/blob/379cf1220fe289b5ecfe8bcf61cd4d5126e140cd/tools/skills_tool.py)。

## 5. 安装、更新、卸载不能只按 Agent 分类

同一个 Agent 下也会同时存在不同管理方式的技能。应以实际安装实例和来源判断可执行操作，而不是一看到 Hermes 就全部交给 Hermes 命令。

| 技能来源／安装方式 | 更新和卸载建议 |
| --- | --- |
| 通过固定 skills CLI 安装、目标可寻址 | 继续使用上游 CLI，保留复制／链接和锁记录语义 |
| Hermes Hub 安装 | 原生 check/update/uninstall 有来源跟踪，必要时单独接入技能级入口；不要交叉改写两套锁 |
| Hermes 内置 | 保留原生同步与本地修改保护；不自动迁移到 skills CLI，也不以更新技能为名升级 Hermes 本体 |
| Pi 包／Claude 插件提供的技能 | 展示包归属；更新／删除可能影响整个包，当前不扩展成包管理器 |
| OpenClaw ClawHub 跟踪技能 | 原生 update 有效；卸载官方要求独立 ClawHub CLI，不能假设有统一 openclaw skills uninstall |
| OpenClaw Git／local 原生安装 | 官方说明需重新安装刷新，不是所有来源都能原生 update |
| 手动目录／额外目录 | 继续显示和检查；没有可靠来源、操作依据时不假装已接管 |

Hermes 内置内容在 GitHub 上不构成适合由 skills CLI 接管的依据。若更新配套技能需要更新 Hermes，本次收缩范围内只解释限制和提供原生操作信息，不在 App 执行 Agent 本体更新。

OpenClaw 的 list/info/check 还可能使用所选 Gateway 的权威库存，不保证仅扫描本机文件。当前本机 local 范围不得借这个入口隐式扩展到远端。

依据：[Hermes 技术总览](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)、[OpenClaw 技能 CLI](https://docs.openclaw.ai/cli/skills)、[OpenClaw 来源与更新限制](https://docs.openclaw.ai/tools/skills)、[Pi 包](https://github.com/earendil-works/pi/blob/abe508e1b89912adde45528136c3221eb69acdd7/packages/coding-agent/docs/packages.md)。

## 6. 对 App 的最小扩展建议

### 继续保持现有页面

保留技能空间、Agent 技能页、全局／项目导航、技能卡片与图标。不新增 Agent 控制台、插件 Tab、供应商或通用配置页。2026-10-15 用户随后确认 Pi 技能设置放在设置 → AGENT管理 → Pi 管理页；技能启停保留在侧栏 Pi 技能卡片。该子集的实施和验收见 [0006](../specs/0006-pi-skill-management.md)。其他 Agent 布局仍需单独确定。

### 只增加与技能直接相关的能力

1. **库存准确**：递归／额外根、物理副本、包／内置归属、同名覆盖和坏链接。先完善详情信息和操作依据，不把实现标签铺满卡片。
2. **生命周期可靠**：上游支持的继续原样执行；按当前选择展示真正的影响范围。原生所有者不兼容的内容先保留只读／打开目录／原生操作说明，不强行接管。
3. **原生技能启停**：按已验证版本和作用域逐个适配；先单项，验证后再批量。展示配置状态与生效条件，不承诺已加载。
4. **有限技能配置**：扫描附加目录、排除规则、调用方式等直接技能参数；不加入默认模型、思考、重试等 Agent 通用参数。
5. **更新差异**：先区分来源更新和本地修改；只有有可比基线时才归因。没有基线保留“不确定”，不默认建设三方自动合并器。

最小架构是“原版 CLI 生命周期 + 小型原生技能配置适配 + 只读观察”，不先建设通用多后端执行平台或 App 自有安装引擎。Hermes Hub 等原生技能级生命周期入口按明确需求逐个增加。

### 状态与作用域

“已安装”描述存在于实际位置，“已停用”描述某个 Agent 的原生技能配置，“被覆盖／项目未信任／依赖不足”是不同原因。原生开关的作用域不一定与 App 全局／项目视图一一对应；名字级开关也不能伪装成只影响某个同名文件。

不把共享目录统一改成“共享可用”；保留现有已安装 Agent 图标规则。多个 Agent 使用同一物理文件时，启停改各自配置，更新／删除则核对实际共享影响。

## 7. 建议的实施顺序与验收

1. 完成现有库存与生命周期边界收尾，优先解决真实误判、错误范围和不支持的操作；不借研究扩大界面内容。
2. 先验证 Pi 和 Codex 的原生技能过滤／开关，再验证 Claude；不是完整 Agent 配置管理。排序可由后续实际使用需求调整。
3. Hermes 的 global/platform 禁用、必需技能和 profile 范围单独验证；OpenClaw 再处理 key、内部 Agent、Gateway 与本机边界。无可靠能力时不提供虚假开关。
4. 有明确需求再接 Hermes Hub 更新等技能级原生操作；包更新、本体更新和任意特殊路径写入不作为前置条件。

每个适配至少在隔离 HOME／项目中验证：配置解析和未知字段保留、单项开关、相反状态恢复、原生发现／显式调用、同名和共享链接、全局／项目或平台影响、reload/restart、技能文件哈希不变。更新另外检查修改内容保护和实际执行范围。本轮没有运行这些验收，不把源码分支当作通过证据。

## 8. 本轮交付状态

已重新核对技能相关官方资料、固定 CLI 和 Pi 源码，新增 Hermes 配置／加载源码证据，纠正之前的启停证据缺口；已收缩 ADR 与研究索引中的 Agent 管理方向。文档引用与格式检查完成后交付。功能代码、真实技能、配置和 Agent 安装均未修改，未创建提交。

后续实施：Pi 原生技能配置子集已按用户确认接入，见 [0006](../specs/0006-pi-skill-management.md)；上文“未修改功能”仅描述本研究轮次，不代表后续实现状态。
