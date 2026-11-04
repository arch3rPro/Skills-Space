# 创意工坊最小验证材料

状态：2026-11-04 已分别完成 Codex 与 Pi 最小验证，实际结果见 [Codex 记录](RESULTS.md)和 [Pi 记录](PI-RESULTS.md)。下文保留执行材料和复现步骤。选型依据见[调研报告](../skill-workshop-creator-evaluation-2026-11-04.md)。本次使用项目原版 skills 1.7.4 和一个已安装、已登录的受支持 Agent，不安装技能、不修改正式 Agent 配置。

## 材料

- [CREATION.md](CREATION.md)：交给创建会话的完整任务书。
- [EVALUATION.md](EVALUATION.md)：交给独立评估会话的只读任务书。
- [cases.json](cases.json)：两个任务输入和可观察预期。
- [sources.json](sources.json)：固定提交及仓库 Star 快照。

## 工作目录

在项目仓库之外创建一个临时工作目录，复制 CREATION.md、EVALUATION.md 和 cases.json。源材料不要直接作为工作目录运行，以免产物混入源码。

```text
临时工作目录/
├── CREATION.md
├── EVALUATION.md
├── cases.json
├── skill/
│   └── meeting-notes/
│       ├── SKILL.md
│       └── references/output-template.md
└── review/
    ├── outputs/
    └── report.md
```

`skill/meeting-notes/` 是待安装技能根目录；目录名与 name 一致。任务书、试用输出和评估报告都在技能根目录之外。

## 1. 创建和一次修改

先在 Skills Space 源码仓库根目录记录路径，再进入上述临时工作目录。先记录源码仓库路径：

```sh
SKILLS_SPACE_REPO="$PWD"
```

在同一终端切换到准备好的临时工作目录，再执行下面的启动命令：

```sh
node "$SKILLS_SPACE_REPO/src-tauri/resources/upstream/skills/dist/cli.mjs" use \
  https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/skill-creator \
  --skill skill-creator --agent codex
```

命令使用原版 CLI；如使用 Claude Code，将末尾改成 `--agent claude-code`。按本项目固定版本，`skills use --agent` 不包含 Pi、DSH；这与生成技能的适用 Agent 无关。Windows 使用同一命令结构时，按所用终端替换环境变量与换行语法；本次未做 Windows/Linux 实机验证。

Agent 启动后发送：

> 读取当前工作目录的 CREATION.md，按任务范围完成创建阶段，把产物写入 skill/meeting-notes/。本轮不要执行评测、自动优化、Git 操作或安装。

`skills use` 当前没有任务书参数，需在原终端中发送这条请求；不假设 CLI 自动读取 CREATION.md。creator 的相对资源从 `skills use` 提示中的 supporting-files 目录读取；产物写入工作目录，不能写到那个临时资源目录。

首次生成后，在同一会话追加一次修改：

> 增加“风险与待确认”章节，将含糊、冲突或未确认的信息放进去。不要推断负责人、日期和决策。只修改这个技能，不扩展功能，也不要试运行。

## 2. 两个实际任务

退出创建会话，再以新会话运行产物，避免沿用创建过程上下文：

```sh
node "$SKILLS_SPACE_REPO/src-tauri/resources/upstream/skills/dist/cli.mjs" use \
  ./skill/meeting-notes --skill meeting-notes --agent codex
```

每次只提交 cases.json 中一个 case 的 `prompt` 和 `input`，不要把 `expected_checks` 作为待整理文本。分别保存实际回答到 review/outputs/case-1.md 与 case-2.md。第二个案例另开新会话；不额外重复采样。

两次实际任务证明基础可用性，不证明优于未加载技能的 Agent，也不测自然触发率。需要比较优化收益时，再另行确定相同条件下的对照，不在本轮扩测。

## 3. 单独只读评估

通过 `skills use` 在新会话加载同一官方 creator，再要求它读取 EVALUATION.md、技能和两个真实输出，并参考资源中的 `agents/grader.md`。**本轮不直接启动 darwin 原版完整流程**；它带有改写、Git 和多轮评审行为。本评估任务书借鉴其质量维度，保留逐项证据，先验证只读评估是否满足需要；目前还不是可加载的独立评估 Skill。

评估前后对比技能目录内文件清单和 SHA-256，确认无新增、删除或内容修改。报告只写 review/report.md。若实际输出不存在，报告对应项为未验证，不模拟补分。

## 4. 本地预览

用现有“本地目录安装”流程预览 skill/meeting-notes/，核对发现的技能名、说明及资源；停在预览阶段，不安装到正式目录。

## 停止条件

只验证：creator 资源可读取；生成通用技能；同会话修改正确；两个实际输出符合预期；独立评估不改技能；本地预览一致。首次失败记录命令、版本和错误后集中处理，不自动重试或另跑优化框架。完成这些项目即结束，不打包应用、不运行项目测试套件。

记录每一步耗时和结果，区分已通过、失败与未执行。符合开放格式与单 Agent 实测通过分别记录，不声明跨 Agent 已全面验证。

## Pi 已验证入口

原版 `skills use --agent` 尚不包含 Pi，但其原生指令输出已实际接入原版 Pi 的 RPC/JSON 模式，完成创建、修改、试用、只读评估与安装预览。还用 Pi 运行了同一份 Codex 产物；详见 [Pi 记录](PI-RESULTS.md)。这是最小验证的进程编排，产品启动适配尚未接入。
