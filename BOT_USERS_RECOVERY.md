# 机器人用户恢复指南

## 🚨 问题描述

如果您运行了旧版的 `delete-bot-users.ts` 脚本，可能会遇到以下问题：

1. **ProductHunt 自动发布的账号被误删**（ph-bot-1 到 ph-bot-5）
2. **已发布的项目失去创建者关联**
3. **项目页面可能报错** - 无法显示创建者信息

## ✅ 快速恢复方案

运行恢复脚本，它会：

- 重新创建 ProductHunt 使用的5个机器人账号
- 生成80个新的虚拟互动机器人账号
- 使用新的 ID 格式避免混淆

```bash
npx tsx scripts/restore-and-regenerate-bots.ts
```

## 📊 预期输出

```
🤖 Starting bot users restoration and regeneration...

📦 Step 1: Restoring ProductHunt bot users...
  ✅ Created: ProductHunt Bot 1 (ph-bot-1@aat.ee)
  ✅ Created: ProductHunt Bot 2 (ph-bot-2@aat.ee)
  ✅ Created: ProductHunt Bot 3 (ph-bot-3@aat.ee)
  ✅ Created: ProductHunt Bot 4 (ph-bot-4@aat.ee)
  ✅ Created: ProductHunt Bot 5 (ph-bot-5@aat.ee)

💬 Step 2: Creating virtual engagement bot users...
  ✅ Created: Alex Smith (bot1@aat.ee)
  ✅ Created: Blake Wang (bot2@aat.ee)
  ✅ Created: Casey Gonzalez (bot3@aat.ee)
  ... (共80个)

🎉 Bot users restoration and regeneration completed!

📊 Summary:
  ProductHunt Bots: 5 created, 0 already existed
  Engagement Bots: 80 created, 0 already existed
  Total: 85 created, 0 already existed
```

## 🔍 新的账号体系

### ProductHunt 自动发布账号（5个）

```
ID: ph-bot-1 到 ph-bot-5
Email: ph-bot-1@aat.ee 到 ph-bot-5@aat.ee
用途: ProductHunt 自动导入项目时使用
```

### 虚拟互动账号（80个）

```
ID: engagement-bot-1 到 engagement-bot-80
Email: bot1@aat.ee 到 bot80@aat.ee
姓名: 多样化的国际化姓名
用途: 虚拟点赞和评论
```

## ⚠️ 已发布项目的影响

### 问题

删除 ProductHunt 机器人账号后，已发布的项目会失去创建者关联，可能导致：

- 项目页面无法显示创建者信息
- 查询项目创建者时返回 null
- 页面可能报错或显示异常

### 解决方案

#### 选项 1：恢复机器人账号（推荐）

运行恢复脚本后，虽然 ID 不同（旧的可能是 `bot-user-1`，新的是 `ph-bot-1`），但您可以手动更新数据库中的项目创建者：

```sql
-- 查看受影响的项目（创建者不存在）
SELECT p.id, p.name, p.created_by
FROM project p
LEFT JOIN "user" u ON p.created_by = u.id
WHERE u.id IS NULL;

-- 如果需要，可以将这些项目分配给新的 ph-bot 账号
-- 示例：将无创建者的项目分配给 ph-bot-1
UPDATE project
SET created_by = 'ph-bot-1'
WHERE created_by NOT IN (SELECT id FROM "user");
```

#### 选项 2：批量修复 ProductHunt 导入的项目

如果您有 `product_hunt_import` 表记录：

```sql
-- 将 ProductHunt 导入的项目重新分配给 ph-bot 账号
-- 使用轮询方式分配
UPDATE project
SET created_by = 'ph-bot-' || ((ROW_NUMBER() OVER (ORDER BY created_at) - 1) % 5 + 1)
WHERE id IN (
  SELECT project_id FROM product_hunt_import
);
```

## 🔧 验证恢复结果

### 1. 检查机器人账号数量

```sql
SELECT COUNT(*) as total_bots FROM "user" WHERE is_bot = true;
-- 应该返回: 85 (5个 ProductHunt + 80个虚拟互动)
```

### 2. 检查账号分布

```sql
SELECT
  CASE
    WHEN id LIKE 'ph-bot-%' THEN 'ProductHunt Bot'
    WHEN id LIKE 'engagement-bot-%' THEN 'Engagement Bot'
    ELSE 'Other'
  END as bot_type,
  COUNT(*) as count
FROM "user"
WHERE is_bot = true
GROUP BY bot_type;
```

预期结果：

```
bot_type          | count
------------------+-------
ProductHunt Bot   |     5
Engagement Bot    |    80
```

### 3. 检查姓名多样性

```sql
SELECT name, email FROM "user"
WHERE is_bot = true AND id LIKE 'engagement-bot-%'
LIMIT 10;
```

应该看到多样化的姓名，而不是全部 "Chen"。

## 📝 最佳实践

### 今后删除机器人时

1. **不要直接删除所有 `isBot = true` 的用户**
2. **使用新的删除脚本**，它只删除 `engagement-bot-*`
3. **或者使用恢复脚本重新生成**

### 推荐工作流程

```bash
# 方式 1: 直接重新生成（推荐）
npx tsx scripts/restore-and-regenerate-bots.ts

# 方式 2: 先删除再生成
npx tsx scripts/delete-bot-users.ts  # 只删除 engagement-bot-*
npx tsx scripts/restore-and-regenerate-bots.ts
```

## 🎯 功能验证

恢复完成后，验证以下功能：

### 1. ProductHunt 自动导入

```bash
curl -X GET "https://www.aat.ee/api/cron/import-producthunt?secret=YOUR_CRON_SECRET"
```

应该能够成功导入项目并分配给 ph-bot 账号。

### 2. 虚拟点赞和评论

```bash
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement?secret=YOUR_CRON_SECRET"
```

应该能够成功添加点赞和评论。

### 3. 检查日志

查看是否有 "No bot users found" 错误。

## 💡 总结

- ✅ 运行 `restore-and-regenerate-bots.ts` 恢复所有机器人账号
- ✅ 使用新的 ID 格式区分不同用途的机器人
- ✅ ProductHunt 功能恢复正常
- ✅ 虚拟互动功能可以使用多样化姓名
- ⚠️ 如有需要，手动修复已发布项目的创建者关联

现在您的机器人系统已经恢复并优化！🎉
