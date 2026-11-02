# DSH 页面重做：产品参考与方案决策

日期：2026-10-29。状态：参考证据与方案取舍；用户后续批准按设计基线实施，当前实施及验收状态以 [方案第12节](../specs/0012-dsh-settings-native-skills-rebuild.md) 为准。此前无来源支撑的页面草案不作为实施依据。

## 证据范围

- DSH：检查已有固定源码副本 `f3803c96974ad4a94195fb97e5c637e9c2a3afe3` 的 Agent preset、设置壳层及技能组件，并对照当前官方文档。没有启动或操作 DSH Desktop/Web，不将源码审查称为实机观察。
- VS Code：通过浏览器实际查看官方 Profile 编辑器和设置恢复菜单截图，并核对官方操作文档。没有操作安装的 VS Code 或修改其配置。
- Cherry Studio：通过浏览器实际查看官方技能列表及 Add Skill 菜单截图，并核对技能库与 Agent 绑定文档。没有运行 Cherry Studio。
- OpenHands：核对项目官方文档中的 Customize/Settings 职责与 backend 隔离；没有视觉或实机验收证据。

这些项目提供具体交互参考，不代表整个产品已获质量评定，也不决定 DSH 的行为合同。视觉仍遵循本项目 [UI 基线](../design/ui-system.md)。

## 参考与取舍

| 参考 | 已观察或核对的具体做法 | 本项目采用 | 不照搬 |
| --- | --- | --- | --- |
| DSH Agent preset | 名称与描述一起显示；设置页用预设卡片和只读配置入口；内置 cordis 面向用户呈现 Creator；会话选择与默认选择有分别 | 读取预设的实际名称/描述，id 作为次要身份；无法读取时使用原 id，不猜用途；技能提供器状态单独表达 | Skills Space 不切换会话、不更改新任务默认预设；静态管理仍允许查看停用配置，不冒充 Host 运行 roster |
| VS Code Profile | 左侧选择配置对象，右侧展示其内容；当前使用状态有明确标记 | 选择对象和编辑内容分开；始终能识别正在编辑的安装/Profile/预设 | 不新增完整 Profile 管理器，不复制双侧栏，不把管理选择标为运行中配置 |
| VS Code Settings | User/Workspace 明确范围；每个设置有名称和解释；恢复设置归属于具体字段；复杂配置有文件入口 | 清楚描述保存范围；已覆盖状态与恢复动作对应具体设置；高级项保留准确解释和配置文件入口 | DSH 没有相应项目覆盖合同，不能复制 Workspace 可写设置；不能用逐字段恢复假装消除完整父覆盖 |
| Cherry Studio Skills | 技能列表保留名称、摘要、来源；添加入口集中来源动作；库管理和 Agent 使用分别组织 | 沿用 Skills Space 现有列表/详情，添加目录与创建技能保持清楚区别；次要操作收进更多菜单 | 不复制卡片开关、Try now 或 Agent 绑定；DSH 调用策略修改文件，不是该产品的全局/Agent 启用状态 |
| OpenHands | Customize 管技能能力，Settings 管运行行为；配置属于指定 backend，安装后明确会话使用条件 | 原生页管理技能文件，DSH 设置页管理发现配置；按所属安装显示配置，反馈实际生效条件 | 不搬来 backend 导航、插件页或新会话按钮，不把其他项目的加载时机当作 DSH 行为 |

## 建议页面与任务流程

### 设置页

1. 页头保留共享返回/刷新。其下展示“正在编辑”的配置身份和“更换配置”入口。身份不等于正在运行的 DSH 会话。
2. 更换配置使用现有任务 Modal：安装、Profile、预设分别有可见标签；预设展示实际名称、简短描述及次要 id；仅存在多个提供器时选择提供器。单一选项静态显示。停用/未知状态针对具体提供器描述，不能宣称 Agent 停用。
3. 主区域为技能目录和自动发现文件变化。附加目录沿用同一草稿和保存动作；实际扫描位置与草稿关联，未保存时明确为保存后位置。项目入口也明确这些是 Profile 设置，不生成伪项目配置。
4. 用户后续收敛要求：设置页仅管理技能目录，移除监听开关及参数入口。目录直接显示与修改实际 skills 路径；底层目录请求仅更改目录字段，保留原始监听值、表达式和缺省状态。原监听调优草案已撤回，不作为实施依据。
5. 恢复操作按实际对象区分技能默认值与完整用户覆盖；能安全局部恢复的设置无需牵连其他设置，完整父覆盖的移除仍需独立影响确认。首次物化完整父覆盖的影响在提交前明确，保留原有表达式/未知字段保护。
6. 只读原因跟随具体字段或配置对象；普通来源和文件入口放次要位置。避免整页铺满技术说明。

### 原生技能页

1. 全局/项目原生页沿用既有布局，配置摘要与设置共用可读身份；选择只改变当前管理清单。
2. 创建技能只进入当前启用独立目录，添加已有内容通过管理技能目录；停用、动态根未知、只有共享根分别解释，不能统一建议添加目录。
3. 从原生页进入目录设置携带配置及返回位置。保存并返回原列表后刷新同一上下文，保留仍有效的筛选；切换上下文时清除旧上下文选择。
4. 详情解释实际文件级调用策略与影响范围；不新增 Agent 专属开关。托管/共享/打包内容继续按原动作资格保护。
5. 批量准备逐项记录可继续的文件失败；配置上下文失效则停止相关写入。合并显示可执行/排除及结果，避免一项普通准备错误导致整批无对象错误。

## 确认后的实施边界

先实现上述完整流程并集中审查，再修复合并发现的问题。复用有效功能证据，只针对本次身份投影、目录草稿、依赖状态、返回路径和批量准备变化补必要验证；不扩大到插件、完整 preset 编辑或个人环境适配。用户已批准按设计基线实施；本参考记录本身不构成验收通过结论。

## 官方资料与可直接查看的界面

- [DSH Agent preset 页面与交互](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-agent-preset/README.md)
- [DSH 预设选择器源码](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-agent-preset/src/client/AgentPresetSeat.tsx)
- [DSH 设置表单边界](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/settings/settings/README.md)
- [DSH 文件技能发现与监听](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md)
- [VS Code Profile 文档](https://code.visualstudio.com/docs/configure/profiles)、[官方界面截图](https://code.visualstudio.com/assets/docs/configure/profiles/profiles-editor.png)
- [VS Code Settings 文档](https://code.visualstudio.com/docs/configure/settings)、[逐项恢复菜单截图](https://code.visualstudio.com/assets/docs/configure/settings/more-actions-context-menu.png)
- [Cherry Studio Skills 文档](https://www.cherryai.com/docs/en/advanced-basic/extensions/skills/)、[列表与添加菜单截图](https://www.cherryai.com/docs/content-assets/bb8edf2ad1dc4b75c6895787.webp)
- [OpenHands Customize 与 Settings](https://github.com/OpenHands/docs/blob/main/openhands/usage/agent-canvas/customize-and-settings.mdx)
