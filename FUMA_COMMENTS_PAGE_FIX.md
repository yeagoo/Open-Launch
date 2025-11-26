# Fuma Comments Page 字段修复

## 🐛 问题描述

虚拟互动功能在插入评论时，错误地使用了项目的 `slug` 作为 `fuma_comments.page` 字段的值，但系统其他部分都使用项目的 `id`。

**错误代码：**

```typescript
// ❌ 错误：使用 slug
await db.insert(fumaComments).values({
  page: proj.slug, // 错误！
  author: bot.id,
  content: commentContent,
})
```

**正确代码：**

```typescript
// ✅ 正确：使用 id
await db.insert(fumaComments).values({
  page: proj.id, // 正确！
  author: bot.id,
  content: commentContent,
})
```

## ✅ 已修复

**修复位置：** `app/api/cron/simulate-engagement/route.ts`

**修复内容：**

1. ✅ 第 127 行：检查现有评论时，从 `proj.slug` 改为 `proj.id`
2. ✅ 第 149 行：插入评论时，从 `proj.slug` 改为 `proj.id`

## 🔍 为什么使用 `id` 而不是 `slug`？

### 证据 1: 其他查询都使用 `id`

在 `app/actions/projects.ts`, `app/actions/projects-page.ts`, `app/actions/home.ts` 中，所有 JOIN 查询都使用：

```typescript
.leftJoin(fumaComments, sql`"fuma_comments"."page"::text = ${projectTable.id}`)
```

或

```typescript
.leftJoin(fumaComments, sql`(${fumaComments.page}::text = ${projectTable.id}::text)`)
```

这说明 `page` 字段应该存储项目的 `id`。

### 证据 2: 数据库 Schema

虽然 `page` 字段是 `varchar(256)`，可以存储任何字符串，但为了保持一致性，应该使用 `id`。

### 优势

1. ✅ **一致性** - 与系统其他部分保持一致
2. ✅ **可靠性** - `id` 是 UUID，不会改变；`slug` 可能会被修改
3. ✅ **查询效率** - 直接使用 `id` 匹配，不需要额外的转换

## 🔧 修复历史数据（可选）

如果您之前已经运行过虚拟互动功能，可能有一些评论使用了错误的 `slug` 值。可以使用以下 SQL 修复：

### 步骤 1: 检查是否有错误数据

```sql
-- 查找使用 slug 而不是 id 的评论
SELECT
  fc.id,
  fc.page as current_page_value,
  p.id as project_id,
  p.slug as project_slug,
  CASE
    WHEN fc.page = p.slug THEN 'USING_SLUG'
    WHEN fc.page = p.id::text THEN 'USING_ID'
    ELSE 'UNKNOWN'
  END as status
FROM fuma_comments fc
LEFT JOIN project p ON fc.page = p.id::text OR fc.page = p.slug
WHERE fc.author IN (SELECT id FROM "user" WHERE is_bot = true)
ORDER BY fc.timestamp DESC
LIMIT 20;
```

### 步骤 2: 修复错误数据

```sql
-- 将使用 slug 的评论更新为使用 id
UPDATE fuma_comments fc
SET page = p.id::text
FROM project p
WHERE fc.page = p.slug
  AND fc.author IN (SELECT id FROM "user" WHERE is_bot = true)
  AND fc.page != p.id::text;
```

### 步骤 3: 验证修复

```sql
-- 验证所有机器人评论都使用 id
SELECT
  COUNT(*) as total_bot_comments,
  COUNT(CASE WHEN fc.page = p.id::text THEN 1 END) as using_id,
  COUNT(CASE WHEN fc.page = p.slug THEN 1 END) as using_slug
FROM fuma_comments fc
LEFT JOIN project p ON fc.page = p.id::text OR fc.page = p.slug
WHERE fc.author IN (SELECT id FROM "user" WHERE is_bot = true);
```

**预期结果：**

- `using_id` 应该等于 `total_bot_comments`
- `using_slug` 应该为 0

## 🧪 测试修复

### 手动测试

```bash
# 设置环境变量
export CRON_SECRET="your-cron-secret-here"

# 运行虚拟互动 API
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement" \
  -H "x-cron-secret: $CRON_SECRET"
```

### 验证新评论

```sql
-- 查看最近创建的评论
SELECT
  fc.id,
  fc.page,
  fc.author,
  u.name as bot_name,
  p.name as project_name,
  p.id as project_id,
  p.slug as project_slug,
  CASE
    WHEN fc.page = p.id::text THEN '✅ CORRECT'
    ELSE '❌ WRONG'
  END as status
FROM fuma_comments fc
LEFT JOIN "user" u ON fc.author = u.id
LEFT JOIN project p ON fc.page = p.id::text
WHERE u.is_bot = true
ORDER BY fc.timestamp DESC
LIMIT 10;
```

所有新评论的 `status` 应该显示 `✅ CORRECT`。

## 📊 影响范围

### 已修复的功能

- ✅ 虚拟互动 API (`/api/cron/simulate-engagement`)
- ✅ 新评论将正确使用 `project.id`

### 不受影响的功能

- ✅ 现有的正确评论（如果之前没有使用虚拟互动）
- ✅ 用户手动创建的评论
- ✅ 其他使用 Fuma Comments 的功能

## 🎯 验证清单

- [x] 代码已修复（使用 `proj.id` 而不是 `proj.slug`）
- [x] 构建成功
- [ ] 已检查历史数据（如果需要）
- [ ] 已运行测试验证
- [ ] 已确认新评论正确显示

## 📚 相关文档

- [VIRTUAL_ENGAGEMENT.md](./VIRTUAL_ENGAGEMENT.md) - 虚拟互动功能说明
- [CRON_JOB_ORG_SETUP.md](./CRON_JOB_ORG_SETUP.md) - Cron 任务配置

---

**修复完成！** 现在虚拟互动功能会正确使用项目的 `id` 作为评论的 `page` 字段。🎉
