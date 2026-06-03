# 机器人用户管理指南

## 📦 统一的机器人账号体系

Open-Launch 使用 **300个虚拟机器人账号**，同时服务于：

- ✅ ProductHunt 自动发布（轮询分配）
- ✅ 虚拟点赞和评论（随机选择）

**优势：**

- 简单统一，只需管理一套账号
- ProductHunt 导入的项目看起来更自然
- 姓名多样化（包含欧美、亚洲和拉美姓氏）

## 🚀 初始化：生成机器人账号

```bash
npx tsx scripts/seed-bot-users.ts
```

**预期输出：**

```
🤖 Starting bot users seed...
✅ Created bot user: Alex Smith (bot1@aat.ee)
✅ Created bot user: Blake Wang (bot2@aat.ee)
✅ Created bot user: Casey Wright (bot3@aat.ee)
... (共300个)
🎉 Bot users seed completed!
```

## 🗑️ 删除：清理机器人账号

如果需要删除所有机器人账号：

```bash
npx tsx scripts/delete-bot-users.ts
```

**注意：** 这会删除所有 `is_bot = true` 的用户。

## 🔄 重新生成：删除并重新创建

```bash
# 步骤 1: 删除所有机器人
npx tsx scripts/delete-bot-users.ts

# 步骤 2: 重新生成
npx tsx scripts/seed-bot-users.ts

# 步骤 3: 修复历史项目的创建者（如果有）
npx tsx scripts/fix-project-creators.ts
```

**详细说明：** 查看 [FIX_HISTORICAL_PROJECTS.md](./FIX_HISTORICAL_PROJECTS.md)

## 📊 机器人账号规格

| 属性           | 值                                                            |
| -------------- | ------------------------------------------------------------- |
| **数量**       | 300个                                                         |
| **ID 格式**    | `bot-user-1` ~ `bot-user-300`                                 |
| **Email 格式** | `bot1@aat.ee` ~ `bot300@aat.ee`                               |
| **姓名示例**   | Alex Moore, Blake Clark, Casey Wright, Drew Liu, Evan Ma 等   |
| **姓名生成**   | 80个名字 × 80个姓氏（质数偏移 + 错位，保证300个不重名）       |
| **姓氏分布**   | 欧美 (30), 亚洲 (30), 拉美 (20)                               |
| **角色**       | `user`（auth 角色；persona 标签如 Developer/Designer 不入库） |

## 🎯 使用场景

### 1. ProductHunt 自动导入 ✅

**代码已就绪！** ProductHunt 导入逻辑已经配置为使用300个虚拟账号：

```typescript
// app/api/cron/import-producthunt/route.ts (第56行)
const botUsers = await db.select().from(user).where(eq(user.isBot, true))

// (第108行) 轮询分配给机器人账号
const botUser = botUsers[i % botUsers.length]
```

**特点：**

- ✅ 自动查询所有 `is_bot = true` 的用户（300个）
- ✅ 轮流分配，自动负载均衡
- ✅ 每个导入的项目都有不同的"创建者"
- ✅ 使项目看起来更自然
- ✅ **无需任何修改，开箱即用**

### 2. 虚拟点赞（按项目每日目标，渐进爬升）

每2小时运行一次，覆盖当天 launch window 内所有 ONGOING 项目：

```bash
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement?secret=SECRET"
```

**逻辑（见 `lib/bot-upvote-plan.ts`）：**

- 每个项目有一个**确定性的当日目标票数**（按 `projectId + windowStart + 付费等级` 取哈希，全天稳定）：
  - 免费队列：`[50, 200]`
  - 付费（`premium` / `premium_plus`）：保底 `[200, 250]`
- 票数在 launch window 内**线性爬升**，在窗口 75% 处爬满目标（保证项目在 06:00 退出 ONGOING 前到位）。
- **真人票计入目标**，bot 只补缺口。
- 唯一索引 `upvote_user_project_unique_idx (user_id, project_id)` 保证**每个 bot 对每个项目只投一次**，不再有重复票。
- 单个项目最大票数 = bot 池大小（300），所以付费保底 250 才有余量。

### 3. 虚拟评论

每2小时运行一次：

**逻辑：**

- 选 5 个独特机器人，覆盖 2-5 个当天发布的项目
- AI 生成多语言评论（persona / 意图 / 语言多样化）
- 防止同一 bot 对同一项目重复评论
- 每轮还会重写少量旧的模板化评论（`REWRITES_PER_RUN`）

## 🔍 数据库查询

### 查看所有机器人账号

```sql
SELECT id, name, email, is_bot
FROM "user"
WHERE is_bot = true
ORDER BY id;
```

### 查看姓氏分布

```sql
SELECT
  SPLIT_PART(name, ' ', 2) as last_name,
  COUNT(*) as count
FROM "user"
WHERE is_bot = true
GROUP BY last_name
ORDER BY count DESC
LIMIT 20;
```

### 查看 ProductHunt 导入的项目及其创建者

```sql
SELECT
  p.id,
  p.name,
  p.created_by,
  u.name as creator_name,
  u.email as creator_email
FROM project p
INNER JOIN product_hunt_import phi ON p.id = phi.project_id
LEFT JOIN "user" u ON p.created_by = u.id
LIMIT 10;
```

### 查看虚拟互动统计

```sql
-- 点赞统计
SELECT
  u.name,
  COUNT(up.id) as upvote_count
FROM "user" u
LEFT JOIN upvote up ON u.id = up.user_id
WHERE u.is_bot = true
GROUP BY u.id, u.name
ORDER BY upvote_count DESC
LIMIT 10;

-- 评论统计
SELECT
  u.name,
  COUNT(fc.page) as comment_count
FROM "user" u
LEFT JOIN fuma_comments fc ON u.id = fc.author
WHERE u.is_bot = true
GROUP BY u.id, u.name
ORDER BY comment_count DESC
LIMIT 10;
```

## ⚠️ 注意事项

### 删除机器人账号的影响

如果删除机器人账号：

1. **ProductHunt 导入的项目**会失去创建者关联
2. **项目页面**可能无法显示创建者信息
3. **点赞和评论记录**会级联删除（取决于数据库约束）

### 修复方案

如果误删机器人账号导致项目创建者丢失：

```sql
-- 方案 1: 将无创建者的项目分配给 bot-user-1
UPDATE project
SET created_by = 'bot-user-1'
WHERE created_by NOT IN (SELECT id FROM "user");

-- 方案 2: 轮询重新分配给300个机器人
WITH numbered_projects AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM project
  WHERE created_by NOT IN (SELECT id FROM "user")
)
UPDATE project
SET created_by = 'bot-user-' || ((numbered_projects.rn - 1) % 300 + 1)
FROM numbered_projects
WHERE project.id = numbered_projects.id;
```

## 🎉 总结

- ✅ **300个机器人账号** - 统一管理，简单高效
- ✅ **多样化姓名** - 看起来像真实用户
- ✅ **双重用途** - ProductHunt 导入 + 虚拟互动
- ✅ **轮询分配** - 自动负载均衡
- ✅ **随机互动** - 模拟真实用户行为

这个统一的机器人系统为您的平台提供了自然、真实的用户体验！🚀
