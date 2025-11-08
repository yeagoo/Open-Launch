# 📝 博客发布指南

## 📋 概述

aat.ee 的博客功能基于数据库存储，博客文章保存在 PostgreSQL 数据库的 `blog_article` 表中。

## 🗄️ 数据库结构

### blog_article 表字段

```sql
CREATE TABLE "blog_article" (
  "id" text PRIMARY KEY NOT NULL,
  "slug" text NOT NULL UNIQUE,           -- URL 友好的唯一标识符
  "title" text NOT NULL,                 -- 文章标题
  "description" text NOT NULL,           -- 文章描述/摘要
  "content" text NOT NULL,               -- 文章内容（支持 Markdown/MDX）
  "image" text,                          -- 文章封面图片 URL
  "tags" text[],                         -- 标签数组
  "author" text DEFAULT 'aat.ee Team',   -- 作者名称
  "meta_title" text,                     -- SEO 元标题
  "meta_description" text,               -- SEO 元描述
  "published_at" timestamp NOT NULL,     -- 发布时间
  "created_at" timestamp DEFAULT now(),  -- 创建时间
  "updated_at" timestamp DEFAULT now()   -- 更新时间
);
```

## 📝 发布博客文章的方法

### 方法 1：直接在数据库中插入（推荐用于测试）

#### 1. 连接到 PostgreSQL 数据库

**Zeabur 生产环境：**
```bash
# 在 Zeabur Dashboard 中找到数据库的连接信息
psql "your-database-connection-string"
```

**本地开发环境：**
```bash
psql "postgresql://user:password@localhost:5432/open_launch"
```

#### 2. 插入博客文章

```sql
INSERT INTO blog_article (
  id,
  slug,
  title,
  description,
  content,
  image,
  tags,
  author,
  published_at
) VALUES (
  'article-' || gen_random_uuid()::text,
  'your-article-slug',
  '你的文章标题',
  '这是文章的简短描述，会显示在文章列表中',
  '# 文章标题

这里是文章的完整内容，支持 Markdown 格式。

## 小标题

段落内容...

- 列表项 1
- 列表项 2

```代码块```

更多内容...',
  'https://your-image-url.com/image.jpg',
  ARRAY['技术', '教程', '开发'],
  'aat.ee Team',
  NOW()
);
```

#### 3. 验证插入

```sql
SELECT id, slug, title, published_at FROM blog_article ORDER BY published_at DESC;
```

---

### 方法 2：创建数据库脚本

在 `scripts/` 目录下创建一个新的脚本文件：

#### 1. 创建 `scripts/add-blog-article.ts`

```typescript
import { db } from "@/drizzle/db"
import { blogArticle } from "@/drizzle/db/schema"

const article = {
  id: `article-${Date.now()}`,
  slug: "your-article-slug",
  title: "你的文章标题",
  description: "文章描述",
  content: `# 你的文章标题

这里是文章的完整内容...

## 小节标题

段落内容...`,
  image: "https://your-image-url.com/image.jpg",
  tags: ["技术", "教程", "开发"],
  author: "aat.ee Team",
  metaTitle: "你的文章标题 | aat.ee Blog",
  metaDescription: "文章的 SEO 描述",
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

async function addArticle() {
  try {
    await db.insert(blogArticle).values(article)
    console.log("✅ 文章添加成功！")
    console.log("访问链接：/blog/" + article.slug)
  } catch (error) {
    console.error("❌ 添加文章失败：", error)
  }
  process.exit(0)
}

addArticle()
```

#### 2. 在 `package.json` 中添加脚本

```json
{
  "scripts": {
    "add-blog-article": "tsx scripts/add-blog-article.ts"
  }
}
```

#### 3. 运行脚本

```bash
bun run add-blog-article
```

---

### 方法 3：通过 API 端点（需要创建）

**⚠️ 注意：** 当前项目中还没有博客文章管理的 API 端点。如果需要通过 Web 界面管理博客，您需要创建：

1. **API 端点** - `app/api/blog/route.ts`
2. **管理界面** - 在 `app/admin/` 下添加博客管理页面

---

## 📊 博客文章显示逻辑

### 前端页面

1. **博客列表页面：** `/blog`
   - 文件：`app/blog/page.tsx`
   - 从数据库读取所有文章，按发布时间倒序排列

2. **博客详情页面：** `/blog/[slug]`
   - 文件：`app/blog/[slug]/page.tsx`
   - 根据 slug 从数据库读取单篇文章

### 自动功能

- ✅ 阅读时间自动计算（基于字数）
- ✅ SEO 元数据自动生成
- ✅ 响应式图片显示
- ✅ 标签显示和筛选

---

## 🎨 内容格式建议

### Markdown 支持

文章内容支持完整的 Markdown 语法：

```markdown
# 一级标题

## 二级标题

### 三级标题

**粗体文本**

*斜体文本*

[链接](https://example.com)

![图片](https://example.com/image.jpg)

- 无序列表
- 列表项 2

1. 有序列表
2. 列表项 2

> 引用文本

\`\`\`typescript
// 代码块
const example = "code"
\`\`\`
```

### 图片建议

- **封面图片尺寸：** 1200x630px (16:9 比例)
- **格式：** JPEG, PNG, WebP
- **存储位置：** 
  - 上传到 Cloudflare R2
  - 或使用外部图床（如 Cloudinary, Imgur）
  - 或放在 `public/` 目录

### 标签建议

常用标签示例：
- 技术分类：`React`, `Next.js`, `TypeScript`, `AI`, `机器学习`
- 内容类型：`教程`, `案例分析`, `最佳实践`, `新闻`
- 主题：`产品发布`, `创业`, `设计`, `营销`

---

## 🔧 未来改进建议

### 1. 创建博客管理界面

在 `app/admin/blog/` 下创建完整的博客管理系统：

- [ ] 文章列表页面
- [ ] 创建文章表单
- [ ] 编辑文章功能
- [ ] 删除文章功能
- [ ] 富文本编辑器集成（如 TipTap, Quill）
- [ ] 图片上传功能
- [ ] 草稿保存功能
- [ ] 发布/取消发布切换

### 2. 添加 API 端点

创建 RESTful API：

```typescript
// app/api/blog/route.ts
POST   /api/blog          - 创建文章
GET    /api/blog          - 获取文章列表
GET    /api/blog/[id]     - 获取单篇文章
PUT    /api/blog/[id]     - 更新文章
DELETE /api/blog/[id]     - 删除文章
```

### 3. 增强功能

- [ ] 文章分类系统
- [ ] 评论功能
- [ ] 阅读统计
- [ ] 相关文章推荐
- [ ] 搜索功能
- [ ] RSS 订阅
- [ ] 社交分享按钮

---

## 📖 快速示例

### 完整的博客文章插入示例

```sql
INSERT INTO blog_article (
  id,
  slug,
  title,
  description,
  content,
  image,
  tags,
  author,
  meta_title,
  meta_description,
  published_at
) VALUES (
  'article-' || gen_random_uuid()::text,
  'how-to-launch-your-product',
  '如何成功发布你的产品',
  '本文详细介绍了产品发布的完整流程，从准备到执行的每个步骤。',
  '# 如何成功发布你的产品

产品发布是创业过程中最激动人心的时刻之一...

## 准备阶段

1. **市场调研**
   - 了解目标用户
   - 分析竞争对手

2. **产品打磨**
   - 确保核心功能完善
   - 收集早期用户反馈

## 发布策略

选择合适的发布平台...

## 结论

成功的产品发布需要充分准备和执行...',
  'https://your-domain.com/images/blog/launch-product.jpg',
  ARRAY['产品发布', '创业', '营销', '教程'],
  'aat.ee Team',
  '如何成功发布你的产品 | aat.ee Blog',
  '详细的产品发布指南，包含策略、技巧和最佳实践。',
  NOW()
);
```

### 访问文章

文章发布后可以通过以下 URL 访问：
```
https://www.aat.ee/blog/how-to-launch-your-product
```

---

## 🔍 故障排查

### 文章不显示？

1. **检查发布时间：**
   ```sql
   SELECT slug, title, published_at FROM blog_article ORDER BY published_at DESC;
   ```
   确保 `published_at` 时间不是未来时间

2. **检查 slug 唯一性：**
   ```sql
   SELECT slug, COUNT(*) FROM blog_article GROUP BY slug HAVING COUNT(*) > 1;
   ```

3. **清除缓存：**
   - 重启 Next.js 应用
   - 清除浏览器缓存

### 格式显示问题？

- 确保 Markdown 语法正确
- 检查换行符（使用 `\n`）
- 验证特殊字符是否正确转义

---

## 📚 相关文件

- **数据库 Schema：** `drizzle/db/schema.ts`
- **博客列表页面：** `app/blog/page.tsx`
- **博客详情页面：** `app/blog/[slug]/page.tsx`
- **迁移文件：** `drizzle/migrations/0005_early_ikaris.sql`

---

**需要帮助？** 参考 [完整配置文档索引](./CONFIGURATION_INDEX.md)

