# OAuth 配置快速参考

## 🎯 回调地址速查表

### 本地开发环境

| OAuth 提供商 | 回调 URL |
|-------------|---------|
| **Google** | `http://localhost:3000/api/auth/callback/google` |
| **GitHub** | `http://localhost:3000/api/auth/callback/github` |

### 生产环境

| OAuth 提供商 | 回调 URL |
|-------------|---------|
| **Google** | `https://yourdomain.com/api/auth/callback/google` |
| **GitHub** | `https://yourdomain.com/api/auth/callback/github` |

⚠️ **重要**: 将 `yourdomain.com` 替换为您的实际域名

---

## 🔑 获取凭据速查

### Google OAuth - 5 步配置

| 步骤 | 操作 | 链接 |
|-----|------|------|
| 1️⃣ | 访问 Google Cloud Console | https://console.cloud.google.com/ |
| 2️⃣ | 创建项目 / 选择项目 | 顶部项目选择器 |
| 3️⃣ | 启用 API | API 和服务 > 库 > 搜索 "Google+" |
| 4️⃣ | 创建 OAuth 凭据 | API 和服务 > 凭据 > 创建凭据 > OAuth 客户端 ID |
| 5️⃣ | 配置重定向 URI | 添加回调 URL（见上表） |

**获取结果:**
```env
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxx
```

---

### GitHub OAuth - 4 步配置

| 步骤 | 操作 | 链接 |
|-----|------|------|
| 1️⃣ | 访问 GitHub 开发者设置 | https://github.com/settings/developers |
| 2️⃣ | 创建 OAuth App | OAuth Apps > New OAuth App |
| 3️⃣ | 填写应用信息 | 名称、主页、回调 URL |
| 4️⃣ | 生成 Client Secret | Generate a new client secret |

**获取结果:**
```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 📋 配置清单

### Google OAuth 配置

- [ ] 访问 Google Cloud Console
- [ ] 创建/选择项目
- [ ] 配置 OAuth 同意屏幕
- [ ] 创建 OAuth 客户端 ID（Web 应用）
- [ ] 添加已获授权的 JavaScript 来源:
  - [ ] `http://localhost:3000`
  - [ ] `https://yourdomain.com`
- [ ] 添加已获授权的重定向 URI:
  - [ ] `http://localhost:3000/api/auth/callback/google`
  - [ ] `https://yourdomain.com/api/auth/callback/google`
- [ ] 复制 Client ID 和 Client Secret 到 `.env`
- [ ] 重启开发服务器
- [ ] 测试登录功能

### GitHub OAuth 配置

- [ ] 访问 GitHub Developer Settings
- [ ] 创建开发环境 OAuth App
  - [ ] Application name: `Open Launch (Dev)`
  - [ ] Homepage URL: `http://localhost:3000`
  - [ ] Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
- [ ] 创建生产环境 OAuth App
  - [ ] Application name: `Open Launch`
  - [ ] Homepage URL: `https://yourdomain.com`
  - [ ] Authorization callback URL: `https://yourdomain.com/api/auth/callback/github`
- [ ] 生成并复制 Client Secret (每个 App)
- [ ] 配置对应环境的 `.env` 文件
- [ ] 测试登录功能

---

## ⚡ 快速命令

### 测试 OAuth 配置

```bash
# 1. 启动开发服务器
bun dev

# 2. 访问登录页面
open http://localhost:3000/sign-in

# 3. 测试 Google 登录
# 点击 "Sign in with Google" 按钮

# 4. 测试 GitHub 登录
# 点击 "Sign in with GitHub" 按钮
```

---

## 🚨 常见错误速查

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `redirect_uri_mismatch` | 回调 URL 不匹配 | 检查并修正 OAuth 配置中的重定向 URI |
| `invalid_client` | Client ID 或 Secret 错误 | 重新复制凭据，确保无多余空格 |
| `access_denied` | 用户拒绝授权 | 正常情况，引导用户重新授权 |
| `unauthorized_client` | OAuth App 未授权 | 检查 OAuth 同意屏幕配置 |

---

## 📊 配置对比

| 特性 | Google OAuth | GitHub OAuth |
|-----|-------------|-------------|
| **配置位置** | Google Cloud Console | GitHub Settings |
| **多重定向 URI** | ✅ 支持多个 | ❌ 仅支持一个 |
| **需要域名验证** | ✅ 生产环境需要 | ❌ 不需要 |
| **同意屏幕配置** | ✅ 需要配置 | ❌ 自动生成 |
| **开发建议** | 一个 App 多环境 | 开发和生产分别创建 |
| **密钥查看** | ✅ 可随时查看 | ❌ 只显示一次 |

---

## 🔒 安全检查

### 配置完成后验证

- [ ] ✅ Client Secret 未提交到 Git
- [ ] ✅ `.env` 文件在 `.gitignore` 中
- [ ] ✅ 生产环境使用独立的凭据
- [ ] ✅ 回调 URL 仅限授权域名
- [ ] ✅ OAuth 同意屏幕信息准确
- [ ] ✅ 定期检查授权应用列表
- [ ] ✅ 测试环境用户限制已配置

---

## 🎓 关键概念

### Client ID vs Client Secret

| 类型 | 公开性 | 用途 | 示例 |
|-----|-------|------|------|
| **Client ID** | 🌐 公开 | 标识应用 | `123-abc.apps.googleusercontent.com` |
| **Client Secret** | 🔒 私密 | 验证应用 | `GOCSPX-xxxxx` |

### 环境变量命名

```env
# ✅ 服务端使用（保密）
GOOGLE_CLIENT_SECRET=xxx
GITHUB_CLIENT_SECRET=xxx

# ✅ 前端使用（公开）
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx

# ✅ 两端都可用（Better Auth 自动处理）
GOOGLE_CLIENT_ID=xxx
```

---

## 📚 完整文档

- 📖 **完整配置指南**: `OAUTH_SETUP_GUIDE.md`
- 📖 **所有环境变量**: `ENV_SETUP_GUIDE.md`
- 📖 **环境变量模板**: `env.example.txt`

---

## 🆘 需要帮助？

### 查看日志

```bash
# 浏览器控制台
# 查看前端错误信息

# 服务器日志
bun dev
# 查看认证相关错误
```

### 检查配置

```bash
# 验证环境变量
echo $GOOGLE_CLIENT_ID
echo $GITHUB_CLIENT_ID

# 检查 .env 文件
cat .env | grep -E "(GOOGLE|GITHUB)"
```

### 常用链接

- 🔗 [Google Cloud Console](https://console.cloud.google.com/)
- 🔗 [GitHub OAuth Settings](https://github.com/settings/developers)
- 🔗 [Better Auth 文档](https://better-auth.com/docs)

---

**预计配置时间:**
- Google OAuth: 10 分钟
- GitHub OAuth: 5 分钟（开发）+ 5 分钟（生产）
- **总计: 约 20 分钟**


