# Pi 插件管理调研

日期：2026-10-25。范围：Pi 原版能力及 Skills Space 现有接入；本轮不修改功能。

## Pi 1.4.0 复核

用户指出版本已升级后，重新执行 `pi --version`，本机返回 **1.4.0**。下文原始调查的 1.3.0 是首次核对版本，不是当前本机版本。

对比本机保留的 1.3.0 和 1.4.0 官方发行物，`docs/packages.md`、`dist/core/package-manager.js`、`dist/modes/interactive/components/config-selector.js` 内容完全相同；`docs/settings.md` 只有上下文压缩阈值解释变化。因此本文关于包安装、卸载、更新、资源启停、项目覆盖的核心结论仍适用于 1.4.0。这是文档和源码对比结论，尚未进行 1.4.0 生命周期实测。

**项目适配有实际版本限制：** `scripts/pi-package-driver.mjs:44` 明确只接受 `1.3.0`，本机升到 1.4.0 后，现有扩展包检查与更新驱动会拒绝执行。不能据此说 Pi 1.4.0 不支持这些操作，也不能把核心文件相同当成整个应用已经适配。此处仅记录发现，本轮未改代码或放宽版本限制。

复核来源：[1.4.0 包文档](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/docs/packages.md)、[包管理实现](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/src/core/package-manager.ts)、[配置选择器](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/src/modes/interactive/components/config-selector.ts)、[版本记录](https://github.com/earendil-works/pi/blob/v1.4.0/packages/coding-agent/CHANGELOG.md)。

## 结论

Pi 有完整的扩展包管理能力，但不能直接套用 Codex 的插件市场和账号插件模型。Pi 把可分发的安装单位叫 **Package（扩展包）**，一个包可以包含扩展代码、技能、提示词模板和主题，也可以只提供其中一种。**不含技能的包完全正常，技能数量不能代表包是否有效。** [P1]

安装、卸载、更新针对包；启停实际针对包内资源。全局与项目均有配置，项目可以覆盖全局资源的加载状态。官方还提供社区包目录，但不是 Codex 那种可添加、移除市场仓库的同一模型。[P1][P2][P5]

## 原版实际支持什么

| 用户操作 | Pi 1.3.0 原版方式 | 影响和边界 |
|---|---|---|
| 查看已有包 | `pi list` | 列出配置中声明的包和范围；不是运行时成功加载清单。 |
| 安装包 | `pi install <source>` | 默认写全局配置；`--local` / `-l` 写当前项目配置。 |
| 卸载包 | `pi remove <source>`，或 `pi uninstall <source>` | npm 删除对应安装；Git 删除 Pi 管理的克隆；本地路径只移除配置，不删除原目录。默认全局，`-l` 作用于项目。 |
| 更新一个包 | `pi update <source>` | 按包身份查找全局和当前受信任项目中的配置，同源的两份安装可能一并更新。原版不是单纯“当前界面范围更新”。 |
| 更新所有包 | `pi update --extensions` | 更新包安装；不要误用无参数 `pi update`，1.3.0 中后者更新 Pi 本身。 |
| 选择加载哪些内容 | `pi config` | 按扩展、技能、提示词模板、主题控制；默认个人配置，Tab 切换范围，`pi config -l` 从项目覆盖开始。 |
| 只在当前项目停用全局资源 | 项目资源覆盖 | 原版提供跟随、加载、不加载三态；不会卸载全局包。 |
| 临时试用 | `pi -e <source>` | 本次调用加载，不加入持久包配置；npm/Git 可能下载到临时存储。 |
| 在现有会话应用资源变化 | `/reload` | 重新加载扩展、技能、模板、主题等。外部修改文件不能据此宣称已运行的会话立即生效。 |

依据：命令和参数来自版本内 CLI 文档；卸载、按身份跨范围更新来自原版包管理源码；三态来自原版配置选择器。[P1][P2][P3][P4][P6]

### 来源与版本

- **npm 包**：如 `npm:@example/pi-tools`。Pi 1.3.0 使用其管理的 npm 目录；全局为 `~/.pi/agent/npm/`，项目为 `.pi/npm/`。仍可读取旧的全局 npm 安装位置，不能沿用旧资料把当前所有安装都说成 `npm install -g`。[P3]
- **Git 仓库**：如 `git:github.com/example/pi-tools`，以及 HTTPS、SSH Git URL。安装到 Pi 管理的 Git 目录。[P1][P3]
- **本地文件或目录**：直接引用，不复制；目录作为包解析，单个文件作为扩展。卸载不应删除用户源文件。相对路径以包含声明的配置文件为基准解析。[P1][P3]
- **固定版本**：精确 npm 版本不会被普通包更新推进；Git 指定 ref 时按配置目标校准，不应擅自改成最新分支。原版更新也会修复 Git 安装与指定 ref 不一致的情况，不能把“固定版本”一律等同“所有更新操作都不可用”。[P1][P3]
- **目录发现**：官方 `pi.dev/packages` 汇集发布到 npm 的扩展包，支持搜索和资源类型筛选；`pi-package` 是包被目录发现的关键词。不应虚构为 Pi 已有可增删的“插件市场仓库”。[P1][P5]

### 启停的真实含义

Pi 没有统一的包级 `enabled: true/false` 开关。配置可分别限制一个包中的 `extensions`、`skills`、`prompts`、`themes`：省略某类时按包声明加载；空数组不加载该类；也支持模式排除和精确路径覆盖。过滤只能缩小包声明的范围，不能加载包未声明的资源。[P1]

因此产品若提供“停用整个包”，可以聚合这四类加载配置，但必须保留并恢复原有选择，不能启用时粗暴清空已有过滤；这是产品实现选择，不能表述为 Pi 原生已有一个包总开关。[P1][P4]

相同包同时存在于全局与项目时，通常项目声明优先；项目使用 `autoload: false` 的条目则表示基于全局包追加加载过滤，不应误报为又装了一份。包身份按 npm 名称、Git 仓库 URL（去掉 ref）、本地绝对路径识别。[P1][P3][P4]

### 内置扩展

1.3.0 内置扩展名称是 `builtin:mcp`、`builtin:llama.cpp`、`builtin:codemode`、`builtin:tool-search`。它们默认加载，可用 `extensions` 中的 `-builtin:<name>` 停用，项目的 `+/-` 可覆盖全局。`pi config` 放在 Built-in 分组。[P7]

这些是随 Pi 运行版本提供的资源，不是独立 npm/Git 安装包。适合提供加载控制，不应混入普通可卸载包，也不应为其伪造单独升级、卸载操作；其代码随 Pi 自身版本维护。[P3][P7]

### 权限和生效边界

扩展是运行在 Pi 进程内的代码，具有相同的操作系统权限，并不是安装后再逐项申请权限的账号工具。扩展可以注册工具、命令、事件处理、界面和模型提供方；技能则是给模型的操作说明。不能用“只含技能”推导整个包没有执行风险。[P1][P8]

项目包只在项目信任后读取和安装。`-a` 是一次命令的项目信任授权，`-na` 忽略需要信任的项目内容。包可携带并安装运行依赖；本地包的依赖由包作者管理。管理页面读取清单不应执行扩展入口。[P1][P2][P3]

## Skills Space 当前接入

以下为本轮代码静态核对，不是本轮安装、卸载或真实会话加载实测：

| 现有位置 | 已有能力 | 当前缺口 |
|---|---|---|
| `src/components/pi-management.tsx` | 技能命令补全、附加技能目录、技能规则、项目信任 | 不是完整扩展包管理页。 |
| `src/App.tsx`、技能详情的扩展更新入口 | 可由包内技能定位所属包并检查、更新 | 不含技能的包没有这个详情入口。 |
| `src-tauri/src/upstream/pi/packages.rs`、`scripts/pi-package-driver.mjs` | 调用合格原版 Pi 1.3.0 的 `DefaultPackageManager.update(source)`，核对版本与受影响范围 | 不是完整安装、卸载和资源管理服务；当前驱动要求 Pi 官方管理安装结构，不能代表所有 npm/Nix 安装形式均已适配。 |
| `src-tauri/src/upstream/pi_removal.rs` | 本地独占技能移除 | 明确排除扩展包；不能当成包卸载功能。 |

当前尚无独立 Pi 包库存、包安装/卸载界面，也没有 extensions、prompts、themes 的完整库存界面。原版支持这些能力，与本项目已经实现这些能力是两件事。

## 对本项目的建议（尚未实施）

1. 用“扩展包”作为 Pi 的安装管理单位：列表读所有包，详情展示包内四类内容，不依赖技能列表反推包库存。
2. 安装、卸载、更新继续交给原版 Pi；全局和项目安装分别操作。更新沿用原版可能同时影响两处安装的语义，在确认时列出实际范围。
3. 资源启停保持 Pi 的项目覆盖语义，现有技能启停继续留在技能空间；包详情复用它，不重复建设另一个技能管理入口。
4. 内置扩展单独呈现加载控制，不与可卸载包混淆；添加包可引用 npm/Git/本地路径，发现目录接官方包目录，不照搬 Codex 市场管理。

这是基于真实能力的接入方向，不是本轮新增需求或实施承诺。界面布局、整包启停的交互和发现目录接入范围仍应另行确认。

## 证据与验证记录

版本依据：本机 `~/.pi/agent/install/releases/1.3.0/node_modules/@earendil-works/pi-coding-agent/package.json` 明确为 `@earendil-works/pi-coding-agent` 1.3.0；读取的是安装发行物的文档与 `dist` 源码，没有读取用户账号、授权或技能配置。

- [P1：Pi 1.3.0 packages.md](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/packages.md)，并交叉核对[当前官方文档](https://pi.dev/docs/latest/packages)。
- [P2：Pi 1.3.0 cli.md](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/cli.md)，并交叉核对[当前 CLI 文档](https://pi.dev/docs/latest/cli)。
- [P3：Pi 1.3.0 package-manager.ts](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/src/core/package-manager.ts)：`listConfiguredPackages`、`removeAndPersist`、`update`、`dedupePackages`、`getManagedNpmInstallPath`、`getNpmInstallPath`，与本机发行物对应函数交叉核对。
- [P4：Pi 1.3.0 config-selector.ts](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/src/modes/interactive/components/config-selector.ts)：资源类型、项目三态覆盖和 `autoload: false` 的写入。
- [P5：官方包目录](https://pi.dev/packages)，本轮已读取，不将社区目录中的包认定为官方维护包。
- [P6：Pi 1.3.0 slash-commands.md](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/slash-commands.md)：`/reload`。
- [P7：Pi 1.3.0 settings.md](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/settings.md)：Resources 与 Built-in extensions。
- [P8：Pi 1.3.0 extensions.md](https://github.com/earendil-works/pi/blob/v1.3.0/packages/coding-agent/docs/extensions.md)，并交叉核对[当前扩展文档](https://pi.dev/docs/latest/extensions)。

本轮没有执行安装、更新、卸载或启停。一次直接执行 `pi --help` 时，CLI 试图创建真实 `trust.json.lock`，被文件沙箱拒绝；没有为此放宽权限或继续访问真实状态。命令行为结论来自版本内文档和源码，不伪称为生命周期实测。文档变更不运行前端或原生构建。

## 后续实施状态

用户随后批准实现扩展包管理。本报告“当前接入／缺口”保留的是调研当时的状态；后续实现、1.4.0 适配、验证和仍未覆盖的安装形式，以 [spec 0006 最新增量](../specs/0006-pi-skill-management.md#2026-10-25-pi-extension-package-management-authorized) 为准。Pi Agent 设置已核对技能命令、附加目录、规则及信任范围；本轮没有扩展模型、账号或会话管理。
