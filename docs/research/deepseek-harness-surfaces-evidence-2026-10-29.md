# DeepSeek Harness — CLI、Desktop、Web 与插件 / Agent 配置证据复核

日期：2026-10-29。状态：只读源码调研，未实施应用功能，未修改用户 DSH 配置，未运行上游脚本或启动 DSH。供本轮 Skills Space 技能管理重新调研引用。

固定官方源码：`deepseek-ai/deepseek-harness`，默认分支 `master`，提交 `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`。该提交 root、CLI、Desktop 与 Desktop Host 的包元数据均为 `0.2.2-alpha.2`。这不是对 npm 最新发行、个人安装版本或实际运行能力的断言。

## 一、首先区分配置所有者

Desktop 是 Electron 包裹完整 Web 应用，而不是另一套技能/插件后端；但它拥有独立 Profile 和安装运行时。共同 UI 不意味着共同配置文件，也不能用 Web 的安装锚点解释 Desktop bundle。依据：[Desktop 架构](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/README.md#L38-L46)、[Desktop 安装所有权](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/README.md#L140-L154)。

| 层 / 入口 | 配置或资源位置 | 读写、生效与管理边界 |
| --- | --- | --- |
| 共同 Harness 用户数据根 | 显式根覆盖 → `$DSH_HOME` → `~/.dsh` | Desktop 与 npm CLI 默认共享这个数据根；“Desktop 使用完全不同 HOME”不是上游默认协议。依据：[HOME resolver](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/util/home-paths/src/index.ts#L124-L136) |
| Web 默认业务 Profile | `$DSH_HOME/profiles/web/package.json`、`cordis.patch.yml` | `dsh web` 默认用 base + web-app；自定义启动使用实际指定 Profile，不能把每个 Web Host 都视为 web。依据：[模板](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/util/official-bundles/src/bundles.ts#L9-L25)、[Web 活动配置路径](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/docs/user/guide/providers.md#L53-L65) |
| Desktop 业务 Profile | `$DSH_HOME/profiles/desktop/package.json`、`cordis.patch.yml` | Electron 独占并初始化，使用 Web 模板的 bundles，但名称、依赖图与生命周期独立。依据：[Desktop 路径](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/src/paths.ts#L17-L21)、[初始化模板](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/src/project-manager.ts#L172-L175) |
| 跨 Profile HOME 覆盖 | `$DSH_HOME/cordis.patch.yml` | 在每个 Profile 用户层之后组合，可能遮蔽具体 Profile 的修改；不能把它当 Desktop 或 Web 的专用文件。依据：[HOME patch](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/profile-boot.ts#L67-L75) |
| Desktop 壳层设置 | `Electron userData/desktop/settings.json` | 独立于 DSH_HOME；当前源码读取 `updates.allowTestAuthPopupWindow`，每进程读取，改动需重启。不是技能目录或模型配置文件。依据：[壳层设置](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/src/settings.ts#L19-L47) |
| Desktop 快捷键 | `Electron userData/keybindings.json` | 不在 DSH_HOME；不应与 Cordis 插件设置混写。依据：[快捷键路径](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/src/keybindings.ts#L10-L17) |
| 凭据 | `$DSH_HOME/.credentials.yaml`，业务配置保存引用 | 设置页只写入密钥，读回脱敏的描述，不应直接把凭据混入配置表单或日志。依据：[凭据说明](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/docs/user/guide/providers.md#L9-L20)、[凭据 RPC 边界](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/api/settings-controller/README.md#L26-L32) |
| 旧 `settings.yaml` | Harness HOME 内的历史设置文件 | 当前不是常规写目标。Settings 在 Loader 稳定后做一次迁移并重命名 `.imported`，拒绝部分仅留在迁移备份。依据：[旧配置迁移](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/README.md#L33-L37) |
| `cordis.yml` | Profile 内生成的空根文件 | 是组合入口产物，不是替代 `cordis.patch.yml` 的编辑目标。依据：[生成根声明](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/profile-boot.ts#L80-L88) |

Desktop 在解析路径之后读取登录 shell 环境，并保留启动器拥有的 `DSH_` / `ELECTRON_` 变量，不让登录 shell 重新决定这些启动根。不能仅检查终端里 `dsh` 的环境便断言已运行 Desktop 的配置归属。依据：[Desktop 启动顺序](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/src/main.ts#L367-L391)、[启动器变量所有权](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/src/login-shell-environment.ts#L14-L17)。

## 二、配置组合和“有效配置”

组合顺序仍是：manifest 中有序 bundle 补丁 → Profile 用户补丁 → HOME 补丁 → 已知启动 `--patch` → telemetry 开关。条目的 `config` 是整体替换，不是随意的深度合并。Profile 身份和启动 cwd 也不是工作区身份。依据：[组合入口](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/profile-boot.ts#L211-L235)、[CLI 配置合同](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/reference/README.md#L9-L17)。

Bundle 使用 **所属 DSH 安装锚点优先，再查 Profile 依赖**。因此 npm CLI 与 Desktop 并存时，不能“找到一个 dsh-app-boot 就读取所有 Profiles”：这可能用 npm 的内置 bundle 解释 Desktop 配置，或反向解释。Desktop 的 `loadProfileDirectory` 使用 Desktop 随包 CLI `package.json` 为锚点，并将已解析 Profile 传给共享 runner。依据：[bundle resolver](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/app-boot/src/profile.ts#L643-L658)、[Desktop Host 锚点](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop-host/src/index.ts#L25-L36)。

离线组合声明、活动 Loader 的有效值、运行中 Session 保留的 preset revision 是不同信息。读取配置不能以启动 Profile 的方式补齐：`loadProfileDirectory` 本身含迁移、旧投影清理等生命周期行为，源码文档也明确 Profile 加载不只是静态 parse。依据：[Profile 生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/app-boot/README.md#L50-L50)、[旧投影清理](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/app-boot/README.md#L138-L140)。

## 三、Settings 已可持久化，但仍仅开放合格 live 字段

不能继续引用“volatile 设置只存在运行时、不能保存”的旧结论：当前 `SettingsForms` 的写入通过 ConfigEditor 落到活动 Profile 的 Cordis patch。然而也不能反向宣称所有配置字段都已开放 RPC。

- `describe` 仅返回 active fiber、存在 Config schema 且包含 volatile form 的命名空间；返回当前值、继承基值、用户覆盖、revision 与 live 生效标记。依据：[活动字段投影](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/src/index.ts#L298-L330)。
- `update` 合并字段，`replace` 重置 live 字段后应用输入，`mutate` 支持路径 set/unset；普通字段保留，继承恢复遵循底层值，并校验 revision。依据：[Settings 写入](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/src/index.ts#L343-L423)。
- Remote `settings.describe/update/replace/mutate` 读回均脱敏；该 API 提供 active Profile 的原生文档打开，不接受浏览器指定任意路径。依据：[Remote 合同](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/api/settings-controller/README.md#L28-L32)、[实现](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/api/settings-controller/src/index.ts#L69-L121)。
- ConfigEditor 可供 Host 内部调用完整配置编辑，但它仍只寻址活动 Profile 根 Include 的唯一条目。HOME / argv overlay 只参与优先级校验、不是写目标；nested Include 不可通过该表单修改。依据：[完整编辑与事务](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/config-editor/README.md#L33-L43)、[编辑资格](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/config-editor/README.md#L65-L69)、[表单限制](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/README.md#L69-L74)。
- Web 模板有 HMR，保存与 reload 可即时生效；没有 HMR 的 Profile 在重启应用后生效。不能对所有 Profile 统一写“保存后必须重启”，也不能宣称所有插件更换可热更新。依据：[HMR 按组合决定](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/app-boot/README.md#L50-L50)、[必须重启的原因](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/src/types.ts#L45-L52)。

### 对技能根目录的直接限制

`dsh-skill-filesystem` 的 `customSkillDirs`、`includeDefaultRoots`、`dshHome`、`agentsHome` 和 watcher 参数在当前 Config 中均没有 `.volatile()`；它们不能因为 Settings 已支持持久化就直接映射为 Settings RPC 表单。默认 Web 组合中技能提供器进入 preset，preset 内条目又不属于 ConfigEditor 根 Include 的可寻址条目。核查 `packages/client` 与 `packages/api` 中的 `customSkillDirs` / `includeDefaultRoots` / `skill-filesystem`，未发现绕过上述资格的专用技能根写入页或写 RPC。依据：[filesystem schema](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill-filesystem/src/index.ts#L75-L88)、[ConfigEditor entry 资格](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/config-editor/src/index.ts#L33-L43)、[Settings 写资格](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/src/index.ts#L383-L389)。

因此，本批不能承诺“连接原生 Settings 后所有技能目录都可写”。普通根条目可由已证明的原生 Profile patch 合同编辑；preset 内目录通常涉及父 preset 的完整配置 / plugins 列表覆盖，或由原生插件 bundle 交付其声明。用户此前暂缓父 preset 完整覆盖时，应保留这类目标只读。把 provider 移到根层以绕过资格会改变作用域和覆盖语义，不是无损兼容修复，不能自动实施。

## 四、插件是 package / bundle / entry 三层管理

上游已经提供原生插件管理，不能只理解为 npm 依赖列表或把插件和技能当成相同对象。

| 操作 | 原生能力 / 持久化 | 明确限制 |
| --- | --- | --- |
| 包 / bundle 清单 | `pluginManager.listBundles`；含安装来源、版本、是否选择、optional/official/removable、加载错误 | `enabled` 是保存的 bundle 选择，不保证加载成功；无法读取的 bundle 也保留诊断 |
| 安装 / 卸载 | `inspect`、`installBundle`、`removeBundle`，原版 pnpm 实现 | 兼容/平台/脚本批准规则；失败会恢复 manifest/lock 等受控文件，不能当作下载或激活成功 |
| bundle 启停 | `setBundleEnabled` 写 `package.json:dsh.profile.bundles` | 关闭保留依赖；重新启用追加到有序列表末尾，可能改变配置优先级 |
| 单 entry 启停 | `listPlugins` → `setPluginEnabled`，只改用户 patch 的 `disabled` | 必须唯一可寻址；管理组件和 preset 内条目等不可寻址项目不开放 |
| registry 包升级 | `listVersions`、`updateBundle` | 第三方 registry 包才有对应版本更新语义；Official、link/path/git/tarball 不等同 registry 升级 |
| 设置插件参数 | 合格的 Settings namespace，或插件自带配置页 | Settings 的内置插件清单是只读 inventory；侧栏 Plugins 才是包/启停/配置操作入口 |

以上操作由 [插件读取](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/src/index.ts#L405-L489)、[检查与版本操作](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/src/index.ts#L602-L713)、[启停与安装](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/src/index.ts#L826-L871)、[卸载](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/src/index.ts#L1029-L1066) 实现；层写入与优先级合同见 [插件管理合同](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/README.md#L31-L44)，升级可用性见 [原生 UI 语义](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-plugin-manager/README.md#L69-L83)。

持久化动作使用与 `dsh plugin` 一致的 `package.json` 写锁，不是自创应用锁。Web 原生管理走 authenticated Host API，Desktop 也使用同一个原生 Web 管理面，没有“Electron 独立插件 IPC”。依据：[共享包操作实现](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/plugin-manager/src/operations.ts#L557-L575)、[Desktop 管理入口](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/README.md#L144-L146)。

### Desktop 的命令能力必须辨明发行身份

- npm 安装的普通 CLI 不得启动 / dump `desktop`，也不得对其发出插件管理请求；`desktop` 是保留 Profile。依据：[保留名称](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/args.ts#L83-L85)、[boot 与 plugin 分支](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/args.ts#L181-L201)。
- Desktop 安装的原版 `dsh` 命令载体允许管理该保留 Profile 的插件，但仍不开放 CLI boot/dump Desktop。其载体显式传 `manageDesktopProfile: true`，只有 plugin 分支使用此授权。依据：[Desktop CLI 载体](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop-host/src/cli.ts#L13-L25)、[命令分支](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/args.ts#L183-L201)。
- 必须先打开 Desktop 初始化 Profile，完全退出应用后再用所属 Desktop 命令执行 `dsh plugin --profile desktop add/list/remove`，之后重开应用。不能让 npm CLI 创建一个同名普通 Profile 代替 Desktop。依据：[所属命令与退出要求](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/desktop/README.md#L132-L146)、[初始化限制](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/plugin.ts#L11-L14)、[Desktop 命令处理](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/apps/cli/src/plugin.ts#L71-L98)。

## 五、Agent 管理实际是 preset 声明与 Session 选择

Profile 不等于 Agent；preset 也不是独立的可执行 Agent 安装。preset 是普通 Cordis `@deepseek-ai/dsh-agent-preset` 条目，配置含 `id/name/description/order/plugins`，注册给 `agentPresets`。它不扫描 `.dsh/agents/`，也不接受任意角色文件路径。依据：[preset schema](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset/src/index.ts#L9-L28)、[注册方式](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/README.md#L28-L48)。

| 能力 | 当前原生支持 |
| --- | --- |
| 查看 roster / 默认 / 失败状态 | `agentPresets.list` |
| 查看 preset 组成 | `agentPresets.read` 返回只读 YAML，保留 `!!js` 声明；没有把 YAML 写回的对应 Remote |
| 改新会话默认 | Settings `agent-preset-registry` namespace 的 `selectedDefault`；fallback 为部署 `default` |
| 改指定会话 preset | `agentPresets.select`；仅第一轮开始前可选，已开始会话拒绝 |
| 新增或覆盖 preset | bundle 的 insert / 按 entry id patch，通过插件包或 Creator 创建；不是表单 CRUD |
| 调 Agent loop / 子代理策略 | 原生插件配置页分别提供并发工具调用、最大委派深度/子代理容量、允许模型路由等；是各自 namespace，不是任意 preset 定义编辑 |

证据：[list/read](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/src/index.ts#L207-L243)、[Session select](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/src/index.ts#L357-L376)、[默认配置](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/src/preset.ts#L12-L18)、[持久化默认选择](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-agent-preset/src/client/settings-store.ts#L20-L36)、[Agent UI 与 Creator](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-agent-preset/README.md#L28-L48)、[Agent loop 配置](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-settings-agent-loop/README.md#L26-L38)、[子代理设置](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-settings-subagent/README.md#L28-L42)。

已存在 Agent retain 已挂载 revision；声明变化不等于所有会话立即换 preset。进程重启后旧 revision 实现不保留，恢复会话按记录的 preset ID 寻找当前声明，缺失或失败会拒绝。preset 不是安全沙箱，整 child-list 覆盖也不会自动继承未来内置列表变化。依据：[revision 与恢复](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/README.md#L56-L62)、[限制](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/README.md#L95-L99)。

## 六、对 Skills Space 的通用适配含义（方案，不是实施授权）

1. 以 **安装身份 + DSH_HOME + Profile + 可选会话/preset 上下文** 标识读取对象；Desktop/Web 不通过配置内容或个人 Profile 名猜测。读取 bundle 时必须绑定实际安装 anchor。
2. 运行中配置优先读取对应 Host 原生 redacted descriptor / registry / plugin inventory；静态声明读取保留自身证据边界，不冒充活动 Session。
3. 按具体条目/字段/动作资格开放：可保存的 live 字段、可寻址 entry、可切换 bundle、可更新的 registry 包分别判定。不能再以“Desktop、bundle-backed、volatile、继承”四种词语一刀切设为只读。
4. 优先复用用户所属原版 CLI 或已运行 Host 的管理接口；Desktop 的 npm 包状态不能由另一份 npm CLI 改写。技能公共目录的管理仍是另一条生命周期，不得借插件动作删除共享技能。
5. 暂不将原生并不存在的功能画成可操作项：任意 preset YAML 的 Remote CRUD、已开始会话无条件换模式、独立于安装的通用 Desktop dump 命令都不能据此承诺。

## 验证边界

本报告是固定源码与第一方文档的交叉核查：没有安装依赖、运行 DSH、启动 Desktop/Web、调用其 RPC、写配置或实际安装/卸载插件。因此“接口存在 / 源码行为”与“Skills Space 已实现 / 已验证可用”严格分开。实际 API 接入、兼容发行包及重启/热更新等需要后续获批的隔离功能验收。本报告不将当前个人环境作为适配目标。
