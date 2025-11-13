# 📸 ProductHunt Logo 自动上传到 R2

## ✅ 功能说明

ProductHunt 自动导入现在会**自动下载产品 logo 并上传到 Cloudflare R2**，而不是直接引用外部链接。

---

## 🎯 实现方式

### 流程图

```
ProductHunt API
    ↓
获取 thumbnail URL
    ↓
下载图片到内存
    ↓
上传到 Cloudflare R2
    ↓
保存 R2 URL 到数据库
    ↓
如果失败 → 回退到原始 URL
```

---

## 🔧 技术实现

### 1. 图片下载工具 (`lib/image-upload.ts`)

```typescript
export async function downloadAndUploadImage(
  imageUrl: string,
  folder: "logos" | "products" = "logos",
  fallbackUrl?: string,
): Promise<DownloadImageResult>
```

**特性**：

- ✅ 10 秒下载超时
- ✅ 验证内容类型（必须是图片）
- ✅ 限制文件大小（最大 5MB）
- ✅ 自动检测图片格式
- ✅ 失败时回退到原始 URL

### 2. R2 上传 (`lib/r2-client.ts`)

```typescript
export async function uploadFileToR2(
  file: Buffer,
  fileName: string,
  fileType: string,
  folder: "logos" | "products",
): Promise<string>
```

**特性**：

- ✅ 生成唯一文件名
- ✅ 设置缓存头（1 年）
- ✅ 记录上传元数据
- ✅ 返回公共访问 URL

### 3. 导入 API 集成 (`app/api/cron/import-producthunt/route.ts`)

```typescript
// 下载并上传 logo 到 R2
if (post.thumbnail?.url) {
  const logoResult = await downloadAndUploadImage(
    post.thumbnail.url,
    "logos",
    post.thumbnail.url, // 失败时回退
  )

  if (logoResult.success && logoResult.url) {
    logoUrl = logoResult.url // R2 URL
  } else {
    logoUrl = post.thumbnail.url // 原始 URL
  }
}
```

---

## 📊 优势对比

### 之前（直接引用）

```typescript
logoUrl: "https://ph-files.imgix.net/abc123.png" // ProductHunt CDN
```

**问题**：

- ❌ 链接可能失效
- ❌ 依赖外部服务
- ❌ 加载速度不稳定
- ❌ 无法控制图片

### 现在（上传到 R2）

```typescript
logoUrl: "https://your-r2-domain.com/logos/1234567890-abc.png" // 您的 R2
```

**优点**：

- ✅ 完全控制图片
- ✅ 永久可用
- ✅ 加载速度稳定
- ✅ 可优化/修改图片
- ✅ 统一图片管理

---

## 🔒 错误处理

### 失败场景

1. **下载超时**（> 10 秒）

   - → 使用原始 URL

2. **非图片文件**

   - → 使用原始 URL

3. **文件过大**（> 5MB）

   - → 使用原始 URL

4. **R2 上传失败**

   - → 使用原始 URL

5. **R2 未配置**
   - → 使用原始 URL

### 日志输出

成功时：

```
📥 Downloading image from: https://ph-files.imgix.net/abc.png
✅ Downloaded 45678 bytes, type: image/png
📤 Uploading to R2...
✅ Uploaded to R2: https://your-r2.com/logos/123-abc.png
```

失败时：

```
📥 Downloading image from: https://ph-files.imgix.net/abc.png
❌ Failed to download/upload image: HTTP 404: Not Found
⚠️  Logo upload failed, using fallback: HTTP 404: Not Found
```

---

## ⚙️ 配置要求

### 必需的环境变量

```bash
# Cloudflare R2 配置
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_DOMAIN=https://your-r2-domain.com
```

### R2 Bucket 配置

1. **创建 Bucket**

   - 登录 Cloudflare Dashboard
   - R2 → Create bucket
   - 名称：`open-launch`（或自定义）

2. **创建 API Token**

   - R2 → Manage R2 API Tokens
   - Create API token
   - 权限：Edit（读写）

3. **配置公共域名**
   - Bucket → Settings → Public access
   - 配置自定义域名或使用 R2.dev 域名

详细配置请查看：`docs/cursor/R2_SETUP.md`

---

## 📈 性能影响

### 导入速度

**之前**（直接保存 URL）：

- 每个产品：~50ms
- Top 5 产品：~250ms

**现在**（下载+上传）：

- 每个产品：~2-5 秒
- Top 5 产品：~10-25 秒

**总时长增加**：约 20 秒/天

### 存储成本

- **每张 logo**: ~50-200 KB
- **每天 5 张**: ~250 KB - 1 MB
- **每月**: ~7.5 MB - 30 MB
- **每年**: ~90 MB - 360 MB

**Cloudflare R2 定价**：

- 免费额度：10 GB 存储
- 超出后：$0.015/GB/月

**预估成本**：前 2-5 年完全免费 ✅

---

## 🔍 监控和维护

### 检查上传成功率

```sql
-- 查看最近导入的产品 logo 来源
SELECT
  p.name,
  p.logo_url,
  CASE
    WHEN p.logo_url LIKE '%your-r2-domain%' THEN 'R2'
    WHEN p.logo_url LIKE '%ph-files%' THEN 'ProductHunt'
    ELSE 'Other'
  END as logo_source,
  phi.imported_at
FROM project p
JOIN product_hunt_import phi ON p.id = phi.project_id
ORDER BY phi.imported_at DESC
LIMIT 20;
```

### 查看失败情况

查看 Zeabur/应用日志，搜索：

- `⚠️  Logo upload failed`
- `❌ Failed to download/upload`

---

## 🐛 故障排查

### 问题 1: 所有 logo 都使用回退 URL

**症状**：所有产品都使用 ProductHunt 原始 URL

**原因**：R2 配置错误或缺失

**解决**：

```bash
# 检查 Zeabur 环境变量
确认以下变量已配置：
- R2_ACCOUNT_ID
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME
- R2_PUBLIC_DOMAIN
```

---

### 问题 2: 上传超时

**症状**：日志显示 "HTTP timeout"

**原因**：网络问题或图片过大

**解决**：

- 检查网络连接
- 增加超时时间（代码中修改）
- 检查图片大小限制

---

### 问题 3: R2 访问被拒绝

**症状**：日志显示 "Access Denied"

**原因**：API Token 权限不足

**解决**：

```bash
# 重新创建 R2 API Token
1. Cloudflare Dashboard → R2
2. Manage R2 API Tokens
3. Create API token
4. 权限: Edit（读写）
5. 更新 Zeabur 环境变量
```

---

## 📚 相关文件

| 文件                                       | 说明                 |
| ------------------------------------------ | -------------------- |
| `lib/image-upload.ts`                      | 图片下载和上传工具   |
| `lib/r2-client.ts`                         | R2 客户端和上传函数  |
| `app/api/cron/import-producthunt/route.ts` | ProductHunt 导入 API |
| `docs/cursor/R2_SETUP.md`                  | R2 配置详细指南      |

---

## ✅ 验证清单

部署后验证：

- [ ] 环境变量已配置（5 个 R2 变量）
- [ ] R2 bucket 已创建
- [ ] R2 公共域名已配置
- [ ] 手动触发导入测试
- [ ] 查看日志确认上传成功
- [ ] 访问产品页面查看 logo 加载
- [ ] 检查 logo URL 是否指向 R2 域名

---

## 🎉 总结

**自动上传到 R2 的好处**：

- ✅ 完全控制图片资源
- ✅ 永久可用，不担心外链失效
- ✅ 统一的 CDN 加速
- ✅ 可以后续优化/裁剪图片
- ✅ 节省外部请求

**代价**：

- ⚠️ 导入速度稍慢（+20 秒/天）
- ⚠️ 需要配置 R2
- ⚠️ 占用少量存储空间（可忽略）

**推荐**：✅ 强烈推荐使用 R2 上传方案

---

**如有问题，请查看应用日志或联系技术支持。** 🚀
