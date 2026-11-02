# DeepSeek Harness 原生技能、托管技能与配置能力复核

日期：2026-10-29。状态：固定源码研究与现有实现差异核对完成；不构成实施授权，未修改应用功能或个人 DSH 配置。

## 研究基准与边界

本轮通过 Git 只读获取官方仓库，`git ls-remote --symref` 和本地 checkout 一致确认：默认分支 `master`，固定提交 `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`。CLI 与 app-boot 的源码 package 元数据为 `0.2.2-alpha.2`。这不是 npm 最新发行、用户当前安装版本或运行会话的声明。npm latest 页面本轮未成功取得，不据此补猜发行状态。

检查官方实现、随仓库文档及 Skills Space 当前工作区，未安装依赖、未执行上游脚本、未启动 DSH/插件/模型、未连接个人运行实例。上游已有测试作为契约证据阅读，本轮未运行其测试。结论是固定源码审核，不是跨版本／真实运行时验收。此前 0.2.0/0.2.1 研究属于历史证据。

## 主要结论

1. **必须分开配置归属与运行入口。** npm CLI 和 Desktop 默认可以共用 `~/.dsh`；Web 默认 `profiles/web`，Desktop 固定 `profiles/desktop`，其依赖解析安装锚点也不同。Desktop 还有独立 Electron userData 壳层配置，不能写成一个“DSH 配置文件”。
2. **托管／原生是 Skills Space 的生命周期归属，不是 DSH 的两套技能引擎。** 原版 skills CLI 安装到通用 `.agents/skills` 的内容，会被 DSH 的文件技能提供器读取；普通原生文件也可能来自同一个根。分类不能只靠路径或是否在 DSH 界面出现。
3. **文件清单不是完整 Agent 技能清单。** 上游有文件 provider、插件提供的 bundled provider，以及运行时技能注册；还有 per-Agent scope 的层级覆盖。当前 Web 默认把文件 provider 和加载工具放到 preset 内，主机层对应条目停用。
4. **持久化不等于所有字段都能通过 Settings 写。** `Settings` 对 active、唯一寻址、声明 `.volatile()` 的字段开放 revisioned 写入，保存到 active Profile patch；普通字段、嵌套 Include／preset 子条目不能据此自动获得编辑资格。`skill-filesystem` 当前字段没有声明 volatile。
5. **插件包、Cordis 条目、Agent preset 和会话选择是不同动作。** npm 插件依赖安装不等于启用配置条目；preset 选择不等于创建 preset；移除一个插件包可能同时影响技能、工具、UI 和其他服务，不能伪装成删除一份 SKILL.md。

## 配置文件与运行入口

| 对象 | 默认位置／归属 | 应如何解释 |
| --- | --- | --- |
| Harness HOME | `$DSH_HOME`，未设置时 `~/.dsh` | 显式配置路径优先；空白环境值视为未设置；CLI 与 Desktop 可共用，但不应强行合并不同 HOME |
| Web Profile | `$DSH_HOME/profiles/web/package.json`、`cordis.patch.yml` | Web 默认；自定义启动 Profile 时随之改变，不是固定永远写 web |
| Desktop Profile | `$DSH_HOME/profiles/desktop/package.json`、`cordis.patch.yml` | Electron 自主管理；使用 Desktop 自己安装包的 bundle 解析与进程锁 |
| 通用上层覆盖 | `$DSH_HOME/cordis.patch.yml`，以及启动时 `--patch` | 在 Profile 用户补丁之上；不能仅凭 Profile 文件推断运行有效值 |
| Desktop 壳层 | `Electron userData/desktop/settings.json` | 与 HOME 独立；当前实现是壳层更新测试开关，启动时读取、需重启 |
| Desktop 快捷键／语言缓存 | `userData/keybindings.json`、`userData/desktop/locale-cache` | 不是技能／Agent 配置；不能从这些文件反推 Profile 内容 |
| 模型凭据 | `$DSH_HOME/.credentials.yaml` | 上游原生凭据文件；设置保留引用，界面返回 write-only descriptor。Skills Space 不应另存明文副本 |
| Web 浏览器 | 客户端连到的 Host | 核心配置在 Host 所在机器；浏览器偏好不能代替服务端 Profile，远端 Host 更不能套用本机 HOME |

补丁组合顺序是 bundle 声明层 → Profile 用户层 → HOME 层 → argv overlays，另有启动器拥有的最终 telemetry overlay；动态表达式与运行期配置仍有边界。`resolveBundleDir` 先使用所属安装锚点，再查 Profile 依赖；同机并存 npm 与 Desktop 时，不能用 npm 的安装锚点解释 Desktop 默认 bundle。`composeEntries` 保持 Cordis 补丁语义，不能当普通 YAML 深合并。部分 Profile 加载入口会进行清理／迁移，不能为了“只读展示”随意调用。

证据：[HOME 解析](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/util/home-paths/src/index.ts#L125-L156)；[安装锚点与 Profile 加载](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/app-boot/src/profile.ts#L645-L714)；[声明组合](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/app-boot/src/profile-context.ts#L67-L85)；[Desktop 壳层设置](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/src/settings.ts#L19-L53)。Desktop/Web、插件与 Agent 的完整入口证据见 [分端专项记录](deepseek-harness-surfaces-evidence-2026-10-29.md)。

## 技能来源、发现与优先级

### 生命周期归属

| Skills Space 归属 | DSH 如何读取 | 安装／更新／卸载归属 | 允许的控制边界 |
| --- | --- | --- | --- |
| 原版 CLI 托管技能 | 文件 provider 扫描通用 `.agents/skills` | 未修改的原版 skills CLI；当前项目固定 1.7.4 | Agent 配置可改变发现；不能借增强功能改托管技能正文／frontmatter或绕过共享卸载 |
| 独立原生技能文件／目录 | `.dsh/skills`、通用根或自定义根，需 provider 被挂载 | 本轮不新增安装器；独立文件可沿用已批准调用策略／废纸篓能力 | 仅对实际独立资源执行，保护共享、CLI、包拥有内容 |
| npm／bundle 提供的技能 | provider 注册，不必经过文件 provider | DSH 原版插件管理与所属包 | 包整体更新／移除，列出非技能影响；不直接改／删应用打包资源 |
| 运行时注册技能 | `ctx.skills.register`，可能没有稳定文件路径 | 注册插件／服务生命周期 | 不能承诺导出、更新或文件卸载；无路径不等于损坏 |
| 会话可见技能 | cwd + preset／Agent scope + registry + 调用策略 | 运行时观察结果 | 与磁盘已安装分开；没有会话数据时不能冒充完整有效清单 |

托管技能中即便有 `disable-model-invocation`，其读取结果也可以显示；修改该键却属于修改技能内容，不是 Agent 配置。本轮既有“只允许改 Agent 配置”的约束必须保留。如果 upstream 没有 per-skill 配置控制，不能发明一种旁路禁用文件格式让 DSH 假装读取。

### 文件 provider 的规则

根内只发现直接 `<name>/SKILL.md` 和直接 `<name>.md`，不做任意递归。`name` 为小写 kebab-case，`description` 必需；调用策略严格解析原键名，错误值会令技能被略过，旧驼峰调用键也被拒绝。支持链接时仍须观察真实归属，不能因此允许移除外部共享目标。

同一 scope 层内的 rank：项目 `.dsh/skills` 100 → 项目 `.agents/skills` 200 → runtime 注册 250 → custom 300 → 用户 DSH 400 → 用户 agents 500 → bundled 600。项目根是最近 `.git` 祖先，无 Git 时使用 cwd。runtime 250 属于 registry 注入，不是文件 provider 新增的一种目录。相同 rank 再按 provider 注册顺序、provider 内顺序决定。跨 scope 则先全局、再祖先、最后最近 scope 覆盖同名；不能拿全局 rank 100 压过最近 Agent 层的 rank 600。

`includeDefaultRoots:false` 停止项目、用户及环境 bundled 默认根；显式 custom 和显式 `bundledSkillDir` 仍可用。路径解析应遵循所属版本的 home-paths 语义，不能把空环境变量解释为 cwd。文件 body 按需重读；目录／元数据 watcher 影响后续 catalog，但不自动证明已打开的浏览器菜单缓存同步刷新。

证据：[provider schema](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill-filesystem/src/index.ts#L48-L88)；[根计算与 bundled 默认](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill-filesystem/src/index.ts#L163-L177)；[根顺序](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill-filesystem/src/index.ts#L251-L271)；[直接发现](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill-filesystem/src/index.ts#L734-L768)；[scope 与层内去重](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill/src/index.ts#L551-L580)；[rank tie break](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill/src/index.ts#L807-L811)。

### 当前默认 Web 与会话读取

`web-app` 停用了 host `skill-filesystem` 和 `tool-skill`；standard 等 preset 内挂载它们。重复出现 `id: skill-filesystem` 是不同 preset 的正常结构，不应当作整份 Profile 的全局 ID 冲突，也不应把 host 停用条目当成当前 Agent 没有技能。[host 条目停用及原因](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/bundle/web-app/cordis.patch.yml#L508-L521)；[standard preset 内 provider](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/bundle/web-app/presets/standard.patch.yml#L1-L40)。

`ctx.remote.skills.list({sessionId})` 能按会话 cwd、preset／scope 读取**用户可调用**技能，包含 `modelInvocable`，不加载 body；它不是完整原生资源管理或技能 CRUD。model-only 技能不会出现在这个用户目录里。运行时内部 registry 的 `snapshot` 能报告完整性；不能因为公共 list 返回空数组就宣称整个磁盘不存在技能。[Session skills Remote](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/api/session-controller/src/skill-catalog.ts#L29-L93)；[registry snapshot/get](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill/src/index.ts#L463-L514)。

上游 `ui-skill` 的既有功能是 `/` 选择、技能引用／文件预览及调用行。文档明确保留客户端目录缓存边界：外部文件变化可能尚未反映到已打开会话菜单。不能将文件 watcher 的成功等同于所有 UI／会话立即刷新。[UI 目录与缓存](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-skill/README.md#L25-L49)；[缓存限制](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-skill/README.md#L85-L97)。

Office 插件是非文件 provider 路径的具体例子：`dsh-office` 提供七种打包技能，rank 600，部分 body 按实际部署注入运行时路径。读取一个 assets 文件不必然等于运行时完整 body，也不能把包内资源当普通可删原生目录。[Office provider](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill-office/src/index.ts#L14-L95)。

## 配置、插件与 Agent 的可执行边界

在已核查的 CLI 命令表中，没有等价于通用 `skills add <Git SKILL 仓库>` 的独立技能安装命令。`dsh plugin` 管理 Profile 中的 npm 插件包／bundle 依赖；包可以贡献技能，但不能把只有 SKILL.md 的仓库当成插件包，或用插件卸载代替通用技能卸载。[CLI 命令表](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/args.ts#L143-L201)。


| 动作 | 上游能力 | 本轮结论 |
| --- | --- | --- |
| 已运行实例的可编辑字段读取、保存、恢复继承 | Settings descriptor／revisioned update/mutate + ConfigEditor | 可复用，但只限 active／唯一寻址／volatile 字段；不能对任意字段泛化 |
| 技能文件根／watch 等配置 | 文件 provider Config 是普通字段，无 volatile 声明 | 不能凭 Settings 存在就宣称可直接 RPC 写；离线补丁或另经上游明确的编辑入口，需保留来源和继承 |
| preset 内 skill-filesystem 配置 | preset `config.plugins` 声明 | 不能用同名 root id 覆盖；父 preset 完整物化此前暂缓，不能暗中恢复实施 |
| 插件包检查、安装、更新、移除、进度／取消 | 原生 PluginManager 与 CLI Profile package 工作流 | 上游已有，不应继续概括为不支持；Skills Space 尚无 DSH 对应入口 |
| Cordis 插件条目开关 | 原生 PluginManager 条目操作 | 与 npm 依赖安装／卸载分开；报告被上层覆盖、需重启和未确认结果 |
| Agent preset 清单、声明读取、默认值与会话选择 | preset registry Remote／原生 UI | 可复用；会话选择和后续任务默认值不是同一件事 |
| 任意 Agent preset 创建／全文编辑／删除 | bundle／Profile patch 作者流程；原生 UI 指引 Creator | 不存在由此推导出的任意 YAML CRUD Remote；不能把 read/select 包装成完整编辑器 |
| Desktop plugin 命令 | Desktop 安装的原版 dsh，应用关闭时管理 desktop Profile | npm dsh 不等价；Desktop 启动／dump 的限制与 plugin 命令特许也不等价 |

`volatile` 在这里意味着可由运行中插件观察的配置引用，不等于仅内存临时设置。Settings 当前会写 active Profile patch，继承恢复也由上游处理；HOME／argv 高层遮蔽或不可安全寻址时会拒绝。其 schema、revision、secret redaction 合同应直接复用，而不是由 Skills Space 猜测普通字段是否可热更新。[Settings 合同](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/README.md#L10-L49)；[descriptor 过滤](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/src/index.ts#L302-L330)；[字段及 revision 检查](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/src/index.ts#L378-L423)。分端命令、插件流程及 preset 证据详见专项记录。

## 已核验的管理配置代表项

这里列已找到原生界面和所有者的代表项，不宣称完整字段目录，也不把它们当成本轮 Skills Space 实施授权。生成的 [配置目录](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/docs/config-catalog.md) 与实际运行实例的 descriptors 共同决定字段合同。

| 配置类别 | 已有原生能力 | 保存与限制 |
| --- | --- | --- |
| Models／providers | 模型适配器配置、认证引用、可用模型目录 | active Profile；密钥 write-only；并非每个 adapter 都用 API key，不能制造统一明文认证表单 |
| Agent loop | 单步 `Parallel tool calls` 并发工具调用数 | `agent-loop` namespace，原生有效值／覆盖／恢复默认，Save 后写；不等于 Agent 总数 |
| Subagent limits | `maxDepth`、`maxActiveSubagents` | `subagent` namespace；深度仍受各 delegation tool 自身上限约束，容量统计同一主 Agent 下各层存活子代理 |
| Subagent model selection | 允许子代理选模型的开关、精确 adapter routes | `subagent-model-selection` namespace；与 limits 独立 revision 写入，一部分保存失败不代表另一部分被回滚 |
| Preset default／session choice | 新任务默认值、指定空白 Session 的模式 | 默认值保存到 settings；会话选择另走 Agent preset API，首轮开始后不可直接变更 |
| Skills filesystem | 目录根、是否发现默认目录、watcher 参数 | 普通 Config；本轮未找到可直接写这些字段的原生 Settings 表单，preset 内根的写入继续受结构限制 |
| Desktop shell | 壳层设置、快捷键、语言启动缓存 | Electron userData；与 Host Profile 保存及热更新不是同一机制 |

证据：[模型设置](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/docs/user/guide/providers.md#L9-L25)、[Agent loop 原生页](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-settings-agent-loop/README.md#L26-L38)、[子代理原生页](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-settings-subagent/README.md#L26-L40)。

## Skills Space 当前实现差异

本节是当前工作区审计，不把 2026-10-20 测试结果当成今天的全绿证据。

| 当前实现证据 | 差异／影响 | 建议 |
| --- | --- | --- |
| `scripts/dsh-configuration.mjs` 的 installedRuntime／readConfiguration | PATH npm 优先，或使用 Desktop Electron ASAR；然后以一个安装锚点解释 HOME 下所有 Profile，没有把每个 Profile 的所属 runtime 单独建模 | 先确定运行来源、HOME、Profile 和安装锚点，再组合声明；npm 与 Desktop 并存时不得混用依赖图 |
| 同文件 writableVersion 只列 0.2.0-rc.2／0.2.1-rc.2 | 新源码／已支持读取的 rc.3 会保守只读；这是应用适配限制，不是上游禁止管理 | 不直接放开版本号；用实际可调用原版接口／schema 及具体条目合同决定能力，明确未知状态 |
| entries 能遍历 preset，但 lowerRow/baseRow 按裸 id 查找 | 当前默认 Profile 中相同 child id 跨 preset 是正常情况，可能错误标注继承／HOME 遮蔽来源 | 按拥有者与完整条目地址定位；先修读取，不为可编辑而伪造全局唯一 ID |
| 仅读取 filesystem provider 白名单字段并离线扫描 | 不包括运行时注册、插件 provider、Agent scope 的完整 winner 或运行会话 | 保留“磁盘资源”视图，按已知上下文展示；原生会话目录接入需单列，只读 RPC 的用户子集不可冒充全量 |
| 当前两类资源及调用／废纸篓所有权约束 | 托管 CLI、共享文件、包资源不应被普通原生操作改写 | 保留；批量资格仍按动作和实际归属判断 |
| 当前 dsh-management 只有技能设置，未有 DSH plugin/preset 管理 | 上游已有的包管理与 preset 选择功能未接入 | 作为下一批可选实施项，不在此次研究中自行新增页面 |
| 读取环境共享根用 `resolve(env ?? default)` | 空白环境值与当前上游 home-paths 语义可能不同 | 按通用路径语义校正；不针对某台机器补固定路径 |

对应代码：[配置读取](../../scripts/dsh-configuration.mjs)、[目录扫描](../../scripts/inspect-dsh-skills.mjs)、[原生权限与生命周期](../../src-tauri/src/upstream/dsh/native.rs)、[前端 DSH 状态](../../src/lib/dsh.ts)、[设置页](../../src/components/dsh-management.tsx)。

## 建议下一批方案（待确认）

### A 先补正确读取与分端上下文

- 分开识别 npm CLI、Desktop 安装与实际 Web Host；配置选择应保留所属 HOME／Profile／安装锚点。相同 HOME 不代表相同 Profile，相同 Profile 名也不证明相同版本依赖图。
- 修正 preset 内重复子条目 id 的读地址与来源追溯；保持 bundle/Profile/HOME/argv 层次，动态配置不离线求值。
- 清单按资源归属、provider 来源与 Agent scope 分清；没有运行实例时继续提供已知磁盘资源，不以缺少会话或辅助记录永久阻止通用核心安装。

### B 技能管理保持原所有权，再补上游真实能力

- 托管安装／更新／共享卸载继续由原版 skills CLI 负责；原生独立文件沿用已批准调用策略与废纸篓。
- 对当前 Agent 的配置动作单独判断；不把 DSH 控件放到 Pi/Hermes 或对所有托管技能禁用全部配置功能。
- 能连接原生实例时再接 `skills.list(sessionId)`，明确其用户可调用子集；provider／bundle 资源不被独立删除。目录失效、同名覆盖和无法读取只在需要操作时说明，不新增卡片正常状态噪声。

### C 插件管理复用原版 DSH，不建第二个 npm 后端

- 第一批可先提供读取包／条目／版本／状态，之后再按原生 inspect→确认→install/update/remove→重读接入，包含进度、取消及 uncertain/restart/override 结果。
- npm CLI 与 Desktop 的原版执行入口分别识别；Desktop 离线命令遵守其进程锁，运行中的 Host 不另用外部 pnpm 修改依赖图。
- 任何包操作都显示整包包含的技能、工具、服务影响；不能仅以技能数确认包卸载。认证仍由原生凭据接口／操作系统保护，不复制明文。

### D Agent preset 与普通配置分层开放

- 先做 list/read、默认 preset 和会话选择；每个结果绑定实际 Host/Profile。会话选择仅在第一轮开始前可用，不给已开始会话提供无条件切换。
- 只对上游真实提供的 volatile descriptors 开放设置保存／继承恢复，按 revision 与具体字段判断，不因一个条目复杂就封整个 Profile，也不把 schema 缺失当作已确认冲突。
- 任意 preset 作者流程与父 preset 完整覆盖继续独立评审，未批准前不实施。Desktop shell 快捷键／缓存／测试开关不混入技能配置页。

### 接受标准

使用两个模拟安装锚点、共享与分离 HOME、web/desktop/custom Profiles、相同 child id 的多个 presets、缺失 provider、共享技能、打包 provider、上下层覆盖及动态字段验证；不用个人 Profile 名称、安装路径或插件清单制作特例。

配置保存需要验证目标文件、继承恢复、上层遮蔽、版本／schema 差异、重启回读与对其他 Profile 的隔离；技能验证实际目录与原版 CLI 内容一致；插件验证整包影响、进程锁、取消／结果丢失和重启；Agent 选择要区分当前会话与新任务默认值。测试覆盖与 UI 验收按当前项目规则在实施后委派，本轮文档调研不运行应用构建，也不宣称这些未来场景已验收。文档-only 跳过 test_coverage；本轮未修改任何 UI，跳过 ui_reviewer。
