# Plausible Analytics 快速参考

## 🎯 配置信息

### 环境变量

```env
PLAUSIBLE_API_KEY=your_api_key
PLAUSIBLE_SITE_ID=yourdomain.com
PLAUSIBLE_URL=https://plausible.io
```

---

## 📝 快速配置（10 分钟）

| 步骤 | 操作 | 链接 |
|-----|------|------|
| 1️⃣ | 注册 Plausible | https://plausible.io/ |
| 2️⃣ | 添加网站 | + Add website |
| 3️⃣ | 创建 API 密钥 | Settings > API Keys |
| 4️⃣ | 复制配置信息 | - |

---

## 🔑 如何填写

### PLAUSIBLE_API_KEY

**获取位置**: Settings > API Keys > + New API Key

**步骤**:
1. 访问 Plausible Dashboard
2. 右上角头像 > Settings
3. 左侧菜单 > API Keys
4. 点击 **"+ New API Key"**
5. 配置:
   - Name: `Open Launch Server`
   - Permissions: 选择 **Stats API** ✅
   - Sites: 选择您的站点或 All sites
6. 点击 **"Create API Key"**
7. **立即复制**密钥（只显示一次！）

**示例**:
```env
PLAUSIBLE_API_KEY=jnYWKtCoFqD2HiEPDY2HsB5qV7exHTMXzvRZJauc4zdxWa910rRLewNG9wUPxubY
```

### PLAUSIBLE_SITE_ID

**填写内容**: 您在 Plausible 中添加的域名

**示例**:
```env
# 如果您添加的站点是 open-launch.com
PLAUSIBLE_SITE_ID=open-launch.com

# 如果是带 www 的
PLAUSIBLE_SITE_ID=www.open-launch.com

# 如果是子域名
PLAUSIBLE_SITE_ID=app.open-launch.com
```

⚠️ **重要**: 必须与 Plausible Dashboard 中的站点名称**完全一致**！

**如何查看**:
1. 登录 Plausible Dashboard
2. 左侧列表显示的就是您的站点 ID

### PLAUSIBLE_URL

**填写内容**: Plausible 实例的 URL

**选项**:

| 使用方式 | URL | 说明 |
|---------|-----|------|
| **Cloud 版** | `https://plausible.io` | 官方托管（推荐） |
| **自托管** | `https://analytics.yourdomain.com` | 自己的服务器 |
| **其他实例** | `https://analytics.aat.ee` | 第三方托管 |

**示例**:
```env
# Plausible Cloud (最常用)
PLAUSIBLE_URL=https://plausible.io

# 自托管实例
PLAUSIBLE_URL=https://analytics.yourdomain.com

# 第三方实例
PLAUSIBLE_URL=https://analytics.aat.ee
```

⚠️ **注意**: 
- URL 末尾不要加斜杠 `/`
- 必须使用 HTTPS

---

## 🧪 测试配置

### 方法 1: curl 测试

```bash
curl -X POST 'https://plausible.io/api/v2/query' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "site_id": "yourdomain.com",
    "metrics": ["visitors"],
    "date_range": "7d"
  }'
```

**成功响应**:
```json
{
  "results": [
    {
      "dimensions": [],
      "metrics": [1234]
    }
  ]
}
```

### 方法 2: 在应用中测试

1. 配置环境变量
2. 重启服务器: `bun dev`
3. 访问使用统计数据的页面
4. 检查服务器日志是否有错误

---

## 📊 使用场景

项目使用 Plausible 获取以下数据：

| 数据类型 | 时间范围 | 函数 |
|---------|---------|------|
| 访问者数 | 最近 24 小时 | `getLast24hVisitors()` |
| 访问者数 | 最近 7 天 | `getLast7DaysVisitors()` |
| 访问者数 | 最近 30 天 | `getLast30DaysVisitors()` |
| 页面浏览量 | 最近 30 天 | `getLast30DaysPageviews()` |

**数据用途**: 管理后台显示网站访问统计

---

## 🚨 常见错误

| 错误 | 原因 | 解决方案 |
|-----|------|---------|
| "API key is not configured" | 未设置 `PLAUSIBLE_API_KEY` | 检查 .env 文件 |
| "401 Unauthorized" | API 密钥无效 | 重新生成密钥 |
| "Site ID is not configured" | 未设置 `PLAUSIBLE_SITE_ID` | 填入站点域名 |
| "Error connecting to API" | URL 错误或网络问题 | 检查 `PLAUSIBLE_URL` |
| 返回数据为 null | 网站没有数据 | 等待有访问后再查询 |

---

## 💰 成本

### Plausible Cloud

| 方案 | 价格 | 页面浏览量 |
|-----|------|-----------|
| 免费试用 | $0 | 30 天 |
| Growth | $9/月 | 10,000/月 |
| Business | $19/月 | 100,000/月 |

### 自托管

- ✅ 软件免费（开源）
- 💰 服务器: $5-20/月

---

## ✅ 配置示例

### Plausible Cloud

```env
# Plausible Cloud (官方)
PLAUSIBLE_API_KEY=jnYWKtCoFqD2HiEPDY2HsB5qV7exHTMXzvRZJauc4zdxWa910rRLewNG9wUPxubY
PLAUSIBLE_SITE_ID=open-launch.com
PLAUSIBLE_URL=https://plausible.io
```

### 自托管

```env
# 自托管 Plausible
PLAUSIBLE_API_KEY=your_custom_api_key
PLAUSIBLE_SITE_ID=open-launch.com
PLAUSIBLE_URL=https://analytics.yourdomain.com
```

### 第三方实例

```env
# 第三方 Plausible 实例（如您提供的示例）
PLAUSIBLE_API_KEY=jnYWKtCoFqD2HiEPDY2HsB5qV7exHTMXzvRZJauc4zdxWa910rRLewNG9wUPxubY
PLAUSIBLE_SITE_ID=your-site.com
PLAUSIBLE_URL=https://analytics.aat.ee
```

---

## 🔒 安全提示

- ✅ API 密钥仅用于服务端
- ✅ 不要在前端代码中暴露
- ✅ 不要提交到 Git
- ✅ 定期轮换密钥
- ✅ 限制 API 权限为 Stats API

---

## 📚 相关文档

- 📖 完整配置指南: `PLAUSIBLE_SETUP_GUIDE.md`
- 📖 所有环境变量: `ENV_SETUP_GUIDE.md`
- 📖 环境变量模板: `env.example.txt`

---

## 🔗 快速链接

- [Plausible.io](https://plausible.io/)
- [API 文档](https://plausible.io/docs/stats-api)
- [自托管指南](https://plausible.io/docs/self-hosting)
- [定价](https://plausible.io/pricing)

---

## ℹ️ 重要提示

**Plausible 是可选配置**

如果不配置，项目仍然可以正常运行，只是管理后台不会显示访问统计数据。

**三个变量都必须配置才能工作**:
- ❌ 只配置一个或两个 → 不工作
- ✅ 配置全部三个 → 正常工作
- ✅ 全部不配置 → 项目正常运行（无统计）

---

**预计配置时间: 10-15 分钟**


