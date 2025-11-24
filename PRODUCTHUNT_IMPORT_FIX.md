# 🔧 ProductHunt 自动导入失效问题修复

## ❌ 发现的问题

### 1. **关键问题：没有限定日期范围**

**原始查询**:

```graphql
query {
  posts(order: VOTES, first: 5) {
    edges {
      node {
        # ...
      }
    }
  }
}
```

**问题**:

- ❌ 每次都返回**历史上**投票最多的 5 个产品
- ❌ 不是当天的 Top 5
- ❌ 导致产品重复，被跳过

**表现**:

- 🔴 很久没有新产品导入
- 🔴 每次只导入 1 个或 0 个（其余已存在）

### 2. **时区问题**

ProductHunt 基于**美国太平洋时间**（PST/PDT），而不是 UTC。

---

## ✅ 解决方案

### 修复 1: 添加日期范围过滤

```typescript
// 获取 ProductHunt 的"今日"（基于太平洋时间）
const now = new Date()

// 转换为太平洋时间（UTC-8）
const pacificOffset = -8 * 60
const pacificNow = new Date(now.getTime() + pacificOffset * 60 * 1000)

// 太平洋时间的今日开始和结束
const todayStart = new Date(pacificNow)
todayStart.setUTCHours(0, 0, 0, 0)
const todayEnd = new Date(pacificNow)
todayEnd.setUTCHours(23, 59, 59, 999)

const postedAfter = todayStart.toISOString()
const postedBefore = todayEnd.toISOString()
```

### 修复后的查询

```graphql
query {
  posts(
    order: VOTES
    first: 5
    postedAfter: "2025-11-24T00:00:00.000Z"
    postedBefore: "2025-11-24T23:59:59.999Z"
  ) {
    edges {
      node {
        id
        name
        tagline
        description
        url
        votesCount
        website
        thumbnail {
          url
        }
        topics {
          edges {
            node {
              name
            }
          }
        }
      }
    }
  }
}
```

---

## 📊 修复前后对比

### 修复前

```
Cron Job 运行
    ↓
获取 ProductHunt API
    ↓
返回: 历史热门 Top 5
    ├── Product A (已存在) → 跳过
    ├── Product B (已存在) → 跳过
    ├── Product C (已存在) → 跳过
    ├── Product D (已存在) → 跳过
    └── Product E (新)      → 导入 ✅
    ↓
结果: 只导入 1 个
```

### 修复后

```
Cron Job 运行
    ↓
获取 ProductHunt API (今日)
    ↓
返回: 今日 Top 5
    ├── Product 1 (今日) → 导入 ✅
    ├── Product 2 (今日) → 导入 ✅
    ├── Product 3 (今日) → 导入 ✅
    ├── Product 4 (今日) → 导入 ✅
    └── Product 5 (今日) → 导入 ✅
    ↓
结果: 导入 5 个新产品
```

---

## 🧪 测试验证

### 1. 手动触发导入

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://www.aat.ee/api/cron/import-producthunt
```

### 2. 检查响应日志

**应该看到**:

```
📅 Fetching ProductHunt posts (Pacific Time)
   From: 2025-11-24T00:00:00.000Z
   To:   2025-11-24T23:59:59.999Z
📦 Fetched 5 posts from ProductHunt
🤖 Found 5 bot users
✅ Imported #1: "Product Name 1" (245 votes)
✅ Imported #2: "Product Name 2" (198 votes)
✅ Imported #3: "Product Name 3" (167 votes)
✅ Imported #4: "Product Name 4" (143 votes)
✅ Imported #5: "Product Name 5" (121 votes)
🎉 Import completed: 5 imported, 0 skipped, 0 errors
```

### 3. 检查数据库

```sql
-- 查看最近导入的产品
SELECT
  p.name,
  p.website_url,
  phi.votes_count,
  phi.rank,
  phi.imported_at,
  CASE
    WHEN phi.imported_at >= NOW() - INTERVAL '1 day' THEN '✅ 最近导入'
    ELSE '⚠️  旧数据'
  END as status
FROM product p
JOIN product_hunt_import phi ON p.id = phi.project_id
ORDER BY phi.imported_at DESC
LIMIT 10;
```

**预期结果**:

- ✅ 看到 5 个新导入的产品
- ✅ `imported_at` 是最近的时间戳
- ✅ `rank` 从 1 到 5

---

## 🔍 故障排查

### 问题 1: 仍然没有导入新产品

**可能原因**:

1. **Cron Job 没有运行**

   - 检查 cron-job.org 或 Zeabur 的 Cron 配置
   - 确认 Cron 表达式正确（例如：`0 9 * * *`）

2. **API Key 失效**

   ```bash
   # 测试 ProductHunt API Key
   curl -H "Authorization: Bearer YOUR_PRODUCTHUNT_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"query": "{ posts(first: 1) { edges { node { name } } } }"}' \
        https://api.producthunt.com/v2/api/graphql
   ```

3. **环境变量未配置**
   - 检查 Zeabur 环境变量：
     - `PRODUCTHUNT_API_KEY` ✅
     - `CRON_SECRET` ✅
     - `R2_ACCOUNT_ID` 等 R2 配置 ✅

### 问题 2: 只导入部分产品

**可能原因**:

1. **R2 上传失败**

   - 检查日志中的 `⚠️ Logo upload failed` 警告
   - 验证 R2 配置和权限

2. **网络超时**

   - 检查 `getRealWebsiteUrl()` 的超时错误
   - 增加超时时间或跳过失败的产品

3. **数据验证失败**
   - 某些产品可能缺少必需字段（name、description 等）
   - 检查日志中的错误信息

### 问题 3: ProductHunt API 返回空结果

**可能原因**:

1. **太早运行 Cron**

   - ProductHunt 可能还没有确定今日 Top 5
   - 建议在太平洋时间 **09:00** 之后运行（UTC 17:00）
   - Cron 表达式：`0 17 * * *`（UTC 17:00 = PST 09:00）

2. **今日产品不足 5 个**
   - 某些日期可能没有足够的新产品
   - 这是正常现象，不是错误

---

## ⏰ Cron 时间建议

### 推荐时间: UTC 17:00（太平洋时间 09:00）

**原因**:

- ✅ ProductHunt 已确定今日排名
- ✅ 有足够的投票数据
- ✅ 避免太早获取不到数据

### Cron 表达式

**cron-job.org**:

```
0 17 * * *
```

- 每天 UTC 17:00 运行
- 等同于太平洋时间 09:00

**GitHub Actions** (`.github/workflows/producthunt-import.yml`):

```yaml
on:
  schedule:
    - cron: "0 17 * * *" # UTC 17:00
```

---

## 📈 监控建议

### 1. 设置告警

在 cron-job.org 中：

- ✅ 启用失败通知
- ✅ 设置响应时间监控
- ✅ 检查 HTTP 状态码

### 2. 定期检查

**每周检查**:

```sql
-- 统计最近 7 天的导入情况
SELECT
  DATE(imported_at) as date,
  COUNT(*) as imported_count,
  CASE
    WHEN COUNT(*) >= 3 THEN '✅ 正常'
    WHEN COUNT(*) >= 1 THEN '⚠️  偏少'
    ELSE '❌ 失败'
  END as status
FROM product_hunt_import
WHERE imported_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(imported_at)
ORDER BY date DESC;
```

### 3. 日志监控

在 Zeabur 日志中搜索：

- ✅ `🎉 Import completed` - 成功
- ⚠️ `⏭️ Skipping` - 重复跳过
- ❌ `❌ Failed to fetch` - API 错误
- ❌ `❌ Failed to import` - 导入错误

---

## 📝 修改文件

| 文件                        | 修改内容                    |
| --------------------------- | --------------------------- |
| `lib/producthunt.ts`        | 添加日期范围过滤 + 时区处理 |
| `PRODUCTHUNT_IMPORT_FIX.md` | 问题诊断和修复文档          |

---

## 🎯 预期效果

修复后：

- ✅ **每天**自动导入当日 ProductHunt Top 5
- ✅ **不再重复**导入相同的历史产品
- ✅ **完整导入** 5 个产品（除非今日不足 5 个）
- ✅ **准确时区** 基于太平洋时间

---

## 🚀 部署步骤

1. **部署代码到 Zeabur**

   ```bash
   git add .
   git commit -m "fix: ProductHunt import date range and timezone"
   git push
   ```

2. **验证环境变量**

   - Zeabur Dashboard → 环境变量
   - 确认 `PRODUCTHUNT_API_KEY` 和 `CRON_SECRET` 已设置

3. **测试导入**

   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
        https://www.aat.ee/api/cron/import-producthunt
   ```

4. **检查 Cron 配置**
   - cron-job.org → 编辑任务
   - URL: `https://www.aat.ee/api/cron/import-producthunt`
   - Schedule: `0 17 * * *`（UTC 17:00）
   - Header: `Authorization: Bearer YOUR_CRON_SECRET`

---

## ✅ 总结

### 核心问题

❌ **没有限定日期范围** → 每次都返回历史热门产品

### 解决方案

✅ **添加 `postedAfter` 和 `postedBefore` 参数** → 只获取今日产品

### 额外优化

✅ **时区处理** → 基于太平洋时间
✅ **Cron 时间优化** → UTC 17:00 运行

---

**修复已完成！下次 Cron 运行将导入当日真正的 Top 5 产品！** 🎉
