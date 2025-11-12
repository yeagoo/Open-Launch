# 付费逻辑重构实施方案

## 📋 改动总结

### 1. 配额系统改为 5+5 模式

- **基础配额**：5 个/天（所有用户）
- **Badge 配额**：5 个/天（添加 aat.ee badge 的用户）
- **总配额**：10 个/天

### 2. Dofollow 规则调整

- **免费发布**：只有 Top 3 daily ranking 是 dofollow
- **非 Top 3**：需要验证 badge 才能 dofollow
- **Premium Launch**：全部 dofollow

### 3. Premium Launch 付费模式

- **取消**：Premium 会员制度
- **改为**：按次付费的 Premium Launch
- **价格**：$2.99/launch（原 $4.99）
- **特点**：加速发布，不用排队，dofollow 链接

### 4. 价格调整

- Premium Launch: $4.99 → $2.99
- SEO Growth Package: $149 → $50

### 5. 优惠码系统

- 一个用户最多使用 10 次优惠码（不同优惠码）
- 每个优惠码对一个用户只能使用一次
- 有效期：30 天
- 优惠金额：$2.99（可抵扣 Premium Launch 费用）

### 6. Badge 检查警告

- 页面显示警告：每月会检查 badge 是否存在
- 实际功能：本次不开发，只做提示作用

---

## 🗄️ 数据库变更

### 新增表

#### 1. `promo_code` - 优惠码表

```sql
id: text (PK)
code: text (UNIQUE)
discount_amount: numeric(10,2) DEFAULT 2.99
usage_limit: integer (NULL = unlimited)
used_count: integer DEFAULT 0
expires_at: timestamp
is_active: boolean DEFAULT true
created_by: text (FK to user)
created_at: timestamp
updated_at: timestamp
```

#### 2. `promo_code_usage` - 优惠码使用记录

```sql
id: text (PK)
promo_code_id: text (FK)
user_id: text (FK)
project_id: text (FK, nullable)
used_at: timestamp
```

### 删除字段

从 `user` 表删除（如果存在）：

- `isPremium`
- `premiumExpires`

### 修改字段

`project` 表：

- `launchType`: 支持新类型 `free_with_badge`

---

## 📝 代码变更清单

### 1. 常量配置 (`lib/constants.ts`)

- ✅ LAUNCH_LIMITS: 添加 BADGE_DAILY_LIMIT
- ✅ LAUNCH_SETTINGS: 价格调整
- ✅ LAUNCH_TYPES: 添加 FREE_WITH_BADGE
- ✅ PROMO_CODE_SETTINGS: 新增优惠码配置

### 2. 数据库 Schema (`drizzle/db/schema.ts`)

- ⏳ 添加 promoCode 表定义
- ⏳ 添加 promoCodeUsage 表定义
- ⏳ 删除 user 表的 isPremium 字段（如果存在）

### 3. 配额逻辑 (`app/actions/launch.ts`)

- ⏳ getLaunchAvailability: 分别计算基础配额和 Badge 配额
- ⏳ scheduleLaunch: 支持选择使用哪种配额
- ⏳ checkUserLaunchLimit: 删除 Premium 判断

### 4. Dofollow 规则

- ⏳ 项目详情页：根据新规则判断 rel 属性
- ⏳ 项目卡片：根据新规则判断 rel 属性

### 5. 优惠码系统

- ⏳ API: 验证优惠码
- ⏳ API: 应用优惠码
- ⏳ API: 批量生成优惠码（管理员）
- ⏳ UI: 管理后台界面

### 6. 提交表单 (`components/project/submit-form.tsx`)

- ⏳ 添加配额类型选择（基础 vs Badge）
- ⏳ 显示可用配额数量
- ⏳ 添加 Badge 检查警告提示

### 7. 定价页面 (`app/pricing/page.tsx`)

- ⏳ 更新 Premium Launch 描述和价格
- ⏳ 移除 Premium 会员内容
- ⏳ 更新 SEO Growth Package 价格

### 8. 支付流程

- ⏳ 集成优惠码应用
- ⏳ 更新支付金额计算

---

## 🔄 迁移步骤

### Phase 1: 数据库和基础设施

1. ✅ 创建 SQL 迁移文件
2. ⏳ 更新 schema.ts
3. ⏳ 运行数据库迁移

### Phase 2: 核心逻辑

1. ⏳ 修改配额检查逻辑
2. ⏳ 修改 Dofollow 规则
3. ⏳ 实现优惠码验证 API

### Phase 3: UI 更新

1. ⏳ 更新提交表单
2. ⏳ 更新定价页面
3. ⏳ 添加警告提示

### Phase 4: 管理功能

1. ⏳ 优惠码批量生成界面
2. ⏳ 优惠码使用统计
3. ⏳ 管理后台集成

---

## ⚠️ 注意事项

### 1. 向后兼容

- 保留 `PREMIUM_DAILY_LIMIT` 常量（但不使用）
- 保留 `LAUNCH_TYPES.PREMIUM_PLUS`（但不使用）
- 旧的 `launchType` 值仍然有效

### 2. 数据迁移

- 由于没有 Premium 用户，可以安全删除相关字段
- 保留历史数据中的 launchType 值

### 3. 优惠码安全

- 生成唯一且难以猜测的优惠码
- 使用速率限制防止暴力破解
- 记录所有使用日志

### 4. Badge 检查

- 本次只添加警告提示
- 实际检查功能留待后续实现
- 预留数据库字段和接口

---

## 📊 用户流程变化

### 旧流程

```
注册 → 发布（5个/天）→ 购买 Premium 会员 → 发布（10个/天）
```

### 新流程

```
注册 → 选择配额类型：
  ├─ 基础配额：5个/天
  ├─ Badge 配额：添加 badge 后额外 5个/天
  └─ Premium Launch：付费加速，不排队

如需 dofollow：
  ├─ Top 3 daily ranking：自动 dofollow
  ├─ 非 Top 3：验证 badge 获得 dofollow
  └─ Premium Launch：自动 dofollow
```

---

## 🎯 实施优先级

### 高优先级（本次实施）

1. ✅ 常量配置更新
2. ⏳ 数据库 schema 更新
3. ⏳ 配额逻辑修改
4. ⏳ Dofollow 规则修改
5. ⏳ 提交表单更新
6. ⏳ 定价页面更新

### 中优先级（本次实施）

7. ⏳ 优惠码基础 API
8. ⏳ Badge 警告提示

### 低优先级（后续实施）

9. 优惠码管理后台完整界面
10. 优惠码使用统计和报表
11. 自动 Badge 检查功能

---

**状态**: 🚧 进行中
**预计完成时间**: 2-3 小时
**当前进度**: 20% (2/10)
