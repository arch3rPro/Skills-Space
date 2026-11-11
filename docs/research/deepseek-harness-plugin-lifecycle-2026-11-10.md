# DeepSeek Harness 插件机制与 Skills Space 伴随插件生命周期

日期为 2026-11-10。本记录核对官方发行源码、参考项目实际发布包和 Skills Space 当前实现，供后续方案评审。

## 证据基线

- 官方源码固定到 `release(dsh): 0.2.2-rc.1` 提交 `2f97f60455605e915b8176d9170cae337bfedcc6`。npm 上同版本的 `@deepseek-ai/dsh` 包未提供 `gitHead`，因此以发行提交作为源码基准。本机 Desktop 提供的 `dsh --version` 为 `0.2.2-rc.1`，随附 Node `24.21.0` 和 pnpm `11.28.5`。只读检查 Desktop ASAR 确认宿主管理器具有包清单、启停、安装、更新、卸载接口，Client 有配置和启用引导槽位。[官方发行提交](https://github.com/deepseek-ai/deepseek-harness/commit/2f97f60455605e915b8176d9170cae337bfedcc6) · [npm 发行元数据](https://registry.npmjs.org/@deepseek-ai%2fdsh/0.2.2-rc.1)
- 参考项目固定到 `v1.4.0`、提交 `5574f8b05cf5678a310b9af6c693bcf290cbd4df`。npm 元数据的 `gitHead` 一致，下载包的 SHA-512 符合 `dist.integrity`，其中 `package.json`、Host/Client 入口和旧更新器与标签内容逐字节一致。[GitHub Release](https://github.com/MichengAI/dsh-skills-manager/releases/tag/v1.4.0) · [npm 发行元数据](https://registry.npmjs.org/@michengai%2fdsh-skills-manager/1.4.0)

## 官方插件机制

| 层次 | 开发和运行合同 |
| --- | --- |
| Cordis 插件 | 模块提供 `apply(ctx, config)`，可声明依赖和配置 schema。将 provider、订阅、工具、路由等注册绑定到 `ctx.effect`，返回 disposer 供停用、重组和退出时释放。一个 bundle 可以组合多个这样的条目。[首个插件](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/docs/cordis-tutorial/01-first-plugin.md#L5-L51) · [扩展接口](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/docs/cookbook/extension-cookbook.md#L110-L132) |
| Bundle / Profile | npm 包的 `dsh.bundle.patch` 声明一个或多个有序补丁，Profile 依次组合选中的 bundle、自己的 `cordis.patch.yml`、`DSH_HOME` 层和启动参数补丁。包依赖、bundle 选中和条目实际加载是三个事实。Web 可通过 `--dump-config` 看组合声明，该命令会初始化缺失的 Profile，应用与测试应使用已知目标或隔离 HOME。[启动合同](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/boot/app-boot/README.md#L48-L60) · [组合检查](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/apps/cli/reference/README.md#L46-L58) |
| Host / Client | Host 代码在宿主进程执行。需要宿主 UI 的插件另声明 `dsh.client` 和 `./client` 浏览器入口，配置入口注册 `plugins.bundle.config`，条目配置注册 `plugins.row.config`。`plugins.bundle.activation` 是用户显式启用后的可选引导，槽位回调负责展示与导航。权限和动作仍由 Host 管理。[包开发](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/docs/cookbook/adding-a-package.md#L29-L44) · [配置槽位](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/client/ui-plugin-manager/README.md#L87-L99) · [启用引导槽位](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/client/ui-plugin-manager/README.md#L149-L155) |
| 兼容和安全 | `engines.dsh` 优先决定 DSH SemVer 兼容性，未声明时检查 DSH peers；Host 平台可以另用 `dsh.bundle.platforms` 限制。Host 插件在 Agent 工作区沙箱外运行，依赖构建脚本批准是单独的授权。浏览器端通过已认证的 Connection 进入 Host，路由按 Peer 和请求信任规则分发，额外业务校验仍由插件负责。[兼容规则](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/boot/app-boot/README.md#L50-L58) · [权限与安装审批](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/boot/plugin-manager/README.md#L29-L33) · [Connection 请求信任](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/client/connection/README.md#L38-L53) |

### 宿主生命周期的实际边界

- 运行中从侧栏「插件」进入管理。`listBundles` 区分来源、包是否存在、保存的选中状态与加载错误；bundle 开关只改 `dsh.profile.bundles`，条目开关写 Profile 补丁的 `disabled`。HOME 和启动参数能覆盖 Profile；preset 内部条目保持只读。关闭 bundle 保留依赖，重新开启会将其追加到选中列表末尾，可能改变优先级。[管理器合同](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/boot/plugin-manager/README.md#L29-L50)
- 安装和卸载由宿主的包管理路径执行。CLI `dsh plugin --profile <name> add <spec>` 和 `remove <package>` 调用 pnpm 并重算 bundle 选择。Desktop 的保留 Profile 在运行中走原生插件中心，离线则由 Desktop 随附的原版 CLI 在应用退出后管理；普通 npm CLI 无此所有权。这里的 CLI 转发 `pnpm update` 与宿主 `updateBundle` 是不同入口。[CLI 合同](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/apps/cli/reference/README.md#L81-L95) · [Desktop 所有权](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/apps/desktop/README.md#L140-L146)
- `listVersions` / `updateBundle` 面向以自身包名安装的第三方 registry 依赖，筛选新版本并检查兼容性，拒绝旧版本。本地路径、link、tarball 和 Git 不属于这条 registry 更新路径。HMR 模式的 registry 更新会尝试恢复旧包，恢复也可能失败；无 HMR 的替换需要重启。包写成功、Host 应用成功、Browser 同步成功需要分别读取。失败可能保留已完成步骤，用户需要看到剩余状态。[版本操作](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/boot/plugin-manager/README.md#L48-L60) · [失败和恢复](https://github.com/deepseek-ai/deepseek-harness/blob/2f97f60455605e915b8176d9170cae337bfedcc6/packages/boot/plugin-manager/README.md#L165-L197)

## 参考项目的可复用做法

- **发布物完整。** `@michengai/dsh-skills-manager` 有 Host `lib/index.js`、浏览器 `./client`、bundle patch、图标和本地化元数据。构建分别输出 ESM Host 和宿主 ModuleLoader 浏览器模块，先在暂存目录构建再替换 `lib`。发布工作流校验 Git 标签与包版本、执行兼容性和打包检查，再发 npm 与 GitHub Release。项目列出八个验证过的宿主版本，含 `0.2.2-rc.1`，兼容范围 `>=0.2.0-rc.1 <0.3.0-0` 是其声明范围，本轮没有重跑该矩阵。[manifest](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/package.json#L18-L58) · [构建](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/scripts/build.mjs#L24-L68) · [发布](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/.github/workflows/publish.yml#L17-L53) · [验证矩阵](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/scripts/hosts.mjs#L1-L7)
- **Host 与 Client 通过宿主连接协作。** bundle patch 插入 `skills-manager` Host 条目，Host 注册全局及 Agent scope provider 和经认证的 `connection.fetch` 路由，写操作要求专用头、JSON、来源匹配和工作区验证。Client 注册 `settings.section`、可选 `sidebar.panellist` 和 `plugins.bundle.config`，通过 `document.baseURI` 解析 API，保留反向代理前缀。Skills Space 的文件策略只需要当前 Host wrapper，可复用这种职责划分和发布验证，不必迁入参考项目的技能扫描、面板和文件操作。[Bundle 补丁](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/cordis.patch.yml#L1-L7) · [Host 注册和清理](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/src/index.ts#L343-L355) · [路由与释放](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/src/index.ts#L825-L848) · [请求校验](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/src/index.ts#L84-L123) · [槽位](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/src/sidebar-entry.ts#L319-L346) · [API 基址](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/src/api-base.ts#L15-L40)
- **区分发行说明与真实发布物。** v1.4.0 移除了面板内的插件自更新入口和设置开关，并把用户引导至宿主插件中心。相同发行的 Host 仍注册 `/api/michengai/dsh-skills-manager/update`，实际包内仍包含更新器，符合配置及请求校验的 POST 可以进入安装路径。发布方案可参考宿主管理入口与构建检查，旧更新接口和其包管理回退路径不适合引入伴随插件。[发行说明](https://github.com/MichengAI/dsh-skills-manager/releases/tag/v1.4.0) · [Host 仍注册旧接口](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/src/index.ts#L311-L331) · [更新实现](https://github.com/MichengAI/dsh-skills-manager/blob/5574f8b05cf5678a310b9af6c693bcf290cbd4df/src/plugin-updater.ts#L366-L479)

## Skills Space 的落点与后续验收

现有 `@skills-space/dsh-skill-policy` 为私有本地包 `0.2.0`，使用空 bundle patch。原版 DSH CLI 安装依赖，Skills Space 在确认 Profile 修订后将原 filesystem provider 接上 wrapper。wrapper 保留上游发现、排序、watch 和文档加载，仅限制模型与手动调用。当前检查代码比较插件版本和关键文件字节、覆盖、进程存活和新鲜度、配置 token、策略修订。使用本机 ASAR 的官方 `evaluatePluginCompatibility` 对此 manifest 做只读检查，`0.2.1-rc.5`、`0.2.2-rc.1` 通过，`0.3.0-rc.1` 拒绝。这项结果只覆盖版本准入。[伴随插件说明](../../scripts/dsh-skill-policy/README.md) · [本地 manifest](../../scripts/dsh-skill-policy/package.json) · [安装与应用补丁](../../src-tauri/src/upstream/dsh/policy.rs#L60) · [状态判定](../../scripts/dsh-policy.mjs#L11)

| 阶段 | 建议行为和可观测结果 |
| --- | --- |
| 打包、检测 | 随 Skills Space 分发精确版本的本地包。包来源与内容可核对，保留上一版用于恢复。检测按实际 DSH 安装、HOME、Profile 和受管配置定位，分开显示依赖、补丁和运行确认。 |
| 安装、启用、修复 | 继续用实际宿主的原版 CLI 安装包，补齐 Skills Space 管理的 wrapper 覆盖，验证运行确认。包成功而覆盖失败时重读并续做，运行中有需要时提示重载或重启。空 patch 的 bundle 开关无法独自反转 Profile 内的 wrapper，停用须移除或还原该 wrapper，并确认原 provider 恢复。 |
| 升级、回滚 | 使用精确本地包版本，通过宿主包管理路径替换，确认既有策略兼容、覆盖保持正确和新运行确认。若目标失败且前版仍可用，恢复精确前版与本次改动的受管覆盖，重读实际状态。策略迁移需要明确能否由前版读取，发现冲突时保留诊断与原数据。 |
| 卸载 | 先撤除本 Profile 受管覆盖并验证组合恢复，再用宿主路径移除依赖。检查其他 Profile 引用后再清理源包。保留共享策略作为恢复资料，移除 wrapper 后原 provider 按 DSH 自己的规则运行。卸载失败时展示仍存留的包或补丁，并可按剩余步骤重试。 |

后续以临时 `DSH_HOME` 验收实际安装、配置补丁、重载或重启、调用双通道、同名技能优先级、升级中断、精确回滚、卸载及多 Profile 隔离。Web 和 Desktop 应分别核验其拥有的执行入口。当前仅完成源码、发行包与本机能力的只读核对，未执行生命周期变更、运行插件兼容矩阵或构建 Skills Space。

## Persistent Web development environment (2026-11-11)

Use `pnpm dev:dsh` for companion development. It reuses the existing QA HOME, `skills-space-qa` Profile and projects under `.scratch/dsh-skills-space/p0p1-repair/qa/`; it does not recreate them or change the personal Desktop Profile. The Web address is `http://127.0.0.1:64580`.

- `pnpm dev:dsh start`: start, or report the existing server.
- `pnpm dev:dsh status`: report server status.
- `pnpm dev:dsh update`: build once, pack with a content hash, install into QA, and restart QA if running.
- `pnpm dev:dsh update <archive.tgz>`: install an existing candidate without rebuilding.
- `pnpm dev:dsh restart` / `stop`: restart or stop QA while retaining its data.

The runner binds loopback, uses the installed official DSH CLI, stores PID/logs locally, and checks the recorded process identity before stopping it. It does not forward provider credentials from the development shell. Opening the Web root uses normal browser authorization. Test changes in this environment first; refresh the personal client only for an explicitly requested delivery.
