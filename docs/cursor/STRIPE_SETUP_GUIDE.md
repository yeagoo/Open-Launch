# Stripe 支付配置完整指南

本指南将帮助您配置 Stripe 支付系统，包括获取所有必需的 API 密钥。

## 📋 需要配置的环境变量

```env
STRIPE_SECRET_KEY=sk_test_xxxxx                      # Stripe 密钥
STRIPE_WEBHOOK_SECRET=whsec_xxxxx                    # Webhook 签名密钥
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx    # 公开可发布密钥
NEXT_PUBLIC_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/xxxxx  # 支付链接
```

---

## 🚀 第一步：注册 Stripe 账号

1. 访问 [Stripe 官网](https://stripe.com/)
2. 点击 "Start now" 或 "注册"
3. 填写邮箱、姓名和密码
4. 验证邮箱地址
5. 完成账号设置

---

## 🔑 第二步：获取 API 密钥

### 1. STRIPE_SECRET_KEY 和 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

这两个密钥可以在 Stripe Dashboard 中找到：

**步骤：**

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com/)

2. 点击右上角的 **"开发者"** 或 **"Developers"**

3. 在左侧菜单中点击 **"API keys"** 或 **"API 密钥"**

4. 您会看到两个密钥：

   **测试环境密钥（用于开发）：**
   ```
   Publishable key（可发布密钥）: pk_test_xxxxxxxxxxxxxxxx
   Secret key（密钥）:           sk_test_xxxxxxxxxxxxxxxx
   ```

   **生产环境密钥（用于上线）：**
   ```
   Publishable key: pk_live_xxxxxxxxxxxxxxxx
   Secret key:      sk_live_xxxxxxxxxxxxxxxx
   ```

5. 点击 "Reveal test key" 或 "显示测试密钥" 查看完整密钥

6. 复制密钥到您的 `.env` 文件：

```env
# 测试环境（开发用）
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE

# 生产环境（上线用）
# STRIPE_SECRET_KEY=sk_live_YOUR_SECRET_KEY_HERE
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_PUBLISHABLE_KEY_HERE
```

⚠️ **重要提示**：
- `Secret key` 必须保密，不能暴露在前端代码中
- `Publishable key` 可以在前端使用
- 开发时使用 `test` 模式，上线时切换到 `live` 模式

---

## 🔗 第三步：获取 STRIPE_WEBHOOK_SECRET

Webhook 密钥用于验证来自 Stripe 的事件通知的真实性。

### 方法一：本地开发使用 Stripe CLI（推荐）

**1. 安装 Stripe CLI**

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**
```bash
# 下载最新版本
wget https://github.com/stripe/stripe-cli/releases/download/v1.19.4/stripe_1.19.4_linux_x86_64.tar.gz

# 解压
tar -xvf stripe_1.19.4_linux_x86_64.tar.gz

# 移动到系统路径
sudo mv stripe /usr/local/bin/
```

**Windows:**
```powershell
# 使用 Scoop
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

**2. 登录 Stripe CLI**
```bash
stripe login
```
会打开浏览器，登录您的 Stripe 账号并授权

**3. 转发 Webhook 到本地**
```bash
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
```

**4. 获取 Webhook 签名密钥**

运行上述命令后，终端会显示：
```
> Ready! You are using Stripe API Version [2024-xx-xx]. Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxx (^C to quit)
```

**5. 复制密钥到 `.env`：**
```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

**6. 保持 Stripe CLI 运行**

在开发时，需要保持 `stripe listen` 命令运行，以便接收 Webhook 事件。

---

### 方法二：生产环境配置 Webhook

**1. 登录 Stripe Dashboard**

访问 [Stripe Dashboard](https://dashboard.stripe.com/)

**2. 进入 Webhooks 设置**

- 点击 **"开发者"** > **"Webhooks"**
- 或直接访问：https://dashboard.stripe.com/webhooks

**3. 添加新的 Webhook 端点**

- 点击 **"+ Add endpoint"** 或 **"添加端点"**

**4. 配置 Webhook**

填写以下信息：

**Endpoint URL（端点 URL）：**
```
https://yourdomain.com/api/auth/stripe/webhook
```

**描述（可选）：**
```
Open Launch - Stripe Payment Webhook
```

**监听的事件（Events to send）：**

选择以下事件（根据项目需要）：

**必需事件：**
- ✅ `checkout.session.completed` - 支付成功
- ✅ `checkout.session.async_payment_succeeded` - 异步支付成功
- ✅ `checkout.session.async_payment_failed` - 异步支付失败
- ✅ `customer.created` - 客户创建
- ✅ `customer.updated` - 客户更新

**推荐事件：**
- `payment_intent.succeeded` - 支付意图成功
- `payment_intent.payment_failed` - 支付失败
- `invoice.paid` - 发票已支付
- `invoice.payment_failed` - 发票支付失败

或者直接选择 **"Select all events"** 接收所有事件。

**5. 点击 "Add endpoint" 创建**

**6. 获取 Webhook 签名密钥**

创建成功后，在 Webhook 详情页面：
- 点击 **"Signing secret"** 或 **"签名密钥"**
- 点击 **"Reveal"** 或 **"显示"**
- 复制以 `whsec_` 开头的密钥

**7. 配置到 `.env`：**
```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

---

## 💳 第四步：创建 Payment Link（支付链接）

Payment Link 是最简单的收款方式，无需编写支付表单代码。

**1. 进入 Payment Links**

- 在 Stripe Dashboard 中，点击 **"产品"** > **"Payment Links"**
- 或访问：https://dashboard.stripe.com/payment-links

**2. 创建新的 Payment Link**

- 点击 **"+ New"** 或 **"创建"**

**3. 配置产品**

**产品信息：**
- **名称**: `Premium Launch`
- **描述**: `Upgrade your project launch to premium`
- **价格**: 例如 `$10.00 USD`（根据您的定价）
- **计费方式**: `One time`（一次性）或 `Recurring`（订阅）

**4. 配置 Payment Link 设置**

**Payment method types（支付方式）：**
- ✅ Card（信用卡/借记卡）
- ✅ Alipay（支付宝）- 可选
- ✅ WeChat Pay（微信支付）- 可选

**After payment（支付后）：**
- 选择 **"Redirect to your website"**
- 填入成功页面 URL：
  ```
  https://yourdomain.com/payment/success?session_id={CHECKOUT_SESSION_ID}
  ```

**Collect customer information（收集客户信息）：**
- ✅ Email address（邮箱地址）

**Allow promotion codes（允许促销码）：**
- 根据需要选择

**5. 创建并获取链接**

- 点击 **"Create link"** 创建
- 复制生成的链接，格式类似：
  ```
  https://buy.stripe.com/test_xxxxxxxxxxxxx
  ```

**6. 配置到 `.env`：**
```env
NEXT_PUBLIC_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/test_xxxxxxxxxxxxx
```

**7. 配置 Client Reference ID（重要）**

在 Payment Link 设置中启用 **"Client reference ID"**，这样可以在 URL 中传递项目 ID：

```
https://buy.stripe.com/test_xxxxx?client_reference_id=PROJECT_ID
```

项目代码会自动在 URL 中添加 `client_reference_id` 参数。

---

## 🧪 测试 Stripe 集成

### 1. 测试支付

使用 Stripe 提供的测试卡号：

**成功的支付：**
```
卡号: 4242 4242 4242 4242
日期: 任意未来日期（例如 12/34）
CVC: 任意 3 位数字（例如 123）
邮编: 任意邮编
```

**需要 3D 验证的支付：**
```
卡号: 4000 0025 0000 3155
```

**失败的支付：**
```
卡号: 4000 0000 0000 0002
```

更多测试卡号：https://stripe.com/docs/testing

### 2. 测试 Webhook

**使用 Stripe CLI：**
```bash
# 触发测试事件
stripe trigger checkout.session.completed
```

**查看 Webhook 日志：**
- 访问 Stripe Dashboard > Developers > Webhooks
- 点击您的 Webhook 端点
- 查看 "Recent deliveries"

---

## 📊 验证配置

确保以下环境变量都已正确配置：

```env
# ✅ API 密钥（从 Developers > API keys 获取）
STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE

# ✅ Webhook 密钥（从本地 CLI 或 Webhook 端点获取）
STRIPE_WEBHOOK_SECRET=whsec_xxxxx...

# ✅ Payment Link（创建 Payment Link 后获取）
NEXT_PUBLIC_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/test_xxxxx
```

---

## 🚨 常见问题

### 1. Webhook 签名验证失败

**错误信息：**
```
Error: No signatures found matching the expected signature for payload
```

**解决方案：**
- 确保 `STRIPE_WEBHOOK_SECRET` 正确
- 本地开发时确保 `stripe listen` 正在运行
- 检查 Webhook URL 是否正确配置

### 2. 支付成功但未更新数据库

**检查项：**
- Webhook 端点是否可访问
- Webhook 事件是否正确处理
- 查看服务器日志

### 3. 测试卡被拒绝

**解决方案：**
- 确认使用的是测试环境密钥（`sk_test_`）
- 使用 Stripe 官方测试卡号
- 检查 Stripe Dashboard 中的错误信息

---

## 🔒 安全最佳实践

1. ✅ **永远不要将 Secret Key 暴露在前端代码中**
2. ✅ **使用环境变量存储所有密钥**
3. ✅ **生产环境使用 live 模式密钥**
4. ✅ **验证所有 Webhook 签名**
5. ✅ **定期轮换 API 密钥**
6. ✅ **限制 API 密钥权限**
7. ✅ **启用 Stripe Radar 防欺诈**

---

## 📖 项目中的 Stripe 集成

### Webhook 处理

项目在以下路径处理 Stripe Webhook：

```
/app/api/auth/stripe/webhook/route.ts
```

### 支付流程

1. 用户在提交项目时选择 Premium Launch
2. 项目被创建并保存到数据库
3. 用户被重定向到 Stripe Payment Link
4. 用户完成支付
5. Stripe 发送 Webhook 到服务器
6. 服务器更新项目的付费状态
7. 用户被重定向回成功页面

---

## 🔗 相关资源

- [Stripe 文档](https://stripe.com/docs)
- [Stripe API 参考](https://stripe.com/docs/api)
- [Stripe CLI 文档](https://stripe.com/docs/stripe-cli)
- [Webhook 测试指南](https://stripe.com/docs/webhooks/test)
- [测试卡号列表](https://stripe.com/docs/testing)

---

## 📞 需要帮助？

如果遇到问题：
1. 查看 [Stripe 文档](https://stripe.com/docs)
2. 访问 [Stripe 支持中心](https://support.stripe.com/)
3. 查看项目的 [GitHub Issues](https://github.com/drdruide/open-launch/issues)

---

**祝您配置顺利！** 🎉


