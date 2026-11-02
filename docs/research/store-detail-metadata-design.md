# 技能商店详情字段与页面方案

日期：2026-11-02。状态：用户已授权实施，产品改动及定向验证完成，最终正常App打包及本轮实际检查通过，用户手动验收待完成；实现已纳入数据层 `1130aad` 与界面 `f5248be`。适用范围仅技能商店详情，其他Agent、托管技能及原生技能页面不增加商店字段。

## 1. 推荐的数据方案

继续使用现有匿名公开接口及官网详情响应，不为这批字段新增OIDC认证、账号设置或服务端代理。当前文档化v1并未声明技能Summary、GitHub Stars或Topics，认证不能据此解锁这三项。

榜单／搜索只负责列表与排序；详情页读取的同一份官网响应一次性解析可用元数据、Summary、Installation与展示正文，并共用已有请求和缓存。真实SKILL.md仍走已验证的公开下载快照／原版well-known读取，与预览和源码共用同份内容。原安装按钮继续原来源检查流程。

| 信息 | 首选来源 | 数据含义与边界 |
| --- | --- | --- |
| 简介 | 作者description；网站原文已有元数据可复用，否则沿用真实正文摘取 | 不把官网Summary、正文摘取、作者description混成同一数据字段；不自动生成摘要。 |
| Installation | 官网Installation组件的command、prompt及已验证的完整sourceUrl | URL保留网站子路径；完整Command和Prompt只用于阅读／复制，不能执行网页命令。安装按钮继续传原来源与所选技能给原向导，不直接运行复制的命令。 |
| Summary | 官网独立Summary区块 | 保留段落与要点结构，与SKILL.md分开；不从正文反向生成，不改写／翻译成替代摘要。 |
| Repository／Source | 已知GitHub来源及官网Repository／Source区块 | GitHub保存仓库名称与实际链接，网站显示完整Source URL；不要把网站硬包装成GitHub仓库。 |
| GitHub Stars | 官网GitHub Stars区块的可见值 | 保留如37.5K的显示值；页面未提供精确整数时不反推37500，不为此单独请求GitHub API。 |
| Topics | 技能标题下、属于当前技能的主题名称及链接 | 排除页脚Topics导航和More in相关技能区域；点击打开对应官网主题页，不增加未经批准的商店主题筛选模块。 |
| 安装量 | 当前榜单／搜索记录 | 保留当前累计、趋势或小时指标含义，不因新增字段改变计数语义。 |

来源依据：[官网find-skills详情](https://www.skills.sh/vercel-labs/skills/find-skills)、[官网lark-note详情](https://www.skills.sh/site/open.feishu.cn/lark-note)、[官方API文档](https://www.skills.sh/docs/api)、[原始文件数据调研](store-skill-source-data.md)。

## 2. 页面位置

保持现有SkillDetailHeader：返回、技能名称和右侧安装按钮；其下仍为原简介。

简介下复用SkillDetailMetadata的现有双列布局：仓库／来源、GitHub Stars、安装量、主题。主题使用已有紧凑标签与链接；长来源自然折行，不能横向挤压。网站缺少Stars、Repository、Topics时不显示相应空行、未知值或占位卡片，Source与安装量仍保持原布局。

文档使用现有SkillDocument控制条，顺序为：**安装／概述／预览／源码**。

- 预览、源码：仍由同份真实SKILL.md驱动。商店初始选择首个可用项，优先安装，其次概述，再预览；其他Agent继续默认预览。
- 概述：新增，承载官网Summary的段落和要点，不在简介下再放一个长概述卡片。
- 安装：新增，承载完整Command与Prompt，各自使用共享CodeBlock及复制操作；没有第二个执行／确认安装按钮。中文显示“命令”“提示词”，技术内容保持原文。
- Summary缺失时隐藏概述Tab；Command／Prompt均缺失时隐藏安装Tab。不为未提供数据的字段新增永久空状态Tab。
- 没有真实SKILL.md时继续现有预览与源码资格规则；Summary／Installation不能被当作技能源码。当前选中Tab在刷新后确实消失时回到预览，不留空白选中态。

## 3. 解析修正与读取顺序

1. 继续校验详情canonical与请求技能身份。
2. 复用现有Flight记录解码及UTF-8引用解析，但按页面语义区块定位Summary、SKILL.md、Installation、Repository／Stars及标题标签。
3. 先修正现有“任意prose HTML均视为短正文”的规则：Summary内部也使用prose，不能与SKILL.md同时计为正文候选。按Summary／SKILL.md标题所在区域及对应记录引用区分，不能在全文中用样式或“遇到第一个段落”猜。
4. 详情响应到达时一次提取上述字段；额外字段失败不阻断有效正文、来源或安装。安装来源身份错误仍按当前规则单独报错，不猜地址。
5. 与现有简介／正文共用一次请求与缓存，不因切Tab再次下载详情。新增字段加入同一缓存记录，兼容旧记录；仅在用户打开详情且当前缓存缺相应结构时补读，不能为卡片预加载Stars和Topics。确认无字段与请求失败要分开，失败不能覆盖已成功数据。

不新增通用网页抓取框架、独立字段轮询、GitHub凭据、翻译开关或额外客户端配置。只适配当前已核验页面契约。

## 4. 原型与验收范围

交互原型保存为线程内的skills-store-detail-fields.html，可切换GitHub技能与网站技能、安装／概述／预览／源码；展示长短信息的位置及缺字段时的布局。原型中的简介／摘要为排版示例，正文为明确标注的原文节选，数量为静态示意；正式实现显示源数据原文。原型不执行安装、不修改技能或配置。

实施后集中验证：一个完整GitHub示例、一个缺少可选字段的网站示例、一个带网站子路径的安装来源；覆盖Summary与SKILL.md不混淆、可选Tab、同份原文预览／源码、Tab切换无重复网络请求及原安装向导。复用原CLI安装验证；不扩展全部Agent／主题／窗口矩阵。用户已确认实施；实际验证证据和剩余边界见计划0004对应交付记录。

本次同时按用户追加要求：卡片空间不足时组合既有Button icon-sm与Hint，宽卡保留图标与文字；只使用布局container query，不新增组件皮肤。安装量显示统一M/K，中文总量提示为“安装量”。原型文件保留最初方案历史，其标签／顺序以本次追加授权及正式实现为准。
