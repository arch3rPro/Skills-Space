# Codex 插件压缩包：官方上传与本地导入能力核查

日期：2026-10-24。范围：仅调研，不修改产品代码、真实插件、账号状态或现有凭据；没有发起授权或上传用户文件。

## 结论

1. 截图中的“上传插件压缩包”确有原版实现，但它是**账号服务中的插件创建/重传**，不是本地原版 CLI 的 ZIP 安装命令。客户端上传到账号服务后拿到 `plugin_id`，本身不等同于本机插件已安装。
2. 当前原版 CLI 0.162.1 和 App 内嵌 0.164.0-alpha.11.1 **不直接接受本地 ZIP 作为安装源**。App Server `PluginInstallParams` 也没有 ZIP、archivePath 或 file_id 参数。
3. **本地压缩包导入可以实现**：由应用在自有来源目录中解压和验证包，以普通用户市场形式交给原版 CLI 注册、安装、回读和卸载。生成的最小 ZIP 在两个原版运行端均已完成隔离验证。这个功能应准确称为“导入插件压缩包”，不能把本地解压说成上传到 Codex 账号。
4. 账号服务上传的独立授权接入**尚未验证**。已找到真实端点和权限判断，不意味着 Skills Space 的独立授权 token 一定被服务接受。现有 `api.connectors.read/invoke` 授权也不能据此推断包含插件创作/上传权限。

## 原版 App 的实际上传调用链

从当前已安装 App 的公开静态资源提取以下模块，没有启动或自动化官方 App。静态副本位于 `.scratch/plugin-archive-research/`。

| 环节 | 原版行为 | 主证据 |
| --- | --- | --- |
| 菜单入口 | 只有 `canUploadArchive` 为真时添加 archive 菜单项；原文明确标为 hosted plugin archive upload dialog | `hosted-plugin-creation-actions-fdea0d2be668.js` |
| 文件选择 | 单文件、拖放或文件选择；扩展名 `.zip`、`.tar.gz`、`.tgz`；最大 `104857600` 字节 | `create-dialog-a06c1ed090f5.js`、`api-5e5e78e3f83d.js` 的校验函数 `d` |
| 准备上传 | POST `/public/plugins/workspace/upload-url`；请求为 `{filename,mime_type,size_bytes,plugin_id?}`；带 `ChatGPT-Account-Id` 和 `surface: plugin_management` | `api-5e5e78e3f83d.js` 的 `g` |
| 上传文件 | 使用返回的 `file_id`、`upload_url`，通过 `uploadChatGptFileBytes` 上传字节；必须拿到 `etag`；签名 URL 上传返回 403 时最多重新申请一次 URL | 同上 |
| 创建插件 | POST `/public/plugins/workspace`，body 为 `{file_id,etag}`；返回 `plugin_id` | 同模块的 `h`，由创建弹窗 `We(accountId,file)` 调用 |
| 重传已创建插件 | POST `/public/plugins/workspace/{plugin_id}`，body 同上 | 同模块的 `m` |
| 下载账号插件 | GET `/ps/plugins/{id}/archive`，下载文件名 `plugin.zip` | 同模块的 `_` |

这套 UI 的格式和体积检查不代表压缩包结构已通过服务端验证。没有用账号端点提交测试包，不能宣称任意 ZIP、MCP 或 hooks 都能上传成功。

### 权限是账号能力，不是文件选择权限

`create-permissions-1f878e45d751.js` 的 `canUploadArchive` 同时要求当前账号匹配、功能开关和允许创作；工作区还叠加上传开关及 `chatgpt.workspace_plugins.upload` 的 RBAC 判断。`permissions-428e26439e48.js` 将个人账号和工作区账号的创作条件分开处理。因此不能无条件复制上传按钮，也不能一概宣称所有非管理员都不能上传。

上传到账号、重传自己的账号插件、公开目录发布是不同动作。公开发布还有单独的开发者身份、组织/项目权限和审核规则；不能用发布门户的约束冒充本菜单的全部私有上传契约。

## 当前原版本地接口

两个版本的实际 `codex plugin --help` 只有 `add/list/marketplace/remove`；`plugin add` 接受 `PLUGIN@MARKETPLACE` 或 `PLUGIN --marketplace NAME`，没有 ZIP 入参。

App 内嵌原版在新建临时 HOME/CODEX_HOME 中即时生成的 schema：

```text
PluginInstallParams:
  pluginName (required)
  marketplacePath?
  remoteMarketplaceName?
  installAttemptId?
```

没有生成插件 ZIP/import/upload 参数类型。此项说明当前可见的原版 App Server 安装接口不能直接接收压缩包，不是对未来版本的判断。即时 schema 副本：`.scratch/plugin-archive-research/live-PluginInstallParams.json`；完整已缓存请求接口索引：`.scratch/plugin-permissions/app-schema/ClientRequest.json` 的 `plugin/*` 方法。

## 隔离验证结果

脚本：`.scratch/plugin-archive-research/local-archive-probe.py`。结果：`.scratch/plugin-archive-research/local-archive-results.json`。每个运行端使用新建临时 HOME、CODEX_HOME 和生成的纯技能包；不启动 MCP、不调用模型、不读取原有账号文件。

| 验证 | 0.162.1 | 0.164.0-alpha.11.1 |
| --- | --- | --- |
| `plugin add /path/demo.zip --json` | 拒绝：需要市场选择器 | 同左 |
| `plugin marketplace add /path/demo.zip --json` | 拒绝：本地市场来源必须是目录 | 同左 |
| 解压到本地来源 + 生成普通市场清单 + 原版注册 | 通过 | 通过 |
| 原版安装，JSON 回读为 installed，缓存存在 SKILL.md | 通过 | 通过 |
| 原版卸载移除缓存、保留解压后的来源 | 通过 | 通过 |
| 生成 auth.json | 没有 | 没有 |

这只证明“受控解压后的合法插件能够交由原版管理”，没有验证恶意/加密/超大 ZIP，也没有完成产品级导入功能。

### 本地导入的实施边界

- 用户选择的 archive 需按本地导入说明处理，不能自动发送给账号服务。
- 解压位置必须是应用管理的持久来源目录；不能安装后删除临时目录，却留下市场注册指向失效来源。
- 解压、路径/文件类型/体积和插件根目录验证属于原生层。安装、卸载和注册仍由原版 CLI/运行端执行；不直接写安装缓存。
- 压缩包中的同名插件、来源归属及持久市场清单需要沿用现有确认和原版身份规则。探针使用 `skills-space-imports` 只是证明普通市场路径可行，不代表已批准该产品存储/市场命名方案。
- 若用户要求完全复刻截图的“上传”，应继续验证独立授权、账号上传权限、服务端创建与回读；验证前不得把本地导入包装成已接入官方上传。

## 公开官方资料的边界

- [Package your plugin](https://developers.openai.com/plugins/build/plugins)：插件打包及用户市场、工作区发布是不同分发路径。
- [Plugin submission errors](https://developers.openai.com/plugins/deploy/submission-errors)：公开发布门户列出了 ZIP 路径、根目录、格式和大小等结构验证规则，可作为安全导入设计参考；它不是上述私有账号上传端点的完整契约。
- [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission)：公开目录上传与发布需要开发者/组织权限和审核，不等同于私有插件上传或本地安装。

本次仅新增本调研文档和可丢弃的隔离证据，没有运行应用测试套件或构建，没有上传账号文件或操作用户真实插件。
