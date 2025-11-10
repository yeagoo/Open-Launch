# ✅ Zeabur 环境变量检查清单

## 🔍 必须设置的 Resend 环境变量

在 Zeabur Dashboard → Variables 中，你需要设置**两个**环境变量：

```bash
# 1. API Key（必需）
RESEND_API_KEY=re_4Rr6QjN...  # 你的完整 API Key

# 2. 发件人邮箱（必需）
RESEND_FROM_EMAIL=send@aat.ee
```

⚠️ **重要**: 两个都必须设置！

---

## 📝 在 Zeabur 中设置环境变量的步骤

1. 登录 [Zeabur Dashboard](https://zeabur.com)
2. 进入你的项目
3. 选择 **Open-Launch** 服务
4. 点击顶部的 **"Variables"** 标签
5. 点击 **"Add Variable"**
6. 逐个添加：

   - Key: `RESEND_API_KEY`
     Value: `re_4Rr6QjN...`（你的完整 API Key）
   - Key: `RESEND_FROM_EMAIL`
     Value: `send@aat.ee`

7. ⚠️ **关键步骤**: 点击 **"Redeploy"** 按钮（不是 "Restart"）

   - **Redeploy** = 重新构建和部署（会加载新的环境变量）
   - **Restart** = 只重启容器（不会重新加载环境变量）

8. 等待部署完成（约 2-3 分钟）

---

## 🧪 验证环境变量是否生效

### 方法 1: 在 Zeabur Terminal 中检查

1. 在 Zeabur Dashboard 中，点击 **"Terminal"** 标签
2. 运行以下命令：

```bash
# 检查 API Key（显示前 10 个字符）
echo $RESEND_API_KEY | cut -c1-10

# 检查发件人邮箱
echo $RESEND_FROM_EMAIL
```

**期望输出**:

```
re_4Rr6QjN
send@aat.ee
```

如果显示空白，说明环境变量未正确设置。

---

### 方法 2: 查看部署日志

1. 点击 **"Logs"** 标签
2. 在网站上尝试注册新账号
3. 实时查看日志，搜索以下关键词：
   - ✅ `Sending verification email` - 说明邮件函数被调用
   - ✅ `Email sent successfully` - 说明邮件发送成功
   - ❌ `Failed to send email` - 说明发送失败
   - ❌ `Missing API key` - 说明 API Key 未设置

---

## 🐛 常见问题

### 问题 1: 我只设置了 `RESEND_FROM_EMAIL`，没设置 `RESEND_API_KEY`

**症状**: 日志显示 `Missing API key`

**解决方案**:

- 添加 `RESEND_API_KEY` 环境变量
- **Redeploy** 应用

---

### 问题 2: 我点了 "Restart" 而不是 "Redeploy"

**症状**: 环境变量在 Terminal 中显示为空

**解决方案**:

- 点击 **"Redeploy"** 按钮
- 等待完整的重新构建

---

### 问题 3: 环境变量已设置但日志中没有任何邮件相关信息

**症状**: 注册成功但没有 `Sending verification email` 日志

**可能原因**:

1. `requireEmailVerification` 可能被设置为 `false`
2. Better Auth 邮件发送函数有异常但被静默吞掉

**解决方案**: 添加调试日志（见下一节）

---

## 🔧 添加详细调试日志

为了更好地诊断问题，我们可以在 Better Auth 配置中添加详细日志。

### 修改 `lib/auth.ts`

在 `emailVerification` 配置中添加详细日志：

```typescript
emailVerification: {
  sendVerificationEmail: async ({ user, url }) => {
    // ===== 开始调试 =====
    console.log("🔍 [DEBUG] Email verification triggered")
    console.log("   User:", user.email)
    console.log("   API Key:", process.env.RESEND_API_KEY ? "✅ Set" : "❌ Missing")
    console.log("   From:", process.env.RESEND_FROM_EMAIL || "⚠️ Not set (will use default)")
    console.log("   URL:", url)
    // ===== 结束调试 =====

    const html = `
      <p>Hello ${user.name},</p>
      <p>Click the link below to verify your email address:</p>
      <a href="${url}" style="padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px;">
        Verify Email
      </a>
      <p>Or copy and paste this URL into your browser:</p>
      <p>${url}</p>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account, please ignore this email.</p>
    `

    try {
      console.log("📧 [DEBUG] Calling sendEmail function...")

      const result = await sendEmail({
        to: user.email,
        subject: "Verify your email address",
        html,
      })

      console.log("✅ [DEBUG] Email sent successfully:", result)
    } catch (error) {
      console.error("❌ [DEBUG] Email sending failed:", error)
      throw error // 重要：重新抛出错误
    }
  },
  expiresIn: 86400,
},
```

---

## 📊 完整诊断流程

### 步骤 1: 确认环境变量

在 Zeabur Variables 标签中，确认有以下两个变量：

- [ ] `RESEND_API_KEY`
- [ ] `RESEND_FROM_EMAIL`

### 步骤 2: Redeploy

- [ ] 点击 **"Redeploy"** 按钮
- [ ] 等待部署完成

### 步骤 3: 验证环境变量

在 Zeabur Terminal 中运行：

```bash
echo $RESEND_API_KEY | cut -c1-10
echo $RESEND_FROM_EMAIL
```

- [ ] API Key 显示 `re_4Rr6QjN`
- [ ] 邮箱显示 `send@aat.ee`

### 步骤 4: 测试注册

1. 在网站上注册新账号
2. 立即查看 Zeabur Logs 标签
3. 查找以下日志：

**期望看到的日志**:

```
🔍 [DEBUG] Email verification triggered
   User: test@example.com
   API Key: ✅ Set
   From: send@aat.ee
   URL: https://...
📧 [DEBUG] Calling sendEmail function...
Email sent successfully: { to: 'test@example.com', ... }
✅ [DEBUG] Email sent successfully: { success: true, ... }
```

**如果看到错误**:

```
❌ [DEBUG] API Key: ❌ Missing
```

→ 环境变量未设置或未生效，需要 Redeploy

```
❌ [DEBUG] Email sending failed: Error: Domain is not verified
```

→ 域名验证问题，检查 Resend Domains

```
❌ [DEBUG] Email sending failed: Error: Missing API key
```

→ API Key 未正确设置

---

## 🎯 快速自检

运行这个命令来检查所有环境变量：

```bash
# 在 Zeabur Terminal 中运行
echo "=== Resend Configuration Check ==="
echo "RESEND_API_KEY: ${RESEND_API_KEY:0:10}..."
echo "RESEND_FROM_EMAIL: $RESEND_FROM_EMAIL"
echo "=================================="
```

**期望输出**:

```
=== Resend Configuration Check ===
RESEND_API_KEY: re_4Rr6QjN...
RESEND_FROM_EMAIL: send@aat.ee
==================================
```

---

## 📞 仍然无法解决？

请提供以下信息：

1. **Zeabur Terminal 输出**:

   ```bash
   echo $RESEND_API_KEY | cut -c1-10
   echo $RESEND_FROM_EMAIL
   ```

2. **Zeabur Logs 输出**:

   - 注册时的完整日志
   - 特别是包含 "Email" 或 "Resend" 的行

3. **Resend Dashboard**:
   - 访问 https://resend.com/logs
   - 截图最近的发送记录

有了这些信息，我们就能精确定位问题了！
