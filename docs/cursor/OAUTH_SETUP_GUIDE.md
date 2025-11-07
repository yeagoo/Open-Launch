# OAuth 登录配置完整指南

本指南将详细说明如何配置 Google 和 GitHub OAuth 登录功能。

## 📋 需要配置的环境变量

```env
# Google OAuth
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

# GitHub OAuth
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# Google One Tap (可选)
NEXT_PUBLIC_ONE_TAP_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

---

## 🔵 Google OAuth 配置

### 📍 回调地址（重要！）

**本地开发：**
```
http://localhost:3000/api/auth/callback/google
```

**生产环境：**
```
https://yourdomain.com/api/auth/callback/google
```

---

### 步骤 1: 访问 Google Cloud Console

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 使用您的 Google 账号登录

### 步骤 2: 创建或选择项目

**创建新项目：**
1. 点击顶部的项目选择器
2. 点击 **"新建项目"** 或 **"New Project"**
3. 输入项目名称：`Open Launch` 或您喜欢的名称
4. 点击 **"创建"** 或 **"Create"**

**使用现有项目：**
- 在项目选择器中选择您的项目

### 步骤 3: 启用 Google+ API

1. 在左侧菜单中，点击 **"API 和服务"** > **"库"**
2. 搜索 `Google+ API` 或 `Google Identity`
3. 点击进入并点击 **"启用"** 或 **"Enable"**

### 步骤 4: 配置 OAuth 同意屏幕

1. 在左侧菜单中，点击 **"OAuth 同意屏幕"** 或 **"OAuth consent screen"**
2. 选择用户类型：
   - **外部 (External)**: 任何 Google 账号都可以登录（推荐）
   - **内部 (Internal)**: 仅限组织内部用户
3. 点击 **"创建"**

**填写应用信息：**

| 字段 | 填写内容 |
|-----|---------|
| **应用名称** | `Open Launch` |
| **用户支持电子邮件** | 您的邮箱 |
| **应用首页** | `https://yourdomain.com` |
| **应用隐私权政策链接** | `https://yourdomain.com/legal/privacy` |
| **应用服务条款链接** | `https://yourdomain.com/legal/terms` |
| **已获授权的网域** | `yourdomain.com` |
| **开发者联系信息** | 您的邮箱 |

4. 点击 **"保存并继续"**

**作用域（Scopes）：**
- 使用默认作用域即可
- 通常包括：email, profile, openid
- 点击 **"保存并继续"**

**测试用户（开发阶段）：**
- 添加用于测试的 Google 账号邮箱
- 点击 **"保存并继续"**

### 步骤 5: 创建 OAuth 客户端 ID

1. 在左侧菜单中，点击 **"凭据"** 或 **"Credentials"**
2. 点击顶部的 **"+ 创建凭据"** > **"OAuth 客户端 ID"**
3. 应用类型选择：**"Web 应用程序"** 或 **"Web application"**

**配置 Web 应用：**

**应用名称：**
```
Open Launch Web App
```

**已获授权的 JavaScript 来源（Authorized JavaScript origins）：**

本地开发添加：
```
http://localhost:3000
```

生产环境添加：
```
https://yourdomain.com
https://www.yourdomain.com
```

**已获授权的重定向 URI（Authorized redirect URIs）：**

⚠️ **这是最重要的配置！**

本地开发添加：
```
http://localhost:3000/api/auth/callback/google
```

生产环境添加：
```
https://yourdomain.com/api/auth/callback/google
https://www.yourdomain.com/api/auth/callback/google
```

**示例完整配置：**
```
JavaScript 来源：
├── http://localhost:3000
├── https://yourdomain.com
└── https://www.yourdomain.com

重定向 URI：
├── http://localhost:3000/api/auth/callback/google
├── https://yourdomain.com/api/auth/callback/google
└── https://www.yourdomain.com/api/auth/callback/google
```

4. 点击 **"创建"**

### 步骤 6: 获取凭据

创建成功后会显示：

```
客户端 ID (Client ID):
123456789-abcdefghijklmnop.apps.googleusercontent.com

客户端密钥 (Client Secret):
GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx
```

### 步骤 7: 配置环境变量

将获取的凭据添加到 `.env` 文件：

```env
# Google OAuth
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx

# Google One Tap (可选 - 使用相同的 Client ID)
NEXT_PUBLIC_ONE_TAP_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
```

⚠️ **注意**：
- `GOOGLE_CLIENT_ID` 也可以作为 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 在前端使用
- Client Secret 必须保密，只能在服务端使用

---

## ⚫ GitHub OAuth 配置

### 📍 回调地址（重要！）

**本地开发：**
```
http://localhost:3000/api/auth/callback/github
```

**生产环境：**
```
https://yourdomain.com/api/auth/callback/github
```

---

### 步骤 1: 访问 GitHub 开发者设置

1. 登录 [GitHub](https://github.com/)
2. 点击右上角头像 > **Settings**
3. 在左侧菜单最底部，点击 **"Developer settings"**
4. 点击 **"OAuth Apps"**

或直接访问：https://github.com/settings/developers

### 步骤 2: 创建新的 OAuth App

1. 点击 **"New OAuth App"** 或 **"Register a new application"**

### 步骤 3: 填写应用信息

| 字段 | 填写内容 |
|-----|---------|
| **Application name** | `Open Launch` |
| **Homepage URL** | `https://yourdomain.com` 或 `http://localhost:3000` (开发) |
| **Application description** | `Open source Product Hunt alternative` (可选) |
| **Authorization callback URL** | 见下方 ⬇️ |

**Authorization callback URL（最重要！）：**

⚠️ GitHub OAuth App 只能配置一个回调 URL

**开发环境 OAuth App：**
```
http://localhost:3000/api/auth/callback/github
```

**生产环境 OAuth App：**
```
https://yourdomain.com/api/auth/callback/github
```

💡 **建议**：创建两个 OAuth App：
- 一个用于开发（callback URL 用 localhost）
- 一个用于生产（callback URL 用实际域名）

### 步骤 4: 创建应用

点击 **"Register application"** 创建

### 步骤 5: 获取凭据

创建成功后会显示：

```
Client ID:
Iv1.xxxxxxxxxxxxx
```

**生成 Client Secret：**
1. 点击 **"Generate a new client secret"**
2. 会显示密钥（只显示一次！）：
   ```
   xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
3. 立即复制保存！

### 步骤 6: 配置环境变量

**开发环境 (.env.local)：**
```env
# GitHub OAuth (开发环境)
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxx  # 开发环境 OAuth App 的 ID
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx  # 对应的 Secret
```

**生产环境：**
```env
# GitHub OAuth (生产环境)
GITHUB_CLIENT_ID=Iv1.yyyyyyyyyyyyyyy  # 生产环境 OAuth App 的 ID
GITHUB_CLIENT_SECRET=yyyyyyyyyyyyyyyyyyyyyyyy  # 对应的 Secret
```

---

## 📝 完整配置示例

### 本地开发 (.env.local)

```env
# ==========================================
# OAuth 配置 - 本地开发
# ==========================================

# Google OAuth
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxx

# Google One Tap (可选)
NEXT_PUBLIC_ONE_TAP_CLIENT_ID=123456789-abc123.apps.googleusercontent.com

# GitHub OAuth (使用开发环境 OAuth App)
GITHUB_CLIENT_ID=Iv1.1234567890abcdef
GITHUB_CLIENT_SECRET=abcdef1234567890abcdef1234567890abcdef12

# ==========================================
# 回调 URL（仅供参考，不需要配置）
# ==========================================
# Google: http://localhost:3000/api/auth/callback/google
# GitHub: http://localhost:3000/api/auth/callback/github
```

### 生产环境 (Vercel/Netlify 环境变量)

```env
# ==========================================
# OAuth 配置 - 生产环境
# ==========================================

# Google OAuth (相同的凭据可用于生产)
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxx

# Google One Tap (可选)
NEXT_PUBLIC_ONE_TAP_CLIENT_ID=123456789-abc123.apps.googleusercontent.com

# GitHub OAuth (使用生产环境 OAuth App)
GITHUB_CLIENT_ID=Iv1.fedcba0987654321
GITHUB_CLIENT_SECRET=12345678901234567890123456789012345678ab

# ==========================================
# 回调 URL（仅供参考，不需要配置）
# ==========================================
# Google: https://yourdomain.com/api/auth/callback/google
# GitHub: https://yourdomain.com/api/auth/callback/github
```

---

## ✅ 测试 OAuth 登录

### 1. 启动开发服务器

```bash
bun dev
```

### 2. 访问登录页面

```
http://localhost:3000/sign-in
```

### 3. 测试 Google 登录

1. 点击 "Sign in with Google" 按钮
2. 选择 Google 账号
3. 授权应用访问
4. 应该成功登录并重定向到首页

### 4. 测试 GitHub 登录

1. 点击 "Sign in with GitHub" 按钮
2. 授权应用访问
3. 应该成功登录并重定向到首页

---

## 🚨 常见错误及解决方案

### ❌ 错误: "redirect_uri_mismatch"

**完整错误信息：**
```
Error: redirect_uri_mismatch
The redirect URI in the request: http://localhost:3000/api/auth/callback/google
does not match the ones authorized for the OAuth client.
```

**原因：** 回调 URL 配置不匹配

**解决方案：**

1. 检查 OAuth 配置中的回调 URL 是否完全匹配
2. 确保包含 `/api/auth/callback/google` 或 `/api/auth/callback/github`
3. 检查是否有多余的斜杠
4. 确认协议是 http 还是 https

**正确格式：**
```
✅ http://localhost:3000/api/auth/callback/google
❌ http://localhost:3000/api/auth/callback/google/
❌ http://localhost:3000/auth/callback/google
❌ https://localhost:3000/api/auth/callback/google
```

### ❌ Google: "Error 400: invalid_client"

**原因：** Client ID 或 Client Secret 错误

**解决方案：**
1. 检查 `.env` 文件中的配置
2. 确认没有多余的空格或换行
3. 重新生成 Client Secret
4. 重启开发服务器

### ❌ GitHub: "The redirect_uri MUST match the registered callback URL"

**原因：** GitHub OAuth App 的回调 URL 不匹配

**解决方案：**
1. 访问 GitHub Settings > Developer settings > OAuth Apps
2. 点击您的应用
3. 检查 "Authorization callback URL" 是否正确
4. GitHub 只允许一个回调 URL，确保使用正确的环境

### ❌ 登录后没有跳转

**原因：** 可能是会话存储问题或重定向配置问题

**解决方案：**
1. 检查浏览器控制台错误
2. 清除浏览器 Cookie
3. 检查 `trustedOrigins` 配置
4. 确认数据库连接正常

---

## 🔒 安全最佳实践

### 1. 保护 Client Secret

```env
✅ 正确：将 Client Secret 保存在 .env 文件
❌ 错误：在前端代码中使用 Client Secret
❌ 错误：将 .env 提交到 Git
```

### 2. 限制授权域名

**Google OAuth：**
- 只添加实际使用的域名
- 不要使用通配符域名

**GitHub OAuth：**
- 为开发和生产创建独立的 OAuth App
- 不要共享 Client Secret

### 3. 定期轮换密钥

- 定期重新生成 Client Secret
- 更新所有环境的配置
- 验证功能正常

### 4. 监控 OAuth 使用

**Google Cloud Console：**
- 查看 API 使用情况
- 监控异常登录

**GitHub Settings：**
- 查看授权应用列表
- 撤销可疑的授权

---

## 📊 回调 URL 快速参考

| 平台 | 本地开发 | 生产环境 |
|-----|---------|---------|
| **Google** | `http://localhost:3000/api/auth/callback/google` | `https://yourdomain.com/api/auth/callback/google` |
| **GitHub** | `http://localhost:3000/api/auth/callback/github` | `https://yourdomain.com/api/auth/callback/github` |

**回调路径格式：**
```
/api/auth/callback/{provider}
```

其中 `{provider}` 可以是：
- `google`
- `github`

---

## 🔗 相关资源

### Google OAuth
- [Google Cloud Console](https://console.cloud.google.com/)
- [OAuth 2.0 文档](https://developers.google.com/identity/protocols/oauth2)
- [设置 OAuth 2.0](https://support.google.com/cloud/answer/6158849)

### GitHub OAuth
- [GitHub OAuth Apps](https://github.com/settings/developers)
- [OAuth Apps 文档](https://docs.github.com/en/developers/apps/building-oauth-apps)
- [授权 OAuth Apps](https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps)

### Better Auth
- [Better Auth 文档](https://better-auth.com/docs)
- [Social Providers](https://better-auth.com/docs/authentication/social)

---

## 📞 需要帮助？

如果遇到问题：
1. 检查回调 URL 是否完全匹配
2. 查看浏览器控制台错误信息
3. 检查服务器日志
4. 参考本文档的故障排查部分
5. 查看 [Better Auth 文档](https://better-auth.com/docs)

---

**关键要点总结：**
- ✅ Google 可以配置多个回调 URL，GitHub 只能配置一个
- ✅ 回调 URL 格式：`/api/auth/callback/{provider}`
- ✅ 开发和生产使用不同的回调 URL
- ✅ Client Secret 必须保密
- ✅ 配置后需要重启服务器


