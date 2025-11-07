# Stripe Webhook 端点配置指南

## 📍 Webhook 端点 URL

根据项目的路由配置，Stripe Webhook 端点 URL 为：

```
/api/auth/stripe/webhook
```

---

## 🌐 完整 URL 配置

### 本地开发环境

```
http://localhost:3000/api/auth/stripe/webhook
```

⚠️ **注意**: 本地开发时，Stripe 无法直接访问 localhost，需要使用 **Stripe CLI** 进行转发。

### 生产环境

```
https://yourdomain.com/api/auth/stripe/webhook
```

将 `yourdomain.com` 替换为您的实际域名，例如：
- `https://open-launch.com/api/auth/stripe/webhook`
- `https://www.yoursite.com/api/auth/stripe/webhook`
- `https://yourapp.vercel.app/api/auth/stripe/webhook`

---

## 🔧 本地开发配置（推荐方式）

本地开发时，使用 Stripe CLI 将 Webhook 转发到本地服务器：

### 步骤 1: 安装 Stripe CLI

**macOS:**
```bash
brew install stripe/stripe-cli/stripe
```

**Linux:**
```bash
# 下载最新版本
wget https://github.com/stripe/stripe-cli/releases/latest/download/stripe_linux_x86_64.tar.gz

# 解压并安装
tar -xvf stripe_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin/
```

**Windows:**
```powershell
# 使用 Scoop
scoop bucket add stripe https://github.com/stripe/scoop-stripe-cli.git
scoop install stripe
```

或者从 [GitHub Releases](https://github.com/stripe/stripe-cli/releases) 下载对应版本。

### 步骤 2: 登录 Stripe CLI

```bash
stripe login
```

这会打开浏览器，让您登录并授权 Stripe CLI。

### 步骤 3: 启动 Webhook 转发

```bash
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
```

✅ **成功后会显示：**
```
> Ready! You are using Stripe API Version [2024-xx-xx]. 
> Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxxxxx (^C to quit)
```

### 步骤 4: 复制 Webhook 密钥

将终端显示的 `whsec_` 开头的密钥复制到您的 `.env` 文件：

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

### 步骤 5: 保持运行

在开发期间，需要保持 `stripe listen` 命令运行。建议在单独的终端窗口中运行。

---

## 🚀 生产环境配置

### 步骤 1: 登录 Stripe Dashboard

访问 [Stripe Dashboard](https://dashboard.stripe.com/)

### 步骤 2: 进入 Webhooks 设置

- 点击左侧菜单 **"开发者"** (Developers)
- 点击 **"Webhooks"**
- 或直接访问: https://dashboard.stripe.com/webhooks

### 步骤 3: 添加端点

点击右上角的 **"+ Add endpoint"** 或 **"添加端点"**

### 步骤 4: 配置端点信息

**Endpoint URL (端点 URL):**
```
https://yourdomain.com/api/auth/stripe/webhook
```

例如：
```
https://open-launch.com/api/auth/stripe/webhook
https://www.mysite.com/api/auth/stripe/webhook
https://myapp.vercel.app/api/auth/stripe/webhook
```

**Description (描述, 可选):**
```
Open Launch - Payment Webhook
```

**Listen to (监听事件):**

选择 **"Events on your account"** (账户上的事件)

### 步骤 5: 选择要监听的事件

项目需要监听以下事件：

#### ✅ 必需事件：

- **`checkout.session.completed`** - 支付会话完成
- **`checkout.session.expired`** - 支付会话过期

#### 📋 推荐事件（可选）：

- `checkout.session.async_payment_succeeded` - 异步支付成功
- `checkout.session.async_payment_failed` - 异步支付失败
- `payment_intent.succeeded` - 支付意图成功
- `payment_intent.payment_failed` - 支付失败

**快速选择方式：**
- 点击 **"Select events"**
- 搜索 `checkout.session`
- 选择相关事件

或者选择 **"Select all events"** 接收所有事件（不推荐，会增加处理负担）

### 步骤 6: 创建端点

点击底部的 **"Add endpoint"** 按钮创建

### 步骤 7: 获取 Webhook 签名密钥

创建成功后，在 Webhook 详情页面：

1. 找到 **"Signing secret"** (签名密钥) 部分
2. 点击 **"Reveal"** 或 **"显示"** 按钮
3. 复制以 `whsec_` 开头的密钥

### 步骤 8: 配置环境变量

将获取的密钥添加到生产环境的环境变量中：

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

**如果使用 Vercel:**
1. 进入项目设置 (Project Settings)
2. 选择 Environment Variables (环境变量)
3. 添加 `STRIPE_WEBHOOK_SECRET` 并粘贴密钥
4. 选择 Production 环境
5. 保存并重新部署

---

## 🧪 测试 Webhook

### 本地测试

**方法 1: 使用 Stripe CLI 触发测试事件**

```bash
# 触发支付成功事件
stripe trigger checkout.session.completed

# 触发支付过期事件
stripe trigger checkout.session.expired
```

**方法 2: 实际支付测试**

1. 启动开发服务器: `bun dev` 或 `npm run dev`
2. 确保 `stripe listen` 正在运行
3. 提交一个项目并选择 Premium Launch
4. 使用测试卡号完成支付: `4242 4242 4242 4242`
5. 查看终端中的 Webhook 日志

### 生产环境测试

**方法 1: 查看 Webhook 日志**

1. 访问 Stripe Dashboard > Developers > Webhooks
2. 点击您的 Webhook 端点
3. 查看 **"Recent deliveries"** (最近的交付)
4. 检查是否有失败的请求

**方法 2: 使用测试模式支付**

1. 在测试环境完成一次真实的支付流程
2. 检查 Webhook 是否被正确触发
3. 验证数据库中的项目状态是否更新

---

## 📊 Webhook 处理的事件

项目的 Webhook 处理以下场景：

### 1️⃣ `checkout.session.completed`

**触发时机**: 用户完成支付

**处理逻辑**:
- ✅ 验证支付状态为 "paid"
- ✅ 更新项目状态为 "scheduled"
- ✅ 如果是 Premium Plus，设置首页推荐
- ✅ 更新发布配额计数
- ✅ 重新验证相关页面缓存

**失败处理**:
- ❌ 如果支付失败，更新项目状态为 "payment_failed"

### 2️⃣ `checkout.session.expired`

**触发时机**: 支付会话过期（未完成支付）

**处理逻辑**:
- ❌ 更新项目状态为 "payment_failed"
- 📧 可以后续发送提醒邮件（需要自行实现）

---

## 🔒 安全验证

项目使用 Stripe 签名验证确保 Webhook 的真实性：

```typescript
// 验证 Webhook 签名
const signature = request.headers.get("stripe-signature")
const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
```

⚠️ **重要**: 
- 必须配置 `STRIPE_WEBHOOK_SECRET`
- 签名验证失败会返回 400 错误
- 不要跳过签名验证

---

## 🚨 常见问题

### ❌ Webhook 签名验证失败

**错误信息:**
```
Webhook signature verification failed
```

**可能原因:**
1. `STRIPE_WEBHOOK_SECRET` 配置错误
2. 使用了错误环境的密钥（test vs live）
3. 本地开发时 `stripe listen` 未运行
4. 请求被中间件修改

**解决方案:**
```bash
# 1. 确认环境变量
echo $STRIPE_WEBHOOK_SECRET

# 2. 重启 Stripe CLI
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook

# 3. 重启开发服务器
bun dev

# 4. 复制新的 webhook 密钥到 .env
```

### ❌ Webhook 未被触发

**可能原因:**
1. URL 配置错误
2. 端点不可访问（防火墙/网络问题）
3. 未选择正确的事件

**解决方案:**
```bash
# 检查端点是否可访问
curl -X POST https://yourdomain.com/api/auth/stripe/webhook

# 查看 Stripe Dashboard 中的失败日志
# Dashboard > Webhooks > 点击端点 > Recent deliveries
```

### ❌ 项目状态未更新

**可能原因:**
1. Webhook 处理逻辑错误
2. 数据库连接问题
3. `client_reference_id` 未正确传递

**解决方案:**
```bash
# 查看服务器日志
# 检查是否有错误信息

# 确认 Payment Link URL 包含 client_reference_id
# 例如: https://buy.stripe.com/xxxxx?client_reference_id=PROJECT_ID
```

---

## 📋 配置检查清单

在部署到生产环境前，请确认：

- [ ] ✅ Webhook 端点 URL 正确配置
- [ ] ✅ STRIPE_WEBHOOK_SECRET 环境变量已设置
- [ ] ✅ 选择了必需的事件 (checkout.session.completed, checkout.session.expired)
- [ ] ✅ 端点可以从互联网访问
- [ ] ✅ 使用 HTTPS (生产环境必须)
- [ ] ✅ 签名验证已启用
- [ ] ✅ 测试支付流程正常工作
- [ ] ✅ 查看 Webhook 日志确认无错误

---

## 🔗 相关资源

- [Stripe Webhooks 文档](https://stripe.com/docs/webhooks)
- [Stripe CLI 文档](https://stripe.com/docs/stripe-cli)
- [测试 Webhooks](https://stripe.com/docs/webhooks/test)
- [Webhook 最佳实践](https://stripe.com/docs/webhooks/best-practices)

---

## 📞 需要帮助？

如果遇到问题：
1. 查看 Stripe Dashboard 中的 Webhook 日志
2. 检查服务器日志
3. 参考 `STRIPE_SETUP_GUIDE.md` 完整指南
4. 访问 [Stripe 支持](https://support.stripe.com/)

---

**Webhook 端点路径**: `/api/auth/stripe/webhook`
**完整 URL 示例**: `https://yourdomain.com/api/auth/stripe/webhook`


