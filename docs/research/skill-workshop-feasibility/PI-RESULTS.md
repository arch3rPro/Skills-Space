# Pi 最小验证结果

日期：2026-11-04。状态：通过本轮限定验证。承接 [Codex 验证结果](RESULTS.md)；未接页面、未安装到正式目录、未提交。

## 执行入口

原版 skills 1.7.4 的 `--agent` 固定名单中没有 Pi。本次使用它原生支持的指令输出模式，原始输出完整保留，再附加用户任务，交给原版 Pi 1.5.0：

```text
原版 skills use <source> --skill <name>
    → 标准输出中的完整技能指令和 supporting-files 路径
    → 原版 pi --mode rpc 的 prompt
```

创建与修改在同一个 Pi 进程中完成；两例试用及评估分别使用新进程。Pi 模型为现有配置的 `gpt-6.1-sol`，provider 为 `openai-codex`，推理强度 `medium`。使用原 CLI 的 RPC JSONL 接口，以 `agent_settled` 确认运行结束，没有把接受请求当作任务完成。

这是临时验证脚本对原版进程的编排，不是改写 skills CLI，也不是以 Codex 命令替身伪装 Pi。产品里的 Pi 启动适配尚未实现；不表示 `skills use --agent pi` 已可使用。

会话、设置和登录文件副本放在临时目录。关闭自动资源发现、扩展和 MCP，关闭自动重试；只启用任务所需的 read/write/edit 工具。`--offline` 关闭启动时的自动网络活动，实际模型请求正常进行。没有写入正式 Pi 设置，也没有加载正式技能目录中的其他技能。所有进程均退出，临时登录副本已删除。

## 结果与用时

| 阶段 | 从提交 prompt 到 agent_settled 的耗时 |
| --- | ---: |
| create | 35.799 秒 |
| modify | 17.46 秒 |
| case-1 | 6.591 秒 |
| case-2 | 6.799 秒 |
| evaluate | 55.672 秒 |

- 创建生成 `skill/meeting-notes/SKILL.md` 与 `references/output-template.md`。
- 同会话修改同步更新主说明和模板，增加风险与待确认的处理规则。
- 两例实际结果均保留明确负责人、日期、未批准提议及未确认信息，未编造缺失值。
- 评估会话实际读取官方 creator 的 `agents/grader.md`，按独立任务书检查真实输出，仅写 `review/report.md`。
- 父执行者的文件清单和 SHA-256 比对证明评估前后技能内容完全相同；评估者报告中因未收到外部后置记录而保留的“待核对”，由这项外部检查补齐。
- 真实应用“添加技能 → 本地目录 → 检查来源”发现唯一 `meeting-notes`，简介与文件一致。停在技能预览后关闭，未进入目标和安装确认。托管技能仍为 8，原生技能仍为 128；之后恢复到本次验证前的设置 → 智能体页面。

Pi 原始评估报告按试点口径给出 100/100，未发现本轮材料中的实质缺陷。此分数不代表一般质量保证；未覆盖案例与自然触发率仍未验证，不为增加分数继续试验。

## 同一产物跨 Agent 验证

为直接验证产物复用，另将上一轮 **Codex 生成且未修改**的技能，经原版 `skills use` 输出交给 Pi 的原生 JSON/print 模式，只运行同一个中文案例。耗时 **11.113 秒**，正确保留“林同学／周五前”、帮助文案缺失值及未决发布时间。该原始技能的文件清单和内容哈希均未改变。

因此本轮不仅验证两种 Agent 各自完成创作流程，也实际验证了这份 Codex 产物可直接由 Pi 使用；不扩展为全部技能或全部 Agent 的兼容性结论。

## 文件完整性

Pi 生成产物在只读评估前后的相同 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| SKILL.md | `b5d9c7910bcfa0c306ab33f76d4ec46919cfb46653e2665d93e5b8109139f12c` |
| references/output-template.md | `f4326870386a52254d2b8c866d9f7b27e818d4fb2ea2592ff76f8d37af75ccb7` |

原 Codex 产物在 Pi 试用前后的哈希与 [Codex 记录](RESULTS.md) 中的结果一致。

## Pi 生成技能的实际输出

### 中文

```markdown
# 会议记录

## 摘要
- 周三讨论发布，涉及导出空文件问题、帮助文案调整及发布时间。

## 已确认的决定
- 先修复导出空文件的问题。

## 行动项
| 任务 | 负责人 | 截止日期 |
| --- | --- | --- |
| 修复导出空文件的问题 | 林同学 | 周五前 |
| 调整帮助文案 | 未明确 | 未明确 |

## 待解决问题
未记录

## 风险与待确认
- 发布时间未定：陈同学提议本周发布，赵同学建议下周，会议没有决定。
```

### 英文

```markdown
# Meeting notes

## Summary
- Discussed login and sign-up flows and the timeout report.

## Confirmed decisions
- Keep the existing login flow.

## Action items
| Task | Owner | Due date |
| --- | --- | --- |
| Check the timeout report | Alex | Not specified |

## Unresolved questions
None recorded.

## Risks and items to confirm
- A separate sign-up flow was suggested but not approved.
- The team is unsure whether the report includes mobile users.
```

## 结束范围

共四个 RPC 进程完成五个 prompt，另一个 JSON/print 进程完成一次跨 Agent 试用。没有协作子 Agent，没有重试或评分循环，没有运行项目测试套件或打包应用。任务输入、原始事件、真实产物、评估报告与文件比对记录保留在本次临时工作目录；仓库仅保留安全的结论和材料状态。
