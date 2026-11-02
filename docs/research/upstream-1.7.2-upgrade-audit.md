# skills 1.5.20 → 1.7.2 升级差异审计

日期：2026-10-13。对象：npm 官方 skills@1.7.2，发布提交 671e8c320810d36fed80fac5f1a2c1bf7e82d812。当前应用版本与包内资源以 1.7.2 为准；1.5.20 的原有证据保留在[历史记录](../archive/upstream-1.5.20-integration-history.md)，不冒用为新版验收。实际验收结果见[计划 0004](../specs/0004-upstream-capability-completion-plan.md)。

核对依据：[官方发布](https://github.com/vercel-labs/skills/releases/tag/v1.7.2)、[固定标签源码](https://github.com/vercel-labs/skills/tree/v1.7.2)、[npm 固定版本元数据](https://registry.npmjs.org/skills/1.7.2)及安装包原始 dist 解析器。没有以 README 帮助文字替代实际参数与副作用核查。

| 差异 | 本轮处理 | 后续能力 |
| --- | --- | --- |
| Node 仍要求 >=22.20.0；上游增加 tar 运行时依赖 | 保留官方 Node 22.20.0；完整打包原版发布文件及 yaml/tar 的依赖树，CLI 不修改。tar 及其传递依赖为上游解压所需，不是自有安装器依赖 | 随上游升级复查依赖/许可证与字节一致性 |
| Agent 75 → 79，新增 fx/MiniMax Code/Posit Assistant/Sarvam Code | 从新版表提取路径、检测线索；补充新版辅助检测函数和 SARVAM_HOME；原有 UI/品牌图标结构不变 | 新 Agent 真实软件加载验收 |
| Pi、Droid、Kilo 转向通用共享区；Codex 全局声明改为 ~/.agents/skills | 跟随原版路径；卸载影响按物理共享关系重新核验；独立安装测试改用仍有独立目录的 Hermes | 不自动迁移或清理用户旧目录 |
| 单一安装区与纯 Eve 安装强制复制 | 既有安装选择与确认文案显示真实方式，原版负责执行 | 不把选中链接控件误当作 CLI 最终行为 |
| 卸载新增按锁 source 选择、-s/--skill 与通配符解析；剩余 Agent 使用时保留锁 | 保持逐技能明确计划；来源记录保留/清理按新版观察，保留记录需与计划前一致，不能将任意残留判成功 | 来源批量卸载优先接入；通配符须有完整确认清单 |
| add 新增 --json（需 --yes，well-known 尚不支持） | 当前实际文件/锁核验仍有效，不解析终端文案判断成功 | 可接入原版结构化结果辅助诊断，继续保留实际状态核验 |
| BOM 文档解析修复；local 全局锁；项目 local source 可移植相对路径；原型键锁修复 | 只读解析接受 BOM；保留上游 local 锁语义；测试真实安装/卸载 constructor 名称；恢复按项目解析相对来源 | 扩展本地来源刷新/来源管理时复用锁语义 |
| Eve formatter 保留 name/description/license/compatibility/version/metadata，改用 YAML stringify | 原版只读 formatter 绑定 stringify，内容签名与界面说明同步；嵌套文档按各自名称核验 | Eve 依赖/锁恢复仍需专门计划 |
| use 新增 sarvam-code，移除 OpenClaw 专用风险参数 | 原版表派生三个执行命令，按绝对可执行路径启动；不再传已删除参数或显示旧确认项；原版权限语义保持 | 真实认证任务及其他平台专项验收 |
| sync 改为直接依赖，读 dev/optional/peer 与 skills npm/Git 声明；新增 dist/skills 路径 | 旧自有扫描移除，改用只读原版 discoverNodeModuleSkills；root 优先/去重/声明语义跟随原版；扫描警告、限额或冲突阻止不完整计划 | Git 声明、工作区递归及 include/exclude 全计划接入 |
| sync 默认链接 node_modules、清理失效技能；--force 被移除，不再按锁哈希跳过 | 现有向导显式 --copy --no-cleanup --no-remote；移除 force 控件及旧跳过承诺；独立复制只核验所选目录，共享区未选时保留 | 链接/复制选择 → 递归/筛选 → 远程声明 → 失效清理，删除必须逐路径确认 |
| experimental_install 改用原版 installFromSource，转发新版 sync 参数 | 恢复继续调用原版整单命令；node_modules 部分使用相同显式副作用边界，缺失目标可恢复 | 插件/Eve/provider 锁恢复逐类接入 |
| 新增 hosted artifact/direct download 与 Azure Repos 解析；私有 Git 增强认证回退 | 原解析器随版本升级；未能完整预览的新类型继续拒绝，不错当 Git 仓库，不另写下载安装器；正常认证由原 CLI 持有 | 直接下载优先，随后 Azure Repos path/ref 与真实私有认证验收 |
| well-known 新增 sourceBaseUrl/wellKnownDigest 与原版检查/更新/来源消失清理 | 现有索引安装/重装/卸载适配保留；ZIP 读取绑定原版 CRC/安全解析，网络 timeout 对象完整提供 | 优先补齐摘要检查/更新和删除确认，再恢复下载来源锁 |
| 更新增强 ref/锁路径、源文件消失处理及认证回退 | 重跑 Git 变更、全局/项目、来源过滤、内部/插件/Eve 更新与非目标保留；不承诺单 Agent 更新 | 源技能消失的显式删除流程、well-known 更新单独接入 |

## 新版后续顺序

1. 直接下载来源完整预览/安装/临时使用及结果核验，复用现有向导。
2. 按锁来源批量卸载，展开到现有逐技能、逐路径确认。
3. well-known 摘要检查、更新与来源消失确认，再补下载锁恢复。
4. 依赖同步链接/复制、workspace 递归和筛选、Git 声明、失效项清理；每种扩大写入/删除范围都先完成只读计划。
5. Azure Repos 与私有认证专项，Eve/插件恢复组合及跨平台验收。

普通 GUI 不加入执行层归属、版本宣传或未来远程规划文案。本轮不迁移用户旧目录、不修改真实技能、不调用重型技能或子 Agent。

## 四项新版能力后续交付（2026-10-13）

上表“本轮处理”描述升级阶段，不替代后续能力状态。直接下载、按精确锁来源卸载、well-known 摘要检查／更新／来源移除提示，以及新版 sync 选项已接入原有流程；当前接口和限制以[命令映射](upstream-command-map.md)为准，验证记录见[计划 0004](../specs/0004-upstream-capability-completion-plan.md)。下载来源锁恢复、Azure Repos／私有认证专项、Eve 同步／恢复组合及跨平台验证仍未完成。
