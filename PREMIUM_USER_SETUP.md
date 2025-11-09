# 🌟 Premium 用户功能部署指南

## 📋 功能概述

已成功添加 Premium 用户功能：

- ✅ **普通用户**：每天可上传 **2 个项目**（之前是 1 个）
- ✅ **Premium 用户**：每天可上传 **10 个项目**
- ✅ **自动升级**：购买 Premium Launch 后自动成为 Premium 用户
- ✅ **价格调整**：Premium Launch 价格从 $9 降至 **$4.99**

---

## 🚀 部署步骤

### 步骤 1: 应用数据库迁移

在部署环境（Zeabur/Vercel）执行以下 SQL：

```sql
ALTER TABLE "user" ADD COLUMN "is_premium" BOOLEAN DEFAULT false;
```

**或者使用 Drizzle Push**：

```bash
# 本地
bun run db:push

# Zeabur Terminal
cd /app && bun run db:push
```

### 步骤 2: 推送代码

```bash
git push origin main
```

### 步骤 3: 重新部署

- **Zeabur**: 自动触发部署
- **Vercel**: 自动触发部署

---

## 🎯 工作原理

### 1. 购买流程

```
用户提交项目 (Premium Launch)
         ↓
进入 Stripe 支付页面
         ↓
支付成功 (checkout.session.completed)
         ↓
Webhook 接收通知
         ↓
① 项目状态改为 SCHEDULED
② 用户 is_premium 设为 true ✨
         ↓
用户成为 Premium 用户
```

### 2. 发布限制检查

```typescript
// app/actions/launch.ts - checkUserLaunchLimit()

1. 查询用户的 isPremium 状态
2. 确定限制：
   - isPremium = true  → 10 个/天
   - isPremium = false → 2 个/天
3. 检查当天已发布的项目数量
4. 返回是否允许发布
```

---

## 📊 数据库字段

### user 表新增字段

| 字段名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `is_premium` | `BOOLEAN` | `false` | 用户是否为 Premium |

---

## 🔧 手动设置 Premium 用户

如果需要手动给用户 Premium 权限：

```sql
-- 根据邮箱设置
UPDATE "user" 
SET is_premium = true 
WHERE email = 'user@example.com';

-- 根据用户 ID 设置
UPDATE "user" 
SET is_premium = true 
WHERE id = 'user_id_here';

-- 查看所有 Premium 用户
SELECT id, email, name, is_premium 
FROM "user" 
WHERE is_premium = true;

-- 取消 Premium 权限
UPDATE "user" 
SET is_premium = false 
WHERE email = 'user@example.com';
```

---

## 📝 代码变更总结

### 1. Schema 变更 (`drizzle/db/schema.ts`)

```typescript
export const user = pgTable("user", {
  // ...其他字段
  isPremium: boolean("is_premium").default(false), // 新增
})
```

### 2. 常量变更 (`lib/constants.ts`)

```typescript
// 之前
export const USER_DAILY_LAUNCH_LIMIT = 1
export const LAUNCH_SETTINGS = {
  PREMIUM_PRICE: 9,
}

// 现在
export const USER_DAILY_LAUNCH_LIMIT = 2 // 普通用户
export const PREMIUM_USER_DAILY_LAUNCH_LIMIT = 10 // Premium 用户
export const LAUNCH_SETTINGS = {
  PREMIUM_PRICE: 4.99,
}
```

### 3. 限制检查 (`app/actions/launch.ts`)

```typescript
export async function checkUserLaunchLimit(userId: string, launchDate: string) {
  // 查询用户 Premium 状态
  const userData = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { isPremium: true },
  })

  // 根据状态返回不同限制
  const limit = userData?.isPremium 
    ? PREMIUM_USER_DAILY_LAUNCH_LIMIT  // 10
    : USER_DAILY_LAUNCH_LIMIT          // 2
  
  // ...检查逻辑
}
```

### 4. Webhook 自动升级 (`app/api/auth/stripe/webhook/route.ts`)

```typescript
// 支付成功后
if (session.payment_status === "paid") {
  // ...更新项目状态
  
  // 如果是 Premium Launch，升级用户
  if (projectData.launchType === launchType.PREMIUM || 
      projectData.launchType === launchType.PREMIUM_PLUS) {
    await db.update(user)
      .set({ isPremium: true })
      .where(eq(user.id, projectInfo.createdBy))
  }
}
```

---

## ✅ 验证功能

### 1. 验证数据库迁移

```sql
-- 检查字段是否存在
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'user' AND column_name = 'is_premium';
```

应该看到：
```
column_name  | data_type | column_default
-------------|-----------|---------------
is_premium   | boolean   | false
```

### 2. 验证限制检查

作为**普通用户**：
1. 提交第 1 个项目 ✅
2. 提交第 2 个项目 ✅
3. 提交第 3 个项目 ❌ 提示达到限制

作为 **Premium 用户**：
1. 提交第 1-10 个项目 ✅
2. 提交第 11 个项目 ❌ 提示达到限制

### 3. 验证自动升级

1. 创建测试用户
2. 提交 Premium Launch 项目
3. 完成 Stripe 支付
4. 检查数据库：
   ```sql
   SELECT is_premium FROM "user" WHERE email = 'test@example.com';
   ```
   应该显示 `true`

---

## 🐛 故障排查

### 问题 1: 数据库迁移失败

```bash
ERROR: column "is_premium" already exists
```

**解决方案**：字段已存在，跳过迁移即可。

---

### 问题 2: Webhook 没有升级用户

**检查清单**：
1. ✅ `STRIPE_WEBHOOK_SECRET` 环境变量已配置
2. ✅ Stripe Webhook 端点已添加
3. ✅ 查看 Zeabur/Vercel 日志中的 Webhook 日志
4. ✅ 检查 Stripe Dashboard 的 Webhook 发送记录

**调试**：
```bash
# 查看日志
# 应该看到: "User xxx upgraded to Premium"
```

---

### 问题 3: 限制检查不生效

**检查清单**：
1. ✅ 确认用户的 `is_premium` 字段值
2. ✅ 确认常量导入正确
3. ✅ 重新部署应用

```sql
-- 检查用户状态
SELECT id, email, is_premium FROM "user" WHERE email = 'user@example.com';
```

---

## 📈 监控和统计

### 查看 Premium 用户统计

```sql
-- 总 Premium 用户数
SELECT COUNT(*) as premium_user_count 
FROM "user" 
WHERE is_premium = true;

-- Premium 用户列表
SELECT id, email, name, created_at 
FROM "user" 
WHERE is_premium = true 
ORDER BY created_at DESC;

-- Premium 用户发布的项目数
SELECT 
  u.email,
  u.name,
  COUNT(p.id) as project_count
FROM "user" u
LEFT JOIN project p ON u.id = p.created_by
WHERE u.is_premium = true
GROUP BY u.id, u.email, u.name
ORDER BY project_count DESC;
```

---

## 🎉 功能完成

现在您的平台支持 Premium 用户功能：

- ✅ 自动升级用户为 Premium
- ✅ 差异化的发布限制
- ✅ 更优惠的价格（$4.99）
- ✅ 鼓励用户付费获得更多权限

---

**祝您平台运营顺利！** 🚀

