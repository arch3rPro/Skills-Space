# DeepSeek Harness 原生配置与技能管理补齐调研

后续复核：当前分端配置、Agent scope、Settings 持久化及插件管理以 [2026-10-29 复核](deepseek-harness-management-review-2026-10-29.md) 为准；本文旧版本结论保留为历史证据，不代表当前上游全部能力。

2026-10-28 引用维护：下列 npm 源码位置、行号与哈希属于调研时快照，旧安装现已移除，改为历史文本记录。当前桌面运行包位置与读取兼容结论见 [spec 0009](../specs/0009-dsh-native-skill-management.md#2026-10-28-桌面运行包读取兼容)；没有将旧版本哈希改写为桌面版哈希。

日期：2026-10-17。状态：源码核查完成；A—D 后经用户明确批准实施，验收见 [0009](../specs/0009-dsh-native-skill-management.md)。以下源码观察保留调研时点，研究本身不构成写入授权。

后续复核：[2026-10-18 配置机制与补齐方案](deepseek-harness-configuration-mechanism-review-2026-10-18.md) 已进一步核对 bundle 组合、整 config 替换与用户覆盖层写入。下文 A—D 是当时受控子集，不表示已支持普通 bundle-backed Profile 的完整有效配置读取或编辑。

## 1. 结论与核查范围

建议下一批补齐“按 Profile／preset 的准确检查、受控配置编辑、独立本地技能调用策略和安全卸载”。继续使用原版 skills CLI 管理 `.agents/skills` 中的托管安装。DSH 的原生设置不是 Pi 的目录排除规则：需要遵循其 Profile 补丁、作用域注册表和技能元数据，不能复用一个统一启停开关来代替这些语义。

本机 `@deepseek-ai/dsh` 及本次核查的相关模块为 **0.2.0-rc.2**。本轮固定上游 `master` 提交 **687f282e8625c6b8d11ff58211a90524be2e4317**，其中 [CLI 清单](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/package.json) 标为 **0.2.1-rc.2**；两者分别核查，未把源码版本当成本机已升级版本。项目当前提交为 `11b3b7b8a9cab297f0698570b984d1891bd673d3`，另有 Pi、Hermes、界面等未提交修改，本轮仅阅读，不修改它们。

该仓库定位为 Cordis 插件化 Agent Harness，仍标为开发预览并提示可能破坏兼容；[许可为 MIT](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/LICENSE)。本次是配置／技能接口的局部源码审计，不评价整个仓库的生产成熟度。

## 2. 上游实际能力与边界

### 2.1 技能目录与配置字段

文件系统提供器有 `customSkillDirs`、`includeDefaultRoots`、`watch`，以及 `providerName`、`dshHome`、`agentsHome`、`bundledSkillDir` 和监听参数；没有 Pi 式的逐技能排除清单。关闭整个提供器、关闭默认目录、修改某技能的调用权限是三种不同操作。

同一注册层内默认目录优先级为：项目 `.dsh/skills` → 项目 `.agents/skills` → 附加目录 → 用户 `.dsh/skills` → 用户 `.agents/skills` → 内置来源。项目根为最近 Git 根，未找到 Git 根时使用传入工作目录。提供器只扫描单层技能目录中的 `SKILL.md` 或根目录的扁平 `.md`；这不是任意递归目录扫描。

证据：[配置 schema](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts#L48-L88)、[目录构造](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts#L244-L263)、[发现规则](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts#L730-L757)。本机发行包中的对应字段和规则亦已阅读，未执行提供器。

### 2.2 逐技能控制是两个独立权限

上游读取技能 YAML 中的 `disable-model-invocation` 与 `user-invocable`。未声明时模型和用户调用均允许，支持以下四种组合：

| 产品表述 | disable-model-invocation | user-invocable |
| --- | --- | --- |
| 自动选择与手动调用 | false／未声明 | true／未声明 |
| 仅手动调用 | true | true／未声明 |
| 仅自动选择 | false／未声明 | false |
| 禁止调用 | true | false |

“禁止调用”仍保留有效技能的目录候选和同名优先级；不是卸载、从目录排除，也不自动让同名低优先级技能接替。不要把它包装为 Pi 式启停。它也不能撤回已经进入对话的内容。

证据：[字段解析与旧字段拒绝](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts#L1007-L1042)、[先按名称选出获胜项](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill/src/index.ts#L551-L581)。以上优先级结论由收集和调用过滤的先后顺序推导，不是运行实验。

**共享文件的限制：** 修改 `.agents/skills` 内的元数据可能影响其他读取相同文件的 Agent。已核查的提供器和技能注册表没有“只为 DSH 覆盖某个共享技能调用权限”的持久配置；不增加一个应用私有开关冒充 DSH 生效。自定义插件可能实现其他行为，本结论不涵盖未检查的插件。

### 2.3 Profile、preset、项目范围必须分开

Profile 是应用启动配置及补丁的载体；preset 是 Profile 组合内声明的 Agent 插件配置；项目路径是技能发现的 `cwd`。项目拥有 `.dsh/skills` 不等于上游提供了一个项目级设置文件，不能自行创建 `.dsh/settings.json` 来假装原生设置。

官方启动次序包含 bundle 层、Profile 用户补丁、HOME 补丁、命令行 `--patch` 等层；HOME 层可以覆盖 Profile 层。某个 preset 的注册层还会覆盖外层的同名技能，目录 rank 只在同一层中决定优先级。将所有 Profile 的目录合并后标记一个“生效技能”会得出错误结论。

证据：[Profile 组合顺序](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/src/profile-boot.ts#L211-L235)、[作用域覆盖规则](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill/src/index.ts#L346-L354)。

### 2.4 有原生配置编辑能力，但不能无条件套用设置 API

官方 `ConfigEditor` 拥有 Profile 补丁写入：检查入口是否仍有效、锁定 Profile、处理继承与覆盖、验证 schema，原子写入后通过 Loader 重组，失败则恢复。它是运行时服务，不是一个独立的无状态配置写入 CLI。证据：[编辑完整路径](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/config-editor/src/index.ts#L87-L153)。

本机 **0.2.0-rc.2** 另有原生 `settings` RPC，包含 describe、update、replace、mutate。检查 `dsh-settings` 实现发现，其表单和写入只接受 schema 中的 volatile 字段；`skill-filesystem` 当前列出的目录／监听字段没有该标记。因此不能因存在 `settings.mutate` 就承诺能直接修改这些字段。该段依据本机发行模块，而非已固定上游的同路径源码：

- 本机 `dsh-settings/lib/index.js` 的 `describe` 使用 `volatileForm`，`write` 拒绝非 volatile 路径。
- 本机 `dsh-api-settings-controller/lib/index.js` 把这些调用转发给 settings 服务，并不是任意插件配置写入接口。
- 配置编辑器会用完整 raw config 处理继承；不能把删减后的前端展示数据回写为完整配置，尤其不能覆盖未返回的秘密和无关字段。

本机对应证据：settings 字段过滤与写入校验（`@deepseek-ai/dsh-settings/lib/index.js:415`）、设置 RPC 转发（`@deepseek-ai/dsh-api-settings-controller/lib/index.js:387`）。这些模块的版本、绝对路径及 SHA256 已记入本轮本地证据。最新 0.2.1 的 settings 服务和传输端到端未核查，不对其接口稳定性作承诺。本机 atomic-write（`@deepseek-ai/dsh-atomic-write/lib/index.js:165`） 使用 `<filename>.lock` 的 PID 文件锁；ConfigEditor 锁定的是 Profile 的 `package.json`，并非单独锁补丁文件。

### 2.5 dump-config 不是无副作用的读取入口

`runDumpConfig` 不启动完整插件组合，也不求值 `!!js`；但会调用 `prepareProfile`，后者加载 Profile 并重写根配置文件。因而不得在读取 Skills Space 页面时，对真实 HOME 自动执行 `--dump-config`／`--dump-default-config`。同理，带初始化参数的诊断也不能视为读取。

证据：[导出调用](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/src/dump-config.ts#L31-L42)、[Profile 准备写入](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/src/profile-boot.ts#L181-L200)。本机 0.2.0 编译文件也有同一路径。本轮没有运行这些命令。

### 2.6 自动监听、会话与实际加载

文件系统提供器默认监听目录，变化会使目录缓存失效；开启监听且观察正常时，后续查询可以看到新状态。监听关闭或异常时，不能仅靠应用回读文件就声称 DSH 已同步；下一批以重新启动 DSH 作为可靠的人工恢复路径，不照搬 Pi 的 `/reload` 文案。

上游已存在会话定址的 `skills/list` RPC，但只返回该会话视图中允许用户调用的技能；它不是完整模型技能列表，也不证明技能正文已经加入模型上下文。自动调用允许、用户调用禁止的技能会被该接口过滤掉。

证据：[会话列表与过滤](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/skill-catalog.ts#L28-L87)。本轮没有连接本机运行实例或认证会话。

preset 的定义更新与已有 Agent 使用的版本也要区分；上游保留旧版本供已有使用者持有，且已开始的会话不能通过 preset select 切换。因此“保存后切换当前会话配置并立即全部生效”不能作为交付承诺。证据：[定义退役与使用者](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset-registry/src/index.ts#L81-L99)、[会话切换限制](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset-registry/src/index.ts#L341-L365)。

### 2.7 原生卸载与插件管理

已核查的主 CLI 分发没有逐技能安装／更新／卸载／启停模式；`dsh plugin` 管理的是 Profile 插件包，不能拿它卸载一个本地 Markdown 技能。源码入口见 [CLI 分发](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/src/bin.ts#L28-L73)。不排除某个未核查 Profile 自行提供额外命令。

独立本地技能可由 Skills Space 在明确授权后移入 OS 废纸篓，这是桌面应用扩展，不是上游技能卸载 API。内置、插件包、虚拟运行时和共享 CLI 技能不能据此直接删除；没有来源锁也不能虚构自动更新来源。

## 3. 与现有实现的差距

| 当前实现 | 下一批需修正／补齐 |
| --- | --- |
| 只读扫描用户／项目 DSH 与共享目录，附带静态配置声明 | 保留；增加版本和 Profile／preset／provider 的检查上下文 |
| Profile 下拉只筛选配置声明，根目录和候选仍可能来自多个声明 | 目录、候选及覆盖诊断必须与选定上下文绑定；未解析组合只能称候选，不称实际生效 |
| 先加入默认目录，再收集配置目录 | 区分默认候选与已解析的提供器配置；不能在 includeDefaultRoots=false 后仍把默认目录标为该提供器启用 |
| 任一 Profile 的覆盖／动态声明都可能阻止 DSH 安装 | 只对选定且相关的声明做阻止；未知上下文保持保守，不因另一个无关 Profile 一并禁止所有安装 |
| 静态自定义目录仅支持绝对路径；不读取完整 bundle 组合 | 未确定运行基准的相对目录保留未解析，不按项目目录猜测；动态表达式不执行 |
| 当前项目视图隔离全局库存 | 保留库存归属边界；另区分“配置对该 cwd 是否适用”，不把全局技能偷偷移进项目库存 |
| 原生技能只查看，状态没有配置／文档写入版本 | 增加每文件路径身份、内容指纹、引用关系及能力资格，支持受控调用策略与废纸篓卸载 |
| 原版 universal 映射与托管生命周期已验证 | 原样保留，不增加安装到 `.dsh/skills` 的自有安装器，不修改原版 CLI／锁格式 |
| 卡片仅显示异常，详情保留完整检查信息 | 保持；不恢复“尚未核验当前会话”等正常状态提示 |

依据当前 [检查 helper](../../scripts/inspect-dsh-skills.mjs)、[原生适配](../../src-tauri/src/upstream/dsh.rs)、[只读设置页](../../src/components/dsh-management.tsx)、[状态模型](../../src/lib/dsh.ts) 与 [首批方案 0007](../specs/0007-deepseek-harness-skill-management.md)。这些差距不表示首批越界写入；首批原生配置只读边界仍然成立。

## 4. 建议下一批范围，已获用户批准

### A. 配置和库存检查补齐

1. 设置中使用“查看 Profile／preset”的语义，明确是检查上下文，不切换运行中的 DSH。项目路径只决定发现工作目录。
2. 根目录、配置声明和候选携带归属；区分字面声明、继承默认、未解析，避免跨 Profile／preset 合并判断。只向界面和日志返回技能白名单字段；无关节点只原样保留，不提取模型、凭据等值。
3. 对可确定的作用域修正默认目录停用、同名覆盖和安装路径资格；版本／动态组合不明时只保留检查能力，不放宽写入保护。
4. 对 bundle、内置和运行时贡献，只展示能够可靠归属的记录。没有物理文件的运行时技能不通过猜测文件目录补造库存；完整运行时目录留待在线接口方案。

### B. 技能相关配置的受控编辑子集

建议第一版只允许编辑 **附加技能目录、是否包含默认目录、自动监听**：`customSkillDirs`、`includeDefaultRoots`、`watch`。

**可写条件全部满足才提供保存：**

- 用户选定明确的 Profile／preset／provider；现有用户补丁文件中有可唯一定位的静态字面配置节点。
- 能确认该节点的文件所有者和作用范围，且无已知 HOME／其他覆盖阻止目标字段生效；不能把“没读到覆盖”当作“没有覆盖”。
- 不创建新 Profile，不将继承的整个 preset 复制成用户配置，不新增未知 bundle 的覆盖模板，不修改插件缓存或安装包。
- 仅按字段修改 YAML AST，保留无关配置、注释和表达式原文；动态或无法安全表示的目标拒绝写入。
- 保存必须与本机原生编辑器使用一致的 Profile `package.json.lock` 写入锁协议，再校验配置依赖和文件指纹；只创建一个应用私有锁并不足以协调 DSH。无法确认锁兼容时不保存。冲突则刷新，不覆盖；原子写入并回读。写入确认只表示文件已保存，不承诺运行中会话已重组。

**重要限制：默认安装若只有继承的 bundle 配置、没有可唯一定位的用户声明，该部分继续只读，提供打开原配置文件的入口。完整继承设置的创建／恢复不属于这个子集。** 若期望默认 Profile 也能无条件表单编辑，需要后续完成原生配置接口或精确组合适配，并单独验收，不能假装本批已经覆盖。

`dshHome`、`agentsHome`、`bundledSkillDir`、providerName、监听高级参数只读；整个提供器停用不与逐技能调用控制混用。全局 HOME 补丁影响所有 Profile，第一版不自动新增或改写。

### C. 独立 DSH 本地技能调用策略

- 仅允许已核对的用户 `DSH_HOME/skills`（默认 `~/.dsh/skills`）及项目 `.dsh/skills` 下可证明独立的本地技能；共享 `.agents/skills`、CLI 托管、插件包／内置、`.system`、符号链接／硬链接以及所有权未知的附加目录保持只读。
- 提供上述四种调用策略，修改两个官方元数据键；保留正文、其他 YAML、注释、换行与未编辑字段。使用文件指纹及原子写入，执行前后重新核验资格。
- 若某技能被多个已知作用域读取，明确影响全部读取者，不声称只对一个 preset 生效。无法确定独立性时不开放写入。
- 多选操作按物理文件身份逐项处理，保持搜索／排序／选择，失败停止并报告已完成数量，不自动回滚其他成功项或重试。
- 不提供误导性的“已加载”标签，也不新增仅应用侧生效的禁用表。

### D. 独立 DSH 本地技能安全卸载

- 范围与 C 一致，继续使用既有卸载确认、路径与影响展示。用户确认后只移入 OS 废纸篓；失败不回退为永久删除。
- 目录技能只移动经完整内容指纹核验的单个技能目录；扁平 Markdown 只移动该文件，不移动父目录，不删除可能被其他技能引用的附件。
- 阻止链接、硬链接、根目录、插件缓存、共享区、包含其他技能的目录以及过大／无法完整检查的内容。配置、CLI 来源锁、其他技能和附件保持不变。
- 复用 Pi 现有废纸篓通道和安全校验模式，但资格判断必须依据 DSH，不复用 Pi 包与规则语义。

## 5. 受限或暂不做的能力

| 能力 | 结论与原因 |
| --- | --- |
| 仅对 DSH 禁用共享技能 | 已核查接口没有独立持久覆盖；改共享文件会影响其他读取者，当前方案不做 |
| 与 Pi 完全相同的逐技能排除启停 | 提供器无该配置；以准确的调用策略替代，不伪造排除规则 |
| 默认／复杂继承 Profile 无条件可写表单 | 上游内部编辑机制存在，但通用 settings RPC 不等于任意配置 API；本批仅受控子集 |
| 当前会话完整实际加载状态 | 现有 RPC 是用户可调用目录，不能覆盖所有模型技能或上下文注入情况；下一批不接运行实例 |
| 已开始会话切换 preset | 官方 select 有明确锁定；不绕过 |
| 插件／内置／虚拟技能直接卸载 | 内容归提供器／插件所有，不能转为本地文件删除 |
| DSH 原生技能自动更新来源 | 原生文件没有可靠来源锁时无法做；托管区仍使用原版 CLI |
| 动态配置／任意插件的完全求值 | 读取阶段不执行插件或 !!js；未知配置只读 |
| 原版 dump-config 后台读取真实配置 | 有文件写入副作用，不使用；必要实验只可在后续明确授权的隔离环境中做 |
| DSH 本体更新、完整插件／模型／凭据管理 | 不属于本批技能管理范围 |

## 6. 实施组织与验收

用户已确认 A—D；后续实施与验证见 [0009](../specs/0009-dsh-native-skill-management.md)。批准的顺序是：先实现读取上下文及资格判断，再分别实现配置子集、调用策略、废纸篓卸载和界面接入；补充 0007 与 ADR 0005 中 DSH 原生写入例外。各项独立验证，不把通用 CLI 改成第二套技能安装器。复用现有 Field、Select、Button、调用操作入口及 AlertDialog，不增加独立配置应用或未来模块占位。

验收至少覆盖：

1. 0.2.0 实际安装版本与 0.2.1 源码差异；未知版本仍可查看，写入资格不默认放行。未经授权不安装或升级第二个 DSH 版本。
2. 全局／项目／Git 子目录、多 Profile／preset、HOME 覆盖、重复 ID、默认目录关闭、相对目录及 !!js；同名且调用禁止的优先级不被误判。
3. 字面配置修改／保存冲突／不支持节点拒绝；有无继承配置；无关 YAML、秘密、配置文件权限及运行实例不被改写或启动。
4. 调用策略四组合、未声明键、无效元数据、CRLF／注释／正文保留，以及链接／硬链接／共享区／插件资源拒绝。
5. 废纸篓目录与扁平文件、指纹变化、其他技能／附件／配置／来源锁保留，失败不永久删除；包含默认根和符号链接的反例。
6. 原版 CLI 全局／项目安装、真实内容更新、共享卸载继续通过；原生同名资源不被托管操作连带变更。
7. 前端契约、相关原生用例、前端构建、`CI=false pnpm tauri build --debug --bundles app`；隔离桌面的保存、冲突、权限变更、真实废纸篓及重启后文件／偏好持久化。正常卡片不多提示，异常和影响只在对应流程说明。

## 7. 调研阶段证据与未覆盖

调研阶段仅执行匿名源码获取、安装包／项目代码读取、版本清单和文件指纹记录。**调研阶段没有运行 DSH、上游构建／测试／插件、配置导出命令或模型会话；没有写入真实用户配置／技能，也没有实施 A—D。** 后续获准实施的结果单独见 0009。 既有 DSH 项目测试用例已阅读；本轮不复跑上一批生命周期测试冒充本方案验收。

获取使用已固定 SHA 的官方 raw 文件，未克隆仓库或安装依赖。20 次远程访问包含：仓库页面 1 次、提交详情的沙箱 DNS 失败 1 次、宿主重试超出 200 KiB 上限 1 次、小型 ref 元数据 1 次、固定源码路径 16 次。后者 15 次成功，共 256,139 字节；`packages/skill/skill-filesystem/src/index.test.ts` 返回 404，未据此断言上游没有测试。未继续猜测路径、获取 CI 或扩大预算；本轮未检查官方测试正文。

`.scratch/dsh-native-research/` 保存本轮 acquisition.json、固定 revision、已读上游文件、安装模块指纹和读取时的项目状态；这些是忽略的本地证据，不纳入功能提交。settings 服务／控制器的结论只对本机 0.2.0 发行文件完成核查，0.2.1 对应源码及认证传输未查；在线接口集成需要单独补证。

固定文件清单：LICENSE、README、CLI package.json／bin／profile-boot／dump-config，skill-filesystem、skill、config-editor、agent-preset、agent-preset-registry、cordis-host-runner、app-boot、会话 skill-catalog、ui-cordis 的已获取入口。后两个 UI／runner 入口不构成额外配置编辑接口证明。这里只复用配置所有权、指纹校验、原子写入、失败恢复等模式；不拷贝上游完整插件系统，不增加运行时 DSH SDK 依赖。
