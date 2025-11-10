# SEO & Sitemap 配置指南

## 📋 概述

本项目包含三个重要的 SEO 和爬虫配置文件：

- `sitemap.xml` - 网站地图（动态生成）
- `robots.txt` - 爬虫规则
- `llms.txt` - AI/LLM 爬虫指令（新标准）

## 📁 文件位置

```
app/
├── sitemap.ts          # 动态生成 sitemap.xml
├── robots.ts           # robots.txt 配置
└── llms.txt/
    └── route.ts        # llms.txt API 路由
```

## 🗺️ Sitemap.xml

### 功能

动态生成网站地图，包含所有已上架的项目和静态页面。

### 访问地址

```
https://www.aat.ee/sitemap.xml
```

### 包含的内容

1. **静态页面**：

   - 首页（优先级 1.0，每小时更新）
   - 定价页面（优先级 0.9）
   - 分类页面（优先级 0.9）
   - Trending、Winners、Blog、Reviews 等

2. **动态项目页面**：
   - 所有状态为 `ONGOING` 或 `LAUNCHED` 的项目
   - 优先级 0.8，每日更新频率
   - 自动包含项目的最后更新时间

### 自动更新触发

Sitemap 会在以下情况自动重新生成：

#### 1. Cron 任务触发

文件：`app/api/cron/update-launches/route.ts`

```typescript
// 如果有项目状态变化，重新生成 sitemap
if (scheduledToOngoing.length > 0 || ongoingToLaunched.length > 0) {
  revalidatePath("/sitemap.xml")
  console.log("✅ Sitemap regenerated due to project status changes")
}
```

**触发时机**：

- 项目从 `SCHEDULED` 变为 `ONGOING`
- 项目从 `ONGOING` 变为 `LAUNCHED`

#### 2. Premium 项目支付成功

文件：`app/api/auth/stripe/webhook/route.ts`

```typescript
// 重新生成 sitemap（项目即将上架）
revalidatePath("/sitemap.xml")
console.log("✅ Sitemap regenerated after premium project payment")
```

**触发时机**：

- Premium 或 Premium Plus 项目支付完成
- 项目状态从 `PAYMENT_PENDING` 变为 `SCHEDULED`

### 技术实现

```typescript
// app/sitemap.ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 获取已上架项目
  const projects = await db
    .select({ slug: project.slug, updatedAt: project.updatedAt })
    .from(project)
    .where(
      or(
        eq(project.launchStatus, launchStatus.ONGOING),
        eq(project.launchStatus, launchStatus.LAUNCHED),
      ),
    )

  // 返回静态页面 + 项目页面
  return [...staticPages, ...projectUrls]
}
```

## 🤖 Robots.txt

### 功能

定义搜索引擎和 AI 爬虫的访问规则。

### 访问地址

```
https://www.aat.ee/robots.txt
```

### 爬虫规则

#### 通用爬虫（所有搜索引擎）

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard
Disallow: /settings
Disallow: /projects/submit
Disallow: /_next/
Disallow: /admin/
```

#### AI/LLM 爬虫（特殊规则）

包含以下 AI 爬虫：

- `GPTBot` (OpenAI GPT)
- `ChatGPT-User` (ChatGPT)
- `Google-Extended` (Google AI/Bard)
- `anthropic-ai` (Claude)
- `ClaudeBot` (Claude)
- `Claude-Web` (Claude)
- `cohere-ai` (Cohere)

**特殊设置**：

- 允许访问公开内容
- 禁止访问 API 和用户数据
- `crawlDelay: 10` (10秒爬取间隔)

### 配置示例

```typescript
// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/settings", ...],
      },
      {
        userAgent: ["GPTBot", "ChatGPT-User", "Claude", ...],
        crawlDelay: 10,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
```

## 🤖 llms.txt

### 什么是 llms.txt？

`llms.txt` 是一个新兴的标准，专门为 AI/LLM 爬虫提供结构化的网站信息和爬取指令。

### 访问地址

```
https://www.aat.ee/llms.txt
```

### 包含的信息

#### 1. 网站基本信息

```
Name: aat.ee
Type: Product Discovery Platform
Primary Language: English
Region: Global
Content Focus: Startups, AI Tools, SaaS Products
```

#### 2. 爬取权限

**允许的内容**：

- 首页和项目列表
- 项目详情页
- 博客文章和产品评测
- 分类、趋势、获胜者页面
- 定价和法律页面

**禁止的内容**：

- API 端点
- 用户仪表板和设置
- 管理员区域
- 项目提交表单
- 认证页面

#### 3. 速率限制

```
Recommended crawl delay: 10 seconds
Max requests per minute: 6
```

#### 4. 内容使用指南

**应该索引**：

- 产品名称和描述
- 发布日期和详情
- 分类和标签
- 博客文章和评测

**不应该索引**：

- 用户个人信息
- 邮箱地址和 API 密钥
- 支付信息
- 内部系统数据

#### 5. 归属要求

AI 使用内容时应该：

- 提及 "according to aat.ee" 或 "from aat.ee"
- 引用特定产品时包含项目 URL
- 尊重产品创作者的知识产权

### 技术实现

```typescript
// app/llms.txt/route.ts
export async function GET() {
  const llmsTxt = `# llms.txt - AI/LLM Crawling Instructions
  
# About aat.ee
> aat.ee is a modern Product Hunt alternative...
  
# Crawling Permissions
## Allowed Content (/)
- Homepage and project listings
- Individual project pages
...
`

  return new NextResponse(llmsTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
```

## 📊 SEO 最佳实践

### 1. Sitemap 优化

- ✅ 包含所有公开可访问的页面
- ✅ 设置合理的优先级（0.3 - 1.0）
- ✅ 定义更新频率（hourly, daily, weekly, monthly, yearly）
- ✅ 包含最后修改时间
- ✅ 动态内容自动更新

### 2. Robots.txt 优化

- ✅ 明确允许和禁止的路径
- ✅ 为 AI 爬虫设置特殊规则
- ✅ 设置合理的爬取延迟
- ✅ 引用 sitemap 位置

### 3. llms.txt 优化

- ✅ 提供清晰的网站描述
- ✅ 明确内容使用政策
- ✅ 设置速率限制建议
- ✅ 要求适当的归属

## 🔍 验证和测试

### 1. Sitemap 验证

```bash
# 访问 sitemap
curl https://www.aat.ee/sitemap.xml

# 使用 Google Search Console 验证
# https://search.google.com/search-console
```

### 2. Robots.txt 验证

```bash
# 访问 robots.txt
curl https://www.aat.ee/robots.txt

# 使用 Google Search Console 测试工具
# https://search.google.com/search-console/robots-txt
```

### 3. llms.txt 验证

```bash
# 访问 llms.txt
curl https://www.aat.ee/llms.txt
```

## 📈 Google Search Console 设置

### 1. 提交 Sitemap

1. 登录 [Google Search Console](https://search.google.com/search-console)
2. 选择属性（aat.ee）
3. 进入 "Sitemaps" 部分
4. 添加新的 sitemap：`https://www.aat.ee/sitemap.xml`
5. 点击 "Submit"

### 2. 监控索引状态

- 检查 "Coverage" 报告
- 查看已索引的页面数量
- 修复任何索引错误

### 3. 性能追踪

- 监控搜索表现
- 查看点击率和展示次数
- 优化排名较低的页面

## 🚀 部署检查清单

部署后确认以下内容：

- [ ] `https://www.aat.ee/sitemap.xml` 可访问
- [ ] `https://www.aat.ee/robots.txt` 可访问
- [ ] `https://www.aat.ee/llms.txt` 可访问
- [ ] Sitemap 包含正确的项目列表
- [ ] Robots.txt 规则正确
- [ ] 在 Google Search Console 提交 sitemap
- [ ] 验证没有索引错误

## 📚 参考资源

### Sitemap

- [Next.js Sitemap Documentation](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap)
- [Google Sitemap Guidelines](https://developers.google.com/search/docs/advanced/sitemaps/overview)
- [Sitemap Protocol](https://www.sitemaps.org/protocol.html)

### Robots.txt

- [Next.js Robots Documentation](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots)
- [Google Robots.txt Specifications](https://developers.google.com/search/docs/advanced/robots/intro)

### llms.txt

- [llms.txt Proposal](https://github.com/zudsniper/llms.txt)
- [AI Crawling Best Practices](https://platform.openai.com/docs/gptbot)

## 💡 维护建议

### 定期检查（每月）

1. 验证 sitemap 内容完整性
2. 检查 Google Search Console 报告
3. 更新 llms.txt 的日期和内容
4. 监控爬虫日志

### 更新时机

**Sitemap**：

- 自动更新（无需手动维护）
- 添加新的静态页面时更新代码

**Robots.txt**：

- 添加新的受保护路径
- 调整 AI 爬虫政策

**llms.txt**：

- 网站功能重大变更
- 内容政策更新
- 每季度审查和更新日期

---

**最后更新**: 2024-11-10
**维护者**: aat.ee 技术团队
