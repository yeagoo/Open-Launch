# 🔧 ProductHunt Website URL 重定向问题修复

## ❌ 问题

ProductHunt API 返回的 `website` 字段不是真实的网站地址，而是 ProductHunt 的**跟踪重定向链接**：

```
❌ 问题URL:
https://www.producthunt.com/r/4NNTZPVHW5U5GH?utm_campaign=producthunt-api&utm_medium=api-v2&utm_source=Application...

✅ 应该是:
https://example.com
```

### 影响

- ❌ 项目的 `websiteUrl` 保存的是 ProductHunt 重定向链接
- ❌ 用户点击后会先经过 ProductHunt 跟踪
- ❌ 不是产品的真实网站地址

---

## ✅ 解决方案

### 实现方式

添加了 `getRealWebsiteUrl()` 函数来**自动跟随重定向**并获取真实网站地址。

### 工作原理

```typescript
ProductHunt API 返回:
https://www.producthunt.com/r/4NNTZPVHW5U5GH?...
    ↓
发送 HEAD 请求 (不下载内容)
    ↓
获取 Location 响应头 (302/301)
    ↓
提取真实网站地址
    ↓
保存到数据库: https://example.com
```

---

## 🔧 技术实现

### 1. 新增函数 (`lib/producthunt.ts`)

```typescript
export async function getRealWebsiteUrl(websiteUrl: string, fallbackUrl: string): Promise<string> {
  // 如果不是 ProductHunt 重定向链接，直接返回
  if (!websiteUrl.includes("producthunt.com/r/")) {
    return websiteUrl
  }

  try {
    // 使用 HEAD 请求跟随重定向
    const response = await fetch(websiteUrl, {
      method: "HEAD",
      redirect: "manual", // 不自动跟随
      signal: AbortSignal.timeout(5000), // 5秒超时
    })

    // 检查重定向响应
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (location) {
        return location // 返回真实 URL
      }
    }

    return websiteUrl
  } catch (error) {
    // 失败时使用 fallback (ProductHunt 页面)
    return fallbackUrl
  }
}
```

### 2. 集成到导入流程 (`app/api/cron/import-producthunt/route.ts`)

```typescript
// 获取真实网站地址
const realWebsiteUrl = await getRealWebsiteUrl(
  post.website, // ProductHunt 重定向链接
  post.url, // ProductHunt 产品页面（fallback）
)

// 保存到数据库
await db.insert(project).values({
  // ...
  websiteUrl: realWebsiteUrl, // 真实网站地址
})
```

---

## 📊 效果对比

### 修复前

```typescript
websiteUrl: "https://www.producthunt.com/r/4NNTZPVHW5U5GH?utm_campaign=..."
```

**问题**:

- ❌ 不是真实网站
- ❌ 带有跟踪参数
- ❌ 用户体验差

### 修复后

```typescript
websiteUrl: "https://example.com"
```

**优点**:

- ✅ 真实产品网站
- ✅ 干净的 URL
- ✅ 直接访问

---

## 🔒 错误处理

### 失败场景处理

1. **重定向超时** (>5秒)

   - → 使用 ProductHunt 页面作为回退

2. **无重定向响应**

   - → 使用原始 URL

3. **网络错误**
   - → 使用 ProductHunt 页面作为回退

### 日志输出

**成功时**:

```
🌐 Getting real website URL for "Amazing Product"...
🔗 Following redirect: https://www.producthunt.com/r/...
✅ Real website: https://example.com
```

**失败时**:

```
🌐 Getting real website URL for "Amazing Product"...
🔗 Following redirect: https://www.producthunt.com/r/...
⚠️  Failed to get real website URL: timeout
✅ Website URL: https://www.producthunt.com/posts/amazing-product (fallback)
```

---

## 📈 性能影响

### 额外开销

- **每个产品**: ~500ms - 2秒 (HEAD 请求)
- **Top 5 产品**: ~2.5 - 10 秒
- **总导入时间**: ~35-40 秒/天

**可接受**: 每天只运行一次，时间成本很小

### 网络请求

- **请求类型**: HEAD (不下载内容)
- **超时设置**: 5 秒
- **总请求数**: 每天 5 次

---

## 🧪 测试验证

### 手动测试

```bash
# 测试导入
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://www.aat.ee/api/cron/import-producthunt

# 查看日志
# 应该看到:
# 🌐 Getting real website URL...
# 🔗 Following redirect...
# ✅ Real website: https://...
```

### 数据库验证

```sql
-- 检查最近导入的项目网站
SELECT
  p.name,
  p.website_url,
  CASE
    WHEN p.website_url LIKE '%producthunt.com/r/%' THEN '❌ 重定向链接'
    ELSE '✅ 真实网站'
  END as url_type,
  phi.imported_at
FROM project p
JOIN product_hunt_import phi ON p.id = phi.project_id
ORDER BY phi.imported_at DESC
LIMIT 10;
```

**预期**: 所有新导入的项目应该显示 "✅ 真实网站"

---

## 💡 其他说明

### 为什么不直接使用 `post.url`？

`post.url` 是 ProductHunt 产品页面，不是产品的真实网站：

```
post.url: https://www.producthunt.com/posts/amazing-product
```

我们需要的是产品自己的网站。

### 为什么使用 HEAD 请求？

- ✅ 只获取响应头，不下载内容
- ✅ 速度快，流量小
- ✅ 只关心重定向位置，不需要页面内容

---

## 🔍 故障排查

### 问题 1: 所有网站都是 ProductHunt 页面

**原因**: 重定向跟随失败

**检查**:

1. 查看日志中的错误信息
2. 测试网络连接到 ProductHunt
3. 检查超时设置是否合理

**解决**: 增加超时时间或检查网络

---

### 问题 2: 某些产品网站错误

**原因**: ProductHunt 某些产品没有配置网站

**表现**: 回退到 ProductHunt 页面

**说明**: 这是正常的，某些产品确实没有独立网站

---

## ✅ 验证清单

部署后验证:

- [ ] 代码构建通过
- [ ] 部署到生产环境
- [ ] 手动触发导入测试
- [ ] 查看日志确认重定向跟随
- [ ] 检查数据库中的 `website_url`
- [ ] 访问产品页面验证链接正确
- [ ] 所有链接都是真实网站（不是 PH 重定向）

---

## 📚 相关文件

| 文件                                       | 说明                           |
| ------------------------------------------ | ------------------------------ |
| `lib/producthunt.ts`                       | `getRealWebsiteUrl()` 函数实现 |
| `app/api/cron/import-producthunt/route.ts` | 集成到导入流程                 |

---

## 🎉 总结

**问题**: ProductHunt API 返回重定向链接  
**解决**: 自动跟随重定向获取真实网站  
**效果**: 用户直接访问产品真实网站  
**成本**: 每天增加 ~10 秒导入时间（完全可接受）

---

**修复已完成，下次导入将自动使用真实网站地址！** 🚀
