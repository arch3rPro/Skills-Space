# 现有测试去重与精简

日期：2026-11-03。状态：全文件审查、集中精简及本地验证完成，运行数据见末节。范围为本轮开始时的全部前端、脚本及 Rust 测试；不改变产品功能、原版 CLI 或 UI，不把缩小 CI 范围计为测试精简。

后续提交、同步传播修复及云端安装包结果见[开发计划的最新构建记录](../specs/0004-upstream-capability-completion-plan.md)。本文的“不提交/不触发云端”及本地数据保留为当次精简交付记录。

## 评估规则

- 同一功能由一个主要检查负责；跨层保留能够发现不同接通错误的检查，不按函数名相似就删除。
- 同一准备和同一结果的重复输入，改为数据表；不同权限、状态或恢复结果继续分别校验。合并名称本身不算提速。
- 真实 CLI 流程保留关键接通和已知平台风险；解析的完整输入表不重复做真实安装，跨范围/安装模式保留代表组合及其独有行为。
- 删除没有产品消费者的测试专属实现；仍有正式消费者的兼容和恢复逻辑继续保留。
- 完整性、共享内容、范围隔离、凭据、并发及真实结果确认属于高风险；低成本且独立的纯逻辑不因数量多而删除。

## 具体删减及覆盖归属

| 文件/功能 | 实际调整 | 保留的独有检查及其归属 |
| --- | --- | --- |
| `src/lib/agent-skill-actions.test.ts` | 删除重复的 Pi 托管权限检查 | 现有统一动作矩阵保留托管只改 Agent 配置、跨 Agent 禁止、内容移除禁止；批量资格补入 `canSetVisibility:false` |
| `src/lib/hermes.test.ts` | 删除重复的当前 Agent 状态隔离 | 统一 `skillAgentState` 检查补入原生只读状态和缺少 Hermes 状态；Hermes 加载/自动加载行为仍由本文件负责 |
| `src/lib/codex.test.ts` | 删除单独的增强组入口及重复搜索 | 增强组入口归 `upstream.test.ts`；一个混合搜索数据集保留已安装、未安装、安装未知及权限未知、大小写、名称/完整插件ID（含市场ID）搜索 |
| `src/lib/upstream.test.ts` | 删除重复的未安装 Agent 和旧分页检查 | 现有检测数据集保留共享目录不能当安装证据；12/24/48 分页矩阵保留空结果、完整顺序、边界及默认值，不再用直接给对象赋值冒充持久化 |
| `src/lib/dsh.test.ts` | 删除字面对象 JSON 往返的伪持久化检查 | 配置/预设身份仍由该文件真实选择更新函数及 Rust 偏好序列化/反序列化负责；不将其称为磁盘持久化验证 |
| `src/lib/error-summary.test.ts` | 19→12，按来源/权限、调用恢复、认证等用户动作归并；删除已退役错误文本和重复未知消息 | 现役错误输入、双语、部分成功数量、凭据拒绝及实际恢复建议继续校验 |
| `src/lib/notification-message.test.ts` | 5→3，移除在下层已覆盖的传输原因映射 | 保留识别结果优先、操作专用后备文案、双语通用文案、部分结果数量和隐藏技术日志 |
| `src/lib/execution-log.test.ts` | 5→2，同一终端文本转换使用有名称的数据表 | ANSI、两种超链接结束符、重绘/退格、装饰图案、Unicode、制表符和空文本均保留；不把此合并计为显著提速 |
| `scripts/release.test.mjs` | 四组来源混用改为同一准备下的四项输入，实际13→10 | 每次恢复原 manifest，再分别更改 commit/run/version/platform；四种拒绝及不生成输出均保留。四平台文件准备4→1 |
| `scripts/dsh-skills.test.mjs` | 删除旧 `prepareInvocation` 技能文件写入测试 | 当前 DSH 使用独立策略。源文件四种调用限制及 CRLF 解析迁入预检；用户 DSH/共享同名优先级迁入真实发现测试 |
| `upstream/dsh/native.rs` | 删除仅供测试的 `InvocationChange`/`invocation_save` 及旧四模式文件写入检查 | 第二 provider 改为实际发现并确认原配置不变；链接/硬链接保护改测实际移除计划；现役独立策略由 `dsh/policy.rs` 和策略脚本负责 |
| `versions.rs` | 删除重复的 manifest 版本一致性 | `release.mjs` 的版本检查同时覆盖 package、Tauri、Cargo 和 Cargo.lock；版本比较及响应状态仍留在 Rust |
| `marketplace.rs` | 三组重叠分页归为一个12/24/48矩阵，删除2项定义 | 页码0、顺序、缩短后总页数、终页数量、实际请求序列、空榜及非法大小/偏移均保留；多块最旧时间和读取失败仍独立 |
| `preferences.rs` | 旧配置默认值集中一次；删除重复默认安装模式检查；现代往返不再重复准备旧格式 | 外观、排序、项目、隐藏 Agent、技能范围、每页大小与 DSH 选择仍验证 Preferences 类型的序列化/反序列化 |
| `upstream/pi.rs` | 单个包成员启用并入现有批量原子校验，删除1项定义 | 批量选择一个包成员+一个原生技能；未选包成员停用、未来字段、无效选择全有全无、过期保存继续保留 |
| `upstream/restoration.rs` | 零退出但无实际恢复并入部分恢复及重试，删除1项定义 | 首次仅一个成功、另一个内容缺失而锁匹配；真实重试成功且已成功文件不变 |
| `upstream/tests.rs` 来源别名 | 真实预览/安装仅保留3个代表；不再重复调用7种解析输入 | 完整别名、筛选、编码 ref 和自定义主机表归现有原版解析检查；代表保留 GitHub/GitLab、全局/项目及链接/复制 |
| `upstream/inspection_session.rs` | 两技能会话4组范围/模式→全局链接、项目复制2组 | 两次 clone、选择完整性、实际安装类型、进度顺序、会话复用/释放和来源锁不变 |
| `upstream/creation.rs` | 两种原版 init 保留，删除其后重复的安装/卸载 | 创建不自动安装、预览、再次创建拒绝及原文件保护保留；创建→安装→恢复由 restoration 的现有真实流程负责 |
| `upstream/tests.rs` internal Git | 完整更新/移除2个范围→1个范围 | internal 显式选择仍真实覆盖两个范围；不重新选 internal 仍能更新保留 |
| `upstream/tests.rs` DSH 生命周期 | 两范围仍真实安装；项目改为重建 Engine 读取，复杂更新/共享卸载保留全局一次 | 项目实际文件、归属、发现和重启读取不省略；配置字节、过期重试、真实更新及共享移除保留全局完整流程 |
| `upstream/tests.rs` Agent 关联/发现 | 同一 Agent 检测结果复用；关联4组→2组，来源优先级4组→2组 | Cursor 配置创建后重新读；本地/ Git 及全局/项目均保留；全局复制和项目链接由现有专门生命周期覆盖，未删除 Windows 已知风险 |
| `upstream/pi/visibility.rs` | 四来源各自手动/重启/自动→一次批量手动、一次新 Engine 读取、一次批量自动 | 真实调用 `change_batch`，四来源资格及逐文件原字节均保留；单项操作仍由 pi/native 检查 |
| `upstream/usage.rs` | 相同参数布局的3次真实 PTY→1次；实际3种 Agent 参数准备全部保留 | TTY、输入、cwd、退出码、会话和清理由真实 PTY 验证；子进程停止及其他 Agent 布局仍独立 |
| `upstream/node_runtime.rs` 测试辅助 | 兼容系统 Node 在测试进程内选择一次，复用测试运行时 | 仅 `cfg(test)`；正式运行时选择不变；不减少原有9项运行时选择、缓存、下载完整性及并发检查 |

前一阶段已删除的两个 overlay 源码白名单检查、直接文件差异测试的新增、单个慢测试优化和 CI 清单调整不重复计入本轮删减。本轮旧技能写入测试的退出仅删除测试消费者和测试专属 Rust 实现，未删除正式脚本导出或修改产品接口。

## 全部文件的去留

下表使用同一规则计数：Rust `#[test]`；TS/MJS 的直接 `test(...)` 和 `t.test(...)` 调用点。`configurationTest`、循环和间接注册会展开，因此它是源码定义数，不是实际运行场景数。34个前端/脚本候选文件及45个包含测试的 Rust 文件全部归类；另核对不直接定义测试的 `upstream.rs`、`node_runtime.rs` 和运行子进程脚本。


### 前端纯逻辑

| 文件 | 定义数（前→后） | 决定及实际风险 |
| --- | ---: | --- |
| `src/lib/directory-diagnostics.test.ts` | 2→2 | 保留：目录是否存在/可打开与异常路径去重，风险不由字符串路径检查替代 |
| `src/lib/pi.test.ts` | 12→12 | 保留：原生/托管、加载开关与调用权限、范围和安装身份 |
| `src/lib/codex-defaults.test.ts` | 3→3 | 保留：默认行为和受限选项资格 |
| `src/lib/upstream.test.ts` | 55→53 | 合并：重复未安装检测与分页；保留真实来源、筛选和排序 |
| `src/lib/notification-message.test.ts` | 5→3 | 合并：反馈边界3类；具体原因由error-summary负责 |
| `src/lib/error-summary.test.ts` | 19→12 | 合并：按用户动作归类；删除退役/重复消息 |
| `src/lib/appearance.test.ts` | 3→3 | 保留：主题默认/迁移及选择行为 |
| `src/lib/dsh.test.ts` | 31→30 | 删除伪JSON往返；保留配置/预设选择与独立策略呈现 |
| `src/lib/execution-log.test.ts` | 5→2 | 合并：控制符数据表及原文保留；原输入不减少 |
| `src/lib/agent-skill-actions.test.ts` | 8→7 | 合并：统一当前Agent、托管/原生、按动作批量资格 |
| `src/lib/skill-document.test.ts` | 3→3 | 保留：版本、文档身份与正文状态，不替代组件内容安全 |
| `src/lib/hermes.test.ts` | 7→6 | 合并重复Agent隔离；保留专属加载/信任状态 |
| `src/lib/codex.test.ts` | 32→30 | 合并重复入口和搜索；未知身份/权限继续覆盖 |

### 脚本/组件/原版专项

| 文件 | 定义数（前→后） | 决定及实际风险 |
| --- | ---: | --- |
| `scripts/pi-skills.test.mjs` | 28→28 | 保留：发现顺序、范围、信任、来源身份和非写入扫描 |
| `scripts/dsh-policy-integration.test.mjs` | 0→0 | 保留手动专项：实际原版安装与模型/手动调用；0直接注册，不冒充默认已执行 |
| `scripts/overlay-hints.test.mjs` | 1→1 | 保留真实Hint/Switch交互；前阶段已删除源码白名单，本轮不重复计数 |
| `scripts/version-loading.test.mjs` | 6→6 | 保留：异步过期结果、读失败、真实pending/ready显示（组件项有显式环境条件） |
| `scripts/skill-document.test.mjs` | 19→19 | 保留：真实Markdown/网站渲染、链接安全、卡片交互及商店扩展字段 |
| `scripts/pi-visibility.test.mjs` | 6→6 | 保留：独立策略准备与运行时实际提示词入口职责不同，原版Pi专项有环境条件 |
| `scripts/dsh-policy.test.mjs` | 6→6 | 保留：策略原子保存、禁止入口、启停记忆、迁移及物理别名冲突 |
| `scripts/pi-packages-management.test.mjs` | 7→7 | 保留显式原版Pi专项：整包资源/单成员、项目继承和批量原子性 |
| `scripts/dsh-skills.test.mjs` | 13→12 | 退役旧文件调用写入；保留读取/预检/配置保存和真实原版专项 |
| `scripts/pi-loading.test.mjs` | 9→9 | 保留：请求去重、作用域切换、缓存失效、过期响应与实际更新确认 |
| `scripts/pi-settings.test.mjs` | 1→1 | 保留组件专项：保存范围、选项资格及加载状态 |
| `scripts/local-directories.test.mjs` | 5→5 | 保留：实际目录观察/打开与异步串位；非单纯路径格式 |
| `scripts/pi-package.test.mjs` | 1→1 | 保留原版Pi专项：npm原版检查/更新及字段恢复，不同于纯包配置 |
| `scripts/codex-loading.test.mjs` | 12→12 | 保留：实际组件数据流、读失败重试、权限和App请求并发；与筛选纯函数不同 |
| `scripts/hermes-skills.test.mjs` | 9→9 | 保留：发现、YAML字节、信任、版本及批量写前完整校验 |
| `scripts/release.test.mjs` | 10→10 | 合并四种混用准备；保留全部产物完整性、来源、版本及发行说明规则 |
| `scripts/dialog-results.test.mjs` | 9→9 | 保留：真实渲染的部分结果/操作权限，不由错误原因映射替代 |
| `scripts/dsh-unified.test.mjs` | 4→4 | 保留：多配置完整聚合、缺插件部分成功、策略身份和真实生效确认 |
| `scripts/pi-invocation-state.test.mjs` | 16→16 | 保留：字段恢复/日志/外部改动/来源升级；是现役Pi原生机制 |
| `scripts/node-runtime-feedback.test.mjs` | 2→2 | 保留：真实订阅生命周期及运行时选取操作，不是版本比较重复 |
| `scripts/dsh-skill-policy/isolated.test.mjs` | 6→6 | 保留原版DSH专项：实际发现不变、两入口拒绝、缓存绕过保护和进程重建 |

### 原生功能

| 文件 | 定义数（前→后） | 决定及实际风险 |
| --- | ---: | --- |
| `src-tauri/src/preferences.rs` | 9→8 | 合并旧默认值；排序/范围/合法值保留 |
| `src-tauri/src/versions.rs` | 3→2 | 删重复manifest一致性；比较/响应状态保留 |
| `src-tauri/src/marketplace.rs` | 24→22 | 合并分页重复；缓存失败保留/旧数据迁移按状态保留 |
| `src-tauri/src/marketplace/document.rs` | 14→14 | 保留正文概述、来源身份、引用解析、不执行脚本 |
| `src-tauri/src/upstream/update_safety.rs` | 1→1 | 保留真实基线、支持文件、lock版本关系 |
| `src-tauri/src/upstream/downloads.rs` | 3→3 | 保留md/zip/tgz格式与无来源锁 |
| `src-tauri/src/upstream/pi.rs` | 16→15 | 合并单成员启用重复；设置/信任/范围/CLI边界保留 |
| `src-tauri/src/upstream/hermes.rs` | 5→5 | 保留归属、YAML保存、批量全有全无、项目隔离 |
| `src-tauri/src/upstream/node_runtime_tests.rs` | 9→9 | 保留缓存/shim/并发/下载完整性；外网专项显式 |
| `src-tauri/src/upstream/provider.rs` | 6→6 | 保留v1/v2、digest、选择和实际结果 |
| `src-tauri/src/upstream/creation.rs` | 4→4 | 去创建后的重复安装卸载 |
| `src-tauri/src/upstream/plugins.rs` | 3→3 | 保留分组、manifest变化、Git来源锁 |
| `src-tauri/src/upstream/dsh.rs` | 3→3 | 保留精确成员资格、读取限制、声明版本 |
| `src-tauri/src/upstream/source_removal.rs` | 1→1 | 保留源成员变化、其他来源/原文件 |
| `src-tauri/src/upstream/detection.rs` | 6→6 | 保留不同安装证据；非普通库存检测重复 |
| `src-tauri/src/upstream/usage.rs` | 9→9 | 精简相同PTY Agent排列；实际能力/后代进程/清理保留 |
| `src-tauri/src/upstream/document_diff.rs` | 1→1 | 保留直接文件保护与真实源接通 |
| `src-tauri/src/upstream/restoration.rs` | 11→10 | 合并noop/partial准备，保留重试和不可读恢复 |
| `src-tauri/src/upstream/skill_sync.rs` | 12→12 | 保留独立副本/本地修改/pending/记录接管/删除关系 |
| `src-tauri/src/upstream/dependencies.rs` | 14→14 | 保留声明/冲突/缓存/清理/实际结果，Windows相关风险不退役 |
| `src-tauri/src/upstream/progress.rs` | 2→2 | 保留提前到达与分段流；不是同一条件 |
| `src-tauri/src/upstream/pi_removal.rs` | 5→5 | 保留原目录、链接硬链接、内容变化、Trash失败 |
| `src-tauri/src/upstream/tests.rs` | 51→51 | 合并解析重复、internal/DSH重复真实流程；范围/共享/批量/发现优先级保留 |
| `src-tauri/src/upstream/inspection_session.rs` | 8→8 | 四格缩二；过期失配篡改释放均保留 |
| `src-tauri/src/upstream/eve.rs` | 4→4 | 保留转换、subagent选择、未选副本、链接 |
| `src-tauri/src/upstream/codex/rules.rs` | 1→1 | 保留不透明规则、索引变化 |
| `src-tauri/src/upstream/codex/access.rs` | 1→1 | 保留配置优先级 |
| `src-tauri/src/upstream/codex/discovery.rs` | 4→4 | 保留cursor、公共个人范围、安装权限 |
| `src-tauri/src/upstream/codex/catalog.rs` | 5→5 | 保留权限、来源与provenance；外部capture不充作默认证据 |
| `src-tauri/src/upstream/codex/scope.rs` | 1→1 | 保留项目写入不落用户配置 |
| `src-tauri/src/upstream/codex/account.rs` | 6→6 | 保留账户身份、凭据来源、登录退出、暂时失败区别 |
| `src-tauri/src/upstream/codex/tests.rs` | 10→10 | 保留原CLI专项；CLI/App分支不可合并结果 |
| `src-tauri/src/upstream/codex/defaults.rs` | 3→3 | 保留允许字段、原版保存、并发保护 |
| `src-tauri/src/upstream/codex/markets.rs` | 6→6 | 保留注册移除升级、来源认证 |
| `src-tauri/src/upstream/codex/presentation.rs` | 1→1 | 保留声明身份、图片包含边界 |
| `src-tauri/src/upstream/codex/skill_inventory.rs` | 1→1 | 保留空/不可读/缺失/新版源区别 |
| `src-tauri/src/upstream/codex/details.rs` | 2→2 | 保留只读本地元数据/不依赖凭据 |
| `src-tauri/src/upstream/dsh/native.rs` | 13→12 | 退役测试专属调用写入；迁移provider及移除保护 |
| `src-tauri/src/upstream/dsh/policy.rs` | 2→2 | 保留真实并发、新建、链接写保护 |
| `src-tauri/src/upstream/pi/packages.rs` | 2→2 | 保留记录写入与原版包更新 |
| `src-tauri/src/upstream/pi/native.rs` | 7→7 | 保留字段写入、迁移、prepared恢复、损坏记录、原字节 |
| `src-tauri/src/upstream/pi/inventory.rs` | 1→1 | 保留原Pi加载继承接通 |
| `src-tauri/src/upstream/pi/visibility.rs` | 8→8 | 精简四来源重复操作；外部策略/当前范围保留 |
| `src-tauri/src/upstream/codex/updates/source.rs` | 1→1 | 保留冻结来源、不跟随链接 |
| `src-tauri/src/upstream/codex/updates/tests.rs` | 10→10 | 保留迁移冲突、disabled、其他插件、App注入；两manifest已有共享准备 |

### 保留与本轮不运行的边界

- 原版 Pi、Codex、DSH、Desktop ASAR 及 React 专项保留各自显式前置条件，不将跳过记为通过；本轮不为增加通过数量而安装宿主、使用真实个人配置或运行云端任务。
- `dsh-policy-integration.test.mjs` 是手动原版插件完整流程，虽然文件名含 test，但没有直接注册项；不因改名降低数量，也不把它纳入默认执行伪造覆盖。
- `dsh-policy-runtime.test-worker.mjs` 是上述实际插件子进程；`upstream.rs` 是测试模块入口；`node_runtime.rs` 的复用辅助仅在测试编译。它们不是额外的独立测试定义。
- Pi旧外部记录迁移、prepared恢复、损坏记录和旧目录仍有正式消费者；保留。Direct Download与Provider的锁、digest及支持文件责任不同；保留。
- Windows已出现问题对应的路径身份、目录签名、Git字节、真实CLI结果和共享/恢复保护均保留。macOS执行不代表Windows/Linux执行通过；Linux先前失联原因没有新证据。

## 数量

| 同一计数口径 | 精简前 | 精简后 | 减少 |
| --- | ---: | ---: | ---: |
| TS直接注册点 | 185 | 166 | 19 |
| 脚本直接注册点 | 170 | 169 | 1 |
| Rust测试定义 | 309 | 302 | 7 |
| 源码合计 | 664 | 637 | 27 |

连同前阶段移除两个源码白名单检查、增加一个直接行为检查，最初665处定义到当前637处，累计净减28处；上表只计本轮净减27处。

这里没有把数据表中的每条输入都算作删除；发布脚本4个动态场景合为1个，调用点数量保持不变。真实运行数及耗时见下一节；不拿关键CI子集冒充整套前后对比。

## 最终验证与耗时

| 检查范围 | 精简前 | 精简后 | 计时边界 |
| --- | --- | --- | --- |
| 默认前端完整命令 | 311项：279通过、32跳过；12.549秒 | 291项：259通过、32跳过；11.760秒 | 同机同命令墙钟，少20项、减少0.789秒（约6.3%） |
| 完整原生默认库套件 | 历史307项：268通过、39跳过；729.82秒 | 302项：263通过、39跳过；669.23秒 | Rust测试程序内部时间，不含编译；历史基线差异见下文 |
| 发布脚本 | 13项全通过；361.066毫秒 | 10项全通过；315.105毫秒 | 两边均Node测试程序内部计时；新命令墙钟0.374秒 |
| 严格TS检查 | — | 通过，5.378秒 | 本次独立类型检查 |
| 原生测试程序真实编译 | — | 通过，18.594秒 | `cargo test --locked --offline --lib --no-run` |
| 关键选择元数据 | Unix84 / Windows81 | Unix81 / Windows78 | 由真实编译列表及ignored列表检查；不再重复执行子集 |

原生旧完整日志早于两项新增检查（可移植树签名、直接文件差异），也早于前阶段的两项慢流程优化。本轮开始时的源码是309项，精简后302项；729.82秒是可用的历史整套基线，不能据此精确计算“本轮27项删减”的单独加速比例，也不能与云端20/29分钟混作同机比较。本轮不重跑旧整套以制造完全同版本基线。

前端第一次执行发现合并后的模拟插件ID没有保留市场后缀，导致1处预期不符（1.170秒后停止）。修正测试数据并补齐未知安装身份后，取得上表一次完整成功结果；产品搜索代码未改。编译、发布及完整原生没有因此重复执行。

全部实际执行的检查通过；前端32项和原生39项原有环境限定检查未运行，不列入通过数。Windows/Linux未运行，不作跨平台验收声明。本轮由独立测试审查复核迁移覆盖；无UI变更，未委派UI审查或运行UI自动化。复用前阶段有效App构建，不重复打包。

未提交、未推送、未触发云端构建、未创建标签或Release。
