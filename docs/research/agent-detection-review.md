# Agent 安装检测与技能归属

日期：2026-10-14。范围：只读检测及展示；保留原版 `skills@1.7.2` 的生命周期行为。

## 上游证据

本次核对本地锁定发行文件 `node_modules/skills/dist/cli.mjs`，不以最新版文档替代打包版本契约。

- `agents` / `detectInstalledAgents`：配置目录等存在即可命中；Claude Code 使用 `claudeHome`，Codex 使用 `codexHome` 或 `/etc/codex`。配置残留与仅 plugin 内容无法据此区分。
- `isUniversalAgent` / `getAgentBaseDir`：通用 Agent 的项目路径是 `.agents/skills`，全局安装目标统一为 `~/.agents/skills`。
- CLI 的 `--agent` 选择已定义的 Agent；没有任意自定义 Agent 注册或技能目标路径参数。部分根目录支持 `CODEX_HOME`、`CLAUDE_CONFIG_DIR`、`VIBE_HOME`、`HERMES_HOME`、`AUTOHAND_HOME`、`GROK_HOME`、`SARVAM_HOME`、`XDG_CONFIG_HOME` 等环境变量。`CODEX_HOME` 改变配置检测位置，不改变通用安装路径；具体技能目标仍服从各上游定义与通用路径规则。

## 当前实现

`detected` 继续保留上游配置检测语义，供操作影响及共享清理判断使用；不替换上游 CLI，不新增安装路径选项，不改变命令参数、锁文件或安装/更新/卸载执行逻辑。

新字段 `installationStatus`：

- `confirmed`：发现已知命令的可执行文件，或 macOS 已知应用包（通过 plutil 读取 Info.plist 的 CFBundleExecutable，确认该声明指向有效可执行文件），或 GitHub Copilot 的完整 VS Code 插件与有效宿主。证据路径保存在 `installationEvidence`。
- `configurationOnly`：没有上述证据，仅上游配置检测命中。plugin-only、空目录和卸载残留均不能据此确认安装。
- `notFound`：未找到安装证据且配置检测未命中；界面按用户指定称“未安装”；内部仍表示未找到支持范围内的安装证据。

已知命令覆盖：Codex、Claude Code、Cursor、Windsurf、Zed、Gemini CLI、OpenCode、GitHub Copilot、Amp、Goose、Pi、Kimi CLI、Hermes Agent、Sarvam Code、OpenClaw（含旧命令）。macOS 应用包覆盖 Codex、Cursor、Windsurf、Zed。检查继承 PATH、用户 `.local/bin`、`bin`、`.cargo/bin`、`.bun/bin`、`.opencode/bin`、`.npm-global/bin`、`.volta/bin`、`.local/share/pnpm`，以及 nvm/fnm 的已有版本目录；macOS 另检查 Homebrew 常用 bin 和用户/系统 Applications。检测不执行这些命令，不启动应用，也不验证登录、运行健康或实际加载。其他 Agent、版本管理器未暴露于 PATH 的命令、自定义应用位置可能仍未确认。

默认侧栏显示确认安装的 Agent；既有手动显示/隐藏偏好继续有效。设置、Agent 页面和安装选择器显示上述状态。

技能库存继续调用当前范围原版 `list --json`，使用其来源与库存信息；目录核验保留每个真实路径及链接关系，避免上游按名称合并掩盖独立副本。图标规则为“确认安装的 Agent ∩ 该物理技能记录的实际目标关系”，不因目标是共享目录就排除通用 Agent。技能卡片和详情恢复 Agent 安装表达，移除“共享可用”标签。仅发现配置、未确认安装或手动显示，均不使 Agent 自动获得已安装图标。后续修复将该条件同步应用于 Agent 页面、Agent 筛选与设置技能数量：未确认安装的 Agent 不列出共享目录技能，不显示目录技能数量，显示可重新检测的空状态。全局/项目总库存及原始物理关联保留，供来源检查和卸载影响使用。

通用 Agent 共用同一目标，所以已确认安装的 Codex/Pi 可以同时关联其中的技能；专属 Agent 必须在专属目录中有有效副本或链接，失效链接保留诊断，不计入技能安装关系。上游 list 的 Agent 关联并不是安装选择历史；--agent 过滤也可能因其他专属目录扫描而带出额外关联。现有锁文件没有完整目标历史，不新建第二套安装账本。所有物理关联继续进入卸载影响清单，图标过滤不会缩小清理范围。

GitHub Copilot 插件检测检查 `.vscode/extensions` 与 `.vscode-insiders/extensions`：要求有效宿主命令或 macOS 宿主应用，manifest 的 publisher/name、version、engines.vscode 匹配且 main/browser 指向扩展内实际文件，并排除 `.obsolete` 标记。仅有同名目录、元数据残留或宿主已卸载时不确认。依照 [VS Code 扩展 manifest](https://code.visualstudio.com/api/references/extension-manifest) 与 [扩展目录规则](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) 检查默认安装位置；自定义 `--extensions-dir`、远程宿主以及其他 IDE 插件尚未覆盖。安装证据不表示插件已启用、账号已登录或技能已加载。

## 重构前逻辑

核对 `6386a77`（上游执行层重构前）中的 `packages/skills-space-cli/src/index.ts`：`detectionFor()` 对任一 detectionPaths 执行 stat 成功就标为 detected，未验证可执行程序，也会命中残留目录；默认检测技能目录的父目录，部分 Agent 覆盖检测路径。技能库存按旧版 Agent 专属目录读取，再结合自有中心库和 managed distribution ledger 区分受管、未受管、分发和漂移；例如 Codex 的目标为 CODEX_HOME/skills。该旧模型不作为当前运行合同，不恢复自有 CLI 或分发账本。

## 前一轮验证（共享标签方案已由本轮图标规则替代）

- `pnpm test:frontend-contracts`：16 项通过（13 项库存/操作契约，3 项外观契约）。新增覆盖共享可用不转为通用 Agent 的逐项安装图标、配置线索不作为确认安装、专属关联与操作影响保留。
- `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1`：79 项通过，3 项公网测试按原设置忽略。首次沙箱运行 68 通过、11 失败，其中 10 项因禁止本地 HTTP 监听，1 项临时进程等待超时；允许本地 fixture 监听后完整复核均通过，未调整测试断言。真实 CLI 测试使用隔离 HOME/项目，覆盖安装、更新、卸载、共享清理和独立副本保留。
- 新增原生用例：plugin-only 与空/残留配置不确认安装；无配置但有可执行入口可以确认；普通不可执行文件不确认；删除入口后仅剩配置回到仅发现配置；全局及项目共享记录与独立目录记录区分，物理关联保持完整。
- `pnpm build` 通过；最终 `CI=false pnpm tauri build --debug --bundles app` 通过，构建钩子再次完成 staging、严格 TypeScript 与 Vite 构建。Vite 仍报告大于 500 kB 的 chunk 提示。
- 对新打包应用进行实际桌面检查：全局两张技能卡片显示共享可用，无通用 Agent 安装图标；Codex/Pi 确认安装，GitHub Copilot 仅发现配置；配置关联页面说明目录内容不代表安装/加载；设置区分三种状态；共享卸载确认仍包含共享内容、Hermes 链接及相关 Agent。只查看确认清单，未修改真实技能。
- staging 的 CLI 发行文件与 `node_modules/skills/dist/cli.mjs` 字节比较一致；文档引用和 `git diff --check` 通过。
- 未验证：其他操作系统、任意自定义应用位置、登录或运行健康、技能实际加载。本次未再次执行三项公网测试；本次修改不包含网络行为。

## 本轮修正验证

- `pnpm test:frontend-contracts`：16 项通过。更新图标断言的依据是用户确认的规则：已确认的通用与专属 Agent 均可显示，仅配置关联不显示；物理影响关联继续保留。
- 原生检测定向用例 4 项通过；新增真实 CLI 复制/链接/范围/失效目标用例通过。完整 `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib -- --test-threads=1`：83 项通过，3 项公网测试按原设置跳过。完整测试使用允许 localhost fixture 监听的执行环境，所有生命周期变更仍隔离在临时 HOME/项目。
- `pnpm build` 通过；最终 `CI=false pnpm tauri build --debug --bundles app` 通过，构建钩子再次完成 staging、严格 TypeScript 与 Vite 构建。大于 500 kB 的 Vite chunk 提示仍存在。
- 实际 macOS 新打包应用：全局 prd-create 显示 Codex/Pi，weknora 显示 Codex/Hermes/Pi。Hermes 的证据为 ~/.local/bin/hermes，GitHub Copilot 仅发现配置且无安装图标。项目 4 个技能显示 Codex/Pi，无项目技能目标的 Hermes 不出现在卡片上。卡片、详情和 Agent 说明移除共享可用标签。
- 项目共享卸载确认仍列出共享内容及全部物理关联，包含仅配置关联的 GitHub Copilot；只打开并关闭确认，未执行真实卸载。实际程序不因图标过滤而缩小上游清理范围。
- 包内 CLI 发行文件与 node_modules 中固定的原版文件字节一致；文档引用及 `git diff --check` 通过。
- 此轮未执行公网测试，未验证 Windows/Linux、非默认 IDE 扩展目录、其他 IDE 插件、登录/启用状态或实际技能加载；安装证据覆盖边界见当前实现。

## 未确认 Agent 列表与数量修复

此前只过滤卡片图标，visibleSkills 与设置数量仍直接使用原始物理关联，所以所有通用 Agent 都能看到共享目录内容。此轮将安装确认条件同步用于列表与数量，保留已确认通用 Agent 的实际技能及原版 CLI 行为。

- 前端 17 项通过；新增用例覆盖仅配置、未发现、未知 Agent 的列表为空及不计数，确认后可显示真实技能，原始卸载关联和总库存保持完整。既有用例补充了真实确认状态 fixture，保留原有搜索、同名和操作断言。
- 原生检测和执行代码未变，沿用上轮 83 项通过、3 项公网测试跳过的记录，本轮不重复完整原生测试。
- `pnpm build` 与最终 `CI=false pnpm tauri build --debug --bundles app` 通过。实际新打包应用已核对设置：未确认 Agent 不再显示共享目录的技能数量，Codex/Pi 为 2 项、Hermes 为 1 项；从设置进入 Cursor（目标同为 ~/.agents/skills）后，列表为空，仅显示安装未确认状态与重新检测入口。全局总库存仍为 2 项且保留正确 Agent 图标。
- 原版 CLI 发行文件字节比较、文档引用和 `git diff --check` 通过。安装确认仍遵循前文的证据覆盖范围，本轮修复的是展示过滤而非新增 Agent 入口。

## 状态文案与颜色调整

按用户指定，confirmed 显示“已安装”并使用绿色，configurationOnly 显示“发现配置”并使用黄色系，notFound 显示“未安装”并使用红色。设置卡片与安装选择器复用状态 Badge，分别提供浅色/深色语义颜色；保持检测、列表过滤、数量及上游操作逻辑。Agent 详情页移除额外安装确认说明。

验证：前端 17 项通过；pnpm build 与最终 CI=false pnpm tauri build --debug --bundles app 通过。实际桌面核对深色与浅色模式，设置中三种标签名称和绿色/黄色/红色正确，Codex 详情页没有独立安装确认说明。核验后恢复原深色模式。检测与原生执行代码未改，不重复原生完整回归；文档引用与 git diff --check 通过。
