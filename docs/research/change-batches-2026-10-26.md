# Skills Space 未提交改动整理与本地提交批次

日期：2026-10-26。起点：`535a985`。用户授权整理全部现有修改并分批本地提交；不推送远端。

## 修改范围

1. **开发约束与审查角色**：设计基线作为验收条件，实施后的测试覆盖和 UI 审查角色、隔离验证与构建顺序。
2. **统一界面基线**：Codex 配色与默认字体、共享按钮／卡片／菜单／开关／弹窗、侧栏和指针、设置与列表布局、已批准的独立设计参考页。
3. **技能文档与反馈**：Markdown 安全渲染、Shiki 代码高亮、标题锚点、差异重读与错误反馈、共享通知和结果文案。
4. **原版运行时与生命周期**：固定原版 skills 1.7.4、资源 staging、版本检查、安装进度、项目来源与依赖检查、同步和恢复；保留原版执行、锁和受控字段写入，包含 Codex、Pi、DSH、Hermes 的原生适配及测试。
5. **Codex 管理**：技能／插件／市场的数据与权限接口、全局与项目覆盖、发现分类、图标和详情、市场操作、独立授权入口及设置；其账号能力与限制仍以对应规格的实际验证记录为准。
6. **Pi 管理**：1.4.0 适配、npm／Git／本地包、整包及管理页单技能启停、批量操作、项目继承、真实技能文档跳转、菜单请求复用与失效处理。
7. **应用接线与项目流程**：统一入口和客户端契约、各 Agent 页面接线、版本设置、项目导入／依赖／恢复结果和测试会话交互。
8. **文档闭环**：规格、能力计划、研究记录和入口索引与实际实现及验证边界同步。

## 提交顺序

| 批次 | 提交主题 | 内容 |
| --- | --- | --- |
| 1 | `chore(dev): enforce design acceptance and post-implementation reviews` | 项目规则、两个审查角色、本机／生成文件排除规则 |
| 2 | `feat(ui): apply the Codex design baseline across shared surfaces` | 主题、通用组件、布局、设计参考页与界面规范 |
| 3 | `feat(markdown): render highlighted skill documents and unify feedback` | Markdown／代码高亮、差异视图、反馈及对应依赖 |
| 4 | `feat(runtime): align native Agent lifecycles with upstream skills 1.7.4` | 原版 CLI 固定版本、原生模块／命令注册、脚本与原生回归 |
| 5 | `feat(codex): add scoped skill plugin and marketplace management` | Codex 客户端契约、组件／hooks、测试和调研 |
| 6 | `feat(pi): add package management batch controls and session caching` | Pi 客户端、管理页面、菜单缓存和请求回归 |
| 7 | `feat(app): integrate Agent management and project lifecycle workflows` | 共享 App 入口、版本／项目流程接线及组件请求回归 |
| 8 | `docs: reconcile capability plans research and verification records` | 汇总规格、路线图、文档索引及本记录 |

共享入口与跨 Agent 类型存在依赖，按依赖顺序提交模块，最后统一接线。`package.json` 和锁文件按 Shiki、原版 CLI、Codex 测试命令分别暂存；不改写最终工作区内容。

## 验证与限制

- 完整改动集的最新严格前端构建、正常／默认 QA／窄窗 QA 打包，以及原生编译结果复用；本次整理未引入功能变化；仅清除了设计参考页一个多余的文件末尾空行，并再次执行前端构建。
- 最近 Pi 组件请求计数回归、真实继承元数据与读取目标检查、隔离应用的菜单／语言／项目覆盖／失败重试观察，见 [规格 0006](../specs/0006-pi-skill-management.md)。
- Codex 能力与独立授权的验证记录见 [规格 0010](../specs/0010-codex-skill-plugin-management.md)；未用现有登录验证的操作、未实看的账号页面不因提交而变成“已通过”。
- 暂存前检查文件集合、导入／原生模块与 staging 依赖、差异空白问题和凭据字面量；不读取现有凭据。
- 验证对象是完整改动集；未逐个检出中间提交重跑完整构建或全套测试。不将提交完成等同于全项目功能或视觉验收。

## 保留在本机的内容

`.pi/settings.json` 未读取、未提交；`tsconfig.tsbuildinfo`、`tsconfig.node.tsbuildinfo`、`vite.config.js`、`vite.config.d.ts` 为生成物，未提交。以上文件仅新增精确 Git 忽略规则，没有删除。

`.scratch/` 中的隔离 HOME、测试应用、临时清单和原有依赖缓存继续保持 Git 忽略。未推送、未修改现有登录或用户安装命令。
