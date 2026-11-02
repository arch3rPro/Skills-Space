# Codex 市场升级行为核实（2026-10-23）

本记录响应用户指出“App 的市场升级并不是全部插件应用更新”。研究对象为官方公开能力和通用适配；本机安装包仅作只读验证样本，不作为生产版本或路径绑定。

## 结论

先前“市场升级会更新全部插件”的表述过宽，应修正为：刷新选定/已配置 Git 市场快照，并可能刷新这些已升级市场内的**已配置插件缓存**。不等于更新全应用所有插件，也不会因此安装目录中全部可安装插件。停用的配置项也可能属于已配置插件集合。公网云端插件安装与本地市场不是同一范围。

当前官方实现的 App Server 与 CLI 使用同一核心升级方法；因此也不能把市场升级描述为保证只读目录、不影响插件文件。完全相同的内容不一定产生用户可见变化。

## 证据

官方源码固定提交：`8531184b49bcb160175a84e140b659a83a426df7`。

- [官方文档](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli)：`marketplace add/list/upgrade/remove`；传市场名限定该市场，不传则处理已配置 Git 市场。文档明确市场刷新可安装/刷新配置插件的文件，即使插件 `enabled = false`。
- [CLI marketplace_cmd.rs](https://github.com/openai/codex/blob/8531184b49bcb160175a84e140b659a83a426df7/codex-rs/cli/src/marketplace_cmd.rs#L367)：`run_upgrade` 调用 `upgrade_configured_marketplaces_for_config`。
- [App Server marketplace_processor.rs](https://github.com/openai/codex/blob/8531184b49bcb160175a84e140b659a83a426df7/codex-rs/app-server/src/request_processors/marketplace_processor.rs#L68)：`marketplace_upgrade_response_inner` 调用同一方法，并清理相关技能/MCP/Hook 运行缓存。
- [核心 manager.rs](https://github.com/openai/codex/blob/8531184b49bcb160175a84e140b659a83a426df7/codex-rs/core-plugins/src/manager.rs#L2965)：先升级市场，再取 `configured_plugins_from_stack`，对 `upgraded_roots` 调用 `refresh_non_curated_plugin_cache_force_reinstall_detailed`。这些限定不能省略为“所有插件”。
- 本机 App 静态资源只读样本：插件设置页的升级逻辑发送 `marketplace/upgrade`，参数为所选市场名或 null，成功后失效相关查询。该样本不涉及用户账号文件，不成为应用集成接口或运行时判断依据。
- 项目原有隔离测试 `native_config_and_local_plugin_round_trip` 只证明一个配置插件的内容会随原生命令升级，不能推导 App 全部插件都会升级。本轮新增测试证明 Git `ref` 和稀疏路径注册能真实读回；新市场引用也被插件来源检查遵循。

## 原调研批次产品边界（升级已于 2026-10-25 获单独授权）

用户批准新增市场管理：查看实际发现/配置的本地市场、添加本地目录或公开 Git 市场（含引用、稀疏路径）、移除可管理的用户市场。延续原版 CLI 生命周期，不写自己的市场注册库，不请求全量远程目录，不读取账号或凭据。

原调研批次没有新增市场升级按钮：当时只批准调研该操作，没有授权将可能联动插件缓存的升级接入该批次。现有单插件检查/整包更新保留。后续如接入升级，应明确其实际影响，不能把 `upgrade` 伪装为刷新列表，也不复用受限实验 RPC 作为生产接口。

市场移除通过原版 CLI 取消注册并清除对应市场快照；不卸载插件缓存、不删除技能规则或原始本地市场目录。来自被移除来源的插件可能无法加载/检查更新，因此移除确认保留这项实际后果。系统/项目/默认目录来源不得伪装为用户可移除项。


## 2026-10-25 当前安装包复核

重新只读核对当前安装包静态资源（未操作官方 App，也未执行真实升级）：`plugins-settings-68ac19a2b7aa.js` 的市场页使用 `configuredGitMarketplaceNames` 决定升级资格；市场按钮回调传递真实 `marketplaceName` 和显示名。内置提供方说明为自动更新；非 Git 本地目录没有升级资格。用户添加标签不是资格来源，本应用本轮已移除该标签，实际市场注册和操作权限保持独立。

`app-initial-fc48ea5ad55c.js` 的 `_5r` 调用 `marketplace/upgrade`，参数 `{marketplaceName: name ?? null}`。返回后重读/失效相关插件查询；返回 errors 非空时报告失败，不把 RPC 成功当作全部市场成功。未发现市场页另行调用只读“检查版本→再升级”的两阶段接口；不能将插件页的刷新、应用自身检查更新或本应用的单插件源码比较混成同一个行为。

本轮重新打开 [官方插件打包文档](https://developers.openai.com/plugins/build/plugins)，确认命令区分 list/upgrade/remove，且市场刷新可能安装或刷新已配置插件文件，enabled=false 也不例外。范围仍是市场与其中配置插件，不代表更新所有账号服务插件。本轮只核实该行为，不新增市场升级按钮。


## 2026-10-25 单市场升级接入

用户现已明确授权接入市场升级。现有市场列表按原版 CLI 的 upgrade --json 支持情况、有效配置中的 Git 来源与非提供方身份计算 canUpgrade；不继承移除权限，不以 User-added 标签判断。仅在具备能力的行显示带图标的“升级”按钮，不添加禁用说明按钮，也不提供本轮未请求的批量升级。

确认复用现有 AlertDialog：展示市场名、来源，以及刷新市场和配置插件文件（包括停用插件）、运行会话可能需要重开的实际影响。执行时回读资格、来源、引用和稀疏路径；命令固定为原版 `codex plugin marketplace upgrade <name> --json`，不省略 name。继续使用临时 HOME 和 ephemeral 凭据配置，隔离 Git helper、hooks 与用户 Git 配置。

检查结构化 selectedMarketplaces、upgradedRoots、errors；只有命中单个已确认市场且没有错误才报告成功，未变更的修订也可正常完成。成功回读市场并刷新插件；失败保留原始错误、当前市场状态和确认框重试，不自动重复写操作或宣称回滚。

资格/结果针对用例通过；原版 CLI 的隔离 Git 升级已验证配置停用的插件也刷新文件，启停与技能规则保留，重复升级可完成，过期来源在执行前拒绝。打包界面核对结果见 spec 0010 后续记录。


最终构建与界面核对通过：隔离 App 只有配置 Git 市场提供升级，实际来源冲突错误可展开，恢复夹具后重试完成；最终版本取消时返回列表，没有移除标题闪变。真实 App 已加载新构建，仅只读确认 ArkSpace 与 mattpocock 的升级入口；未升级真实市场。两项相关原生用例和前端/Tauri 构建通过，未运行无关整组测试，未提交代码。
