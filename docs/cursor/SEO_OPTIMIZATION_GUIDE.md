# SEO 优化完整指南

## 📋 当前 SEO 状态评估

### ✅ 已实施的 SEO 优化

1. **技术 SEO**

   - ✅ sitemap.xml（动态生成）
   - ✅ robots.txt（含 AI 爬虫规则）
   - ✅ llms.txt（AI/LLM 爬取指令）
   - ✅ 404 页面（not-found.tsx）

2. **Meta 标签**

   - ✅ Title 标签
   - ✅ Description 标签
   - ✅ Keywords 标签
   - ✅ Open Graph 标签
   - ✅ Twitter Card 标签

3. **性能优化**

   - ✅ 图片优化（AVIF 自动转换）
   - ✅ Next.js Image 组件（quality=95）
   - ✅ CDN 缓存（1年）
   - ✅ 多层缓存策略

4. **分析工具**
   - ✅ Google Analytics (GA4)

---

## 🚀 建议实施的 SEO 优化

### 1️⃣ 结构化数据（Schema.org JSON-LD）⭐⭐⭐⭐⭐

**优先级：最高**

#### 为什么重要？

- 🎯 Google 富文本搜索结果（Rich Snippets）
- ⭐ 提升搜索结果展示效果
- 📈 提高点击率（CTR）10-30%
- 🤖 帮助搜索引擎理解内容

#### 需要实施的结构化数据类型

##### A. 网站整体 - Organization Schema

**位置**: `app/layout.tsx`

```typescript
// 添加到 <head> 中
<Script id="schema-organization" type="application/ld+json">
{`
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "aat.ee",
  "alternateName": "aat.ee - Product Hunt Alternative",
  "url": "https://www.aat.ee",
  "description": "Modern Product Hunt alternative for discovering startups, AI tools, and SaaS launches",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://www.aat.ee/search?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  },
  "publisher": {
    "@type": "Organization",
    "@id": "https://www.aat.ee/#organization",
    "name": "aat.ee",
    "url": "https://www.aat.ee",
    "logo": {
      "@type": "ImageObject",
      "url": "https://www.aat.ee/logo.png",
      "width": 512,
      "height": 512
    },
    "sameAs": [
      "https://twitter.com/aat_ee",
      "https://github.com/aat-ee"
    ]
  }
}
`}
</Script>
```

##### B. 项目页面 - Product/SoftwareApplication Schema

**位置**: `app/projects/[slug]/page.tsx`

```typescript
// 在项目详情页面添加
<Script id="schema-product" type="application/ld+json">
{`
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "${projectData.name}",
  "description": "${stripHtml(projectData.description)}",
  "url": "${projectData.websiteUrl}",
  "image": "${projectData.productImage || projectData.logoUrl}",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "${projectData.platforms?.join(', ')}",
  "offers": {
    "@type": "Offer",
    "price": "${projectData.pricing === 'FREE' ? '0' : 'varies'}",
    "priceCurrency": "USD"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.5",
    "reviewCount": "${projectData.upvoteCount}"
  },
  "author": {
    "@type": "Organization",
    "name": "aat.ee"
  },
  "datePublished": "${projectData.scheduledLaunchDate?.toISOString()}"
}
`}
</Script>
```

##### C. 博客文章 - Article Schema

**位置**: `app/blog/[slug]/page.tsx`

```typescript
<Script id="schema-article" type="application/ld+json">
{`
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "${article.title}",
  "description": "${article.description}",
  "image": "${article.image}",
  "datePublished": "${article.publishedAt.toISOString()}",
  "dateModified": "${article.updatedAt.toISOString()}",
  "author": {
    "@type": "Person",
    "name": "${article.author || 'aat.ee Team'}",
    "url": "https://www.aat.ee"
  },
  "publisher": {
    "@type": "Organization",
    "name": "aat.ee",
    "logo": {
      "@type": "ImageObject",
      "url": "https://www.aat.ee/logo.png"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://www.aat.ee/blog/${article.slug}"
  }
}
`}
</Script>
```

##### D. 面包屑导航 - BreadcrumbList Schema

```typescript
<Script id="schema-breadcrumb" type="application/ld+json">
{`
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://www.aat.ee"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Projects",
      "item": "https://www.aat.ee/projects"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "${projectData.name}",
      "item": "https://www.aat.ee/projects/${projectData.slug}"
    }
  ]
}
`}
</Script>
```

##### E. 列表页面 - ItemList Schema

**位置**: `app/page.tsx`（首页项目列表）

```typescript
<Script id="schema-itemlist" type="application/ld+json">
{`
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Latest Product Launches on aat.ee",
  "description": "Discover the newest startups and tools",
  "numberOfItems": ${projects.length},
  "itemListElement": [
    ${projects.map((project, index) => `
    {
      "@type": "ListItem",
      "position": ${index + 1},
      "item": {
        "@type": "SoftwareApplication",
        "name": "${project.name}",
        "url": "https://www.aat.ee/projects/${project.slug}",
        "image": "${project.logoUrl}"
      }
    }`).join(',')}
  ]
}
`}
</Script>
```

---

### 2️⃣ 页面内容 SEO 优化⭐⭐⭐⭐⭐

#### A. 语义化 HTML 标签

**当前状况**: 检查使用情况
**建议**:

```tsx
// 使用正确的 HTML5 语义化标签
<article>  // 项目详情、博客文章
<section>  // 页面区块
<nav>      // 导航菜单
<aside>    // 侧边栏
<header>   // 页头
<footer>   // 页脚
<main>     // 主要内容
```

#### B. H1-H6 标题层级

**规则**:

- ✅ 每页只有一个 `<h1>` 标签
- ✅ 标题层级不跳跃（h1 → h2 → h3）
- ✅ 标题包含关键词

**检查清单**:

```tsx
// ❌ 错误
<h1>Welcome</h1>
<h3>Subtitle</h3>  // 跳过了 h2

// ✅ 正确
<h1>Discover New Startups on aat.ee</h1>
<h2>Featured Launches</h2>
<h3>Project Name</h3>
```

#### C. 图片 Alt 标签

**当前**: 部分实施
**改进**:

```tsx
// ❌ 不好
<img src="logo.png" alt="logo" />

// ✅ 好
<img
  src="logo.png"
  alt="ProjectName - AI-powered tool for X"
  title="ProjectName Logo"
/>

// ✅ 最好（描述性 + 关键词）
<Image
  src={project.logoUrl}
  alt={`${project.name} - ${project.tagline} | Product logo`}
  title={`Visit ${project.name}`}
  quality={95}
/>
```

#### D. 内部链接优化

**策略**:

1. **描述性锚文本**

```tsx
// ❌ 不好
<Link href="/projects/tool">点击这里</Link>

// ✅ 好
<Link href="/projects/tool">
  Discover {projectName} - AI Tool for Marketing
</Link>
```

2. **相关内容链接**

```tsx
// 在项目页面添加相关项目链接
<aside>
  <h3>Related Projects in {category}</h3>
  <ul>
    {relatedProjects.map((project) => (
      <li key={project.id}>
        <Link href={`/projects/${project.slug}`}>{project.name}</Link>
      </li>
    ))}
  </ul>
</aside>
```

3. **面包屑导航**（建议添加）

```tsx
// components/layout/breadcrumb.tsx
<nav aria-label="Breadcrumb">
  <ol itemScope itemType="https://schema.org/BreadcrumbList">
    <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
      <Link href="/" itemProp="item">
        <span itemProp="name">Home</span>
      </Link>
      <meta itemProp="position" content="1" />
    </li>
    <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
      <Link href="/projects" itemProp="item">
        <span itemProp="name">Projects</span>
      </Link>
      <meta itemProp="position" content="2" />
    </li>
    <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
      <span itemProp="name">{projectName}</span>
      <meta itemProp="position" content="3" />
    </li>
  </ol>
</nav>
```

---

### 3️⃣ 页面 Metadata 完善⭐⭐⭐⭐

#### A. Canonical URLs

**添加到所有页面**:

```typescript
// app/projects/[slug]/page.tsx
export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  return {
    title: `${projectData.name} | aat.ee`,
    description: stripHtml(projectData.description),
    alternates: {
      canonical: `https://www.aat.ee/projects/${params.slug}`,
    },
    // ...
  }
}
```

#### B. 社交媒体标签完善

**Open Graph 扩展**:

```typescript
openGraph: {
  title: `${projectData.name} on aat.ee`,
  description: stripHtml(projectData.description),
  url: `https://www.aat.ee/projects/${slug}`,
  siteName: "aat.ee",
  locale: "en_US",
  type: "website",
  images: [
    {
      url: projectData.productImage || projectData.logoUrl,
      width: 1200,
      height: 630,
      alt: `${projectData.name} - Product Image`,
    },
  ],
  // 添加
  publishedTime: projectData.scheduledLaunchDate?.toISOString(),
  modifiedTime: projectData.updatedAt.toISOString(),
  authors: ['aat.ee'],
  section: projectData.categories[0]?.name,
  tags: projectData.categories.map(c => c.name),
}
```

**Twitter Card 扩展**:

```typescript
twitter: {
  card: "summary_large_image",
  site: "@aat_ee",         // 添加网站 Twitter 账号
  creator: "@aat_ee",      // 添加创建者账号
  title: `${projectData.name} on aat.ee`,
  description: stripHtml(projectData.description),
  images: [projectData.productImage || projectData.logoUrl],
}
```

#### C. 添加 robots meta 标签

```typescript
// 对于不想被索引的页面
export const metadata: Metadata = {
  robots: {
    index: false, // 不索引
    follow: false, // 不跟踪链接
    nocache: true, // 不缓存
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

// 对于重要页面（默认）
export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
}
```

---

### 4️⃣ 性能优化（Core Web Vitals）⭐⭐⭐⭐⭐

#### A. 图片懒加载

**已实施**: Next.js Image 组件默认懒加载
**优化**:

```tsx
// 关键图片（首屏）
<Image
  src={hero}
  priority      // 预加载
  loading="eager"
/>

// 非关键图片（下方内容）
<Image
  src={thumbnail}
  loading="lazy"   // 懒加载（默认）
  quality={95}
/>
```

#### B. 字体优化

**已实施**: Google Fonts 通过 next/font
**确认**:

```typescript
// app/layout.tsx
const fontSans = Inter({
  subsets: ["latin"],
  display: "swap", // ✅ 确保有 display: swap
  preload: true, // ✅ 预加载字体
  fallback: ["system-ui", "arial"], // ✅ 备用字体
})
```

#### C. 关键资源预加载

```tsx
// app/layout.tsx
<head>
  {/* 预加载关键字体 */}
  <link
    rel="preload"
    href="/fonts/inter.woff2"
    as="font"
    type="font/woff2"
    crossOrigin="anonymous"
  />

  {/* 预连接到外部域名 */}
  <link rel="preconnect" href="https://statics.aat.ee" />
  <link rel="dns-prefetch" href="https://statics.aat.ee" />

  {/* 预加载关键 CSS */}
  <link rel="preload" href="/styles/critical.css" as="style" />
</head>
```

#### D. 第三方脚本优化

**已实施**: Google Analytics 使用 `strategy="afterInteractive"`
**确认没有阻塞渲染的脚本**

---

### 5️⃣ RSS Feed⭐⭐⭐

**创建**: `app/feed.xml/route.ts`

```typescript
import { NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { blogArticle, launchStatus, project } from "@/drizzle/db/schema"
import { desc, eq, or } from "drizzle-orm"

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

  // 获取最新博客文章
  const articles = await db
    .select()
    .from(blogArticle)
    .orderBy(desc(blogArticle.publishedAt))
    .limit(20)

  // 获取最新项目
  const projects = await db
    .select()
    .from(project)
    .where(
      or(
        eq(project.launchStatus, launchStatus.ONGOING),
        eq(project.launchStatus, launchStatus.LAUNCHED),
      ),
    )
    .orderBy(desc(project.scheduledLaunchDate))
    .limit(20)

  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>aat.ee - Latest Launches & Insights</title>
    <link>${baseUrl}</link>
    <description>Discover new startups, AI tools, and product launches</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    
    ${articles
      .map(
        (article) => `
    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${baseUrl}/blog/${article.slug}</link>
      <description>${escapeXml(article.description)}</description>
      <pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>
      <guid isPermaLink="true">${baseUrl}/blog/${article.slug}</guid>
    </item>`,
      )
      .join("")}
    
    ${projects
      .map(
        (proj) => `
    <item>
      <title>${escapeXml(proj.name)}</title>
      <link>${baseUrl}/projects/${proj.slug}</link>
      <description>${escapeXml(stripHtml(proj.description))}</description>
      <pubDate>${new Date(proj.scheduledLaunchDate!).toUTCString()}</pubDate>
      <guid isPermaLink="true">${baseUrl}/projects/${proj.slug}</guid>
    </item>`,
      )
      .join("")}
  </channel>
</rss>`

  return new NextResponse(rss, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  })
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim()
}
```

**添加到 layout.tsx**:

```tsx
<head>
  <link
    rel="alternate"
    type="application/rss+xml"
    title="aat.ee RSS Feed"
    href={`${process.env.NEXT_PUBLIC_URL}/feed.xml`}
  />
</head>
```

---

### 6️⃣ 本地 SEO（如适用）⭐⭐⭐

**如果有实体地址或针对特定地区**:

```typescript
// 添加 LocalBusiness Schema
<Script id="schema-localbusiness" type="application/ld+json">
{`
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "aat.ee",
  "image": "https://www.aat.ee/logo.png",
  "url": "https://www.aat.ee",
  "telephone": "+1-XXX-XXX-XXXX",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Street",
    "addressLocality": "City",
    "postalCode": "12345",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 40.7128,
    "longitude": -74.0060
  },
  "openingHoursSpecification": {
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday"
    ],
    "opens": "09:00",
    "closes": "17:00"
  }
}
`}
</Script>
```

---

### 7️⃣ 移动端 SEO⭐⭐⭐⭐⭐

#### A. Viewport 配置

**检查**: `app/layout.tsx`

```tsx
// 应该有（通常 Next.js 自动添加）
<meta name="viewport" content="width=device-width, initial-scale=1" />
```

#### B. 移动友好测试

**测试工具**:

- Google Mobile-Friendly Test: https://search.google.com/test/mobile-friendly
- PageSpeed Insights (Mobile): https://pagespeed.web.dev/

#### C. 触摸目标大小

**确保**:

- 按钮至少 44x44px
- 链接间距足够
- 表单元素易于点击

---

### 8️⃣ 国际化（hreflang）⭐⭐⭐

**如果计划多语言支持**:

```typescript
// app/layout.tsx
export const metadata: Metadata = {
  alternates: {
    languages: {
      "en-US": "https://www.aat.ee",
      "zh-CN": "https://www.aat.ee/zh",
      "ja-JP": "https://www.aat.ee/ja",
    },
  },
}
```

```tsx
// 手动添加 hreflang 标签
<head>
  <link rel="alternate" hrefLang="en" href="https://www.aat.ee" />
  <link rel="alternate" hrefLang="zh" href="https://www.aat.ee/zh" />
  <link rel="alternate" hrefLang="x-default" href="https://www.aat.ee" />
</head>
```

---

### 9️⃣ 内容策略⭐⭐⭐⭐

#### A. 博客内容优化

**关键词研究**:

1. 使用工具：

   - Google Keyword Planner
   - Ahrefs
   - SEMrush
   - Answer the Public

2. 目标关键词类型：
   - 短尾：`product hunt alternative`
   - 长尾：`best product hunt alternative for startups 2024`
   - 问题型：`how to launch a product online`

#### B. 内容长度

**建议**:

- 博客文章：1500-2500 字
- 产品描述：300-500 字
- Meta Description：150-160 字符

#### C. 内容更新频率

**策略**:

- 主要页面：每季度审查更新
- 博客：每周至少 1-2 篇
- 产品页面：实时更新

---

### 🔟 链接建设⭐⭐⭐⭐

#### A. 外部链接获取

**策略**:

1. **产品目录提交**

   - Product Hunt
   - BetaList
   - Hacker News
   - Reddit (r/SideProject)
   - Indie Hackers

2. **内容营销**

   - Guest Posting
   - 专家访谈
   - 案例研究

3. **合作伙伴**
   - 工具评测网站
   - 科技博客
   - YouTube 评测者

#### B. 内部链接策略

**实施**:

1. 相关项目推荐
2. 分类页面链接
3. 标签聚合页面
4. 编辑精选集合

---

## 📊 SEO 监控与测量

### 1. Google Search Console

**设置监控**:

- 索引覆盖率
- 搜索性能
- 核心网页指标
- 移动可用性
- 结构化数据错误

### 2. Google Analytics 4

**已实施**: ✅
**追踪指标**:

- 有机搜索流量
- 页面浏览量
- 跳出率
- 平均会话时长
- 转化率

### 3. 第三方 SEO 工具

**推荐**:

- Ahrefs: 反向链接分析
- SEMrush: 关键词追踪
- Screaming Frog: 技术 SEO 审计
- GTmetrix: 性能监控

---

## 🎯 优先级实施计划

### 第一阶段（立即实施）- 高ROI ⭐⭐⭐⭐⭐

1. **结构化数据** (预计 2-3 天)

   - Organization Schema
   - Product Schema（项目页面）
   - Article Schema（博客页面）

2. **Canonical URLs** (预计 1 天)

   - 所有页面添加 canonical 标签

3. **图片 Alt 标签审查** (预计 1 天)

   - 检查所有图片的 alt 属性
   - 添加描述性文本

4. **H1-H6 标题层级审查** (预计 1 天)
   - 确保每页只有一个 H1
   - 检查标题层级

### 第二阶段（1-2周内）- 中高ROI ⭐⭐⭐⭐

5. **面包屑导航** (预计 2 天)

   - 创建面包屑组件
   - 添加 BreadcrumbList Schema

6. **RSS Feed** (预计 1 天)

   - 实现 /feed.xml 路由

7. **内部链接优化** (预计 3-5 天)

   - 添加相关项目推荐
   - 优化锚文本

8. **社交媒体标签完善** (预计 1 天)
   - 扩展 Open Graph 标签
   - 添加 Twitter 账号信息

### 第三阶段（持续进行）- 长期收益 ⭐⭐⭐

9. **内容创作**

   - 每周 1-2 篇博客
   - 关键词优化

10. **链接建设**

    - 提交到产品目录
    - Guest posting

11. **性能持续优化**
    - 监控 Core Web Vitals
    - 优化加载速度

---

## ✅ SEO 检查清单

### 技术 SEO

- [ ] sitemap.xml 提交到 Google Search Console
- [ ] robots.txt 配置正确
- [ ] 所有页面有 canonical URL
- [ ] 404 页面友好
- [ ] HTTPS 启用
- [ ] 页面加载速度 < 3秒
- [ ] 移动端友好
- [ ] 结构化数据验证无错误

### On-Page SEO

- [ ] 每页有唯一的 title 标签
- [ ] Meta description 150-160 字符
- [ ] 每页只有一个 H1 标签
- [ ] 标题层级正确
- [ ] 图片有描述性 alt 标签
- [ ] 内部链接使用描述性锚文本
- [ ] URL 简洁且包含关键词

### Content SEO

- [ ] 内容原创且有价值
- [ ] 关键词自然分布
- [ ] 内容定期更新
- [ ] 长尾关键词覆盖
- [ ] 多媒体内容（图片、视频）

### Off-Page SEO

- [ ] 获取高质量反向链接
- [ ] 社交媒体活跃
- [ ] 品牌提及和引用

---

## 📚 推荐资源

### 学习资源

- [Google Search Central](https://developers.google.com/search)
- [Moz Beginner's Guide to SEO](https://moz.com/beginners-guide-to-seo)
- [Ahrefs Blog](https://ahrefs.com/blog/)
- [Search Engine Journal](https://www.searchenginejournal.com/)

### 工具

- **免费**:

  - Google Search Console
  - Google Analytics
  - Google PageSpeed Insights
  - Schema.org Validator

- **付费**:
  - Ahrefs ($99/月)
  - SEMrush ($119/月)
  - Screaming Frog ($259/年)

---

**最后更新**: 2024-11-10  
**维护者**: aat.ee 技术团队
