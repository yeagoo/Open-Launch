# 第三方服务配置指南

本指南说明如何配置 Cloudflare Turnstile、Discord Webhook 和 Resend 邮件服务。

## 📋 需要配置的环境变量

```env
# Cloudflare Turnstile (Bot 防护)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAAAAAA
TURNSTILE_SECRET_KEY=0x4AAAAAAAAAAAA

# Discord Webhooks (通知)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/xxxxx/xxxxx

# Resend (邮件服务)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

---

## 🔐 Cloudflare Turnstile 配置

Turnstile 是 Cloudflare 提供的免费 CAPTCHA 替代方案，用于防止机器人注册和登录。

### 用途

项目中 Turnstile 用于保护：
- ✅ 用户注册 (`/sign-up`)
- ✅ 用户登录 (`/sign-in`)
- ✅ 密码重置 (`/forgot-password`)

### 步骤 1: 访问 Cloudflare Dashboard

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 如果没有账号，先注册一个（免费）

### 步骤 2: 进入 Turnstile

1. 在左侧菜单中找到 **"Turnstile"**
2. 或直接访问: https://dash.cloudflare.com/?to=/:account/turnstile

### 步骤 3: 创建站点

1. 点击 **"Add site"** 或 **"添加站点"**

**填写信息：**

| 字段 | 填写内容 |
|-----|---------|
| **Site name** | `Open Launch` 或您的项目名称 |
| **Domain** | `yourdomain.com` (生产) 或 `localhost` (开发) |
| **Widget Mode** | 选择 **Managed** (推荐) |

**Widget Mode 说明：**
- **Managed**: 自动根据风险调整验证方式（推荐）
- **Non-Interactive**: 完全无交互（最友好）
- **Invisible**: 不显示小部件（最隐秘）

### 步骤 4: 获取密钥

创建成功后会显示：

```
Site Key: 0x4AAAAAAABbbb1234567890
Secret Key: 0x4AAAAAAABbbb0987654321abcdef
```

### 步骤 5: 配置环境变量

```env
# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAABbbb1234567890
TURNSTILE_SECRET_KEY=0x4AAAAAAABbbb0987654321abcdef
```

### 步骤 6: 配置域名（生产环境）

1. 在 Turnstile 站点设置中
2. **Domains** 部分添加您的域名：
   ```
   yourdomain.com
   www.yourdomain.com
   localhost (开发环境)
   ```

### 测试 Turnstile

**开发环境测试：**
1. 访问 `http://localhost:3000/sign-up`
2. 应该看不到 Turnstile（开发模式默认禁用）
3. 可以在代码中临时移除开发检查进行测试

**生产环境测试：**
1. 部署到生产环境
2. 访问注册页面
3. 应该看到 Turnstile 验证组件

---

## 💬 Discord Webhook 配置

Discord Webhook 用于发送实时通知到您的 Discord 服务器。

### 用途

项目使用两个 Webhook：

1. **DISCORD_WEBHOOK_URL**: 
   - 💬 新评论通知
   
2. **DISCORD_LAUNCH_WEBHOOK_URL**: 
   - 🚀 新项目发布通知

### 前置条件

- 拥有一个 Discord 账号
- 拥有或创建一个 Discord 服务器
- 在服务器中有管理权限

### 步骤 1: 创建 Discord 服务器（如果没有）

1. 打开 Discord
2. 点击左侧的 **"+"** 按钮
3. 选择 **"创建我的服务器"**
4. 设置服务器名称：`Open Launch Notifications`
5. 创建服务器

### 步骤 2: 创建频道

建议创建两个独立的频道：

1. **#comments** - 用于评论通知
2. **#launches** - 用于项目发布通知

**创建频道步骤：**
1. 右键点击服务器名称
2. 选择 **"创建频道"** 或 **"Create Channel"**
3. 类型选择 **"文本频道"** 或 **"Text Channel"**
4. 输入频道名称
5. 点击创建

### 步骤 3: 创建 Webhook (评论通知)

1. 右键点击 **#comments** 频道
2. 选择 **"编辑频道"** 或 **"Edit Channel"**
3. 在左侧菜单选择 **"集成"** 或 **"Integrations"**
4. 点击 **"Webhooks"** → **"创建 Webhook"** 或 **"Create Webhook"**

**配置 Webhook：**

| 字段 | 填写内容 |
|-----|---------|
| **名称** | `Open Launch Comments` |
| **头像** | 可选：上传项目 logo |
| **频道** | `#comments` |

5. 点击 **"复制 Webhook URL"**

URL 格式如下：
```
https://discord.com/api/webhooks/1234567890123456789/abcdefghijklmnopqrstuvwxyz123456789
```

### 步骤 4: 创建 Webhook (发布通知)

重复步骤 3，但使用 **#launches** 频道：

1. 右键点击 **#launches** 频道
2. 创建 Webhook
3. 名称：`Open Launch Releases`
4. 复制 Webhook URL

### 步骤 5: 配置环境变量

```env
# Discord Webhooks
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123.../abc...
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/456.../def...
```

### 测试 Discord Webhook

**方法 1: 使用 curl 测试**

```bash
# 测试评论 Webhook
curl -X POST "YOUR_DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "测试消息 - Open Launch 评论通知"
  }'

# 测试发布 Webhook
curl -X POST "YOUR_DISCORD_LAUNCH_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "测试消息 - Open Launch 发布通知"
  }'
```

**方法 2: 在应用中测试**

1. 启动应用
2. 提交一个项目（会触发 Launch Webhook）
3. 在项目下发表评论（会触发 Comment Webhook）
4. 检查 Discord 频道是否收到通知

### Discord Webhook 消息格式

**评论通知示例：**
```
🟢 New Comment
━━━━━━━━━━━━━━━
Comment content here...

Project: Project Name
User: User Name (user@email.com)
```

**发布通知示例：**
```
🚀 New Project Launch Scheduled
━━━━━━━━━━━━━━━
New project submitted: Project Name

Launch Date: Dec 25, 2024
Launch Type: Premium
Website: https://example.com
```

---

## 📧 Resend 邮件服务配置

Resend 是现代化的邮件发送服务，用于发送事务性邮件。

### 用途

项目使用 Resend 发送：
- ✅ 邮箱验证邮件
- ✅ 密码重置邮件
- ✅ 其他通知邮件

### 步骤 1: 注册 Resend 账号

1. 访问 [Resend](https://resend.com/)
2. 点击 **"Get Started"** 或 **"开始使用"**
3. 使用邮箱注册账号
4. 验证邮箱

### 步骤 2: 添加域名

**重要**: 要在生产环境发送邮件，必须验证域名

1. 登录 Resend Dashboard
2. 访问 [Domains](https://resend.com/domains)
3. 点击 **"Add Domain"**

**添加域名：**
```
yourdomain.com
```

### 步骤 3: 验证域名

Resend 会提供 DNS 记录，需要添加到您的域名 DNS 设置中：

**需要添加的 DNS 记录（示例）：**

| 类型 | 名称 | 值 |
|------|------|---|
| **TXT** | `@` | `resend-verification=abc123...` |
| **MX** | `@` | `feedback-smtp.resend.com` (优先级 10) |
| **TXT** | `resend._domainkey` | `p=MIGfMA0GC...` |

**添加 DNS 记录步骤（以 Cloudflare 为例）：**

1. 登录域名 DNS 管理面板（Cloudflare/阿里云/腾讯云等）
2. 进入 DNS 记录管理
3. 按照 Resend 提供的记录添加
4. 等待 DNS 传播（通常几分钟到几小时）
5. 返回 Resend 点击 **"Verify"**

### 步骤 4: 创建 API 密钥

1. 在 Resend Dashboard 中
2. 访问 [API Keys](https://resend.com/api-keys)
3. 点击 **"Create API Key"**

**配置 API 密钥：**

| 字段 | 填写内容 |
|-----|---------|
| **Name** | `Open Launch Production` 或 `Open Launch Development` |
| **Permission** | 选择 **"Sending access"** |
| **Domain** | 选择您验证的域名（或 All Domains） |

4. 点击 **"Create"**
5. **立即复制密钥**（只显示一次！）

格式示例：
```
re_123abc456def789ghi012jkl345mno67
```

### 步骤 5: 配置发件人邮箱

在代码中配置 `from` 字段（已在 `lib/email.ts` 中配置）：

```typescript
from: "Open-Launch <noreply@yourdomain.com>"
```

确保使用验证过的域名。

### 步骤 6: 配置环境变量

```env
# Resend 邮件服务
RESEND_API_KEY=re_123abc456def789ghi012jkl345mno67
```

### 测试 Resend

**方法 1: 测试 API 连接**

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "noreply@yourdomain.com",
    "to": "your-email@example.com",
    "subject": "Test Email from Open Launch",
    "html": "<h1>Hello!</h1><p>This is a test email.</p>"
  }'
```

**方法 2: 在应用中测试**

1. 启动应用
2. 注册一个新账号
3. 检查邮箱是否收到验证邮件
4. 测试密码重置功能

### Resend 免费额度

Resend 提供慷慨的免费层：
- ✅ 每月 3,000 封邮件
- ✅ 每天 100 封邮件
- ✅ 支持自定义域名
- ✅ API 访问

对于初创项目完全够用！

### 使用未验证域名（仅测试）

如果暂时无法验证域名，可以使用 Resend 的测试域名：

```typescript
from: "Open Launch <onboarding@resend.dev>"
```

⚠️ **注意**: 测试域名有限制：
- 只能发送到您注册的邮箱
- 不能用于生产环境
- 邮件可能进入垃圾箱

---

## 📝 完整配置示例

### 开发环境 (.env.local)

```env
# ==========================================
# 第三方服务配置 - 开发环境
# ==========================================

# Cloudflare Turnstile (可以使用测试密钥)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

# Discord Webhooks (使用测试服务器)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/dev_123.../abc...
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/dev_456.../def...

# Resend (使用开发 API 密钥)
RESEND_API_KEY=re_dev_xxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

### 生产环境

```env
# ==========================================
# 第三方服务配置 - 生产环境
# ==========================================

# Cloudflare Turnstile (生产密钥)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAAAAAA
TURNSTILE_SECRET_KEY=0x4AAAAAAAAAAAA

# Discord Webhooks (生产服务器)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/prod_123.../abc...
DISCORD_LAUNCH_WEBHOOK_URL=https://discord.com/api/webhooks/prod_456.../def...

# Resend (生产 API 密钥，必须使用验证域名)
RESEND_API_KEY=re_prod_xxxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

---

## ✅ 配置检查清单

### Cloudflare Turnstile

- [ ] 注册 Cloudflare 账号
- [ ] 创建 Turnstile 站点
- [ ] 获取 Site Key 和 Secret Key
- [ ] 配置域名（生产环境）
- [ ] 添加到 .env 文件
- [ ] 测试注册/登录页面

### Discord Webhook

- [ ] 创建 Discord 服务器
- [ ] 创建通知频道（#comments, #launches）
- [ ] 创建两个 Webhooks
- [ ] 复制 Webhook URLs
- [ ] 配置到 .env 文件
- [ ] 使用 curl 测试
- [ ] 在应用中测试

### Resend

- [ ] 注册 Resend 账号
- [ ] 添加并验证域名
- [ ] 添加 DNS 记录
- [ ] 等待域名验证通过
- [ ] 创建 API 密钥
- [ ] 配置到 .env 文件
- [ ] 测试发送邮件
- [ ] 检查邮件送达率

---

## 🚨 常见问题

### Turnstile: "Invalid site key"

**原因**: Site Key 配置错误或域名不匹配

**解决**:
1. 检查 `NEXT_PUBLIC_TURNSTILE_SITE_KEY` 是否正确
2. 确认当前域名在 Turnstile 站点配置中
3. 清除浏览器缓存
4. 重启开发服务器

### Discord: "Webhook执行失败"

**原因**: Webhook URL 错误或已被删除

**解决**:
1. 检查 Webhook URL 是否完整
2. 在 Discord 中确认 Webhook 仍然存在
3. 重新创建 Webhook
4. 检查消息格式是否正确

### Resend: "Domain not verified"

**原因**: 域名未验证或 DNS 记录未生效

**解决**:
1. 检查 DNS 记录是否正确添加
2. 等待 DNS 传播（最多 48 小时）
3. 使用 dig 命令验证 DNS：
   ```bash
   dig TXT yourdomain.com
   dig TXT resend._domainkey.yourdomain.com
   ```
4. 临时使用 `onboarding@resend.dev` 进行测试

### Resend: "邮件进入垃圾箱"

**原因**: 域名未验证或 SPF/DKIM 配置不正确

**解决**:
1. 确保域名完全验证
2. 检查所有 DNS 记录
3. 添加 SPF 和 DKIM 记录
4. 使用真实的发件人地址
5. 避免垃圾邮件关键词

---

## 💰 成本说明

| 服务 | 免费额度 | 付费计划 |
|-----|---------|---------|
| **Cloudflare Turnstile** | ✅ 完全免费 | 无需付费 |
| **Discord Webhook** | ✅ 完全免费 | 无需付费 |
| **Resend** | ✅ 3,000封/月 | $20/月 (50,000封) |

对于中小型项目，完全可以使用免费层！

---

## 🔗 相关资源

### Cloudflare Turnstile
- [Turnstile 文档](https://developers.cloudflare.com/turnstile/)
- [Turnstile Dashboard](https://dash.cloudflare.com/?to=/:account/turnstile)
- [迁移指南](https://developers.cloudflare.com/turnstile/migration/)

### Discord Webhooks
- [Webhook 文档](https://discord.com/developers/docs/resources/webhook)
- [Embed 格式](https://discord.com/developers/docs/resources/channel#embed-object)
- [Webhook 测试工具](https://discohook.org/)

### Resend
- [Resend 文档](https://resend.com/docs)
- [API 参考](https://resend.com/docs/api-reference/introduction)
- [域名验证指南](https://resend.com/docs/dashboard/domains/introduction)
- [DNS 配置帮助](https://resend.com/docs/dashboard/domains/dns-providers)

---

## 📞 需要帮助？

如果遇到问题：
1. 查看各服务的官方文档
2. 检查环境变量是否正确配置
3. 查看服务器日志
4. 查看浏览器控制台错误
5. 联系各服务的支持团队

---

**配置完成后，记得重启开发服务器！**

```bash
# 停止当前服务器 (Ctrl+C)
# 重新启动
bun dev
```


