# 🔧 Stripe Webhook 配置修复指南

## ❌ 问题描述

Stripe Webhook 端点 `https://aat.ee/api/auth/stripe/webhook` 无法正常工作，导致支付完成后订单无法自动处理。

---

## ✅ 解决方案

### 步骤 1: 获取 Webhook Secret（真实模式）

1. **登录 Stripe Dashboard**（确保在 **Live Mode**）：

   ```
   https://dashboard.stripe.com/webhooks
   ```

2. **找到或创建 Webhook 端点**：

   - **端点 URL**: `https://aat.ee/api/auth/stripe/webhook`
   - **监听事件**:
     - ✅ `checkout.session.completed`
     - ✅ `checkout.session.expired`

3. **复制 Signing Secret**：
   - 点击端点详情
   - 找到 "Signing secret" 部分
   - 复制完整的密钥（格式：`whsec_...`）

---

### 步骤 2: 配置 Zeabur 环境变量

#### 方法 A: 通过 Zeabur Dashboard（推荐）

1. 登录 [Zeabur Dashboard](https://dash.zeabur.com/)
2. 选择 `aat.ee` 项目
3. 进入 **Variables** 标签页
4. 添加以下环境变量：

| 变量名                                  | 值                           | 说明                          |
| --------------------------------------- | ---------------------------- | ----------------------------- |
| `STRIPE_SECRET_KEY`                     | `sk_live_...`                | Stripe API 密钥（Live Mode）  |
| `STRIPE_WEBHOOK_SECRET`                 | `whsec_...`                  | Webhook 签名密钥（Live Mode） |
| `NEXT_PUBLIC_PREMIUM_PAYMENT_LINK`      | `https://buy.stripe.com/...` | Premium Launch 支付链接       |
| `NEXT_PUBLIC_PREMIUM_PLUS_PAYMENT_LINK` | `https://buy.stripe.com/...` | SEO Package 支付链接          |

5. **保存并重新部署**

---

#### 方法 B: 通过 Zeabur CLI

```bash
# 安装 Zeabur CLI
npm install -g @zeabur/cli

# 登录
zeabur auth login

# 设置环境变量
zeabur env set STRIPE_WEBHOOK_SECRET "whsec_your_webhook_secret_here"
zeabur env set STRIPE_SECRET_KEY "sk_live_your_stripe_key_here"

# 重新部署
zeabur deploy
```

---

### 步骤 3: 验证 Webhook 配置

#### 3.1 部署新代码

```bash
# 提交改进的 webhook 代码
git add app/api/auth/stripe/webhook/route.ts
git commit -m "fix: improve Stripe webhook error handling and logging"
git push origin main

# 等待 Zeabur 自动部署完成
```

#### 3.2 在 Stripe Dashboard 测试

1. 进入 [Stripe Webhooks](https://dashboard.stripe.com/webhooks)
2. 点击你的端点
3. 点击 **"Send test webhook"**
4. 选择 `checkout.session.completed` 事件
5. 点击 **Send test event**

#### 3.3 查看日志

**Zeabur 日志**:

```bash
# 通过 CLI 查看
zeabur logs --follow

# 或在 Dashboard > Logs 标签页查看
```

**预期日志输出**:

```
✅ Webhook signature verified, event type: checkout.session.completed
📦 Processing payment for project: xxx-xxx-xxx
✅ Project found, scheduled date: 2025-11-14T00:00:00.000Z
✅ Revalidated path for project: xxx-xxx-xxx
✅ Webhook processed successfully for project: xxx-xxx-xxx
```

---

### 步骤 4: 测试真实支付流程

1. **创建一个测试项目**
2. **选择 Premium Launch**（使用真实支付链接）
3. **完成支付**（可以使用 Stripe 测试卡或真实卡）
4. **检查项目状态**是否自动变为 `SCHEDULED`

---

## 🔍 常见问题排查

### 问题 1: Webhook 签名验证失败

**症状**:

```
❌ Webhook signature verification failed
```

**解决方案**:

- ✅ 确认 `STRIPE_WEBHOOK_SECRET` 是 **Live Mode** 的值
- ✅ 确认环境变量没有多余的空格或引号
- ✅ 在 Stripe Dashboard 重新生成密钥

---

### 问题 2: 找不到项目

**症状**:

```
⚠️ Project not found: xxx-xxx-xxx
```

**解决方案**:

- 检查支付链接是否正确传递了 `client_reference_id`
- 确认项目 ID 在数据库中存在

---

### 问题 3: 环境变量未配置

**症状**:

```
❌ STRIPE_WEBHOOK_SECRET is not configured
```

**解决方案**:

- 在 Zeabur Dashboard 添加环境变量
- 重新部署应用

---

## 📊 改进内容

### 代码优化

1. **✅ 环境变量检查**：启动时检查必需的 Stripe 配置
2. **✅ 详细日志**：使用 emoji 标记不同类型的日志
3. **✅ 错误处理**：返回合适的 HTTP 状态码避免无限重试
4. **✅ 堆栈跟踪**：捕获详细错误信息便于调试

### 状态码策略

| 场景                   | 状态码 | 说明                         |
| ---------------------- | ------ | ---------------------------- |
| 签名验证失败           | `400`  | 客户端错误，Stripe 不会重试  |
| 环境变量缺失           | `500`  | 服务器错误，Stripe 会重试    |
| 项目不存在（数据问题） | `200`  | 已接收但有警告，避免无限重试 |
| 处理成功               | `200`  | 成功                         |
| 未知错误               | `500`  | 服务器错误，Stripe 会重试    |

---

## 🚀 最佳实践

### 1. 监控 Webhook 健康状态

在 Stripe Dashboard 定期检查：

- ✅ 成功率 (应该 > 95%)
- ✅ 平均响应时间 (应该 < 1秒)
- ✅ 失败事件数量

### 2. 设置告警

配置 Zeabur 或第三方监控工具：

- ❌ Webhook 失败超过 5 次 → 发送邮件/Slack 通知
- ❌ 响应时间超过 3 秒 → 性能告警

### 3. 定期测试

每月至少测试一次完整的支付流程：

1. 创建测试项目
2. 完成支付
3. 验证项目状态自动更新

---

## 📚 相关文档

- [Stripe Webhooks 文档](https://stripe.com/docs/webhooks)
- [Zeabur 环境变量](https://zeabur.com/docs/environment-variables)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

---

## ✅ 完成检查清单

- [ ] 已获取 Live Mode 的 Webhook Secret
- [ ] 已在 Zeabur 配置 `STRIPE_WEBHOOK_SECRET`
- [ ] 已在 Zeabur 配置 `STRIPE_SECRET_KEY` (Live)
- [ ] 已在 Zeabur 配置两个支付链接
- [ ] 已部署新代码
- [ ] 在 Stripe Dashboard 测试 Webhook 成功
- [ ] 完成一次真实支付测试
- [ ] Webhook 健康状态显示正常

---

**如有问题，请查看 Zeabur Logs 或 Stripe Dashboard 的 Event Logs 获取详细错误信息。**
