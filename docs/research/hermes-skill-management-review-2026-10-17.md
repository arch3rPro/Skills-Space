# Hermes 技能管理与增强适配调研

日期：2026-10-17。状态：源码调研与接入建议，**不是已实现功能或已批准实施范围**。本轮只写研究文档，不修改应用、Hermes 配置、技能文件或安装。

## 1. 结论与证据范围

Hermes 值得增加专门的“技能增强适配”，但不宜直接复制 Pi 管理页的开关和目录模型。它同时拥有：

- 多根目录、递归分类、项目级信任、跨目录优先级与同级歧义处理。
- 当前配置档的全局禁用与渠道禁用；技能本身还有操作系统、运行环境和工具条件。
- Hermes Hub 来源锁、内置技能同步清单、Agent 创建与 Curator 整理记录等不同所有权体系。
- 普通按需调用、手动 slash 调用和会话预加载三种可共存的使用方式。

**建议：保留“托管技能 / 原生技能”及全局／项目导航；新增“设置 → 智能体 → Hermes”技能设置页。先准确观察与有限配置，再逐项接入 Hermes 原生技能生命周期。**

证据基线：

- 仓库：[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)，本机已有检出；使用完整提交 `7157422022ff06f3e632d1dd394ee1253b17ad37`（提交日期 2026-10-05），不宣称等于 2026-10-17 最新 main。
- 工作区存在其他模块的删除记录，本轮不改动；源码从 `git show <SHA>:<path>` 提取，避免把工作区变更误当上游能力。
- 最初检查 20 个核心文件；为核实所有权和配置档扩展到 27 个完整文件，共 1,111,337 字节，另取默认配置的技能／Curator 段落。默认配置完整文件超过单文件界限，没有全量复制。完整文件各不超过 200 KiB，合计小于 2 MiB；快照和清单位于忽略目录 `.scratch/hermes-skill-research/`。
- 对照当日[官方 Skills 文档](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)。以固定源码解释实现，以公开文档补充使用方式；发现冲突时不只采用说明文字。
- 仓库为 [MIT](https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/LICENSE)；若以后直接复用代码，应保留许可。本轮只研究规则，没有复制 Hermes 实现到应用。[Python 项目声明](https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/pyproject.toml#L15) `>=3.11,<3.15`，不能因此假设 App 可无条件启动本机任意 Python 或导入 Hermes。

## 2. 先分清“范围、归属和可用性”

### 2.1 全局其实是当前 Hermes 配置档

Hermes 根目录由实际配置档／`HERMES_HOME` 决定，默认是 `~/.hermes`；命名配置档有自己的目录、配置与技能状态。`hermes -p <profile> ...` 选择配置档，不是项目范围参数。

App 的“全局管理”应对应**当前明确选定的 Hermes 配置档的用户级安装**，不能把所有配置档混成一个目录，也不能随意改动运行中的 Hermes 当前配置档。首期可读取默认／显式 `HERMES_HOME`，多配置档先增加明确的选择能力，不扩展成配置档创建、复制或删除管理。

依据：[配置档解析][S18]、[CLI list 的配置档说明][S05]。

### 2.2 项目范围

Hermes 从有效会话工作目录向上寻找最近 `.git`（目录或 worktree 文件），不是从 App 任意新增的目录名判断项目。没有 Git 根不会自动发现项目技能；HOME 本身即使有 Git 也不当项目。

识别后扫描：

- `<git-root>/.hermes/skills/`
- `<git-root>/.agents/skills/`

加载还要求：`skills.project_discovery` 未关闭、该根目录在当前配置档的 `skills.trusted_project_dirs`，并通过项目技能扫描。信任写在配置档配置中，**不是一份自动存在的项目 `.hermes/config.yaml`**。不应因为用户在 Skills Space 添加了项目或安装了技能，就自动授予 Hermes 信任。

CLI/TUI/Desktop/cron 的有效工作目录会影响识别；App 所选路径不等于任一运行中会话的工作目录。子目录还可能解析到父 Git 根，安装预览应显示实际范围，避免把子目录安装冒充 Hermes 会读取的仓库根安装。

依据：[项目根、信任和扫描入口][S01]；[项目测试][S20]。

### 2.3 原生不是第三种范围

“全局／项目”回答安装或配置属于哪里；“托管／原生”回答如何管理。它们是两条独立维度。

| 实例 | App 范围／集合 | 实际所有者 |
| --- | --- | --- |
| skills CLI 的标准目标安装 | 对应全局或项目／托管 | 原版 skills CLI |
| Hermes 同步的内置技能 | 配置档全局／原生 | Hermes 内置同步器 |
| Hermes Hub 安装 | 配置档全局／原生 | Hermes Hub 来源锁 |
| Hermes 分类目录中的独立技能 | 按物理目录／原生 | 用户或 Agent，需结合来源记录判断 |
| `create_dir`、`external_dirs` | 配置所属配置档／原生；不自动计作每个项目安装 | 对应目录／来源所有者 |
| 项目 `.hermes/skills`、共享目录 | 项目／按真实 CLI 安装关联区分托管或原生 | 项目；加载受配置档信任控制 |
| 插件提供的技能 | 原生，标记插件归属 | 插件；不能删除技能即视为卸载插件 |

上述本地／原生分类只适用于已有明确原生来源或非 CLI 目标依据的实例。标准 CLI 路径内的未知来源记录继续遵循现有分类和管理边界，不因本轮研究批量迁移集合。

不能只按目录名称、同名锁条目或 `.usage.json` 的 `created_by` 推断来源；应绑定物理路径与真实安装记录。配置档之间或项目／全局之间共享内容时，文件操作还要单独核对引用影响。

## 3. 加载、同名和启停语义

### 3.1 优先级不是“先扫描到就赢”

官方目录层级：**已信任项目 > 当前配置档 skills > create_dir > external_dirs**。

同层级多个不同内容的同名技能可能是歧义，拒绝按裸名称猜测；可用时需使用精确相对路径。相同根内相同内容的副本还有 `SKILL.md` 优先、较浅路径优先规则。解析涉及声明名称、目录名称和相对路径别名；不能简单以名称去重，也不能把字节相同的一切跨根副本都合并。

App 库存应保留各物理实例；详情展示可解析的当前实例、被覆盖实例或歧义路径。加载后的有效目录不能替代完整安装库存。依据：[目录层级与解析器][S02]。

### 3.2 启停是配置档／渠道的名称规则

有效禁用集合是：`skills.disabled ∪ skills.platform_disabled[渠道]`，再排除不可停用的 `hermes-agent`。渠道列表不能重新启用全局已禁用的技能。

通常以声明名称匹配；同级歧义还支持解析后的 `load_name`（例如 `category/name`）。因此：

- 停用某张同名卡片可能影响同名解析，不能伪装为只停用该物理文件。
- 项目卡片如果改的是当前配置档禁用列表，影响可能跨项目；不能把它描述为项目局部设置。
- 应在操作前确定当前配置档、渠道和精确规则键，并计算受影响实例。
- 原生配置可作用于托管技能的 Hermes 使用状态；这不会把生命周期所有权转给 Hermes，也不改共享 SKILL.md。

依据：[有效禁用集合][S03]、[原生配置界面][S04]、[名称与路径规则][S02]、[调用时禁用检查][S06]。

### 3.3 多种“不可用”必须区分

| 状态 | 含义 | 不能误表示为 |
| --- | --- | --- |
| 已停用 | 当前配置档／渠道规则禁用 | 未安装 |
| 项目未信任 | 文件存在，当前 Hermes 不从该项目加载 | 安装失败 |
| 项目发现关闭／不是 Git 项目 | 不进入项目发现流程 | 技能文件损坏 |
| 同名被覆盖／同级歧义 | 解析选择或拒绝选择 | 没有技能 |
| 系统／环境／应用条件不满足 | 不出现在相应推荐、索引等入口 | 统一的停用开关 |
| 项目扫描隔离 | 危险判定或扫描失败导致不进入索引 | 用户主动停用 |
| 已归档 | Hermes 原生整理生命周期 | 卸载后保留在 App 中心库 |
| 缺少凭据 | 加载／执行时需要设置 | 必然从发现中隐藏 |

`platforms` 是 macOS/Linux/Windows；`platform_disabled` 的 platform 是 Telegram/Discord 等渠道，二者不能混用。`environments`、`requires_apps` 也有独立入口过滤；某些环境相关过滤不阻止显式加载。不能把文件可读直接写成“已加载”。插件和会话工具集的动态状态，离线 App 不应宣称已完全验证。

依据：[平台／环境／应用过滤][S07]、[目录扫描与过滤][S06]、[项目扫描][S01]。

## 4. 相关配置项清单

下列均是固定版本的真实字段或调用方缺省语义；不是建议全部加入首屏。路径相对当前 Hermes 根解析，支持 `~`／环境变量；App 的进程环境不一定与真实 Hermes 会话完全相同。

### 4.1 第一优先级：目录、范围、启停

| 参数 | 缺省 | 实际作用 | 建议入口 |
| --- | --- | --- | --- |
| `skills.external_dirs` | `[]` | 附加扫描目录，存在才纳入；不是写保护边界 | Hermes 设置／目录 |
| `skills.create_dir` | 空，使用配置档 skills | 只改变 Agent 新建技能的目标；也参与发现，不迁移已有技能，不改变 Hub 安装目标 | Hermes 设置／目录 |
| `skills.project_discovery` | `true` | 允许发现项目技能，关闭也停止相关未信任提示 | Hermes 设置／项目 |
| `skills.trusted_project_dirs` | `[]` | 当前配置档信任的 Git 项目根 | Hermes 设置及项目上下文的明确授权动作 |
| `skills.disabled` | 缺省空集合 | 当前配置档的全渠道禁用名称／加载键 | 技能卡片；设置可查看规则 |
| `skills.platform_disabled.<channel>` | 缺省空集合 | 额外禁用某渠道技能，与全局禁用取并集 | 高级设置／渠道，后续扩展 |
| `skills.auto_load` | `[]` | 每个新会话把选定技能的完整内容预加载，不是“让 AI 自动决定是否调用” | Hermes 设置／预加载；卡片菜单可关联 |

依据：[路径与创建目录][S08]、[项目与禁用][S01][S03]、[预加载][S09]、[默认配置][S10]。

### 4.2 与写入、解析相关的设置

| 参数 | 缺省 | 实际作用 | 接入建议 |
| --- | --- | --- | --- |
| `skills.write_approval` | `false` | `skill_manage` 的前台／后台写入先暂存，等待批准；不是禁止所有程序改文件 | 可优先提供设置；首期不实现审批工作台 |
| `skills.guard_agent_created` | `false` | 对 Agent 写入内容做扫描，与写审批独立 | 高级设置；不宣称通用文件防护 |
| `skills.tier1_advisory` | `true` | 安装时可选外部 SkillEvaluator 建议报告，工具不存在则不执行，不是强制阻断 | 先展示状态，不安装评估器 |
| `skills.config` | 未配置时使用技能声明缺省 | 技能声明的非秘密配置值，按声明逻辑键读取 | 后续按实际 SKILL.md 声明动态展示 |
| `skills.template_vars` | `true` | 解析技能内容中的 Hermes 模板变量 | 高级设置，先保留原值 |
| `skills.inline_shell` | `false` | 允许技能内 shell 片段预执行 | 不与普通显示开关混排；首期不修改 |
| `skills.inline_shell_timeout` | `10` 秒 | 上述片段超时 | 随 inline_shell，暂由 Hermes 管理 |
| `skills.ledger` | `true` | 技能变更原生审计记录 | 首期只读，不另建 App 竞争日志 |
| `skills.ledger_max_bytes` | `5 MiB` | 原生日志轮转上限 | 保留，不作为常用字段 |

`skills.config` 只接非秘密字段；`required_environment_variables` 所需秘密不应从 `.env` 回显或复制到 App 普通偏好。凭据仍由 Hermes 原生安全设置或另行设计的系统凭据能力处理。

写审批记录在 `<HERMES_HOME>/pending/skills/<id>.json`。原生 `/skills pending|diff|approve|reject|approval` 与本地命令 `hermes skills ...` 是不同入口，不能拼成不存在的 `hermes skills approve`。

默认项证据：[S10]；设置值解析：[S11]；实际写审批：[S12]。模板／inline shell 本轮核到默认契约与文档，没有完整追踪所有预处理调用链，首期不开放它们。

### 4.3 SKILL.md 自身字段

| 字段 | 作用 | App 首期处理 |
| --- | --- | --- |
| `name`、`description` | 目录身份和索引说明；提示索引描述有长度截取 | 显示与诊断，不自动改正文 |
| `platforms` | 操作系统条件 | 读取并解释不可推荐原因 |
| `environments`、`requires_apps` | 运行环境／宿主应用入口条件 | 只读，动态条件显示未确认 |
| `metadata.hermes.{fallback_for_toolsets,fallback_for_tools,requires_toolsets,requires_tools,session_platforms}` | 工具可用性或渠道条件 | 只读解释；不冒充完整会话评估 |
| `metadata.hermes.config` | 非秘密参数的声明、说明与默认值 | 后续生成有限配置表单 |
| `required_environment_variables` | 加载时安全设置所需凭据 | 仅展示需求，不读取秘密值 |
| 分类与标签 | 组织和搜索 | 原生列表可筛选，不用扩高卡片 |

本轮已核查的核心路径没有提供可直接对应 Pi `disable-model-invocation` 的同等控制合同。Hermes 的 slash 调用、模型按需使用和 auto_load 可并存。**不照搬“自动选择／手动调用”二选一控件；如以后希望只手动调用，需另外验证或设计，不自动编辑共享 SKILL.md。**

### 4.4 Curator：技能整理是另一个原生生命周期

| 参数 | 缺省 | 含义 |
| --- | --- | --- |
| `curator.enabled` | `true` | 后台整理开关 |
| `curator.interval_hours` | `168` | 调度间隔；不是启动应用立即执行 |
| `curator.min_idle_hours` | `2` | 最小空闲时间条件 |
| `curator.stale_after_days` | `14` | 标记陈旧阈值 |
| `curator.archive_after_days` | `30` | 原生归档阈值，不是直接永久删除 |
| `curator.consolidate` | `false` | LLM 合并改写流程；普通自动状态整理不等于该流程 |
| `curator.prune_builtins` | `false` | 是否允许内置技能参加相关整理 |
| `curator.archive_ttl_days` | `0` | 归档永久清理期限；0 关闭，清理由显式 purge 命令执行，不是自动删除计划 |
| `curator.backup.enabled`／`keep` | `true`／`2` | 合并前原生快照与保留数 |

`created_by: agent` 是 Curator 管理选择标记，`curator adopt` 也会设置它，不能作为“由 AI 创建”的历史证据。Hub、外部／项目路径及受保护内置不应仅因存在使用记录就被接管。内置参与受 prune_builtins 约束，pin 又是独立保护。

技能使用侧车 `.usage.json`、`.archive/`、`.curator_state`、`.curator_backups/` 和 ledger 是 Hermes 自有数据。建议首期只读整理状态，之后最多接入 pin/unpin、查看归档等原生命令。不要为此恢复 Skills Space 旧中心库的保留内容／撤回分发设计。

依据：[Curator 调度][S13]、[所有权和管理标记][S14]、[原生命令][S15]、[缺省参数][S10]。

## 5. 安装、更新、卸载分别由谁负责

### 5.1 必须按安装实例分派

| 来源 | 安装 | 更新 | 卸载／删除 |
| --- | --- | --- | --- |
| skills CLI 托管 | 固定原版 `skills add`，保留全局／项目与 copy/link | 固定原版 CLI 的既有来源与校验 | 固定原版 CLI，不改 Hermes Hub 锁 |
| Hermes Hub | `hermes skills install <identifier>`，`--category`／`--name` 等按需；该解析器没有项目安装参数 | `hermes skills check [name]` → `update [name]`；有本地改动默认跳过，`--force` 是单独覆盖决策 | `hermes skills uninstall <name>`，只处理有 Hub 记录者 |
| Hermes 内置 | Hermes 安装／同步器负责种入 | 内置源 + `.bundled_manifest` 的原生同步，不是 Hub update | 先启停；恢复或退出种入有各自原生命令与影响，不通用 rmtree |
| 本地独立／Agent 创建 | Hermes 新建或用户放置 | 没有来源就不显示远端更新承诺 | 首期只读；独立文件的可恢复删除需另行确认实现范围 |
| 项目／附加／共享目录 | 保留真实目录与项目安装；外部引用不复制成隐含安装 | 跟随实际来源／项目仓库 | 不因被 Hermes 扫描就删除目录；共享影响另核对 |
| 插件技能 | 插件所有者 | 插件更新 | 插件卸载，不能拆除单个文件伪装卸载成功 |

依据：[原生命令参数][S16]、[Hub 更新与本地修改][S05]、[Hub 卸载边界][S17]。接入 Hermes Hub 原生命令需要确认原生生命周期适配合同，是对当前原版 skills CLI 路径的补充，不是现在已授权改写两套锁。

### 5.2 两套更新哈希不能混用

- Hub 锁：`skills/.hub/lock.json` 保存来源、identifier、安装相对路径、内容 hash、扫描等；本地变化与安装时内容 hash 比较，Hub 更新源还会结合来源版本／远端内容检查。内容 hash 使用包内容契约，相关代码采用 SHA-256。
- 内置清单：`.bundled_manifest` 保存首次／上次同步的 origin hash；同步器比较当前内置源、origin、本地内容。源码 `_dir_hash` 使用 MD5 作为变更检测（不是安全签名），并处理运行时缓存兼容。默认保护本地改动，不自动合并。
- `hermes skills diff <name>` 对比本地与当前 stock；`list-modified --json` 可列出改动；`reset <name>` 重置追踪，`reset <name> --restore` 还替换实际内容。二者不能用相同“重置”按钮无差别执行。
- `opt-out` 停止普通内置种入，`--remove` 另涉及清理未修改的内置；`opt-in --sync` 同时恢复种入政策并同步，不能偷换成无副作用的“检查更新”。

源码存在值得注意的文档差异：说明把 opt-out 描述为停止内置种入，而固定同步器保留 `ESSENTIAL_SKILLS` 种入分支。因此 UI 不能承诺“退出后一个内置技能都没有”。本轮不为这个差异自动修改用户配置。

依据：[内置清单与同步][S19]、[Hub 来源锁][S23]、[Hub 内容 hash／更新检查][S17]、[内置命令分支][S05]。

### 5.3 不等价的“接管”

- skills CLI 没有通用原地 adopt：从 Hermes 目录重新 `add` 是另一份安装／关联，不自动接管内置更新。
- `hermes curator adopt` 是交给后台整理，不是接入远端来源更新。
- `hermes skills repair-official` 针对官方 optional 技能的来源记录回填／恢复，不是任意目录的通用接管；首期不借这个入口登记用户未知来源技能。

## 6. 推荐的页面分工

### 6.1 设置 → 智能体 → Hermes

沿用 Pi 的设置图标、返回按钮、配置字段、草稿保护与保存反馈，避免新增独立 Agent 控制台。

第一层只放：

1. 当前配置档与实际目录（先只读识别，支持范围再扩展）。
2. 附加技能目录、技能创建目录。
3. 项目技能发现、已信任项目列表；信任是明确用户操作，安装和扫描不自动信任。
4. 会话预加载技能。
5. 可折叠的更多设置：写审批、Agent 写入扫描；平台禁用后续增加。

禁用规则与卡片共用同一份原生配置，不维护 App 独立启停数据库。Curator 参数、技能 bundle 编辑、Hub 仓库管理与完整审批中心不在首屏一次铺开。

### 6.2 全局／项目 → Hermes

保留两集合，不新增“Hub”“内置”“已加载”三个平行主 Tab。

- **托管技能**：保持原版 CLI 安装、更新、卸载和安装图标；Hermes 启停可作为 Agent 原生配置能力出现，但需要先验证名称作用范围。
- **原生技能**：在现有筛选中区分内置、Hub、本地、外部／创建目录及插件；实际能力决定操作。优先统一详情中的路径、来源和被覆盖信息，不增加卡片说明段落。
- **项目页**：展示项目安装，保留未信任／未识别 Git 根的准确状态；全局继承不计作项目安装。当前项目可能会使用的全局技能可在详情解释，不能混入项目安装数。
- 同名详情显示“当前解析／被覆盖／歧义”及路径，原生禁用如影响多个同名实例需明确范围。

实际适配模型至少需要分别保存：配置档、安装范围／根目录、来源所有者、加载层级／load_name、规则开关、信任／条件／隔离原因、原生来源记录和操作能力。它们是字段，不是在卡片上堆出同等数量的标签。

### 6.3 与当前实现相比的缺口

当前 `src-tauri/src/upstream/hermes.rs` 和 `scripts/inspect-hermes-config.mjs` 已覆盖分类递归、内置名称、全局附加／创建目录及 CLI 地址边界；尚未覆盖完整项目共享目录和信任／Git 根、禁用与渠道、Hub 来源锁、本地修改、预加载、Curator。

因此先修正确库存和可操作性，再加开关。单纯把项目 `.agents/skills` 附加进扫描，会得到文件库存，但仍不能声称 Hermes 已加载。现有 manifest 只按名称识别内置也应在同名／多根时补足路径与来源验证。

## 7. 实施顺序与验收建议

### 第一阶段：只读观察对齐

- 配置档／根目录；项目 Git 根、项目两目录、信任与发现开关。
- 递归、支持目录排除、路径别名、同级歧义、跨级覆盖。
- 真实安装与全局继承分开；来源锁绑定真实路径，保留未知状态。
- 读取 Hub／内置记录及本地变化；不触发 native list 的隐式初始化。

特别注意：`hermes skills list` 的 `do_list` 调用 `ensure_hub_dirs()`，可能创建 `.hub`、lock、tap 和日志；其 parser 没有通用 list JSON 参数。不能把它当纯只读 JSON 库存 API，或解析彩色表格作为权威状态。原生命令执行后也应以目录／锁／内容回读核验。[S05][S23]

### 第二阶段：有限技能配置

- 设置 → Hermes；外部／创建目录、项目发现、信任动作、预加载。
- 单项启停，先明确配置档全渠道，后扩渠道规则；不可停用技能置灰并显示简短原因。
- 写审批设置先可配置；待审批内容的完整审查另行设计。
- 不改共享 SKILL.md，不以“仅手动”名义伪造 Hermes 不支持的等价语义。

### 第三阶段：原生来源生命周期

- 优先 Hub check/update/uninstall，保留本地修改与扫描语义，原生命令支持版本必须检测。
- 内置先提供改动列表／差异／恢复的明确操作；普通更新与本体升级不自动绑定。
- 独立本地技能的可恢复删除、Curator pin/unpin 与归档查看分别授权后接入。
- Bundle、完整 Curator 控制、审批工作台、插件更新和 Agent 本体管理按实际需求再决定。

每阶段的针对性验证：

| 场景 | 必须验证的结果 |
| --- | --- |
| 默认／自定义 HERMES_HOME／配置档 | 配置读写和技能归属不串档，不更改实际会话选择 |
| Git 根、worktree、子目录、无 Git | 观察与真实根一致，不导入全局安装，子目录目标不假称已加载 |
| 信任／不信任／发现关闭 | 文件库存与加载资格分离，添加项目不触发信任写入 |
| 全局禁用／渠道禁用／必需技能 | 正确并集、名称键、全局禁止不能被渠道启用覆盖 |
| 同级歧义／跨级覆盖／链接 | 不自动挑错目标，显示实际路径，不误删原始共享内容 |
| Hub 更新／内置同步 | 区分安装基线、stock 与本地改动；不改另一套锁 |
| 外部目录／Agent 写入 | 前台可能改原目录，Curator 有独立边界，不承诺外部目录只读 |
| YAML 损坏／外部编辑／并发保存 | 保留未知字段，版本核对、原子保存、失败不覆盖，草稿行为与 Pi 一致 |
| reload／新会话 | 配置回读不冒充运行中已加载；按对应版本核验 slash 缓存和会话索引刷新 |

官方存在 project trust/quarantine、disabled/platform、同名解析、Hub 本地编辑保护等针对性测试。本轮是阅读这些测试及其覆盖对象，**没有运行它们，也没有进行 Hermes 会话或联网生命周期验证**。当前公开文档说明技能增删可在下一轮消息通知，slash 列表另有 `/reload-skills`；这不代表一切配置和信任修改都会即时更新当前会话。本轮保留这一运行时验证缺口。

## 8. 证据、约束与交付状态

- 已完成：固定源码、配置默认段落、关键调用与存储路径、代表性测试阅读、与当前适配器边界比较、分阶段建议。
- 未执行：Hermes 源码脚本／测试、安装／更新／卸载／信任／Curator 操作；没有自动改 YAML、`.env`、来源锁或技能内容。
- 传输：使用已有本机 Git 对象，无克隆、无认证操作；一份公开官方文档通过网页读取。完整快照 27 文件和默认段落不等于全仓库覆盖；动态插件、平台会话和原生扫描器依赖均有未执行范围。
- 原有本机 Hermes 工作区的其他删除项未处理；当前 Skills Space 未提交修改保持原状。
- 这是研究提案，不据此改变 CLI 权威或实施范围。现有架构仍见 [ADR 0005](../adr/0005-use-unmodified-upstream-cli.md)，既有检查边界见 [Hermes 检测记录](hermes-skill-inventory.md)。

### 固定源码索引

实施补记（2026-10-17）：用户随后授权的首批目录／信任／启停／预加载现已按 [计划 0008](../specs/0008-hermes-skill-management.md) 实施，验证证据和未做项以该计划为准。上面的“未执行”描述本次研究阶段，不能推导为后续实现未做；后续隔离配置测试也不能推导为运行过 Hermes 会话、Hub 或 Curator。

[S01]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/agent/skill_utils.py#L490-L645 "项目发现、信任和隔离"
[S02]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/agent/skill_utils.py#L381-L488 "加载层级和名称解析"
[S03]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/agent/skill_utils.py#L258-L273 "禁用规则与必需技能"
[S04]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/hermes_cli/skills_config.py#L29-L60 "原生启停配置读写"
[S05]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/hermes_cli/skills_hub.py#L817-L1121 "原生列表、更新与内置操作入口"
[S06]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tools/skills_tool.py#L187-L240 "完整扫描与有效目录；调用检查另见 L543-L590"
[S07]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/agent/skill_utils.py#L89-L194 "系统、环境与应用条件"
[S08]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/agent/skill_utils.py#L320-L377 "附加与创建目录"
[S09]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/agent/skill_commands.py#L853-L897 "会话预加载"
[S10]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/hermes_cli/config_defaults.py#L1451-L1524 "技能与 Curator 默认配置段落"
[S11]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/agent/skill_utils.py#L725-L821 "技能非秘密配置声明和值解析"
[S12]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tools/write_approval.py#L36-L157 "原生写审批和待审批存储；工具入口另见 skill_manager_tool.py L605-L641"
[S13]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/agent/curator.py#L31-L175 "Curator 默认与调度"
[S14]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tools/skill_usage.py#L146-L342 "来源记录、整理资格和 adopt"
[S15]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/hermes_cli/curator.py#L145-L435 "Curator 命令实际作用"
[S16]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/hermes_cli/subcommands/skills.py#L24-L194 "技能子命令参数合同"
[S17]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tools/skills_hub_install.py#L143-L324 "Hub 安装、删除与更新检查"
[S18]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/hermes_cli/profiles.py#L284-L450 "配置档定位"
[S19]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tools/skills_sync.py#L113-L419 "内置同步清单、哈希与保护"
[S20]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tests/agent/test_project_skills.py#L47-L251 "项目发现、信任和隔离测试"
[S21]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tests/hermes_cli/test_skills_config.py#L29-L144 "原生禁用与平台测试"
[S22]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tests/hermes_cli/test_skills_hub.py#L538-L568 "Hub 本地改动保护测试"
[S23]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tools/skills_hub.py#L295-L419 "Hub 锁字段及隐式初始化"
[S24]: https://github.com/NousResearch/hermes-agent/blob/7157422022ff06f3e632d1dd394ee1253b17ad37/tools/skill_manager_tool.py#L336-L641 "原地写入、前台删除与后台归档、写审批"
