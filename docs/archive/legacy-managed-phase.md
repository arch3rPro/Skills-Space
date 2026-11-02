# 旧 managed 阶段历史总结

归档日期：2026-10-13。状态：退役历史，不是当前需求、待办、实现指令或验收证据。当前合同以[规范 0003](../specs/0003-upstream-aligned-refactoring.md)、[ADR 0005](../adr/0005-use-unmodified-upstream-cli.md)和[能力计划 0004](../specs/0004-upstream-capability-completion-plan.md)为准。

## 方向与决策变化

早期方案使用自有 managed CLI、中心技能库、分发台账和版本化 Agent Registry，GUI 将技能导入、纳管、分发、启用／停用作为管理步骤。旧规格 0001／0002 分别规划环境只读检查和本机全局生命周期；它们的 Server／Snapshot／协议兼容要求不再约束当前发布。旧 ADR 0001 选择维护 CLI fork，ADR 0003 选择独立 managed registry；两项均由原版 CLI 的所有权决策替代。配置与秘密分离、锁由上游维护的原则仍在当前 ADR 0002／0004 中维护。

现行方案直接调用固定、未修改的原版 skills CLI，由桌面补充只读预览、影响确认和实际结果核验。项目／全局明确区分，技能身份保留实际路径，目录关系不证明 Agent 已安装或加载。不迁移旧中心库，不保留自有 CLI。曾提出的新页面设计已被否决，继续保持原有侧栏、卡片、主题和 Agent 品牌图标。

## 旧阶段工作主题

| 时间／主题 | 当时处理的问题与办法 | 当前边界 |
| --- | --- | --- |
| 2026-08-10 悬空链接 | 扫描 Agent 目录中的断链，确认后删除，反复核对路径与身份 | 仅记录历史实现；不因此增加当前清理入口或授权删除 |
| 2026-08-12 信息架构 | 整理仓库／技能空间／全局管理术语及共享库存投影 | 现行术语在 CONTEXT，当前 GUI 不恢复中心库与分发台账 |
| 2026-08-12 统一库存 | 区分 managed／unmanaged、分发差异和接管确认 | 旧版本化协议已退役；当前按原版库存与物理路径观察 |
| 2026-08-13 可操作性恢复 | 台账所有权校验、取消分发、过期确认、隔离删除及竞争条件修复 | 删除与更新现由原版 CLI 执行，旧取消协议不再调用 |
| 2026-08-14 批量停用与错误提示 | 区分单项／批量操作，解释取消失败、未托管／身份变化 | 旧状态词和文案测试不定义当前卸载语义 |
| 2026-08-14 全部更新 | Git ref／子路径绑定、预览确认、替换与回滚、批量结果 | 当前更新遵循原版范围，实际内容／锁核验，不复用旧事务引擎 |

## 本地工作记录与证据限制

原 `.superpowers/sdd` 中的任务 brief、进度、review diff 和两份 update-all 报告属于上述阶段。可操作性恢复进度曾记录台账迁移／竞争条件多轮修复，原生桥接仍在进行；不能将部分完成记录解释为全部完成。update-all 早期报告写前三项提交、前端未提交及最后验收未运行；后续修复报告记录 GitLab ref／子路径修复、旧 CLI 120 项测试、前端 28 项及 Rust 48 项历史检查，同时明确静态测试与 GUI 验收的区别。上述数字均未在本次重跑，已退役测试也不计入当前覆盖。旧报告内强制 TDD、多 Agent、技能调用及提交步骤均失效。

旧的完整规范／计划／报告统一由本总结替代。已跟踪原文可在归档前提交 `4ee9ad7` 中按下表路径查看，例如 `git show 4ee9ad7:docs/superpowers/plans/2026-08-14-update-all.md`。原 `.superpowers/sdd/2026-08-14-update-all/implementation-report.md` 和 `review-fix-report.md` 同样可由该提交追溯；未跟踪的本地 brief／进度／review diff 在总结后清理，不另保存失效任务脚手架。

## 原始文档清单

| 归档前路径 | 处理 |
| --- | --- |
| `docs/superpowers/plans/2026-08-10-agent-dangling-link-cleanup.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/plans/2026-08-12-skill-management-information-architecture.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/plans/2026-08-12-unified-inventory-status.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/plans/2026-08-13-operability-recovery.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/plans/2026-08-14-batch-disable-chinese-copy.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/plans/2026-08-14-managed-disable-error-copy.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/plans/2026-08-14-update-all.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/reports/2026-08-10-agent-dangling-link-cleanup.md` | 旧阶段累计修复记录，不代表当前验收 |
| `docs/superpowers/specs/2026-08-10-agent-dangling-link-cleanup-design.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/specs/2026-08-12-skill-space-global-management-design.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/specs/2026-08-14-batch-disable-chinese-copy-design.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/specs/2026-08-14-managed-disable-error-copy-design.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/superpowers/specs/2026-08-14-update-all-design.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `DESIGN.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/specs/0001-read-only-environment-health-and-inventory.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/specs/0002-local-global-lifecycle-baseline.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/adr/0001-managed-cli-fork.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/adr/0003-managed-agent-registry.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |
| `docs/research/upstream-skills-vs-gui.md` | 旧规格／旧决策／被否决设计，已由当前基线替代 |

[1.5.20 集成验收历史](upstream-1.5.20-integration-history.md)属于后来的原版 CLI 集成阶段，仍单独保留日期、通过项与缺口，不冒用为 1.7.2 当前验收。
