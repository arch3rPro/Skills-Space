# 0007 DeepSeek Harness 技能管理与智能体分类

日期：2026-10-17。状态：首批实施、专项验收及完整原生回归完成。

后续：用户已批准的 [0009 DSH 原生补齐](0009-dsh-native-skill-management.md) 扩展下述首批只读边界，增加受控配置、独立文件调用策略和废纸篓卸载；首批验收数字保留原时点，不代表本批结果。

## 范围

DeepSeek Harness 使用应用身份 `deepseek-harness`；不改变固定 `skills@1.7.2` 的 79 项 Agent 清单。应用在进程调用边界将 `--agent` 列表中的该身份映射为原版 `universal` 并去重，其他参数保持原值。通用安装目录仍为项目 `.agents/skills` 与用户 `~/.agents/skills`，不增加 DSH 副本、不修改 CLI 发行文件和锁文件格式。

安装、更新和卸载仍由原版 CLI 执行。更新保持原有按技能／来源的实际影响范围；共享卸载展示所有关联及真实物理路径。DSH 专属目录、配置目录和扁平 Markdown 不因被发现而获得 CLI 生命周期权限；同名歧义拒绝变更。

## 只读检查

应用观察默认项目／用户 DSH 与共享目录、静态绝对配置目录、用户 Profile 和 preset 的技能配置声明。检查只解析数据，不运行 DSH、插件、组合或 `!!js`，不读取 settings.yaml 中的其他命名空间，不输出无关参数／秘密。

目录规则以已核查的本机 CLI 0.2.0-rc.2、桌面版 0.2.0-rc.2（实施期间用户将 CLI 从 0.1.0-rc.7 更新，已重新核查关键接口） 和 [提供器固定提交](https://github.com/deepseek-ai/deepseek-harness/blob/c291e7961a515f6d7af9304e7fd1d257929aef26/packages/skill/skill-filesystem/src/index.ts) 为依据。扫描单层目录技能和扁平 `.md`；检查 YAML、名称、描述和调用限制。默认目录同名顺序只表示静态发现规则，不表示会话实际加载。配置目录中的候选不参与跨 Profile 的获胜断言。

项目根目录按最近 `.git` 祖先确定。子目录安装目标与 DSH 根目录不一致时拒绝 DSH 安装；环境变量明确改写默认共享根时仍拒绝 DSH 安装。Profile 未选择、缺失 bundle、默认发现关闭、动态声明或失效检查上下文只影响原生发现／配置编辑，不阻止原版 CLI 安装到标准共享目录，也不证明 DSH 会话实际加载；不修改原生配置来适应 CLI。

设置 → 智能体 → DeepSeek Harness 提供范围、Profile 筛选、目录和配置声明以及重新读取；不提供保存、原生配置写入或共享技能独立启停。技能详情显示格式、调用策略、默认目录覆盖和待核对原因；安装／可发现／实际加载保持独立。技能卡片只提示格式错误、同名覆盖或模型与用户调用均被禁止等异常；默认目录匹配、配置目录和仅手动调用等正常状态不额外提示，完整检查说明保留在详情。

首批检查不执行完整 Cordis 组合，不导入发行包代码，也不读取桌面 app.asar 中的插件组合来推断活动会话；自定义插件、运行时参数、相对目录声明和归档内资源保留为验证限制。

## 智能体分类与排序

设置列表采用“增强适配 / 通用支持”。分类由应用声明的原生库存／设置能力决定，与安装状态及显示开关独立。Pi、Hermes、DeepSeek Harness 为增强适配；Hermes 无可写配置页，不显示设置按钮。其他 Agent 保持通用支持。

两个组共用搜索、安装状态筛选与重新检测，复用现有两列行布局。组内支持拖动及四方向键排序，不能拖入另一组。沿用原有 `agentOrder`，移动时只替换本组位置，保留其他组、未知 ID 和筛选外记录；不新增分类偏好或迁移旧设置。侧栏和安装选择器继续使用全量保存顺序。进入只读设置再返回保留搜索、筛选与排序。

## 验收记录

通过：

- 隔离 HOME／Git 项目中，原版 CLI 完成全局和项目安装、来源实际内容由版本一更新到版本二、共享卸载和锁清理。源目录保留；DSH 原生目录只读，子目录与 Git 根不一致等边界拒绝安装。
- macOS arm64 隔离桌面完成 DSH／Codex 联合安装、检查更新、更新确认、共享卸载影响确认及真实文件核验；DSH 原生技能保留。只读设置显示 Profile、watch 声明和自定义目录，切换项目范围正常；返回保留筛选。
- 分类搜索、组内键盘／拖动排序、跨组拖动拒绝通过；正常退出并重新启动后，技能、分组顺序和侧栏顺序保留，未知 Agent ID 未丢失。浅色和深色桌面页面已核对。
- 前端契约共 83 项通过；DSH helper 4 项在最终严格布尔校验后再次通过。原生套件 123 项，修复既有测试预期后在宿主权限下完整运行，120 项通过、0 项失败、3 项公网测试忽略。新增两项 DSH 原生测试通过。
- `pnpm build`、`cargo check --offline --manifest-path src-tauri/Cargo.toml --lib`、`CI=false pnpm tauri build --debug --bundles app` 通过；Rustfmt 与差异空白检查通过。原版 CLI 发行文件未改写，上游注册表仍为 79 项。
- 卡片提示收敛后，中英文正常／异常分支及详情保留检查通过，前端和桌面构建通过；隔离桌面已观察正常 DSH 技能卡片不再显示额外信息按钮。未重新执行生命周期回归，本次只调整前端提示。
- 验收使用隔离目录；真实用户偏好、Agent 配置及选定技能文档共 11 个文件的前后指纹一致。DSH fixture 配置亦未被应用修改。

既有失败已解决：`upstream::tests::zero_exit_noop_does_not_verify_install_or_removal` 的 `failed / uncertain` 预期沿用了逐技能执行方式；提交 `696205e` 已将安装改为一次原版 CLI 调用。测试替身令整批非零退出，没有逐项成功证据或实际内容变化，正确结果为 `failed / failed`。本轮只修正测试预期，不改执行实现；增加完整技能列表只调用一次、无自动重试及 JSON 声称成功但未写入仍为待确认的断言。原版 CLI 的真实部分失败测试继续通过，独立核验成功项仍为成功。初次沙箱运行的回环网络权限失败在宿主权限下完整回归已消除。

未覆盖：真实 DSH 已认证模型会话及完整插件组合、其他操作系统、窄窗口和系统大字体专项验收。静态发现结果不承诺会话实际加载。实施与验证证据见本记录；未覆盖项不作为已验证能力。

## 2026-10-19 — 托管安装阻断修复

Profile 的缺失 bundle、动态声明或失效检查上下文不再作为原版 CLI 共享目录安装的前置条件；原生设置写入和发现仍保留原限制，实际加载不由安装成功推断。已确认的项目根／默认共享根路径冲突继续拒绝。隔离回归在缺失 bundle 和失效检查选择下验证全局／项目安装及再次安装，原版更新、共享卸载与 Profile 字节保留断言不变。`darwin-skill` 另触发了来源指纹上限和错误分类问题，修复及实际仓库隔离验收见 [上游集成记录](../research/upstream-command-map.md#2026-10-19--带媒体附件技能的来源指纹修复)。


2026-10-20 copy/closure correction: Chinese configuration sections use 配置; named Profile and actual configuration files remain distinct. Read-only reasons describe known settings ownership without claiming unobserved causes. For a user-level overlay or unreadable user configuration, the existing configuration-file link displays and opens that user file rather than the Profile patch; editing and inheritance contracts remain unchanged. No control or editing capability was added. The read-only fixture asserts this link target while retaining all original ownership/stale-write protections.
