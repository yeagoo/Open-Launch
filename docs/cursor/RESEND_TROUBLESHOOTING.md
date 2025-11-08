# 📧 Resend 邮件发送故障排查指南

## 🔍 问题概述

如果您配置了 Resend API 但无法成功发送邮件，请按照以下步骤逐一排查。

---

## ✅ 步骤 1：验证环境变量配置

### 1.1 检查 `.env.local` 或 Zeabur 环境变量

确保以下环境变量已正确配置：

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=noreply@aat.ee
```

### 1.2 获取 Resend API Key

1. 登录 [Resend Dashboard](https://resend.com/api-keys)
2. 点击 **"Create API Key"**
3. 选择权限：
   - **Development**: `re_dev_xxxxxx` (测试用)
   - **Production**: `re_xxxxxx` (生产环境)
4. 复制 API Key 并保存到环境变量

**⚠️ 重要提示：**
- API Key 只会显示一次，务必立即保存
- 不要将 API Key 提交到 Git 仓库

---

## ✅ 步骤 2：验证发件人域名

这是 **最常见的失败原因**！

### 2.1 域名验证状态检查

1. 前往 [Resend Domains](https://resend.com/domains)
2. 检查您的域名 (`aat.ee`) 的状态：
   - ✅ **Verified** (已验证) - 可以发送邮件
   - ⚠️ **Pending** (待验证) - 需要添加 DNS 记录
   - ❌ **Not Added** (未添加) - 需要先添加域名

### 2.2 添加和验证域名

#### **方式 1：使用自己的域名（推荐）**

1. 在 Resend Dashboard 点击 **"Add Domain"**
2. 输入您的域名：`aat.ee`
3. Resend 会提供 DNS 记录，需要添加到域名的 DNS 设置中：

```
类型: TXT
名称: @
值: resend-verify=xxxxxxxxxxxxx

类型: MX
名称: @
优先级: 10
值: feedback-smtp.resend.com

类型: TXT
名称: @
值: v=spf1 include:_spf.resend.com ~all

类型: TXT
名称: resend._domainkey
值: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ...
```

4. 在您的 DNS 提供商（Cloudflare、Namecheap、GoDaddy 等）添加这些记录
5. 等待 DNS 传播（通常 5-30 分钟）
6. 返回 Resend Dashboard 点击 **"Verify"**

#### **方式 2：使用 Resend 提供的测试域名（仅开发环境）**

如果您还没有准备好验证自己的域名，可以临时使用 Resend 的测试域名：

```bash
RESEND_FROM_EMAIL=onboarding@resend.dev
```

**注意**：`onboarding@resend.dev` 只能在开发环境使用，且有限制：
- 只能发送到您的注册邮箱
- 每天有发送限额

---

## ✅ 步骤 3：检查发件人邮箱格式

### 正确格式

```bash
# ✅ 推荐格式（带显示名称）
RESEND_FROM_EMAIL=aat.ee <noreply@aat.ee>

# ✅ 简单格式
RESEND_FROM_EMAIL=noreply@aat.ee

# ✅ 使用 Resend 测试域名（开发环境）
RESEND_FROM_EMAIL=onboarding@resend.dev
```

### 错误格式

```bash
# ❌ 域名未验证
RESEND_FROM_EMAIL=noreply@unverified-domain.com

# ❌ 使用个人邮箱（Gmail、Outlook 等）
RESEND_FROM_EMAIL=yourname@gmail.com

# ❌ 格式错误
RESEND_FROM_EMAIL=<noreply@aat.ee>
```

---

## ✅ 步骤 4：测试邮件发送

### 4.1 本地测试

创建测试脚本 `scripts/test-email.ts`：

```typescript
import { sendEmail } from "@/lib/email"

async function testEmail() {
  try {
    console.log("🚀 Testing email with Resend...")
    console.log("From:", process.env.RESEND_FROM_EMAIL)
    console.log("API Key:", process.env.RESEND_API_KEY?.substring(0, 10) + "...")

    const result = await sendEmail({
      to: "your-test-email@example.com", // 替换为您的测试邮箱
      subject: "Test Email from aat.ee",
      html: "<h1>Hello!</h1><p>This is a test email from aat.ee.</p>",
    })

    console.log("✅ Email sent successfully!")
    console.log("Response:", result)
  } catch (error) {
    console.error("❌ Email sending failed:")
    console.error(error)
  }
}

testEmail()
```

运行测试：

```bash
# 确保环境变量已设置
export RESEND_API_KEY="re_your_api_key"
export RESEND_FROM_EMAIL="noreply@aat.ee"

# 运行测试
bun tsx scripts/test-email.ts
```

### 4.2 在 Zeabur 部署环境测试

1. 在 Zeabur Dashboard 设置环境变量：
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   RESEND_FROM_EMAIL=noreply@aat.ee
   ```

2. 重新部署应用

3. 尝试在网站上触发邮件发送（注册新账号）

4. 查看 Zeabur 日志：
   ```bash
   # 在 Zeabur Terminal 或 Dashboard 查看日志
   # 搜索 "Email sent successfully" 或 "Failed to send email"
   ```

---

## 🐛 常见错误和解决方案

### 错误 1: `API key is invalid`

**原因**：API Key 不正确或已过期

**解决方案**：
1. 检查环境变量 `RESEND_API_KEY` 是否正确
2. 确保 API Key 格式正确（`re_` 或 `re_dev_` 开头）
3. 在 Resend Dashboard 重新生成 API Key

---

### 错误 2: `Domain is not verified`

**原因**：发件人域名未验证

**解决方案**：
1. 前往 [Resend Domains](https://resend.com/domains)
2. 检查域名验证状态
3. 如果是 "Pending"，检查 DNS 记录是否正确添加
4. 临时使用 `onboarding@resend.dev` 进行测试

---

### 错误 3: `From email address does not match verified domain`

**原因**：发件人邮箱的域名与 Resend 中验证的域名不匹配

**示例问题**：
- Resend 中验证的域名：`aat.ee`
- 环境变量设置：`RESEND_FROM_EMAIL=noreply@different-domain.com`

**解决方案**：
1. 确保 `RESEND_FROM_EMAIL` 使用的域名已在 Resend 中验证
2. 或者改为使用 `onboarding@resend.dev`

---

### 错误 4: `Rate limit exceeded`

**原因**：超过了免费计划的发送限额

**免费计划限制**：
- **3,000 封/月**
- **100 封/天**（测试域名）

**解决方案**：
1. 检查 [Resend Usage](https://resend.com/overview)
2. 升级到付费计划
3. 等待限额重置（每月 1 号）

---

### 错误 5: `Missing required environment variable`

**原因**：环境变量未设置

**解决方案**：

#### 本地开发
创建 `.env.local` 文件：
```bash
RESEND_API_KEY=re_your_api_key
RESEND_FROM_EMAIL=noreply@aat.ee
```

#### Zeabur 部署
1. 登录 Zeabur Dashboard
2. 进入您的服务
3. 点击 **"Variables"** 标签
4. 添加环境变量
5. 点击 **"Redeploy"** 重新部署

---

## 🔍 调试技巧

### 1. 启用详细日志

查看 `/lib/email.ts` 中的日志输出：

```typescript
console.log("Email sent successfully:", { to, subject, messageId: data?.id })
console.error("Failed to send email:", error)
console.error("Email details:", { from: fromEmail, to, subject })
```

### 2. 检查 Resend Dashboard

1. 前往 [Resend Logs](https://resend.com/logs)
2. 查看最近的邮件发送记录
3. 检查状态：
   - ✅ **Delivered** (已投递)
   - ⏳ **Queued** (队列中)
   - ❌ **Failed** (失败) - 点击查看详细错误信息

### 3. 测试 DNS 记录

使用在线工具验证 DNS 配置：
- [MXToolbox](https://mxtoolbox.com/SuperTool.aspx)
- [DNSChecker](https://dnschecker.org/)

---

## 📋 完整配置检查清单

- [ ] ✅ `RESEND_API_KEY` 已正确设置
- [ ] ✅ API Key 格式正确（`re_` 或 `re_dev_` 开头）
- [ ] ✅ `RESEND_FROM_EMAIL` 已设置
- [ ] ✅ 发件人域名已在 Resend 中验证（或使用 `onboarding@resend.dev`）
- [ ] ✅ DNS 记录已正确添加（SPF、DKIM、MX）
- [ ] ✅ 环境变量在部署平台（Zeabur）已配置
- [ ] ✅ 应用已重新部署
- [ ] ✅ 免费额度未超限（3,000 封/月）

---

## 🚀 快速修复（最常见问题）

如果您不确定问题在哪里，按以下步骤快速修复：

### 方案 A：使用 Resend 测试域名（最快）

```bash
# 在 Zeabur 或 .env.local 设置
RESEND_API_KEY=re_your_actual_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev
```

**优点**：无需验证域名，立即可用  
**缺点**：只能发送到您的注册邮箱，有发送限制

---

### 方案 B：验证自己的域名（推荐）

1. **获取 DNS 记录**：[Resend Domains](https://resend.com/domains)
2. **添加到 DNS**：在 Cloudflare/Namecheap 等添加 TXT、MX、DKIM 记录
3. **等待验证**：5-30 分钟
4. **配置环境变量**：
   ```bash
   RESEND_API_KEY=re_your_actual_api_key
   RESEND_FROM_EMAIL=noreply@aat.ee
   ```
5. **重新部署**

---

## 📞 获取帮助

如果问题仍未解决：

1. **查看 Resend 文档**：https://resend.com/docs
2. **检查 Resend 状态**：https://status.resend.com/
3. **联系 Resend 支持**：support@resend.com
4. **查看 Zeabur 日志**：检查是否有其他错误信息

---

**祝您邮件发送成功！** 📧✨

