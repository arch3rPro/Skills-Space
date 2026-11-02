# Agent 管理、检测覆盖与排序

日期：2026-10-14。范围：本机 Agent 安装证据、设置页面和排序偏好；原版 skills@1.7.2 执行规则保持。

## 页面与排序

- 未安装或仅发现配置时，数量统一为 `0 个已安装技能`；原有安装确认过滤仍生效，不重新把共享目录库存算给未安装 Agent。
- 设置 Tab 为 `AGENT管理`，移除重复标题和说明；搜索与重新检测同一行；移除设置页顶部说明。
- 管理列表提供独立拖动手柄，按住 350 ms 激活拖动，鼠标也可从手柄直接拖动；支持预览、边缘自动滚动、取消、落在列表外取消；键盘上下方向键可调整顺序。点击 Agent 名称与切换显示状态保持独立。
- 使用一个可排序列表，初始常用 Agent 在前；不保留限制跨组排序的“常用/其他”分组。
- `agentOrder` 以稳定 ID 保存到现有 preferences-v2.json，旧文件缺少字段时默认空顺序。管理、侧栏、安装选择器、Agent 筛选统一使用排序函数；筛选或切换范围不删除未显示的已保存 ID。新 Agent 在已保存顺序后补入。

## 检测覆盖与边界

每个固定上游定义均进入检测，不再只有最初 15 个 ID 能检查入口。补齐 Kimi 上游 ID `kimi-code-cli` 与 `kimi` 命令的映射；增加 Vibe/Qwen/Kiro/iFlow/Continue/Autohand/inference.sh/ForgeCode/CodeArts 等别名。

- 已知 CLI 使用明确入口别名；其他定义检查同名上游 ID 的可执行入口候选。沿用 PATH、用户 bin、nvm/fnm 等路径，不以配置或技能目录代替可执行证据。
- macOS 通过已知应用别名及上游显示名对应的 `.app` 候选查找，仍要求 Info.plist 声明的实际可执行文件。只检查用户/系统 Applications，不启动 Agent。
- Codex、Claude Code、GitHub Copilot、Cline、Roo、Kilo、Continue、Augment 支持扩展 manifest 身份及实际代码检查；宿主包括 VS Code/Insiders、Cursor、Windsurf、Antigravity。要求宿主存在，排除 obsolete 条目。
- Eve 使用当前项目中实际安装的 eve 包、有效 package.json 和真实 main/module 文件，不因仅声明依赖确认安装。
- Universal 是共享目标，无独立安装入口；fx 的通用命令存在歧义，不将任意名为 fx 的命令直接当作 Agent。其有效同名桌面应用仍可被检查。

这是一套本地标准入口探测，不表示已在真实机器安装并验证全部 79 个产品。未知厂商入口别名、非默认应用/扩展位置、只有云端或远程宿主的产品仍可能不能确认；不运行 Agent 来探测登录或服务状态，不添加远程执行。

参考一手证据：[固定上游发行包](https://www.npmjs.com/package/skills/v/1.7.4)、[Kimi 安装文档](https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html)、[VS Code manifest](https://code.visualstudio.com/api/references/extension-manifest)、[Codex 扩展](https://marketplace.visualstudio.com/items?itemName=OpenAI.chatgpt)、[Claude Code 扩展](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)、[Augment 扩展](https://marketplace.visualstudio.com/items?itemName=augment.vscode-augment)、[Continue 扩展](https://marketplace.visualstudio.com/items?itemName=Continue.continue)、[Roo 扩展](https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline)、[CodeArts 命令](https://support.huaweicloud.com/intl/zh-cn/usermanual-cli/codeartsagent_cli_0034.html)、[Autohand](https://docs.autohand.ai/working-with-autohand-code/cli)。

## 验证

- 前端 18 项通过，包括范围子集、保存顺序、未知/新 ID、非变更排序和过滤契约。
- 检测定向 6 项通过。覆盖 79 个定义：共享目录存在不能确认 Agent；真实入口可以被检查；删掉入口后只有配置不能确认；IDE 元数据没有实际代码不确认；Eve 必须有实现文件。
- 原生完整回归：85 项通过、1 项来源更新检查失败、3 项公网测试跳过；失败项保留预期断言并增加诊断，定向复核通过。本轮未将这次完整运行记录为全部通过；原因未能稳定复现。
- pnpm build 与最终 CI=false pnpm tauri build --debug --bundles app 通过；Vite 大 chunk 提示仍存在。
- 实际新应用核对：零数量格式、AGENT管理 Tab、搜索/重新检测同行、去掉两处冗余说明；鼠标把 Pi 移到 Codex 位置，再用方向键移到首位，焦点保持在 Pi。筛选菜单为 Pi/Codex/Hermes，安装选择器从 Pi/Claude Code/Codex 开始，与管理顺序一致。只预览本地技能，不执行安装。
- 重启应用后保存的 Pi 置顶顺序仍存在。验证后通过拖动恢复原显示顺序（Claude Code/Codex/Cursor/Gemini/GitHub Copilot/OpenCode/Pi/Windsurf）。排序偏好保留正常保存能力。
- 包内 CLI 发行文件字节一致，文档引用与 git diff --check 通过。
- 未实机覆盖全部 79 个软件、非标准入口、其他操作系统；触摸设备和跨整页边缘自动滚动未实测。长按计时分支已实现，实际桌面验证使用鼠标拖动及方向键，不将其写成触摸长按实测。

## 鼠标拖动效果修正

- 拖动时使用与原卡片一致的浮层，按鼠标抓取偏移跟随指针；原卡片淡化为占位，移除原先的外圈高亮。浮层无边框，仅用阴影表达抬起状态；不参与点击或无障碍树。
- 其他卡片使用 220 ms 位移动画让位，连续换位时从当前动画位置衔接；减少动态效果偏好下跳过让位动画。浮层按动画帧更新 transform，不在每次指针移动时重新渲染整个列表。
- 命中目标使用拖动开始时的网格位置，并补偿滚动偏移，避免动画中的卡片反复改变目标。松手后保留排序预览直至偏好保存完成，避免先回跳再排序。
- 本轮 pnpm build、18 项前端契约测试和 CI=false pnpm tauri build --debug --bundles app 通过，git diff --check 通过。实际最终桌面包验证 Pi 从首位跨行移至第六位、侧栏顺序联动、拖出列表取消，以及恢复本轮验证前的 Pi/Codex/Claude Code 顺序。截图工具未捕获持续拖动中的帧，不把静态截图写成连续动画流畅度实测；触摸设备未实测。原生检测与 CLI 代码未改动，本轮未重复其完整回归。

## 安装状态筛选

- AGENT管理增加单选筛选：全部（默认）、已安装、发现配置、未安装，分别匹配已有检测状态；与名称/ID 搜索同时生效。筛选后的拖动和键盘排序继续保存完整 Agent 顺序。
- 搜索、筛选与重新检测位于同一工具栏；重新检测靠右对齐，窄窗口允许换行。筛选不改变安装检测、技能统计和上游 CLI 行为。
- pnpm build、18 项前端契约测试、CI=false pnpm tauri build --debug --bundles app 和 git diff --check 通过。实际桌面包核对：默认全部；已安装显示 Pi/Codex/Hermes；发现配置显示 GitHub Copilot；未安装排除上述 Agent；搜索 Pi 与未安装组合为空、切回已安装后仅显示 Pi；截图确认重新检测与右侧卡片边缘对齐。验证后清空搜索并恢复全部，未改变排序偏好。

## 2026-10-17 已确认的分类调整

用户新增要求将设置列表分为“增强适配 / 通用支持”，替代本文早期单列表且不分组的展示结论。分类按实际原生管理能力，与安装／显示状态独立；沿用全量 agentOrder 并只在组内换位。实施及验证状态见 [spec 0007](../specs/0007-deepseek-harness-skill-management.md)。
