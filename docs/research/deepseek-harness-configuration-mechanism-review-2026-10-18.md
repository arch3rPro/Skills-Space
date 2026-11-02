# DeepSeek Harness 配置机制复核与补齐方案

后续复核：当前分端配置、Agent scope、Settings 持久化及插件管理以 [2026-10-29 复核](deepseek-harness-management-review-2026-10-29.md) 为准；本文旧版本结论保留为历史证据，不代表当前上游全部能力。

2026-10-28 引用维护：下列 npm 源码位置、行号与哈希属于调研时快照，旧安装现已移除，改为历史文本记录。当前桌面运行包位置与读取兼容结论见 [spec 0009](../specs/0009-dsh-native-skill-management.md#2026-10-28-桌面运行包读取兼容)；没有将旧版本哈希改写为桌面版哈希。

日期：2026-10-18。状态：通用机制源码复核完成；A—C 已获批准并实施，验收记录见 [0009](../specs/0009-dsh-native-skill-management.md)。父 preset 完整覆盖仍未实施。

范围：DSH 的安装身份、Profile/bundle/patch 组合、有效配置读取、用户覆盖层写入、技能提供器字段和现有只读策略。结论面向 DSH 通用协议，不以任何个人 Profile、HOME 配置、第三方插件清单或安装路径为适配目标。延续 Skills Space 原版 CLI 与技能管理范围，不将本轮研究解释为综合 Agent 设置中心的实施授权。


## 结论与本轮纠正

1. 正常 bundle-backed Profile 是 DSH 的主配置形态，不是天然的只读异常。现有实现把非空 `dsh.profile.bundles` 直接当作不可编辑继承，而且只扫描用户补丁内已有的技能声明，遗漏 bundle 中声明、用户层尚无覆盖的常见情况。
2. 应先做“不启动插件的声明层组合”，再决定可读字段、可定位的用户覆盖和实际发现目录。不能把“某个 YAML 里有一条 skill-filesystem”当作有效配置。
3. 上游有成熟的 Profile patch 编辑机制，但其运行时 ConfigEditor 与仅支持 volatile 的 settings RPC 不是同一接口。不能以 settings RPC 的限制推导普通技能配置必须永远只读。
4. **整 `config` 替换是必须保留的上游语义。** 可在用户层覆盖继承配置，但完整物化会遮住 bundle 后续变化；尤其涉及父 preset 配置时，不能用“三字段最小 patch”覆盖整个父对象。
5. 建议先交付通用组合读取和根技能提供器的用户覆盖，再单独开放涉及完整父 preset 物化的写入。复杂动态、未知运行时和嵌套 Include 的不可证明部分继续只读；限制应落在具体条目/字段/动作，而不是整个 Profile。

这份报告补充并纠正 [2026-10-17 调研](deepseek-harness-native-management-review-2026-10-17.md) 的后续适配建议。已实施状态仍由 [0009](../specs/0009-dsh-native-skill-management.md) 记录；上一轮目录与列表统一只打通了“当前扫描器已识别声明”的数据流；本次 A—C 已补齐 bundle/Profile/HOME 声明组合。

## 证据边界

- 固定主线：`687f282e8625c6b8d11ff58211a90524be2e4317`，CLI 元数据版本 `0.2.1-rc.2`。所引主线源码均使用固定提交链接。
- 官方发行包：`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh`，包版本 `0.2.0-rc.2`。只读取通用程序源码及包元数据；未读取用户配置，未启动 DSH、插件或第三方脚本。
- GitHub API 已遇速率限制；此专项未追加联网请求。没有将固定主线的行为冒充已经在发行版执行验证的结果。


本轮共核对 19 个核心源码/文档文件及相应版本清单，单文件小于 200 KiB、核心证据合计小于 2 MiB；不克隆仓库、不安装依赖、不执行上游脚本。GitHub 读取尝试共 3 次：网页工具未能取得 commit API、沙箱 DNS 失败、经允许的只读网络请求返回 API 限流；随后停止网络路线，未换身份/渠道绕过限制。未核验最新主线提交、当前发布列表及活跃度，不能将上述固定版本称为当前最新版本。

DSH 是基于 Cordis 的插件化 Harness，固定 README 明确标为 developer preview，许可 MIT；本次只评价配置子系统的机制，不据此断言整个项目生产成熟度。[固定 README](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/README.md)、[MIT LICENSE](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/LICENSE)。建议复用原版接口与事务模式；未来若实际复用源码，需保留相应许可与版权声明。本轮未复制上游实现到应用。

## 有效配置的读取机制

### 配置优先级和彼此不同的范围

```text
安装包身份 + Profile package.json
  └─ 按 dsh.profile.bundles 顺序解析 bundle 包
      └─ 按各 bundle 的 dsh.bundle.patch 顺序读取补丁文件
          └─ Profile/cordis.patch.yml
              └─ DSH_HOME/cordis.patch.yml
                  └─ 本次启动显式 --patch 文件（argv 顺序）
                      └─ 启动器的 telemetry 最终补丁
                          └─ 一次 Cordis patch 组合
                              └─ entry / preset / provider 声明
                                  └─ schema 默认值、动态表达式与运行时激活
```

Profile 是启动配置载体；preset 是其中的 Agent 插件组合；项目目录是技能查询的 cwd，不能混为一个维度。Profile 用户补丁也不是“当前项目专用设置文件”：从项目页面修改某个 Profile，仍会影响所有使用该 Profile 的启动。不得为实现项目作用域而发明 DSH 不读取的 `.dsh/settings.json`。

层次顺序依据 [profile-boot L211–235](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/src/profile-boot.ts#L211-L235) 与发行包 app-boot `readProfilePatches` L1023–1037。环境变量是另一条输入链：继承进程环境 > 启动 cwd 的 `.env` > DSH HOME 的 `.env`；bootstrap 变量有独立限制，不能简单把 YAML 层优先级照搬到环境。此处只是协议核查，本轮不读取任何实际 `.env`。[环境装载源码 L229–263](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/app-boot/src/index.ts#L229-L263)

### bundle 与 Profile 的通用解析

发行包 app-boot L524–526 明确拒绝把 `node_modules` 当作 Profile 名；现有应用直接枚举所有子目录，会把该目录计入 Profile。这是发现缺陷，应按 manifest 身份和上游命名规则排除依赖/临时目录，不能给某个个人 Profile 加特例。

`resolveBundleDir` 的锚点顺序是 **原版 DSH 安装优先、Profile 依赖其次**，保证官方内置 bundle 与所属安装一致；不是任取最近的同名包。`dsh.bundle.patch` 可为一个文件或有序文件数组，不能假定所有包都只叫 `cordis.patch.yml`。`loadProfileDirectory` 会按顺序读取可用 bundle，跳过无法读取或版本不兼容的 bundle 并返回诊断；用户补丁错误则抛出。缺失 bundle 不能静默转成默认目录已生效。证据：发行包 app-boot L492–503、L827–968；其源码来自原版发行包，未重新实现或运行这些函数。

现有 scanner 的 `extends/base` 检查不是这轮核查发现的通用继承主机制；上述加载路径以 `dsh.profile.bundles` 为组合协议。不能拿对未知键的保守判断替代真正的 bundle 解析。

### 必须分开的四类结果

| 读取结果 | 离线能否证明 | 产品与接口应表达的含义 |
| --- | --- | --- |
| 原始层声明 | 能 | 某文件写了什么，含未求值表达式及来源 |
| 已组合声明 | 在依赖完整且 patch 规则已验证时能 | 已应用 bundle/Profile/HOME/已知 argv 补丁，尚未启动插件 |
| 规范化静态字段 | 仅能覆盖已知版本、已核对 schema 与路径语义的字段 | 例如默认 true、空目录数组；动态相关字段不得填一个猜测值 |
| 正在运行的有效值/当前会话视图 | 仅靠文件不能 | 需要真实实例的原生运行时接口与对应会话；另行接入和验收 |

CLI 覆盖、实际启动环境或活动 preset 未知时，应给组合结果附带输入边界，不冒充当前进程最终值。正常卡片不增加“未核验会话”类重复说明；只有发生路径无法确定、配置被覆盖或写入受阻时说明原因。

### 可复用读取入口与有副作用的入口

- 可作为实现候选：原版 app-boot 的 `loadProfileDirectory`、bundle 元数据解析、`loadOptionalPatches`、`loadOverlayPatches`、`composeEntries` 等经逐版本核查的读/组合接口。保留表达式节点；不加载插件实现。采用哪个公开导出入口及其导入依赖副作用，仍须在隔离 fixture 中证明，不在本次研究中执行。
- 不自动执行 `loadProfile`：它可能初始化模板 Profile、清理旧投影、规范化清单；不等于纯读取。
- 不把 `--dump-config`/`--dump-default-config` 当作无副作用页面请求：`runDumpConfig` 会调用 `prepareProfile`，后者重写 `cordis.yml`。这一命令可导出组合 YAML，但真实 HOME 读取不应顺带被写入。[dump-config L31–42](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/src/dump-config.ts#L31-L42)、[prepareProfile L179–199](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/cli/src/profile-boot.ts#L179-L199)
- schema 导出也不能无条件视为纯 JSON 读取：发行包 app-boot `collectConfigSchemas` L2990–3016、L3110–3124 会导入插件模块。即使不挂载完整插件，也不能承诺模块顶层没有副作用。首批只使用已审计的技能配置 schema；任意插件 schema 获取仍需隔离或真实实例。

### 技能发现需要随组合读取一起补齐

已核对的文件系统提供器共有 12 个配置字段，而非只有当前 GUI 的 3 个。路径转换要以实际 DSH 启动 cwd 和该版本 resolver 为准：`customSkillDirs` 是 `resolve(root)`，不应一概按技能查询项目目录或补丁文件目录解析。配置 `dshHome`/`agentsHome` 是提供器的技能根覆盖，不等于切换启动器自身的 Profile HOME。[提供器构造 L160–176](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts#L160-L176)

关闭 `includeDefaultRoots` 会排除默认项目/用户根和环境提供的默认 bundled 根，但 **显式 `bundledSkillDir` 仍会被扫描**。现有 scanner 未纳入 bundledSkillDir，不能把关闭默认根解释为所有内置来源都被关闭。[根构造 L244–263](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts#L244-L263)

同名优先级需先区分 provider 注册层与 preset 作用域，再在同一层比较目录 rank；不能把所有 Profile 的技能混在一个获胜表。已开始会话的 preset 也不能由检查选择器切换。[preset 会话限制 L341–365](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/preset/agent-preset-registry/src/index.ts#L341-L365)

发行版与缓存主线也已出现路径 resolver 差异：0.2.0-rc.2 对 agentsHome 直接使用 `path.resolve`，固定主线则调用 `resolveAgentsHome`。因此不能仅放开一个版本字符串就宣称兼容；需要按实际接口合同、依赖版本及测试结果放行。

## 现有实现为何覆盖不足

| 当前实现位置/行为 | 实际问题 | 建议处理 |
| --- | --- | --- |
| `inspect-dsh-skills.mjs:74–112` 只读 HOME/Profile patch 与补充目录 | 用户 patch 没有重述 bundle entry 时，正常配置直接消失 | 先完整组合再枚举 entry；原始层用于来源追踪 |
| `:82` 非空 bundles 判定 inherited | 将正常架构当成异常 | 移除一刀切门槛，以组合完整性、目标身份和写入影响判断 |
| `:73` 任意非空 HOME patch 判定 homeProblem | 无关配置也阻止技能设置 | 对候选写入后的目标 entry 检查真实 shadow；无关 HOME 项不阻断 |
| `:77,:83,:97` 整份文档有锚点/表达式即只读 | 一个无关动态字段会禁用全部技能配置 | 将未解析依赖和写入资格缩小到所属 entry/目标字段；不可证明的部分保留只读 |
| `:60` 只认一个精确版本 | 未验证版本风险被扩大为全部能力关闭 | 读/组合/写分开能力探测；已验证合同放行，未知写合同仍只读 |
| `:110` 把所有子目录当 Profile | 依赖目录被错误列入 | 采用上游命名规则、有效 manifest；不自动创建缺失配置 |
| `:119–121` 默认根+自定义绝对目录 | 缺少完整 bundle 与 bundled 根；相对路径也未按启动 cwd 解析 | 使用组合后的提供器配置和已确定的启动输入；无法确定相对路径时说明原因 |
| `prepare-dsh-change.mjs:27–37` 修改已有文档内 locator | 不能为仅存在于 bundle 的条目新增用户覆盖，未证明最终值有效 | 按所属 entry 生成原生 patch，复合成完整声明后核验 |
| native `configuration_save` 只回读三字段 | 不能证明其他字段、所有权及更高层覆盖未变 | 核对目标完整 raw config、未编辑字段、其他 entry 与依赖指纹 |
| Profile 修改入口包含项目选择 | 易误认为改动只影响该项目 | 分开“Profile 保存范围”和“用于技能发现的项目 cwd”；不自造项目级设置文件 |

既有同源数据流修复应保留；本轮仅研究，不撤销或重写上一批未提交代码。

## 用户覆盖层究竟写在哪里

原生 ConfigEditor 的写入目标是 `profileContext.patchPath`，不是依赖包内的 bundle 文件。`entries()` 只提供 Profile 根 Include 所有、ID 唯一的活动条目；嵌套 Include 有独立配置所有权。插件在 bundle 声明，并不意味着不能在 Profile 覆盖层配置它；关键在于能否通过完整组合得到唯一、可定位的所属 entry。[固定源码：配置编辑器 L33–79](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/config-editor/src/index.ts#L33-L79)

官方发行包 `dsh-base/cordis.patch.yml:295–298` 本身就插入了根级 `skill-filesystem` 条目，因此常规 bundle 来源的技能目录配置应可通过针对该根条目的 Profile 覆盖实现，不需要复制整套 preset。下文父 preset 物化只针对技能提供器确实嵌在 `preset.config.plugins` 的情况，不能将该高代价路径套到所有 Profile。

**主要设计代价：Cordis patch 替换 `config` 整个值，不进行字段递归合并。** 发行包 `cordis-plugin-include/lib/index.js:56–104` 的实现先通过 ID 找到条目，再对 patch 的每个键执行 `target[key] = value`。ID 索引只递归 `group: true` 的数组型 `config`，不会把任意插件的嵌套配置当作可独立 patch 的条目列表。

因此：

1. 若 `skill-filesystem` 是某个 preset 配置中 `plugins` 数组的子声明，不能直接假定它的子 ID 是 Profile 根 entry ID。应先定位所属 preset 根 entry，再决定是否能对其父 `config` 做受控覆盖。
2. 将继承结果物化成完整父 `config` 后再写入，能保留当前其他字段，却会冻结这些字段当前继承到的值；上游 bundle 以后新增或调整的字段不再自动透过这条完整 `config` 覆盖生效。未知父字段也不能丢弃。
3. 从完整覆盖对象删除一个字段，并不等于恢复该字段的 bundle 继承，可能仅使该字段缺失并走 schema 默认值。真正恢复整个条目的继承，需要移除该 entry 的 `config` 覆盖。字段级的“恢复继承”必须先定义语义，不能照搬常见 deep-merge 配置编辑器。
4. 若希望保留细粒度继承，必须有上游明确支持的表达式/合并机制或独立配置入口；不能凭应用自定义一套合并规则，也不能默认生成 `!!js` 来掩盖上述代价。

ConfigEditor 本身使用完整 raw config：写入结果 `next` 与 inherited 完全一致时移除配置覆盖，否则插入/替换对应 patch 的 `config`。这再次证明“完整对象替换”是原生机制，不是 Skills Space 可以无损假定为字段合并的机制。[固定源码 L117–140](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/config-editor/src/index.ts#L117-L140)

## ConfigEditor、SettingsForms 与 RPC 的权限不同

| 接口 | 支持的变化 | 关键语义和限制 |
| --- | --- | --- |
| `ConfigEditor.edit(entry, change)` | 完整插件 raw config，包括普通字段 | 依赖运行中 Loader、ProfileContext、active fiber；先校验，再持久化，再协调生命周期；普通字段可以导致插件重启 |
| `settings.update(ns, patch, expectedRevision)` | 仅 schema 声明为 volatile 的表单字段 | 在当前表单值上递归合并普通对象，数组替换；最终仍由 ConfigEditor 写完整条目的 config |
| `settings.replace(ns, section, expectedRevision)` | 重置 volatile 表单字段并设置传入字段 | 从继承的表单字段生成下一值；普通配置保留；不是替换整个 Cordis entry |
| `settings.mutate(ns, ops, expectedRevision)` | volatile 字段的路径 set/unset | 无需重述脱敏后的秘密；unset 对象字段恢复继承值，unset 数组下标移除元素；最终持久化语义仍是完整 config 覆盖 |
| `remote.settings.*` | 上述 settings 读写的远程包装 | 返回脱敏 schema、value/base/user、revision；缺少 settings 服务时返回明确错误，不提供离线通用配置接口 |

上述 `update/replace/mutate` 属于 SettingsForms，不是 ConfigEditor 的三个方法。发行包证据：`dsh-settings/lib/index.js:470–535`；`dsh-api-settings-controller/lib/index.js:392–433,460–480`。

SettingsForms 的 `writable` getter 固定为 true，但不代表任意配置都可编辑：`describe` 仅投影活动插件 schema 中 volatile 字段；`write` 拒绝非 volatile 路径；已不活动或没有 Config schema 的 entry 也不提供表单。因此“上游所有设置只读”错误，“上游 settings RPC 能任意编辑插件配置”同样错误。证据：`dsh-settings/lib/index.js:118–157,395–450,501–540`。

ConfigEditor 与 Loader 允许普通字段修改走常规生命周期；仅 volatile 变化可直接更新运行引用。普通字段不是必须永远只读，应用可选择持久化后重启生效；但不能通过仅支持 volatile 的 settings RPC 强行写入。证据：固定配置编辑器 L82–104；发行包 `cordis-plugin-loader/lib/index.js:366–426`。

## 原生安全写入流程及离线落差

原生 `ConfigEditor.edit` 的流程：

1. 与 HMR 独占协调；获取 Profile 目录 `package.json` 的跨进程写锁。
2. 重新读取 patch，先同步正在运行的 Loader，再复核条目身份，避免在旧对象上写入。
3. 基于当前值与 inherited 计算 next，通过运行上下文 `internal/config` 和实际插件 Config schema 校验。
4. 解析 YAML 文档并保持 `!!js` 表达式节点；仅更新目标 entry 的 config，保留其他 patch。
5. 合成候选完整配置并核对目标值；若被 home patch 或命令行 overlay 覆盖，拒绝写入，而不是报告保存成功但实际不生效。
6. 原子替换 profile patch，权限 `0600`；协调 Loader 后失败则恢复旧文档并再次协调旧配置。

证据：[固定 ConfigEditor L87–153](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/config-editor/src/index.ts#L87-L153)。发行版 `dsh-config-editor/lib/index.js:69–134` 具有同样主要流程。

`dsh-atomic-write/lib/index.js:46–76,164–214` 说明同目录临时文件的独占创建和原子 rename、PID 锁、超时以及锁持有者退出后的接管；明确不承担 `fsync` 崩溃持久性、多主机/不同 PID namespace 共享写锁。离线实现若需与原生写入并发，必须协调同一个 `package.json.lock`，不能只锁 cordis patch 或只依赖应用内锁。

**不能在完全不启动运行时的情况下直接调用原生 ConfigEditor/SettingsForms 来获得相同完整保障。** 两者是 Cordis services，依赖 loader、active entry、插件 schema 与上下文。`reconcileProfilePatches` 也明确要求已启动的根 Include，并会协调插件活动状态；不是单纯的文件校验器。[固定 app-boot L313–337](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/boot/app-boot/src/index.ts#L313-L337)

离线可复用的边界是“读取/组合 raw 配置、保留未求值表达式、验证结构与覆盖关系”；不能声称得到所有插件运行时最终值。Loader 的 `interpolate` 通过上下文 `eval` 求值 `!!js`，任意表达式可能依赖服务、环境或产生副作用；离线检查不应自动执行它。证据：`cordis-plugin-loader/lib/index.js:231–247,607–611`。

## 补齐方向与保留的限制

### 应补齐，而非继续一概只读

- 先完整组合 bundle/Profile/home/命令行声明层，再查找技能提供器，解析所属根 entry。仅因为来源是 bundle 不应拒绝读取或拒绝用户覆盖层写入。
- 读取结果区分 inherited、profile override、home/CLI shadow 和未求值表达式；同一份组合结果用于设置页、实际发现目录与原生技能列表。
- 对能精确定位、静态 JSON 兼容、保留完整上下文并能通过重组合验证的目标，提供 Profile patch 写入方案；不修改 bundle 包、不生成个人 Profile 特判。
- 对普通字段明确“保存至配置、按其生命周期生效”；对 volatile 字段的实时应用，仅在接入真实运行时接口时承诺。
- 将当前“只读”拆成具体原因：不能定位根 entry、ID 重复/嵌套所有权、表达式求值依赖、被更高层覆盖、缺失 schema、并发冲突、文件不可写。错误原因不能被一条“复杂配置只读”吞掉。

### 保留，但需说明是上游约束还是当前范围

| 情况 | 性质 | 建议 |
| --- | --- | --- |
| RPC 编辑非 volatile 字段 | SettingsForms 的真实接口约束 | 使用配置持久化/重启路径；不可伪装为实时更新 |
| 任意 `!!js` 需要运行上下文 | Loader 的真实求值机制 | 离线保留表达式并标明未求值；无法保证静态结果时禁止相关写入 |
| bundle 声明的目标字段 | 不是只读理由 | 可读取继承结果；写入用户层需先处理整 config shadow 的代价 |
| home patch / CLI shadow | 原生 ConfigEditor 已拒绝保存无效覆盖 | 精确显示覆盖来源；不擅自改写更高层或其他配置所有者 |
| 所有非白名单 YAML 一律只读 | 应用策略，不是上游一律禁止 | 改为基于 AST、可定位性、保真与候选重组合的逐项能力判断 |
| 完整父 config 物化 | 上游 patch 替换语义带来的真实代价 | 方案必须展示覆盖范围、继承冻结和整条恢复能力，再决定是否纳入可写范围 |


## 建议下一批分阶段交付

### A. 通用有效配置读取，先补齐主流程

新增一个后端配置组合入口，绑定实际原版 DSH 安装、Profile 与启动输入；不得写死安装路径、Profile 名、bundle 包列表或插件数量。结果至少包含：安装/版本身份、层与文件指纹、entryId/name/所属 root/preset/provider、继承值/用户覆盖/组合值、字段默认/表达式/覆盖来源、缺失依赖与被跳过的 patch、读/写能力及具体原因。

所有入口——设置、Agent 页、技能空间 Agent 筛选、顶部目录与技能列表、技能预览、CLI 安装前检查——消费同一份选定上下文结果。无配置声明与解析失败必须分开；不能在扫描失败时用默认根证明安装可用。普通全局/项目库存仍遵循原有归属隔离，另保留该 cwd 的组合查询视图；不把全局技能改标成项目技能。

### B. 通用 Profile 用户覆盖层写入

第一批支持可唯一定位的 **根 entry 或真正 group 子 entry** 中的官方技能文件系统提供器，不要求用户先把 bundle 声明复制到补丁中，也不要求 bundles 为空。

建议写入动作：

1. 在后端基于完整未求值配置形成 next；保留所有未编辑字段、表达式引用及条目元数据，前端脱敏数据不能用于重建完整配置。
2. 若原用户层已有对应 config，保留其他 patch 并修改目标；若仅在 bundle 中存在，新增带 `id`、`name` 校验的原生覆盖。目标文件缺失可创建 Profile 的 patch，前提是该 Profile 已存在；不创建新 Profile、不安装 bundle、不改生成的 cordis.yml。
3. 生成覆盖时按整 config 替换合同执行，不把三个字段当成 deep merge。给已有完整配置提供比较视图，展示本次变更及会被物化的继承部分；不悄悄冻结其他配置。
4. 在原版 `package.json.lock` 锁内重新读取依赖与 YAML；对缺失文件记录 missing 指纹；候选组合值应等于期望完整目标配置，其他条目不变。HOME/已知 CLI 真实遮蔽则拒绝，不能擅自修改上层来让保存“成功”。未知启动 overlay 不能承诺当前实例生效。
5. 原子写、回读并重组合；失败时仅在确认未被外部改写的条件下恢复自身写入的旧文件/缺失状态。不能在并发变化后盲目覆盖回滚。离线路径只报告保存与静态验证，不假装完成 Loader 激活与回滚。
6. 提供“移除该 entry 的 config 覆盖，恢复继承”，保留同条目的 disabled 等其他覆盖；不要把从完整对象删除单个字段称为恢复 bundle 继承。继承值随 bundle 更新后的变化须单独展示。

离线默认路径复用原版已审计解析/组合接口和本项目 Rust 文件能力；不修改/分叉原版 CLI。若后续接入活动实例，只能使用原版原生服务已有且可调用的接口；本轮未证明存在可从外部任意调用 ConfigEditor 的通用 RPC，因此不将其当作已可集成方案。

### C. 配置字段的开放建议

以下都是技能提供器设置，不能延伸为模型、密钥、网络权限等任意 Agent 配置编辑授权。读取遵循该版本 schema，写入还需满足上述 entry/覆盖检查。

| 字段 | 上游值/默认值 | 当前应用 | 建议下一批 |
| --- | --- | --- | --- |
| `customSkillDirs` | string[]，默认 [] | 仅独立静态声明可改 | 对通用 bundle-backed 根 provider 开放；相对目录仅在启动 cwd 已知时准确读取，GUI 新增仍可统一绝对路径 |
| `includeDefaultRoots` | boolean，默认 true | 同上 | 开放；保存前核对通用 CLI 目标是否仍被 DSH 发现 |
| `watch` | boolean，默认 true | 同上 | 开放；不宣称可撤回已加载会话内容 |
| `dshHome` | string，resolver 决定默认 | 只读 | 静态、路径语义已确认时可开放独立提供器覆盖；不搬迁 DSH HOME/用户数据 |
| `agentsHome` | string，resolver 决定默认 | 只读 | 同上；改变后重新判断 `.agents/skills` 的 CLI 可达性和共享保护 |
| `watchUsePolling` | boolean，默认 false | 未展示 | 高级项可开放，沿用同一写入流程 |
| `watchStabilityThresholdMs` | 正整数，默认 200 | 未展示 | 高级项可开放，严格按提供器校验 |
| `watchPollIntervalMs` | 正整数，默认 100 | 未展示 | 同上 |
| `watchMaxProjects` | 正整数，默认 128 | 未展示 | 同上 |
| `watchFollowSymlinks` | boolean，默认 true | 未展示 | 同上；只影响监听，绝不放宽原生写入的链接保护 |
| `providerName` | 非空 string，默认 filesystem | 只读 | 首批读出身份，保留只读；重命名涉及 provider 冲突及引用，不混入目录编辑 |
| `bundledSkillDir` | 显式路径；或默认根开启时取环境值 | 未完整展示/发现 | 先补读和发现；包/内置来源不提供文件写入，目录重定向另行评审 |
| provider entry 的 `disabled`（entry 元数据，非 Config 字段） | 是否挂载提供器 | 读取局部声明 | 先准确读取；不把它包装为某个技能启停，不随保存技能目录自动启用 |

上游 [Config schema L48–88](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/skill/skill-filesystem/src/index.ts#L48-L88) 的 **12 个 Config 字段**包含 `bundledSkillDir`，上表另列 entry.disabled。

### D. 细化只读策略及后续范围

- **解除应用侧过度限制：** 非空 bundles、用户补丁为空/尚无该 entry、无关 HOME 补丁、其他条目的动态表达式，不应成为整个 Profile 只读理由。
- **分步开放复杂文档：** 锚点/别名/合并不是上游天然不允许，但应用须证明 AST 编辑不会改动其他引用；先支持目标可独立定位且可保真的情况，剩余保持具体原因只读。不是本轮直接取消所有保护。
- **真实保留只读：** 目标身份重复/不唯一、未知嵌套 Include 所有权、目标依赖动态求值而无运行时证据、未确认写协议的版本、相关 bundle 缺失/不兼容、真实上层遮蔽、并发冲突、不可安全写入的链接/权限、无法保留秘密引用。
- **父 preset 的特殊代价：** 若提供器在 `preset.config.plugins`，原生根 patch 无法把任意子 ID 当成根 ID。第一批准确读出和标明所属父对象；第二批再开放完整父 config 物化，并单独核验兄弟插件/表达式保留、继承冻结、bundle 升级与整条恢复。不得自动生成合并 `!!js`，也不发明私有补丁格式。
- **真实实例观察另列：** settings RPC 仅支持 volatile；普通字段的活动编辑需要可达的原生 ConfigEditor 服务及 Loader。无法确认稳定外部接口时，提供“已保存，重启相应 Profile 后使用”的离线路径，不自动启动/重启用户 Agent。

建议确认顺序为 A → B（根/group 提供器）→ C 的目录与监听字段 → D 的选择性放宽；父 preset 物化、HOME 全局写入和运行时连接不默认混入首批。

## 建议验收矩阵

必须使用与个人环境无关的隔离 fixture：多 bundle 同 ID 按顺序覆盖；Profile 覆盖；home 与 CLI shadow；group 与 preset.plugins 不同寻址；重复 ID；未知字段/注释/`!!js` 保留；已存在/缺失 patch；锁竞争/超时；外部修改 revision 冲突；普通字段与 volatile 字段差异；整 config 物化后的 bundle 新增字段；删除单字段与移除整条 config 的不同继承结果；失败后的原文件恢复及重启回读。

本次仅源码验证，以上矩阵尚未执行；没有声称写入路径已通过运行时/桌面验收。

## 写入专项读取清单与哈希

限定 8 个源码文件，总大小远低于 1 MiB，每文件低于 200 KiB；`package.json` 只用于版本元数据，不计源码文件配额。

| 文件 | SHA-256 |
| --- | --- |
| 固定主线 `packages/boot/config-editor/src/index.ts` | `34a0b17d43446f8e35d4a35de0da2fd0f93673a3dc925956a6abfa4d8ffcbf33` |
| 固定主线 `packages/boot/app-boot/src/index.ts` | `d8c1d397be0560cfbb9692d1fb0def081239625d464b48fd245f5b1baa34ac72` |
| 发行包 `@deepseek-ai/dsh-settings/lib/index.js` | `9432b872597b7a31473072eb38a55979ab23375c76bd1d86d751388a692a0136` |
| 发行包 `@deepseek-ai/dsh-config-editor/lib/index.js` | `373e05c8250d25dda983ccf6e214a55e3792a211d1a7b883affcd66de47b5bf8` |
| 发行包 `@deepseek-ai/cordis-plugin-include/lib/index.js` | `ad5eaf3b80a8fd9945466486493a0d1a8e9590895bcde01e5673f3d07b4fd306` |
| 发行包 `@deepseek-ai/dsh-api-settings-controller/lib/index.js` | `dd2bdf646a251745093f854e39399931a1efb8b68f789914b9f754bbc2bf1e2d` |
| 发行包 `@deepseek-ai/dsh-atomic-write/lib/index.js` | `5f07978ef594a2711b2da301d5cb73a835cf1a48c1f8920ab5c6625137e12029` |
| 发行包 `@deepseek-ai/cordis-plugin-loader/lib/index.js` | `638b9ad360e01236120772323f80a65570c4f3f42f4cfc6243330241025b6d72` |

发行包文件完整公共前缀：`/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/`。Cordis include 版本为 `1.0.10`，Loader 为 `1.0.6`；其余 4 个 DSH 配置相关依赖版本为 `0.2.0-rc.2`。

未核验：固定主线 SettingsForms/RPC 是否相对发行包发生其他变化；任意插件 Config schema 导入的副作用与可离线导出性；所有 bundle 的提供器布局；运行时热应用与失败回滚的实际集成行为；离线写入后重启的实际持久化结果。


补充发行包的可定位证据（版本均为 `0.2.0-rc.2`）：

| 文件 | SHA-256 |
| --- | --- |
| @deepseek-ai/dsh-app-boot/lib/index.js（`@deepseek-ai/dsh-app-boot/lib/index.js:61`） | `234db45e1b3f8c683b5bc1f551948b2a2ec52a6468c7b6937725a23f1c0e0d96` |
| @deepseek-ai/dsh-home-paths/lib/index.js（`@deepseek-ai/dsh-home-paths/lib/index.js:1`） | `97c1c10b299a4f2aec5f34bac5370cad3834391cd75c91a76b1e7b8a643584f5` |
| @deepseek-ai/dsh-skill-filesystem/lib/index.js（`@deepseek-ai/dsh-skill-filesystem/lib/index.js:1`） | `244e92e032ef15e96cb60c9e2cfddf5d89e167eb171fcbfd83e9415b0455a0d7` |
| @deepseek-ai/dsh-base/cordis.patch.yml（`@deepseek-ai/dsh-base/cordis.patch.yml:295`） | `9c2be64f46a193eff3cca190c26e697e8e8eee25c9b40149dfdb56f8142c252d` |

## 主线程补充证据与交付边界

补充读取的固定文件：`apps/cli/src/profile-boot.ts`、`apps/cli/src/dump-config.ts`、`packages/preset/agent-preset/src/index.ts`、`packages/preset/agent-preset-registry/src/index.ts`、`packages/skill/skill-filesystem/src/index.ts`、README 与 LICENSE。另核对发行包 app-boot、home-paths、skill-filesystem 和 dsh-base 的通用源码。全部 19 项大小、SHA-256 和版本记录在本任务本地 `.scratch/dsh-config-research-2026-10-18/source-evidence.json`；以上发行包证据属于可定位版本的程序源码，不包含任何个人 Profile 内容。

现有实现核查以当前工作树为准（含上一批未提交修复），项目 HEAD 为 `e14dbf47af03a5d2c85ac9aca0a0688b504c8751`。本轮只新增/修正文档，未修改应用实现、未读取或修改个人配置、未安装/升级 DSH、未启动运行实例、未提交。文档本地链接与差异检查完成；因仅调研文档，没有运行应用构建。上游测试源和端到端运行行为未在本次执行或验证；测试矩阵是后续验收要求。
