# 创意工坊：技能创建与评估选型

日期：2026-11-04。状态：公开源码调研与材料已准备；2026-11-04 后续最小验证已在 Codex、Pi 分别完成创建、修改、只读评估和真实应用预览，见 [Codex 结果](skill-workshop-feasibility/RESULTS.md)与 [Pi 结果](skill-workshop-feasibility/PI-RESULTS.md)。未安装技能或开发页面。本记录补充[原工作台想法](skill-workbench-ideas.md)，不表示创意工坊页面已开发。

## 建议

**创建首选 Anthropic 官方 `skill-creator`；评估首轮参考 darwin 的质量维度和 Anthropic 的逐项证据评审方式。SkillOpt 留作后续有明确任务数据时的效果优化引擎。**

原版 creator 可按用户要求只完成创建；这次不运行描述调优、并行评测和自动优化循环。生成通用技能与 creator 本身的执行环境是两个问题：产物采用开放格式，并不表示 creator 的全部脚本可以跨 Agent 执行。

## 创建候选

Star 为 2026-11-04 GitHub API 查询到的**整个仓库**关注数，不是单个技能的评分。精确提交与数值见[来源记录](skill-workshop-feasibility/sources.json)。

| 候选 | Star | 产物及主要差异 | 选择 |
| --- | ---: | --- | --- |
| [Anthropic skill-creator](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/skill-creator) | 187,017 | `SKILL.md` 与按需附带的资源；覆盖需求澄清、创建、案例及反馈。创建流程允许按用户范围缩减；描述优化脚本依赖 Claude CLI | 首轮创建来源 |
| [OpenAI skill-creator](https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator) | 28,492 | 通用核心结构，但初始化默认生成 `agents/openai.yaml`，说明也面向 Codex；若采用需明确通用产物边界 | 对照材料 |

Anthropic 的 [run_eval.py](https://github.com/anthropics/skills/blob/ca45fc496a3436251f191354091d557da31c15b5/skills/skill-creator/scripts/run_eval.py) 会创建 `.claude/commands` 条目并调用 `claude -p`；不能把它作为通用 Agent 的触发率测试。其 [grader](https://github.com/anthropics/skills/blob/ca45fc496a3436251f191354091d557da31c15b5/skills/skill-creator/agents/grader.md) 则提供有价值的“按实际产物核对预期并给出证据”方法。

OpenAI 的旧 [skills 仓库 README](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/README.md) 已声明弃用并指向 `openai/plugins`；本次查询新仓库文件树未发现同名 `skill-creator` 路径。这不表示 Codex 自带 creator 已不可用，但不适合作为本项目新引入的长期远程来源。两份 creator 目录中的 `LICENSE.txt` 均为 Apache-2.0；本轮不复制第三方正文入库。

## 通用产物的要求

按 [Agent Skills 规范](https://agentskills.io/specification) 创建：目录与 `name` 一致，`SKILL.md` 含合法 `name`、`description`，资源使用相对路径；按需使用 `scripts/`、`references/`、`assets/`。

本次验证选择纯文本整理任务，避免引入工具依赖。产物不以特定 Agent 名称、私有工具、插件、个人路径或专属配置作为使用前提。无需生成 `agents/openai.yaml`、`.claude/` 或 Agent 专属安装指令。将来确需外部工具时应声明真实依赖，而非仅删除 Agent 名称便声称通用。

符合格式只能证明结构具备可移植基础。一个 Agent 上跑通不证明所有 Agent 上效果一致；首轮验证功能闭环，跨 Agent 效果另选一个确有需求的目标检查。

## darwin-skill

[项目](https://github.com/alchaincyf/darwin-skill) 6,780 Star，MIT。[固定 SKILL.md](https://github.com/alchaincyf/darwin-skill/blob/8a8b66258e3c45d6ae4aea39719468c6428fcb0a/SKILL.md) 正文已更新到 v2.1，但部分标题和 README 仍写 2.0。应以实际指令为准。

其核心是评估、修改、实测、人工确认、保留或回滚，不只是评分。值得参考的部分包括九维质量审查、实际任务对照及[运行环境通用性检查](https://github.com/alchaincyf/darwin-skill/blob/8a8b66258e3c45d6ae4aea39719468c6428fcb0a/references/runtime-neutrality.md)。当前指令也明确将绝对分数用于粗排，将同一评审者的成对比较用于修改取舍；不能沿用 README 里仅看总分增减的简化解释。

原版默认还会扫描 `.claude/skills`、建 Git 分支、写测试文件、调用评审子 Agent 和改写技能。评分条目包含作者生态、显式确认标记及强制反例等偏好，不宜原样成为所有技能的统一产品评分标准。原版还允许模拟执行补实测分，本项目材料将未运行项保留为未验证。

**适用方式：先限定为单个指定目录的只读评估；借鉴方法，单独记录本项目评估口径。**本次提供任务书，不运行原版自动优化；也不将调整后的分数冒充 darwin 原始分数。

## Microsoft SkillOpt

[项目](https://github.com/microsoft/SkillOpt) 18,856 Star，MIT，是可执行的技能优化框架。其 [skill document](https://github.com/microsoft/SkillOpt/blob/bc0a392ef0a7f92840ec673d80204d34ced169d0/docs/guide/skill-document.md) 是参与模型任务的 Markdown 策略文本，`best_skill.md` 不自动等于带完整元数据和资源的可安装 Agent Skill。

[安装文档](https://github.com/microsoft/SkillOpt/blob/bc0a392ef0a7f92840ec673d80204d34ced169d0/docs/guide/installation.md) 要求 Python ≥3.10 及配置好的模型后端；可用 API、本地服务或执行 CLI，并非一定需要 API Key。当前 PyPI 为 0.2.0，部分后端和集成功能只在 main；不能将 main 的能力都写成已发布能力。

[独立评估命令](https://github.com/microsoft/SkillOpt/blob/bc0a392ef0a7f92840ec673d80204d34ced169d0/docs/reference/cli.md) 支持 `skillopt-eval --config ... --skill ... --split ...`。评估仍需任务数据和对应评分环境；[接入新任务](https://github.com/microsoft/SkillOpt/blob/bc0a392ef0a7f92840ec673d80204d34ced169d0/docs/guide/new-benchmark.md) 涉及数据读取、模型执行与评分、环境适配、配置。它不会仅靠阅读任意 `SKILL.md` 就产生可靠通用分数。

仓库含多个 Agent 的 Sleep 集成（包括 DSH），但这是会话采集、任务回放、技能优化与采纳流程，不是本次单技能只读评分。**首轮不安装 SkillOpt；后续对可量化任务复用其效果评估和候选版本比较能力。**

## 最小验证材料与下一步

材料入口：[执行说明](skill-workshop-feasibility/README.md)。包括创作任务书、只读评估任务书、两个真实任务输入及固定来源记录。只生成一个 `meeting-notes` 技能，在原 Agent 会话里修改一次，再单独评估；GUI 最后仅检查本地来源能否正确预览。

本轮没有制作自定义 creator、评分插件或页面。评估任务书是待验证的口径，不是已认证的评分服务。后续若要将其封装成可通过 `skills use` 加载的独立评估技能，应在本轮材料验证后另行确定。

## 首轮调研的证据与执行边界

以下描述材料准备阶段；后续真实执行的证据以执行结果为准。

已检查四个仓库的固定文件、Star 和许可；核对项目原版 skills 1.7.4 的 `runUse`、资源物化、固定提交 URL 解析及 Agent 启动参数。未启动原 Agent、未运行第三方 Python/Node 脚本、未安装依赖、未执行模型评测。

本次文档验证仅检查新增材料的 JSON、相对链接、Git 空白错误和范围一致性，不运行构建或自动化测试。后续实际验证应分别记录资源加载、生成、修改、只读评估、本地来源预览的结果，不能以本次源码阅读替代。
