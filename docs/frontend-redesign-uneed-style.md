# 前端改造方案：aat.ee → uneed.best 风格

> 参考站点：https://www.uneed.best/
> 参考截图：首页首屏 / 首页中段 + 博客区 / 页脚
> 目标：把 aat.ee（Open-Launch，Next.js 16 App Router + React 19 + Tailwind v4 + shadcn/ui）的视觉语言与首页信息架构改造成 uneed 那种「浅色 + 橙色点缀 + 衬线大标题 + 三栏 + 多列页脚」的形态。

---

## 一、结论：可以改造，而且不需要重构数据层

改造本质上是**布局重组 + 主题换色 + 组件重写**，不是换框架：

- 技术栈完全够用：Tailwind v4 的 `@theme inline` 令牌（`app/globals.css`）可以整体换色；shadcn/Radix 组件库已经在位；`next/font` 已经加载了衬线字体 `IBM_Plex_Serif`（`--font-editorial`）和标题字体 `Outfit`（`--font-heading`）。
- 首页要展示的数据，**90% 现有 schema 里已经有了**：`project` / `project_translation` / `category` / `projectToCategory` / `tag` / `projectToTag` / `upvote` / `fumaComments` / `blogArticle` / `project.featuredOnHomepage`。
- 首页现在已经是「主内容 + 右栏」的两栏结构（`app/[locale]/page.tsx`），改成 uneed 的三栏只是 grid 与区块搬运。
- **没有必须的数据库迁移**（Phase 1–4 内）。只有「本月访问量」「周榜/年榜」「免费工具」这类 uneed 独有内容需要新数据源，可以放到 Phase 5，或用现有数据降级实现。

粗估（不含内页逐个精修）：**首页 + 导航 + 页脚 + 主题 ≈ 6–10 人天**；把内页（项目详情、trending、categories、pricing）统一到新语言再 +3–5 人天。

---

## 二、区块级映射（uneed → aat.ee）

| #   | uneed 区块                                                                                                       | aat.ee 现有对应                                                                                              | 数据来源                                                                                              | 改造工作                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | 顶部导航：logo \| Launchpad / Community / Pricing / Products▾ / More▾ \| Log in + 橙色 Register                  | `components/layout/nav.tsx` + `nav-menu.tsx`（Explore▾ / Dashboard / Pricing / Fast Track / Submit Project） | `messages/*.json` 的 `nav`                                                                            | 重排为「居中菜单 + 右侧双按钮」，搜索/主题/语言/通知收进 More 或保留图标位            |
| 2   | 巨幅衬线 Hero：`Launch. Get seen. Grow.` + 副标题 + 头像堆叠 + 五星 + "Join 85,000 makers" + 橙色 CTA + 网格底纹 | 首页「welcome banner」+「目录促销 banner」（`oppieG/oppieD` 吉祥物）                                         | 用户数（需新查询）、`public/avatars`（已有 20000 头像池，`lib/avatar-pool.ts`）                       | 新组件 `HeroSection`；网格底纹用纯 CSS/SVG（不新增图片）                              |
| 3   | 左栏：`37,715 visits this month` + LATEST POSTS 列表                                                             | 目前无左栏                                                                                                   | 访问量：仓库里**没有**页面浏览计数表，只有 Matomo/GA 外链上报                                         | 访问量走 Matomo API 或先降级；LATEST POSTS 用最新评论（`fumaComments`）或最新上架项目 |
| 4   | 中栏：Daily / Weekly / Monthly / Yearly 切页 + Daily Archives                                                    | `lib/home-project-groups.ts` 有 today / yesterday / 月窗口；`/trending?filter=today\|yesterday\|month`       | `project.scheduledLaunchDate` + `upvote`                                                              | 周/年窗口是同一查询换日期区间，成本低；`Daily Archives` 是新页面（可先挂 /winners）   |
| 5   | 中栏：`New launches in 20 hours 42 mins 22 secs` 倒计时                                                          | `lib/launch-window.ts` 的 `getCurrentLaunchWindow()` 已给出窗口 start/end                                    | 纯计算                                                                                                | 新客户端小组件（约 1KB JS，注意首页 160KB gzip 预算）                                 |
| 6   | 中栏：排名列表（🥇#1 / #2 / #3、标签胶囊、评论数胶囊、右侧▲票数）                                                | `components/home/dense-list.tsx`（已有 rank + 名称 + 一句话 + 票数）                                         | 已有 `upvoteCount` / `commentCount`；标签需在首页查询里补 `attachTags`（当前只 attach 了 categories） | 重写行样式为 uneed 那种「左侧大 logo + 标题行 + 描述 + 右侧票数」                     |
| 7   | 中栏：`Available Premium Spot` 虚线占位 + `Show all products` 黑色胶囊 + `Get Featured`                          | `project.featuredOnHomepage`、`app/admin/paid-projects`、`/pricing`、`/badge`                                | 已有                                                                                                  | 纯展示层改造                                                                          |
| 8   | 右栏：搜索框 + 橙色 `Submit a product` + OUR PARTNERS 卡片 + 社交图标                                            | `SearchCommandLazy`、`/sponsors`、`public/partner-logos/`（62 个 logo）                                      | `lib/directories-links.ts` 快照 + sponsors                                                            | 直接复用，换卡片样式                                                                  |
| 9   | Latest blog posts（两列卡片 + 彩色拱形封面）                                                                     | `blogArticle` 表 + `/blog` 页                                                                                | 已有                                                                                                  | 首页新增查询 + 卡片组件；拱形封面用纯 CSS 渐变，零图片成本                            |
| 10  | 六列页脚：CATEGORIES / ALTERNATIVES / BEST TAGS / UNEED / FREE TOOLS / BEST PRODUCTS                             | 现有三列页脚（Discover / Resources / Legal）+ Friends 区                                                     | categories、alternatives、tags 都在库里                                                               | 扩列；`FREE TOOLS` 需新页面（Phase 5）                                                |
| 11  | 右下橙色聊天气泡                                                                                                 | 无                                                                                                           | —                                                                                                     | 可做静态入口（Discord/邮件），或省略                                                  |

---

## 三、分阶段实施

### Phase 0 — 设计基线与护栏（0.5 天）

- 冻结一份「设计令牌表」：橙色主色、圆角、阴影、字号阶梯、衬线标题字重。
- 用 Playwright 对现有首页/详情页截图，存为改造前的视觉基线（仓库已有 Playwright，可直接写脚本）。
- 明确不动的部分：结构化数据（`components/seo/structured-data.tsx` 的 `ItemListSchema`）、canonical/hreflang、路由结构。

### Phase 1 — 主题与原子组件（1–2 天）

- `app/globals.css`：`--primary` 由绿色 `hsl(142,76%,36%)` 换成橙色系；`--accent` / `--ring` / 侧栏令牌同步；`.dark` 同步。
- 字体：先复用已加载的 `IBM_Plex_Serif`（`--font-editorial`）做 Display，避免动 `scripts/lib/google-font-build-cache` 的字体构建缓存；若要更接近 uneed 的高对比衬线（如 Instrument Serif / Fraunces），需同步更新字体缓存与 `preload` 策略。
- 新增原子：`PillButton`（橙色胶囊）、`SerifHeading`、`RankBadge`、`TagPill`、`StatPill`、`SoftCard`。
- 产出：一个内部 `/design-preview`（或 Storybook 式页面）用于逐块比对，不对外发布。

### Phase 2 — 首页重构（3–5 天，主体工作）

- 新目录 `components/home/v2/`：`hero.tsx`、`time-tabs.tsx`、`launch-countdown.tsx`、`ranked-row.tsx`、`left-rail-latest.tsx`、`right-rail.tsx`、`blog-strip.tsx`、`premium-spot.tsx`。
- 重写 `app/[locale]/page.tsx`：三栏 grid（左 3 / 中 6 / 右 3 或 12 栅格），保留 `ItemListSchema`。
- 扩展 `app/actions/home.ts`：
  - 新增周榜 / 年榜窗口（复用 `getUtcMonthWindow` 的思路）；
  - 首页查询补 `attachTags` + `tagline`；
  - 新增「最新评论/最新上架」查询（左栏）；
  - 新增用户总数查询（Hero 的 "Join N makers"）。
- 保留旧组件文件直到新首页验收通过，便于一键回退。

### Phase 3 — 导航与页脚（1–2 天）

- `components/layout/nav.tsx`、`nav-menu.tsx`、`mobile-nav-sheet.tsx`：改为居中菜单 + 橙色胶囊 CTA。
- `components/layout/footer.tsx`：扩到多列，加 tags / alternatives / best products 列。
- 同步更新 `messages/{en,es,et,fr,ja,ko,pt,zh}.json`（8 种语言，`nav` / `footer` / `home` 三个命名空间）。

### Phase 4 — 内页一致化（3–5 天）

- `app/[locale]/projects/[slug]`、`trending`、`categories`、`pricing`、`blog` 的头部与小卡片换成同一套语言（不必重排信息架构）。

### Phase 5 — 补齐 uneed 独有内容（可选，3–5 天）

- 免费工具页（uneed 用它们吃长尾 SEO）：Name Generator、Playlist Length Calculator 等，逐个是独立小页面。
- 访问量统计：接 Matomo API 拿「本月访问量」，或新建轻量计数表。
- Weekly / Yearly 榜单独立页 + Community 信息流页。

---

## 四、必须守住的护栏（这是本仓库和普通换皮项目最大的区别）

1. **SEO 不能掉**：站点有 sitemap 索引、`llms.txt`、多语言 hreflang、OG 图生成、结构化数据。改造必须保留 H1/H2 层级、canonical、`ItemListSchema`；建议灰度上线而不是一次性替换，并上线前后对比 Search Console 抓取。
2. **性能预算会拦人**：`config/route-budgets.json` 对 `/[locale]/page` 卡 **160KB gzip 初始 JS**；`config/performance-budgets.json` 卡 **LCP 3000ms / Lighthouse 0.7**（当前为 observe 模式）。Hero 必须「文字优先」，头像堆叠/装饰图一律 `loading="lazy"`，不要给装饰图加 `priority`。
3. **e2e 会挂**：`e2e/release-smoke.spec.ts` 依赖导航按钮文案（西班牙语的 `/explorar/i`）和搜索按钮 `/search projects/i`。导航重排后这两个用例必须同步改。
4. **i18n 成本翻 8 倍**：任何新文案都要在 8 个 locale 文件里落地，缺键会直接导致页面报错而非降级。
5. **暗色模式**：uneed 只有浅色。仓库有主题切换器（`components/theme/theme-toggle.tsx`）。要么两套色都调（工作量 +40%），要么在首页临时锁定浅色。
6. **品牌色冲突**：`public/logo.svg` 主色是绿色 `#86b45b`。主色改橙后 logo 会不协调，需要一并出新的 logo/OG 图，否则视觉上是「绿 logo + 橙按钮」的割裂感。
7. **不要抄素材**：可以复刻布局、间距、层级；uneed 的插画、拱形封面、文案本身不能直接搬，需用自家 CSS/SVG 与文案重做。

---

## 五、已确认的本轮范围（决策锁定）

| 决策项         | 结论                                                                                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 范围           | **只做首页**（主题 + 三栏重构）。导航、页脚、内页本轮不动                                                                        |
| 主色           | **保留绿色品牌**（`--primary` 仍是 `hsl(142,76%,36%)`），只借 uneed 的布局、栅格、排版与卡片语言；不动 `public/logo.svg` / OG 图 |
| 暗色模式       | **保留，且浅色/深色两套一起适配**（`.dark` 令牌同步调整）                                                                        |
| uneed 独有内容 | **本轮不做**。访问量、周榜/年榜、免费工具页、社区信息流用现有数据降级占位                                                        |

### 降级占位对照（本轮实现方式）

| uneed 元素                        | 本轮用什么顶上                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `37,715 visits this month`        | 换成真实可得的统计，如「本月上架 N 个项目 / 今日 M 个新项目」（`project` 表可直接算）          |
| LATEST POSTS 社区信息流           | 最新评论（`fumaComments`）+ 项目名，或退化成本周精选项目列表                                   |
| Daily / Weekly / Monthly / Yearly | 先做 **Daily / Weekly / Monthly** 三个可用窗口（today / 7 天 / 月），Yearly 暂不挂或用月榜代替 |
| Daily Archives                    | 链接到现有 `/winners`，不新建页面                                                              |
| OUR PARTNERS                      | 复用现有 `/sponsors` + `public/partner-logos/`（62 个 logo）                                   |
| FREE TOOLS 页脚列                 | 本轮不动页脚，此列不出现                                                                       |
| 右下聊天气泡                      | 不做（或放一个静态 Discord/邮件入口）                                                          |

### 本轮文件级工作清单

**Phase 1 — 主题与原子（可独立验收）**

- `app/globals.css`：新增首页专用令牌（橙色仅作 `--home-accent` 之类的局部变量用于胶囊 CTA 与 rank 徽章，不污染 `--primary`）；补齐 `.dark` 对应值；新增网格底纹工具类。
- `components/home/v2/pill-button.tsx`、`serif-heading.tsx`、`rank-badge.tsx`、`tag-pill.tsx`、`stat-pill.tsx`、`soft-card.tsx`。
- 字体：复用已加载的 `--font-editorial`（IBM Plex Serif），**不新增 Google 字体**，避免动字体构建缓存。

**Phase 2 — 首页重构**

- 新增 `components/home/v2/`：`hero.tsx`、`time-tabs.tsx`、`launch-countdown.tsx`、`ranked-row.tsx`、`left-rail.tsx`、`right-rail.tsx`、`blog-strip.tsx`、`premium-spot.tsx`。
- 重写 `app/[locale]/page.tsx` 为三栏栅格，保留 `ItemListSchema` 与现有 SEO 输出。
- 扩展 `app/actions/home.ts`：加 7 天窗口查询；首页项目查询补 `attachTags` + `tagline`；加「最新评论」与「本月上架数」两个轻查询。
- 新增 `messages/*.json` 的 `home.v2` 命名空间（8 个 locale）。
- 通过 `NEXT_PUBLIC_HOME_V2` 开关切换新旧首页，旧组件保留以便回退。

**验收线**：Lighthouse 不低于现状、LCP < 3s、`/[locale]/page` 初始 JS < 160KB gzip、移动端无横向滚动、8 个 locale 无缺键、深色模式首屏可用。

---

## 六、后续（本轮之后）

首页稳定 1–2 周后再推 Phase 3/4：导航与页脚改版（需同步改 `e2e/release-smoke.spec.ts` 里依赖导航文案的用例）、内页视觉统一、以及 Phase 5 的数据补齐。

---

## 七、Phase 1 交付记录（已完成）

### 新增文件

| 文件                                   | 作用                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/globals.css`                      | 新增 `--home-*` 令牌层（浅色 + 深色）、`@theme inline` 映射（生成 `bg-home-accent` / `rounded-home-card` 等工具类）、`home-grid-bg` / `home-grid-fade` 网格底纹工具 |
| `components/home/v2/pill-button.tsx`   | 胶囊按钮（accent / ink / outline / soft / ghost × sm/md/lg × full）                                                                                                 |
| `components/home/v2/serif-heading.tsx` | 衬线标题阶梯（display / section / card / eyebrow），带 kicker 与右侧 action 槽                                                                                      |
| `components/home/v2/rank-badge.tsx`    | 排名徽章（前三名奖牌，长尾等宽序号）                                                                                                                                |
| `components/home/v2/tag-pill.tsx`      | 信息胶囊（neutral / accent / ink，可 asChild 成链接）                                                                                                               |
| `components/home/v2/stat-pill.tsx`     | 数字 + 说明的组合统计                                                                                                                                               |
| `components/home/v2/soft-card.tsx`     | 细边框卡片基座（可交互、四档内边距）                                                                                                                                |
| `app/design-preview/page.tsx`          | 站内样张页，生产环境默认 404，`ENABLE_DESIGN_PREVIEW=1` 可开                                                                                                        |
| `app/design-preview/specimen.tsx`      | 样张内容（站内页与离线导出共用同一份组件）                                                                                                                          |
| `app/design-preview/preview.css`       | 仅供离线导出用的 CSS 入口                                                                                                                                           |
| `scripts/render-design-preview.tsx`    | 离线导出脚本：编译真实 `globals.css` + 渲染样张 + 出图                                                                                                              |

### 两种查看方式

1. **离线（不依赖数据库，推荐）**：`bun run design:preview`
   产物在 `artifacts/design-preview/`：`index.html`（可直接双击打开）、`preview.css`、`preview-desktop.png`、`preview-mobile.png`。
2. **站内**：数据库可用时访问 `/design-preview`（生产需 `ENABLE_DESIGN_PREVIEW=1`）。

### 验证结果

- `npx tsc --noEmit` 通过；`npx eslint` 对新增/改动文件通过。
- 桌面（1280px）与移动（420px）双尺寸实拍校验：无横向溢出，浅色/深色两套令牌均正确生效（黑色胶囊在深色下自动反相为白色胶囊）。
- 深色模式对比度：橙底深字 7.15:1（AAA）；浅色模式橙底白字 3.01:1（仅达 AA 大字号）。

### 关于浅色模式 CTA 的对比度（已定）

浅色模式下主 CTA 是「白字 + 亮橙底」，对比度 **3.01:1**，仅满足 AA 大字号。这是为了贴近参考图而**有意保留**的取舍：`orange-green` 的橙色只用在按钮上，正文与胶囊文字走绿色系（6.02:1）与 `--home-accent-strong`（4.90:1），实际阅读内容都在 AA 之上。若要连按钮也达 4.5:1，见第八节的切换方式，组件零改动。

### 踩到并已修掉的坑

`home-grid-fade` 用的是 `mask-image`，而 mask 会作用于元素**及其整棵子树**。第一版把网格和渐隐直接加在 Hero 容器上，结果标题和橙色 CTA 一起被渐隐（截图里按钮发灰）。现在网格走独立的 `absolute inset-0` 装饰层，`globals.css` 里也写明了这条约束，Phase 2 搭 Hero 时不要踩回去。

---

## 八、色板：已选定 `orange-green`（橙主 + 绿点缀）

**决定：`orange-green`。** 它已经写进 `app/globals.css` 的 `:root` / `.dark` 作为默认值 —— 不挂任何属性即生效，Phase 2 的组件直接就是这套配色。

橙色接管所有「行动」元素（CTA、按钮、排名徽章），绿色接管小面积强调（评论数胶囊、票数箭头、标签、博客封面、侧栏圆点），既保住参考图的暖度，也让站点原有的绿色品牌色以点缀方式回归。

导出脚本里加了一条硬校验：`:root` / `.dark` 的解析值必须与 `[data-home-palette="orange-green"]` 完全一致（浅色 + 深色共 7 个令牌），不一致就直接让 `bun run design:preview` 失败，避免「审的那套」和「上线的那套」悄悄漂移。

其余三套保留为可选覆盖，切换只改 `data-home-palette` 的值：

| 色板                       | 主色（CTA / 按钮 / 排名） | 次色（评论数 / 票数 / 标签） | 对比度                                         |
| -------------------------- | ------------------------- | ---------------------------- | ---------------------------------------------- |
| **`orange-green`（默认）** | 橙 `hsl(24,95%,50%)`      | 绿 `hsl(142,72%,30%)`        | 橙 3.01:1（AA 大字号）· 绿 6.02:1（AA）        |
| `green-orange`             | 绿 `hsl(142,72%,30%)`     | 橙 `hsl(24,95%,50%)`         | 绿 4.79:1 · 橙胶囊文字 4.90:1，全部 AA         |
| `green`                    | 绿 `hsl(142,72%,30%)`     | 同主色                       | 白字 **4.79:1（AA）** · 深色 **7.39:1（AAA）** |
| `orange`                   | 橙 `hsl(24,95%,50%)`      | 同主色                       | 白字 3.01:1（AA 大字号）· 深色 7.15:1          |

如果后期想要「CTA 也过 AA」，把 `:root` 与 `.dark` 里的 `--home-accent*` 换成 `green` 那一组的四个值即可（或直接给首页容器加 `data-home-palette="green-orange"`），组件零改动。

---

## 九、Phase 2 交付记录（首页三栏重构）

### 开关

`HOME_V2=1` 时渲染新首页，其它值（含未设置）渲染旧首页。**默认关闭**，所以这次改动合并上去不会改变线上首页。

这个开关读的是**运行时** `process.env.HOME_V2`（不是构建期内联的 `NEXT_PUBLIC_*`），所以回滚只需改环境变量 + 重启，不需要重新构建。已登记进 `.env.example`。

### 新增组件（全部是服务端组件，除倒计时）

| 文件                                      | 作用                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `components/home/v2/home-hero.tsx`        | 巨幅衬线 Hero + 网格底纹 + 双 CTA + 创作者头像堆叠                            |
| `components/home/v2/time-tabs.tsx`        | Daily / Weekly / Monthly 切页（链接，非客户端状态）                           |
| `components/home/v2/launch-countdown.tsx` | 倒计时（首页唯一的客户端组件）                                                |
| `components/home/v2/ranked-row.tsx`       | 排名信息流行（奖牌 / logo / 名称 / 评论胶囊 / 分类 / 票数）                   |
| `components/home/v2/left-rail.tsx`        | 本月计数 + 社区动态                                                           |
| `components/home/v2/right-rail.tsx`       | 搜索 / 提交 CTA / 合作伙伴 / 分类 / 快捷入口 / Explore / 联盟 / 推荐 / 促销图 |
| `components/home/v2/blog-strip.tsx`       | 博客条（封面用令牌画的拱形，非位图）                                          |
| `components/home/v2/premium-spot.tsx`     | 虚线推荐位                                                                    |
| `components/home/v2/home-body.tsx`        | 版式总装（纯函数：data + labels → 布局）                                      |
| `app/[locale]/home-v2.tsx`                | 数据与文案的服务端半边                                                        |

### 数据层新增（`app/actions/home.ts`）

- `getHomeWeekProjects()` —— 滚动 7 天榜，窗口函数 `getUtcWeekWindow()` 放在 `lib/home-project-groups.ts`（带单测）。
- `getHomeStats()` —— 本月上架数 + 创作者总数。
- `getLatestCommunityPosts()` —— 最新未隐藏评论，用 `extractTextFromContent` 取一行摘要。
- `getLatestBlogPosts()` —— 已发布博客。
- `getHomeMakers()` —— 最近上架者的头像。
- 全部按既有约定用 `unstable_cache` 包裹并挂 `HOME_PROJECTS_TAG`；**用户相关数据（是否已投票）一律在缓存之外叠加**，与旧首页同样的纪律。

### 降级实现（对照第八节之前的约定）

| uneed 元素                        | 本轮实现                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `37,715 visits this month`        | 真实数据库计数：本月上架数 + 创作者数（站点没有页面浏览表，伪造一个数字是错的） |
| LATEST POSTS 社区流               | 最新评论 + 项目名 + 一行摘要                                                    |
| Daily / Weekly / Monthly / Yearly | 前三个真实可用；Yearly 未做                                                     |
| Daily Archives                    | 链接到既有 `/winners`                                                           |
| OUR PARTNERS                      | `promoDirectorySites(5)` + 62 个本地 partner logo                               |
| FREE TOOLS                        | 本轮不涉及（页脚未改）                                                          |
| 右下聊天气泡                      | 未做                                                                            |

### 保留项（避免静默回归）

- **结构化数据**：`ItemListSchema` 在新分支照旧输出。
- **内链**：旧侧栏的分类、快捷入口、Explore(compare/alternatives)、Linux 联盟、推荐位一个没少，全部移入右栏；促销图 `/images/img1.png` 也保留了（那是既有的推广位，不该因为改版就消失）。
- **h1 唯一**：只有 Hero 用 `h1`，其余区块是 `h2`/`h3`。
- **移动端阅读顺序**：用 `order-*` 让「信息流 → 社区 → 链接栏」排列，而不是桌面的左→中→右。

### 怎么验收（不需要数据库）

```bash
bun run design:preview
```

产出 `artifacts/design-preview/`：

- `home-v2.html` / `home-v2-desktop.png` / `home-v2-mobile.png` —— **真实 `HomeBody` 组件**配 fixture 数据渲染的整页。
- `index.html` / `palette-*.png` —— Phase 1 的色板样张。

站内也可看：数据库可用时开 `HOME_V2=1` 访问 `/` 与 `/?tab=weekly`，或访问 `/design-preview`（样张页底部就是首页 fixture）。

⚠️ 静态截图里的倒计时显示 `—`：它是首页唯一的客户端组件，而离线 HTML 不含 JS 包，未水合时保留占位宽度显示破折号。真实页面上会正常走动。

### 顺带修掉的两个既有问题

1. `components/layout/sidebar-explore.tsx` 直接用 `usePathname()` 的返回值调 `.startsWith()`；该 hook 在 Next 运行时之外返回 `null`，组件在隔离渲染时直接崩。已加空值保护。
2. 移动端左栏统计挤成一行（`1,248 launches this month85,420 makers`）：`StatPill` 渲染的是 inline-flex 的 `span`，而 `space-y-*` 的垂直 margin 对 inline 级盒子无效。改成 `flex flex-col gap-2`。

---

## 十、独立 review 发现的问题与修复

Phase 2 完成后跑了一轮独立代码审查（只读、逐条给依据）。**3 条 major、3 条 minor、1 条 nit，全部属实，已全部修复。**

### major

**1. 右栏搜索按钮会渲染出字面量 `search.placeholder`（8 个语言都中）**
`app/layout.tsx` 给 `<main>` 的 provider 传的是**空消息包**（`messages={{}}`），`search` 命名空间只给了 Nav。右栏渲染的共享组件 `SearchCommandLazy` 在 SSR 阶段调用 `useTranslations("search")`，缺 key 时 next-intl 不抛异常，而是把 `命名空间.key` 当作文案渲染 —— 也就是页面上会直接显示 `search.placeholder`。
**修复**：`home-v2.tsx` 按其仓库他 6 个页面的既有约定自包一层 `NextIntlClientProvider`，只带 `search` 命名空间（`pickClientMessages`）。
**为什么之前没发现**：离线导出脚本给 fixture 传的是完整 `en.json`，恰好绕过了这个缺陷。这是「验证环境比生产环境宽松」的典型陷阱。

**2. 周榜缓存永远命不中，且缓存键无限增长**
`unstable_cache` 会把**实参**算进缓存键，而 `getUtcWeekWindow` 返回的 `end` 是 `new Date(now)`（毫秒精度）。于是每次请求都是新键：TTL 与 `HOME_PROJECTS_TAG` 失效形同虚设，每次渲染都打库，缓存条目还会持续增长。
**修复**：调用前把 `now` 向下取整到 revalidate 窗口（1 小时）再计算窗口 —— 滚动 7 天的语义不变，键在窗口内稳定。（月窗口没这个问题，因为它的边界在月内本来就是常量；原注释里写的「与月窗口同一约定」是错的。）

**3. `artifacts/` 不在 `tsconfig.exclude` 里，临时脚本会让构建门禁变红**
`build:next` 会先跑 `tsc --noEmit`，失败就跳过 next build。我在 `artifacts/tmp/` 放量测脚本时直接把 tsc 打红了（Phase 2 源码本身是干净的）。
**修复**：删掉临时脚本，并把 `artifacts` 加入 `tsconfig.exclude` —— 该目录已被 gitignore 且现在承载生成的预览产物，不该参与类型检查。

### minor

**4. Hero 头像堆叠不过滤 bot，紧邻的计数却过滤了** —— Product Hunt 导入 cron 会把项目挂到 bot 账号，而列表按最近上架排序，头像堆叠很可能整排都是 bot。已补上与计数口径一致的 `coalesce(is_bot,false)=false`；同时去掉了 `image IS NOT NULL` 过滤，让「无头像显示首字母」的兜底真正生效（否则那段兜底代码永远走不到）。

**5. weekly / monthly tab 的结构化数据仍标成 "Today's Launched Products"** —— `home.metadata` 只有 today 一份文案，硬套到周榜就是错的。**修复**：`ItemListSchema` 只在 Daily（canonical 视图）输出；weekly/monthly 是同一 URL 的 query 变体，canonical 指向 `/`，不需要也不应该再挂一份语义不符的列表数据。

**6. 移动端视觉顺序与焦点顺序不一致** —— 原来靠 CSS `order` 把信息流提到最前，但 `order` 只改绘制、不改 Tab 序列，键盘用户会先走完整个社区栏。**修复**：DOM 顺序改为「信息流 → 社区栏 → 链接栏」，桌面端用 `lg:order-*` 把社区栏挪回左列。

### nit

**7. `/trending?filter=yesterday` 在首页失去入口** —— 旧首页的「Yesterday's Launches →」没搬过来。已在右栏 Quick access 补回一条（复用既有的 `home.sections.yesterdayTitle`，无需新增翻译）。

### 审查确认没问题的部分

- **用户相关数据没有被误缓存**：四个新 fetcher 的实参只有 limit/时间窗，`getCurrentUserId` / `getUpvotedSet` / `withUserUpvoted` 全在 `unstable_cache` 外层，与既有写法一致。
- **`fuma_comments.page = project.id` 的 join 假设成立**（与 `lib/project-details-query.ts` 同一契约）。
- **`groupBy` + `orderBy(max())`、`is_bot` 可空处理、8 个 locale 的 key 完整性与占位符一致性**均通过。
- **客户端 JS**：`components/home/v2/` 里只有 `launch-countdown.tsx` 一个 `"use client"`。

### 最终门禁结果

| 检查                   | 结果                                            |
| ---------------------- | ----------------------------------------------- |
| `npx tsc --noEmit`     | 通过（0 错误）                                  |
| `npx eslint .`（全仓） | 通过（0 错误 0 警告）                           |
| `npx prettier --check` | 通过                                            |
| `bun run build:next`   | ✓ Compiled successfully                         |
| `vitest run`（全量）   | 97 文件 / 439 用例通过，2 文件 9 用例按设计跳过 |
| `bun run perf:routes`  | 首页初始 JS **124,741 B gzip**（上限 160,000）  |

### 仍然没有验证的部分（如实说明）

- **没有跑过真实数据**：本机连不上数据库（`43.154.24.210` 连接被重置），所以新首页从未用真实数据渲染过。所有查询的 SQL 合法性、字段映射只经过类型检查与人工审读，**首次开 `HOME_V2=1` 时请先在本地/预发核对一遍**（重点看左栏社区流与统计数字是否合理）。
- **Lighthouse / LCP 未测**：`config/performance-budgets.json` 处于 observe 模式，需要跑起服务 + 数据库。路由 JS 预算是硬门禁，已通过。

---

## 十一、Hero 方案实验室（6 个候选，待选）

参考站的 hero 是「居中衬线大标题 + 头像堆叠 + 胶囊 CTA + 网格底纹」。照抄它等于放弃自己的第一句话，所以做了 6 个**结构不同**的候选，放在 `app/design-preview/hero-lab/`。

对比规则（这是能公平比较的前提）：

- **六个方案的标题、副标题、CTA 完全一致** —— 否则你以为在选版式，其实在选文案。
- **六个只用 home 色板令牌**，所以浅色/深色都成立，无需逐个适配。
- 它们是候选、不是上线代码；选中的那个才会提升为 `components/home/v2/home-hero.tsx`，其概念专属文案才需要真正接 i18n（目前全是 fixture 英文）。

| id              | 方案     | 主角                                       | 适合                       |
| --------------- | -------- | ------------------------------------------ | -------------------------- |
| `live-race`     | 今日赛道 | 右侧今日实时前三榜（带相对票数条）+ 倒计时 | 强调真实流量与竞争         |
| `ship-log`      | 提交回执 | 终端风的「上架回执」卡片                   | 开发者 / 开源受众          |
| `two-doors`     | 双入口   | 标题下直接分「我要发布 / 我要逛」          | 两类访客目标差异大         |
| `launch-window` | 发射窗口 | 巨大倒计时 + 昨日/今日/下一批时间轴        | 制造赶下一班车的稀缺感     |
| `masthead`      | 日报头版 | 期号 + 双规线 + 头条（今日第一）+ 三栏摘要 | 建立每日出版物的内容气质   |
| `logo-wall`     | 发布墙   | 今日 logo 马赛克铺底 + 实时计数            | 一眼回答「这里有多少东西」 |

每条的代价（`watchOut`）都写在 lab 页的方案卡片里，选之前请一起看。查看方式：

```bash
bun run design:preview      # → artifacts/design-preview/hero-lab.html
```

或看导出的 `hero-<id>.png`（浅色，逐个）与 `hero-lab-dark.png`（深色全览）。站内 `/design-preview` 页面顶部也是这块实验室。

**性能提醒**：`logo-wall` 是唯一用图片做装饰的方案。图块全部 `aria-hidden` + 懒加载 + 纯 `<img>`，LCP 元素仍是标题，但上线时图块数量必须封顶，且只能用当天的 logo，不能铺全站目录。

### 选定：`logo-wall`（已接入首页）

2026-09-10 定稿。已从候选提升为 `components/home/v2/home-hero.tsx`，并在提升时补了三件事：

1. **两个数字改成真实数据。** 候选里写的 `128 launched today · 12 queued` 是占位。`getHomeStats()` 增加了两个真实计数（都带缓存、挂 `HOME_PROJECTS_TAG`）：
   - `launchesToday`：当前发射窗口内 `ONGOING` 的项目数；
   - `queuedNext`：**下一个**窗口已排期（`SCHEDULED`）的项目数 —— 即提交者要竞争的对象；未付款的 `PAYMENT_PENDING` 不计入。
     两个数都为 0 时整行 kicker 不渲染，避免冷启动显示「0 launched today · 0 queued」。
2. **图块数量按断点封顶。** 每个断点只渲染 3 行（12 / 18 / 24 块），超出的一律 `hidden` 而不是裁切 —— 手机上只有 12 块会进入布局，不会为装饰拉 24 张图。同时给每块加了 `fetchPriority="low"`：墙就在首屏，单靠 `lazy` 仍会随首屏一起加载，降优先级才能保证它不跟 LCP 文案抢连接。
3. **墙的素材来自 today + yesterday + month 去重**，所以冷清的日子墙也不会空；这两个计数取自 `stats`，与墙的素材列表无关（墙是装饰，`aria-hidden`）。

新增翻译键：`home.v2.hero.launchedToday`（"{count} launched today"）与 `home.v2.hero.queuedNext`（"{count} queued"），8 个 locale 齐全。

实验室里的 06 号**保持冻结**（就是你当时选的那一版，文案仍是 128/12），不镜像线上实现 —— 它记录的是决策时刻，不是当前代码。这一点写在 `hero-lab/index.tsx` 的注释里。

### 实现方式

- 新增次色令牌族 `--home-highlight / -strong / -soft / -soft-border`，默认**别名到主色**（`var(--home-accent)`），所以纯色板不需要额外赋值，混色板只覆盖 highlight 那 4 个值。
- 色板通过 `data-home-palette="orange|green|green-orange|orange-green"` 属性选择；**属性要和 `.dark` 挂在同一个元素上，或挂在它内部的元素上**（挂在 `.dark` 的祖先上不生效，会被更近的 `.dark` 声明覆盖），这条规则写在 `globals.css` 注释里。
- 组件侧：`TagPill` 新增 `highlight` 色调，`StatPill` 的 `tone` 新增 `highlight`，仅此两处 API 变化。
- 绿色落在站点主色所在的 emerald 族（现有 `--primary: hsl(142,76%,36%)` 的加深版），和导航、旧按钮、logo 是同一套语言。

顺带修掉一个移动端问题：信息流行在 420px 下会把产品名截断成 `Nimbus …`，现在评论数胶囊在 `<sm` 时移到标签行，名称恢复完整。

---

## 十二、Phase 3：导航与页脚对齐（已完成）

### 页脚：3 列 → 5 列

参考站的页脚是 6 列（Categories / Alternatives / Best tags / …），这也是站点最大的内链位。本轮把页脚从 3 列扩到 5 列：

```
品牌 + 版权 | DISCOVER | CATEGORIES | BEST TAGS | RESOURCES | LEGAL
```

其中 **CATEGORIES 与 BEST TAGS 是真实数据**，来自新增的 `app/actions/footer.ts`：

- `getFooterTaxonomy()` —— 分类按项目数取前 6；标签只取 `moderation_status = 'approved'` 且 `project_count > 0` 的前 8，**保证不会链到 404 或未审核的标签页**。
- 用 `unstable_cache` 包裹（1h，挂 `TOP_CATEGORIES_TAG`）。这是硬要求：页脚在**每一条路由**上渲染，一次未缓存的查询会拖慢全站。既有的 `getAllTags()` 因此**没有**被复用（它未缓存且返回整行 tag）。
- 数据在根布局里与 `getLocale()` / `getMessages()` 并行取，再作为 props 传给客户端页脚组件。

同时把列标题改成与首页侧栏一致的等宽小字 eyebrow 风格，链接 hover 从 `text-primary`（绿）改成 `text-foreground`（中性）—— **页脚刻意不依赖任何一套色板令牌**，因为它在 HOME_V2 灰度期间同时服务新旧两个首页。

新增翻译键：`footer.bestTags`（8 个 locale）。

### 导航：CTA 跟随首页开关

新首页的动作色是橙色 `--home-accent`，旧首页是绿色 `--primary`。灰度期间两个首页都在线，所以导航的 Submit 按钮**按 `HOME_V2` 切换配色**（`nav.tsx` 读环境变量 → `NavMenu` / `MobileNavLazy` / `MobileNavSheet` 透传），避免一个屏幕上出现两个互相竞争的动作色。

导航的文案、结构、`aria-label` 一律未动 —— `e2e/release-smoke.spec.ts` 依赖 `/explorar/i`（Explore 触发器）和 `/search projects/i`（搜索按钮）这两个可访问名，动文案会直接打红 e2e。

### 离线验收

```bash
bun run design:preview      # → artifacts/design-preview/chrome.html + footer-desktop.png / footer-mobile.png
```

导航无法离线渲染（它要查会话），所以只导出了页脚；页脚的 Friends 区块依赖 `usePathname()`，在 Next 运行时之外返回 null，故离线预览里不显示（属预览限制，非线上行为）。

### 代价：每条路由的客户端 JS +212 B

页脚是客户端组件且位于根布局，所以本轮改动让**所有路由**的初始 JS 都涨了约 212 B（gzip）：

| 路由                        | 改动前  | 改动后      | 预算    | 余量              |
| --------------------------- | ------- | ----------- | ------- | ----------------- |
| `/[locale]/page`            | 124,741 | 124,953     | 160,000 | 35 KB             |
| `/[locale]/projects/submit` | 260,570 | 260,782     | 310,000 | 49 KB             |
| `/[locale]/projects/[slug]` | 159,826 | **160,038** | 165,000 | **4.9 KB（97%）** |
| `/[locale]/payment/success` | 166,830 | 167,042     | 190,000 | 23 KB             |

已把列结构抽成 `LinkColumn` 复用（省 8 B，主要收益是可读性）。

**项目详情页只剩 4.9 KB 余量**，是四条里最紧的。如果后续还要往客户端加东西，建议先做这个重构：把页脚的列改成**服务端组件**、通过 `children` 传给只负责 Friends 区块的客户端壳 —— 页脚的链接与文案会整体搬出客户端包。本轮没做，因为它是共享布局组件的结构性改动，不值得在没有需求驱动时顺手改掉。

### 门禁（Phase 3 后）

`tsc` / `eslint .`（全仓）/ `prettier` / `build:next` / `vitest`（439 用例）/ `perf:routes`（四条路由全部通过）均通过。

---

## 十三、真实数据验收工具（本轮新增）

新首页至今**没有用真实数据跑过一次** —— 本机连不上数据库（`43.154.24.210` 连接被重置）。类型检查能证明 SQL 拼得对，但证明不了：join 真能命中行、8 个 locale 的 key 一个不缺、`next-intl` 没有把 `命名空间.key` 当文案渲染出来。

所以本轮把「验证」做成了一条命令：`scripts/smoke-home-v2.ts`。

```bash
# .env.local 里已写入 HOME_V2=1（本地验证用，删掉或改 0 即回退）
bun run dev                                            # 另开终端
bun run smoke:home-v2 --url http://localhost:3000      # 退出码非 0 即不通过
```

它**不导入 server actions**（那些需要 Next 的请求上下文才能用 `unstable_cache`），也**不需要数据库客户端** —— 它读渲染出来的 HTML，所以既能打线上，也能打本地。

### 检查项

- **`data-home-v2` 标记**：先证明目标真的在跑新首页。没有这一条，`HOME_V2` 配错时整个测试会对着旧首页全绿。
- **结构钩子**：`serif-heading` / `pill-button` / `rank-badge` / `tag-pill` / `stat-pill` / `soft-card` / `launch-countdown` / `home-hero-wall` 必须都出现（这些 `data-slot` 是组件自己发出的）。
- **8 个 locale**（默认抽查 en/zh/ja/es，可 `--locales` 覆盖）逐个请求，任何一个 200 但缺 key 都会被下面这条抓住。
- **禁止出现的字符串**：`search.placeholder`（这正是 review 抓到过的真实 bug）、`home.v2.`、`home.sections.`、`>NaN<`、`>undefined<`、`{count}`、`{rank}`。每一条都对应一个真实失败模式，不是凑数。
- **`/?tab=weekly` 与 `/?tab=monthly`** 同样要过结构检查，且**不应**出现 `ItemListSchema`（非 canonical 视图不该挂列表结构化数据）。
- **feed 行数**只报告不断言：窗口内没有上架时列表合法为空，此时会明确打印「列表本身未被验证」，避免用一条必然通过的断言假装测过了。

### 这个工具本身也验证过了

拿已知正确的离线产物（`artifacts/design-preview/home-v2.html`）跑 → **17/17 通过，退出码 0**；拿不含新首页标记的产物（色板样张 `index.html`）跑 → **`data-home-v2` 检查变红，退出码 1**。两个方向都验过，断言既不会误报也不会漏报。

过程中还抓到我自己写的一个 bug：`check()` 的 detail 参数是常量，导致通过时也打印「missing data-home-v2」。已修成按结果分支 —— 一个会说谎的检查比没有检查更糟。

---

## 十四、生产数据验证（2026-09-10）

按 `docs/production-deployment-runbook.md` 的 SSH 契约连上生产机（`ecs-user@8.210.175.190`，专用密钥 + 专用 known_hosts，`-o BatchMode=yes -o StrictHostKeyChecking=yes`），对生产库 `aat-ee-postgres` 跑了**只读** SQL，逐条验证新首页依赖的假设。

> 连不上公网数据库（`.env.local` 里的 `43.154.24.210` 拒绝连接）是**配置陈旧**，不是故障：生产库其实是同机 Docker 网络里的 `postgres:5432` 容器，端口未对外发布。

### 验证结果

| 假设 / 查询                                        | 生产实测                                                                                                                                                          | 结论                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `fuma_comments.page = project.id`（社区流的 join） | **6273 / 6289 命中 = 99.7%**                                                                                                                                      | 假设成立；未命中的 16 条是已删除项目的评论，inner join 正好丢弃 |
| 今日战况（当前窗口内 `ONGOING`）                   | **7**                                                                                                                                                             | 非空                                                            |
| `launchesToday` 窗口语义 `[今日08:00, 明日08:00)`  | **7**（7 行 ongoing 全部落在 `09-10 08:00`）                                                                                                                      | 与代码语义一致                                                  |
| `queuedNext`（下一窗口 `SCHEDULED`）               | **8**                                                                                                                                                             | 非空                                                            |
| 周榜（7 天内 `LAUNCHED`）                          | **35**                                                                                                                                                            | 非空                                                            |
| 月榜（本月 `LAUNCHED`）                            | **59**                                                                                                                                                            | 非空                                                            |
| `getHomeMakers`（非 bot 的近期上架者）             | **5 行**，其中 4 个有头像、1 个没有                                                                                                                               | 真实触发了我加的「首字母兜底」分支                              |
| 已发布博客                                         | **8 篇**                                                                                                                                                          | 非空                                                            |
| 页脚分类                                           | AI 1212 / Productivity 718 / SaaS 537 / Developer Tools 514 / Marketing 340 / Design 202                                                                          | 真实计数                                                        |
| 页脚标签                                           | 1807 个已审核且有项目的标签；top8：artificial-intelligence 422、productivity 366、ai 266、developer-tools 262、saas 236、marketing 129、open-source 96、github 87 | 真实                                                            |
| 非 bot 用户总数                                    | **1732**                                                                                                                                                          | Hero 会显示「Join 1,732 makers」                                |
| 本月上架                                           | **66**                                                                                                                                                            | 左栏会显示「66 launches this month」                            |

### 两个必须让你知道的产品发现

**1. 社区流几乎全是模拟评论 —— 这是最大的问题。**
`LATEST POSTS` 那一栏是按评论构建的。生产数据：最近 20 条评论里 **19 条是 bot**（`author LIKE 'bot-user-%'`）；全站 6289 条评论里只有 **88 条真人**；**最新一条真人评论是 10 个月前**。

也就是说，这一栏上线后展示的将是清一色的模拟互动。站点本来就在做虚拟互动（评论数、票数都含模拟量，见 `VIRTUAL_ENGAGEMENT.md`），所以这不算"不一致"；但一个*信息流*比一个*计数*是更强的宣称。三个选项：

- **A. 保持现状** —— 与站内其他模拟互动的口径一致，且内容读起来像正常讨论。
- **B. 排除 bot** —— 那这一栏基本会空（88 条真人、最新 10 个月前），组件在空列表时会整块不渲染，等于砍掉这个功能。
- **C. 换内容** —— 改成「最新上架」（今日 7 个、本周 35 个，都是真实的），保留栏位但不再依赖模拟评论。

**已决定：A（保持现状，含模拟评论）。** 理由是与站内其他模拟互动的口径一致，且这些评论读起来就是正常讨论。

为防后人误判，`app/actions/home.ts` 的 `fetchLatestCommunityPostsBase` 里写死了这条决策与实测数据，并明确说明：**单纯过滤 bot 不等于修复，而是会静默删掉整块功能**（组件在空列表时不渲染），要改必须先决定用什么替代。

同时补验了最后一环：摘要走的是 `extractTextFromContent` 解析 Fuma 富文本 JSON。拿生产库里一条真实的评论体实测 ——

```
输入  {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Tried a few of
       these curated tool directories before. Usually the signal-to-noise dies once sponsored
       listings creep in."}]}]}
抽取  Tried a few of these curated tool directories before. Usually the signal-to-noise dies
       once sponsored listings creep in.
摘要  Tried a few of these curated tool directories before.
```

抽取与截断都正常，社区流展示的会是干净的整句，不会出现空串或 JSON 残渣。至此这一栏的每一环（join → 查询 → 抽取 → 渲染）都在生产数据上验过了。

**2. 数字量级比 fixture 小得多。** fixture 用的是 85,420 makers / 1,248 本月上架；真实是 **1,732 / 66**。不是 bug，但上线后 Hero 的冲击力会明显弱于预览图 —— 如果希望这两个数字更有分量，可以考虑改成累计口径（如「累计 2,594 个产品」），我在接入时留了 `getHomeStats()` 一个函数收口。

另外：标签里 `artificial-intelligence` 与 `ai` 并存，页脚 BEST TAGS 会同时出现两个近义标签。

### 一次自己造成的操作事故（已止损）

为了做端到端渲染，我建了 SSH 隧道把生产库转发到本地（容器 IP `172.25.0.3:5432`，端口未发布），并用 `DATABASE_POOL_MAX=2` 起本地 dev server。**第一次请求成功渲染（`GET / 200`）**，随后隧道被大量并发 Postgres 连接拖垮（`Timeout, server not responding`），立即重连时服务端直接关闭连接（`Connection closed by 8.210.175.190 port 22`）—— 典型的 sshd 限流 / fail2ban 触发。

止损动作：立刻停止一切 SSH 重试、杀掉 dev server、删除本地暂存的生产连接串、确认 3000/15432 端口与进程均已释放。

**教训**：即使单条查询是只读的，把生产库经 SSH 隧道暴露给一个会并发发起十余条查询的 Next 服务端渲染，等于把隧道当连接池用。正确做法是先用 `psql` 逐条验证 SQL（本轮已做，且已足够），端到端渲染应该在生产机本机、或专门的只读副本上做，而不是从开发机打隧道。

**影响已确认解除**：约 4 分钟后用同一条只读身份检查命令验证，返回 `ACCESS_OK` / `iZj6c7t3zvc5p481sn85jtZ`，限流是临时的，部署通道未受影响，也没有触发持久封禁。

---

## 十五、本地测试环境（本轮新增）

§14 的结论是：端到端验证不该碰生产库。所以造了一个完全本地的环境，**不依赖 Docker、不依赖网络**——本机已装 PostgreSQL 17/18 的服务端二进制，只缺一个集群。

### 用法

```bash
bun run local:db start      # 首次会 initdb，然后启动（127.0.0.1:55432）
bun run local:db seed       # 迁移 + 灌入首页夹具数据
bun run local:db status     # 运行状态 + 各表行数
bun run local:db reset      # 删库重来
bun run local:db stop

# 另开一个终端
HOME_V2=1 bun run dev       # .env.local 里的 DATABASE_URL 已指向本地集群
bun run smoke:home-v2 --url http://localhost:3000
```

- 全部数据落在 `artifacts/local-pg/`（gitignored），只监听 `127.0.0.1:55432`，不会和任何真实部署冲突。
- 迁移走仓库真实的 `db:migrate`（62 个迁移，与生产一致），所以本地 schema 就是生产 schema。
- `.env.local` 里旧的远程 `DATABASE_URL` 被注释保留，方便切回。
- `scripts/local-db.ts`（集群生命周期）+ `scripts/seed-local-home-fixture.ts`（夹具数据）都带**回环 + 库名前缀**双重守卫，与 `e2e/helpers/release-fixture.ts` 同一套写法——能被指向生产的灌数脚本就是颗地雷。

夹具刻意按**生产的真实量级**造数（7 个进行中 / 8 个排队 / ~1.7k 用户），而不是造一个好看的假数据：7 个 live、6 个已完成、8 个排队、2 篇已发布博客 + 1 篇草稿、5 条评论 + 1 条已隐藏评论、1700 个填充用户（其中一个创作者没有头像，用来触发首字母兜底）。

### 它立刻抓到了一个真 bug

```
RangeError: Invalid time value
    at components/home/v2/blog-strip.tsx  formatter.format(date)
```

`unstable_cache` 会**序列化**返回值，`Date` 取回来是字符串，而 `Intl.DateTimeFormat.format("2026-09-08T…")` 直接抛 `RangeError`。离线 fixture 传的是真 `Date` 对象，所以这条路径**只有连真库、走真缓存才会走到**——纯离线验证永远发现不了。

修法是把边界写诚实，而不是在组件里兜底了事：

1. `getLatestCommunityPosts` / `getLatestBlogPosts` 在**缓存边界**就把时间转成 ISO 字符串；
2. `HomeBlogPost.publishedAt` / `HomeCommunityPost.createdAt` 的类型改成 `string`，让"跨缓存会被序列化"这件事体现在类型上；
3. `createDateFormatter` 同时防两种失败：reduced-ICU 拒绝 locale，以及值根本不是合法日期（先 parse 再校验，绝不抛）。

### 端到端结果

```
bun run smoke:home-v2 --url http://127.0.0.1:3000 --locales en,zh
→ 76/76 checks passed
```

页面上的每个数字都与数据库逐一核对过：

| 页面显示                 | 数据库查询                         |
| ------------------------ | ---------------------------------- |
| `7 launched today`       | `ongoing = 7`                      |
| `8 queued`               | `scheduled in next window = 8`     |
| `11 launches this month` | `launched+ongoing this month = 11` |
| `1,705 makers`           | `non-bot users = 1705`             |
| feed 恰好 7 行           | 7 个 ongoing                       |

以及三条**否定**断言，证明过滤真的生效：已隐藏评论（`THIS SHOULD NEVER APPEAR`）不在页面上、草稿博客（`DRAFT — SHOULD NOT APPEAR`）不在页面上、daily 视图不出现昨日及更早的项目。

真实渲染的整页截图：`artifacts/design-preview/live-home-desktop.png` / `live-home-mobile.png`（与 fixture 渲染的 `home-v2-*.png` 对比，可以看到真实数据下的密度与量级差异）。

### 同时修掉的 smoke 测试自身缺陷

首次对着真实页面跑时，`no "{count}"` 这条报了 4 次失败。查下来是**检查写错了**，不是页面错了：`{count}` 出现在内嵌的 next-intl **消息目录 JSON** 里（`"typeMilestone":"{project} reached {count} upvotes 🎉"` 这类），而不是渲染出来的文字。

修法是断言前先剥掉 `<script>` 块——顺带让结构计数只统计真实 DOM，不再把 RSC payload 里的同一批节点重复计一遍。**这次是我第二次抓到自己的检查在说谎**（第一次是 detail 文案写死），所以"检查必须能证伪"这件事在本文档里出现了两次，不是巧合。

---

## 十六、性能实测（移动端模拟，2026-09-10）

本地环境让性能终于可测了。方法：生产构建（`build:next` + `prepare-standalone`）跑在本地库上，Lighthouse 移动端模拟（4× CPU + Slow 4G），**同一台机器、同一份数据、只切 `HOME_V2`**。

| 指标             | 旧首页 `HOME_V2=0` | 新首页 `HOME_V2=1` | `performance-budgets.json`         |
| ---------------- | ------------------ | ------------------ | ---------------------------------- |
| performance 分数 | 89                 | **87**             | ≥ 70 ✓                             |
| **LCP**          | **3471 ms**        | **3761 ms**        | ≤ 3000 **两边都超**                |
| FCP              | 1371 ms            | 1792 ms            | —                                  |
| TBT              | 140 ms             | 95 ms              | —                                  |
| **CLS**          | 0.000              | **0.000**          | < 0.1 ✓                            |
| 总字节           | 645 KB             | 647 KB             | html ≤ 350 KB（HTML 本身远低于此） |

### 结论

1. **LCP ≤3000ms 的预算在旧首页上本来就没达标**（3471ms）。新版让它再涨 **+290ms（8%）**。所以"改版把 LCP 预算打爆了"这个说法不成立——它进来时就是红的；但**这 8% 的回归是真的**，需要单独处理。
2. **LCP 元素是 `<h1>` 标题文本，不是墙上的图片。** 旧首页的 LCP 元素是一个 `<p>` 正文段落。这一点很关键：说明 `fetchPriority="low"` + 懒加载 + 图块按断点封顶确实把 24 张装饰图挡在了 LCP 之外——我在设计时的假设被实测证实了。
3. **CLS 0.000，与旧版持平。** 墙是 `absolute inset-0` 装饰层，不参与文档流，没有引起任何位移。
4. **TBT 反而更低**（140 → 95ms），总字节几乎相同（+2 KB）。

那 +290ms 更可能来自 24 张 logo 请求在首屏加载期间争抢连接，而不是 LCP 元素本身。可行的下一步（本轮未做）：移动端图块从 12 降到 8、或把墙的渲染推迟到首次绘制之后，然后重测。

⚠️ 绝对数字的参考价值有限：这台机器当时内存吃紧（24 GB 用了 18 GB，swap 19 GB），模拟节流下的绝对值会偏悲观。**有意义的是同一环境下 A/B 的相对差**。

### 这一轮踩到的三个"假信号"（都记下来，避免下次重踩）

1. **`bun run build:next` 不包含 `prepare-standalone.ts`** —— 它不把 `.next/static` 拷进 `.next/standalone`，于是 standalone 服务的页面**完全没有 CSS**（返回 9 字节的 `Not Found`）。我第一次测出的 `CLS 1.258`、`perf 74`、以及"hero 墙 9600px 高、grid 没生效"全是这个假象。跑 `bun scripts/prepare-standalone.ts` 后 CSS 恢复 221 KB，真实 CLS 是 0.000。
2. **`/usr/bin/chromium` 在这台机器上跑 Lighthouse 会中途崩**（`page stopped responding`）。换成 Playwright 自带的 chromium（`CHROME_PATH=~/.cache/ms-playwright/chromium-*/chrome-linux/chrome`）后正常。仓库自带的 `measure-mobile-web-vitals.ts` 也受同一影响（它的 `CHROMIUM_PATH` 可覆盖）。
3. **standalone 服务的 `HOSTNAME` 必须与访问用的 host 一致**。`HOSTNAME=127.0.0.1` 时 next-intl 的中间件 rewrite 指向 `localhost`，Next 把跨 host 的 rewrite 降级成 307 → `/` 自我重定向成环。这不是产品 bug，是本地启动参数问题；用 `HOSTNAME=0.0.0.0` 并访问 `localhost` 即可。

---

## 十七、Phase 4：动作色全站统一（已完成）

### 审计先行的结论

用本地环境把内页真实渲染出来看（`/projects/[slug]`、`/trending`、`/categories`、`/pricing`），最刺眼的问题是一屏之内两种动作色：

- 导航的 Submit 胶囊是**橙色**（Phase 3 让它跟随 `HOME_V2`）
- 紧挨着的 **Sign up 按钮是绿色**（`--primary` 仍是品牌绿）
- 项目详情页的 "Visit Website" 是**整块绿色填充**
- 内页标题用 `font-heading`（Outfit），首页用编辑衬线——两套声音

### 做法：不逐个页面改，而是让全站采用首页的动作色

新增 `[data-app-palette="orange-green"]` 一段 CSS（`app/globals.css`），把 `--primary` / `--primary-foreground` / `--ring` 指向首页的 `--home-accent`；根布局在 `HOME_V2=1` 时把该属性打在 `<html>` 上。

```
开关关 → 该选择器不匹配，全站与今天逐字节一致
开关开 → 首页、导航、所有内页共用同一个动作色
```

这样灰度是**原子**的，回滚是一条环境变量。选择器写在 `:root` / `.dark` 之后，同特异性下后者胜出；`--primary: var(--home-accent)` 会自动解析成对应主题的橙值。

**刻意不动的**：`--accent`（shadcn 的细微悬停底色——把每个 outline 按钮的悬停都填成橙色太吵）与 `--sidebar-*`（控制台不在本次范围内）。

顺带收掉了 Phase 3 在导航里留下的重复判断：`useHomeAccent` 现在只管**形状**（胶囊/字重/内边距），颜色交给 `--primary`，不再有第二个真相来源。

### 语义核查

改之前先查了 `--primary` 有没有被用在**非动作**语义上（比如"成功/已认证"的绿）。结论：所有 `text-primary` 都是链接、悬停、徽章、领奖台这类动作/强调语义——调色板里根本没有 `--success` 这一类令牌，绿色从始至终只是品牌色兼动作色。**所以重映射语义正确，不存在"把成功提示改成橙色"的风险。**

### 可逆性验证（这一步比改本身更重要）

| `HOME_V2`         | `data-app-palette` | `--primary`                        | 首页   |
| ----------------- | ------------------ | ---------------------------------- | ------ |
| `0`（= 生产现状） | 不存在             | `#16a249`（原绿）                  | 旧首页 |
| `1`               | `orange-green`     | `#f96706`（橙，= `--home-accent`） | 新首页 |

开着时在三个内页上实测：`--primary` 均为 `#f96706`，Sign up 按钮计算样式 `rgb(249, 103, 6)`；`--home-highlight` 仍是绿 `#15843e`——即「橙主 + 绿点缀」在**全站**成立，而不只是首页。

### 又一次差点写下假结论

改完第一次截图，发现规则**根本没生效**（编译产物里搜不到 `[data-app-palette]`）。我加了个无关变量做探针，规则就出现了，差点得出"Tailwind 会丢弃纯主题变量的规则"这个结论并写进代码。

实际原因是：**dev 模式下 CSS 重编译有延迟，我上一次抓的是旧产物**。去掉探针、多等 15 秒后规则正常存在。

教训与第十四节、第十五节是同一条：**在把一条解释写进注释或文档之前，先用能证伪的方式验一遍**。这次的成本只是多等 15 秒。

---

## 十八、关于那 "+290ms LCP 回归"：查完之后我撤回它

§16 里我报了一个数字：LCP 从旧首页 3471ms 涨到新首页 3761ms（+290ms），并把它列为本轮待处理项。**认真去处理时发现它站不住。**

### 先把尺子校准

第一次测量的两个问题是：

1. **测的不是默认语言**。Lighthouse 两次都被从 `/` 307 到 `/zh`（next-intl 按 `Accept-Language` 选语言），所以测的是中文页，还多了一个重定向往返。
2. **只跑了各 1 次**。

改成直接测 `/zh`（无重定向）、每组各 2 次：

|            | 第 1 次 | 第 2 次 | 中位数      | 组内极差   |
| ---------- | ------- | ------- | ----------- | ---------- |
| 旧首页 LCP | 3338 ms | 3798 ms | **3568 ms** | **460 ms** |
| 新首页 LCP | 3940 ms | 3543 ms | **3742 ms** | **397 ms** |

**中位数差 174ms，组内噪声 400–460ms。** 也就是说：这个"回归"比测量噪声还小，**在这个环境里根本测不出来**。要判定一个 ~170ms 的效应，每组需要约 15–20 次运行。

所以：**我撤回 §16 那条"+290ms 回归"的结论**，也**没有**为了它去改设计。拿一个测不出来的信号去动版式，是纯粹的瞎折腾。

### 但有一样是确定性的，也确实处理了

请求数（两次运行完全一致，不受噪声影响）：**旧首页 67 → 新首页 77**。追下去发现其中一类是纯浪费：

**当前页签是一个指向自己的链接。** `TimeTabs` 把活动页签也渲染成 `<Link>`，而它的 href 就是当前 URL —— Next 于是为"你已经在的页面"发预取。改成 `<span aria-current="page">`：既不再自预取，语义也更正确（它不是导航）。

同时给"Daily archives"（`/winners`）加了 `prefetch={false}` —— 它在首屏但属于chrome，不是主行动。

请求数 77 → **75**。

### 剩下的 +8 个请求，我决定不继续砍

明细显示它们是 `priority=Low`、2–3KB、**470ms 前就全部结束**的 RSC 预取，不阻塞渲染。它们的来源是新首页确实多了可导航的结构（页签、Daily archives、次 CTA）。继续砍等于**用真实的导航速度去换一个测不出来的 LCP 收益** —— 不划算。

### 顺带一个观察（不是本次引入，也建议不要动）

非英文浏览器首次访问 `/` 会被 307 到 `/zh`，这是**一整次往返**才开始下载 HTML，对移动端 LCP 的影响比上面所有争论都大。但这是站点既有的 i18n 行为（旧首页同样如此），属于产品决策，不在这次改造范围内。如果要动，那才是真正值得测的一项。

### 结论

- 架构层面：**没有可测量的 LCP 回归**。
- 代码层面：修掉了一个真实的自我预取 + 一处无谓预取。
- 方法论层面：这是本会话第四次"先校准尺子再下结论"。前三次分别是检查脚本的 detail 文案、`{count}` 误报、以及 dev 模式 CSS 编译延迟。

---

## 十九、Phase 4b：项目详情页进入同一套语言

### 先把 fixture 补真，再动手

第一版审计里详情页几乎是空的（一行 tagline + 空评论区），差点据此去改版式。真正的原因是我的种子只写了 `description`，而详情页还会渲染 `productImage` / `longDescription` / `techStack` / `githubUrl` / `platforms` —— 真实项目都有，我的 fixture 没有。

**不能拿空页当设计依据**，所以 `scripts/seed-local-home-fixture.ts` 先扩成覆盖详情页的形状：封面图、多段 markdown 长描述（带 H2/H3 与列表）、技术栈、社交链接、平台，以及更长的评论。补完之后页面从 1345px 变成 1835px，才算能审。

### 结构整理：原子组件从 `home/v2` 提到 `components/ds/`

改内页要用这些原子时，`@/components/home/v2/tag-pill` 这种引用就是味道了——**第二个消费者出现，正是该提取的时候**。`pill-button` / `serif-heading` / `tag-pill` / `stat-pill` / `rank-badge` / `soft-card` 六个移到 `components/ds/`（`components/home/v2/` 只留首页专属的 hero、rails、feed 行等）。纯机械移动，`tsc` + `eslint` + 离线导出 + smoke 全程把关。

### 三处针对性修改

| 改动            | 之前                                           | 之后                                  |
| --------------- | ---------------------------------------------- | ------------------------------------- |
| 页面标题        | Inter 粗体 20px（像个 UI 标签）                | **编辑衬线 24px**（与首页同一声音）   |
| 分类 chip       | `bg-muted` 灰底 + `#` 图标                     | `TagPill` 细边框胶囊，可点击          |
| 技术栈 chip     | `bg-muted` 灰底 + `#` 前缀                     | `TagPill`                             |
| logo 边框       | 写死 `border-gray-200 dark:border-transparent` | `border-border`（令牌）               |
| PROJECT INFO 卡 | `bg-card rounded-lg border` + 普通大写标题     | `SoftCard` + 与首页侧栏一致的 eyebrow |

浏览器实测确认（不是靠眼看）：`h1Font = IBM Plex Serif`、`h1Size = 24px`、`tag-pill ×4`、`soft-card ×1`、**遗留 `#` chip = 0**、**硬编码 gray-200 边框 = 0**。

### 为什么只改这几处

详情页有评论区、分享、编辑、徽章、相关产品等一堆功能，属于"小步改、别碰功能"的典型。上面五处全部是**表达层**改动，零逻辑改动。trending / categories / pricing 的内页统一留到下一轮 —— 它们没有详情页这么高的落地权重。

---

## 二十、Phase 4c：trending / categories 统一

审计方式不变：三页各渲染一次，**先读数据再下判断**。

| 页面          | 审计发现                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/pricing`    | H1 已经是编辑衬线 48px —— **不用改**                                                                                                                               |
| `/categories` | H1 是 Inter 粗体，而且 **"Categories" 是硬编码英文**                                                                                                               |
| `/trending`   | **完全没有 H1**（主标题是 h2）；标题用 Inter 粗体；"Today's Launches" / "Live Now" / "Time Range" / "Active Launches" / "Quick Fix" / 空状态文案**全是硬编码英文** |

### 两个真问题

**1. `/trending` 没有 h1。** 这不是风格偏好——一个主要落地页缺少 h1，对 SEO 与读屏软件都是缺陷。改成 `SerifHeading as="h1"` 后恢复为每页恰好一个 h1。

**2. 主要页面上的硬编码英文。** 站点有 8 个语言，而 trending 的标题、侧栏标题、空状态全是英文写死的——**日文用户看到的是英文**。修法没有新造 8×N 个翻译，而是先查已有键：`home.sections` 里已有 `yesterdayTitle` / `monthTitle` / `quickAccess` / `topCategories`，直接复用；只有 5 个真正新的字符串进了新的 `trending` 命名空间（`todayTitle` / `liveNow` / `activeLaunches` / `timeRange` / `empty`）。categories 的 H1 复用了 `breadcrumb.categories`——**这个词 8 个语言早就翻译好了，不该再加一份重复的**。

### 视觉改动

- trending 主标题、categories 主标题与分类名 → 编辑衬线（`SerifHeading`），与首页/详情页/pricing 同一声音
- trending 侧栏的四个小标题 → eyebrow 风格（等宽大写小字），与首页侧栏一致

### 验证（隔离上下文，不用眼看）

```
categories-en  h1="Categories"          font=IBM Plex Serif  h1数=1
trending-en    h1="Today's Launches"    font=IBM Plex Serif  h1数=1
ja-trending    h1="本日のローンチ"        font=IBM Plex Serif  h1数=1
```

顺带记录一个陷阱：第一次验证时 `categories-en` 的 H1 显示成 **"カテゴリ"**，看着像 i18n 坏了。实际是我的测试脚本在同一个浏览器上下文里先访问了 `/ja/trending`，next-intl 种下的 `NEXT_LOCALE=ja` cookie 泄漏到了下一页。**改成每页独立 context 后正常。** 这已经是本会话第 N 次"先怀疑测量"救回一个假 bug。

### 剩下的

`/pricing` 不用改。内页统一到这里告一段落；trending 的**行样式**（编号 vs 首页的奖牌徽章、分类写文字 vs 胶囊）仍与首页信息流不同，但那涉及把首页的 `RankedRow` 与 trending 的交互式投票按钮合并，属于功能层的重构，不该混在视觉统一里顺手做。

---

## 二十一、Phase 5：5 个列表页统一到同一个行组件

### 之前的状态：同一个数据、四套行实现

| 页面                                    | 行组件                          | 问题                                            |
| --------------------------------------- | ------------------------------- | ----------------------------------------------- |
| 首页                                    | `RankedRow`（服务端，`<Link>`） | 基准                                            |
| trending / categories / projects / tags | `ProjectCard`（客户端）         | **整行是 `div` + `router.push`**，不是链接      |
| —                                       | —                               | 第三种 chip 样式（`bg-secondary rounded-full`） |

`ProjectCard` 的 `div + router.push` 意味着：**无法中键新标签打开、无法右键复制链接、读屏软件拿不到可宣告的链接**。统一到 `RankedRow` 顺带把这三个页面在语义上修好了——不只是换个皮。

### 做法：`actions` 插槽，而不是把行改成客户端组件

`RankedRow` 新增可选 `actions`。首页不传 → 保持纯服务端、零客户端 JS；投票类页面传 `ProjectCardButtons`（既有客户端组件）→ 保留交互投票。**服务端组件接收客户端组件的实例是安全的**，两边共用同一个行。

`/projects` 与 `/tags/[slug]` 一并迁移，然后删掉已成为死代码的 `components/home/project-card.tsx` 与 `components/home/project-section.tsx`（后者早已无人引用）。

### 我自己引入又自己抓到的 blocker

迁移完成后我意识到一个结构问题：`RankedRow` 的整行是 `<Link>`，而 `actions` 渲染在它**内部** —— 那就是 `<a>` 里套 `<a>` 和 `<button>`。浏览器实测确认：**trending 上有 7 处嵌套 `<a>`、7 个 `<a>` 内的 `<button>`**。

嵌套锚点是 HTML 解析错误（解析器会把内层 `<a>` 提出来，导致 hydration 与实际 DOM 不一致），交互语义也是坏的——点投票按钮可能同时触发导航。

修法是把行链接与 `actions` 改成**兄弟节点**：链接只包住内容区，hover 样式上移到 `<li>`，整行仍然作为一体高亮。修完实测：

| 页面                         | 嵌套 `<a>` | `<a>` 内 `<button>` |
| ---------------------------- | ---------- | ------------------- |
| trending                     | 7 → **0**  | 7 → **0**           |
| categories / projects / home | — → **0**  | — → **0**           |

### 顺带修掉的两个真缺陷

1. **`upvote-button` 的默认变体整套是蓝色**（`border-blue-500 bg-blue-500`、蓝色 hover）——在一个「橙色动作 + 绿色点缀」的系统里混进第四种颜色。已改为 `--primary` + 主题灰。
2. **它把英文单复数写死在代码里**：`{count === 1 ? "upvote" : "upvotes"}`，8 语言站点上所有非英文用户看到的都是英文。已改为 `upvote.count` 的 ICU 复数（en/es/pt/fr/et 用 `plural`，中日韩用简单插值——next-intl 两种都支持）。
3. 顺手把行内控件从 `h-12 border-2` 收到 `h-11 border`：原来按钮比 40px 的 logo 还大，视觉上压过了整行。h-11（44px）仍是平台最小触控尺寸。

### 全站不变量：每页恰好一个 h1

```
trending    h1×1 "Today's Launches"      衬线=true
categories  h1×1 "Categories"            衬线=true
projects    h1×1 "This Month's Best"     衬线=true
tags        h1×1 "#Productivity"         衬线=true
detail      h1×1 "Hexpack"               衬线=true
pricing     h1×1 "One launch. Two SEO…"  衬线=true
home        h1×1 "Where new products…"   衬线=true
```

改动前 trending 与 tags 是 **0 个 h1**。`/projects` 还有硬编码英文标题与手写单复数，`/tags`、`/categories` 有空状态硬编码英文，一并接入翻译（新增 `categories` / `tags` 两个键、复用已有键若干）。

### 一个我归因不了的改进

路由预算在构建后**下降**了：submit 与项目详情各少约 **14 KB gzip**（260,789→246,825、160,045→146,022），首页少了 86 B。四条仍然全部通过。

但我**没有记录改动前的 chunk 数**，因此无法证明这是删掉 `ProjectCard` 带来的真实缩减，还是 Next 的 chunk 重新划分（字节只是推迟到导航时加载）。记录在此，不当作成果邀功。

### 过程中一次 OOM

并发跑 构建 + tsc + Postgres + dev server 时把机器内存打爆，**本地 Postgres 进程被 OOM killer 杀掉**，若干任务被 SIGKILL。已恢复（`bun run local:db start`），之后改为串行执行。本地 24 GB 内存、当时已用 18 GB，属于环境限制而非代码问题。

### 自查发现的一处行为变化（待你决定）

被删掉的 `ProjectCard` 里有一个「直接访问官网」的外链（`<a>` 带 `getProjectWebsiteRelAttribute(...)` 计算出的 `rel`）。迁移到 `RankedRow` 后，列表行里**没有这个外链了**——用户要先点进项目页才能出去。

需要说明的是它原来的形态：图标 `opacity-0` 只在 hover 时出现，且 `hidden md:inline-block`——**移动端根本不可见**，桌面端也要悬停才看得到。所以它算不上一个好用的入口；同时列表页少一批出站链接对目录站反而有利（把权重留在站内）。

`getProjectWebsiteRelAttribute` 本身没有变成死代码（详情页与侧栏 `visit-website-card` 仍在用）。

**这一处我没有擅自恢复，也没有擅自当作改进**——它是一个产品取舍。要恢复的话很简单：`RankedRow` 已经有 `actions` 插槽，加一个外链图标即可（建议做成常显而不是 hover 才显）。

---

## 二十二、review 结果与修复（Phase 5）

独立审查给了 **2 个 blocker**，其中第一个是**我在本轮新引入的、与 Phase 2 完全同类的错误**。

### blocker 1：`upvote` 命名空间从未提供给客户端

我给 `UpvoteButton` 加了 `useTranslations("upvote")`，却没有把该命名空间加进任何 provider。next-intl 在缺命名空间时**不抛错**，而是把 key path 当文案渲染。浏览器实测：

```
/projects/hexpack   可见文本 = "upvote.count"   aria = "upvote.label"
/trending /categories /projects /tags           aria = "upvote.label"
```

HEAD 版本是 `${count} ${count===1?"upvote":"upvotes"}` —— 未翻译但**能用**。所以这是**本轮引入的回归**，且 `tsc`、`eslint` 全绿（静态门禁看不见运行时消息解析）。

**修复**：`upvote` 加进根布局的 `<main>` provider（列表页靠它），详情页的 provider 也补上（它为自己的子树覆盖消息）。命名空间只有 613 字节。

**修的过程中又踩了同一个坑的第二个变体**：我新加的 `project.list.viewCommentsFor` 也缺 provider，而 `project` 命名空间有 2777 字节——为两个字符串给每条路由加 1.8KB gzip 不划算。于是新建 82 字节的 `projectRow` 命名空间，只装这两个键。

### blocker 2：既有 e2e 会被打红

`e2e/authenticated-submit.spec.ts:19,22` 断言 `"Upvote (0 upvotes)"` / `"Remove upvote (1 upvotes)"`。

我把 `upvote.label` 改成**带票数的 ICU 复数**（review 的 major #3：改成不带 count 会让读屏用户再也听不到票数），于是 `"Upvote (0 upvotes)"` 仍然匹配 ✓；同时把 `removeLabel` 的语法修对（原来是 "1 upvotes"），e2e 里那条断言随之改为 `"Remove upvote (1 upvote)"` —— **测试原本编码的是一个语法 bug**。

修的过程中发现一个更隐蔽的点：`label` 改成复数串后**必须传 `count`**，否则 next-intl 缺参回退成 key —— 我第一次改完正是这个状态（可见文本已好、aria 仍是 `upvote.label`）。

### 其余修复

| review 项                                | 处理                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| major #3 未投票态丢票数                  | `label` 改为 `{count, plural, ...}`，aria 含票数                                |
| minor #4 `removeLabel` 无复数            | 改为 ICU 复数，同步改 e2e                                                       |
| minor #6 `ProjectCardButtons` 硬编码英文 | `View comments for …` / `Upvoting closed` 接入 `projectRow`（中日韩法实测正确） |
| minor #7 smoke 覆盖不到这类 bug          | **见下**                                                                        |
| minor #5 行内外链消失                    | 已在 §21 记录为产品取舍，未擅自恢复                                             |
| nit #8 actions 区域悬停高亮但点不动      | 接受（修嵌套交互的必然代价）                                                    |

### 把这类问题变成可自动拦截的

review 指出静态门禁抓不到这种 bug，我加了**通用规则**而不是只补两个字符串：smoke 现在扫描渲染出的标记（**含属性**，因为泄漏出现在 `aria-label` 里），匹配 `namespace.key` 形态即判失败，并把目标从首页扩到 `/trending`、`/categories`、`/projects`。

关键是**校准**：我故意把 `upvote` 从 provider 里拿掉，确认检查**真的变红**：

```
FAIL  /trending: no "upvote." — 7× — upvote namespace missing from the client provider
FAIL  /categories: no "upvote." — 1× — …
FAIL  /projects: no "upvote." — 7× — …
```

（第一次加的版本**没抓住** —— 我把扫描放在"去掉标签的可见文本"上，而泄漏在属性里。这正是校准存在的意义。）

恢复后 **157/157 通过**。

### 审查确认没问题的部分

删除 `ProjectCard` 安全（含全部动态 `import(` 枚举）；`actions` 插槽不污染首页（`RankedRow` 无 `"use client"`，`/` 上运行时 `button[aria-pressed]` = 0）；8 个 locale 键集合与占位符一致；中日韩用简单插值是正确做法（这三种语言没有复数范畴）；`div + router.push` → 真 `<a>` 是可爬取性、中键、预取的净改善；rel 语义无 SEO 回归；嵌套交互在当前版本已修（review 第一次读到的是未修版本）。

---

## 二十三、用真实生产数据渲染 + CI 门禁

### 为什么要做

到这一轮为止，新首页只在**手写 fixture** 上渲染过。手写 fixture 证明得了"版式能渲染"，证明不了"生产数据的形状能渲染"——生产里 52 个抽样项目**全部**有 tech_stack，**0 个**有 `cover_image_url`，tagline 全部存在，`daily_ranking` 只有 12/52 有，ongoing/launched/scheduled 的比例也完全不是均匀三分。

### 抽样（只读）

新增 `scripts/load-prod-sample.ts`：把**真实生产行的抽样**灌进独立的本地库 `open_launch_prodsample`。样本由只读 SELECT 抽取，存在 `artifacts/prod-sample.json`（gitignored）。

抽样本身踩了一个坑：**第一版按"状态优先级 + 日期倒序 LIMIT 60"抽，结果 53 个 scheduled + 7 个 ongoing、一个 launched 都没有**——而周榜/月榜渲染的正是 launched。改成按首页真实用到的三个窗口均衡抽样：15 ongoing + 25 launched + 20 scheduled。

加载器自身的两个 bug 也是实际暴露出来的：

- 用 `100000 + row_number() OVER ()` 生成评论 id，而 `row_number()` **每个 INSERT 都从 1 开始** → 跨项目 id 冲突，`ON CONFLICT DO NOTHING` 让只有第一个项目的评论进了库（9 条而非 144 条）
- 投票用 `LEAST(n, 投票人数)` 生成，被 40 个投票人封顶 → 每个项目都被压成 40 票左右，**"按票数排序"这条路径看起来被验证了、实际什么都没验证**

两处都修好并验证：本地票数与抽样值**逐条一致（32/32 项目零差异）**。

### 结果

冷缓存后，渲染值与数据库**逐位一致**：

```
  93  Saparo AI Shopping Agent     41  ToolVerified
  84  Rocket Sender for WA Web     41  Humanize AI Text
  61  Japanese Names               39  TarotGuide
                                   23  ToolListed
makers: 272    排序正确: True
```

`7 launched today · 8 queued` 与生产库的 SQL 结果一致；smoke **188/188 通过**。

### 我在这件事上栽了很久：`unstable_cache` 在 dev 下的真实位置

中途页面一直显示**陈旧数据**（旧项目名、被截断的 40 票），而数据库里明明是 93。我依次怀疑并排除了：`unstable_cache`、`.next/cache`、浏览器缓存、数据库连接、env 覆盖……**全都不对**。

真正的原因有两个，叠在一起：

1. **`job_kill` 杀不掉 Next dev 的子进程。** 被我"杀掉"的 dev server 仍在占着 3000 端口、握着内存里的缓存，所以我几次"重启"根本没生效。最后是 Next 自己告诉我的：`⨯ Another next dev server is already running. PID: 30`。
2. **dev 下的持久缓存不在 `.next/cache`，而在 `.next/dev/cache/fetch-cache`。** 我删了 `.next/cache/fetch-cache`、甚至整个 `.next/cache`，都毫无效果。直到 `grep -rl "Saparo AI Shopping Agent" .next/dev/cache` 直接命中那个文件。

**结论**：换数据库后必须 `rm -rf .next/dev/cache/fetch-cache`，否则看到的永远是上一次的数据。这条已写进本文档，也写进了给审查者的说明。

顺带：反复 SIGKILL dev server 把生成的 `.next/dev/types/routes.d.ts` 写坏了（第 83 行从 `ublish` 开始截断），导致 `tsc` 报一串语法错误。删掉该目录重新生成即可。**它掩盖了一个我真实引入的类型错误**（file 模式仍在用两个参数调用 `checkMarkup`）——生成文件损坏时，tsc 的"绿"或"红"都不可信。

### CI 门禁：新首页此前零自动覆盖

`.github/workflows/ci.yml` 里**没有 `HOME_V2`**，所以 e2e、路由预算、Lighthouse 全都在测**旧首页**。这轮做的三栏布局、Launch Wall、左右栏、`actions` 插槽、i18n —— 在 CI 里没有任何一条断言碰过。

新增步骤 `Smoke the redesigned home (HOME_V2=1)`，加在 `release-gates` 里：用 `HOME_V2=1` 起 standalone 服务，跑 `smoke:home-v2`，覆盖首页 + `/trending` + `/categories` + `/projects` + 三个语言。

### 让门禁不会因为"没有数据"而误报

第一次把 smoke 指向空库（`open_launch_e2e`，0 项目）时，**4 类断言同时失败**。逐个处理后：

| 检查                                                         | 原来           | 现在                                                    |
| ------------------------------------------------------------ | -------------- | ------------------------------------------------------- |
| `rank-badge` / `hero-wall` / `tag-pill` / `launch-countdown` | 无条件要求渲染 | 目标无数据时**报告**而非强制                            |
| `ItemList` 结构化数据                                        | 无条件要求     | 同上（本来只在有行时输出）                              |
| `/trending` `/categories` `/projects` 的 200                 | 无条件要求     | 空库时这些路由确实无可展示、会 `notFound()`，降级为报告 |

判断"有没有数据"的信号我写错过一次：先用 `/projects/`，但它会命中导航里的 **Submit Project** 链接，永远为真。改成用首页自身的 `data-slot="rank-badge"` 计数，并且**必须在 `visibleMarkup()` 之后统计**——原始 HTML 里的 RSC payload 也含有 `data-slot` 字符串。

最后：空库 **97/97 通过**，有数据的库 **188/188 通过**。

### 过程中的第三个静默失败

这轮我有**两次**用脚本改代码时"替换成功"的提示打了、实际没匹配上（一次是函数签名，一次是整个断言块，因为 prettier 重排过格式）。第二次导致数据感知逻辑根本没生效，而我以为已经生效。**教训：每一次程序化替换都必须带断言**——我在同一批里有的加了断言、有的没加，没加的那两处就是出问题的那两处。

---

## 二十四、第二轮 review：1 blocker + 2 major，全部修复并实测

### blocker：加载器的安全守卫可被查询串绕过

`load-prod-sample.ts` 的安全承诺是"绝不误删非本地库"。但我用 `new URL(url).hostname` 校验，却把整个连接串交给 `new Client()` —— 而 **node-postgres 的查询串参数优先于 URL**：

```
postgresql://postgres@127.0.0.1:55432/open_launch_prodsample?host=evil.example.com
```

守卫看到的是 `127.0.0.1`，`pg` 连的是 `evil.example.com`。审查者用本地监听器**端到端复现**了：守卫打印"通过"，而 `127.0.0.2:55433` 上的监听器收到了连接。库名叫 `open_launch_prodsample*` 就够 → **远程库被 TRUNCATE**。

修法两条一起上：

1. **出现 `host`/`hostaddr`/`port`/`dbname`/`database` 任一查询参数直接拒绝**（它们的"存在"本身就是问题，不是需要调和的差异）；
2. 连上之后**校验真实连接**：`select current_database(), host(inet_server_addr())` 必须匹配预期库名且为回环。

复测（5 个用例）：`?host=` 拦截 ✓、`?dbname=` 拦截 ✓、远程主机拦截 ✓、库名不符拦截 ✓、合法目标放行并完成加载 ✓。

**修的过程中我自己引入又自己抓到第二个 bug**：`inet_server_addr()` 返回的是 `127.0.0.1/32`（**带掩码**），我的精确匹配把**合法目标也拒了** —— 脚本会完全不可用。改用 `host(inet_server_addr())` 取裸地址。（好在检查在事务之前，没有动到数据。）

### major #1：一个信号门控所有视图，同时造成假阴性与假阳性

`targetHasData` 只从日榜推导，却拿去门控周榜/月榜：

- **假阴性**：日期刚翻页（日榜空、月榜满）→ 标志为假 → 检查被跳过，**全绿但与数据齐全无法区分**
- **假阳性**：只有当天 ongoing 的启动日 → 日榜有行 → 标志为真，而周/月榜**合法为空** → 门禁**报错**

修法是**按视图取样**：每个视图用它自己的行数决定该视图的断言是否强制；hero（墙与倒计时）用**所有视图的并集**，因为它由路由渲染、与 tab 无关。

修完复测四种数据形态（串行，见下）：

| 形态                     | 修复前              | 现在                                       |
| ------------------------ | ------------------- | ------------------------------------------ |
| 完整真实数据             | 通过                | `rank-badge 7×/20×/20×` 全部强制           |
| **FP**（仅当天 ongoing） | **FAIL + 退出码 1** | 合法为空 → 通过                            |
| **FN**（日期前移 3 天）  | 静默跳过、假全绿    | weekly `19×`、monthly `20×` **被强制验证** |
| 空库                     | 内页 404 被放行     | 内页 200 **无条件强制**                    |

修 M1 时我**又漏了同一层的东西**：hero 信号只算了 locale 视图、没算 tab，于是 FN 形态下 `home-hero-wall` 显示了却不被强制。四形态复测的输出把这暴露出来（`rank-badge` 显示 absent 而 `home-hero-wall` 显示 1×），补上并集后 FN 形态的 `target has ranked` 才正确变成 `yes`。

### major #2：内页 HTTP 200 对 404 也放行

我用 `status === 200 || !targetHasData` 放宽，审查者用全 404 的 base 实测：三条内页全部报 `ok ... status 404`。结合 M1 的假阴性路径，**真正坏掉的内页会被报成通过**。而且这个放宽从未被触发 —— 实测空库下这三条路由**全部返回 200**（各自渲染空状态）。已改为无条件强制。

### 其余

- FORBIDDEN 检查跑了**两遍**（重构时 `checkRenderedText` 已含它，旧循环没删）→ 删除，检查数从 127 降到 100（同样覆盖）
- **TRUNCATE 的爆炸半径**：注释说"只有自己拥有的 9 张表"，实测 CASCADE 多清了 14 张（含 `bookmark`/`notification`/`promo_code_usage` 用户数据）。改为**显式列出全部 23 张表且不用 CASCADE** —— 漏表会立刻报错（我漏了 `upvote`，它当场报出来了，这正是想要的行为）
- **`"::1"` 是死条目**：`new URL()` 返回带括号的 `"[::1]"`，合法 IPv6 回环被误拒 → 去括号后比较
- **评论作者池**排除 bot，避免撞部分唯一索引被 `ON CONFLICT` 静默吞行

### 又一个"共享缓存"陷阱（比上一次更深）

为了同时验证四种数据形态，我在四个端口起了四个 standalone 服务、各连一个库 —— 结果**四个页面字节级一致**。原因是它们从同一个 `.next` 目录启动，**共享磁盘上的 `fetch-cache`，而缓存键里不含数据库**。

改成**串行**：每轮清 `.next/standalone/.next/cache` + 换库 + 重启，才得到上表那些真实差异。

同时补上审查者的运维提醒：**只删磁盘缓存不够，dev server 进程内还持有 `unstable_cache` 的内存副本**（审查者观察到请求期间 `pg_stat_activity` 零连接，整页来自缓存）。换库必须**重启 dev server**。

顺带踩到本会话早期就记录过的坑：`HOSTNAME=127.0.0.1` + `localhost` 的 rewrite 会退化成 `/`→`/` 的 307 循环 —— 四个服务一开始全部 `TooManyRedirects`，改成 `HOSTNAME=0.0.0.0` + 访问 `localhost` 即可。**文档里写过，但没连到这次脚本上。**

### 补记：把 key-path 检查从"形状匹配"改成"命名空间锚定"

接 CI 之前我拿新检查在本地 fixture 上跑，**它自己误报了三次**：`example.com`（fixture 里的占位 URL）→ `figma.com`（项目描述里的裸域名）→ `aat.ee`（页脚版权）。

前两次我想靠白名单解决，然后意识到这是**打地鼠**：每加一个域名，就多一分把真泄漏一起放过的风险。

判据本身选错了。泄漏渲染出来的是 **`命名空间.键`**，而**命名空间是有限且已知的**——就是 `messages/en.json` 的顶层键。改成用真实命名空间做锚定后：

- 误报归零（没有任何域名是消息命名空间）
- 仍然精确抓住真泄漏：故意把 `upvote` 从 provider 移除 → `rendered "upvote.label"`，恢复后 122/122

扫描范围也收窄为**泄漏真正会出现的位置**（可见文本 + `aria-label`/`title`/`alt`/`placeholder`），不再扫 `href`/`src`——域名待在那里。

顺带记一笔操作教训：我用"按索引切块"的方式删这段代码时**切多了**，把 `countOccurrences`、`hasRankedRows` 两个辅助函数和几个 import 一起删掉了。tsc 逐个报了出来，但这类编辑方式本身就不该用——**替换应该基于精确文本匹配 + 断言，而不是区间切割**。这已经是同一类问题的第三次了（前两次是静默失败的替换）。

---

## 二十五、无障碍审计：首次做，发现的问题与修复

在此之前我从没跑过无障碍审计。第一次跑，四个主要页面**全部** `color-contrast` 不通过。

### 主 CTA 的白字只有 3.01:1

橙色 `#f96706` 上的白字是 **3.01:1**，低于 WCAG AA 正文所需的 4.5（只够大字/图形的 3.0 门槛）。这影响导航的 "Submit Project"、hero 的 "Submit your project"、右栏的 "Submit Project" —— **每一个主要行动点**。

**不是本轮引入的**：旧绿色 `#16a249` 是 3.33:1，同样不达标；橙色让它更低了。但改造正是修它的合适时机。

选定的修法（你选的 A）：把亮色模式的 `--home-accent` 从 `hsl(24, 95%, 50%)` 换成 `hsl(21, 90%, 40%)`（`#c24a0a`）——

|                               | 白字对比度      |
| ----------------------------- | --------------- |
| 旧 `#f96706`                  | 3.01:1 ✗        |
| **新 `#c24a0a`**              | **4.91:1 ✓ AA** |
| 新 hover（`hsl(21,92%,34%)`） | 6.30:1 ✓        |

暗色模式不动：那边用的是亮橙 + 深色字，本来就有 7.15:1。

### 一处渲染值与源文件不一致的假象

改完之后浏览器实测仍是旧橙色。查服务端吐出的 CSS —— 也还是 `#f96706`。重启 dev server 之后**还是**。

真凶是 **Turbopack 的构建缓存**：`rm -rf .next/dev/cache/turbopack` 之后新的 `--home-accent: #c24a0a` 才出现。这是本轮第三次栽在缓存上（前两次是 `fetch-cache`，以及"`job_kill` 杀不掉 dev server 子进程"）。**改 CSS 后如果看到的还是旧值，先清构建缓存，别怀疑代码。**

### 其余修复

| 问题                                   | 处理                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| categories 两个按钮无可访问名称        | 排序按钮的文字在 `<md` 被隐藏、Radix Select 触发器在内容打开前没有文本 → 都加 `aria-label`；顺带发现 Select 的 placeholder 是**硬编码法语**，换成 8 语言的翻译键 |
| `--muted-foreground` 在浅灰底上 4.34:1 | 45.1% → 43.5%（`#737373` → `#6f6f6f`），4.61:1                                                                                                                   |
| Visit Website 卡副标题 `opacity-80`    | 3.7:1 → 去掉透明度（层次已由字号与字重承担）→ 5.18:1                                                                                                             |
| 未登录时 upvote 按钮 `opacity-75`      | 2.89:1。它**仍可点击**（会弹登录提示），不适用 WCAG 对"非活动控件"的豁免 → 去掉透明度，保留 `cursor-not-allowed`                                                 |

给客户端组件加 `useTranslations("categories")` 时，我**同步把这个命名空间加进了 provider** —— 前两轮被 review 抓过两次的正是漏掉这一步，这次没再犯（smoke 也确实是这么设计的：它会当场抓住这类泄漏）。

### 结果

| 页面       | 前  | 后      |
| ---------- | --- | ------- |
| home       | 89  | **93**  |
| trending   | 96  | **100** |
| categories | 91  | **100** |
| detail     | 97  | **100** |

home 剩下两条与颜色无关：正文内链与周围文字对比不足 1.03:1、页脚链接点击区只有 16px 高（低于 24px 最小）—— 都是既有问题，记入待办。

### 附：用 CI 自己的方法测新首页

跑了 `perf:build` + Lighthouse + `perf:budget`（和 CI 一致的口径）：

- `routeJsGzipBytes = 124,874` ✓ 在 160,000 预算内
- LCP = 3505ms > 3000 预算 → `passed: false`，但 mode 是 `observe`（不阻塞）

**两臂对照后这不算回归**：同一方法各测两次，旧首页中位数 3730ms、新首页 3802ms，差 +72ms，而臂内波动就有 ±380ms。

**顺带修了一个 CI 脆弱点**：CI 的 Lighthouse 步骤没有固定语言，非英语 locale 的 runner 上 `/` 会被重定向到 `/zh`，`perf:budget` 会直接以 `Lighthouse target mismatch` **报错退出**（我在本机就复现了），而不是给出预算结论。已给该步骤加上 `--extra-headers '{"Accept-Language":"en-US,en;q=0.9"}'`。

---

## 二十六、legacy 首页的退场计划（决定：观察期后删除）

生产已于 2026-09-11 启用 `HOME_V2=1`（r33b）。开关保留**作为回滚手段**，但它承载的是两条并行实现，不能无限期留着。

### 现状

| 部分                                   | 行数 | 说明        |
| -------------------------------------- | ---- | ----------- |
| `app/[locale]/page.tsx` 的 legacy 分支 | ~390 | 旧两栏首页  |
| `components/home/dense-list.tsx`       | ~122 | 仅供 legacy |
| `components/home/editorial-hero.tsx`   | ~132 | 仅供 legacy |

**共享契约**：两条分支都调 `getHomeProjectGroups(locale)`（legacy `page.tsx:57`、v2 `home-v2.tsx:72` 取 `groups[0]` 作今日列表），并共用 `PROJECT_LIMITS_VARIABLES`。周/月页签用各自的 fetcher，但传入同一个 `TODAY_LIMIT`，以保证三个页签行数一致。

这个共享是**有意的**（重设计不应改变"列出什么"，只改变"怎么呈现"），但它的副作用是：**改 `getHomeProjectGroups` 的 limit 或本地化步骤会同时影响两条路径**，而改错一边不会立刻显形。

### 退场条件（全部满足即可执行）

- [ ] 生产 `HOME_V2=1` 稳定运行 **14 天**（即 2026-09-25 之后）
- [ ] 期间无需要回滚首页的事件
- [ ] 首页相关的错误日志与 `unsubscribe` 类告警无异常上升

### 退场步骤（一次性提交）

1. 删除 `app/[locale]/page.tsx` 中的 `isHomeV2Enabled()` 分支与 legacy 渲染路径，把 `HomeV2` 变成该路由的唯一输出
2. 删除 `components/home/dense-list.tsx`、`components/home/editorial-hero.tsx`，并确认 `components/home/premium-card.tsx` 等 legacy 依赖已无引用（本轮已删 11 个零引用组件，需再查一次）
3. 移除 `HOME_V2`：`app/layout.tsx` 的 `data-app-palette` 改为无条件挂载、`.env.example`、生产 compose 契约的 `environment` 块
4. 用 `grep -rn "HOME_V2" app components lib scripts docs` 清零，并删除本节
5. 跑全量门禁 + 部署

**注意第 3 步的语义变化**：`HOME_V2` 不只切首页，它还通过 `data-app-palette` 驱动**全站**的 `--primary` 动作色。无条件挂载后，回滚首页将不再可能只靠环境变量——这正是要一次性做完的原因，也是**在退场前不要再改 legacy 分支**的理由。

### 在那之前

若必须调整首页数据（limit、窗口、本地化），**改 `app/actions/home.ts` 里的共享函数**，两条分支会一起变；不要只改其中一条分支的调用点。
