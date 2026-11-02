# 商店技能原始文档数据来源调研

日期：2026-11-02。状态：只读调研完成；未改产品代码，未构建、安装或克隆仓库。

目标：商店详情复用现有 `SkillDocument` 的预览／源码交互，同时不因浏览而克隆仓库。这里的“源码”严格指实际来源的 `SKILL.md`，不是官网HTML，也不是HTML反向转换的Markdown。

## 结论

- 官网公开详情提供完整渲染正文，但本轮两个实际页面没有提供原始Markdown、确切仓库文件路径或固定revision。可以继续供正文浏览，不能直接充当源码。
- **原版CLI实际使用的公开 `/api/download/{owner}/{repo}/{slug}` 已验证能匿名返回真实文件快照。三个GitHub来源均200，直接取得含frontmatter的SKILL.md，无需tree映射、GitHub API或克隆。** 文档化 `/api/v1/skills/{id}` 是另一路接口，两种来源的匿名请求均401；不能把v1的限制推广到原版下载接口。
- 网站来源可依原版well-known协议找到并读取真实 `SKILL.md`。`uizze.sh/ui-taste` 已实测成功，清单和单文件总计约10KB，不必获取其余25个文件或克隆。
- GitHub源码的推荐默认来源是原版下载接口中的SKILL.md快照，不是猜测raw路径。快照可能缺失，且没有commit／确切仓库路径；它足以供浏览预览／源码，但不能证明等于当前分支或未来安装结果。
- 想让预览与源码真正一致，二者必须由同一份原始Markdown生成。不能将官网索引时刻的HTML与来源当前分支上的Markdown组合后声称同一版本。

## 1. 官网公开详情与快照

主来源：[API文档](https://www.skills.sh/docs/api)、[GitHub技能详情](https://www.skills.sh/vercel-labs/skills/find-skills)、[网站技能详情](https://www.skills.sh/site/uizze.sh/ui-taste)。

本轮重新通过只读HTTP请求检查页面完整响应与所有 `self.__next_f.push` Flight字符串，不只检查首屏可见正文：

| 请求 | 状态／大小 | 实际字段与限制 |
| --- | --- | --- |
| `/vercel-labs/skills/find-skills` | 200；83,299字节HTML | 文档为 `previewHtml`＋`restHtml`；GitHub链接仅指向仓库根。未找到原始Markdown、`skillPath`／`sourcePath`、commit／revision、blob／tree链接或单文件下载地址。 |
| `/site/uizze.sh/ui-taste` | 200；57,625字节HTML | 同样为渲染HTML；没有真实源码字段或固定文件revision。正文中出现的“Markdown”是普通说明文字。 |
| `/api/v1/skills/vercel-labs/skills/find-skills` | 401；206字节JSON | `error=authentication_required`；message明确要求Vercel OIDC token。 |
| `/api/v1/skills/uizze.sh/ui-taste` | 401；206字节JSON | 与GitHub来源相同的认证要求。 |

官方API详细响应结构为 `id/source/slug/installs/hash/files`，`files`元素包含 `path` 和完整 `contents`；`hash`与`files`可能为null（无快照）。API的认证为Vercel项目OIDC，不是把桌面用户的GitHub登录当作该认证。文档给出的 `installUrl` 可定位安装来源，但不是 `SKILL.md`文件路径。

“公开页面不含原始文件”的判断仅覆盖上述两个本轮实际样本和所查公开契约；不宣称已证明站点不存在任何内部数据接口。没有把猜测的私有接口设计为生产依赖。

## 2. 原版CLI的公开文件快照：GitHub来源的推荐方案

父级进一步检查原版 `skills@1.7.4/dist/cli.mjs:4062` 的 `fetchSkillDownload`，发现实际读取的不是v1 API，而是：

`https://skills.sh/api/download/{owner}/{repo}/{slug}`

本轮按原版真实端点逐一只读请求：

| 技能 | 匿名结果 | 实际文件 |
| --- | --- | --- |
| [vercel-labs/skills/find-skills](https://skills.sh/api/download/vercel-labs/skills/find-skills) | 200；5,766字节JSON | 1文件；SKILL.md为5,472个UTF-8字节，含frontmatter。 |
| [anthropics/skills/frontend-design](https://skills.sh/api/download/anthropics/skills/frontend-design) | 200；20,008字节JSON | 2文件；LICENSE.txt及9,390字节的SKILL.md。 |
| [ayghri/i-have-adhd/i-have-adhd](https://skills.sh/api/download/ayghri/i-have-adhd/i-have-adhd) | 200；10,118字节JSON | 3文件；agents/gemini.toml、agents/openai.yaml及7,201字节的SKILL.md。该仓库不在原版快速安装owner白名单内，仍可读取快照。 |

三个响应顶层都只有 `files` 和 `hash`；`files`项为 `path/contents`。这是可直接供现有Markdown组件使用的真实文件快照，不是渲染HTML反向生成。一次保存SKILL.md后，预览与源码可以使用同一份字符串。

限制必须分清：

- 端点虽由锁定原版CLI使用，但没有在当前v1公开API文档中独立承诺；本轮三个成功样本不保证每个榜单记录都有快照。无快照时不能伪造源码或静默克隆。
- 下载结果未返回commit、repoPath或快照时间。身份来自精确请求的source／slug，不能冒充已确认的最新默认分支文件。
- 三个返回hash分别为 `b146008599c31057cef1c145774cea5d5afb30e8f43fa802e47a4b461419aaaf`、`7e9c2af00fd5b3144f49ce6fb1b16037b392ab9c2f049423b0b6114d99381ba2`、`66c66270bbb84282f56f846107a64aeca77121ac11215188bb30eded7c3ff059`。使用原版 `computeSnapshotHash` 的精确Node算法（路径localeCompare排序后依次hash路径和contents）重算，三个样本均不相等。故不能将该字段描述为本地可复算的内容校验值；可保留为服务快照标识，并另算本地内容指纹。原版对完整下载结果直接透传hash，仅裁切文件集时重算；本轮没有修改或规避原版安装核验。
- 原版 `tryBlobInstall` 本身还先依赖tree／raw获取技能身份，并有owner允许列表、fullDepth限制及失败回退克隆。浏览应只读取文件快照，不调用整个快速安装函数。安装继续走现有原版检查，不把浏览快照当作Inspection。
- 这使GitHub官方tree／blob成为可选的有条件数据方案，而不是商店浏览的必经依赖；不会因每张卡片读取源码而消耗GitHub REST目录额度。

## 3. 网站来源：原版well-known发现可以直接取得真实文件

主来源：本项目锁定的原版发布包 [`skills@1.7.4/dist/cli.mjs`](https://unpkg.com/skills@1.7.4/dist/cli.mjs) 中 `WellKnownProvider`；本地对应 `node_modules/skills/dist/cli.mjs:3134–3420`。本轮未修改该包。

原版依次读取 `.well-known/agent-skills/index.json`、`.well-known/skills/index.json`，支持源URL子路径及域名根发现。必须按所用清单的版本解析，不能一律拼接一个猜测的文件路径：

- **无 `$schema` 的v1清单**：条目声明 `name/description/files`，`files`必须包含SKILL.md。原版由实际命中的base与well-known目录构造 `/{well-known}/{entry.name}/SKILL.md`。清单条目名用于安装选择；文件frontmatter中的 `name` 与 `description`仍须读取校验，不能把这两种身份混为一谈。
- **v2清单**：`$schema=https://schemas.agentskills.io/discovery/0.2.0/schema.json`，条目声明 `name/type/url/digest`。相对 `url` 相对于实际index地址解析。`type=skill-md`可单文件读取并校验SHA256；`type=archive`提供的是归档，需要获取归档、核验digest并从中读取根SKILL.md，不能声称始终只下载一个Markdown文件。

本轮实际请求：

| 公开URL | 结果 |
| --- | --- |
| [agent-skills清单](https://uizze.sh/.well-known/agent-skills/index.json) | 200；2,393字节；无schema的v1，含 `ui-taste` 与 `ios-design`。ui-taste声明26个文件且含 `SKILL.md`。 |
| [skills别名清单](https://uizze.sh/.well-known/skills/index.json) | 200；2,393字节；本轮响应内容相同。 |
| [ui-taste原始文件](https://uizze.sh/.well-known/agent-skills/ui-taste/SKILL.md) | 200；7,645字节；含完整frontmatter，`name: ui-taste`、`metadata.version: 0.3.0`和原作者description。 |
| [原始文件别名](https://uizze.sh/.well-known/skills/ui-taste/SKILL.md) | 200；7,645字节；与上一地址字节SHA256一致。 |

文件SHA256：`d1d73a4370a444af09869d55374be27c15a67d232b3d05ff11202508909e7c00`。它是本轮下载内容指纹，不是发布者v1协议提供的不可变revision。初次默认urllib请求该原始地址返回403，随后带明确研究User-Agent的两个请求均200；仅记录差异，不据此认定403原因。

这条路径足以让同一真实Markdown同时驱动原预览／源码组件；简介可以取其frontmatter。缓存应保存同份内容与来源身份。支持文件仅在用户实际需要时另议，本次读取正文不需要获取它们。v1网站可能随时更新；一次读取后在本次详情内切换预览／源码，应共用保存的同一份内容，不能每次切换重新独立获取。

## 4. GitHub直接tree／raw方案与原版发现一致性

本节由主代理核验锁定CLI和GitHub接口，整合到同一记录。

原版 `discoverSkills`（发布包约1250–1397行）按根技能、优先目录、插件声明、必要时递归的规则发现技能，解析frontmatter的name／description，处理internal过滤及锁记录排除，再按精确name去重；`filterSkills`选择名称时忽略大小写。本项目read-only helper已经调用原版函数。商店slug或某个目录名本身不足以确定哪份文件会被原版选中。

技术上，GitHub [Contents](https://docs.github.com/en/rest/repos/contents)、[Trees](https://docs.github.com/en/rest/git/trees)和[Blobs](https://docs.github.com/en/rest/git/blobs)可以不克隆就读取文件；已知路径的raw文件本轮实际可读，包括find-skills与i-have-adhd主技能及Cursor副本。该可读性不证明任意仓库的路径映射正确。

通用方案还要解决：

1. 不能从 `{owner}/{repo}/{skillSlug}`直接猜成 `{skillSlug}/SKILL.md`；需要真实文件身份或完整遵循原版发现顺序。
2. 同名副本、frontmatter名与目录名不同、插件声明及internal处理会影响应选文件，不能以“路径中最像技能名”替代。
3. 固定默认分支的commit后再按该commit读取tree和blob，才能避免目录与内容跨版本。递归tree可能 `truncated=true`，不能当作完整发现结果。
4. 匿名REST额度为[每IP每小时60次](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)。主代理本轮实际对两个仓库tree请求均收到403 `API rate limit exceeded`，未继续重试。raw端点可读不能自动补出缺失的目录映射。

本节不推荐再写一套根据HTTP目录名近似复刻的技能发现器。若以后明确做GitHub源码通用读取，需要先设计权威路径映射及其与原版发现一致性的契约；这超出共享详情组件本身的UI修复。

## 5. 对预览／源码复用的建议

| 已获得的数据 | 可以准确提供的能力 | 不应宣称的能力 |
| --- | --- | --- |
| 只有官网 `previewHtml/restHtml` | 完整官网正文预览 | 原始SKILL.md、当前来源版本或与来源当前分支一致 |
| 确认身份后的真实SKILL.md | 同一Markdown的预览／源码；frontmatter简介 | 未执行安装检查时保证其等于未来安装结果 |
| 原版公开download的files/hash | 同一真实文件快照的源码／预览，无需克隆 | 当前git commit、hash可按本地算法复算、所有技能必有快照 |
| 需OIDC的v1快照files/hash | 同一快照的文件源码与预览 | 匿名可用、必定有快照 |

最小完整方向：共享卡片与详情布局统一；GitHub来源按确切source／slug请求原版公开download，提取并缓存真实SKILL.md；网站来源按原版well-known清单读取真实文件。将同一份Markdown交给现有 `SkillDocument`，让预览／源码同源，简介可由同份frontmatter补齐。原官网HTML仍是可用的正文数据，但不能与另一时刻的Markdown混用并声称同版本。读取失败或无快照的界面取舍须明确，不伪造源码、不静默克隆。安装仍走现有原版发现与检查。

这份记录没有决定最终UI缺失源码的展示形式，也没有授权增加登录、代理服务、令牌设置或新的下载流程。本记录完成时产品改动待确认；随后用户已授权实施，共享卡片／详情与原始文档的实施及验证状态见[规范0003](../specs/0003-upstream-aligned-refactoring.md#商店共享交互与原始文档2026-11-02已授权实施)与计划0004。

## 6. 用户截图复核：网站安装、公开搜索及简介（2026-11-02）

本轮仅核实原因，未改产品代码、未构建。

- 当前MarketplaceSkill.previewable仅接受owner/repo，导致ui-taste等网站来源被本地禁用安装；原版CLI已有well-known安装能力，不是上游不支持。接入时不能仅把source域名加https：实读[飞书lark-note页面](https://www.skills.sh/site/open.feishu.cn/lark-note)的Installation与Source，实际来源是`https://open.feishu.cn/lark-cli/skills/regular`。应保留官网提供的完整来源路径，并用于原文读取、原安装检查和来源链接，不能只存域名。
- 本次官网客户端`/_next/static/immutable/chunks/0zfh1m9r3ttbf.js`实际搜索请求为`/api/search?q=...&limit=100`，无page/cursor；榜单另用`/api/skills/{view}/{page}`。实读lark搜索返回query/searchType/searchVersion/skills/count/duration_ms/timings_ms/provider_duration_ms，没有分页字段。单次100项HTTP观察约4.96秒，非速度基准。官方v1搜索文档也只列q/limit/owner，无分页参数。可以本地分页减少卡片渲染与简介订阅，但不能据此承诺消除远端请求耗时。
- 截图中的“重试简介”来自StoreDescription自行添加的失败按钮。实读lark-note页面HTTP200且有完整短正文，但没有previewHtml/restHtml折叠组件；现解析器只识别折叠正文，因而误报读取失败。lark-doc则有previewHtml/restHtml，但首个段落之前即出现H2；websiteIntroduction遇H2停止，错误得出无简介。二者是适配缺口，不是已证实无内容。简介应优先可靠元数据／真实来源清单或原文frontmatter，正文解析覆盖短正文与折叠正文；移除卡片内独立重试动作，复用列表刷新／重新进入的读取行为。未知不能缓存为确定无简介，也不应为了去掉按钮而吞掉读取错误。

该轮原因调研随后获用户授权修复：完整网站来源、短正文及首段提取、12项本地搜索分页和列表刷新重试已实现，定向测试及正常App打包通过；实际App与用户手动验收状态见计划0004对应条目。
