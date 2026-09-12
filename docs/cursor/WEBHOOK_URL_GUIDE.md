# 🎯 Stripe Webhook URL 快速指南

## 📍 Webhook 端点 URL 答案

### 本地开发环境

```
http://localhost:3000/api/auth/stripe/webhook
```

但是！本地开发时不要直接在 Stripe Dashboard 中配置这个 URL，而是使用 **Stripe CLI**：

```bash
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
```

---

### 生产环境（部署后）

```
https://yourdomain.com/api/auth/stripe/webhook
```

**实际示例：**

| 部署平台   | Webhook URL 示例                                         |
| ---------- | -------------------------------------------------------- |
| Vercel     | `https://yourapp.vercel.app/api/auth/stripe/webhook`     |
| Netlify    | `https://yourapp.netlify.app/api/auth/stripe/webhook`    |
| 自定义域名 | `https://www.yourdomain.com/api/auth/stripe/webhook`     |
| Railway    | `https://yourapp.up.railway.app/api/auth/stripe/webhook` |

---

## 🖼️ 在 Stripe Dashboard 中填写

### 1. 访问 Webhooks 页面

```
https://dashboard.stripe.com/webhooks
```

### 2. 点击 "+ Add endpoint"

![Add Endpoint Button](示意图)

### 3. 填写表单

**Endpoint URL:**

```
┌─────────────────────────────────────────────────────────────┐
│ https://yourdomain.com/api/auth/stripe/webhook             │
└─────────────────────────────────────────────────────────────┘
```

**Description (可选):**

```
┌─────────────────────────────────────────────────────────────┐
│ Open Launch - Payment Webhook                               │
└─────────────────────────────────────────────────────────────┘
```

**Listen to:**

```
⚫ Events on your account  ← 选择这个
⚪ Events on Connected accounts
```

**Select events:**

```
☑️ checkout.session.completed
☑️ checkout.session.expired
```

### 4. 点击 "Add endpoint" 创建

### 5. 获取 Signing Secret

创建后，在端点详情页面：

```
Signing secret  [Reveal]  ← 点击 Reveal
```

显示后复制：

```
whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🔧 完整配置示例

### 本地开发 (.env.local)

```env
# Stripe 配置
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE

# 从 stripe listen 命令获取
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# Payment Link
NEXT_PUBLIC_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/test_xxxxx
```

**终端命令：**

```bash
# Terminal 1: 启动开发服务器
bun dev

# Terminal 2: 启动 Stripe CLI
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook
```

---

### 生产环境 (Vercel/Netlify 等)

```env
# Stripe 配置
STRIPE_SECRET_KEY=sk_live_YOUR_KEY_HERE

# 从 Stripe Dashboard Webhook 端点获取
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# Payment Link
NEXT_PUBLIC_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/xxxxx
```

**Stripe Dashboard 配置：**

- Endpoint URL: `https://yourapp.vercel.app/api/auth/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`

---

## ✅ 验证配置

### 方法 1: 测试支付流程

1. 提交一个项目
2. 选择 Premium Launch
3. 使用测试卡号支付: `4242 4242 4242 4242`
4. 检查项目状态是否更新为 "scheduled"

### 方法 2: 查看 Webhook 日志

**Stripe Dashboard:**

1. 访问 Dashboard > Developers > Webhooks
2. 点击您的端点
3. 查看 "Recent deliveries"
4. 确认请求成功（200 状态码）

**服务器日志:**

```bash
# 查看 Next.js 日志
# 应该看到类似的输出：
# Revalidated path for project: xxx-xxx-xxx
```

---

## 🚨 常见错误

### ❌ URL 填写错误

```
❌ 错误: localhost:3000/api/auth/stripe/webhook
❌ 错误: http://yourdomain.com/api/stripe/webhook
❌ 错误: https://yourdomain.com/stripe/webhook

✅ 正确: https://yourdomain.com/api/auth/stripe/webhook
```

### ❌ 忘记使用 HTTPS

生产环境必须使用 HTTPS：

```
❌ 错误: http://yourdomain.com/api/auth/stripe/webhook
✅ 正确: https://yourdomain.com/api/auth/stripe/webhook
```

### ❌ 路径错误

确保路径完全匹配：

```
项目路由: /app/api/auth/stripe/webhook/route.ts
对应 URL: /api/auth/stripe/webhook
         ↑
         注意这个路径
```

---

## 📱 快速命令参考

### 本地开发

```bash
# 1. 安装 Stripe CLI (仅首次)
brew install stripe/stripe-cli/stripe

# 2. 登录 (仅首次)
stripe login

# 3. 每次开发时运行
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook

# 4. 触发测试事件
stripe trigger checkout.session.completed
```

### 生产部署

```bash
# 1. 部署应用
vercel deploy --prod  # 或其他部署命令

# 2. 在 Stripe Dashboard 配置 Webhook
# URL: https://your-deployed-domain.com/api/auth/stripe/webhook

# 3. 更新环境变量
vercel env add STRIPE_WEBHOOK_SECRET production
# 输入从 Stripe Dashboard 获取的 whsec_xxx
```

---

## 🎓 关键要点

1. **Webhook 端点路径**: `/api/auth/stripe/webhook`
2. **本地开发**: 使用 Stripe CLI 转发
3. **生产环境**: 在 Dashboard 配置完整 HTTPS URL
4. **必需事件**: `checkout.session.completed` 和 `checkout.session.expired`
5. **签名密钥**: 本地和生产环境使用不同的密钥

---

## 📚 更多信息

- 📖 完整 Webhook 配置: `STRIPE_WEBHOOK_CONFIG.md`
- 📖 Stripe 完整设置: `STRIPE_SETUP_GUIDE.md`
- 📖 快速参考: `STRIPE_QUICK_REFERENCE.md`
- 📖 所有环境变量: `ENV_SETUP_GUIDE.md`

---

**一句话总结:**  
生产环境填写 `https://yourdomain.com/api/auth/stripe/webhook`，本地开发使用 `stripe listen` 命令。
