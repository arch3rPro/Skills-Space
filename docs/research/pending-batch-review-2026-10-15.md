# 2026-10-15 提交批次核对

基准：`main` 的 `7994fcf`（`feat: refine skill installation flow and default settings`）。状态：用户已于 2026-10-15 确认提交，按原生／数据、界面接入与规范文档拆分；没有推送。前两次提交为 `27cc241` 和 `937d912`，规范及本记录随第三次提交纳入。共用文件按相关修改拆分。

## 提交范围

| 提交 | 内容与主要文件 |
| --- | --- |
| `feat: add Agent-native skill inventory and Pi configuration adapters` | Hermes 分类目录、附加目录与内置识别；Pi 原生发现、包技能、启停、附加目录与排除规则的原生适配；托管／Agent 技能分类与实际能力合同。包括 `src-tauri/src/upstream/{hermes,pi}.rs`、库存适配／命令注册、`scripts/inspect-{hermes-config,pi-skills}.mjs`、匹配器依赖与打包、`src/lib/{pi,upstream}.*` 和测试。包含回归时发现的临时目录重名修复。界面接入归入下一提交，功能规范／研究随文档提交。 |
| `fix: integrate Pi management and unify skill settings layouts` | Pi 管理页、卡片启停及库存分类的界面接入；技能与 Agent 卡片对齐；库存列数与工具栏统一；Pi 草稿导航／关闭保护；技能测试控件与滚动；精简错误、详情及结果文案；共享 Textarea／RadioGroup／Popover 与相关菜单；语言顺序、细滚动条及跟随侧栏主题的 macOS 顶栏；目录诊断移入全局设置。涉及 `src/App.tsx`、对应组件、`src/index.css`、窗口外观适配与关闭权限。 |
| `docs: establish UI design and verification baseline` | UI 简约原则、主题与组件职责、全量组件目录、必读技能及走查规则；同步现有计划与验证边界。包括 `AGENTS.md`、`CLAUDE.md`、`docs/design/`、开发指南／文档索引、相关研究，以及项目本地 shadcn、React 和 UI 审查技能及其锁条目。 |

现有 README 美化技能及对应锁条目属于本批之外的本地内容，保留工作区，不混入本次提交。临时 HOME、测试技能、日志、打包产物和缓存均不提交。保留未修改的固定 `skills@1.7.2`；没有接管内置技能更新，没有新增手动／AI 调用方式写入，也没有扩展为版本、模型或完整 Agent 管理。

## 验证与边界

- 本次重新执行前端契约 40 项，通过；debug 应用构建包含严格 TypeScript、Vite、Rust 编译与打包，通过。既有大 chunk 提示保留。
- `cargo fmt --check`、`git diff --check` 通过；已检查的 24 份受影响 Markdown 无失效本地链接；打包 CLI 的 `bin`／`dist` 共 15 个文件与固定上游包逐字节一致。
- 目录诊断最终使用设置行和检测按钮，检测全局及已添加项目；初次只移动折叠框的检查不作为最终验收。最终 `pnpm build` 及 debug 应用打包通过；正常应用已重启，实际点击检测、展开全局结果，显示 1 项既有失效链接且路径使用 `~`。1280×828 和 960×660 窗口中标题、状态、右侧按钮及结果无横向溢出。没有新增目录修改操作；无问题／检测失败分支完成源码检查，未在桌面伪造失败。此次局部调整不再重跑全量套件。
- 为整理整个批次而额外启动的原生全量回归已经结束：87 通过、11 失败、3 跳过。10 项在本机 HTTP 夹具绑定处因沙箱 `PermissionDenied` 失败，另 1 项子进程启动超时；不能记录为通过。此入口调整不需要全量原生回归，不继续重跑；此前具备夹具权限时的 98 项通过记录保留原日期和范围。
- 前序隔离桌面验证继续有效：Pi 配置／包技能启停及重启、草稿保存／放弃／冲突保护、全局／项目隔离、依赖安装／锁恢复结果、分类与能力限制；中文 16px／英文 18px、深浅主题及默认／窄窗口的卡片对齐。详见 [Pi 规范](../specs/0006-pi-skill-management.md)、[一致性走查](ui-consistency-audit-2026-10-15.md)、[分类及对齐复查](skill-collections-review.md)。这些不是本次重新执行全部桌面流程的声明。
- 未验证：真实 Pi 会话 `/reload` 后调用、其他操作系统、旧版 Pi、真实公网更新及全部桌面失败分支。原生配置读回不等同于 Agent 运行时已经加载技能。
