# Stripe 密钥快速参考

## 🔑 密钥获取速查表

| 环境变量 | 获取位置 | 示例值 | 说明 |
|---------|---------|--------|------|
| `STRIPE_SECRET_KEY` | Dashboard > Developers > [API keys](https://dashboard.stripe.com/apikeys) | `sk_test_xxxxxxxx` | 服务端密钥，**必须保密** |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Dashboard > Developers > [API keys](https://dashboard.stripe.com/apikeys) | `pk_test_xxxxxxxx` | 公开密钥，可用于前端 |
| `STRIPE_WEBHOOK_SECRET` | 本地: Stripe CLI<br>生产: Dashboard > [Webhooks](https://dashboard.stripe.com/webhooks) | `whsec_xxx...` | Webhook 签名验证密钥 |
| `NEXT_PUBLIC_PREMIUM_PAYMENT_LINK` | Dashboard > [Payment Links](https://dashboard.stripe.com/payment-links) | `https://buy.stripe.com/xxx` | 支付链接 URL |

---

## 📝 快速配置步骤

### 步骤 1️⃣: 获取 API 密钥（2 分钟）

```bash
# 1. 访问
https://dashboard.stripe.com/apikeys

# 2. 点击 "Reveal test key" 查看密钥

# 3. 复制到 .env
STRIPE_SECRET_KEY=sk_test_YOUR_KEY_HERE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_KEY_HERE
```

### 步骤 2️⃣: 配置 Webhook（本地开发 - 3 分钟）

```bash
# 1. 安装 Stripe CLI
brew install stripe/stripe-cli/stripe

# 2. 登录
stripe login

# 3. 启动转发（保持运行）
stripe listen --forward-to localhost:3000/api/auth/stripe/webhook

# 4. 复制显示的 whsec_xxx 密钥到 .env
STRIPE_WEBHOOK_SECRET=whsec_xxxxx...
```

### 步骤 3️⃣: 创建 Payment Link（5 分钟）

```bash
# 1. 访问
https://dashboard.stripe.com/payment-links

# 2. 点击 "New" 创建

# 3. 填写:
#    - 产品名称: Premium Launch
#    - 价格: $10.00 USD
#    - 支付后重定向: https://yourdomain.com/payment/success

# 4. 复制生成的链接到 .env
NEXT_PUBLIC_PREMIUM_PAYMENT_LINK=https://buy.stripe.com/xxxxx
```

---

## 🧪 测试支付

使用 Stripe 测试卡号：

| 场景 | 卡号 | 结果 |
|-----|------|------|
| ✅ 成功支付 | `4242 4242 4242 4242` | 支付成功 |
| 🔐 需要验证 | `4000 0025 0000 3155` | 触发 3D Secure |
| ❌ 支付失败 | `4000 0000 0000 0002` | 卡被拒绝 |

**其他信息随意填写：**
- 日期: 任意未来日期（如 `12/34`）
- CVC: 任意 3 位数字（如 `123`）
- 邮编: 任意邮编

更多测试卡: https://stripe.com/docs/testing

---

## ⚠️ 常见错误

### ❌ "No signatures found matching the expected signature"

**原因:** Webhook 签名密钥不匹配

**解决:**
1. 检查 `STRIPE_WEBHOOK_SECRET` 是否正确
2. 确保本地 `stripe listen` 正在运行
3. 重启 Next.js 开发服务器

### ❌ "Invalid API Key"

**原因:** API 密钥错误或环境不匹配

**解决:**
1. 确认使用测试环境密钥（`sk_test_`）
2. 检查密钥是否完整复制
3. 重启应用重新加载环境变量

### ❌ Payment Link 无法访问

**原因:** Link 未激活或环境不匹配

**解决:**
1. 确认 Payment Link 已创建且激活
2. 测试环境使用测试模式 Link
3. 直接访问 Link 测试是否可用

---

## 🔒 安全提示

| ✅ 应该做 | ❌ 不应该做 |
|---------|-----------|
| ✅ 将 Secret Key 保存在 `.env` | ❌ 在前端代码中使用 Secret Key |
| ✅ 验证所有 Webhook 签名 | ❌ 跳过 Webhook 签名验证 |
| ✅ 使用环境变量存储密钥 | ❌ 将密钥硬编码在代码中 |
| ✅ 生产环境使用 `live` 密钥 | ❌ 生产环境使用 `test` 密钥 |
| ✅ 定期轮换 API 密钥 | ❌ 长期使用同一密钥 |

---

## 📚 相关文档

- 📖 **完整配置指南**: `STRIPE_SETUP_GUIDE.md`
- 📖 **环境变量指南**: `ENV_SETUP_GUIDE.md`
- 🌐 **Stripe 官方文档**: https://stripe.com/docs
- 🧪 **测试指南**: https://stripe.com/docs/testing

---

## 🆘 需要帮助？

1. 查看 `STRIPE_SETUP_GUIDE.md` 完整配置指南
2. 访问 [Stripe 文档](https://stripe.com/docs)
3. 查看 [Stripe 支持中心](https://support.stripe.com/)

---

**预计总配置时间: 10-15 分钟** ⏱️


