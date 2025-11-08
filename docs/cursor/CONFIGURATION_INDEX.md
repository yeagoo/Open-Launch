# 📚 配置文档索引

本项目的完整配置指南文档汇总。

## 🚀 快速开始

1. **环境变量总览**: `ENV_SETUP_GUIDE.md` - 所有环境变量的配置指南
2. **环境变量模板**: `env.example.txt` - 可直接复制的配置模板
3. **故障排查**: `DEPLOYMENT_TROUBLESHOOTING.md` - 遇到问题时查看

---

## 📖 详细配置指南

### 必需配置

| 文档 | 说明 | 预计时间 |
|-----|------|---------|
| **R2_SETUP.md** | Cloudflare R2 文件存储配置 | 15 分钟 |
| **SERVICES_SETUP_GUIDE.md** | Resend 邮件、Turnstile、Discord | 30 分钟 |
| - `SERVICES_QUICK_REFERENCE.md` | 服务配置快速参考 | - |

### 可选配置

| 文档 | 说明 | 预计时间 |
|-----|------|---------|
| **OAUTH_SETUP_GUIDE.md** | Google & GitHub 登录配置 | 20 分钟 |
| - `OAUTH_QUICK_REFERENCE.md` | OAuth 配置快速参考 | - |
| **STRIPE_SETUP_GUIDE.md** | Stripe 支付配置 | 30 分钟 |
| - `STRIPE_QUICK_REFERENCE.md` | Stripe 快速参考 | - |
| - `STRIPE_WEBHOOK_CONFIG.md` | Webhook 详细配置 | - |
| - `WEBHOOK_URL_GUIDE.md` | Webhook URL 快速指南 | - |

### 部署指南

| 文档 | 说明 | 预计时间 |
|-----|------|---------|
| **ZEABUR_DEPLOYMENT_GUIDE.md** | Zeabur 部署完整指南 | 30 分钟 |
| **DEPLOYMENT_TROUBLESHOOTING.md** | 部署故障排查 | - |

### 管理指南

| 文档 | 说明 | 预计时间 |
|-----|------|---------|
| **ADMIN_SETUP_GUIDE.md** | 管理员账号设置指南 | 5 分钟 |

### 迁移指南

| 文档 | 说明 |
|-----|------|
| **MIGRATION_R2.md** | uploadthing → R2 迁移指南 |

### 故障修复

| 文档 | 说明 |
|-----|------|
| **NEXT_CONFIG_FIX.md** | next.config.ts 构建错误修复 |

---

## 🎯 按需求查找

### 我想部署到生产环境

1. 阅读 `ZEABUR_DEPLOYMENT_GUIDE.md`
2. 参考 `ENV_SETUP_GUIDE.md` 配置所有环境变量
3. 遇到问题查看 `DEPLOYMENT_TROUBLESHOOTING.md`

### 我想配置文件上传

1. 阅读 `R2_SETUP.md`
2. 配置 Cloudflare R2
3. 设置 5 个 R2 环境变量

### 我想添加 Google/GitHub 登录

1. 阅读 `OAUTH_SETUP_GUIDE.md`
2. 或查看 `OAUTH_QUICK_REFERENCE.md` 快速配置
3. 配置回调 URL

### 我想添加支付功能

1. 阅读 `STRIPE_SETUP_GUIDE.md`
2. 配置 API 密钥和 Webhook
3. 参考 `STRIPE_WEBHOOK_CONFIG.md` 配置 Webhook URL

### 我想添加邮件功能

1. 阅读 `SERVICES_SETUP_GUIDE.md` 的 Resend 部分
2. 验证域名
3. 创建 API 密钥

### 我想添加 Bot 防护

1. 阅读 `SERVICES_SETUP_GUIDE.md` 的 Turnstile 部分
2. 创建 Cloudflare Turnstile 站点
3. 配置 Site Key 和 Secret Key

### 我想添加通知功能

1. 阅读 `SERVICES_SETUP_GUIDE.md` 的 Discord 部分
2. 创建 Discord Webhook
3. 配置两个 Webhook URL

### 我想添加访问统计

1. 阅读 `PLAUSIBLE_SETUP_GUIDE.md`
2. 注册 Plausible 或自托管
3. 配置 API 密钥和 Site ID

### 我想设置管理员

1. 阅读 `ADMIN_SETUP_GUIDE.md`
2. 注册一个账号
3. 修改数据库设置 role = 'admin'
4. 访问 `/admin` 管理后台

---

## 🔍 按服务查找

### Better Auth (认证)

- **环境变量**: `BETTER_AUTH_SECRET`
- **生成命令**: `openssl rand -base64 32`
- **文档**: `ENV_SETUP_GUIDE.md`

### PostgreSQL (数据库)

- **环境变量**: `DATABASE_URL`
- **格式**: `postgresql://user:pass@host:5432/dbname`
- **文档**: `ZEABUR_DEPLOYMENT_GUIDE.md`

### Redis (缓存)

- **环境变量**: `REDIS_URL`
- **格式**: `redis://default:pass@host:6379`
- **文档**: `ZEABUR_DEPLOYMENT_GUIDE.md`

### Cloudflare R2 (文件存储)

- **环境变量**: 5 个 `R2_*`
- **文档**: `R2_SETUP.md`
- **快速指南**: `MIGRATION_R2.md`

### Resend (邮件)

- **环境变量**: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- **文档**: `SERVICES_SETUP_GUIDE.md`
- **快速参考**: `SERVICES_QUICK_REFERENCE.md`

### Google OAuth

- **环境变量**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **文档**: `OAUTH_SETUP_GUIDE.md`
- **快速参考**: `OAUTH_QUICK_REFERENCE.md`
- **回调 URL**: `/api/auth/callback/google`

### GitHub OAuth

- **环境变量**: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- **文档**: `OAUTH_SETUP_GUIDE.md`
- **快速参考**: `OAUTH_QUICK_REFERENCE.md`
- **回调 URL**: `/api/auth/callback/github`

### Stripe (支付)

- **环境变量**: 4 个 `STRIPE_*`
- **文档**: `STRIPE_SETUP_GUIDE.md`
- **快速参考**: `STRIPE_QUICK_REFERENCE.md`
- **Webhook**: `STRIPE_WEBHOOK_CONFIG.md`

### Cloudflare Turnstile (Bot 防护)

- **环境变量**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
- **文档**: `SERVICES_SETUP_GUIDE.md`
- **快速参考**: `SERVICES_QUICK_REFERENCE.md`

### Discord (通知)

- **环境变量**: 2 个 `DISCORD_*_WEBHOOK_URL`
- **文档**: `SERVICES_SETUP_GUIDE.md`
- **快速参考**: `SERVICES_QUICK_REFERENCE.md`

### Plausible (分析)

- **环境变量**: 3 个 `PLAUSIBLE_*`
- **文档**: `PLAUSIBLE_SETUP_GUIDE.md`
- **快速参考**: `PLAUSIBLE_QUICK_REFERENCE.md`

---

## 📊 配置优先级

### 第一优先级（必需）

1. ✅ `BETTER_AUTH_SECRET` - 认证密钥
2. ✅ `DATABASE_URL` - PostgreSQL 数据库
3. ✅ `REDIS_URL` - Redis 缓存
4. ✅ `R2_*` (5 个) - 文件存储
5. ✅ `RESEND_API_KEY` - 邮件服务

**文档**: `ENV_SETUP_GUIDE.md` + `R2_SETUP.md` + `SERVICES_SETUP_GUIDE.md`

### 第二优先级（推荐）

6. ⭐ `GOOGLE_CLIENT_ID/SECRET` - Google 登录
7. ⭐ `GITHUB_CLIENT_ID/SECRET` - GitHub 登录
8. ⭐ `TURNSTILE_*` - Bot 防护

**文档**: `OAUTH_SETUP_GUIDE.md` + `SERVICES_SETUP_GUIDE.md`

### 第三优先级（可选）

9. 💰 `STRIPE_*` (4 个) - 支付功能
10. 💬 `DISCORD_*` (2 个) - 通知
11. 📊 `PLAUSIBLE_*` (3 个) - 分析

**文档**: `STRIPE_SETUP_GUIDE.md` + `SERVICES_SETUP_GUIDE.md` + `PLAUSIBLE_SETUP_GUIDE.md`

---

## ⏱️ 预计配置时间

| 阶段 | 内容 | 时间 |
|-----|------|------|
| **核心配置** | Better Auth + DB + Redis + R2 + Resend | 60-90 分钟 |
| **OAuth** | Google + GitHub | 20-30 分钟 |
| **支付** | Stripe | 30-45 分钟 |
| **其他服务** | Turnstile + Discord + Plausible | 30-45 分钟 |
| **部署** | Zeabur 部署 | 30-60 分钟 |
| **总计** | 完整配置 | **3-4 小时** |

---

## 🆘 故障排查流程

```
遇到问题
  ↓
查看错误信息
  ↓
1. DEPLOYMENT_TROUBLESHOOTING.md (部署错误)
2. ZEABUR_DEPLOYMENT_GUIDE.md (Zeabur 相关)
3. 对应服务的 SETUP_GUIDE.md (服务配置)
4. ENV_SETUP_GUIDE.md (环境变量)
  ↓
仍未解决
  ↓
查看项目 GitHub Issues
```

---

## 📝 文档更新日志

| 日期 | 文档 | 更新内容 |
|-----|------|---------|
| 2024-11 | 所有文档 | 创建完整配置指南 |
| 2024-11 | R2 相关 | uploadthing → R2 迁移 |
| 2024-11 | Zeabur | 添加 Zeabur 部署指南 |

---

## 🔗 外部资源

### 官方文档

- [Next.js 文档](https://nextjs.org/docs)
- [Better Auth 文档](https://better-auth.com/docs)
- [Drizzle ORM 文档](https://orm.drizzle.team/docs)
- [Cloudflare R2 文档](https://developers.cloudflare.com/r2/)
- [Resend 文档](https://resend.com/docs)
- [Stripe 文档](https://stripe.com/docs)
- [Zeabur 文档](https://zeabur.com/docs)

### 社区

- [GitHub Repository](https://github.com/drdruide/open-launch)
- [GitHub Issues](https://github.com/drdruide/open-launch/issues)
- [Zeabur Discord](https://discord.gg/zeabur)

---

## 💡 提示

- 📖 建议按顺序阅读配置文档
- ⚡ 使用 Quick Reference 文档快速查询
- 🔍 善用 Ctrl+F 搜索关键词
- ✅ 完成一个配置后立即测试
- 📝 记录您的配置信息（脱敏后）

---

**祝您配置顺利！如有问题，请查阅对应的详细文档。** 🚀

