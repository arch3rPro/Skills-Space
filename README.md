<h1 align="center">
  <img src="./src/assets/icon.png" width="42" height="42" align="middle" alt="Skills Space logo"> Skills Space
</h1>

<p align="center"><strong>Discover, install, and manage skills across your AI agents.</strong></p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#agent-integrations">Agent integrations</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <img src="./assets/readme/screenshot.png" width="100%" alt="Skills Space desktop application showing native skill cards, agent navigation, and skill filters.">
</p>

Skills Space is a desktop application for managing skills across Codex, Claude Code, Pi, Hermes, DeepSeek Harness, and other AI agents. It combines skill discovery, installation, and maintenance across global and project scopes.

Core skill installation, updates, and removal use the original [Vercel skills CLI](https://github.com/vercel-labs/skills), bundled at a pinned version. Agent integrations add native directory, configuration, and invocation controls where supported.

## Features

### Skill discovery

- Browse the [skills.sh](https://skills.sh) all-time, trending, and hot leaderboards, or search by keyword and source.
- Read introductions, installation instructions, overviews, and skill documents. View available repository, stars, topics, and installation metrics alongside them.
- Browse details without cloning a repository. Only installation enters the source inspection and confirmation flow.
- Choose 12, 24, or 48 skills per page and jump to a specific page. Clearing a search restores your leaderboard.

### Skill installation

Start from a store card, Git repository, local directory, or supported download URL. Preview the available skills, select the ones you want, then choose agents, global or project scope, and the available installation mode before confirming.

### Skill maintenance

| Task | What you can do |
| --- | --- |
| Inspect | Filter installed skills, read their documents and versions, and open their locations. |
| Update | Check for available updates, review local differences where supported, and inspect per-item results. |
| Remove | Uninstall individual skills or a selected source group, with shared installation impact checked before removal. |
| Share | Copy or link an existing skill to another supported agent or project through the existing review flow. |
| Restore | Install skills declared by project dependencies or restore supported entries from a project lockfile. |

### Native skills and packages

Skills Space also reads skills discovered by supported agents outside the CLI-managed collection. These native skills retain their original directories and source-specific operations.

Codex plugins and Pi extension packages have dedicated management flows. Skill controls follow the selected agent's capabilities; they are not applied as universal settings across every agent.

## Agent integrations

**General support** follows the agent definitions in the bundled skills CLI for installation and maintenance. **Enhanced integration** adds agent-specific management:

| Agent | Additional capabilities |
| --- | --- |
| Codex | Native skill controls, local plugins and marketplaces, and supported global/project settings. |
| Pi | Skill directories, enable/disable and invocation controls, code mode settings, and extension packages. |
| Hermes | Skill directories, project discovery and trust, enable/disable, and preload settings. |
| DeepSeek Harness (DSH) | Configuration-file and preset discovery, skill directories, and independent enable/disable and invocation policies. |

DSH's independent policies require the companion plugin installed through Skills Space. They preserve skill files; the policy is shared wherever the same physical skill file is used. See the [DSH guide](./docs/specs/0012-dsh-settings-native-skills-rebuild.md) for scope and activation details.

> [!NOTE]
> Available actions depend on the skill's source, ownership, agent, and scope. A skill found on disk is not proof that a running agent has loaded it. Current verification primarily covers macOS arm64; other platforms and remaining scenarios are tracked in the [roadmap](./docs/specs/0004-upstream-capability-completion-plan.md).

## Quick start

### Source setup

Install Node.js **22.20.0 or later**, **pnpm 11.5.0** (the repository-pinned version), Rust, and the [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform. Git is needed to clone the repository and work with Git sources.

```bash
git clone https://github.com/arch3rPro/Skills-Space.git
cd Skills-Space
pnpm install --frozen-lockfile
CI=false pnpm tauri dev
```

The commands above use a POSIX shell. `tauri dev` prepares the bundled CLI and starts both the frontend and desktop app.

### Usage

1. Choose **Global** or add and select a project.
2. Open **Skill store** to browse or search, or choose **Install skills** to enter a source.
3. Inspect the source, select skills and target agents, and review the installation settings.
4. Confirm, then inspect the results in your skill collection or the agent's page.

For a packaged app, Node is detected automatically. You can select an executable in **Settings → Global**. If no compatible runtime is available, the app downloads a pinned official Node into its application data directory; it does not replace your system Node or installed commands.

## Development

The app uses **React 19, TypeScript, Vite, Tauri 2, and Rust**. Presentation lives in `src/`; filesystem, process, and native capabilities live in `src-tauri/`.

Run frontend checks and prepare the CLI resources before native tests:

```bash
pnpm test:frontend-contracts
pnpm build
pnpm test:native
```

Build a debug macOS application bundle:

```bash
CI=false pnpm tauri build --debug --bundles app
```

Resource staging and native tests must run sequentially. See the [development guide](./docs/agents/development.md) for platform setup, isolated test fixtures, verification scope, and packaging details.

## Documentation

- [Capability map](./docs/research/upstream-command-map.md) — supported commands, sources, and integration boundaries.
- [Roadmap](./docs/specs/0004-upstream-capability-completion-plan.md) — completed work, remaining development, and verification gaps.
- [Architecture decision](./docs/adr/0005-use-unmodified-upstream-cli.md) — why lifecycle operations use the unmodified upstream CLI.
- [Documentation index](./docs/README.md) — specifications, agent guides, design, research, and historical records.
