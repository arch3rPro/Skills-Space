# Codex 插件作用域与内部运行组件核查

日期：2026-10-25。当前授权：全局管理安装、卸载、更新及默认启停；项目管理本项目启停覆盖；官方账号插件保持账号级。真实插件状态没有作为测试夹具。

## 项目与全局

原版配置读取按 cwd 返回项目层；项目 enabled 覆盖用户默认，项目只在受信任时加载。[官方说明](https://developers.openai.com/plugins/build/plugins#enable-or-disable-a-plugin-for-a-repo)。当前独立 CLI 0.162.1 的 config/value/write 即使传入 filePath 也拒绝项目路径（configLayerReadonly / Only writes to the user config are allowed），不能拿用户层接口冒充项目写入。

项目启停现限定写入当前项目 .codex/config.toml 的单个插件 enabled，恢复继承仅移除 enabled，保留 MCP 设置、注释和其他字段。通过原版层信息核实信任及更高优先级覆盖，读回实际启停；无项目目录时在确认后创建 .codex，再让原版判定信任，失败清理新建空目录。没有自动添加信任。编辑器采用锁文件已有的 toml_edit 0.25.13，避免正则改 TOML 或覆盖无关字段。写入例外与路径边界见 ADR 0005。

项目本地插件不提供安装/卸载/更新和市场变更操作，后端也拒绝这些请求；官方插件的账号级操作保持可用，确认说明影响同一账号的客户端。全局仍使用原版生命周期和用户层启停。卡片不增加状态徽章；作用域及限制放在详情和既有 Tooltip，项目显式覆盖提供恢复继承入口，共用确认框区分账号、项目和用户默认影响。

## codex-app-tools / unified-computer-use

本轮只读核对 /Applications/ChatGPT.app，版本 26.1021.31345（21828）的安装包静态代码，没有读取现有 auth.json、令牌、登录数据库或真实缓存的注入值，没有自动化官方 App UI。

| 对象 | 当前安装包中的职责 |
| --- | --- |
| codex-app-tools | codex_app 本地 MCP，提供桌面应用能力；当前实现要求 App 的通信管道及资源定义，缺少管道时 Uc 返回 missing-pipe |
| unified-computer-use | cua_repl MCP 与会话结束钩子；App 的 ko 根据可用 browser/computer surfaces 注入 Node REPL、后端映射和运行环境 |

静态 src-CTNXdakG.js（共享 renderer 中也有同一描述）将两者列为 openai-bundled 内部组件，hidden=true、installWhenMissing=true。它们不是官方目录里的账号连接插件。当前隐藏行为属于官方 App 展示策略，不等于 CLI 无安装、启停或卸载权限。

main-0FVbxCQU.js 的协调器读取来源清单与已安装状态；Sie 对 missing + installWhenMissing 返回安装理由，对 current 返回不操作，forceInstall 可强制刷新，版本/内容不一致进入修复。协调器调用原版 plugin/install；对原先已安装且 enabled=false 的组件，在修复后调用 Die 的 config/batchWrite 恢复停用。缺失组件会在适用的 App 协调阶段被重新安装，因此“卸载后再次出现”不能单凭缓存或卡片存在判定 CLI 卸载失败。

codex_app 还存在按原版版本能力选择插件级 MCP 配置或旧 mcp_servers 配置的分支。App 注入服务通信/运行参数；CLI 包已安装或 enabled=true，并不证明独立于 App 可用。unified 的 ko 同样根据 surfaces 决定服务 enabled 与工具后端。这里只记录字段/分支，不读取真实通信值。

CLI 管理安装记录、缓存和配置，App 另外管理这两类内部资源的自动安装、版本协调与通信注入。继续按原版策略提供能执行的操作，不因“内置”一概禁用；针对已确认来自规范内置市场的这两个组件，卸载确认说明应用可能在后续启动或同步时重新安装。没有增加卡片标签，也没有清理或删除真实运行组件。

## 已取得的验证

- 独立 CLI 与 App 附带 CLI 的隔离项目夹具通过：项目新建覆盖、切换、恢复继承、用户配置字节不变、另一个项目不受影响、默认变化不覆盖项目显式设置、不受信任项目拒绝、禁止项目卸载。
- 原有全局安装/启停/卸载夹具通过；App 原版 CLI 的两组件运行字段注入/更新/停用保留夹具通过。原版未授权真实账号或真实插件变更没有执行。
- 前端相关权限/上下文/来源用例通过；构建和最终界面结果另记于 spec 0010。

保留边界：官方 App 的实际后台协调没有在真实环境中触发；自动安装/保留停用结论来自当前安装包的明确分支与隔离原版操作，不冒充真实 App 行为验收。具体来源缺失或运行能力关闭时，实际流程仍可能跳过安装。


## 打包窗口核对

隔离 App 中，可信项目只给本地插件提供项目启停及恢复继承，账号插件保留账号动作。实际启用后核对用户配置字节不变；恢复继承移除项目 enabled；覆盖设置经 App 重启后保留。未信任项目不提供本地开关，详情说明真实信任限制。账号插件显示“当前账号”，全局确认说明用户默认，内部组件卸载确认说明可能自动补装。全局确认均取消，没有真实插件变更。真实 App 已正常加载新构建并只读核对 GitHub 的账号范围。

审阅指纹额外绑定规范项目根路径，避免继承状态相同的两个项目复用同一审阅；不改变账号插件的账号级行为。前端、原生与界面结果以 spec 0010 本次增量为准。

## 内部组件展示调整

按用户后续确认，采用官方 hidden 展示策略：规范内置来源的 codex-app-tools 与 unified-computer-use 不再进入全局/项目普通插件列表、搜索、数量和来源选项。保留原版安装记录及运行维护，不卸载、不清缓存，也不新增卡片说明。同名用户市场插件及其他内置插件保持原有展示。此前“保留普通入口并提示自动补装”的展示决定由此替代。

项目页仍展示共用的已安装插件，按当前项目 cwd 读取原版配置及有效启停状态，管理项目覆盖；它不是项目独立安装仓库。账号插件保持账号级。

## 同类组件完整清单核对

再次直接读取当前 App ASAR 的 src-CTNXdakG.js，核对 xe 描述表和 we 隐藏判定函数（仅 openai-bundled，普通管理取 hidden，executor 另取 excludeFromExecutor）。当前表共 15 项；hidden=true 仅 codex-app-tools 和 unified-computer-use，两者 excludeFromExecutor=false，说明管理页隐藏不等于运行执行禁用。

| 描述表类别 | 组件 | 展示含义 |
| --- | --- | --- |
| hidden + installWhenMissing | codex-app-tools、unified-computer-use | 普通管理隐藏；运行仍可使用 |
| installWhenMissing，无 hidden | browser、computer-use、notebook、deep-research、visualize、image-guided-assets | 不因自动维护而隐藏；computer-use 还声明 installWhenMissingRequiresOptIn |
| 已登记但无 installWhenMissing / hidden | chrome-dev、chrome-internal、chrome、messages、record-and-replay、computer-history、latex | 不能仅凭登记推断自动安装或隐藏 |

这些是当前包的组件声明，不代表每个用户都已安装，或每个平台/功能开关都允许实际安装。组件协调器还有适用条件，不能把描述表中的自动安装声明当成无条件执行。其他运行环境市场提供的文档、表格等插件不因内置来源被并入隐藏范围。

最终构建的真实窗口只读核对：全局与 Skills-Space 项目均为 18 个普通已安装插件，两个隐藏内部组件均不出现，分别搜索其名称也无匹配。项目本地卡片不提供卸载/更新；ArkSpace 详情为“当前项目 / 继承设置”，GitHub 详情为“当前账号”。清空核对用搜索后恢复项目插件列表；未变更真实插件或读取现有凭据。18 是本次观察值，不是固定插件总数。
