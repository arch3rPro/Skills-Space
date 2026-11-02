# Pi 代码模式设置设计方案

日期：2026-10-29。状态：按用户确认方案实施；验证记录见第 7 节。

## 1. 最新确认范围

- 删除 Pi 设置中的“内置扩展”管理卡片，包括数量、四项加载控件、折叠控制和对应草稿／读取／保存联动。
- 不设计 MCP 管理，不显示 MCP 自动开启选项，不读取或修改 mcp.json。
- 保留“代码模式”作为独立 Card，紧接“技能加载”Card 下方，二者同级；不是技能加载内部的第二个区域或嵌套卡片。
- 不增加沙箱字段、状态、探测或开关。
- 以官方原生配置为依据，不沿用此前 auto/always 等产品抽象。
- 沿用现有 Pi/Codex 设置的标题、范围选择、Card、Field、控件列、Save 和离开确认，不另做分类栏或页面框架。

此前“保留四项内置扩展管理并增加 MCP 自动开启”的方案被以上范围取代。删除管理界面不等于卸载扩展或重置用户已有 extensions 配置。

## 2. 官方配置依据与控件

兼容依据：本机官方安装包 @earendil-works/pi-coding-agent@1.4.0，并交叉核对官方当前 Codemode、Settings 和 CLI 文档。

| 界面标签 | 原生设置 | 控件／默认值 | 精确含义 |
| --- | --- | --- | --- |
| 启动模式 | defaultTools 中是否选择 codemode | 带图标的 ToggleGroup：默认开启／默认关闭；原生默认关闭 | 新会话启动时加入 codemode 工具；编辑时保留其他工具选择 |
| 调用方式 | codemode.mode | Choice：直接调用（on）／仅脚本调用（only）；默认 on | on 仍允许脚本调用；only 隐藏可由脚本调用的 active direct 工具声明，不只影响内置工具 |
| 工具预算 | codemode.inlineBudget | 数字 Input，默认 3000，单位 token；允许 0 | codemode 描述中内联工具声明的估算预算，不是输出或会话 token 上限；超出的工具仍可搜索 |

codemode 对象本身只有 mode 和 inlineBudget 两个设置。启动模式对应官方 defaultTools 工具选择，不能新增 codemode.enabled、mode=auto/always 等不存在的键。

来源：[官方 Codemode](https://pi.dev/docs/latest/codemode)、[Settings tools](https://pi.dev/docs/latest/settings#tools)、[CLI Enable codemode](https://pi.dev/docs/latest/cli#enable-codemode)。

## 3. 页面结构

```text
Pi 设置标题与现有范围／重新读取控件

[信任此项目]                  仅项目范围，保持原有确认

┌ 技能加载 ─────────────────────────┐
│ 技能命令补全                      │
│ 附加技能目录                      │
└───────────────────────────────────┘

┌ 代码模式 ─────────────────────────┐
│ 启动模式      默认开启／默认关闭 │
│ 调用方式                   Choice │
│ 工具预算          Input token │
└───────────────────────────────────┘

既有检查提示与 Save
```

两个主卡片由同一父容器按顺序排列。代码模式不放入“技能加载”的 CardContent 或内部 section。其标题使用同级 CardHeader/CardTitle，字段使用现有 settings-fields、Field/FieldContent/FieldLabel；常规说明使用标题下的 FieldDescription；仅较长补充说明使用标签侧 HelpPopover，不把技术映射、文件路径和需求背景写成常驻文案。

删除“内置扩展”Card 后，不保留计数、空白占位、管理跳转或另一套折叠列表，也不为 MCP、llama.cpp、tool-search 增加管理入口。其他页面仍使用的 Pi 包／资源管理能力不随该设置卡片一起删除。

## 4. 全局、项目与实际行为

- 使用当前选择的全局或项目信任范围。项目未信任时沿用已有信任行为，不由本功能自动授权。
- 项目 mode 采用现有 Choice 的跟随全局／直接调用／仅脚本调用；项目预算沿用 Codex 预算设置已有的跟随全局／自定义组合。两项撤销覆盖时只移除对应子字段，保留 codemode 的其他成员。
- 启动模式显示原版合并工具选择的有效值，只有用户改动才保存。defaultTools 是列表，不伪造单工具的独立继承存储，也不借“恢复默认”清空整张列表。
- 选择默认关闭只改变启动工具选择，不等同于禁用内置扩展或取消现有 MCP 自动行为；本方案不管理后者。
- 不再提供内置扩展加载 UI，但保留已有 +builtin/-builtin 选择。修改三个参数不自动清除扩展排除或覆盖第三方扩展。确有原版 codemode 被排除的配置时，在现有受影响控件帮助位置说明，不能把保存成功描述成运行工具已激活。
- 工具预算左侧内容固定顶部对齐，切换项目自定义输入不会使标题下移。
- 二选一、下拉选项和相关按钮使用对应图标；沿用“符号链接／文件复制”的分段控件。
- 参数以官方语义重新加载；启动项以新会话启动为准。保留当前保存反馈和草稿保护，不主动启动会话、连接服务器或执行工具。

## 5. 读取、写入与实现边界

- 读取通过兼容安装实例的原版 SettingsManager.fromStorage 在内存中完成全局／项目合并和 defaultTools 解析，不另建一套继承规则，不加载扩展。未能读取原版接口时仅禁用代码模式控件。
- 原版会把空项目 defaultTools 列表追加到已有全局数组。切换此特殊情况时，以原版解析后的当前工具选择修改 codemode，保留其他工具；不误判为空工具集。
- 本功能只写 settings.json 的 defaultTools 中 codemode 选择，以及 codemode.mode、codemode.inlineBudget。保持其他工具、技能规则、目录、包、extensions 和未知字段不变。
- 不访问 mcp.json，不新增 MCP 连接或认证能力；不再为 Pi 设置页面发起仅用于内置扩展列表的 packages 查询。
- 删除 PiManagement 中内置扩展专属 state、草稿、错误区和保存选项；保留其他调用者仍使用的包资源接口，不做无关后端清理。
- 复用现有 revision 校验、原子写入、操作后重读和部分结果错误处理，无须引入双文件事务、配置引擎或额外存储。

## 6. 调研结论保留：内置扩展数量与其他配置

本节只保留已核对的事实，不作为新增管理 UI 的范围。

| 扩展 | 本机及官方注册表数量 | 加载之外的配置／入口 |
| --- | --- | --- |
| llama.cpp | 1 | /login llama.cpp、LLAMA_BASE_URL／LLAMA_API_KEY、/llama 模型管理；没有专属项目 settings 块 |
| codemode | 1 | defaultTools 启动选择、codemode.mode、codemode.inlineBudget |
| tool-search | 1 | defaultTools 的 tool_search 启动选择；query／limit（默认 8）是调用参数，不是持久设置 |
| mcp | 1 | mcp.json 服务器、exposure／toolExposure、超时、autoEnableCodemode 等，本轮不管理 |

总计 4 项。当前 scripts/pi-packages.mjs 从安装实例 dist/extensions/index.js 提取同一清单，再使用原版 DefaultPackageManager 解析。隔离空目录实测返回四项 builtin 资源，均默认 enabled=true；这说明加载配置数量一致，不证明四个扩展实现或它们的工具都在实际会话中激活。第三方替代、命令行参数和项目范围仍可能改变运行结果。

来源：[官方注册表](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/extensions/index.ts)、[Settings resources](https://pi.dev/docs/latest/settings#resources)、[CLI tool search](https://pi.dev/docs/latest/cli#tool-search)、[llama.cpp](https://pi.dev/docs/latest/llama-cpp)、[MCP](https://pi.dev/docs/latest/mcp)。

## 7. 验收与当前状态

实施验收范围：两个同级卡片的顺序、内置扩展管理完全移除、三个控件的原生映射和默认值、全局／项目覆盖、预算 0／3000／非法值、不覆盖其他 defaultTools／extensions／技能规则、未信任项目、并发修改、保存后重读；确认不访问 mcp.json、不显示沙箱、不新增页面框架。

已实现上述界面、读取与字段级保存；保留已有扩展、工具、未知字段与技能规则。前端组件回归通过，覆盖图标、二选一不允许空选、预算 0／非法值、项目撤销覆盖以及无内置扩展查询。原版 Pi 1.4.0 的隔离原生测试已通过全局／项目保存、原版列表合并、陈旧版本拒绝与新实例重读。`pnpm build`、最终 TypeScript/Vite 检查、正常与复用隔离 debug App 构建通过；原生 Pi 测试 16/16 通过（包含原版 1.4.0 测试），`pnpm test:pi` 为 12 项 TypeScript 与 46 项脚本通过，2 项可选原版脚本测试跳过，原版保存由本轮原生测试覆盖。实际隔离 App 观察确认同级卡片顺序、默认开启／关闭选中样式、调用方式和跟随全局的下拉图标、项目跟随全局值。通过 App 保存默认开启／仅脚本调用／预算 0，检查原生配置保留其他工具、extensions 和未知字段；正常退出后重新启动同一隔离 App，读取到同样三项值且 Save 不再启用。截图：`/tmp/pi-codemode-global.png`、`/tmp/pi-codemode-dropdown.png`、`/tmp/pi-codemode-project-dropdown.png`。复用的隔离 App 已退出；未操作个人配置。静态一致性检查通过，未实测英文、深色主题及最小窗口宽度。按用户要求未调用子代理。


### 文案修订（2026-10-29）

调用方式标题下显示“选择模型调用工具的方式。”；帮助中分别说明直接调用与仅脚本调用，以及仅在代码模式开启后生效、不会改变工具安装与启用状态。工具预算标题下显示“控制代码模式中工具说明的长度，单位为 token。”；帮助保留默认值、0 值含义和超出预算仍可搜索使用的说明。项目范围不再单独显示全局预算值，保留跟随全局／自定义控件及固定顶部对齐。

本次文案修订的组件回归、前端构建和正常 debug App 构建通过；未重复配置写入或自动化桌面交互测试。
