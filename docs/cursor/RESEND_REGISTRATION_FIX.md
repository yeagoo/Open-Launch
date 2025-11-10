# 🔧 用户注册无法收到验证邮件 - 完整解决方案

## ✅ 已确认的事项

通过测试脚本确认：

- ✅ Resend API Key 配置正确
- ✅ 发件人域名 `send@aat.ee` 已验证
- ✅ Resend 服务正常工作
- ✅ 邮件可以成功发送

**测试成功但注册失败 = 环境变量加载问题**

---

## 🎯 解决方案

### 方案 A: 本地开发环境 (localhost:3000)

#### 步骤 1: 确认 `.env.local` 配置

确保 `.env.local` 文件存在并包含：

```bash
RESEND_API_KEY=re_4Rr6QjN...  # 你的实际 API Key
RESEND_FROM_EMAIL=send@aat.ee
```

#### 步骤 2: 重启 Next.js 开发服务器

**⚠️ 重要**: Next.js 只在启动时加载环境变量，修改后必须重启！

```bash
# 停止当前运行的服务器 (Ctrl+C)

# 重新启动
bun run dev
```

#### 步骤 3: 清除缓存（如果问题依然存在）

```bash
# 清除 Next.js 缓存
rm -rf .next

# 重新安装依赖（可选）
rm -rf node_modules
bun install

# 重新启动
bun run dev
```

#### 步骤 4: 测试注册

1. 访问 `http://localhost:3000`
2. 尝试注册新账号
3. 查看终端日志，应该看到：
   ```
   📧 Sending verification email to: test@example.com
   Email sent successfully: { to: 'test@example.com', ... }
   ```

---

### 方案 B: Zeabur 生产环境

#### 步骤 1: 在 Zeabur 添加环境变量

1. 登录 [Zeabur Dashboard](https://zeabur.com)
2. 进入你的项目
3. 选择 **Open-Launch** 服务
4. 点击 **"Variables"** 标签
5. 添加以下环境变量：

```bash
RESEND_API_KEY=re_4Rr6QjN...  # 你的实际 API Key
RESEND_FROM_EMAIL=send@aat.ee
```

#### 步骤 2: 重新部署

添加环境变量后，**必须重新部署**：

1. 点击 **"Redeploy"** 按钮
2. 等待部署完成（约 2-3 分钟）

#### 步骤 3: 验证环境变量

在 Zeabur Terminal 中检查：

```bash
# 打开 Terminal 标签，运行：
echo $RESEND_API_KEY | cut -c1-10
# 应该输出: re_4Rr6QjN

echo $RESEND_FROM_EMAIL
# 应该输出: send@aat.ee
```

#### 步骤 4: 查看日志

1. 在网站上注册新账号
2. 在 Zeabur 的 **"Logs"** 标签中查看实时日志
3. 搜索关键词：
   - `Sending verification email`
   - `Email sent successfully`
   - `Failed to send email`

---

## 🐛 常见问题排查

### 问题 1: 本地开发看不到日志

**原因**: Better Auth 的邮件发送可能在后台执行

**解决方案**: 在 `lib/auth.ts` 中添加更多日志

```typescript
emailVerification: {
  sendVerificationEmail: async ({ user, url }) => {
    console.log("📧 [DEBUG] Sending verification email")
    console.log("   To:", user.email)
    console.log("   API Key:", process.env.RESEND_API_KEY?.substring(0, 10) + "...")
    console.log("   From:", process.env.RESEND_FROM_EMAIL)

    const html = `...`

    try {
      const result = await sendEmail({
        to: user.email,
        subject: "Verify your email address",
        html,
      })
      console.log("✅ [DEBUG] Email sent successfully:", result)
    } catch (error) {
      console.error("❌ [DEBUG] Email failed:", error)
      throw error
    }
  },
},
```

---

### 问题 2: Zeabur 环境变量未生效

**原因**: 环境变量在构建时被缓存

**解决方案**:

1. 删除并重新添加环境变量
2. 点击 **"Redeploy"** (不是重启)
3. 等待完整的重新构建和部署

---

### 问题 3: 邮件被发送但用户收不到

**可能原因**:

- 邮件进入垃圾箱
- 邮箱服务商拦截
- DNS 配置问题

**检查步骤**:

1. **查看 Resend 日志**:

   - 访问 https://resend.com/logs
   - 查找对应的邮件 ID
   - 检查状态：
     - ✅ **Delivered** - 已投递（检查垃圾箱）
     - ⏳ **Queued** - 队列中（等待）
     - ❌ **Failed** - 失败（查看错误信息）

2. **测试不同邮箱**:

   ```bash
   # Gmail
   ./scripts/run-test-email.sh your-gmail@gmail.com

   # Outlook
   ./scripts/run-test-email.sh your-outlook@outlook.com
   ```

3. **检查 SPF/DKIM 配置**:
   - 访问 https://resend.com/domains
   - 确认所有 DNS 记录都是 ✅ Verified
   - 使用工具检查: https://mxtoolbox.com/spf.aspx

---

### 问题 4: 环境变量正确但仍然失败

**检查 Better Auth 配置**:

```typescript
// lib/auth.ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: true,  // ✅ 必须为 true
  // ...
},
```

**检查 Resend 初始化**:

```typescript
// lib/email.ts
const resend = new Resend(process.env.RESEND_API_KEY)

// 添加调试
console.log(
  "Resend initialized with API Key:",
  process.env.RESEND_API_KEY?.substring(0, 10) + "...",
)
```

---

## 📊 完整测试流程

### 1. 测试邮件发送

```bash
# 使用包装脚本（推荐）
./scripts/run-test-email.sh your-email@example.com

# 或手动加载环境变量
source .env.local && bun tsx scripts/test-resend-email.ts your-email@example.com
```

### 2. 测试注册流程

#### 本地开发：

```bash
# 重启服务器
bun run dev

# 在浏览器注册新账号
# 查看终端日志
```

#### Zeabur 部署：

1. 确认环境变量已设置
2. 重新部署
3. 在网站注册新账号
4. 查看 Zeabur Logs

---

## ✅ 验证清单

- [ ] ✅ `.env.local` 包含 `RESEND_API_KEY` 和 `RESEND_FROM_EMAIL`
- [ ] ✅ API Key 格式正确（`re_` 开头）
- [ ] ✅ 域名已在 Resend 中验证
- [ ] ✅ DNS 记录（SPF, DKIM, MX）已添加
- [ ] ✅ 测试脚本发送成功
- [ ] ✅ Next.js 开发服务器已重启
- [ ] ✅ Zeabur 环境变量已设置
- [ ] ✅ Zeabur 应用已重新部署
- [ ] ✅ 终端/日志显示邮件发送成功
- [ ] ✅ Resend Dashboard 显示邮件已投递

---

## 🚀 快速修复命令

```bash
# 1. 测试邮件发送
./scripts/run-test-email.sh your-email@example.com

# 2. 清除缓存并重启（本地）
rm -rf .next && bun run dev

# 3. 查看实时日志（添加调试信息）
# 编辑 lib/auth.ts 添加 console.log

# 4. 在 Zeabur 查看日志
# Dashboard > 你的服务 > Logs 标签
```

---

## 📞 仍然无法解决？

如果完成所有步骤后问题依然存在：

1. **收集信息**:

   ```bash
   # 检查环境变量
   echo $RESEND_API_KEY | cut -c1-10
   echo $RESEND_FROM_EMAIL

   # 查看日志
   # 复制终端或 Zeabur 的完整错误日志
   ```

2. **检查 Resend 状态**:

   - 服务状态: https://status.resend.com/
   - 发送日志: https://resend.com/logs
   - 用量统计: https://resend.com/overview

3. **联系支持**:
   - Resend: support@resend.com
   - Better Auth: https://github.com/better-auth/better-auth/issues

---

**祝你成功收到验证邮件！** 📧✨
