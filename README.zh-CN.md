<p align="center">
  <img src="./src/assets/icon.png" width="64" height="64" alt="Skills Space 标识">
</p>

<h1 align="center">Skills Space</h1>

<p align="center"><strong>集中发现、安装和管理不同 AI Agent 的技能。</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <a href="#主要功能">主要功能</a> ·
  <a href="#agent-适配">Agent 适配</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#开发">开发</a>
</p>

<p align="center">
  <img src="./assets/readme/screenshot-zh-CN.jpg" width="100%" alt="Skills Space 中文界面：托管技能卡片与跨 Agent 安装管理。">
</p>

Skills Space 是一款跨 Agent 的桌面技能管理工具，面向 Codex、Claude Code、Pi、Hermes、DeepSeek Harness 等 AI Agent，集中提供技能发现、安装及全局／项目范围的维护能力。

## 主要功能

| 功能 | 说明 |
| --- | --- |
| **统一管理** | 集中管理多个 Agent 的托管与原生技能，区分全局和项目范围，查看来源与安装状态。 |
| **技能商店** | 浏览榜单、搜索技能，查看完整正文、安装说明及仓库信息；浏览无需克隆。 |
| **安装与共享** | 支持 Git 仓库、本地目录和下载链接，将技能安装或共享到指定 Agent 与项目。 |
| **原生技能控制** | 保留已有技能目录，按 Agent 能力控制启用／停用、自动选择、手动调用与预加载。 |
| **更新与维护** | 检查更新和本地差异，核对共享卸载影响，支持批量处理、项目依赖安装与锁文件恢复。 |
| **配置与扩展** | 管理技能目录、Agent 设置与 DSH 预设，以及 Codex 插件和 Pi 扩展包。 |

安装、更新和卸载复用原版 [Vercel skills CLI](https://github.com/vercel-labs/skills)，保持与上游安装流程一致。

## Agent 适配

### 增强适配

在通用安装与维护能力之外，提供以下 Agent 的专属管理功能：

| Agent | 增强能力 |
| --- | --- |
| Codex | 原生技能启停、本地插件与市场、技能目录预算、插件默认状态及账号工具设置。 |
| Pi | 技能目录、启用／停用与调用控制、代码模式设置、扩展包管理。 |
| Hermes | 技能目录、项目发现与信任、启用／停用、预加载设置。 |
| DeepSeek Harness（DSH） | 配置文件与预设发现、技能目录、独立启停与调用策略。 |

DSH 的启停与调用控制通过 Skills Space 安装配套插件实现，无需修改技能文件。使用方式见 [DSH 说明](./docs/specs/0012-dsh-settings-native-skills-rebuild.md)。

### 通用支持

按照固定版本 **skills CLI 1.7.4** 的 Agent 定义提供技能安装与维护，包括 Claude Code、Cursor、Gemini CLI、GitHub Copilot、OpenCode、Windsurf、Cline、Roo Code 等。

<details>
<summary>查看全部 75 个通用支持 Agent</summary>

| Agent | Agent | Agent | Agent |
| --- | --- | --- | --- |
| AdaL | AiderDesk | Amp | Antigravity |
| Antigravity CLI | AstrBot | Augment | Autohand Code CLI |
| Claude Code | Cline | Code Studio | CodeArts Agent |
| CodeBuddy | Codemaker | Command Code | Continue |
| Cortex Code | Crush | Cursor | Deep Agents |
| Devin for Terminal | Dexto | Droid | Eve |
| Firebender | ForgeCode | fx | Gemini CLI |
| GitHub Copilot | Goose | Grok Build | IBM Bob |
| iFlow CLI | inference.sh | Jazz | Junie |
| Kilo Code | Kimchi | Kimi Code CLI | Kiro CLI |
| Kode | Lingma | Loaf | MCPJam |
| MiniMax Code | Mistral Vibe | Moxby | Mux |
| Neovate | Ona | OpenClaw | OpenCode |
| OpenHands | Pochi | Posit Assistant | PromptScript |
| Qoder | Qoder CN | Qwen Code | Reasonix |
| Replit | Roo Code | Rovo Dev | Sarvam Code |
| Tabnine CLI | Terramind | Tinycloud | Trae |
| Trae CN | Warp | Windsurf | ZCode |
| Zed | Zencoder | Zenflow |  |

</details>

## 快速开始

### 源码运行

准备 **Node.js 22.20.0 或更新版本**、仓库固定的 **pnpm 11.5.0**、Rust，以及对应平台的 [Tauri 2 开发依赖](https://v2.tauri.app/start/prerequisites/)。克隆项目和使用 Git 来源还需要安装 Git。

```bash
git clone https://github.com/arch3rPro/Skills-Space.git
cd Skills-Space
pnpm install --frozen-lockfile
CI=false pnpm tauri dev
```

上述命令使用 POSIX shell。`tauri dev` 会准备随包 CLI，并启动前端和桌面应用。

### 使用流程

1. 选择「全局」，或添加并选择一个项目。
2. 打开「技能商店」浏览或搜索，也可点击「安装技能」输入来源。
3. 检查来源，选择技能与目标 Agent，核对安装设置。
4. 确认安装，在技能空间或对应 Agent 页面查看结果。

应用会自动检测 Node，缺少兼容版本时自动准备，也可在「设置 → 全局」手动选择。

## 开发

项目使用 **React 19、TypeScript、Vite、Tauri 2 和 Rust**。界面位于 `src/`，文件系统、进程及原生能力位于 `src-tauri/`。

<details>
<summary>检查与构建命令</summary>

先运行前端检查并准备 CLI 资源，再执行原生测试：

```bash
pnpm stage:upstream
pnpm test:frontend-contracts
pnpm build
pnpm test:native
```

构建 macOS 调试应用包：

```bash
CI=false pnpm tauri build --debug --bundles app
```

资源准备与原生测试应顺序执行。平台依赖、隔离测试数据、验证范围和打包说明见[开发指南](./docs/agents/development.md)。

</details>

## 项目文档

- [能力与接入状态](./docs/research/upstream-command-map.md) — 支持的命令、来源与适配范围。
- [后续计划](./docs/specs/0004-upstream-capability-completion-plan.md) — 已完成、待开发及待验证事项。
- [架构决策](./docs/adr/0005-use-unmodified-upstream-cli.md) — 技能生命周期复用原版 CLI 的原因。
- [文档索引](./docs/README.md) — 规范、Agent 说明、设计、调研和历史记录。
