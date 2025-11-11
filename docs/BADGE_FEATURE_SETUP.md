# Badge 功能设置指南

## 功能概述

Badge 功能允许免费用户通过在自己网站上添加 aat.ee 的 Badge 来获得优先发布权限。用户可以在第二天就上线自己的产品，而不需要等待排队或支付费用。

## 数据库迁移

在生产环境中运行以下 SQL 来添加 badge 验证字段：

```sql
-- Add badge verification fields to project table
ALTER TABLE "project"
ADD COLUMN IF NOT EXISTS "has_badge_verified" boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS "badge_verified_at" timestamp;

-- Create index for faster badge verification queries
CREATE INDEX IF NOT EXISTS "project_badge_verified_idx" ON "project" ("has_badge_verified", "scheduled_launch_date");

-- Add comment for documentation
COMMENT ON COLUMN "project"."has_badge_verified" IS 'Whether the project website has the aat.ee badge installed and verified';
COMMENT ON COLUMN "project"."badge_verified_at" IS 'Timestamp when the badge was successfully verified';
```

或者使用 Drizzle：

```bash
npm run db:push
```

## 功能组件

### 1. Badge 展示页面 (`/badge`)

- 展示 Badge 的好处和价值
- 提供 Badge HTML 代码供用户复制
- 显示如何使用的步骤说明
- FAQ 常见问题解答

### 2. Badge 验证 API (`/api/verify-badge`)

- 检测用户网站是否包含 aat.ee Badge
- 使用多个模式匹配确保准确性
- 支持 10 秒超时和错误处理
- Edge runtime 优化性能

### 3. 提交表单集成

- 在网站 URL 输入框旁边添加"Verify Badge"按钮
- 实时验证 Badge 是否存在
- 显示验证状态和引导信息
- 自动调整日期选择范围

### 4. 排队优先逻辑

- Badge 验证用户可以选择第二天发布
- 不受免费排队限额限制
- 在 `getLaunchAvailabilityRange` 中实现
- 自动为验证用户提供优先日期选项

## 用户流程

1. **用户访问 `/badge` 页面**

   - 了解 Badge 功能的好处
   - 复制 Badge HTML 代码

2. **用户将 Badge 添加到自己的网站**

   - 推荐位置：页脚、关于页面、合作伙伴页面
   - 必须保持 Badge 链接和图片URL不变

3. **用户提交项目**

   - 输入网站 URL
   - 点击"Verify Badge"按钮
   - 系统自动检测 Badge

4. **Badge 验证成功**

   - 显示绿色成功消息
   - 自动提供第二天的日期选项
   - 可以立即提交项目

5. **项目审核和上线**
   - 项目状态保存 badge 验证信息
   - 第二天自动上线
   - 获得 dofollow backlink

## Badge 代码

```html
<a href="https://www.aat.ee/?ref=badge" target="_blank" rel="noopener" title="Featured on aat.ee">
  <img
    src="https://www.aat.ee/images/badges/featured-badge.svg"
    alt="Featured on aat.ee"
    width="200"
    height="54"
  />
</a>
```

## 检测逻辑

Badge 验证使用以下模式匹配（至少需要匹配 2 个）：

1. `www.aat.ee` - 域名检测
2. `aat.ee/images/badges/featured-badge.svg` - Badge 图片
3. `featured on aat.ee` - Alt 文本
4. `www.aat.ee/?ref=badge` - 推荐链接

## 优势

### 对用户：

- ✅ 完全免费
- ✅ 24小时内上线
- ✅ 跳过排队等待
- ✅ 获得 dofollow backlink
- ✅ 提高网站权重

### 对平台：

- ✅ 增加外部反向链接
- ✅ 提高 SEO 和域名权威
- ✅ 扩大品牌影响力
- ✅ 鼓励用户推广平台
- ✅ 建立互惠互利的生态

## 营销推广

Badge 功能在以下位置进行推广：

1. **导航栏** - "Fast Track 🚀" 链接
2. **定价页面** - 免费选项中的提示
3. **提交表单** - Badge 验证失败时的引导
4. **Sitemap** - 包含在搜索引擎索引中

## 监控和维护

### 需要监控的指标：

- Badge 验证成功率
- 验证失败原因
- Badge 用户的转化率
- Badge 用户的项目质量
- Badge 的存留时间

### 定期检查：

- Badge 图片可访问性
- API 响应时间
- 验证准确性
- 用户反馈

## 未来改进

1. **Badge 样式选项**

   - 提供多种颜色和尺寸
   - 深色/浅色主题适配

2. **自动监控**

   - 定期检查 Badge 是否仍然存在
   - Badge 被移除时自动通知

3. **Badge 等级**

   - 根据保持时间提供不同等级
   - 长期合作伙伴获得特殊徽章

4. **统计面板**
   - 展示 Badge 带来的流量
   - 展示反向链接价值

## 技术栈

- **前端**: React, Next.js App Router, TailwindCSS
- **API**: Next.js API Routes (Edge Runtime)
- **验证**: Fetch API, HTML 内容匹配
- **数据库**: PostgreSQL, Drizzle ORM
- **UI组件**: shadcn/ui

## 支持

如有问题或建议，请通过以下方式联系：

- GitHub Issues
- Email: support@aat.ee
- Discord: [链接]

---

**实施日期**: 2025-11-11
**版本**: 1.0.0
**状态**: ✅ 已完成
