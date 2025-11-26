# 机器人用户管理指南

## 📦 统一的机器人账号体系

Open-Launch 使用 **80个虚拟机器人账号**，同时服务于：

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
✅ Created bot user: Casey Gonzalez (bot3@aat.ee)
... (共80个)
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

| 属性           | 值                                                                                    |
| -------------- | ------------------------------------------------------------------------------------- |
| **数量**       | 80个                                                                                  |
| **ID 格式**    | `engagement-bot-1` ~ `engagement-bot-80`                                              |
| **Email 格式** | `bot1@aat.ee` ~ `bot80@aat.ee`                                                        |
| **姓名示例**   | Alex Smith, Blake Wang, Casey Gonzalez, Drew Brown, Evan Hernandez 等                 |
| **姓氏分布**   | 欧美 (30), 亚洲 (30), 拉美 (20)                                                       |
| **角色**       | Developer, Designer, Entrepreneur, Product Manager, Engineer, Founder, Maker, Creator |

## 🎯 使用场景

### 1. ProductHunt 自动导入 ✅

**代码已就绪！** ProductHunt 导入逻辑已经配置为使用80个虚拟账号：

```typescript
// app/api/cron/import-producthunt/route.ts (第56行)
const botUsers = await db.select().from(user).where(eq(user.isBot, true))

// (第108行) 轮询分配给机器人账号
const botUser = botUsers[i % botUsers.length]
```

**特点：**

- ✅ 自动查询所有 `is_bot = true` 的用户（80个）
- ✅ 轮流分配，自动负载均衡
- ✅ 每个导入的项目都有不同的"创建者"
- ✅ 使项目看起来更自然
- ✅ **无需任何修改，开箱即用**

### 2. 虚拟点赞

每2小时运行一次，随机选择6个项目：

```bash
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement?secret=SECRET"
```

**逻辑：**

- 随机选择6个今天/昨天发布的项目
- 每个项目获得1-3个随机机器人点赞
- 允许重复点赞

### 3. 虚拟评论

每2小时运行一次，3个随机用户评论：

```bash
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement?secret=SECRET"
```

**逻辑：**

- 随机选择3个独特的机器人用户
- 在今天/昨天发布的项目上评论
- AI 生成英文评论（3-20个单词）
- 防止重复评论

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
-- 方案 1: 将无创建者的项目分配给 engagement-bot-1
UPDATE project
SET created_by = 'engagement-bot-1'
WHERE created_by NOT IN (SELECT id FROM "user");

-- 方案 2: 轮询重新分配给80个机器人
WITH numbered_projects AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM project
  WHERE created_by NOT IN (SELECT id FROM "user")
)
UPDATE project
SET created_by = 'engagement-bot-' || ((numbered_projects.rn - 1) % 80 + 1)
FROM numbered_projects
WHERE project.id = numbered_projects.id;
```

## 🎉 总结

- ✅ **80个机器人账号** - 统一管理，简单高效
- ✅ **多样化姓名** - 看起来像真实用户
- ✅ **双重用途** - ProductHunt 导入 + 虚拟互动
- ✅ **轮询分配** - 自动负载均衡
- ✅ **随机互动** - 模拟真实用户行为

这个统一的机器人系统为您的平台提供了自然、真实的用户体验！🚀
