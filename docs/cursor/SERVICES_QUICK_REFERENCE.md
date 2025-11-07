# 第三方服务配置快速参考

## 🎯 服务概览

| 服务 | 用途 | 是否必需 | 免费额度 |
|-----|------|---------|---------|
| **Cloudflare Turnstile** | Bot 防护 | 推荐 | ✅ 完全免费 |
| **Discord Webhook** | 通知推送 | 可选 | ✅ 完全免费 |
| **Resend** | 邮件发送 | 必需 | ✅ 3,000封/月 |

---

## 🔐 Cloudflare Turnstile

### 快速配置（5 分钟）

| 步骤 | 操作 | 链接 |
|-----|------|------|
| 1️⃣ | 访问 Cloudflare Dashboard | https://dash.cloudflare.com/ |
| 2️⃣ | 进入 Turnstile | 左侧菜单 > Turnstile |
| 3️⃣ | 添加站点 | Add site |
| 4️⃣ | 配置站点 | 填写名称和域名 |
| 5️⃣ | 复制密钥 | Site Key + Secret Key |

### 配置信息

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAAAAAA
TURNSTILE_SECRET_KEY=0x4AAAAAAAAAAAA
```

### 站点配置

| 字段 | 开发环境 | 生产环境 |
|-----|---------|---------|
| **Site name** | `Open Launch (Dev)` | `Open Launch` |
| **Domain** | `localhost` | `yourdomain.com` |
| **Widget Mode** | Managed | Managed |

### 使用场景

- ✅ 用户注册页面
- ✅ 用户登录页面
- ✅ 密码重置页面

### 测试

```bash
# 访问注册页面
http://localhost:3000/sign-up

# 注意: 开发模式默认禁用 Turnstile
```

---

## 💬 Discord Webhook

### 快速配置（10 分钟）

| 步骤 | 操作 | 说明 |
|-----|------|------|
| 1️⃣ | 创建 Discord 服务器 | 如果没有的话 |
| 2️⃣ | 创建频道 #comments | 用于评论通知 |
| 3️⃣ | 创建频道 #launches | 用于发布通知 |
| 4️⃣ | 配置 Webhook (评论) | 右键频道 > 编辑 > 集成 > Webhooks |
| 5️⃣ | 配置 Webhook (发布) | 重复步骤 4 |

### 配置信息

```env
# 评论通知
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123.../abc...

# 项目发布通知
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/456.../def...
```

### Webhook URL 格式

```
https://discord.com/api/webhooks/{webhook_id}/{webhook_token}
                                  ↑            ↑
                                  数字 ID       随机字符串
```

### 测试

```bash
# 测试评论 Webhook
curl -X POST "YOUR_DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content": "测试消息"}'

# 测试发布 Webhook
curl -X POST "YOUR_DISCORD_LAUNCH_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content": "测试消息"}'
```

### 通知示例

**评论通知：**
```
🟢 New Comment
━━━━━━━━━━━━━━━
"Great project! Looking forward to..."

Project: My Awesome App
User: John Doe (john@example.com)
```

**发布通知：**
```
🚀 New Project Launch Scheduled
━━━━━━━━━━━━━━━
New project submitted: My Awesome App

Launch Date: Dec 25, 2024
Launch Type: Premium
Website: https://example.com
```

---

## 📧 Resend

### 快速配置（15 分钟）

| 步骤 | 操作 | 时间 |
|-----|------|------|
| 1️⃣ | 注册 Resend | 2 分钟 |
| 2️⃣ | 添加域名 | 1 分钟 |
| 3️⃣ | 配置 DNS 记录 | 5 分钟 |
| 4️⃣ | 等待验证 | 5-10 分钟 |
| 5️⃣ | 创建 API 密钥 | 2 分钟 |

### 配置信息

```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### DNS 记录配置

**需要添加的记录：**

| 类型 | 名称 | 值 | 优先级 |
|------|------|---|-------|
| **TXT** | `@` | `resend-verification=xxx...` | - |
| **MX** | `@` | `feedback-smtp.resend.com` | 10 |
| **TXT** | `resend._domainkey` | `p=MIGfMA0GC...` | - |

### 域名验证状态

| 状态 | 说明 | 下一步 |
|-----|------|--------|
| 🟡 Pending | DNS 记录未生效 | 等待（最多 48 小时） |
| 🟢 Verified | 域名已验证 | 可以发送邮件 |
| 🔴 Failed | 验证失败 | 检查 DNS 配置 |

### 测试

```bash
# 测试 API 连接
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "noreply@yourdomain.com",
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<h1>Hello!</h1>"
  }'
```

### 邮件模板

项目发送的邮件类型：

1. **邮箱验证邮件** - 用户注册时
2. **密码重置邮件** - 忘记密码时

### 使用未验证域名（仅测试）

```typescript
// 临时使用 Resend 测试域名
from: "Open Launch <onboarding@resend.dev>"
```

⚠️ **限制**：
- 只能发送到注册邮箱
- 不能用于生产环境
- 可能进入垃圾箱

---

## 📊 完整配置示例

### 开发环境

```env
# Cloudflare Turnstile (测试密钥)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

# Discord Webhooks (开发服务器)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/dev_xxx/xxx
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/dev_yyy/yyy

# Resend (开发 API，使用测试域名)
RESEND_API_KEY=re_dev_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=onboarding@resend.dev
```

### 生产环境

```env
# Cloudflare Turnstile (生产密钥)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAAAAAA
TURNSTILE_SECRET_KEY=0x4AAAAAAAAAAAA

# Discord Webhooks (生产服务器)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/prod_xxx/xxx
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/prod_yyy/yyy

# Resend (生产 API，必须使用验证域名)
RESEND_API_KEY=re_prod_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

---

## ✅ 配置检查清单

### Cloudflare Turnstile

- [ ] 注册 Cloudflare 账号
- [ ] 创建 Turnstile 站点
- [ ] 配置站点域名
- [ ] 复制 Site Key 和 Secret Key
- [ ] 添加到 .env 文件
- [ ] 重启服务器
- [ ] 测试注册/登录页面

### Discord Webhook

- [ ] 创建/使用 Discord 服务器
- [ ] 创建通知频道
- [ ] 配置评论 Webhook
- [ ] 配置发布 Webhook
- [ ] 复制两个 Webhook URL
- [ ] 添加到 .env 文件
- [ ] 使用 curl 测试
- [ ] 在应用中实际测试

### Resend

- [ ] 注册 Resend 账号
- [ ] 添加域名
- [ ] 配置 DNS 记录（TXT + MX）
- [ ] 等待域名验证通过
- [ ] 创建 API 密钥
- [ ] 添加到 .env 文件
- [ ] 测试发送邮件
- [ ] 检查邮件送达率
- [ ] 检查垃圾邮件文件夹

---

## 🚨 常见错误速查

| 错误信息 | 服务 | 解决方案 |
|---------|------|---------|
| "Invalid site key" | Turnstile | 检查 Site Key 是否正确 |
| "Domain not allowed" | Turnstile | 在站点配置中添加当前域名 |
| "Webhook execution failed" | Discord | 检查 Webhook URL 是否完整 |
| "Unauthorized" | Discord | Webhook 可能已被删除，重新创建 |
| "Domain not verified" | Resend | 检查 DNS 记录，等待验证 |
| "API key invalid" | Resend | 重新生成 API 密钥 |
| "Recipient not allowed" | Resend | 未验证域名时只能发送到注册邮箱 |

---

## 💰 成本对比

| 服务 | 免费额度 | 付费计划起步价 | 推荐 |
|-----|---------|---------------|------|
| **Turnstile** | 无限制 | N/A (完全免费) | ⭐⭐⭐⭐⭐ |
| **Discord** | 无限制 | N/A (完全免费) | ⭐⭐⭐⭐⭐ |
| **Resend** | 3,000封/月 | $20/月 (50,000封) | ⭐⭐⭐⭐ |

对于中小型项目，完全可以免费使用这些服务！

---

## ⏱️ 预计配置时间

| 服务 | 首次配置 | 更新配置 |
|-----|---------|---------|
| **Turnstile** | 5 分钟 | 2 分钟 |
| **Discord** | 10 分钟 | 3 分钟 |
| **Resend** | 15-30 分钟* | 5 分钟 |

*包含 DNS 传播等待时间

**总计首次配置时间: 约 30-45 分钟**

---

## 📚 相关文档

- 📖 **完整配置指南**: `SERVICES_SETUP_GUIDE.md`
- 📖 **所有环境变量**: `ENV_SETUP_GUIDE.md`
- 📖 **环境变量模板**: `env.example.txt`

---

## 🔗 快速链接

### Cloudflare Turnstile
- Dashboard: https://dash.cloudflare.com/
- 文档: https://developers.cloudflare.com/turnstile/

### Discord
- 开发者门户: https://discord.com/developers
- Webhook 文档: https://discord.com/developers/docs/resources/webhook

### Resend
- Dashboard: https://resend.com/
- 文档: https://resend.com/docs
- 域名验证: https://resend.com/domains

---

**配置完成后记得重启服务器！**

```bash
bun dev  # 或 npm run dev
```


