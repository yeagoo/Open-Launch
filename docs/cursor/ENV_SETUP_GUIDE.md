# 环境变量配置完整指南

本指南将帮助您正确配置 Open Launch 项目的所有环境变量。

## 快速开始

1. 复制示例文件：
```bash
cp .env.example .env
```

2. 按照以下说明填入各项配置

---

## 必需配置项

### 1. BETTER_AUTH_SECRET ⭐ 最重要

**用途**: 用于加密会话、JWT 令牌和其他安全操作的密钥

**如何生成**:

```bash
# 方法 1: 使用 OpenSSL (推荐)
openssl rand -base64 32

# 方法 2: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 方法 3: 使用 Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**示例**:
```env
BETTER_AUTH_SECRET=Kj8sN2mQ9pL4xV7wR3tY6uH5gF8dS1aZ
```

⚠️ **安全提示**:
- 必须是随机生成的字符串
- 长度至少 32 字符
- 生产环境中绝不要使用示例值
- 不要提交到 Git 仓库

---

### 2. 数据库配置 (PostgreSQL)

**DATABASE_URL**

```env
DATABASE_URL=postgresql://username:password@host:port/database

# 本地开发示例:
DATABASE_URL=postgresql://postgres:password@localhost:5432/open_launch

# Vercel Postgres 示例:
DATABASE_URL=postgres://user:pass@host.postgres.vercel-storage.com:5432/verceldb

# Supabase 示例:
DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres
```

**如何获取**:
- 本地: 安装 PostgreSQL
- 云服务: Vercel Postgres, Supabase, Neon, Railway

---

### 3. Redis 配置

**REDIS_URL**

```env
# 本地开发:
REDIS_URL=redis://localhost:6379

# Upstash Redis (推荐):
REDIS_URL=redis://default:password@redis-host.upstash.io:6379

# Redis Cloud:
REDIS_URL=redis://username:password@redis-host.redislabs.com:port
```

**用途**: 速率限制、会话存储、缓存

**推荐服务**: [Upstash Redis](https://upstash.com/) (免费层可用)

---

### 4. Cloudflare R2 配置 (文件存储)

详细配置请参考 `R2_SETUP.md`

```env
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=open-launch-files
R2_PUBLIC_DOMAIN=https://files.yourdomain.com
```

**获取步骤**:
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 R2 存储
3. 创建存储桶
4. 生成 API 令牌
5. 配置公共访问域名

---

### 5. 邮件服务 (Resend)

**RESEND_API_KEY**

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**获取步骤**:
1. 注册 [Resend](https://resend.com/)
2. 验证域名
3. 创建 API 密钥

**用途**: 发送验证邮件、密码重置邮件等

---

## OAuth 配置 (可选但推荐)

详细配置请参考 **`OAUTH_SETUP_GUIDE.md`** 📖

### 📍 OAuth 回调地址（重要！）

| 平台 | 本地开发 | 生产环境 |
|-----|---------|---------|
| **Google** | `http://localhost:3000/api/auth/callback/google` | `https://yourdomain.com/api/auth/callback/google` |
| **GitHub** | `http://localhost:3000/api/auth/callback/github` | `https://yourdomain.com/api/auth/callback/github` |

---

### Google OAuth

```env
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxx
```

**快速配置**:

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建项目 > **"API 和服务"** > **"凭据"**
3. 点击 **"创建凭据"** > **"OAuth 客户端 ID"**
4. 应用类型: **Web 应用程序**
5. **已获授权的重定向 URI**:
   ```
   http://localhost:3000/api/auth/callback/google
   https://yourdomain.com/api/auth/callback/google
   ```
6. 复制 Client ID 和 Client Secret

⚠️ **注意**: Google 允许配置多个重定向 URI，可以同时添加开发和生产环境的 URL

---

### GitHub OAuth

```env
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**快速配置**:

1. 访问 [GitHub Settings](https://github.com/settings/developers)
2. **OAuth Apps** > **New OAuth App**
3. 填写信息:
   - Application name: `Open Launch`
   - Homepage URL: `http://localhost:3000` 或 `https://yourdomain.com`
   - **Authorization callback URL**:
     - 开发: `http://localhost:3000/api/auth/callback/github`
     - 生产: `https://yourdomain.com/api/auth/callback/github`
4. 创建后点击 **"Generate a new client secret"**
5. 复制 Client ID 和 Client Secret

⚠️ **注意**: 
- GitHub 每个 OAuth App 只能配置一个回调 URL
- 建议为开发和生产创建两个独立的 OAuth App
- Client Secret 只显示一次，请立即复制保存

**用途**: 用户可以使用 Google 或 GitHub 账号快速登录

📚 **完整配置指南**: 查看 `OAUTH_SETUP_GUIDE.md` 了解详细步骤、故障排查等

---

## Stripe 支付配置 (可选)

详细配置请参考 **`STRIPE_SETUP_GUIDE.md`** 📖

```env
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
NEXT_PUBLIC_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/xxxxx
```

**快速获取步骤**:

### 1. STRIPE_SECRET_KEY 和 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 点击 **"开发者"** > **"API keys"**
3. 复制 **Secret key** (sk_test_...) 和 **Publishable key** (pk_test_...)
4. 测试环境使用 `test`，生产环境使用 `live`

### 2. STRIPE_WEBHOOK_SECRET

**本地开发（推荐）：**
```bash
# 1. 安装 Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS

# 2. 登录
stripe login

# 3. 转发 Webhook
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook

# 4. 复制终端显示的 whsec_xxx 密钥
```

**生产环境：**
1. 访问 [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. 点击 **"+ Add endpoint"**
3. URL: `https://yourdomain.com/api/auth/stripe/webhook`
4. 选择事件: `checkout.session.completed` 等
5. 复制 **Signing secret** (whsec_...)

### 3. NEXT_PUBLIC_PREMIUM_PAYMENT_LINK

1. 访问 [Payment Links](https://dashboard.stripe.com/payment-links)
2. 点击 **"+ New"** 创建支付链接
3. 配置产品（名称、价格等）
4. 复制生成的链接 (https://buy.stripe.com/...)

**用途**: Premium Launch 付费功能

📚 **完整配置指南**: 查看 `STRIPE_SETUP_GUIDE.md` 了解详细步骤、测试卡号、故障排查等

---

## 第三方服务配置

详细配置请参考 **`SERVICES_SETUP_GUIDE.md`** 📖

### Cloudflare Turnstile (Bot 防护)

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAAAAAA
TURNSTILE_SECRET_KEY=0x4AAAAAAAAAAAA
```

**快速配置**:

1. 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Turnstile** > **Add site**
3. 填写信息:
   - Site name: `Open Launch`
   - Domain: `yourdomain.com` 或 `localhost`
   - Widget Mode: **Managed** (推荐)
4. 创建后复制 Site Key 和 Secret Key

**用途**: 防止机器人注册、登录、重置密码

**免费层**: ✅ 完全免费，无限使用

---

### Discord Webhook (可选 - 通知)

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx
```

**快速配置**:

1. 创建 Discord 服务器（如果没有）
2. 创建两个频道:
   - `#comments` - 评论通知
   - `#launches` - 项目发布通知
3. 每个频道创建 Webhook:
   - 右键频道 > 编辑频道 > 集成 > Webhooks
   - 创建 Webhook > 复制 URL

**用途**: 
- `DISCORD_WEBHOOK_URL` - 接收新评论通知
- `DISCORD_LAUNCH_WEBHOOK_URL` - 接收新项目发布通知

**免费层**: ✅ 完全免费

---

### Resend (邮件服务)

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

**快速配置**:

1. 访问 [Resend](https://resend.com/) 并注册
2. **添加域名** (生产环境必需):
   - 进入 Domains > Add Domain
   - 输入 `yourdomain.com`
3. **验证域名**:
   - 在 DNS 中添加 Resend 提供的记录：
     - TXT 记录 (验证)
     - MX 记录 (接收)
     - TXT 记录 (DKIM)
   - 等待验证通过
4. **创建 API 密钥**:
   - 进入 API Keys > Create API Key
   - 权限: Sending access
   - 复制密钥 (只显示一次！)

**DNS 记录示例**:

| 类型 | 名称 | 值 |
|------|------|---|
| TXT | `@` | `resend-verification=abc123...` |
| MX | `@` | `feedback-smtp.resend.com` (优先级 10) |
| TXT | `resend._domainkey` | `p=MIGfMA0GC...` |

**用途**: 发送验证邮件、密码重置邮件

**免费层**: ✅ 3,000 封/月，每天 100 封

**测试用（未验证域名）**: 可临时使用 `onboarding@resend.dev`

📚 **完整配置指南**: 查看 `SERVICES_SETUP_GUIDE.md` 了解详细步骤、测试方法、故障排查等

---

## 检查清单

在启动应用前，请确保已配置：

### 最小配置 (必需)
- [ ] `BETTER_AUTH_SECRET` - 认证密钥
- [ ] `DATABASE_URL` - PostgreSQL 数据库
- [ ] `REDIS_URL` - Redis 缓存
- [ ] `R2_*` - 文件存储 (5 个变量)
- [ ] `RESEND_API_KEY` - 邮件服务

### 推荐配置
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - Google 登录
- [ ] `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` - GitHub 登录
- [ ] `TURNSTILE_*` - Bot 防护

### 可选配置
- [ ] `STRIPE_*` - 支付功能
- [ ] `DISCORD_WEBHOOK_URL` - Discord 通知

---

## 开发环境 vs 生产环境

### 开发环境

```env
NODE_ENV=development
NEXT_PUBLIC_URL=http://localhost:3000
```

### 生产环境

```env
NODE_ENV=production
NEXT_PUBLIC_URL=https://yourdomain.com
```

⚠️ **注意**: 生产环境中必须使用：
- 强随机的 `BETTER_AUTH_SECRET`
- HTTPS URLs
- 生产环境的 API 密钥

---

## 测试配置

启动开发服务器测试：

```bash
bun dev
```

访问 http://localhost:3000 并测试：
1. 用户注册/登录
2. 文件上传
3. OAuth 登录
4. 邮件发送

---

## 故障排查

### 认证失败
- 检查 `BETTER_AUTH_SECRET` 是否已设置
- 检查 `DATABASE_URL` 连接是否正常

### 文件上传失败
- 检查所有 `R2_*` 变量
- 验证 R2 存储桶权限
- 确认 `R2_PUBLIC_DOMAIN` 正确

### 邮件发送失败
- 验证 `RESEND_API_KEY`
- 确认域名已验证

### OAuth 登录失败
- 检查回调 URL 配置
- 验证 Client ID 和 Secret

---

## 安全最佳实践

1. ✅ 使用强随机密钥
2. ✅ 不要将 `.env` 提交到 Git
3. ✅ 定期轮换密钥
4. ✅ 使用环境变量管理工具 (Vercel、Railway、Doppler)
5. ✅ 生产环境使用不同的密钥

---

## 参考资源

- [Better Auth 文档](https://better-auth.com/docs)
- [Cloudflare R2 文档](https://developers.cloudflare.com/r2/)
- [Resend 文档](https://resend.com/docs)
- [Stripe 文档](https://stripe.com/docs)
- [Next.js 环境变量](https://nextjs.org/docs/basic-features/environment-variables)

---

需要帮助？查看 [GitHub Issues](https://github.com/drdruide/open-launch/issues)

