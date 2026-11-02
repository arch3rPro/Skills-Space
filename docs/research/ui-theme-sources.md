# 界面主题来源与导入范围

本文维护主题来源与导入证据；当前设计规则和主题／组件职责见 [UI 设计基线](../design/ui-system.md)。tweakcn 是主题来源，shadcn 的 `radix-nova` 是组件样式基础，两者不可混称。

导入核对日期：2026-10-13；设计基线更新：2026-10-23。主题 token 随前端打包，不在运行时下载。保留八套导入主题并增加本地 Codex 配色；新配置默认 Codex，显式保存的选择保留。字体及字号独立设置。

| 主题 | 来源 |
| --- | --- |
| Claude、Caffeine、Darkmatter、Modern Minimal、supabase、vercel、twitter | [tweakcn 官方预设](https://github.com/jnsahaj/tweakcn/blob/main/utils/theme-presets.ts) |
| Dark Forge | [Hanif Rahman 的社区主题](https://tweakcn.com/themes/cmlf2jr3m000204k31tapa3fa)，[公开 registry 导出](https://tweakcn.com/r/themes/cmlf2jr3m000204k31tapa3fa) |

除下述已授权的本地调整外，保留 light／dark 原始语义颜色、圆角与阴影；dark 缺少的共享值从 light／theme 合并。仅提取已知 token，不导入第三方 CSS 规则或脚本。原预设字体不自动下载；用户可选择应用自带 Geist、系统、衬线或等宽字体，并设置 14／16／18 px。

官方源码下载 SHA-256：`d333858a5a4f1e2fd615f1b73709f552e5a84c12882196456dfc48e1f09376a8`。
Dark Forge 导出 SHA-256：`78a68466dc60b61ead8e379e138d9c0f49528700332b808227a49253aa56cb6b`。

官方仓库当前许可为 Apache-2.0，许可副本保留在 scripts/tweakcn-LICENSE.txt。社区导出未附独立 license 字段；保留作者与公开来源，不将仓库许可冒称为社区作者的独立授权声明。

当前 token 在 src/lib/theme-presets.json，主题／字体应用与启动缓存位于 src/lib/appearance.ts。偏好文件仍是原 preferences-v2.json，新增字段兼容缺失值；本地缓存只保存外观，不保存项目目录或凭据。


2026-10-15 本地调整：按用户要求降低 Vercel 的文字对比度。主要 foreground 系列由 light 的纯黑调整为 OKLCH L=0.30（约 #2e2e2e），dark 的纯白调整为 L=0.90（约 #dedede）；反色按钮的文字使用对应的柔和黑／白，muted-foreground 从 light 0.44 调至 0.48、dark 0.72 调至 0.68。背景、primary 填充、边框、圆角和其他七套主题未修改。上面的 SHA-256 仍为原始来源下载证据，并非本地调整后数据的校验值。

2026-10-17 本地调整：按用户要求，将 Vercel 浅色 sidebar 从 OKLCH L=0.99 调至 L=0.96，与 L=0.99 的正文背景区分。顶部原生窗口底色继续跟随 sidebar token；深色及其他主题不变。

2026-10-17 本地调整：Supabase 浅色 sidebar 从与正文相同的 #fcfcfc 调为 #f2f2f2；深色 sidebar 从与正文相同的 #121212 调为 #0b0b0b。两种模式均通过底色区分侧栏与正文，强调色和其他 token 不变。

2026-10-17 全主题复核：对八套主题的 light/dark 共16种组合检查 sidebar 与 background。延续以上 Vercel／Supabase 修正，仅补充调整下表的 sidebar；已有明确区分的组合，以及其他语义 token 均保留。颜色明度比较用于发现候选问题，不作为文字可读性或 WCAG 合格声明。

| 主题 | 模式 | sidebar 原值 | sidebar 新值 |
| --- | --- | --- | --- |
| Claude | 浅色 | #f5f4ee | #efeee7 |
| Caffeine | 浅色 | #fbfbfb | #ededed |
| Darkmatter | 深色 | #121212 | #0b0b0b |
| Modern Minimal | 浅色 | #f9fafb | #f0f1f3 |
| Modern Minimal | 深色 | #171717 | #0e0e0e |
| Twitter | 浅色 | #f7f8f8 | #f1f3f3 |
| Dark Forge | 深色 | oklch(0.1367 0.0046 51.0514) | oklch(0.1000 0.0046 51.0514) |


2026-10-23 本地设计基线推广：新增 Codex 配色，取自用户已确认的库存／详情／弹窗样板，由项目自身维护；参考为 [第三方 Codex 设计整理](https://codex-design.beacon.host/)，不声明为 OpenAI 官方主题或 tweakcn 原始导出。已有八套主题颜色数据保留。运行时仅应用配色，圆角和浮层阴影统一由项目设计基线管理，不再应用主题导出的 radius／shadow 参数。新配置及缺失字段默认使用 Codex 配色、系统字体；显式保存的配色、字体、显示模式和字号保留。来源文件摘要仍仅标识原始下载，不标识本地数据。
