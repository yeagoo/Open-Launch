# Plausible Analytics 配置指南

Plausible 是一个隐私友好的网站分析工具，本项目使用它来获取访问统计数据。

## 📋 需要配置的环境变量

```env
# Plausible Analytics
PLAUSIBLE_API_KEY=your_api_key_here
PLAUSIBLE_SITE_ID=yourdomain.com
PLAUSIBLE_URL=https://plausible.io
```

## 🔍 变量说明

| 变量 | 说明 | 示例 |
|-----|------|------|
| **PLAUSIBLE_API_KEY** | API 密钥，用于服务端调用 | `jnYWKtCoFqD2H...` |
| **PLAUSIBLE_SITE_ID** | 您在 Plausible 中的站点 ID | `yourdomain.com` |
| **PLAUSIBLE_URL** | Plausible 实例 URL | `https://plausible.io` 或自托管地址 |

---

## 🎯 配置方式

Plausible 有两种使用方式：

### 方式 1: 使用官方 Plausible Cloud（推荐）

**优点**:
- ✅ 无需自己托管
- ✅ 自动更新维护
- ✅ 可靠的基础设施
- ✅ 支持团队

**缺点**:
- ❌ 需要付费（免费试用 30 天）

### 方式 2: 自托管 Plausible

**优点**:
- ✅ 完全免费
- ✅ 数据完全掌控
- ✅ 可自定义

**缺点**:
- ❌ 需要服务器
- ❌ 需要自己维护
- ❌ 需要技术知识

---

## 📱 方式 1: Plausible Cloud 配置

### 步骤 1: 注册 Plausible 账号

1. 访问 [Plausible.io](https://plausible.io/)
2. 点击 **"Start your free trial"**
3. 填写信息：
   - Email
   - Password
   - Website domain: `yourdomain.com`
4. 验证邮箱

### 步骤 2: 添加网站

1. 登录后，点击 **"+ Add website"**
2. 输入域名：`yourdomain.com`
3. 选择时区
4. 点击 **"Add snippet"**

**会显示跟踪代码：**
```html
<script defer data-domain="yourdomain.com" src="https://plausible.io/js/script.js"></script>
```

### 步骤 3: 创建 API 密钥

1. 访问设置：右上角头像 > **Settings**
2. 在左侧菜单选择 **"API Keys"**
3. 点击 **"+ New API Key"**

**配置 API 密钥：**

| 字段 | 填写内容 |
|-----|---------|
| **Name** | `Open Launch Server` |
| **Permissions** | 选择 **Stats API** |
| **Sites** | 选择您的站点或 **All sites** |

4. 点击 **"Create API Key"**
5. **立即复制密钥**（只显示一次！）

格式类似：
```
jnYWKtCoFqD2HiEPDY2HsB5qV7exHTMXzvRZJauc4zdxWa910rRLewNG9wUPxubY
```

### 步骤 4: 获取 Site ID

**Site ID 就是您的域名**，例如：
- `yourdomain.com`
- `www.yourdomain.com`
- `subdomain.yourdomain.com`

⚠️ **注意**: 必须与您在 Plausible 中添加的域名完全一致！

### 步骤 5: 配置环境变量

```env
# Plausible Cloud
PLAUSIBLE_API_KEY=jnYWKtCoFqD2HiEPDY2HsB5qV7exHTMXzvRZJauc4zdxWa910rRLewNG9wUPxubY
PLAUSIBLE_SITE_ID=yourdomain.com
PLAUSIBLE_URL=https://plausible.io
```

---

## 🏠 方式 2: 自托管 Plausible

### 前置条件

- 一台服务器（VPS）
- Docker 和 Docker Compose
- 基本的 Linux 知识

### 步骤 1: 安装 Plausible

**使用 Docker Compose：**

1. 创建目录：
```bash
mkdir plausible-hosting
cd plausible-hosting
```

2. 下载配置文件：
```bash
curl https://raw.githubusercontent.com/plausible/hosting/master/docker-compose.yml -o docker-compose.yml
curl https://raw.githubusercontent.com/plausible/hosting/master/plausible-conf.env -o plausible-conf.env
```

3. 编辑 `plausible-conf.env`：
```env
BASE_URL=https://analytics.yourdomain.com
SECRET_KEY_BASE=your-secret-key-base-here
```

4. 生成 SECRET_KEY_BASE：
```bash
openssl rand -base64 64
```

5. 启动服务：
```bash
docker-compose up -d
```

### 步骤 2: 配置域名和 SSL

1. 配置 DNS 记录：
```
A    analytics.yourdomain.com    → 您的服务器 IP
```

2. 配置反向代理（Nginx）：
```nginx
server {
    listen 80;
    server_name analytics.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

3. 安装 SSL 证书（使用 Let's Encrypt）：
```bash
certbot --nginx -d analytics.yourdomain.com
```

### 步骤 3: 创建账号和站点

1. 访问 `https://analytics.yourdomain.com`
2. 注册第一个账号
3. 添加网站
4. 创建 API 密钥

### 步骤 4: 配置环境变量

```env
# 自托管 Plausible
PLAUSIBLE_API_KEY=your_generated_api_key
PLAUSIBLE_SITE_ID=yourdomain.com
PLAUSIBLE_URL=https://analytics.yourdomain.com
```

---

## 🧪 测试配置

### 方法 1: 使用 curl 测试

```bash
# 测试 API 连接
curl -X POST 'https://plausible.io/api/v2/query' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "site_id": "yourdomain.com",
    "metrics": ["visitors"],
    "date_range": "7d"
  }'
```

**成功响应示例：**
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
2. 重启开发服务器
```bash
bun dev
```

3. 访问管理页面或使用 Plausible 数据的页面
4. 检查服务器日志是否有错误

---

## 📊 项目中的使用

本项目使用 Plausible API 获取以下统计数据：

### 获取的数据

| 函数 | 获取数据 | 时间范围 |
|-----|---------|---------|
| `getLast24hVisitors()` | 访问者数 | 最近 24 小时 |
| `getLast7DaysVisitors()` | 访问者数 | 最近 7 天 |
| `getLast30DaysVisitors()` | 访问者数 | 最近 30 天 |
| `getLast30DaysPageviews()` | 页面浏览量 | 最近 30 天 |

### API 调用位置

文件：`app/actions/plausible.ts`

**API 端点：**
```
POST https://plausible.io/api/v2/query
```

**请求格式：**
```json
{
  "site_id": "yourdomain.com",
  "metrics": ["visitors"],
  "date_range": "7d"
}
```

---

## 📝 完整配置示例

### 使用 Plausible Cloud

```env
# ==========================================
# Plausible Analytics - Cloud
# ==========================================

# API 密钥（从 Settings > API Keys 创建）
PLAUSIBLE_API_KEY=jnYWKtCoFqD2HiEPDY2HsB5qV7exHTMXzvRZJauc4zdxWa910rRLewNG9wUPxubY

# 站点 ID（您的域名）
PLAUSIBLE_SITE_ID=open-launch.com

# Plausible Cloud URL（固定）
PLAUSIBLE_URL=https://plausible.io
```

### 使用自托管 Plausible

```env
# ==========================================
# Plausible Analytics - 自托管
# ==========================================

# API 密钥（在自托管实例中创建）
PLAUSIBLE_API_KEY=your_custom_api_key_here

# 站点 ID（您的域名）
PLAUSIBLE_SITE_ID=open-launch.com

# 自托管实例 URL
PLAUSIBLE_URL=https://analytics.yourdomain.com
```

---

## 🚨 常见问题

### ❌ "Plausible API key is not configured"

**原因**: 环境变量未设置

**解决**:
1. 检查 `.env` 文件中是否有 `PLAUSIBLE_API_KEY`
2. 确保没有多余空格
3. 重启开发服务器

### ❌ "Error fetching Plausible stats: 401"

**原因**: API 密钥无效或过期

**解决**:
1. 重新生成 API 密钥
2. 确认密钥有 **Stats API** 权限
3. 检查密钥是否完整复制

### ❌ "Plausible Site ID is not configured"

**原因**: `PLAUSIBLE_SITE_ID` 未设置

**解决**:
1. 设置为您在 Plausible 中添加的域名
2. 确保域名完全匹配（包括 www）
3. 重启服务器

### ❌ "Error connecting to Plausible API"

**原因**: `PLAUSIBLE_URL` 配置错误或网络问题

**解决**:
1. 检查 URL 格式：`https://plausible.io` 或自托管地址
2. 确认 URL 末尾没有斜杠
3. 测试网络连接

### ❌ 数据为 0 或 null

**原因**: 网站还没有访问数据

**解决**:
1. 确认已在网站添加 Plausible 跟踪代码
2. 访问您的网站产生一些流量
3. 等待几分钟数据同步
4. 检查 Plausible Dashboard 中是否有数据

---

## 💰 成本说明

### Plausible Cloud

| 方案 | 价格 | 页面浏览量 |
|-----|------|-----------|
| **Free Trial** | 免费 30 天 | 无限 |
| **Growth** | $9/月 | 10,000/月 |
| **Business** | $19/月 | 100,000/月 |
| **Enterprise** | 自定义 | 无限 |

### 自托管

| 项目 | 成本 |
|-----|------|
| **软件** | ✅ 免费（开源） |
| **服务器** | $5-20/月（VPS） |
| **域名** | $10-15/年 |
| **SSL 证书** | ✅ 免费（Let's Encrypt） |

---

## 🔒 隐私优势

Plausible 的隐私特性：

- ✅ 不使用 Cookie
- ✅ 符合 GDPR 规范
- ✅ 不跟踪个人信息
- ✅ 轻量级脚本（< 1KB）
- ✅ 开源透明
- ✅ 不出售数据

---

## 📚 可选配置

### 禁用 Plausible（开发环境）

如果暂时不需要统计功能：

```env
# 注释掉或不配置这些变量
# PLAUSIBLE_API_KEY=
# PLAUSIBLE_SITE_ID=
# PLAUSIBLE_URL=
```

项目会自动处理未配置的情况，只是不会显示统计数据。

### 使用环境变量区分

```env
# 开发环境 - 使用测试站点
PLAUSIBLE_SITE_ID=dev.yourdomain.com

# 生产环境 - 使用生产站点
PLAUSIBLE_SITE_ID=yourdomain.com
```

---

## 🔗 相关资源

### Plausible Cloud
- [官网](https://plausible.io/)
- [API 文档](https://plausible.io/docs/stats-api)
- [定价](https://plausible.io/pricing)

### 自托管
- [GitHub 仓库](https://github.com/plausible/analytics)
- [托管指南](https://plausible.io/docs/self-hosting)
- [Docker 部署](https://github.com/plausible/hosting)

### 其他
- [隐私政策](https://plausible.io/privacy)
- [GDPR 合规](https://plausible.io/data-policy)
- [与 Google Analytics 对比](https://plausible.io/vs-google-analytics)

---

## 🎓 最佳实践

### 1. 分离开发和生产站点

```env
# 开发
PLAUSIBLE_SITE_ID=localhost

# 生产
PLAUSIBLE_SITE_ID=yourdomain.com
```

### 2. 使用描述性 API 密钥名称

在创建 API 密钥时：
- ✅ `Open Launch Production Server`
- ✅ `Open Launch Development`
- ❌ `API Key 1`

### 3. 定期轮换 API 密钥

- 每 6-12 个月更换一次
- 发现泄露时立即更换
- 旧密钥失效前更新所有环境

### 4. 限制 API 密钥权限

只授予必要的权限：
- ✅ Stats API (读取统计数据)
- ❌ Sites API (管理站点)

---

## 📞 需要帮助？

如果遇到问题：
1. 查看 [Plausible 文档](https://plausible.io/docs)
2. 检查服务器日志
3. 访问 [Plausible 论坛](https://github.com/plausible/analytics/discussions)
4. 查看 [GitHub Issues](https://github.com/plausible/analytics/issues)

---

**注意**: Plausible 配置是可选的。如果不配置，项目仍然可以正常运行，只是不会显示访问统计数据。


