# DSH Skills Manager 非破坏启停机制调研

日期：2026-10-30。范围：只读审查社区仓库 MichengAI/dsh-skills-manager；未安装依赖、未运行插件、未启动 DSH、未执行测试或构建，未修改用户配置。本文为机制调研，不是接入方案或功能验收。

## 证据版本与结论

固定源码：提交 `93f0c49acf33c17cc9a185baec68abe42a83ef1a`，提交时间 `2026-10-29T19:25:52+08:00`，package 版本 `1.2.23`。以下源码链接均固定到该提交。[版本声明](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/package.json#L1-L4)

**“不改技能文件”是通过本地状态与 DSH 运行时 provider 覆盖实现的。** 启停写 `$DSH_HOME/skills-manager/state.json`；插件在宿主全局和各个活动 Agent 的技能层注册自己的 provider，发布带调用策略的候选。官方 filesystem provider 本身并未被修改或卸载。因此，单独写 JSON 不会让没有该插件的 DSH 获得启停能力；这也不是其他 Agent 共用的跨工具开关。[状态路径](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L619-L625)、[provider 注册](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L231-L282)、[全局与 Agent 层挂载](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L312-L324)

README 承诺启停只影响 DSH、不改第三方源文件；源码确认启停路径只写 manager 状态。该承诺不能扩大为“插件全部功能不写技能”：创建、导入、仓库安装和回收另有写入职责。[README 使用说明](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/README.zh-CN.md#L110-L120)、[启停实现](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L2537-L2559)、[仓库安装边界](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/README.zh-CN.md#L153-L158)

## 从开关到调用策略

1. `/enable`、`/disable` 路由调用 `setSkillEnabled`，成功后触发目录失效及菜单刷新。[路由](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L592-L610)
2. manager 以来源 key 和技能条目名记录 `enabledSkills`、`disabledSkills`；来源整体开关记录在 `sources`。写入采用状态归一化和原子文件写入，不编辑技能 frontmatter。[单技能状态](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L2498-L2559)、[来源状态](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L2403-L2421)、[持久化](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L2305-L2311)
3. `effectiveSkillPolicy` 在来源关闭、显式禁用或状态不可读时输出 `modelInvocable=false`、`userInvocable=false`。恢复启用仍保留有效 frontmatter 的 `disable-model-invocation` / `user-invocable` 限制；`enabled=true` 不等于强制开放两个通道。源码中“恢复模型与 / 手动调用”的简短注释应以函数实际行为为准。[策略组合](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L2313-L2357)、[frontmatter 解析](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L1840-L1885)
4. provider 按声明技能名分组、排序，优先选择未被 manager 停用的副本；必要时发布比原生副本更高优先级的覆盖候选。因此，停用一个副本可能切换到另一份同名且启用的技能，并不等于停用全部同名技能；全部副本不可用时保留阻断，而不是简单删除候选后让原生副本重新露出。[选择算法](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L4046-L4072)、[覆盖候选](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L3916-L3979)
5. 刷新调用 provider control 的 `invalidate`；随后发出 `commands/change`，并借用各会话的 `agent-preset/selected` 事件清除 Web `/` 菜单缓存。源码备注后者依赖宿主事件转发行为，是兼容耦合点。[失效与通知](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L171-L201)

用于启停的关键扩展点是 **skills provider + Agent 生命周期事件**，不是修改文件的 filesystem hook。`tools/pre-execute` hook 在这里针对 `create_skill` 的创建确认，并非技能禁用拦截器。[Agent 注册生命周期](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L245-L282)、[创建工具 hook](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L326-L358)

## 官方 filesystem 的保留与覆盖范围

| 来源 / 情况 | 源码实际策略 |
| --- | --- |
| 原生 DSH 用户目录、项目 `.dsh/skills`，只有单份且无 manager 覆盖 | 通常不发布 manager 候选，由原生 filesystem provider 提供。 |
| 上述来源有显式启停、无效调用策略、状态错误、来源关闭或同名竞争 | 发布 policy overlay；用户 DSH 单份覆盖 rank 为 399，对应代码中的原生用户 rank 400；项目覆盖使用 root rank − 1。 |
| Shared Agent 用户目录 | 即使来源可写，也由 manager 提供候选，以保留递归发现和链接副本；其 rank 为 450。 |
| Codex、Claude 等外部来源及自定义来源 | manager 自行扫描并把内容提供给 DSH；不会使来源所属的外部 Agent 也遵守该开关。 |
| 关闭的纯外部来源，没有原生副本且没有显式单技能禁用 | 不发布候选，避免覆盖其他插件的同名技能。存在原生副本、原生分发链接或显式单技能禁用时仍保留阻断候选。 |

以上范围由 `policyOnly`、`needsOverlay`、`hasNativeCopy`、`hasExplicitDisable` 和 rank 计算决定；不是全面替换官方 filesystem，也不是仅替它写启停字段。[完整候选构造](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L3898-L3981)、[原生根与 rank](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L141-L166)

manager 的 `get` 会重新解析候选路径并读取正文、检查真实路径与调用名，再返回资源基目录和内容。这确认它具有独立内容 provider 职责；不是仅向官方 provider 附加布尔字段。[get 实现](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L3984-L4038)

## Profile、preset 与目录作用域

- **安装 Profile 与策略存储不是同一作用域。** bundle patch 将插件插入安装所选 Profile；状态路径仅取 `DSH_HOME`，没有 Profile 名或 preset ID。由此推论：共享同一 `DSH_HOME` 的多个已加载插件实例会读到同一策略文件，不能据此承诺每个 Profile 独立开关。源码只在进程内排队 mutation；本文未验证跨进程同时写入行为。[bundle patch](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/cordis.patch.yml#L1-L7)、[DSH_HOME](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L133-L139)、[状态路径](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L619-L625)、[进程内队列](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L317-L324)
- **注册覆盖各活动 Agent，策略不按 preset 分表。** 新建和已有 Agent 均注册 manager provider，用更近的 Agent 技能层防止 preset 自带 filesystem 抢先；同一 root/技能开关不是只作用于当前选中 preset。[Agent 层注册理由与实现](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L245-L282)
- **目录库存不来自任意 preset 的 filesystem 配置。** `userRoots()` 以环境变量和各工具默认路径生成来源；项目路径来自当前调用 `cwd`；外部路径覆盖另存 `roots.json`。这条链没有解析 Profile/preset 内的 `customSkillDirs`、`includeDefaultRoots` 或任意 provider 实例。因此不能推导其面板等于每个 preset 的实际技能库存，也不能推导它能禁用任何自定义 filesystem 根中的技能。[用户来源](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L141-L411)、[项目来源](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L3899-L3915)、[目录覆盖边界](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L636-L663)
- **项目状态可区分项目，不代表 preset 级隔离。** 项目来源 key 含项目身份，候选按调用的 `cwd` 扫描；用户来源与共享状态仍参与该调用的候选竞争。[项目来源 key](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L490-L524)、[候选来源组合](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L3899-L3915)

## 兼容性和采用边界

README 宣称支持 DSH `>=0.2.0-rc.1 <0.3.0-0`，列举五个已测试版本；同一范围写在 manifest peer/engine 中。仓库保存的测试矩阵是作者的验证声明，本轮未重跑，不能转述为已在用户当前宿主验证。Node engine 为 `^22.19.0 || >=24.0.0`。[兼容版本声明](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/README.md#L77-L79)、[测试版本清单](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/scripts/hosts.mjs#L1-L5)、[manifest 合同](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/package.json#L58-L94)

可加载条目要求 frontmatter、非空 description 与宿主可接受的英文调用名；中文目录可配英文声明名。state 文件不存在时使用默认策略；文件损坏或不可读时锁定策略写入并关闭 manager 所控制候选的两个调用通道。这不能解释为任意第三方 provider 都会停用。[加载条件](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L1830-L1885)、[状态读取失败行为](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L2275-L2303)、[覆盖发布条件](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/core.ts#L3916-L3938)

卸载或停用插件后，它注册的覆盖 provider 随生命周期释放，原始技能文件仍在；由此推论，官方 filesystem 能发现的原始技能会重新遵从原文件与宿主策略，manager 的 JSON 不构成持久的宿主原生禁用。实际卸载后的会话缓存与刷新时点未运行验证。[provider disposal](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L246-L282)、[effect 挂载](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/src/index.ts#L323-L324)

对 Skills Space 的启示是：该仓库证明了“通过宿主 provider 实现不改文件的 DSH 启停”这条实现路径，但直接采用会额外引入来源发现、同名优先级和所有活动 Agent 的覆盖语义。应另行确认其与现有 Profile/preset/目录身份及原版 upstream CLI 所有权的兼容范围；本调研不授权安装插件、复用其生命周期写入器或仅写入其私有 JSON。仓库已有针对原生来源、外部同名副本、链接和调用阻断的回归测试可供后续集成验证参考，本轮只读测试源码，未执行。[回归测试源码](https://github.com/MichengAI/dsh-skills-manager/blob/93f0c49acf33c17cc9a185baec68abe42a83ef1a/test/disabled-external-native.test.mjs#L1-L145)
