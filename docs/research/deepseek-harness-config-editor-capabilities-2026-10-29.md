# DeepSeek Harness 配置文件图形化管理可行性

日期：2026-10-29。状态：调研与建议，未实施功能、未写用户配置、未启动 DSH 或调用 RPC。本文补充[配置所有者与管理面证据](deepseek-harness-surfaces-evidence-2026-10-29.md)，不替代其安装身份与 Profile 边界。

用户范围决定：配置文件提供单选、刷新与“打开配置文件”，交由系统默认应用编辑；暂不实施通用配置图形化管理或内置编辑器。预设选择与技能目录管理继续按已确认草图推进。下文通用表单、Host 接入及高级编辑能力仅为调研结果，不属于当前实施范围。

## 结论与证据版本

**配置文件中的设置可以图形化管理，但需要区分用户任务、声明与运行值，以及已有接口和待实现适配。** 不能因字段没有 `.volatile()` 就判定不可保存；上游 ConfigEditor 已可编辑完整配置。也不能把这项 Host 内部能力视为浏览器已有的通用配置写 RPC。[完整配置编辑服务](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/config-editor/src/index.ts#L75-L153)

确定性结论使用本地官方源码快照 `f3803c96974ad4a94195fb97e5c637e9c2a3afe3`，提交时间 `2026-10-28T02:17:58+08:00`，版本 `0.2.2-alpha.2`。本轮同时读取官方 raw `master`，ConfigEditor 与 Settings 合同相符；但未能重新解析远端 HEAD，不能把该快照断言为当前最新 master 或 npm 最新版本。

**发现未固定页面互相冲突：** raw `master` 的 [Agent preset section-store](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/client/ui-agent-preset/src/client/section-store.ts) 出现目录型 preset、`trust: system/user`、`authorable`、复制/删除及打开目录；同期读取的 [registry types](https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/packages/preset/agent-preset-registry/src/types.ts) 仍是旧结构。固定快照的 [registry 文档](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/README.md#L38-L42) 明确不扫描目录、无声明写 Remote。检索工具还对不同页面返回不同抓取时间。因此目录型管理是需要按同一提交复核的漂移线索，不能把两套内容拼成一个已经确认的发行合同；也不能永久宣称上游绝无复制/删除功能。

## 能力矩阵

下表“上游”均指上述固定快照；“建议”均未实施。

| 用户任务 / 配置类型 | 上游已具备 | Skills Space 当前工作区 | 可行的图形化方式与范围 |
| --- | --- | --- | --- |
| 修改活动实例的 live 设置 | `settings.describe/update/replace/mutate`；返回 schema、有效值、继承值、用户覆盖和 revision，持久化 Profile patch | 当前 DSH 管理走本地配置脚本，没有接入这套 Host RPC | 对已有用户任务按需连接原生接口；保存后读取返回值与冲突状态 |
| 修改普通字符串、布尔、数字、目录及数组 | Host 内部 `configEditor.edit()` 校验完整配置并保存；不要求 `.volatile()` | 已针对 filesystem 技能设置读取/写 Profile patch；不是通用插件编辑器 | 有合同的普通字段可做定制表单；离线写文件不等于调用原生 editor，也不证明活动值已改变 |
| 恢复默认 / 继承 | Settings 的 unset / replace 恢复 Profile 层下面的值；底层也包括 schema 默认 | 已有技能目录恢复流程，按 provider / 父 preset 分支处理 | 显示“继承值”和“本次覆盖”；恢复不是硬写工厂常量，更不是删除底层 bundle 值 |
| HOME 或启动参数覆盖 | 参与组合；ConfigEditor 的写目标仍只有活动 Profile，遮蔽写入会拒绝 | 静态 reader 读取 HOME patch，没有运行中 Host 的 argv 全貌 | 告知具体覆盖来源；不要把 Profile 保存成功误报为最终值生效；跨 Profile HOME 修改需独立明确范围 |
| preset 内技能目录 | child 不直接属于根 Include 的可编辑 entry；可以通过父 preset 完整 raw config 表达覆盖 | 当前代码能构造完整父 preset 覆盖，并要求首次物化确认 | 技术上可做；产品上应先解释作用于哪个 preset，以及整个 child list 固定后的升级影响；不能当单一独立目录设置 |
| `!!js`、条件启停、运行时表达式 | Loader 解释；ConfigEditor 保留替换值之外的注释和表达式，并将 `__jsExpr` 恢复为 YAML tag | reader 不执行表达式；部分动态字段/条件目标只读，无关表达式不一刀切禁写 | 普通字段仍可编辑；动态字段保留原声明并显示“由表达式计算”；表达式作者使用原配置文件入口，不能把字符串输入冒充等价表达式编辑 |
| 完整 preset / 任意插件的编辑 | registry read 为只读 YAML；没有通用 preset YAML 写 Remote；原生自带专用设置页 | 技能 provider 配置清单不等于完整 preset roster | 先给查看来源/组成与原生入口；独立 preset 作者工具需另定范围，不能靠自动铺开所有参数完成 |

上游表单语义：[Settings 投影与写入](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/src/index.ts#L298-L423)、[表单字段选择与表达式保留](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/src/schema.ts#L33-L78)。Skills Space 当前证据：[配置读取](../../scripts/dsh-configuration.mjs)、[写入候选生成](../../scripts/prepare-dsh-change.mjs)、[设置界面](../../src/components/dsh-management.tsx)。这些是工作区实现观察，不代表本轮已完成运行验收。

## 实现合同中容易混淆的四点

1. **Settings 表单不覆盖所有 Config。** `describe` 只收集活动、唯一、根 Include 可寻址条目中的 live 字段；当前技能 filesystem schema 的目录与 watcher 参数没有 `.volatile()`。不能只连接 Settings 就承诺管理技能根目录。[filesystem schema](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/skill/skill-filesystem/src/index.ts#L75-L88)
2. **schema 可生成表单，不等于上游已提供通用页面。** `autoGenerate` 默认开启，但该版本明确没有随附 client 使用它自动生成页面；官方业务页使用共享 configForms 服务。应优先复用它们的任务边界，通用 schema 表单可作为后续能力。[Settings 自动页面合同](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/settings/settings/README.md#L30-L42)、[client 共享表单服务](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/client/ui-settings/README.md#L24-L38)
3. **保存完整 config 有继承代价。** Cordis patch 的 config 是整体替换；ConfigEditor 完整覆盖会把普通字段当前 raw 值固定在 Profile 层。preset 的 plugins 数组也整体覆盖，不自动合并未来内置变化。恢复一个技能目录与移除整个父 preset 覆盖应是不同动作。[ConfigEditor 限制](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/config-editor/README.md#L59-L61)、[preset 继承限制](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/README.md#L83-L87)
4. **活动 Host 与离线文件是两条证据路径。** Host 内 editor 协调 HMR、Profile 锁、完整校验与失败回滚；离线读取应只组合声明，不启动 Profile 去获取 schema 或冒充当前有效值。普通字段遵循 Loader 生命周期，外部保存的生效时点取决于实际 HMR/重启；已有会话还可能保留旧 preset revision。[editor 事务](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/boot/config-editor/src/index.ts#L84-L151)、[revision 合同](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/README.md#L48-L52)

活动 Host RPC 读回要使用脱敏 descriptor；ConfigEditor 的内部完整配置不是可直接暴露的远程 JSON。上游凭据存储策略不改变 Skills Space 的 OS credential store 合同；不要因新增配置表单而复制密钥值。[Settings Remote 边界](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/api/settings-controller/README.md#L26-L32)

## 自定义 preset 发现的实际边界

2026-10-30 实施更新：配置文件清单已与 provider 行分离，新增独立 Profile 文件元数据；Desktop 自带的原版 CLI 可作为 Web/自定义 Profile 的读取运行时，不再要求另装 npm CLI。Agent 预设展示和文件切换仅使用非空真实 preset ID，Host/provider 行保留为原始配置与内部库存数据，不再生成伪预设。具体实现与验证以 [0012 第14节](../specs/0012-dsh-settings-native-skills-rebuild.md#14-配置文件与真实预设分离2026-10-30) 为准；下文 provider 清单仍不是完整运行 roster。

当前 `entries()` 仅递归普通 `group` 数组及 `@deepseek-ai/dsh-agent-preset` 的内联 `config.plugins` 数组；reader 随后只为 `@deepseek-ai/dsh-skill-filesystem` 创建 configuration。自定义 preset 的 name / description 已可保留，但**没有 filesystem provider 的 preset 不出现在这份技能配置清单中**；动态生成的 plugins / 条件启停也不能靠静态文件确定活动结果。这是当前 Skills Space reader 的范围，不是上游只能有某几个预设，也不是自定义 preset 不受支持。[遍历与筛选](../../scripts/dsh-configuration.mjs#L49)、[配置条目生成](../../scripts/dsh-configuration.mjs#L135)

活动 preset roster 应来自对应 Host 的 `agentPresets.list`；动态注册、broken 状态与会话实际绑定不能由技能 provider 扫描替代。目录型 preset 若在后续同提交源码中确认，当前内联 reader 没有据此得到兼容证明，需重新定义发现/写入对象。[registry 读取与检查](https://github.com/deepseek-ai/deepseek-harness/blob/f3803c96974ad4a94195fb97e5c637e9c2a3afe3/packages/preset/agent-preset-registry/src/index.ts#L207-L243)

## 建议分阶段落地

1. **先完成技能设置任务。** 页头复用 Pi 的单选下拉与图标刷新，选择实际配置文件；安装 anchor、DSH_HOME 与 Profile 的绑定由发现机制保留，不拆成三级用户选择。预设卡片展示名称、标识和用途，下方标题随选择更新为“技能目录（预设名称）”。自定义预设沿用相同卡片；只有来源可确认时才按内置／自定义分组，不能仅凭四个内置 ID 推断来源。Desktop 与 Web 默认共享 DSH_HOME 但分别拥有 desktop / web Profile；bundle 解析必须绑定所属安装 anchor。已有原生文件入口覆盖高级表达式编辑。此阶段不增加 watcher、providerName 等无当前用户任务的参数。[安装与 Profile 合同](deepseek-harness-surfaces-evidence-2026-10-29.md#一首先区分配置所有者)
2. **再按任务接活动 Host。** 使用现有认证 Host 的 roster、settings descriptor 和现有原生设置页，取得运行值与 live 写入反馈；按字段资格开放，不以 Desktop / bundle / 继承等标签整批禁用。没有公开普通 Config 写 RPC 的功能继续使用有明确边界的文件编辑或原生入口；需要新 Host 插件接口时单独设计。
3. **通用配置图形化管理暂缓。** 用户已选择通过系统默认应用编辑配置文件，本轮不新增普通插件 schema 表单或表达式编辑器。现有技能目录所需的父 preset 覆盖与保留配置逻辑维持原范围；未来重新批准通用管理时，再固定同一官方提交确认 preset 架构，定义覆盖/恢复范围、秘密处理与应用时点。

本轮只验证源码合同、现有脚本覆盖范围与文档引用；未执行 runtime build、安装、保存或 Desktop/Web 操作。上游已有能力、当前工作区已有实现与上述建议不可互换为“已验证可用”。
