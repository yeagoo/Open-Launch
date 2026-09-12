# Zeabur 部署指南

本指南说明如何将 Open Launch 项目部署到 Zeabur。

## 🚨 您遇到的错误分析

### 错误 1: Google OAuth 警告

```
WARN [Better Auth]: Social provider google is missing clientId or clientSecret
```

**原因**: 环境变量中缺少 Google OAuth 配置

**解决方案**: 在 Zeabur 中配置 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET`

---

### 错误 2: 数据库表不存在

```
error: relation "project" does not exist
```

**原因**: 数据库迁移未执行，数据库表结构未创建

**解决方案**: 运行数据库迁移命令

---

## 📋 部署前准备清单

### 必需服务

- [ ] PostgreSQL 数据库
- [ ] Redis 缓存
- [ ] Cloudflare R2 (文件存储)
- [ ] Resend (邮件服务)

### 可选服务

- [ ] Google OAuth
- [ ] GitHub OAuth
- [ ] Stripe 支付
- [ ] Cloudflare Turnstile
- [ ] Discord Webhook
- [ ] Google Analytics

---

## 🚀 Zeabur 部署步骤

### 步骤 1: 创建 Zeabur 项目

1. 访问 [Zeabur](https://zeabur.com/)
2. 登录或注册账号
3. 点击 **"New Project"**
4. 选择地区（建议选择距离用户较近的）

### 步骤 2: 部署 PostgreSQL 数据库

1. 在项目中点击 **"Add Service"**
2. 选择 **"Prebuilt"**
3. 选择 **"PostgreSQL"**
4. 等待部署完成
5. 点击 PostgreSQL 服务，复制 **Connection String**

格式类似：

```
postgresql://user:password@host.zeabur.internal:5432/zeabur
```

### 步骤 3: 部署 Redis

1. 点击 **"Add Service"**
2. 选择 **"Prebuilt"**
3. 选择 **"Redis"**
4. 等待部署完成
5. 复制 **Connection String**

格式类似：

```
redis://default:password@host.zeabur.internal:6379
```

### 步骤 4: 部署应用

1. 点击 **"Add Service"**
2. 选择 **"Git"**
3. 连接您的 GitHub 账号
4. 选择 `Open-Launch` 仓库
5. Zeabur 会自动检测为 Next.js 项目

### 步骤 5: 配置环境变量

⚠️ **这是最重要的步骤！**

点击应用服务 → **"Variables"** 标签，添加以下环境变量：

#### 基础配置

```env
# 应用 URL
NEXT_PUBLIC_URL=https://your-app.zeabur.app

# Node 环境
NODE_ENV=production
```

#### 数据库配置

```env
# PostgreSQL (从步骤 2 复制)
DATABASE_URL=postgresql://user:password@host.zeabur.internal:5432/zeabur

# Redis (从步骤 3 复制)
REDIS_URL=redis://default:password@host.zeabur.internal:6379
```

#### Better Auth 配置

```env
# 生成随机密钥
BETTER_AUTH_SECRET=your_random_32_char_secret_here
```

生成命令：

```bash
openssl rand -base64 32
```

#### Cloudflare R2 配置

```env
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_DOMAIN=https://your-r2-domain.com
```

#### Resend 邮件配置

```env
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

#### OAuth 配置 (可选)

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your_google_client_secret

# GitHub OAuth
GITHUB_CLIENT_ID=Iv1.your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# Google One Tap
NEXT_PUBLIC_ONE_TAP_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
```

⚠️ **重要**: 如果不配置 OAuth，删除或注释掉这些变量，避免警告。

#### Stripe 配置 (可选)

```env
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
NEXT_PUBLIC_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/your_payment_link
```

#### Cloudflare Turnstile (可选)

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAAAAAA
TURNSTILE_SECRET_KEY=0x4AAAAAAAAAAAA
```

#### Discord Webhook (可选)

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx
```

#### Google Analytics (可选)

```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

获取方式：访问 https://analytics.google.com/ 创建媒体资源，获取测量 ID

### 步骤 6: 运行数据库迁移 ⭐ 最关键

这一步解决 `relation "project" does not exist` 错误。

**方法 1: 使用 Zeabur 命令行（推荐）**

1. 点击应用服务
2. 进入 **"Terminal"** 或 **"Console"** 标签
3. 运行以下命令：

```bash
# 生成迁移
bun run db:generate

# 执行迁移
bun run db:migrate

# 推送到数据库
bun run db:push
```

**方法 2: 本地运行迁移（如果方法 1 不可用）**

1. 在本地克隆项目
2. 配置 `.env` 文件，使用 Zeabur 的数据库连接字符串
3. 运行迁移：

```bash
# 本地安装依赖
bun install

# 运行迁移
bun run db:generate
bun run db:migrate
bun run db:push
```

**方法 3: 添加构建命令**

在 Zeabur 项目设置中，添加 **"Build Command"**：

```bash
bun install && bun run db:push && bun run build
```

⚠️ **注意**: 只在首次部署时需要，之后可以移除 `db:push`

### 步骤 7: 初始化分类数据

数据库迁移完成后，需要添加初始分类：

```bash
# 在 Zeabur Terminal 中运行
bun scripts/categories.ts
```

或者在本地运行后数据会同步到 Zeabur 数据库。

### 步骤 8: 配置自定义域名（可选）

1. 点击应用服务
2. 进入 **"Domains"** 标签
3. 添加自定义域名
4. 配置 DNS 记录（Zeabur 会提供）
5. 等待 SSL 证书自动配置

### 步骤 9: 重新部署

配置完所有环境变量后：

1. 点击应用服务
2. 点击 **"Redeploy"** 或 **"Restart"**
3. 等待部署完成

---

## ✅ 验证部署

### 1. 检查应用状态

- Zeabur Dashboard 显示 **"Running"** 状态
- 访问应用 URL，页面正常加载

### 2. 检查日志

点击应用服务 → **"Logs"** 标签，确认：

- ✅ 没有 `relation "project" does not exist` 错误
- ✅ 没有或可以忽略 OAuth 警告（如果未配置）
- ✅ 应用成功启动：`✓ Ready in XXXms`

### 3. 测试功能

- [ ] 访问首页
- [ ] 用户注册/登录
- [ ] 提交项目
- [ ] 上传图片
- [ ] 发送邮件

---

## 🚨 故障排查

### 问题 1: "relation does not exist" 错误

**原因**: 数据库迁移未执行

**解决**:

1. 确认 `DATABASE_URL` 配置正确
2. 在 Zeabur Terminal 运行:
   ```bash
   bun run db:push
   ```
3. 重启应用

### 问题 2: OAuth 警告

**原因**: OAuth 环境变量未配置

**解决**:

**选项 A**: 配置 OAuth（如果需要）

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

**选项 B**: 移除 OAuth 配置（如果不需要）

修改 `lib/auth.ts`，注释掉或删除 `socialProviders` 部分：

```typescript
export const auth = betterAuth({
  // ...其他配置
  // 注释掉 OAuth 配置
  // socialProviders: {
  //   google: { ... },
  //   github: { ... }
  // },
})
```

### 问题 3: 文件上传失败

**原因**: R2 配置错误

**解决**:

1. 检查所有 `R2_*` 环境变量
2. 验证 R2 存储桶权限
3. 确认 `R2_PUBLIC_DOMAIN` 可访问

### 问题 4: 邮件发送失败

**原因**: Resend 配置错误

**解决**:

1. 验证 `RESEND_API_KEY`
2. 确认域名已在 Resend 验证
3. 检查 `RESEND_FROM_EMAIL` 使用验证的域名

### 问题 5: 应用无法启动

**原因**: 缺少必需的环境变量

**解决**:

1. 检查日志找出缺少的变量
2. 添加所有必需的环境变量：
   - `BETTER_AUTH_SECRET`
   - `DATABASE_URL`
   - `REDIS_URL`
   - `R2_*` (5 个变量)
   - `RESEND_API_KEY`

---

## 📝 最小环境变量配置

如果只想快速部署测试，以下是最小配置：

```env
# 应用配置
NODE_ENV=production
NEXT_PUBLIC_URL=https://your-app.zeabur.app

# 认证
BETTER_AUTH_SECRET=your_random_secret_here

# 数据库
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# R2 文件存储
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_DOMAIN=...

# 邮件服务
RESEND_API_KEY=...
RESEND_FROM_EMAIL=...
```

---

## 🔄 更新部署

### 自动部署

Zeabur 支持 Git 自动部署：

1. 推送代码到 GitHub
2. Zeabur 自动检测并部署
3. 查看部署日志

### 手动部署

1. 在 Zeabur Dashboard
2. 点击应用服务
3. 点击 **"Redeploy"**

---

## 💰 Zeabur 成本估算

| 服务           | 免费额度     | 付费价格           |
| -------------- | ------------ | ------------------ |
| **应用**       | 1 个免费实例 | $5/月起            |
| **PostgreSQL** | 5GB 存储     | 超出后 $0.15/GB/月 |
| **Redis**      | 512MB        | 超出后 $1/GB/月    |

**预计成本**: 小型项目约 $5-10/月

---

## 🔗 相关资源

### Zeabur

- [Zeabur 文档](https://zeabur.com/docs)
- [Zeabur Dashboard](https://dash.zeabur.com/)
- [定价](https://zeabur.com/pricing)

### 项目文档

- 环境变量配置: `ENV_SETUP_GUIDE.md`
- R2 配置: `R2_SETUP.md`
- OAuth 配置: `OAUTH_SETUP_GUIDE.md`
- Stripe 配置: `STRIPE_SETUP_GUIDE.md`
- 服务配置: `SERVICES_SETUP_GUIDE.md`

---

## 📞 需要帮助？

如果遇到问题：

1. 查看 Zeabur 部署日志
2. 检查环境变量配置
3. 验证数据库迁移是否执行
4. 参考本文档的故障排查部分
5. 访问 [Zeabur Discord](https://discord.gg/zeabur)

---

## ✅ 部署成功检查清单

- [ ] PostgreSQL 服务运行中
- [ ] Redis 服务运行中
- [ ] 所有环境变量已配置
- [ ] 数据库迁移已执行
- [ ] 分类数据已初始化
- [ ] 应用状态显示 Running
- [ ] 日志无严重错误
- [ ] 首页可以访问
- [ ] 用户可以注册
- [ ] 邮件可以发送
- [ ] 文件可以上传
- [ ] 自定义域名已配置（可选）

---

**部署成功后，您的 Open Launch 就上线了！** 🎉
