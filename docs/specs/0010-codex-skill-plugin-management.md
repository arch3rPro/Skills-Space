# Codex 技能与插件增强适配方案

状态核对：2026-10-28。B1–B4 本地能力及后续批准的插件、市场、默认设置、作用域和界面增量已实施并提交；B5 加载／请求协调的核心修复已完成，B6 已完成受影响页面的分项基线验收，跨平台、全状态及真实账号验证尚未闭合。最近 7 批提交为 `a788089` 至 `0391e9a`；当前待办见 [0004](0004-upstream-capability-completion-plan.md#当前状态与剩余工作2026-10-28)。真实账号 GitHub／Writing Style 的独立授权启停及状态读回仍待验证，不因已有授权入口或本地通过而标记完成。下方对账和“未提交／待用户检查”描述保留原日期，只代表当时检查点。

## 当前实现边界（2026-10-28）

本节与最新交付记录优先于下方初始提案。旧表中的“首批／后续／只读／新增”描述保留原始设计背景，不再作为未实施清单或现有权限判定规则。

| 对象 | 当前实现 | 仍保留的边界 |
| --- | --- | --- |
| Codex 设置 | 用户默认设置通过原版配置接口读写；已有技能规则只读展示、继续生效 | 不重复管理单技能或单插件；不扩展模型／Provider／通用参数管理 |
| 单技能启停 | 保留真实可写技能开关；项目页面按原版 `skills/config/write`，插件技能用原生名称选择器、普通技能用文档路径，并回读状态 | 这是原版技能偏好语义，不伪造项目本地规则。库存归属不能代替配置权限；共享选择器可能影响其他使用者 |
| 本地市场插件 | 全局安装、卸载、更新及默认启停；项目仅管理真实项目启停覆盖和恢复继承 | 普通来源由原版 CLI 管理；已核实内置来源按 ADR 0005 的特定原版 RPC 及配置恢复例外执行，不扩为通用旁路 |
| 官方账号插件 | 独立授权入口、系统凭据存储和按需账号操作代码已接入，保持账号级范围 | 真实 GitHub／Writing Style 启停、工作区路由和读回的独立授权验收未完成；禁止读取／复用现有登录 |
| 内置组件与市场 | 已核实 App 内部组件从普通插件管理排除；市场和插件逐操作判权限 | 不按“内置”统一禁用或统一允许，不删除 App 自动维护组件；压缩包导入／上传明确暂缓 |

## 目标与范围

将现有 Codex 从通用支持提升为增强适配，使用户能在 Skills Space 中识别普通、原生、内置及插件所属技能，按 Codex 实际规则启停技能，并管理已明确支持的插件来源。继续保留现有主题、侧栏、Agent 图标、技能卡片和安装／更新／卸载流程。

采用三个原生入口：普通技能内容交给固定未修改的 `skills@1.7.4`；技能和配置操作交给用户安装的 Codex App Server；本地市场插件生命周期交给该用户的 `codex plugin` CLI。Rust 负责进程、文件观察、协议和结果核验，React 负责页面状态与交互。

本次提案包含插件作为技能分发单元的管理，不扩展到 Codex 本体升级、模型／Provider、认证编辑、MCP 服务器编辑、Hook 编写、远程主机或会话管理。项目配置与工作区策略可读，但本版本不提供项目专属技能启停和自动信任。

## 初始决策清单（后续增量已修订）

| 决策 | 推荐方案 | 理由 |
| --- | --- | --- |
| Agent 身份 | 保留一个 `codex`，记录 CLI／App 检测证据 | 避免两套库存重复管理共享内容 |
| 执行版本 | 使用用户选定／检测到的原版 CLI，首个验证基线 0.162.1 | 不捆绑第二套 Codex，不修改用户安装 |
| 兼容性 | 版本记录加接口能力判断；未知版本保留普通技能功能 | 版本号本身不能证明字段与行为一致，也不应阻断全部管理 |
| 技能发现 | 原生 `skills/list` 加现有物理库存观察 | 有效列表不含所有禁用插件资源，且会真实路径去重 |
| 技能开关 | 默认按准确 SKILL.md 路径，用户级配置 | 项目层 skills.config 在已测版本不参与启停规则 |
| 项目显示 | 管理归属与有效范围分离 | 全局继承不能变成项目安装；项目链接不能因去重消失 |
| 插件生命周期 | 原生 CLI JSON，整包操作 | 官方明确限制生产使用插件管理 RPC |
| 插件内容与普通技能内容 | 一份物理内容只有一个生命周期执行方 | 防止 skills CLI 与 Codex 插件管理器互相覆盖 |
| 调用方式 | 首批只读；不开放修改共享／插件元数据 | 缺少跨版本可靠写接口，不能套用 Pi 规则 |
| 桌面有效性 | 说明已保存配置与已观察库存，不承诺运行中会话已更新 | 独立 App Server 不拥有桌面会话覆盖与全部额外根 |

A—C 已获批准；原生管理例外与插件边界同步记录在 ADR 0005／0007。

## 初始能力与来源矩阵（不是当前权限表）

| 来源 | 查看与定位 | 启停 | 内容安装／更新／卸载 | 首批安排 |
| --- | --- | --- | --- | --- |
| skills CLI 标准安装 | 现有库存加 Codex 状态 | 用户级路径规则 | 原版 skills CLI | 保留并增强 |
| 独立 `$CODEX_HOME/skills` 文件夹 | 原生识别和正文 | 用户级路径规则 | 无可靠来源时不伪造更新；独立文件夹移废纸篓单列后续 | 查看、启停 |
| 项目原生技能 | 物理记录加运行时身份 | 用户级路径规则，说明跨会话影响 | 可由现有同步／原版 CLI 管理的实例沿用原入口 | 查看、启停 |
| 系统与管理员技能 | 标识来源、只读正文 | 首批只读展示实际值 | 由 Codex／管理员负责 | 只读 |
| 本地市场插件技能 | 按插件归组、保留 pluginId | 首批提供插件整包开关；单技能覆盖后续验证 | Codex 整包管理 | 查看、整包管理 |
| Git／npm 市场插件 | 原生命令能识别时查看 | 符合本地配置权限时整包开关 | 各来源通过隔离验收后开放 | 分阶段 |
| 远程目录／工作区插件 | 能可靠观察的身份和来源 | 不以缓存推断可写 | 首批由官方客户端处理 | 只读及明确限制 |
| 内置插件／未知缓存 | 标记来源，不纳入普通卸载候选 | 不猜测配置键 | 不删除缓存或重写内部安装记录 | 只读 |

首批不把未验证动作渲染成“即将支持”或占位按钮。相应能力缺失时保留已支持的查看、原版技能管理和路径定位，具体限制只在用户尝试相关操作或详情需要解释时出现。

## 数据模型

在现有 `InstalledSkill` 增加可选 `codexState`，不重写通用库存。建议最小字段如下，实际命名与 Rust／TypeScript 契约同时确定：

```ts
type CodexSkillState = {
  documentPath: string;          // Exact native identity, normally canonical SKILL.md.
  installationPath: string;      // Observed directory or project link.
  origin: "standalone" | "plugin" | "system" | "admin";
  runtimeScope: "user" | "repo" | "system" | "admin";
  inScope: boolean;              // Management ownership, independent of runtime scope.
  enabled: boolean | null;       // Null when effective state is not established.
  pluginId: string | null;
  canToggle: boolean;
  toggleScope: "user" | null;
  lifecycleOwner: "skills-cli" | "codex-plugin" | "external";
};
```

快照另含执行文件、版本、有效 CODEX_HOME、cwd、配置层版本、errors 和能力结果；不要在每张卡片重复存放完整配置。插件记录独立保存观察值：完整 ID、市场、来源类型、已安装版本、启用状态、安装／认证策略、组件清单和可执行动作。候选版本有独立证据时才填充，不能复制 installedVersion。

`enabled=null` 不等于禁用。已禁用插件导致技能不在有效列表时，可由所属插件禁用状态解释；若只是列表失败，保留库存并标记状态未确认。不要把一次错误写入持久偏好而长期隐藏技能。

一个真实文档可能对应多个安装链接。运行时规则按 `documentPath` 去重，管理操作按安装实例和原有来源记录定位。项目链接指向全局文档时，切换同一文档会影响其他引用该文档的 Codex 上下文，需在现有确认流程列出已知影响；不把真实路径强行改回链接路径以制造项目隔离。

## 原生适配初始方案

### 检测与读取

1. 沿用现有安装检测，保留 CLI／App／仅配置三类证据；可执行路径与版本分别记录。不因检测到 App 就假设其内置 CLI 路径可稳定调用。
2. 确定本次使用的 CODEX_HOME 和 cwd。显示 HOME 为 `~`，执行仍用绝对路径。无法确认桌面与 CLI 根一致时，不声称两个运行端库存相同。
3. Rust 启动独立的 `codex app-server --stdio`，完成 initialize／initialized。不要连接或终止用户正在使用的共享 daemon，不启动模型 turn。
4. 调用 `config/read` 获取相关层版本；调用 `skills/list`，明确传入 cwd 与 `forceReload`。只接收匹配请求 ID 的响应，通知单独处理；设置有限输出、超时和取消，退出时关闭本次拥有的进程。
5. 与原版 skills 库存按规范化文档路径关联，补充原生记录。物理归属依据选中项目和实际链接位置，而不是仅看 native scope。
6. 插件列表采用原版 CLI JSON。已知本地市场可限定 `--marketplace`；全来源列表可能访问网络及缓存，必须作为实际刷新操作处理，不能宣称纯文件扫描。
7. 对不在有效技能列表中的禁用插件，按已验证插件清单／安装根做有界只读补充。只检查原生记录引用的安装实例，不把整个 cache 下所有版本都标为已安装。不执行插件脚本或导入插件模块。

如果原生服务不可用，现有标准技能库存与原版生命周期继续工作；Codex 原生启停及插件相关能力给出具体不可用原因。只读补充不能伪造“已加载”或用终端自然语言解析替代结构化状态。

### 单个技能启停

首批默认面向当前用户配置。项目页保留同样的开关，但它不是项目独立策略：操作对象是该文件在当前 CODEX_HOME 下的规则。对共享文档、项目链接或已有名称规则造成的影响，复用现有确认流程。

写入前读取最新相关配置和目标文档身份。路径选择器使用 `skills/list` 返回的完整文档路径，不能使用文件夹名、技能名或自行拼接的缓存路径。`skills/config/write` 可用于已验证的单项写入，但它的 schema 不含 expectedVersion；不要声称该入口本身具有乐观并发保护。

推荐生产提交路径是通过已有 `config/value/write` 或 `config/batchWrite` 的 expectedVersion 更新用户 `skills.config`：保留其他条目、未知字段和原有顺序，按原生规则将选中路径的显式选择放在有效顺序的末端。实施时必须用原生差分 fixture 对照单项接口；未完成这一验证前，不开放原子批量开关。这里的批量数据组装是配置适配，不是另一套技能生命周期后端。

写入后必须 `forceReload` 并按路径核验 enabled。响应成功但状态未变化时，保留实际状态并报告未生效，不将开关乐观保持在错误值。配置并发冲突保留用户意图，刷新后重新提交，不覆盖外部编辑。首批不新增“恢复默认”按钮；删除覆盖与显式 enabled=true 的含义不同，需要独立验证后再提供。

### 插件安装与卸载

安装以完整 `pluginId`、来源市场和具体插件为确认对象。复用现有任务弹窗，列出所含技能及会影响操作决策的 MCP／Hook／App 组件。只含技能与包含可执行组件的插件不可共用一条含糊的“安装技能”文案。

执行原版 `codex plugin add <id> --json`；成功后核验已安装身份、版本、实际缓存和技能列表。认证需求由官方流程处理；安装成功但尚未授权不伪装为可调用，也不读取或复制用户 token。首批限定已经通过本地隔离验收的市场来源。

卸载在现有确认中说明整包及全部技能影响，执行 `codex plugin remove <id> --json`。同时核对插件列表、缓存和当前有效技能；原生命令失败但部分状态已变化时按实际状态报告部分完成。应用不自行删除插件缓存、内部锁或市场源目录，也不以“禁用”代替卸载。

选择某个插件技能发起卸载时，转为其所属插件的整包确认；批量操作按 pluginId 去重，避免同一插件执行多次。普通技能批量操作继续保留原版 skills CLI 的边界，禁止让它处理插件缓存。

### 插件启停与更新

插件开关优先写用户级 `plugins.<id>.enabled`，使用原生配置版本校验并复读 CLI 列表与技能列表。普通 ID 已在 fixture 验证；含点号等特殊字符的 keyPath 必须增加测试，不能依靠字符串拼接碰运气。工作区强制启用／禁用及远程目录策略不能通过本地 TOML 绕过。

首批从插件详情或原生技能区提供整包开关，技能卡片不重复提供含义不清的逐技能开关。关闭插件会同时影响其技能与其他组件，确认内容必须体现这一点。

更新阶段分开处理：

1. 本地目录：按需读取目标插件，比较完整包版本和内容指纹；检查不改安装内容或原有来源配置。
2. Git 来源：按配置的 URL/ref 在操作临时目录读取真实来源，隔离账号、Git 凭据 helper、SSH 和用户 Git 配置；不调用会连带重装其他插件的 `marketplace upgrade`。不支持匿名读取的来源返回实际失败，不改用旧本地副本冒充远端。
3. 确认更新：重新核对目标安装内容、候选内容与受影响路径规则，将所选包固定在临时目录，通过原版 CLI 的进程级 `marketplaces` 覆盖和 `plugin add` 安装该包。覆盖不写回来源配置；其他插件不更新。
4. 恢复：保留插件启停和单技能选择，按包内相对路径迁移可对应规则；用户已确认无法对应的条目列在原更新确认框，继续时保留旧规则，不猜映射、不删除。无关规则和设置变更不使整次审核失效；原生写入版本保护及真实规则冲突保留。最小待恢复记录支持中断后恢复配置，不重复安装。
5. 没有历史基线不阻止更新，不新增基线诊断提示；候选/安装内容不匹配不能报更新成功。npm、云端供应包不由本批本地来源案例推广；既有远程按需读取与本地动作分开。

现有内容差异和修改保护可复用。缺失辅助记录表示未知，不永久阻止明确确认的原生命令；只有确认冲突或来源不可确定时才限制对应自动动作。不建立新的竞争性安装数据库。

## 页面接入初始安排

遵循 [UI 设计基线](../design/ui-system.md)，本次沿用以下功能布局；应用交互验收结果记录在文末。

- **设置 → 智能体 → Codex**：沿用 Pi／Hermes 的页内详情与返回方式。展示 CLI 路径／版本、配置位置和插件相关设置入口；不新增模型、认证和通用参数页。
- **Codex 技能页**：保留现有托管／原生分区和卡片。卡片沿用已有启停控件；详情标识来源及插件归属。名称重复时用路径／插件区分，不显示 Pi 的同名覆盖文案。
- **原生插件分组**：复用现有来源筛选与紧凑分组，在插件层提供整包开关、查看、安装或卸载。无需新建跨 Agent 全局插件中心。
- **项目范围**：默认库存只显示项目拥有的安装实例；全局继承仅用于计算有效状态与解释影响。当前项目页的用户级开关范围在设置说明或实际影响确认中说明，不给每张卡片增加重复警告。
- **批量动作**：复用已有选择栏与能力判断；跳过不适用项并报告数量，同一真实文档／插件去重。不同后端的操作分别汇总，不承诺跨后端事务。
- **操作结果**：成功、无变化、失败分别反馈；仅保留可操作的异常和实际对象。保存配置不显示“已在当前 Codex 会话生效”。刷新／重启要求放在对应配置入口，不能套用 Pi 的 `/reload`。

UI 一致性验收包括：原主题与品牌图标不变；卡片密度一致；路径使用 `~`；详情不暴露内部 schema／指纹；长插件 ID、窄窗口、大字体、暗浅主题下控件不溢出；失败动作有现有可执行的下一步。完成构建不等于这些视觉检查通过。

## 初始文件级实施范围

| 文件或模块 | 计划修改 |
| --- | --- |
| `src-tauri/src/upstream/codex.rs`，新增 | 运行时识别、独立服务会话、状态读取、配置提交和原生结果适配；仅在长度需要时拆分 |
| `src-tauri/src/upstream.rs` | 可选 Codex 状态、augment、来源与生命周期保护 |
| `src-tauri/src/lib.rs` | 注册实际需要的 Codex 检查、保存、开关和插件操作命令 |
| `src-tauri/src/upstream/detection.rs` | 复用检测并补足经证实的 App／CLI 差异，不推测可执行路径 |
| `src/lib/codex.ts`，新增 | 类型、能力判断、身份关联与状态合并；保持严格类型 |
| `src/lib/upstream.ts` | 原生分类、能力和排序；首批验收后才将 Codex 列为增强适配 |
| `src/lib/agent-skill-actions.ts` | 单项／批量启停、插件粒度判断 |
| `src/components/codex-management.tsx`，新增 | 沿用已有配置页组件和草稿行为 |
| `src/App.tsx` 及现有卡片／详情接入点 | 路由和动作连接，不重构其他 Agent |
| 对应前端及 Rust 测试 | 覆盖下方验收矩阵；不复制 Pi 假设 |
| `docs/specs/0010...`、索引、ADR 0005／0007 | 获批后记录实际范围，验收后同步状态 |

优先使用 Rust 当前依赖解析协议；只有已核实依赖不足时才提出新依赖。不加载 Codex 源码包进应用，不从发行文件中抽取私有函数构成替代加载器。不预先建设通用多 Agent 协议框架。

## 原始分阶段交付与验收

| 阶段 | 可观察交付 | 前置与完成条件 | 当前状态 |
| --- | --- | --- | --- |
| A 原生库存 | 当前 Codex 页面能区分来源、显示准确路径和插件归属 | 原版技能库存无回归，禁用插件资源不丢失，链接归属正确 | 已修正，待用户复查 |
| B 技能配置 | 单项与合格批量启停，用户级影响明确 | 路径匹配、名称规则、并发保护、错误状态及重启持久化通过 | 已修正，待用户复查 |
| C 本地插件 | 本地市场插件安装、整包启停、卸载 | 原生命令闭环、组件影响、失败核验、配置保留通过 | 已修正，待用户复查 |
| D 来源更新 | 本地重装及经验证的 Git／npm 来源能力 | 各来源独立测试，候选与安装版本分离 | 分来源评审实施 |
| E 后续候选 | 独立原生内容废纸篓、调用方式编辑、远程受管理能力 | 形成对应窄范围契约，不作为首批依赖 | 不纳入首批 |

用户已批准 A—C 作为第一批完整增强适配；D 保留明确任务，按来源追加验收。A 单独完成时只能称原生库存已实现，不能称完整增强闭环交付。

### 必须覆盖的验证矩阵

| 类别 | 关键场景 | 预期 |
| --- | --- | --- |
| 路径与范围 | 默认／自定义 HOME、CODEX_HOME，Git 根、子目录、无 Git、共享链接、坏链 | 不混淆全局继承与项目归属，真实身份可追溯 |
| 来源 | 标准 CLI、旧目录、系统、管理员、启用／禁用插件、残留缓存 | 正确展示与操作权限，不把残留当有效安装 |
| 启停 | 文档路径、误传目录、同名、多条 name/path 顺序、会话覆盖 | 写入后以原生结果判定；无意外同名批量影响 |
| 配置层 | 用户、项目 trusted/untrusted、profile、受管理设置 | 不提供无效项目技能开关；保留实际覆盖来源 |
| 并发 | 外部修改、过期版本、连续开关、批量重复目标 | 不丢失外部配置，失败不伪装成功 |
| 插件 | 两技能一插件、同名不同市场、禁用后仍安装、缓存缺失 | 整包确认与去重，来源不混淆 |
| 安装／卸载 | 成功、部分缓存清理失败、超时、取消、CLI 不存在 | 逐项实际结果，无手动删除兜底 |
| 更新 | 已安装／候选版本、同版本变化、本地修改、原禁用状态 | 保留已验证的策略，未知不冒充最新版 |
| 内容保护 | 所有开关前后正文与支持文件哈希 | 仅配置变化，其他 Agent 与 CLI 锁不变 |
| 桌面 | 配置保存、草稿离开、卡片开关、批量、插件整包确认、重新进入 | 操作闭环与持久状态可观察 |
| App／CLI 差异 | CLI-only、App-only、不同配置根／不同版本 | 不将不可确认的桌面状态标为有效 |

实施验证按项目开发指南执行：先原版隔离 fixture 与针对性前端／Rust 测试，再按顺序完成资源 staging、`pnpm build`、`CI=false pnpm tauri build --debug --bundles app`，最后隔离打包应用交互。涉及共享库存／生命周期的改动扩大到受影响 Agent 的回归。真实用户目录只用于明确授权的只读观察，不用作变更测试夹具。

研究阶段已经完成的原生 fixture 不能替代未来应用接入后的测试。现有源码、依赖和执行条件不变的结果可以复用，但新增配置提交、批量和 UI 路径必须验证。测试不需要创建付费模型请求；若要证明技能实际被模型调用，应另行设计明确的运行验收。

## 主要风险与处理

| 风险 | 处理方式 |
| --- | --- |
| 在线文档领先或落后于安装版本 | 记录版本，使用该二进制生成的 schema 与固定源码；差异不自动迁移配置 |
| CLI 可读快照不等于桌面实时状态 | 将持久配置、接口观察、会话生效区分，不声称外部服务能刷新桌面所有会话 |
| 禁用插件后技能不在有效列表 | 保留安装库存与插件身份，不将退出列表误判为卸载 |
| 项目级技能开关实际无效 | 首批只写用户级规则，项目页明确作用域 |
| 配置写入成功但目标未命中 | 复读目标精确文档的 enabled，报告真实结果 |
| 插件缓存被其他生命周期管理 | 通过 owner 和 pluginId 阻止路由到普通 skills 更新／卸载 |
| 插件市场刷新具有网络与缓存副作用 | 用户主动刷新来源，准确命名动作，不放入无提示的普通库存扫描 |
| 原生 CLI 原地升级后契约变化 | 下次操作重新识别版本与能力；相关增强功能受限时保留通用管理 |

## 研究阶段交付记录

研究阶段完成方案、固定源码核查、原生接口 schema 核对及临时 fixture 验证。未修改应用代码、未安装新依赖、未重启应用、未操作真实 Codex 技能／插件、未提交或推送 Git。文档检查不需要应用构建。

该研究阶段的 A—C 范围已获用户批准，实施结果见下节。用户级技能开关、原生 CLI 插件整包管理以及首批不编辑调用方式／项目专属规则的边界保持不变。

## A—C 实施与验收记录（2026-10-21）

- 原生服务独立运行，使用 JSONL、匹配请求 ID、有界消息、20 秒 RPC 超时及子进程清理；不创建模型 turn。插件命令限定已配置市场，不请求远程目录。Git 市场已安装项支持用户级整包启停；安装与卸载仍只对已验收的本地来源开放。
- 历史初版按 `codex-cli 0.162.1` 限制写操作；该限制已由本轮接口能力检查替代。测试版本仅是样本。App-only 不推测内置 CLI 路径。
- 普通技能保留原版 skills CLI；原生库存记录文档身份与实际安装位置，系统／管理员／插件技能不会路由到普通卸载。项目链接即使被 Codex 真实路径去重，也保留项目归属。
- 单项／批量切换通过用户 `skills.config` 的版本校验提交。保留未选规则及未知字段，将选中路径放在末尾；相同文档去重，同名不同文档分别操作。共享／项目／名称规则影响在提交前确认。失败保留待操作意图并刷新实际值。
- 原生 `skills/config/write(enabled=true)` 会移除路径禁用覆盖；存在名称禁用规则时不保证启用。当前 UI 的“启用”是显式路径启用，故使用原生配置写接口，不能声称与“恢复默认”相同。`expectedVersion` 比较配置语义，单纯注释变化不一定构成版本冲突。
- 插件按整包安装／启停／卸载；确认列出完整 ID、来源、技能和已观察组件。多技能选择按 pluginId 去重，逐插件核验与汇总；没有跨插件事务。禁用插件技能使用原生已安装记录所指的版本目录补充，残留缓存不作为安装证据。应用不自行删除插件缓存。
- Codex Agent 的插件管理 Tab 复用 quiet Tabs、库存卡片、Switch、搜索与批量栏；技能详情的所属插件操作放在标题更多菜单。技能正文及其他 Agent 元数据不因开关而改写。
- 本地市场先由官方 Codex 配置；本轮不新增市场注册表编辑器。来源更新、独立目录废纸篓、调用策略编辑仍不开放。

验收结果：

- `pnpm test:frontend-contracts`：181 项通过，包含 Codex 能力、来源归属、动作边界及既有前端契约。提示检查识别 `ProjectSkillList` 的语义标题属性，不将其误判为原生 tooltip。
- Rust 默认库测试：179 项通过，5 项按原有外部环境条件忽略。首次受限沙箱中 12 项网络／进程测试失败，使用允许本地监听与子进程清理的执行环境重跑后全部通过。
- 原版 `codex-cli 0.162.1` 专用隔离闭环另行通过：配置未知字段／正文／辅助文件保留、同名规则与精确路径、真实配置版本冲突、全局／项目链接、自定义 CODEX_HOME、含点号插件 ID，以及安装／启停／卸载。默认忽略项中该项已单独运行，其余 4 项未运行。
- `pnpm build` 与 `CI=false pnpm tauri build --debug --bundles app` 按顺序通过；保留现有 Vite 大 chunk 提示。最终包位于 `src-tauri/target/debug/bundle/macos/Skills Space.app`。
- 隔离打包应用验证：独立技能启停、同名技能按文档分别选择、重启持久化、项目共享影响确认、外部配置冲突与刷新重试、插件安装／整包启停／多技能选择去重／卸载均通过。最终包确认禁用插件保留限定名称与描述，卸载当前筛选插件后自动恢复全部来源。
- 设计基线检查：沿用 Pi 页内设置和现有卡片、开关、批量栏、确认弹窗；检查 1280×800、960×640、明暗主题、大字号及长插件 ID。操作可见、长 ID 可换行，HOME 显示为 `~`。没有更换侧栏、主题或 Agent 图标。
- 测试变更仅作用于临时 HOME／CODEX_HOME；夹具技能正文哈希与外部配置编辑保留。既有未提交改动保留，未提交或推送。

上述验证覆盖配置与原生库存闭环，没有发起模型请求，也不代表已经运行的 Codex App 会话自动重新加载技能。D—E、Git／npm 插件安装／卸载及远程目录浏览仍不在本次交付范围；整包启停以最新修正记录为准。

## 用户检查后的复查更正

上一轮隔离 fixture 与构建通过不代表真实插件来源覆盖或设计基线符合性。当前产品验收未通过；具体问题、证据、未验证项及修正方向见[整体复查](../research/codex-implementation-audit-2026-10-21.md)。历史测试结果保留，但不得再据此宣称 A—C 完整验收完成。

## 上一轮修正与验证（历史，部分决策已被最终范围替代）

用户明确批准 Agent 页面独立“插件管理”Tab。插件生命周期从设置中移出，移除没有配置编辑功能的 Codex 设置入口。技能详情的所属插件操作进入标题更多菜单，定位并保留返回上下文；技能批量栏不再混入插件启停与整包卸载。

启停权限与安装／卸载权限分离。Git 市场已安装插件可通过原生用户配置启停；本地来源生命周期边界保持独立。原生列表不可获得的已配置插件保留配置行和启停，安装状态不作推断、不扫描残留缓存。插件列表与技能库存共享一次读取的快照。失败后保留未完成意图，缺失列表不是操作成功证据。

本轮验证：

- Codex／共享库存／动作契约：47 项通过；Hermes 回归 16 项、原生提示检查 1 项通过。扩展前端套件在 DSH 的 11 项配置测试处失败；只读诊断 `installedRuntime()` 返回 anchor=null，无法取得测试依赖的原版 DSH Node 包接口。这三个相关 DSH 脚本与本轮起点哈希一致，未将其修改纳入本任务，也未将全套标记为通过。
- 原版 Codex 0.162.1 隔离集成测试通过：本地插件安装／启停／卸载、真实 Git 市场安装后的用户级启停、禁用后两个技能保留、未知市场配置行不冒充安装证据、配置启停不改其他插件，以及原有名称规则／精确路径／冲突校验。Git fixture 通过临时 HOME 的 URL rewrite 访问本地 Git 仓库，不操作真实市场。
- 最终 `pnpm build`、`CI=false pnpm tauri build --debug --bundles app` 通过。Vite 仍有现有的大 chunk 提示。未重跑完整 Rust 库测试；针对性原版 fixture 与构建编译覆盖本轮 native 改动。
- 隔离打包应用观察：独立插件 Tab；Git 插件单项停用、批量启用及选择保留；重启后状态保留；本地插件安装与卸载；技能详情正文无新增管理块，标题菜单定位所属插件并返回原详情；设置页不再有 Codex 配置空壳。
- 视觉检查修复了插件网格缺失和共享 Tabs 与 Radix 实际 `data-state`／`data-orientation` 不匹配的问题。已观察默认窗口三列、960×640 两列、深色／浅色、18px 大字号、长名称省略和按钮可达。共享设置 Tabs 的切换亦已检查；未宣称所有主题和所有页面状态均完成验收。
- 最终应用位于 `src-tauri/target/debug/bundle/macos/Skills Space.app`；临时 HOME／CODEX_HOME 的验收窗口保留。真实插件配置未用于变更测试，原技能正文保持，其他未提交改动保留，未提交或推送。

本轮待用户检查，不沿用或覆盖上一轮被否定的产品验收结论。


## 最终范围与验收（2026-10-21）

### 页面职责

| 位置 | 本轮实现 | 明确边界 |
| --- | --- | --- |
| 设置 → 智能体 → Codex | 用户级名称／完整 SKILL.md 路径规则，排序、启停值、移除覆盖、草稿保存／放弃／离开保护 | 移除覆盖恢复继承，不等于强制启用；系统／管理员匹配规则只读；插件内 user/repo 技能允许路径／名称规则；不写项目规则 |
| Codex Agent → 插件管理 | 来源、已配置／已安装状态、整包确认、已核实插件启停、合格本地来源安装／卸载 | 不能管理的操作置灰并解释原因；可隐藏完全不可管理项，偏好仅影响显示，不改 Codex 配置；无外部跳转 |
| 技能列表／详情 | 独立技能准确路径启停、合格批量动作、现有生命周期 | 插件技能只在标题菜单定位应用内所属插件；正文无管理入口，不提供单技能整包卸载 |

设置页复用 Pi 的页内设置、Field、ActionMenu、保存与草稿离开模式。插件页复用 quiet Tabs、库存 Card、工具栏、Switch、批量栏及整包确认弹窗。隐藏筛选不会改变可管理插件的启停权限；Git 已安装插件如可核实用户配置和原生状态可启停，安装／卸载仍留在既定本地来源范围。

### App 与 CLI 的通用适配

- 保留一个 Codex Agent。App 与 CLI 使用相同配置根时共享配置效果；不同配置根不合并，也不声称桌面当前会话已刷新。
- 依据检测到的原版 CLI 生成的 schema 检查版本校验写入和名称规则能力，缓存键包含可执行文件身份与元数据；版本字符串只展示，不作为允许名单。路径通过运行环境发现，不嵌入测试机器路径。
- `config/read`、`skills/list`、`config/value/write` 通过独立 stdio 子进程使用公开协议，不启用实验 API，不连接或关闭桌面内部服务。插件生命周期使用原生 CLI JSON；不调用仍处于开发阶段的插件管理 RPC。
- 通过 `plugin marketplace list --json` 纳入原生接口报告的默认市场，不按固定市场名排除。保留配置可证实的身份；缺失安装证据、受策略或其他层控制的项不宣称可管理。
- 读取 portable `plugin.json` 固定 skills/mcp 目录及 `extensions.com.openai` 兼容覆盖，保留旧版 manifest 支持；不扫描残留缓存推断安装状态。
- App 检测区分 Codex 产品身份与普通 ChatGPT 应用；不会将安装了 ChatGPT 当成原生 CLI 可用。只有 App、没有公开 CLI 入口时，普通技能管理继续可用，原生配置与插件管理报告不可用，不调用内置私有二进制，不添加跳转。不能由公开接口观察的云端插件不会伪造库存。

### 数据与验证边界

配置写入携带原生 expectedVersion，保持未编辑规则与未知字段，保存后复读实际规则和原生状态。禁止更改受保护规则及其相对位置。技能规则改变不写技能正文、支持文件、其他 Agent 或原版 skills 锁。隐藏偏好向后兼容旧配置，并独立持久化。

本轮验证结果：

- `pnpm test:upstream`：49 项通过；Pi／Hermes 前端状态回归 14 项通过；原生 title 提示检查 1 项通过。
- Codex 相关 Rust 测试（含明确选择的原版 CLI 隔离 fixture）：4 项通过，覆盖规则保存／恢复继承／顺序效果／过期版本、插件本地安装／启停／卸载、Git 已安装插件启停、不可核实配置拒绝操作、portable manifest、Codex App 产品身份与正文／支持文件保留。Preferences 测试 7 项通过，含旧配置默认值与隐藏偏好持久化。
- 最终 `pnpm build` 与 `CI=false pnpm tauri build --debug --bundles app` 顺序通过；保留原有 Vite 大 chunk 提示。pnpm 更新检查受网络限制，不影响构建成功。未将未运行的完整前端／Rust 套件列为通过。
- 隔离打包应用：设置入口、空规则校验、名称匹配数量、保存并离开、移除路径覆盖、外部配置冲突时草稿保留、重新读取前放弃确认、本地插件安装／卸载、原生插件停用、不可管理插件置灰／隐藏均通过。重启后规则、插件停用和隐藏偏好保留；插件 Tab 当轮数量按全部已识别项计算；该口径在下文四项反馈修正中废止。测试未创建模型 turn。
- 视觉：1280×800 的浅色及深色启动状态，规则编辑器、库存卡片、长插件名省略、草稿确认弹窗均已观察。动态主题切换时曾观察到部分控件旧颜色残留，重启后渲染正常；未修改共享主题代码，也不将动态切换视为完整通过。窗口拖拽缩放工具两次返回 `noWindowsAvailable`，本轮窄窗口及大字号组合仍待手动复查，不沿用旧轮结果冒充本轮通过。
- 115 个既有未提交文件的起点哈希对照：102 个未涉及文件字节未变，13 个属于本轮 Codex 接入及文档调整；无文件丢失。另有本轮新增配置／能力／规则文件及原先干净的检测和偏好模块修改。`git diff --check` 和文档引用检查通过；未暂存、提交或推送。

最终应用：`src-tauri/target/debug/bundle/macos/Skills Space.app`。保留独立临时 HOME／CODEX_HOME 的验收窗口供检查；原版测试样本版本不是产品允许名单。App-only、不同桌面配置根及云端库存的接口边界见上文，不能由本次 CLI fixture 推导出桌面会话实时加载已验证。

### 功能补齐（2026-10-21，待用户检查）

保持上述职责和授权范围，本次补齐以下行为：

- 原生接口不可用与空库存分开。找不到 CLI 时设置页／插件页显示明确原因；普通技能生命周期仍保留。App-only 不通过私有接口或捆绑二进制路径冒充原生管理能力。
- 插件列表、市场列表、安装、卸载分别检查命令接口；配置写入继续检查原生 schema。缺失某个接口不自动授予其他操作权限，不按本机版本建立允许名单。
- 读取失败保留本次会话已知插件、规则与纯 Codex 原生技能状态；暂停过期操作。部分插件读取失败保留缺失插件身份，完整读取成功后以新库存为准。不保留其他 Agent 已消失的物理记录，不将旧库存持久化为新的事实。
- 插件命令结束后核验目标状态；命令报错但安装内容已核实的操作计为完成。卸载需同时确认安装状态、原缓存消失及技能移除；列表缺失不构成成功。批量失败保留未完成项，避免重复执行已核实完成项。
- 安装记录、内容核实与授权策略分别保留。带 MCP／App 组件的插件显示实际授权未确认；ON_INSTALL／ON_USE 只说明策略，不表示已完成授权。
- 已知但不可管理项继续置灰并支持隐藏，无外部管理跳转。未安装记录统一标为“未安装”，避免将不可安装记录描述为可安装。

本次验证：

- `pnpm test:upstream` 52 项通过；Pi／Hermes 前端状态回归 14 项通过。
- Codex Rust 测试 4 项通过，原版 CLI 隔离 fixture 新增“原生命令实际安装成功后返回非零”的场景，确认适配器根据已核实内容判断成功。既有安装／启停／卸载、规则与正文保留断言继续通过。
- `pnpm build` 与 `CI=false pnpm tauri build --debug --bundles app` 顺序通过。仍有 Vite 大 chunk 提示；未运行完整前端／Rust 套件。
- 新打包应用在临时 HOME／CODEX_HOME 中验证：5 个已知插件正常显示；模拟 CLI 读取失败后卡片保留、启停和安装禁用；恢复 CLI 后刷新恢复合格操作；未知来源仍禁用。测试包装器已恢复，原技能正文哈希未变。
- 静态检查复用 Empty／Card／Hint／Switch，未新增外部跳转和主题样式。观察了 1280×800 深色插件页、三列卡片、长名称、未知来源和故障恢复。App-only 首次空状态、浅色／窄窗／大字号组合本次未做窗口验证；不将此前结果当作本次完整验收。
- 其余已确认范围未扩大。云端／仅 App 内可见且没有可用公开第三方接口的完整库存和授权实态仍不可取得，不虚构条目。插件升级、Git/npm 生命周期及市场源维护继续不在本次范围。

构建产物仍为 `src-tauri/target/debug/bundle/macos/Skills Space.app`，独立验收应用保留在插件页。本轮未暂存、提交或推送；其他未提交改动保留。

### 设计基线回归修正（2026-10-21，待用户检查）

本次以原有通用设计约束和用户明确确认范围修正实现，不扩充设计规则。删除 `docs/design/ui-system.md` 中未经逐项确认却标为“用户确认”的 Codex 专用章节；同文件其他任务的修改保留。先前验收记录不得被解读为本轮视觉合规的证据。

实现调整：

- 从现有 `skillCards()` 提取原有标题／信息／开关、描述和底部元数据／动作结构为 `InventoryCardHeader` 与 `InventoryCardFooter`，技能和插件共同使用。保留原 Card inventory 变体、两行描述高度、底部动作间距及普通技能点击／批量选择语义；不另定 Codex 卡片尺寸或颜色。
- Codex 开关的 Hint 使用稳定外层代理，阻止 Tooltip 的 data-state 覆盖 Switch 的 checked 状态。公共 Switch 原有颜色、尺寸、主题文件保持不变。只读／未知技能保留禁用控件和具体说明，读取失败不再移除控件。
- 插件页使用现有 InventoryToolbar、SkillBatchToggleControls 和图标按钮规格；禁用安装／卸载有可聚焦说明代理；信息提示位于标题旁，版本／安装状态不混入重复授权说明。插件只在所属 Tab 管理。
- 插件定位后的返回操作移到已有页面标题行；详情保留统一正文结构。Codex 草稿弹窗保存期间阻止 Escape 关闭，无法写入时禁用“保存并继续”。继续使用共享 AlertDialog 与原滚动布局。

本轮证据：

- 组件渲染回归复现原缺陷：Hint 直接包装启用 Switch 时 data-state 被覆盖为 closed；改用稳定代理后，checked/unchecked 与 enabled/disabled 四种组合保留正确原生状态。
- 库存／Codex／Agent 动作契约 52 项、Pi／Hermes 状态回归 14 项、弹窗检查 9 项、提示检查 1 项通过。首次编译暴露的局部变量引用和未使用导入已修复，最终 `pnpm build`、`CI=false pnpm tauri build --debug --bundles app` 均通过；仍有既有 Vite chunk 大小提示。native 逻辑未变，本次未重跑 Rust 套件。
- 独立打包应用、临时 HOME／CODEX_HOME：观察 1280×800 深色及 960×640 深／浅色、较大字号；技能／插件已启用开关为相同绿色，禁用状态使用原组件透明度。插件两列布局、长名称截断、工具栏自动收起次要标签、普通技能卡片和 Pi 对照卡片均已检查。
- 观察并操作插件整包启用确认与完成状态、插件技能详情及菜单定位／标题返回、规则草稿离开确认和放弃。未改写真实用户 Agent 配置；隔离技能正文哈希保持不变。动态切换后截图曾捕捉到控件过渡帧，稳定页面截图与可访问状态一致；不以过渡帧声称持久状态错误或绕过验收。
- 本轮不声称覆盖全部配色和所有窗口组合。保留最终应用及隔离验收窗口供用户检查；不暂存、提交或推送。


## 四项反馈修正（2026-10-21，待用户检查）

本节覆盖此前与本节冲突的插件技能只读、插件全量计数和仅本地库存结论；不修改 UI 设计基线。

- 技能卡片保留共享标题、信息提示、Switch、来源页脚结构。Codex 不再在标题提示区重复“插件分组”；来源页脚继续保留插件身份。其他 Agent 的原有提示不变。
- 插件内 user/repo 技能恢复独立路径开关、批量技能开关和设置规则编辑。原生所属插件停用时技能不能反向启用整包；系统／管理员规则仍受保护。技能正文和插件内容不改写，不提供按技能卸载整包。
- 原生技能增加全部／已启用／已停用／状态未确认筛选，与来源、搜索交集；切换 Agent／作用域或清除筛选恢复默认。未知状态不归到已停用。
- 插件页使用原有 Choice 筛选已安装插件、可安装插件、内置／默认组件和状态未确认记录；已安装列表另有启用／停用状态筛选。原来 App 内的 Choice 原样提取共享，没有新增控件样式。
- 插件 Tab 数量只计算已确认安装的用户插件，不受搜索、状态及隐藏不可管理项影响。默认列出用户已安装项；可安装项和默认组件仍可通过原有筛选控件查看，不和该数字混算。
- 本地合格来源仍用原版 CLI 安装／卸载；已安装本地内容的插件保留经过资格验证的整包启停。远程项可证实身份／状态，但当前远程写操作置灰、支持隐藏，无外跳。
- 全局原版 CLI JSON 补足远程安装记录；生产代码不使用仍受官方限制的插件 RPC，不直接访问私有后端。当前样本对账为 4 个用户插件、17 个内置／默认组件；详见[最新核验](../research/codex-skills-plugins-review-2026-10-21.md#四项反馈的最新核验2026-10-21)。不写死这两个数字或插件名单。

本轮验证：

- 前端库存／Codex／Agent 动作 54 项、Pi／Hermes 状态回归 14 项、弹窗／提示检查 10 项通过；共享 Switch 的 checked/disabled 四组合静态渲染检查通过。
- Codex Rust 默认测试 3 项通过；显式选择原版 CLI 的临时 HOME 测试通过，新增单技能关闭不影响同包其他技能／整包状态，以及整包停用再启用保留单技能覆盖。另以本次只读 CLI JSON 调用产品解析函数，断言截图四个 ID 的集合完全相同，输出 4 用户插件＋17 内置／默认组件。
- `pnpm build` 通过；最终 `CI=false pnpm tauri build --debug --bundles app` 包含 staging、TypeScript、Vite 和 Rust 编译。保留既有 Vite 大 chunk 提示；pnpm 自更新检查的网络提示不影响构建。
- 隔离打包应用、临时 HOME／CODEX_HOME：插件 alpha 独立停用后 beta 与整包保持启用，重启后 alpha 为关闭灰色、beta 与整包为开启绿色；没有重复插件分组提示；原生状态筛选出现，停用筛选对应 alpha 和原有两个停用技能；插件默认已安装数 1，可安装列表另显示 3 项且 Tab 数量仍为 1。原技能正文哈希一致，未变更真实插件配置。
- UI 复核采用 1280×800 与 960×640 浅色、大字号状态；窄窗口技能／插件卡片使用共享布局，工具栏沿用原有横向滚动。初次桌面自动化遇到 AX／截图刷新不一致；重新启动并绑定最终验收副本后，已确认下拉菜单选择及关闭、已停用技能筛选、可安装插件分类、未知状态置灰、隐藏不可管理项和清除筛选。最终窄窗口停用技能截图中三项均为灰色关闭。未重测所有主题组合。
- 全局 CLI 冷目录读取样本耗时约 78 秒，超过原本本地命令的 45 秒限时；全局只读库存单独设 120 秒有界超时。本地生命周期命令仍保持原超时。读取失败保留本地状态和明确的不完整标记，不以缺失远程项证明已卸载。
- 与本轮开工哈希比较：125 个原有脏文件／未跟踪文件中 116 个未变，9 个变化均为本次 Codex 修正及文档；新增 `catalog.rs` 和复用的 `choice.tsx`。设计基线未变。未暂存、提交或推送。

最终构建：`src-tauri/target/debug/bundle/macos/Skills Space.app`。本轮交付待用户检查；自动化测试和构建不替代用户的最终产品验收。

## 卡片元数据与目录打开修正（2026-10-21，待用户检查）

- Codex 原生技能卡片标题使用原生 `interface.displayName`；所属插件使用 manifest 的 `interface.displayName`，来源图标使用插件声明的 composerIcon／logo。名称缺失时保留可核实名称，图标缺失／无法加载时使用原有占位图标。显示名与规则、启停及生命周期所用内部身份分离；搜索支持技能和插件显示名。
- 插件卡片中间显示 `interface.shortDescription`／description，左下角显示 author／developerName；未提供时明确显示缺失状态。继续复用共享 InventoryCardHeader／Footer、Card、Switch、Hint，无新增布局、配色和设计条款。
- 根因：原“打开目录”同步调用 inventory_context，点击也会重新读取所有 Agent 和插件目录。现改为后台验证所选本地目录／Markdown 所在目录后直接打开，不再运行库存扫描或访问远程市场；不存在、相对路径和非 Markdown 普通文件仍拒绝。
- 插件元数据仅由已核实的安装／来源读取，兼容现有 portable 与 Codex／Claude manifest。图片只读取声明且位于插件目录内的小图片，不放宽任意文件协议权限，不绑定本机路径或版本。

验证结果：

- 库存／Codex／Agent 动作测试 56 项通过；Codex Rust 默认测试 4 项通过、目录处理测试 1 项通过；显式选择原版 CLI 的隔离安装／单技能启停／整包启停／卸载测试通过，并核实显示名、介绍、作者和图标字段。默认跳过的目录捕获测试本轮未重跑。
- Pi／Hermes 状态回归 14 项、弹窗／提示检查 10 项通过。未运行完整 Rust／前端套件。
- 最终 `pnpm build`、`CI=false pnpm tauri build --debug --bundles app` 均通过；仍有既有 Vite 大 chunk 提示。
- 隔离打包应用（临时 HOME／CODEX_HOME、1280×800 浅色大字号）：技能标题“示例技能 Alpha”、页脚“演示插件”及声明的紫色图标实际可见，显示名称搜索仅返回匹配技能；插件卡片中间为介绍，左下角为 Fixture Author，保留共享绿色开关。
- 点击 alpha 和 beta 卡片目录按钮后，Finder 均显示正确缓存技能目录和 SKILL.md。首次合并桌面工具调用耗时 106 秒，无法归因于应用；拆开后第二次点击工具返回 37ms、点击加页面状态读取共约 0.52 秒，下一次 Finder 读取约 0.12 秒并确认 beta 目录。上述为工具观测，非端到端性能基准；代码路径已确认不再扫描库存。
- 本轮未重测全部配色与窗口尺寸，不改写真实 Agent 配置。设计基线与其他任务原有改动保持开工哈希；未暂存、提交或推送。最终产物：`src-tauri/target/debug/bundle/macos/Skills Space.app`，隔离验收副本保留在插件页。

## 技能自身图标与 Agent 加载修正（2026-10-21，待用户检查）

本节覆盖上一节“技能卡片使用插件图标”的错误解释。用户明确确认：技能卡片优先使用技能自身声明图标，缺失时恢复原有默认图标，不使用所属插件图标代替。

- 原生 skills/list 的 interface.iconSmall／iconLarge 为技能自身图片路径；仅读取位于该技能目录内的声明图片，保留现有图片体积和格式限制。图标损坏／缺失时回退原 SourceIcon，来源文字仍使用插件显示名称。
- 全局和项目库存原来均通过 codex::augment 等待完整远程插件目录。普通 Agent 页、技能规则设置、技能启停现在只读取本地原生状态；首次打开插件 Tab 或点击其刷新时才显式请求完整目录。没有使用私有 RPC、持久化陈旧状态或新增后台服务。
- 完整目录尚未确认时插件数量显示原有未知占位，不把本地子集显示为完整数量；打开插件 Tab 后仍保留原有目录核验、不可管理项置灰和隐藏规则。
- 回归 fixture 在完整目录命令注入 2 秒延迟：修复前基础 Codex 库存耗时 2.51 秒并断言失败；修复后全局约 0.45 秒、项目约 0.09 秒，均未调用完整目录命令。显式插件目录读取仍调用该命令。此测量仅为隔离 Codex 库存步骤，不代表所有 Agent 或真实网络下的整页加载时间。

本轮验证：

- Codex 原生测试 6 项通过（包含显式原版 CLI 隔离生命周期和慢目录回归）；前端契约 56 项、Pi／Hermes 状态 14 项、弹窗／提示 10 项通过。未运行完整测试套件。
- `pnpm build`、`CI=false pnpm tauri build --debug --bundles app` 均通过，保留既有 Vite chunk 提示。
- 最终隔离应用，1280×800 浅色大字号：Alpha 显示自身橙色图标、Beta 使用默认包图标，均不使用插件紫色图标；系统技能使用各自声明图标。原有卡片／Switch／来源文字布局保持。
- QA 原版 CLI 包装器在远程目录注入 3 秒延迟并记录调用：启动、全局 Codex、项目 Codex、项目 Pi 均正常显示且远程调用数为 0；打开插件 Tab 后目录读取完成，调用数为 1，插件数量恢复 1；返回技能页正常。测试包装器已恢复为原 CLI 链接，真实用户配置未修改，fixture 原技能正文哈希未变。
- 未重测所有主题和窄窗口；未声称真实大库存下所有耗时已消除。本轮修改移除已复现的远程目录阻塞因素。设计基线与其他任务改动保留，未暂存、提交或推送。

## 标题图标与详情修正、更新机制方案（2026-10-21）

用户明确纠正技能图标的位置：技能自身图标应在卡片标题左侧；页脚仍为来源图标和来源名称。现已使用原共享卡片标题中的按钮内容承载图标，16px、不改变共享 Card／Switch／页脚结构；缺失技能图标使用默认包图标。Codex 原生详情标题改用显示名称；内部 name、path 和 Markdown 正文不改。详情更多操作移除 Codex 启用／停用，保留卡片开关和所属插件入口。

用户随后要求先核实 hash 与更新机制，不能只隐藏未知版本。故本轮没有执行此前“无版本就隐藏”的显示方案，现有版本行暂留，版本与内容指纹的完整改造作为新方案待批准。详见[哈希、安装版本与更新机制补充核验](../research/codex-skills-plugins-review-2026-10-21.md#哈希安装版本与更新机制补充核验2026-10-21)。该方案明确安装版本、候选版本、本地内容指纹与来源 revision，独立技能复用来源生命周期、插件按整包更新，不将原生列表刷新冒充检查更新。

本轮验证：

- `pnpm build` 与 `CI=false pnpm tauri build --debug --bundles app` 通过；既有 Vite chunk 提示保留。前端契约 56 项、弹窗／提示 10 项通过。未更改 Rust 运行逻辑，未重跑完整 Rust 套件。
- 已打开独立临时 HOME 的新构建，核对浅色技能卡片标题自身图标、页脚来源图标、详情显示名称与菜单无启停；卡片原有开关保留。未重测全部主题／窗口尺寸。
- 更新调研以原版 CLI 的新隔离 fixture 核实同版本内容变动、候选版本变化、list 不更新缓存、add 更新版本却重新启用整包及名称规则保留。未把这项实验当作生产更新功能完成。
- 设计基线未改，其他任务改动保留；未暂存、提交或推送。最终构建产物仍为 `src-tauri/target/debug/bundle/macos/Skills Space.app`。

### 本地插件检查、整包更新与内容指纹（2026-10-21）

用户已批准研究文档中的首批本地方案。本轮实现：

- Codex 原生技能详情沿用原元信息行：插件技能显示实际安装插件版本；原生技能显示当前目录 SHA-256 内容指纹，短值沿用既有版本格式，完整值可通过共享提示读取。托管独立技能保留原版 skills CLI 的版本／差异／更新流程。
- 插件 Tab 原卡片底部增加检查／更新动作，介绍和作者位置不变；标题提示合并安装版本及检查结果。只检查已核实的本地市场／本地来源插件；内置、Git、远程目录及其他未支持来源不开放更新，不跳转。
- 检查区分来源一致、来源版本不同、同版本内容变化、来源移除与无法检查，不将非 SemVer 标识不同强称为新版本。不写配置、缓存或更新记录。
- 整包确认复用共享 AlertDialog、Hint、FlowError 和原卡片更新颜色。展示安装／来源版本、两侧指纹及本地来源；缺少基线或存在本地改动时明确说明覆盖影响。
- 原版 Codex `plugin add` 执行更新；执行前重新核验来源、当前安装内容、配置 revision 与基线。安装前保存恢复记录，安装后恢复整包启停，按预先核实的相对技能路径迁移规则，保留名称规则、扩展字段和无关并发规则。路径别名在安装前规范化，不依赖旧缓存更新后仍存在。
- 规则冲突／映射缺失不静默丢弃。恢复中断可从同一检查入口重试配置恢复，不重复安装；安装未成功但配置已恢复时回到可重新检查／确认的流程。验证内容和配置后才保存新基线并清除恢复记录。
- 恢复记录位于动态 CODEX_HOME 下 `skills-space/plugin-updates/`，按插件身份散列分文件原子写入；它只保存更新基线与恢复信息，不替代原生安装记录或生命周期。
- 检查与更新由用户操作触发；不加入全局／项目 Agent 初次加载。详情复用原有文档读取结果，未新增后台更新轮询。

验证完成：57 项前端合同、10 项弹窗／提示测试通过；10 项 Codex 原生针对性测试通过，最终候选组件字段调整后受影响的 4 项更新测试再次通过。原生测试使用显式选择的原版 CLI 和临时 HOME／市场，包含只读检查不改变配置／缓存／记录、确认过期、停用插件保留、同名技能路径规则、同版本内容变化、原命令失败、恢复记录重新读取、冲突保留／修复后仅恢复配置、无关并发规则、来源消失，以及全局／项目 Agent 不等待远程目录。依赖外部库存捕获文件的可选测试未运行，未宣称全量测试通过。

最终 `pnpm build` 与 `CI=false pnpm tauri build --debug --bundles app` 均通过；保留原有 Vite 大块提示。隔离打包应用实际走通：1.0.0 → 1.1.0 来源变更后旧确认被拒绝、重新检查／更新成功、原插件停用保留；再次启用后 Alpha 停用／Beta 启用。文件回读确认两条路径规则迁移及新内容基线，最终包重启后配置字节保持不变。同版本来源内容更新也通过应用完成；制造安装目录本地改动后，确认正确提示覆盖，取消未覆盖改动。详情实际显示显示名称、插件版本 1.1.0 和独立内容指纹，更多菜单无启停。

视觉实际观察覆盖浅色／深色详情和更新弹窗、18px 大字号及系统半屏后的较窄窗口；路径换行、底部按钮、共享提示与卡片动作位置符合既有组合。未声称覆盖全部主题、所有屏幕尺寸或 960×640 最小窗口。截图服务早期返回旧帧的观察不计入视觉验收，切换测试窗口所在屏幕后取得的当前画面才作为证据。

设计基线与任务开始时字节一致；其他任务改动保留，无提交。Git 市场刷新／更新、npm 与 App 私有更新接口不在本轮实现范围。日常应用实例未被重启，最终包在原构建输出目录，隔离 QA 窗口保留供检查。

## 管理能力与列表修正（2026-10-22）

本节覆盖此前“内置／默认组件统一只读”和“默认仅显示用户插件”的实现安排；设计基线保持不变。

- 默认已安装列表与计数包含全部已确认安装的插件和内置／默认组件。类型筛选为已安装、可安装、全部记录；启用／停用／安装待确认属于状态筛选，安装待确认切到全部记录，避免与已安装条件矛盾。仅发现配置记录不能推断未安装、未授权或异常。
- 本地内置插件根据原生安装策略、配置权限和 CLI 能力开放安装、启停、卸载。默认安装策略不提供单独卸载。Git 市场的整包安装／卸载也由原版 CLI 执行，更新检查不因此自动开放。
- GitHub、Writing Style 等原生远程目录插件接入原版 CLI 安装／卸载；操作前后读取完整原生目录并验证状态。确认框说明账号层面影响。未核实远程启停写接口时开关明确置灰，提示具体接口限制，不称插件本身不可管理，不调用私有 API，也不以卸载代替停用。
- 本地来源更新检查使用独立 `canCheckUpdates`；远程与运行时组件不再显示“尚未检查”。已安装插件不再显示授权策略推测；授权策略不能阻断其他操作。
- 远程目录只在插件页面与需要它的插件操作时读取。普通全局／项目 Agent 加载不请求目录；同一配置版本的本地刷新保留已确认目录记录，完整目录读取失败仍禁用陈旧操作。
- 原生 CLI、配置版本校验、操作后观察仍为执行边界；不绑定本机路径或版本，不修改其他任务文件，不提交。

验证结果在本节完成记录中列出。远程账号真实安装／卸载与运行中 Codex App 会话同步不由隔离测试代替。


### 本轮完成记录

- 通过：前端契约 59 项，Codex 原生针对性测试 13 项，提示／弹窗相关 10 项，`pnpm build`，`CI=false pnpm tauri build --debug --bundles app`，`git diff --check`。构建仅保留已有的包体大小警告。
- 原版 CLI 隔离验证：本地内置标签插件的安装、停用、启用、卸载；原有本地／Git 市场技能规则保留；整包更新和规则迁移。远程生命周期使用原版 CLI 配置配合模拟目录／命令结果验证适配器前后读回与拒绝虚假开关，不能替代真实账号服务端验收。
- 实际隔离应用：默认四个测试条目包括一个本地内置组件、GitHub／Writing Style 目录展示样本及一个默认远程组件；内置停用后重启仍停用，重新启用后远程卸载保持可用；隐藏仅移除完全不可管理项；安装待确认筛选、远程确认说明与取消路径已观察。
- 静态设计检查：继续复用 InventoryCard、Switch、Choice、Hint、AlertDialog；设计基线与组件目录本轮字节未变。浅色默认字号、深色较大字号、约 960px 窄窗口卡片和工具栏已观察，窄工具栏沿用横向滚动。截图对瞬时弹层存在更新延迟，确认弹窗以无障碍树和操作结果核实，最终视觉细节仍需用户检查。
- 未执行：真实账号的 GitHub／Writing Style 安装、卸载、账号连接或 App 会话同步；未修改真实插件验证动作。未实现：远程插件真正启停、远程版本更新检查。它们继续准确置灰并可隐藏，不以本地配置成功或卸载冒充停用。
- 测试启动曾因临时路径经过 `/var` 符号链接触发 Tauri 资源定位限制；改用规范化的真实路径后恢复。临时诊断代码全部撤回；不修改产品安全设置，不增加运行时补丁。

## 数量、加载、筛选与检查入口修正（2026-10-22，后续用户反馈）

本节记录此前实现；全量市场目录与进入 Agent 自动请求的安排已由下节用户范围纠正撤回，不能继续作为实施要求。

- 插件集合为“全部插件 / 已安装 / 可安装”，默认全部。配置记录不等于安装记录，不进入插件卡片或数量；不提供“安装待确认”状态选项。状态筛选只描述已安装插件的启用/停用，可安装集合不叠加启停条件。
- 进入 Codex Agent 后后台读取目录，初始已有本地插件数量直接显示，未取得初始数据时用加载状态，不以完整目录成功作为显示数量的前提。读取期间已有有效卡片可操作；操作会使较早的后台返回失效，避免覆盖新状态。
- 完整目录单独允许最大 32 MiB stdout，其他命令原有 2 MiB 限制不变。目录合并按身份集合去重，避免逐项遍历整个目录；每页 24 个插件，复用已有上一页/下一页组合，搜索覆盖整个目录，批量全选针对当前页。
- 移除“部分信息未能读取…”常驻笼统提示。真实目录错误通过现有通知报告并保留刷新重试入口；首次本地读取尚未请求远程目录不能被当成错误。未取得新状态的旧记录不伪造操作成功。
- 列表不再计算所有插件整包内容哈希；配置/插件身份仍检查，内容指纹在详情和主动更新检查中按需计算。
- 原生技能来源拆分“本地目录”“内置技能”，插件项为“插件: 显示名称”，操作身份仍使用原 pluginId。管理员技能存在时单列。原生列表未载入的已安装插件技能明确显示“未载入”，与真正读取失败区分，不伪造可启停状态。
- 可比较本地来源的内置与 Git 市场插件开放内容比较；检查和更新能力分开判断。Git 比较标明只检查本地市场副本、未查询远端。取消在每张无检查能力的卡片信息中重复“暂不支持检查更新”，限制仅在对应动作说明。
- 已通过隔离实验确认原版市场 upgrade 会更新已安装插件；因此本轮不将其接入检查按钮。远端最新版本检查、整市场更新及远程真正启停仍未完成，不能据本地比较结果宣称最新版。

验证结果：

- 通过：前端契约 60 项、Codex 原生 14 项（含真实原版 CLI 隔离规则/更新验证及 9000 项、超过 2 MiB 的目录读取与合并回归）、提示/弹窗 10 项；`pnpm build`、`CI=false pnpm tauri build --debug --bundles app`。保留已有 Vite 大包提醒。
- 新构建的隔离应用观察：进入 Codex 后未点击插件页即显示 34 条测试记录；默认全部插件，第一页 24 条、第二页 10 条，搜索从第二页找到第一页的 Writing Style；已安装恰为 4 条，配置孤立项不混入。内置插件检查完成并显示来源一致；状态选项仅全部/启用/停用；来源菜单区分本地/内置/插件显示名，内置筛选仅显示系统技能。
- 注入目录失败后：本地内置操作仍可用，旧远程动作暂停，通知可重试；恢复测试目录并点击刷新后远程动作恢复。没有执行真实账号远程安装/卸载。普通页面没有此前笼统的常驻提示。
- 浅色 1280px 窗口实际观察卡片、开关、来源筛选菜单；复用原共享控件和分页按钮，未修改设计基线/组件目录。本轮没有重新验证所有主题和窄窗口，不将静态检查算成完整视觉验收。
- 本机读取耗时是只读样本，不构成其他机器/项目的性能保证。临时计时与诊断日志代码已移除。未提交，保留其他任务改动。


## 已识别插件范围修正（2026-10-22）

用户明确撤回全量市场目录，不增加插件发现功能。默认“全部插件”仅展示本地已识别记录及原生接口确认的远程已安装插件/组件；“已安装”按安装事实筛选，“可安装”仅展示已有身份且当前支持安装的条目。Tab 数量只统计确认已安装项，不随搜索或隐藏条件改变。

- 远程读取改为原版 `plugin list --json`，不再请求全量 `--available`，且丢弃未请求的 available 返回。已配置本地市场的定向读取保留，不扩展未知远程市场。
- Agent 技能页仅使用库存中的本地快照；进入插件 Tab 才补读远程安装状态，每次激活/范围至多一次，手动刷新可重读。原版 CLI 的 installed 查询内部仍可能访问远程目录服务，此上游行为无法仅靠移除参数避免；不会阻塞 Agent 本地列表。
- 当前进程内保留原生接口已确认的远程身份；完整已安装结果确认其不存在后，才允许作为已识别可安装项使用。失败读取不推断卸载。安装/卸载仍由原版 CLI 执行并读回验证，不写插件缓存或安装记录。退出应用后不持久保存这些已卸载身份；不增加插件历史库。
- 撤回为全量市场增加的分页；继续复用共享卡片、筛选和批量选择。设计基线不修改。

本轮验证：前端契约 60 项、Codex 原生测试 14 项通过；`pnpm build` 与 `CI=false pnpm tauri build --debug --bundles app` 通过。额外运行隔离慢远程读取测试，全局本地快照约 368 ms、项目约 91 ms，均没有请求远程列表（仅为该夹具样本）。此前 34 条/9000 条全量目录验证不再代表正确产品范围。

隔离打包应用已观察：进入 Agent 不请求远程列表，进入插件 Tab 后只显示 4 个已安装项；注入的 8000 条未请求目录记录不入表、不计数。卸载远程样本后数量变为 3，“可安装”仅展示该已识别样本；重新安装后数量回到 4，可安装列表为空。注入读取失败时数量保留为 4、本地动作可用、远程动作暂停，恢复后刷新重新开放远程动作。测试不访问真实账号；远程生命周期由隔离模拟接口验证，不能替代真实服务授权验收。浅色默认窗口确认使用原卡片/筛选控件，设计基线字节未变；本轮未重测全部主题和窄窗口。

## 插件详情与单插件管理页面（2026-10-23）

用户根据 Codex App 截图确认分成两个页面，继续沿用本项目设计基线：

- 插件列表点击卡片/标题进入详情。详情展示插件显示名、图标、开发者、长介绍、实际声明的示例、所属技能及功能/分类/版本/网站；缺失的可选字段不造值。
- “管理”进入单插件管理页，“查看详情”返回详情。管理页复用安装、卸载和检查更新流程；插件级启停保留在列表；技能开关保持独立，点击技能进入现有技能详情，返回保留原插件页面。返回列表保留搜索和筛选。
- 管理页“关于”显示实际分类、开发者、版本、市场和来源，HOME 简写为 `~`。技能图标仍来自技能自身，插件图标只用于插件身份。
- 选中插件后才读取本地 manifest 与技能展示元数据，不调用账号/凭据接口，不扫描远程市场，不给 Agent 基础加载增加详情读取。安装状态和操作权限仍来自现有快照；未安装技能可浏览，但不伪造启停状态。
- 不加入“立即试用”、对话执行、生成宣传图或新管理后端；示例仅为 manifest 中的静态说明。设计基线和共享组件样式不改。

验证结果：

- 前端契约 63 项、本地详情读取 Rust 测试 2 项通过，覆盖真实技能元数据、同名不同路径、现有独立启停状态优先及未安装预览不可写。前端构建和 macOS debug 应用构建通过。
- 隔离打包应用实际验证：列表→详情→管理→技能详情→返回管理；插件停用时单技能独立启用；卸载后显示来源技能预览且无启停开关；从同页重新安装恢复管理；重启后插件开启、单技能关闭分别保留；返回列表保留“已启用”筛选。
- 注入本地 manifest 解析失败后，现有技能仍可浏览，错误使用共享 FlowError 与重试；恢复文件后点击重试恢复介绍与信息。未使用真实用户插件作为写入样本。
- 实际观察浅色/深色、默认与 960px 窄窗口、较大字号；共享 Card、Button、Switch、BackButton 和确认弹窗保留项目样式。较长来源路径正常换行。本轮未变更设计基线，未新增依赖，未提交。
- 本轮没有对真实云端插件执行安装/卸载，也未验证所有系统平台、主题组合；既有接入边界保持不变。

### 插件页面与弹窗一致性修正（2026-10-23）

按用户五项截图反馈修正，不改变已确认功能和设计基线：

- 详情和管理的技能列表移除行间分割线，使用有内边距的圆角整行悬停/焦点背景；管理页背景覆盖技能身份、开关及详情箭头，操作仍分别独立。
- 两页默认显示六个技能，其余使用共享 Button 展开/收起；标题数量始终显示全部技能数。展开控件具有 `aria-expanded` 和对应内容标识。
- 示例仍原样读取本地插件 manifest 的 `interface.defaultPrompt`，无字段时不补示例。背景参考用户提供的 Codex 截图，用实际插件图标形成静态模糊背景并叠加主题渐变；示例条使用实际插件身份和主题颜色，无对话执行或虚假试用操作。
- 安装、卸载、启停及跨项目技能确认继续用共享 AlertDialog/AlertDialogBody，合并重复组件/技能数量，路径正常换行；不修改现有后果说明和确认流程。
- 更新/恢复弹窗保留共享布局；不同版本用单行箭头比较，相同版本不重复展示两行。实际内容变化单独简述；来源、内容指纹收进可展开“更新详情”。无法自动对应的路径规则和失败重试仍直接可见，沿用已确认的保留原规则语义。
- 同时审查 Codex 设置离开确认：其既有取消、不保存、保存并继续及紧凑布局符合共享结构，本轮未修改。恢复/失败分支完成静态审查，未重新制造配置恢复故障。

验证：`pnpm test:upstream` 63 项、`pnpm test:overlays` 1 项、TypeScript 检查、`pnpm build`、`CI=false pnpm tauri build --debug --bundles app` 与 `git diff --check` 通过；保留已有 Vite 大 chunk 提醒。原生生命周期实现未变，本轮不重复宣称原生全面验收。

隔离打包应用使用临时 HOME、App-only 原版运行端和八技能插件，实际确认六项/八项展开收起、管理行背景覆盖开关/箭头、独立停用、安装/卸载确认和执行、未安装预览不伪造开关、重新安装后独立状态保留。同版本内容变化和 1.0.0→2.0.0 版本比较都已在真实确认框观察；展开可读取来源/指纹，删除候选技能时原路径规则说明直接可见，取消不改变安装版本。观察浅色/深色、1280px 默认与 960px 窄窗口、较大字号，长路径正常换行、操作按钮可达。没有操作真实插件或账号，未提交。

组件文档查询的 CLI 遇到 registry DNS 失败，改用官方 Card、Button、Alert Dialog 文档并对照本地实现；未新增依赖或共享组件。基线与本轮修改前的副本逐字节一致。日志和隔离脚本位于 `.scratch/codex-plugin-refinement/`；不将单一平台的检查等同于所有主题/系统组合验收。

## 用户批准的市场管理增量（2026-10-23）

用户明确将此前暂缓的市场源管理加入本批：插件 Tab 增加“管理市场”，查看实际发现/配置的市场，添加本地目录或公开 Git 来源，保留 Git 引用和稀疏路径，移除用户可管理的来源。Codex 设置仍只负责技能规则；不增加账号、凭据、全量远程发现、创建插件或 MCP 配置。

- 市场页按需读取，不进入 Agent 基础加载路径。增删委托发现的原版 Codex 运行端；支持 CLI 和 App-only，不绑定本机路径或版本，不另存市场注册库。操作后以原生列表和配置读回结果为准。
- 原生命令列表无法读取某个目录时，保留真实配置中的注册项，仍可添加有效来源、移除损坏来源。实际读取失败使用共享错误与重试；不伪造完整发现结果，不把错误作为核心增删的永久前置门槛。
- 系统/项目/默认目录来源可查看，仅实际用户配置且无其他层冲突的来源可移除。移除确认说明真实影响；保留已安装缓存、技能规则和原始本地目录。
- 添加表单复用共享紧凑 Modal、Field、Input、Textarea 和目录选择；移除复用 AlertDialog。来源、引用、稀疏路径按顺序排列，本地目录禁用不适用的 Git 选项。HOME 显示为 `~`，执行仍使用绝对路径；错误保留表单，支持修改后按 Enter 重试。设计基线和共享组件不改。
- 不读取用户账号或凭据：本地原版运行端使用临时认证存储；公开 Git 使用空环境、临时 HOME，禁用用户/系统 Git 配置、凭据 helper 和交互。内嵌凭据和 SSH 来源不纳入本批公开 Git 范围。
- 修正插件来源检查对原生 `marketplaces.*.ref` 字段的读取，兼容已有 `ref_name`，新增指定引用的市场不会误用默认分支。
- 市场升级仅调研，未加入按钮。官方当前 App Server 与 CLI 共享核心升级方法，刷新选定 Git 市场，并可能刷新该市场中已配置插件缓存；不能简化为全应用插件更新，也不能视为只读列表刷新。完整证据见[专项调研](../research/codex-marketplace-upgrade-review-2026-10-23.md)。现有单插件检查和整包更新保留。

验证：前端契约 63 项通过；原生市场测试 2 项通过，覆盖真实 CLI 本地/Git 增删、重复添加、指定引用与稀疏路径、默认来源不可移除、目录损坏时继续管理，以及已安装技能内容/启停规则/无关配置保留。更新模块专项 5 项通过、2 项保留忽略（本轮未运行），Git 引用检查另在原生市场测试中实际覆盖。`pnpm build`、`CI=false pnpm tauri build --debug --bundles app`、`git diff --check` 通过；保留已有 Vite 大 chunk 提醒。

隔离打包应用实际观察：无效目录提交失败后保留表单，修正后 Enter 添加成功，返回插件页可安装项出现而已安装数量仍为 0；重启注册仍在；移除后列表读回为空，原始目录保留。最终构建另测损坏来源存在时仍可添加有效市场，移除损坏来源后读取错误消失，有效来源仍在。测试只使用临时 HOME、App-only 原版运行端、匿名本地 Git 服务和读取即阻塞的假认证文件，没有修改真实插件/账号。

观察浅色/深色、默认与 960px 窄窗口、较大字号下的添加/移除弹窗，字段和按钮可达，长路径换行；最终数据边界修正后复测实际增删。与本轮开始的副本逐字节比较确认 UI 基线未变。未验证所有平台/主题或真实外网仓库；不将隔离样本等同于完整产品验收。日志位于 `.scratch/codex-market-management/`。保留其他未提交改动，未提交，待用户检查。


### 2026-10-23 — Plugin management actions and legacy marketplace repair

- Removed the plugin-level enable switch from the selected plugin management header. Individual skill switches and existing list/batch actions remain available. Check/update uses the shared outline Button with its actual icon and visible label.
- Reproduced the mattpocock check-update failure in the running application. Its source declares `.claude-plugin/marketplace.json`; update preparation previously required `.agents/plugins/marketplace.json`. Both source checking and marketplace display now read the supported legacy format when the preferred file is absent. Invalid preferred metadata and paths escaping the source still fail explicitly.
- The installed mattpocock 1.3.1 manifest declares no plugin icon and the package supplies no image asset. Its existing generic package icon is the intentional fallback; no author or brand image was fabricated.
- Passed: `pnpm build`, `CI=false pnpm tauri build --debug --bundles app`, 63 frontend contracts, 16 regular Codex native tests, and 3 explicitly enabled original-CLI update fixtures (native/legacy Git marketplace and local update). Loopback fixtures initially hit the sandbox port restriction and passed unchanged with local networking permission.
- Packaged-app acceptance used an isolated HOME and a copy of the actual mattpocock package: 27 skills loaded, header actions matched the request, and a fixture source change from 1.3.1 to 1.3.2 opened the existing update review. Cancel left the installed package unchanged. Real user plugin content, settings and installation were not modified. Screenshots: `.scratch/plugin-management-fix/management.png` and `update-review.png`. A real GitHub fetch for this specific repository was not repeated; Git behavior was covered by the anonymous local origin fixtures.

### 2026-10-23 — Follow-up: Git source links in mattpocock

The earlier installed-package fixture omitted the source repository's `AGENTS.md -> CLAUDE.md` link. A legacy Git marketplace fixture preserving this layout reproduced `Plugin source content cannot be read.` after the manifest-format repair. Source preparation now mirrors the original Codex store's regular-file/directory copy semantics: links are skipped without following their targets, then the frozen candidate is fingerprinted. Installed-content fingerprint rules remain unchanged. Freezing retains bounded entry/byte limits.

Passed: all 9 update-module tests including explicitly selected original CLI local/Git update fixtures, with the legacy Git fixture now retaining the source link. The source-copy regression also covers internal, escaping, dangling and cyclic links without reading or copying their targets. `CI=false pnpm tauri build --debug --bundles app` and `git diff --check` passed. The current project app was restarted into that build, then the real mattpocock check fetched `https://github.com/mattpocock/skills.git (HEAD)` and opened the existing update review successfully: installed version 1.3.1, same candidate version, changed content (`aab4b4e` versus `0ac14b3`). The app was left at the review; no plugin update was confirmed. Evidence: `.scratch/plugin-symlink-fix/real-source-check.png`.


### 2026-10-24 — Permission semantics audit (research only)

The user requested a detailed reconciliation of official plugin permissions and this adapter's capabilities. See the [operation matrix and implementation audit](../research/codex-plugin-permissions-audit-2026-10-24.md). Existing `can*` flags describe the adapter's present execution eligibility; they do not establish official product support or user authorization. Remote enablement, policy provenance, configuration precedence, unknown diagnostics and hidden/uninstallable collections require separate assessment. This audit supersedes earlier blanket interpretations of “remote unsupported” or “unmanageable”; it does not claim those missing operations have been implemented. Runtime code and real plugin settings were not changed in this research increment. Proposed implementation steps remain pending selection.


### 2026-10-24 — Per-action permissions, filtering and quiet controls

User approved the permission audit's first implementation stage and remote-toggle investigation. The detailed permission model is now attached to each plugin as `permissions.install/toggle/uninstall/checkUpdates`, separately classifying available, restricted, overridden, unknown, not-integrated and inapplicable actions. Existing `can*` fields remain execution eligibility, not claims about official product support. Original install policy and its source are preserved without treating non-null provenance as a blanket ban.

- Only active configuration layers above the user layer can shadow a user toggle; lower-priority system defaults and disabled layers no longer block it. Project enabled overrides no longer automatically deny installation/uninstallation. User configuration read-only state remains enforced for lifecycle writes.
- Missing/unknown policy stays unknown. A default-install record without policy provenance does not manufacture a confirmed uninstall restriction. Known workspace/canonical default policy retains its restriction. Original CLI remains execution authority and results must still be read back.
- Filter is now “隐藏受限插件”: only positively restricted/inapplicable action sets are hidden. Unknown, stale and not-integrated records remain visible. The available collection includes native known-available rows even when adapter execution is not connected; it does not claim to fetch the full remote catalog.
- Cards and management headers no longer render unavailable update/install/uninstall buttons with technical limitation tooltips. Remote/unwritable toggles show their observed Enabled/Disabled state, not a fake interactive switch. A stale observation is labelled Unconfirmed. Action tooltips only name actions; relevant settings guidance lives in the existing About fields. No new modal, settings surface or fallback terminal flow was added.
- GitHub/Writing Style read-only qualification used the original CLI with invocation-only enabled=false and enabled=true config overrides. Both returned native enabled=true in both cases, matching fixed-source remote state precedence. This does not mutate remote settings and does not prove a real toggle. The public TUI config write and remote merge paths were rechecked; no confirmed remote mutation route was found in the audited public interface. Remote toggle remains `notIntegrated`, not an official denial. Automated access to the Codex app itself was explicitly blocked by the computer-use tool; manual comparison was requested while other verification continued. No private desktop credentials/service endpoint was reused.

Verification: 64 frontend contracts, 19 regular Codex native tests, 5 explicitly enabled original CLI configuration/update fixtures, and 1 overlay contract passed; the strengthened policy regression passed separately. `pnpm build`, `CI=false pnpm tauri build --debug --bundles app`, and `git diff --check` passed. Isolated packaged-app checks confirmed the list/filter/detail/manage presentation. Real-app restart was rejected by automatic approval review because of potential unsaved state; the running real instance remains on the previous build. User selected later manual verification for official App toggles. No Git commit was made.


### 2026-10-24 — Remote-toggle implementation gap corrected

The user rejected treating hidden buttons as resolution of remote enablement. Static inspection of the installed official App identified its real account-service calls: POST `/ps/plugins/{plugin_id}/enable` and `/disable`; local plugins use `config/batchWrite`. Exact evidence, App/standalone CLI version differences and pending authorization/verification requirements are in the audit's final correction. Remote enablement remains unimplemented in Skills Space; earlier UI/permission work is not acceptance of that feature. No private service request, credential extraction or real-plugin mutation was performed in this investigation. The existing no-private-API boundary remains until a reviewed change to the integration contract.


### 2026-10-24 — Account-service scope approved; sensitive-data boundary remains

The user explicitly authorized implementing the official App's account-service enable/disable/readback chain for GitHub and Writing Style, while prohibiting reads of sensitive user information. This supersedes the earlier no-private-service scope limit for this specific feature; it does not authorize extracting or reusing desktop tokens, cookies, keychain entries, private sessions, or reading user conversations/profile data.

Preflight has not established an executable authorization path: the checked App Server schema offers neither remote enable/disable nor a general authenticated HTTP request broker. Public Sign in with ChatGPT documents identity scopes and separately authorized Responses API access; no plugin-management scope/resource/client-registration contract was found. The protected App's internal HTTP client cannot be treated as an available integration. User clarification is pending on whether independently authorized app-owned credentials may be handled by trusted runtime code without being exposed to the agent/logs; even approval of that boundary would not prove plugin-management scope is granted.

No production remote toggle, fake switch, generic OAuth login UI, anonymous/private-service mutation attempt, or token reader was added. Implementation requires either a supported explicit plugin-management authorization contract or an authorized credential-opaque broker. The required acceptance sequence remains: identify the exact remote plugin/account/workspace, submit enable/disable, read authoritative installed state from the same context, verify a new process observes it, and handle failures without optimistic false success. GitHub and Writing Style must both pass; no real account lifecycle test has been performed in this increment.

Sources checked: [Sign in with ChatGPT scopes](https://developers.openai.com/siwc/quickstart#understand-scopes), [OSS sign-in resource and scopes](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [App Server](https://learn.chatgpt.com/docs/app-server), plus locally generated schema for App CLI 0.164.0-alpha.11.1. This increment changed documentation only; no runtime build was required.


#### Independent authorization clarified and anonymous discovery checked

The user confirmed: independent user-granted authorization is allowed; existing Codex credentials must not be read. This is the selected boundary, not a pending permission question. No existing-login extraction is authorized.

Unauthenticated requests used no Cookie or Authorization headers: ChatGPT's installed-plugin read route and protected-resource discovery returned HTTP 403 without WWW-Authenticate metadata; this is not evidence of a user permission denial or proof of unsupported authorization. OpenAI OIDC discovery returned public authorization/token endpoints and identity/offline scopes, but no plugin-management grant. No enable/disable mutation was attempted. Public OSS registration documents an api.openai.com resource and inference scopes, so that flow cannot be silently repurposed for the internal account plugin routes.

The concrete integration prerequisite remains unfulfilled: a supported client registration/resource/scope for account plugin management, or a credential-opaque authenticated broker covering enable/disable/readback. User approval of independent credentials does not supply this missing server-side contract. No runtime implementation was added in this increment because an identity-only OAuth screen or mock-only service adapter would not close the requested real feature. Documentation and references were checked; no runtime build was required.


#### Native authentication trace and independent-login probe

The latest investigation supersedes the earlier stop at missing public third-party scope documentation. The shipped App obtains its HTTP bearer from its own App Server through legacy `getAuthStatus(includeToken=true)`, which is absent from the checked modern schema. Its native network layer also discovers `workspaceRouting` before sending account-service requests; account identity and routed backend must match.

Both original CLI 0.162.1 and embedded 0.164.0-alpha.11.1 generated independent PKCE login requests in fresh HOME/CODEX_HOME with explicit ephemeral credentials. Their requested scopes include `api.connectors.read api.connectors.invoke`, in addition to identity/offline scopes. This establishes an executable original-CLI authentication entry, not proof of plugin-write authorization.

The user completed the first independent sign-in. A default-origin installed GET returned HTML HTTP 403 without an API error code or OAuth challenge; no toggle was attempted. The first probe omitted the newly found workspace routing, so its failure cannot establish an authorization denial. Its process exited and new ephemeral credentials were destroyed. A second isolated probe now includes routed backend/account consistency and original `plugin/installed` read comparison, with seven recovery/routing fixture checks passed. User sign-in and actual service acceptance remain pending. Production remote toggles remain unimplemented; no existing credentials were accessed. See the audit's latest section for evidence and subsequent results.

The user subsequently selected later authorization. The second waiting probe and its owned App Server were closed through cleanup before sign-in; no account-service read or toggle was sent in that probe. A fresh independent login request is required when verification resumes.


### 2026-10-24 — On-demand authorization and app-owned sign-in persistence

The user requested an in-app authorization dialog at enable/disable and other account operations, then clarified that authorization must survive repeated actions and application restarts. The previous temporary research probe remains deferred; these requirements authorize implementing the real application flow without requesting another login in chat.

- Remote plugin enable/disable/install/uninstall checks independent account authorization at the operation entry. Missing/expired authorization opens the shared Modal, showing the intended plugin/action and account-wide effect. It offers Authorize and continue or Cancel, supports browser waiting and failure/retry, and clears pending intent when cancelled or the target context changes. Local skill/plugin operations retain their existing flow.
- The original App Server owns browser login, PKCE, callbacks and token refresh. Tokens never cross frontend IPC or enter application logs. Native requests follow the discovered workspace backend, use the actual remote ID, submit enable/disable, then read authoritative installed state. A confirmed 401 gets one original-CLI refresh and retry. HTML 403 remains a gateway failure rather than an asserted scope denial; transient service failures do not force reauthorization.
- Valid authorization is reused. A dedicated `codex-account` CODEX_HOME under this application's data directory selects a separate original-CLI keyring record. Explicit `cli_auth_credentials_store="keyring"` is checked in effective configuration; no automatic/plaintext fallback is enabled. The system user's HOME is retained only for OS credential-store discovery, while cwd/TMPDIR and CODEX_HOME remain application-owned and inherited authentication variables are cleared. No desktop login store is copied, enumerated, or read by the adapter.
- App exit closes the owned process and removes its temporary workspace while keeping the app-owned keyring record. The next action restores this record through the original CLI without opening a browser. Codex settings shows authorization status and Sign out; this calls logout against only the app-owned CODEX_HOME. Signing out, revoked authorization or a permanent refresh failure requires a new independent login.
- After a new login, enable/disable continues against refreshed plugin state. Install/uninstall returns to the existing operation confirmation before execution, preserving component review and destructive consent. The previously removed management-header enable control remains removed; inventory switches now have a real native execution path instead of being hidden as unsupported.

Implementation entries: `codex/account.rs`, `codex/rpc.rs`, `use-codex-authorization.ts`, `codex-authorization-dialog.tsx`, `codex-account-connection.tsx`, the existing management hook and settings. No runtime dependencies were added.

Verification: 87 frontend contracts and 22 regular Codex native tests passed. Selected original-CLI fixtures passed for fresh independent login/cancel, independent keyring save -> process restart -> restore -> logout, local config/plugin lifecycle (standalone and App-only discovery), and refusing unauthenticated remote operations without using the previous CLI mutation path. The keyring fixture used a new disposable namespace and an intentionally invalid test key, made no model/account-business call, verified no plaintext auth.json, and deleted its own record. Initial test failures exposed a missing temporary CODEX_HOME and OS keychain discovery failing with a temporary HOME; both were corrected and rechecked.

Isolated packaged-app observation: GitHub/Writing Style switches and GitHub uninstall open the authorization dialog; Cancel/Escape keeps enabled state; a fake original-CLI login failure renders retry without opening a real login page; local mattpocock opens its original confirmation. Screenshots are in `.scratch/codex-auth-dialog/`. This is not proof of real ChatGPT refresh or real plugin-service writes. The user chose later authorization, so GitHub/Writing Style server acceptance and runtime effects remain unverified. Final build and settings-row observation are recorded in the audit below as they finish. No commit or real-app restart is authorized by this record.


Final validation: `pnpm build`, `CI=false pnpm tauri build --debug --bundles app`, local documentation references and `git diff --check` passed, retaining the existing Vite chunk-size notice. The final isolated app restored a simulated authorized status after restart, showed operation confirmation without another authorization prompt, and displayed Not authorized after Sign out. The UI fixture contained no credentials; actual OS-keyring persistence was tested separately with the disposable original-CLI record. All real-account plugin-service and ChatGPT refresh acceptance remains deferred, as do exhaustive theme/viewport checks. The real app was not restarted and no changes were committed.


### 2026-10-24 — Remove redundant card grouping notice and restricted-plugin hiding

The user requested removing the shared skill-card “Plugin group” notice and the persistent “Hide restricted plugins” switch. The shared card no longer adds the grouping notice, including Skill Space's native Codex cards; footer source identity remains. Plugin visibility no longer filters by action restrictions. Search, collection/status filters and each operation's actual permissions remain unchanged.

The former preference is removed from frontend state and serialization. Native preferences still accept its old JSON boolean as a deserialization-only compatibility field because the preferences contract rejects unknown fields; the value has no consumer and is omitted on subsequent saves. This preserves older settings without restoring hidden plugins after an upgrade. The existing filtering test now requires restricted, unintegrated and unknown plugins to remain visible. Validation results are recorded after the current build completes. No lifecycle, account authorization or skill-path behavior is changed.


Validation for this removal: 64 related frontend contracts and 7 native preference tests passed. The retired true setting is accepted under the strict preference schema and omitted when serialized; no remaining frontend consumer can apply it. `pnpm build`, `CI=false pnpm tauri build --debug --bundles app`, local references and `git diff --check` passed. The isolated packaged app opened Skill Space -> Native skills and Codex -> Plugins: native mattpocock cards retained their source footer without the grouping information control; plugin search, collection/status filters, refresh, marketplace management and per-plugin controls remained, with no Hide restricted plugins switch. No account or plugin operation was executed. The isolated app was closed; the real app was not restarted and changes remain uncommitted.


### 2026-10-24 — Marketplace provider identity and accurate plugin skill content

Market rows now distinguish App built-in, Runtime-provided and User-added sources using both the original identity and canonical directory suffix. Other discovered/project configuration sources retain a separate Configuration-provided label rather than being misclassified as user-added. An official provider can also have an explicit user registration; the two facts are displayed separately. Removal availability follows the original CLI, writable base-user registration and absence of other enabled-layer references, independently from contained plugin permissions. Unsupported actions are omitted instead of rendered as disabled explanation buttons. User-registration revisions are checked again before removal, followed by registration readback. Provider-removal confirmation describes unregistering while retaining the provider; ordinary removal preserves local source directories and installed plugin content/rules. Market upgrade remains outside this increment.

The plugin collection starts at Installed, including after Agent/target changes. All/Available remain usable. Plugin actions continue to use individual native policy and configuration/account eligibility; the market provider label adds no blanket restriction.

Skill inspection now records whether bounded enumeration completed. Installed-plugin skill documents come only from the installation; a source fallback cannot masquerade as installed content. A same-name, same-version source is compared by relative document paths to detect files missing from the installed copy; a newer source version is not labelled damage. Detail read failures retain Retry and no false zero. Loading uses Skeleton without a numeric zero; unavailable content has an explicit unread state. Confirmed tool-only packages omit the empty skill section and show their existing component types. No real package/cache repair or credential access is part of this change.

Validation: 65 related frontend contracts and 24 ordinary Codex native tests passed (15 opt-in tests not part of that ordinary run). A new isolated original-CLI fixture passed against both standalone 0.162.1 and App 0.164.0-alpha.11.1: App/runtime user registrations can be removed without deleting provider manifests. Frontend and Tauri debug app builds passed, retaining the existing Vite chunk-size notice. Isolated packaged-app checks verified provider labels, omitted default-source Remove action, runtime registration removal/readback, retained runtime source, Installed default and All exposing an uninstalled package, missing installed skill content, tool-only content and unread remote content. Error/Retry was observed without a false zero. No real account writes, existing credentials or real plugin mutations were used. Remaining exhaustive theme/viewport coverage and real account service acceptance are not claimed. Changes are uncommitted; the real application has not been restarted.

Final regression evidence: the existing original-CLI local/Git marketplace add/remove fixture and the App-bundled plugin install/disable/enable/uninstall fixture also passed. In the final isolated app, a deliberately malformed test manifest produced Retry without an empty skill card or numeric zero; restoring that test manifest and selecting Retry recovered the component information. The isolated app was then closed. Documentation links and diff checks passed.


### 2026-10-24 — Correct source labels and skill previews after user rejection

The previous increment incorrectly exposed “installed copy missing files” diagnostics as product copy and labelled provider-managed marketplaces User-added solely because a user configuration record existed. Those UI decisions are superseded: each marketplace shows exactly one source label; configuration registration remains internal action-eligibility data. Removal confirmation no longer attributes automatic registration to the user.

When inventory has confirmed that the same-name, same-version source contains additional skill documents, the detail page browses that source package instead of displaying a cache diagnostic. The native detail command rechecks the expected version; a changed source requires refreshing. Source previews remain unloaded (`enabled: null`, no invocation control), and source/cache relative document identities deduplicate actual native skills while retaining native enabled state and permissions. Nothing copies or repairs installed caches. Genuine tool-only packages still omit the empty skills section. This corrects content browsing without claiming that preview documents are runtime-loaded.

Correction validation: 66 related frontend contracts and 24 ordinary native tests passed; frontend and Tauri debug app builds passed. The isolated app showed exactly one provider label for each App/runtime market, while the user source retained User-added. The formerly diagnostic-only fixture displayed Skills 1, opened its actual SKILL.md, and retained unloaded preview permissions. No real cache changes, credentials, real-app restart or commit were involved.


### Plugin card icons

Plugin inventory headings now reuse CodexSkillIcon with the declared plugin icon and PackageIcon fallback for missing/failed images. Action permissions and card layout remain unchanged. Frontend build and a lightweight component preview passed; no native behavior changed or native tests were run. The unified-computer-use package findings and the separate App-injected-configuration comparison risk are recorded in the permissions audit.

Desktop application follow-through: after the user reported the change was not applied, the debug App bundle was rebuilt successfully. The real running application was observed idle on its plugin list, exited normally and reopened from the rebuilt bundle. Its actual plugin page visibly showed declared icons (ArkSpace, Browser, Chrome and document plugins) and PackageIcon fallbacks, including unified-computer-use. No plugin state changes or tests were performed in this follow-through.


### 2026-10-24 — App runtime update comparison, native installation and confirmation layout

The reported `codex-app-tools` failure was reproduced without user data: the original runtime will not admit a frozen `openai-bundled` catalog outside the canonical CODEX_HOME location. Reserved provider updates now use the original `plugin/install` route with the real canonical marketplace manifest. Source/content checks remain before installation and during recovery; generic local/Git updates retain the existing frozen catalog route.

For the two identified App-managed MCP servers, comparison excludes only fields written by the shipped desktop runtime patches (`ko`/`Uc`), not the whole `.mcp.json`. Files, versions, tool definitions, approval settings, timeouts and other servers still participate. A pure injected-configuration difference is current. Genuine same-version and version changes remain updatable. Existing runtime fields are captured only in memory and restored after native installation, rebasing package-local paths. No credential files, account sessions or authentication values are inspected. The bounded configuration restoration exception is documented in ADR 0005. Raw content fingerprints still protect reviewed content; optional projected recovery hashes distinguish runtime injection from package mismatch while accepting older recovery records.

The update confirmation reuses AlertDialog with a compact icon/name/old revision/arrow/new revision row and update count in the title/action. It removes repeated component, skill-count and version paragraphs; source/fingerprints stay folded under details, and actual errors remain in FlowError. A completed/no-update recheck offers Done rather than a disabled Update action. Existing cancellation, pending-state lock and unmapped-rule consequences remain.

Targeted validation passed: the runtime-field projection/restoration test, an isolated original App plugin lifecycle fixture on App 0.164.0-alpha.11.1 and standalone 0.162.1, and the existing ordinary local-plugin update/configuration regression. The new fixture covers both names, injected-only current state, real version and same-version updates, preserved disabled state and rebased runtime configuration. `pnpm build` and the Tauri debug App bundle passed; no full frontend/native suite was run. Isolated packaged-app observation confirmed the redesigned dialog, successful codex-app-tools update, and subsequent current status. Screenshot: `.scratch/app-plugin-updates/update-dialog.png`.

Real-app follow-through: launch was initially rejected by automatic review because it could read real user state. After the user explicitly authorized opening and read-only inspection, the rebuilt app opened and actual codex-app-tools checking returned current, with no update dialog. No real plugin install/remove/toggle was performed. The real installed list did not include unified-computer-use, so its execution validation remains isolated; it was not installed to manufacture acceptance. No changes committed.

Success-copy correction: the plugin update toast now says only “插件已更新” / “Plugin updated”. State-preservation behavior is unchanged; it is not repeated as an implementation receipt in the success notification. This copy-only adjustment adds no tests or lifecycle changes.


### 2026-10-25 — Installed management and service-backed discovery

Installed management now excludes uninstalled catalog entries and removes the installation-collection selector. Source choices group actual official providers separately from declared marketplace names. Batch selection precedes the primary Add dropdown; its only entries are Add plugins and Plugin marketplaces. Market addition remains in the marketplace page, while provider resource directories are excluded from removable marketplace rows. Archive import/upload remains deferred.

The rejected discovery implementation incorrectly used vertical plugin/list records and package categories as the public directory. It is superseded by the current installed App's verified contracts: /ps/plugins/home sections, /ps/plugin-categories/{slug}/plugins and /ps/plugins/search with GLOBAL scope and returned pagination cursors. Language titles and ordering come from the service; the public homepage presents the first six entries per section. Personal content uses USER records and local user-market groups, with declared marketplace display names. No hardcoded screenshot taxonomy is used. Discovery and installed counts remain separate.

Public entries retain the real remotePluginId. Original plugin/read prepares and validates the native identity before review, and original plugin/install owns desktop installation. Real home, Chinese titles, category pages, USER list and original public plugin/read were verified read-only through this application's independent authorization. No real install, uninstall, toggle or third-party connection was executed. Existing Codex credentials are not a fallback: the app restores its own keychain authorization before full inventory reads and unauthenticated CLI inspection uses ephemeral credentials. Metadata crossing IPC is field-whitelisted; remote icons accept credential-free HTTPS URLs only. Temporary probes were removed.

Ordinary local inventory refresh cannot overwrite a complete account list with a subtotal. Context changes invalidate discovery and action reviews. Remote action guards use semantic state/policy instead of volatile display metadata, with idempotent writes and bounded state readback. Shared confirmation preserves actual failures and Retry. The historic intermittent GitHub disable error was not reproduced, so its exact cause remains unproven.

Validation: five relevant frontend cases, four directory contract cases, the metadata/path/image test and remote semantic-fingerprint test passed. Strict frontend build passed. Both original-CLI isolated local lifecycle fixtures passed earlier in this increment; no unrelated full suites were run. Packaged application observations are recorded below when completed. Changes remain uncommitted.


Packaged read-only observations: the real app automatically showed 19 installed plugins. Public discovery rendered all 17 actual Chinese service sections with six entries per section. Personal showed only ArkSpace and mattpocock market groups; the marketplace page excluded App/runtime providers, and returning preserved the Personal selection. The productivity category rendered its service batch, completed a cursor load and returned actual Notion search results. Gmail original details and the shared install confirmation opened; installation was cancelled. The first public-search check caught the full-plugin versus homepage-summary schema mismatch, which was corrected with a targeted assertion before the final rebuild. Real plugin mutation and external OAuth connection acceptance remain untested.


Final rebuild and read-only recheck (2026-10-25): the Tauri debug App bundle passed. Public search for Gmail returned Gmail and actual service search results without the previous name error. The restarted installed count remained 19. The application was left on the discovery homepage; no real plugin state was changed. Remaining limits: real public installation and external account connection were not executed; exhaustive theme/viewport coverage is not claimed.


### 2026-10-25 — Plugin icon compatibility and bounded read latency

CodexSkillIcon now owns 16/40/48px icon frames for cards, discovery and details. Rounded frames clip square image backgrounds consistently; object-contain preserves rectangular/transparent artwork and the existing fallback remains. The marketplace page omits User-added badges while retaining actual registration and operation permissions. Current original-App upgrade behavior is rechecked in the marketplace upgrade research record; no upgrade control is added by this increment.

Public search/category requests now read public metadata without repeating local skills/config/plugin inventory. The current installed snapshot joins results by exact remotePluginId for presentation; details and every mutation still re-read native identity and authority. Matching in-flight Agent and Codex inventory reads are coalesced, without caching completed results. Codex read deduplication also checks the current request generation so a mutation or context invalidation cannot reuse an obsolete request. The independently authorized account reuses its own HTTP connection pool; credentials stay per-request and never cross IPC. No new registry, persistent catalog cache, credentials source or lifecycle implementation is introduced.

Observed actual-app samples, including UI automation/poll overhead: public Gmail search 3633ms before / 1292ms after; Pi-to-Codex switch until the full plugin count appeared 2067ms before / 1321ms after. These are single same-operation samples, not statistical benchmarks. A cold post-restart Codex selection was 2834ms; this increment does not claim to eliminate cold startup or external network latency. The real installed count remained 19; the efficiency category showed Writing Style as installed, with its action menu rather than an install control. Square Granola/Firecrawl/Notion artwork and transparent logos were visually checked, and the market page showed no User-added badge.

Validation: four selected frontend cases, four discovery contract tests and four account boundary tests passed; two opt-in independent-login/keyring fixtures were not rerun because credential persistence did not change. pnpm build, Tauri debug App bundle and diff checks passed; the new real bundle was opened for read-only checks. No real plugin install/uninstall/toggle, original credential reading, commit or push occurred. The shadcn registry lookup failed DNS; verified installed component interfaces were reused without adding dependencies or primitives.


### 2026-10-25 — Authorized single-marketplace upgrade

The user explicitly approved adding the original marketplace upgrade operation; this supersedes earlier research-only restrictions for this action. Eligibility follows the original interface support and effective configured Git source, excluding canonical App/runtime providers. Removal permission and user-registration labels do not determine upgrade permission. Only eligible rows show the secondary icon/text Upgrade button. The Add marketplace primary action and existing source presentation remain unchanged.

The shared AlertDialog names the selected market and source and explains that configured plugin files may be installed again/refreshed, including disabled plugins, and existing sessions may need reopening. Confirming re-reads eligibility and the reviewed source/ref/sparse/root identity before running the unmodified original CLI with the explicit market name and --json. There is no upgrade-all path or separate invented version-check stage. Structured selectedMarketplaces/upgradedRoots/errors are checked; only the confirmed single selection without errors reports success. An unchanged revision can succeed. Credentials stay ephemeral with temporary HOME, anonymous Git and disabled credential helpers/hooks.

Success re-reads markets and invalidates plugin state through the existing callback. Failure retains actual errors and Retry in the confirmation and re-reads potentially changed state, without automatic write retries or rollback claims. The dialog is mounted only while a confirmation exists, avoiding the remove-title fallback during an upgrade close transition.

Targeted validation passed: the permission/structured-result case and the extended original-CLI isolated Git-market lifecycle fixture. The fixture verifies an upgraded disabled plugin receives new content while enabled state, skill rules and unrelated model configuration persist; a changed reviewed ref is rejected; another upgrade can complete. Isolated packaged UI observations confirmed only Git rows show Upgrade, the shared confirmation/Cancel, expanded actual source-change error, retry after fixture restoration, successful completion and list readback. UI writes used an empty self-generated Git catalog with no plugin payload; real plugin mutations were not performed. Final package/open results are recorded below.


Final verification: strict frontend build, Tauri debug App bundle and diff checks passed. The final isolated bundle cancelled Upgrade directly back to the marketplace list without a Remove title during closure. The real rebuilt App was opened read-only and displayed Upgrade for ArkSpace and mattpocock; no real upgrade was executed. Isolated QA was closed after verification. Changes remain uncommitted; no broad frontend/native suite was run.


### 2026-10-25 — Accepted source labels and native-skill plugin submenu

The user-selected source labels are now 应用内置 / 运行环境 / 官方插件. Plugin-management source groups are 官方内置 and 插件市场; actual marketplace display names and internal source keys remain unchanged. No categories are fabricated for absent providers.

Native-skill source filtering retains All sources, Local directories, Built-in skills and applicable Administrator skills at the first level. Specific plugin choices move under one Plugin skills submenu. Entries use declared plugin icons and display names, fall back to known native display identity/missing-image artwork, deduplicate by plugin ID and retain the exact ID as the filter value. Selecting a plugin clears the prior bulk selection as before; the trigger displays the selected icon/name. No filter or lifecycle authority is inferred from display text.

The composition reuses the installed DropdownMenu submenu, portal, radio items and collision handling. SelectTriggerButton shares the exact Select trigger surface instead of introducing a pill-shaped per-page control. Menu dimensions and scrolling use the existing semantic tokens/available viewport height. The ordinary Select implementation keeps its previous styles.

Validation: two targeted frontend cases passed, including declared plugin name/icon resolution, deduplication, source labels and existing native filtering. pnpm build, Tauri debug packaging and diff checks passed; no native test suite was run because native code did not change. The old running process initially retained previous text; it was normally exited after refreshing the automation session, then the new bundle was opened read-only. Actual UI observations confirmed the 官方内置 / 插件市场 grouping and 应用内置 label, a click-open Plugin skills submenu with icons/names, mattpocock selection, keyboard submenu navigation to Documents, and restoring All sources. No plugin state was changed. Changes remain uncommitted.


### 2026-10-25 — Project-specific plugin overrides and App-maintained components

The user authorized separate global and project operations. Global local-plugin management retains original installation/removal/update and user default enabled writes. Project local-plugin management reads effective native state but writes only this project's enabled override and can remove it to restore inheritance. Scope, explicit project enabled value and per-action availability are returned separately. Account plugins retain account-scoped actions in either context. Project requests cannot perform local lifecycle/update or marketplace mutations; backend checks enforce this in addition to the UI.

The original config writer rejects project paths, so the explicit bounded TOML-edit exception is documented in ADR 0005. Native project layers establish trust and higher-priority controls; project/user path aliasing and outside-project resolution are rejected. The new direct toml_edit dependency uses the version already locked by the application dependency tree and preserves unrelated TOML/comments. Config bytes are checked before atomic replacement, and original readback verifies effect. A missing project .codex folder is created only during a confirmed action and removed if trust validation fails without a file write. No automatic trust or fallback user write exists.

Existing confirmation composition distinguishes account, current project and user-default impact, including mixed batches. Project explicit overrides expose Restore inherited settings in existing actions/details; no card badges are added. Details expose scope/inheritance and actual restrictions. Global add/market operations are not presented as project operations. The two canonical App-maintained internal plugins retain actual CLI actions, with an uninstall consequence about possible App reinstall rather than blanket permission removal. Current App code evidence and limits are recorded in the new research topic.

Validation before packaged UI: the project lifecycle fixture passed against both standalone and desktop-bundled original CLIs, checking exact user-config byte preservation, another project, missing project config, explicit override/default isolation, inheritance reset, untrusted refusal/empty-folder cleanup and no project uninstall. Both existing global original-CLI lifecycle fixtures passed after rerunning with loopback permission (the initial sandbox run could not bind its anonymous test Git server). The two-plugin App runtime update/injection/preserved-disabled fixture passed on the original desktop CLI. Four relevant frontend contracts passed. Final builds and desktop observations follow below; no real plugin changes were used as tests.


Packaged QA observations: in a registered trusted test project, local uninstall/update controls were absent while account plugin actions remained. Project enable wrote an explicit setting and matched original readback; exact user-config bytes stayed unchanged. Restore inheritance removed only the project enabled field and returned to the inherited disabled state. A project override persisted after an application restart. Untrusted project details exposed the native trust restriction without a local switch; the account plugin detail still identified Current account. Global confirmation described User default, and the App internal-component uninstall confirmation described possible reinstall; those global confirmations were cancelled. The QA window was closed. The real rebuilt App was opened read-only and GitHub details identified Current account; no real plugin state changed.

A final native scope guard also binds reviewed plugin fingerprints to the canonical project root, so two projects with the same inherited state cannot reuse a review. This is in addition to project-path validation and frontend context invalidation. Final required build and latest targeted fixture outcomes follow.

Final verification: the project-root review guard passed the targeted original-CLI fixture (1 case). pnpm build and the final CI=false pnpm tauri build --debug --bundles app passed; git diff --check passed. Earlier unchanged targeted frontend, dual-CLI project/global fixtures and App-injection fixture results remain applicable. No full unrelated test suites were run. Changes remain uncommitted.

### 2026-10-25 — Hide App internal components in ordinary plugin management

The user selected the original App hidden presentation for the two verified internal components. Match native canonical built-in identity and exclude codex-app-tools and unified-computer-use from management, search, installed counts, discovery collection filters and source choices in global and project views. Keep raw native records, runtime maintenance, user-market lookalikes and other built-in plugins intact. This supersedes presenting the two components with uninstall impact copy; no replacement cards or notices are added. Project inventory remains the shared installation set with project-effective state and project-only overrides; account plugins retain account operations.

Five targeted frontend contracts passed. Frontend and packaged build results follow after completion; no native or user plugin mutations are required for this presentation adjustment.

Verification completed: pnpm build, CI=false pnpm tauri build --debug --bundles app and git diff --check passed. The App was normally restarted to load the new package. This small presentation change uses targeted helper contracts and static composition review; no new controls, card copy or native lifecycle changes were introduced. Read-only verification of the final real packaged window subsequently confirmed both global and Skills-Space project plugin pages display 18 ordinary installed plugins, excluding both internal components. Project local cards omit uninstall/update controls; ArkSpace details identify Current project and inherited settings; GitHub details retain Current account. Searching each hidden component returns no matches, and clearing search restores the list. No real plugin state was changed and no existing credentials were read. The current official App descriptor table contains 15 entries but only these two are hidden; the complete classification is recorded in the scope research report. Changes remain uncommitted.

### 2026-10-25 — Loading deduplication and locale metadata

Directory locale reads now reuse current native installation observations through a metadata-only response. Server-provided localized editorial titles still request their first locale; switching back reuses the successful context-local result. Classification effects ignore parent loading flips and reuse bounded pages by target identity, native fingerprints, locale and query. Failures remain retryable; explicit Refresh, authorization and plugin changes invalidate or refresh observations. Startup waits for the general inventory, concurrent native reads coalesce, and a verified write readback is reused during that operation's general inventory refresh. Market-save refresh uses one route. Native inventory checks run independently in parallel and retain ordered merging; Pi/Hermes observations are returned and reused on Agent entry. No lifecycle authority, existing-login access or UI controls were added. Measured results and verification limits are tracked in [the loading audit](../research/loading-performance-audit-2026-10-25.md).

Loading verification: 7 real React lifecycle subcases and 4 relevant frontend helper cases passed; 4 native directory cases and the isolated profile passed. Inventory-filter checks passed 10, ignored 4 and failed 1 existing DSH configuration fixture; serial scheduling reproduces the same failure, with assertions retained. Required frontend/native builds passed. The isolated packaged App covered locale round trips, directory authorization state, personal installable entries, Agent/project navigation and explicit refresh; plugin config bytes stayed unchanged and QA closed normally. Full results and limits are in the audit; changes remain uncommitted.


## Codex defaults and read-only skill rules (2026-10-25)

The user approved completing the skill/plugin defaults and account-tool defaults in Settings → Agents → Codex. This supersedes earlier proposals to remove the skill-rule section: retain the section as read-only, preserve every existing rule and its effective behavior, and keep individual skill/plugin lifecycle actions in their existing pages.

The bounded editable leaves are `skills.max_context_tokens`, `skills.bundled.enabled`, `features.skill_mcp_dependency_install`, `plugins._default.enabled`, and the five `apps._default` fields `enabled`, `default_tools_approval_mode`, `approvals_reviewer`, `destructive_enabled`, `open_world_enabled`. No approval-policy, sandbox, environment, credentials, per-plugin, per-tool, marketplace or skill-rule write is authorized by this increment.

Absent values follow Codex. Existing explicit values stay explicit until the user changes them. Each selector offers inheritance; each group can restore its own defaults as a draft. Save uses the original `config/batchWrite` with leaf edits and a version guard; null deletes the selected leaf. Unrelated concurrent edits are preserved, while changes to the same edited leaf retain the draft and require reloading. Read back user-layer values after writing. Do not claim a running official App conversation has hot-reloaded.

The UI reuses settings Field/Choice rows, Card headers/actions and the existing unsaved-change AlertDialog. Reading the page uses config/read only, without skill/plugin discovery or account-service mutations. Skill rules show identity and state without edit, reorder, remove or add controls.

Verification completed:

- `pnpm build` and `CI=false pnpm tauri build --debug --bundles app` passed; the final normal application bundle includes the aligned field controls. Vite retains its existing large-chunk warning.
- Three focused frontend tests passed: inherited versus explicit values, changed-leaf/reset requests, and numeric validation while preserving untouched values.
- Three focused Rust tests passed against both original CLI 0.164.0 and App CLI 0.164.0-alpha.11.1, covering the write allowlist, nine-field persistence and restart readback, all four approval enum values, default restoration, same-field conflicts and preservation of unrelated external edits. A fake `auth.json` FIFO would block an attempted credential read; these tests completed without reading it.
- A separately built and identified QA app used a temporary HOME and fresh configuration. Actual window actions covered reading all nine explicit values, restoring and saving each group, canceling an unsaved navigation, validation of 0 versus saving 3400, retaining a draft after an external same-field edit, discarding that draft and reading the external value 3500, and restoring inheritance. The resulting file retained the existing skill rule, per-plugin state, per-tool state, model/auth-storage preferences and comment.
- Light/default-size and dark/larger-size settings, plus the shared unsaved-change dialog, were visually observed. Dropdown selected values were observed; the computer-use bridge could not reliably operate the WebKit popup/coordinate path, so exhaustive dropdown keyboard interaction and narrow-window visual checks remain unverified. No real account-tool invocation was performed; approval enums were verified through native configuration, not live service execution.
- No real user configuration or existing Codex credentials were read or changed for testing. Changes remain uncommitted; the previously running normal app was not force-restarted.


### Settings presentation correction (2026-10-25)

The read-only skill-rule viewer now reuses the shared Textarea composition from Pi settings: one bounded, wrapping, selectable text area with normal form typography, a thin scrollbar and no resize handle. Each line preserves the observed rule order and shows its state and name/path; HOME remains abbreviated. There are no per-rule form rows, repeated selector labels, edit controls or persistent read-only explanation paragraph. Stored rules and native writes are unchanged.

All nine field labels, descriptions, account-connection states, approval choices and page/error/help copy were reviewed together. Descriptions explain the action in a short sentence. Short secondary explanations use the shared Hint/Tooltip next to the label; the catalog budget and configuration location use a HelpPopover. The configuration path is shown in that help rather than as an unexplained form footer. Choice accepts an optional trigger ID so labels can target their controls; existing consumers are unchanged.

Verification: frontend build/type checking passed. The isolated packaged window was observed in dark/larger text and light/default text, including fourteen long name/path rules in the compact read-only viewer. Native capability/persistence code was not changed, so the prior focused native verification remains applicable; no full frontend/native test suite was rerun. Final normal app packaging includes these presentation changes. Exhaustive narrow-window and popup keyboard checks remain outside the observed visual evidence. Changes remain uncommitted.

The user rejected renaming account authorization to account connection. The account section label, states, sign-out action and related feedback have been restored to their pre-rename wording. The read-only skill viewer and the nine default-setting controls are unchanged.

### Unified plugin detail and management page (2026-10-26)

The user approved merging Details and Manage separately within Pi and Codex. This supersedes the earlier two-mode presentation; it does not merge the two Agents or their lifecycle/permission implementations.

The existing detail component now presents one body introduction, the Skills Card with its actual count and permitted single-skill Switches/document navigation, and one About section. Header actions directly expose the existing permitted check/update/uninstall operations; Codex discovery retains Install for eligible uninstalled entries. The Details/Manage buttons and mode state are removed. Whole-package enablement stays on inventory cards. Project-only Restore inherited settings is available for actual overrides, reusing each Agent's existing action. Codex author metadata is retained at the heading and no longer repeated in About. Existing confirmations, account/global/project targets and native writes remain unchanged.

Verification: independent actual-component regressions passed (27 tests including parent cases across Pi/Codex loading and unified-page behavior). Existing menu/locale/document request-count assertions remain; added coverage checks project inheritance restoration, installed/uninstalled/read-only capabilities, skill navigation and read failure/retry. `pnpm build`, normal/default-QA/narrow-QA `CI=false pnpm tauri build --debug --bundles app`, and `git diff --check` passed. The three artifacts contain `index-WSX58ZT6.js`. No unrelated native suite was rerun. Tests use mocked native boundaries; actual Tauri UI acceptance is recorded separately below when complete. No real inventory, existing credentials or account plugins were used; QA uses an isolated HOME and a local original-CLI Codex market.

Scoped default/light Tauri observations: the local Writing Demo page showed full-text check/update and uninstall actions, one introduction/author/About, and eight skills with the first six initially visible. A skill was disabled, its real document opened, and Back preserved the off state; expansion revealed the remaining two skills. The uninstall confirmation was inspected and canceled. Independent read-only byte comparison found only the intended single-skill enabled=false rule; removing that block exactly reproduced the initial configuration hash. No QA auth file or project Codex configuration was created. Narrow/dark/18px actual visual review is blocked, not passed: native CUA getApp hung for 271 seconds on the original QA and again for 133.8 seconds after creating a uniquely identified/signed QA with a unique executable. No narrow AX or screenshot was obtained. Static responsive classes and strict builds passed, but do not substitute for that observation.

The uninstalled Catalog Demo was observed in the actual default/light QA: Install was available, without installed-only update/uninstall actions or skill Switches. No installation was performed. Actual window loading/error injection was not repeated; renderer tests cover these states. The UI reviewer found no blocking issue within static and observed default/light scope; the blocked narrow/dark/18px review prevents claiming complete visual acceptance.

### Scope closure audit (2026-10-26)

The user requested verification of actual global/project behavior. The original CLI 0.164.0-alpha.11.1 isolated `project_overrides_never_write_user_configuration` fixture passed: plugin project disable/enable/reset leaves user bytes unchanged, preserves project metadata, does not affect project B, and rejects project uninstall/untrusted writes. This proves the whole-plugin override path only.

A temporary fixture probe adding a real plugin skill reproduced an unresolved detail-page defect: project inspection returns `can_toggle=true`, `in_scope=false`, `toggle_scope=user`; CodexPluginPage renders the Switch from canToggle alone and codexToggleSelection retains it, but the native toggle rejects it with `Selected skill cannot be changed with this Codex version or configuration.` No user bytes changed. The temporary test instrumentation was restored after execution. Earlier default-window observations used Codex global management and did not establish project plugin-skill closure. Resolving this requires an explicit, upstream-compatible skill-scope behavior, not a blanket claim that the project page is closed or merely hiding the control.

No live account authorization/state-mutation/restart cycle was performed in this audit. Account-level routing remains statically inspected, not independently requalified against the live service. No production behavior was changed during the audit.

### Withdrawn project-skill read-only restriction (2026-10-26)

The earlier probe established only that a trusted project's skills.config entries are read but ignored for enablement by the qualified runtime. Inferring that the App cannot toggle a skill while showing a project was incorrect. The resulting blanket read-only restriction and its test expectations have been removed. The corrected App operation and actual scope effects are recorded below; no global-management prompt or navigation action is added.

### Original App project skill-call correction (2026-10-26)

The user demonstrated that the official App supports toggling individual skills while viewing a project. The previous conclusion was too broad: an ignored project-local skills.config entry does not establish that a project-view skill action is unavailable.

Read-only inspection of the installed App's packaged static code (app.asar, webview/assets/skill-card-55c250d17d58.js) identifies its actual operation: skills/config/write with name for namespaced plugin skills, or path for ordinary skills; enabled is passed directly, without a project-file selector. Its skill-card eligibility checks local host and non-admin scope, not global-only page context. No original App UI, user inventory, credential or account data was inspected.

The adapter therefore removes the blanket project read-only restriction and does not use inventory in_scope as a skill-write permission. Project skill actions use the original endpoint with the same selector choice, retain the existing user-rule revision/conflict preflight, and reread the actual snapshot to verify every requested enabled state. Existing global explicit-rule behavior is unchanged. This restores App behavior, not an invented project-local skill-rule implementation. Existing confirmation impact wording refers to projects using the skill, covering both name and document selectors. No new notice or navigation action is added.

The exact generic cannot-toggle message and its English equivalent are removed from the tooltip helper, without replacement wording. The previous whole-plugin project override isolation and Pi update-scope changes remain separate and unchanged. Independent original-runtime/renderer/build verification is pending below; prior tests asserting project skill read-only were based on an incorrect premise and must be corrected.

Final verification of the App-call correction: seven targeted actual-component tests and one helper test passed. The original Codex 0.164.0-alpha.11.1 scope fixture passed with project-owned skills selected by path and inherited plugin skills selected by namespaced name; disable/enable and subsequent inspection work, and enabling removes the disabled selector rather than fabricating enabled=true. Shared plugin settings are reflected in global and project B; a project B link to the same ordinary skill document also follows that path rule. The project configuration receives no skill override, and unrelated user settings/skill file bytes remain intact. Original whole-plugin project override isolation assertions remain unchanged and pass. This is the actual shared selector effect, not an independent project skill overlay.

`pnpm build`, normal debug Tauri packaging and `git diff --check` passed; final asset is `index-BGisbnDW.js`, and both forbidden tooltip strings are absent from it. Static UI review passed without new notices or navigation. No unchanged Pi suite was rerun and no attempt was made to reuse unavailable native/browser visual tools; this project's restored workflow and narrow state were not newly visually observed. The normal user app was not restarted, no existing credentials were read, and changes remain uncommitted.


## Inventory check updates and filters (2026-10-27)

Codex plugin management uses the managed-skill update interaction: a secondary toolbar Check updates action reads all installed, visible, permitted plugins in the active scope, independently of search/source/status filters. Internal App-maintained components and unsupported operations remain excluded by their existing actual permissions. Requests use the original check interface sequentially; successful results remain available when another check fails. Checks do not open confirmations or execute updates. Cards have no default check button; only a confirmed canUpdate result exposes the shared green CircleArrowUp ghost icon-sm action with Update available hint. Selecting it opens the existing review directly with that observation; explicit update/recheck retains the existing native verification. Refresh, scope change and mutations clear observations as before.

Source/status filter triggers use the common content-fitting rule, also used by all skill/plugin/Agent list filters. Filters change presentation only and do not initiate fresh inventory requests or alter scope permissions.


Rendered acceptance uses an isolated browser fixture importing the actual App, shared components and production CSS, with native calls replaced by fictional observations; it does not read user inventories or credentials. Initial 560px measurement found a long marketplace menu extending past the viewport while its trigger was correctly capped. The shared SelectContent now respects Radix available width, ItemText permits shrinking, and marketplace label text uses the existing truncation treatment. This fixes the measured overflow without introducing filter-specific menus or changing configuration-field widths. Final remeasurement and package results follow after review.


Rendered recheck of the long-menu correction passed at 560×700, dark theme, English and Larger (18): menu x=8, width=544, right=552; the actual ItemText DOM width is constrained to 492.25 within its row, text truncates with ellipsis, the selected checkmark stays visible, and page scrollWidth equals viewport width. Radix ItemText does not forward className, so shrinking/overflow is applied through the existing SelectItem direct-last-span selector rather than an ineffective prop. The capped trigger also shows ellipsis. Default 1512×783/light/Chinese layout had toolbar clientWidth=scrollWidth=1152, height=scrollHeight=36, compact=0, with Agent/source/status widths adapting to actual labels. These are actual-component browser observations with mocked native data, not claims of real plugin lifecycle execution.

Targeted behavior checks passed: 63 actual-component items in the Codex/Pi renderer files and three new managed-filter helper scenarios. They cover inventory-wide checks independent of filters, real permission exclusions, partial errors, default-hidden versus confirmed available actions, cached review and explicit update arguments, recheck/scope/refresh invalidation, managed global/project source-enable intersections and unknown-state handling, clear/reset without rereads, and mutually exclusive Pi states. Existing native update/permission contracts are unchanged; no unrelated full native suite is rerun.


Final packaging for this change passed `pnpm build`, `CI=false pnpm tauri build --debug --bundles app` and `git diff --check`. The normal app at `src-tauri/target/debug/bundle/macos/Skills Space.app` includes `index-Da0n_m7B.js` and `index-EM1PgICw.css`, both newer than the final Select correction; the earlier temporary `index-QgWyujVe.js` is superseded. Rendered checks also confirmed returning to a wide window restores compact=0 and all secondary action labels; ordinary Settings select field widths remain unchanged and keyboard ArrowDown/Escape work. No real plugin update was performed, no user inventory/credentials were read, and no commit was created.


Final UI review passed with no remaining in-scope blocker. Isolated actual-App observations covered light Chinese 16px, dark English 18px, Claude palette and widths 1512/1280/960/560. Managed filter intersections/empty-clear/project reset and mutually exclusive Pi states behaved as specified. Codex/Pi native-skill source submenus with long plugin names were additionally exercised: trigger cap/ellipsis, collision flips, ArrowRight/Enter/Escape and focus return passed. Settings field widths remained unchanged; Agent installation-state filter fit its label. Evidence is in ignored `.scratch/filter-review/evidence/codex-source-dark-en-18-560.png` and `pi-native-source-dark-en-18-960.png`. The reviewer restored its viewport and closed its only test tab; the dedicated 1436 preview process was stopped. The normal application and existing 1420 service were not touched. This is browser rendering of the actual application with mocked native interfaces, not native Tauri-window or real-lifecycle verification; transient busy/failure visuals were not separately captured and are covered by static review and targeted behavior tests.


## Filter ownership audit (2026-10-27)

The Skill Space managed and native collections now own separate Agent and search values. Settings Agent search is a third, independent value. Managed source/state options and reset effects derive from the managed Agent context, rather than whichever collection is currently visible. Clearing filters affects only fields shown in the current collection and Agent; a sidebar Agent page cannot silently clear a saved Skill Space Agent filter that it does not expose. Navigation now restores the destination context's search/Agent values without clearing; switching managed/native collections preserves each collection's selections. Scope changes now restore the selected context's in-memory choices; the earlier reset behavior is superseded by the retention section below. No filter persistence, new UI or native I/O is added.

Audit boundaries and outcomes:

| Surface | Ownership and result |
| --- | --- |
| Skill Space managed/native Agent and search | Shared state confirmed; split by collection. |
| Managed source/state | Indirect reset/option validation followed the native Agent; now follows the owned managed context. |
| Inventory Clear filters | Previously cleared every collection/Agent; now clears the current visible context only. |
| Settings Agent search | Previously reused inventory query; split. Installation status remains component-local. |
| Codex/Pi/Hermes native source/state | Already separate namespaces; blanket Clear no longer resets their siblings. |
| Codex plugin source/state/query and discovery search | Already separate from inventory/native filters; unchanged. Discovery tab/category search resets remain explicit navigation behavior. |
| Pi plugin source/state/query | Component-local, distinct from Pi native skill filters; unchanged. |
| Skill store leaderboard/search and installation Agent picker | Dedicated state per surface/component, no incorrect shared filter binding found; unchanged. |

Acceptance covers real App collection round trips, source/state preservation when changing or clearing the other collection's Agent/query, settings query independence, explicit scope/Agent reset boundaries and no extra inventory reads from local filtering.


Rendered filter-isolation acceptance passed in the isolated actual-App browser fixture: managed Codex/Git/Enabled/Writing survived switching to native Pi/native-pi and clearing an empty native result; settings Agent search did not inherit inventory text and its Hermes query did not alter the saved native query; clearing on a sidebar Codex native page preserved the hidden Skill Space Pi Agent filter; switching project scope reset the documented collection contexts. The existing visual baseline is reused because no controls, layout, copy or CSS changed in this correction. Evidence is in ignored `.scratch/filter-review/evidence/managed-filter-preserved.png`. Native interfaces remain mocked, with no real inventory/credential access or lifecycle operation.


Targeted actual-App regression group passed 22 items, zero failed/skipped, including two added cross-context scenarios: independent Agent/query values, managed source/state retained when the native Agent has no such source, both Clear directions, independent settings search, hidden Agent-filter protection on sidebar pages, global/project resets and unchanged inventory/catalog request counts. The post-implementation audit found no further incorrect shared binding in the listed plugin/discovery/native/store/picker surfaces. The browser review tab and dedicated 1436 preview server were closed after acceptance.


Final filter-isolation packaging passed `pnpm build`, `CI=false pnpm tauri build --debug --bundles app` and `git diff --check`. The normal app now includes `index-DGg1k92-.js` with unchanged `index-EM1PgICw.css`, newer than this App state/handler correction and superseding `index-Da0n_m7B.js`. No production CSS change, native mutation, real-user application launch, credential inspection or commit occurred in this correction.


## Context retention and stable filter widths (2026-10-27)

The user explicitly superseded the earlier scope/Agent reset behavior. One App-owned in-memory FilterSession now stores choices by host, global/specific-project scope, surface, Agent and collection. Generic Agent selectors are separately owned per scope/collection, while query/source/state follow the selected Agent's context. Sidebar Agent skill views, Codex and Pi plugin inventories, settings Agent search/installation status, and Codex discovery tab/category search retain their own values on return. Pi receives the App session across scoped component remounts. No disk/preferences/credential persistence is added; closing the App releases this session. Only explicit Clear changes the current view's choices; ordinary navigation does not reset them. When Clear also selects All Agents, its resulting All-Agents view is cleared without changing other Agent views.

FilterSelectSizer contributes the complete option-label set to intrinsic grid sizing, in an aria-hidden overlapping cell beside the same visible value and chevron. Selection changes therefore do not change width; actual options, language and font still adapt naturally, with the existing 20rem/viewport cap and ellipsis. All list filters use this treatment; settings configuration fields keep their existing dimensions. Source options for Codex/Pi native skills now come from the unsearched current-Agent inventory, preserving source labels/options/width during an empty search.

The earlier scope-reset test expectations were replaced because the user changed that contract; filtering, Clear, ownership and no-redundant-read assertions remain. Targeted renderer coverage passed 70 items without failures or skips: context matrices for global/project A/project B and Codex/Pi/Hermes managed/native views; per-Agent generic choices; scoped plugin and settings restoration; Pi remount restoration; discovery public/personal/category navigation; explicit Clear isolation; and native source choices surviving an empty query. No unrelated native suite was run because native lifecycle paths are unchanged.


Final stable-width and retention browser acceptance passed. In unchanged Chinese 16px option sets, Agent All/Pi/Hermes measured 134px each; managed source All/Git and state All/Enabled measured 98px; Codex plugin source All/short/long measured 320px; Pi source/state variants measured 98px. Native source choices retained their selection and 320px width even with empty search results. Dark English 18px legitimately recalculated the capped source width to 360px, then short/long selections both remained 360px.

The final narrow check exposed invisible sizing-text overflow. Clipping only FilterSelectSizer (not the focusable trigger) eliminated it: at 560px/dark/English18 both Codex and native source triggers measured clientWidth=scrollWidth=358 within a 360px border box, replacing the earlier erroneous scrollWidth=691. The page stayed 560px wide. Actual global Codex/Pi/project Codex query/source/state combinations restored independently; scoped Codex/Pi plugin choices and generic Agent subcontexts also restored. Explicit Clear of Codex did not change Pi choices. Evidence is in ignored `.scratch/filter-review/evidence/filter-width-records.json`, `filter-context-records.json`, `context-restored-global-pi.png` and `stable-filter-narrow-dark-en18.png`; the screenshot precedes only the invisible-overflow clipping, whose final DOM measurements are recorded. The review tab and dedicated server were closed. No native Tauri-window or real lifecycle verification is claimed.


Final packaging was repeated after the Sizer clipping fix and native icon-width alignment. `pnpm build`, `CI=false pnpm tauri build --debug --bundles app` and `git diff --check` passed. The deliverable normal App contains `index-BaYhmu3o.js` / `index-BejqLQRw.css`, newer than all final production changes; `index-CO3ZdWCP.js` / `index-DBc51GqM.css` were invalidated and superseded. The unchanged 70-item behavior evidence was reused for the final styling-only correction. No real-user application launch, native plugin operation, credential inspection or commit occurred.


## Toolbar height stability (2026-10-27)

A real actual-App preview reproduced the reported managed-skill Agent-switch jump at 1373×720, English 18px. The All-Agents source set included a project dependency while Pi did not. At the resulting width threshold, All Agents needed a horizontal scrollbar and the original toolbar grew to 51px, pushing the grid to Y=265.1875; Pi did not need it and the toolbar was 40px, grid Y=254.1875. This was a normal-flow scrollbar-height defect, not a filter-state or inventory reload issue.

The shared InventoryToolbar now has a relative normal-flow frame with the existing 2rem control-row height plus 4px focus padding. The unchanged measured scroll row is absolutely positioned inside it; the native scrollbar occupies the existing gap below, outside normal flow. The responsive measurement ref/groups, controls, filter persistence and native scrollbar remain unchanged. No platform scrollbar thickness is guessed and no new scrollbar or permanent spacer is introduced.

Exact-scenario recheck passed: All Agents and Pi both have frame=40px, control Y=198.1875 and grid Y=254.1875, while the internal scroller may still be 51/40px. Bulk-bar clearance is 7px; 960px Chinese 16px Codex/Pi plugin card clearances are 5/9px. Keyboard focus-visible and the existing theme focus ring remain active. Main-agent IAB observations and screenshots were independently reviewed by the UI reviewer; that subagent could not access IAB in its own session. Evidence lives in ignored `.scratch/filter-review/evidence/toolbar-height-records.json`, `toolbar-all-stable.png`, `toolbar-pi-stable.png`, `toolbar-bulk-no-overlap.png`, `toolbar-codex-narrow-focus.png` and `toolbar-pi-plugin-narrow.png`.

This is a two-file reversible shared layout correction. Existing 70-item filter/lifecycle UI behavior evidence is reused; no mirrored CSS test or unrelated native suite is added. Required frontend/app builds are recorded after completion. No user inventory/credentials or real plugin mutations were used. Root IAB review tabs/viewport were cleaned and the dedicated server stopped. Chrome lost its automation connection mid-reproduction; attempts to reset/close its unmarked temporary tab timed out, so its remaining cleanup is left to the tool's automatic turn cleanup rather than repeatedly binding it. Actual final verification used the working IAB channel, not the blocked Chrome connection or a native Tauri window.


Final toolbar-fix packaging passed `pnpm build`, `CI=false pnpm tauri build --debug --bundles app` and `git diff --check`. The normal App now includes `index-CWl9JPAK.js` / `index-L8jET2d5.css`, built after both production edits and superseding the preceding `index-BaYhmu3o.js` / `index-BejqLQRw.css` package. No commit was created.


## Plugin directory actions (2026-10-27)

The plugin-management header opens the existing `plugins` directory under the snapshot's actual Codex home, including custom homes. Project views use that shared installation directory; they do not invent a project installation root. Installed-plugin details expose the verified installation path in About > Location. Local discovery entries may expose their verified source location; account-only plugins without local files have no directory action.

Pi and Codex share a metadata-only local-location lookup and the baseline interactive-path presentation. The lookup checks absolute paths without scanning inventories or reading file contents. Missing/nonlocal locations produce no entry, disabled placeholder or additional notice. Display abbreviates HOME while the existing directory-opening command receives an absolute, verified directory. Equivalent path rerenders reuse the observation and late responses are ignored after context changes.


Directory-action verification completed against the built native Tauri App (2026-10-27). Targeted native metadata tests (2), new hook/path/detail component cases (5), and the selected header/detail integration cases passed. `pnpm build`, `CI=false pnpm tauri build --debug --bundles app`, the independent QA configuration build and `git diff --check` passed. The normal deliverable remains `src-tauri/target/debug/bundle/macos/Skills Space.app`, containing `index-nw7ZI7f4.js`; the QA build did not overwrite this bundle.

Native acceptance used the same production source with a separate compiled identifier/window title, isolated HOME/custom Codex/Pi directories and a persistent allowlisted launch session. The initial short-lived launch was rejected as acceptance evidence after the automation tool relaunched it without the fixture environment. The corrected process was verified before and after binding (same PID and fixture HOME/CODEX_HOME/PI_CODING_AGENT_DIR); no credentials were read. Browser observations are excluded from App acceptance.

Actual App clicks opened Finder at all seven expected directories (eight scope-specific entry actions): Codex global/project plugin root, installed Codex package, Pi global/project configuration directories, Pi global/project local packages and the single-file Pi plugin's parent directory. Finder accessibility evidence contains each full file URL and a unique fixture marker. Native 960x700 dark-mode review verified long-path truncation, the complete tooltip, Tab focus ring and Return activation. Temporarily missing fixture roots/installed/local locations omitted the header or Location action; Pi added no placeholder or notice. The existing Codex detail-content error remained independent of the new metadata lookup. Fixture directories were restored and Pi's location action reappeared after re-entering details.

The independent UI reviewer passed the current path-entry scope using only native App/Finder evidence in ignored `.scratch/directory-actions-qa/evidence/`. The isolated QA process was stopped; the user's running App was left untouched. No commit was created. Account-only absence remains covered by component/native contracts without logging into an account.


## Non-blocking plugin update checks (2026-10-27)

Toolbar and individual-plugin checks now follow the managed-skill reference: checking is local read state, never application-wide busy or a package mutation lock. Only the existing check action spins and prevents duplicate checks; navigation, search, filters, details, directory actions and unrelated controls remain usable. Actual lifecycle/settings writes retain their existing permissions, confirmation and busy behavior.

An independent check generation rejects late responses after context changes, refreshes or relevant writes. An older completion cannot clear a newer check's loading state, reopen its review, show stale feedback or replace newer settings/inventory. Pi read failures preserve the displayed inventory instead of invalidating and reloading it as though a write had failed. Single-plugin checks use the same read path and existing result/review feedback. The design authority is the Read-only update checks section in ui-system.md. Verification is recorded after targeted tests and native App review; existing shared QA product and fixture data are reused.


Single-plugin update results are invalidated per affected plugin, preserving other cards' confirmed available-update icons through success and failure. Pi uses the reviewed source/scope/root list, excluding pinned installations; its failure readback preserves the other results. Explicit full rechecks, refreshes and scope changes retain their existing reset behavior.

Targeted two-plugin success/failure regressions passed; Pi also verifies affected copies versus pinned/unaffected installations. Frontend and normal/shared-QA App builds passed with index-Begjn30Y.js. The reused native QA App was opened once to confirm rendering; no plugin update, slow-source fixture or broad workflow test was performed for this localized change. Static review and git diff --check passed.
