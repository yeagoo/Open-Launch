# 统一机器人账号系统 - 架构说明

## 🎯 设计决策

### 为什么合并 ProductHunt 和虚拟互动账号？

**之前的方案：**

- 5个 ProductHunt 专用账号（ph-bot-1 ~ ph-bot-5）
- 虚拟互动账号（独立体系）
- 总计：两套需分别维护的账号

**问题：**

1. ❌ 管理复杂，需要维护两套账号
2. ❌ ProductHunt 账号名称过于明显（"ProductHunt Bot"）
3. ❌ 已删除的账号需要单独恢复

**现在的方案：**

- 300个统一的机器人账号
- 同时用于 ProductHunt 导入和虚拟互动
- 使用真实的国际化姓名

**优势：**

1. ✅ 简单统一，只需一套账号
2. ✅ ProductHunt 导入的项目看起来更自然
3. ✅ 姓名多样化，像真实用户
4. ✅ 轮询分配，自动负载均衡

## 📦 系统架构

```
┌─────────────────────────────────────────────────┐
│          300个虚拟机器人账号                     │
│        (bot-user-1 ~ bot-user-300)              │
│                                                 │
│  姓名: Alex Moore, Blake Clark, Casey Wright    │
│  邮箱: bot1@aat.ee ~ bot300@aat.ee             │
└─────────────────────────────────────────────────┘
              │                    │
              │                    │
    ┌─────────┴─────────┐   ┌─────┴──────────┐
    │ ProductHunt 导入   │   │  虚拟互动       │
    │  (轮询分配)        │   │  (随机选择)     │
    └───────────────────┘   └────────────────┘
              │                    │
              │                    │
    ┌─────────┴─────────┐   ┌─────┴──────────────┐
    │ 自动导入 Top 5    │   │ 按项目每日目标点赞  │
    │ 每天运行1次       │   │ + 评论 每2小时1次   │
    └───────────────────┘   └────────────────────┘
```

## 🔧 技术实现

### ProductHunt 导入逻辑

```typescript
// app/api/cron/import-producthunt/route.ts
const botUsers = await db.select().from(user).where(eq(user.isBot, true)).limit(10)

// 轮询分配
for (let i = 0; i < posts.length; i++) {
  const botUser = botUsers[i % botUsers.length]
  // 使用 botUser.id 作为项目创建者
}
```

**特点：**

- 自动轮流分配
- 每个导入的项目都有不同的"创建者"
- 最多使用10个账号（从300个中取前10个）

### 虚拟互动逻辑

```typescript
// app/api/cron/simulate-engagement/route.ts + lib/bot-upvote-plan.ts
const bots = await db.select().from(user).where(eq(user.isBot, true))

// 点赞：每个项目一个确定性的当日目标，按 launch window 渐进爬升
const target = dailyVoteTarget(proj.id, windowStartMs, isPaid) // 免费[50,200] / 付费[200,250]
const due = votesDueByNow(target, windowStartMs, windowEndMs, nowMs) // 75%处爬满
const need = Math.min(Math.max(due - current, 0), eligibleBots.length) // 只补缺口

// 评论：5个独特机器人，覆盖2-5个项目
const botsForComments = shuffle(bots).slice(0, 5)
```

**特点：**

- 确定性目标 + 渐进爬升，数字自然、全天稳定
- 付费项目保底更高（200-250）
- 唯一索引保证一人一项目一票，无重复
- AI 生成多语言评论内容

## 📊 账号规格

| 属性           | 值                                                 |
| -------------- | -------------------------------------------------- |
| **总数量**     | 300个                                              |
| **ID 格式**    | `bot-user-1` ~ `bot-user-300`                      |
| **Email 格式** | `bot1@aat.ee` ~ `bot300@aat.ee`                    |
| **姓名生成**   | 80个名字 × 80个姓氏（质数偏移 + 错位，6400种组合） |
| **姓氏分布**   | 欧美 30 / 亚洲 30 / 拉美 20                        |
| **角色**       | `user`（auth 角色；persona 标签不入库）            |
| **is_bot**     | `true`                                             |

### 姓名生成算法

```typescript
// 质数偏移 + 错位：保证300个不重名
const firstNameIndex = i % FIRST_NAMES.length // 0-79
const lastNameIndex = (i * 7 + 13 + Math.floor(i / FIRST_NAMES.length)) % LAST_NAMES.length
```

**为什么要加 `Math.floor(i / FIRST_NAMES.length)`？**

- 80×7 ≡ 0 (mod 80)，所以仅用 `i*7+13` 时 `i` 与 `i+80` 会撞名
- 加上错位项后，前 6400 个 `i` 都能得到唯一的（名+姓）组合，足够 300 个不重名

## 🚀 使用方式

### 初始化

```bash
npx tsx scripts/seed-bot-users.ts
```

### 删除并重新生成

```bash
npx tsx scripts/delete-bot-users.ts
npx tsx scripts/seed-bot-users.ts
```

### ProductHunt 自动导入

```bash
curl -X GET "https://www.aat.ee/api/cron/import-producthunt?secret=SECRET"
```

### 虚拟互动

```bash
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement?secret=SECRET"
```

## 🔍 监控和验证

### 查看机器人账号

```sql
SELECT COUNT(*) FROM "user" WHERE is_bot = true;
-- 应该返回：300
```

### 查看 ProductHunt 项目分布

```sql
SELECT
  u.name,
  COUNT(p.id) as project_count
FROM "user" u
INNER JOIN project p ON u.id = p.created_by
WHERE u.is_bot = true
GROUP BY u.id, u.name
ORDER BY project_count DESC;
```

### 查看虚拟互动统计

```sql
-- 点赞分布
SELECT
  u.name,
  COUNT(up.id) as upvote_count
FROM "user" u
LEFT JOIN upvote up ON u.id = up.user_id
WHERE u.is_bot = true
GROUP BY u.id, u.name
ORDER BY upvote_count DESC
LIMIT 10;
```

## ⚠️ 注意事项

### 迁移影响

如果您之前使用了旧的分离式账号体系（ph-bot-_ 和 engagement-bot-_），需要：

1. **删除旧账号**

```bash
npx tsx scripts/delete-bot-users.ts
```

2. **生成新账号**

```bash
npx tsx scripts/seed-bot-users.ts
```

3. **修复已发布项目的创建者**

```sql
-- 将无效创建者的项目分配给新账号
UPDATE project
SET created_by = 'bot-user-1'
WHERE created_by NOT IN (SELECT id FROM "user");
```

### 数据完整性

- ✅ ProductHunt 导入：自动使用新账号
- ✅ 虚拟互动：自动使用新账号
- ⚠️ 已发布项目：需要手动修复创建者关联

## 🎉 总结

统一的机器人账号系统提供了：

1. **简化管理** - 只需维护一套300个账号
2. **自然体验** - 使用真实的国际化姓名
3. **灵活分配** - ProductHunt 轮询，虚拟互动随机
4. **易于扩展** - 需要更多账号时只需修改数量
5. **统一维护** - 删除、重建、查询都更简单

这个设计让您的平台看起来更真实，同时大大简化了运维复杂度！🚀
