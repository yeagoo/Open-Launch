# ProductHunt 机器人账号恢复指南

## 📦 目的

恢复被误删的 ProductHunt 自动发布使用的5个机器人账号。

## 🚀 快速恢复

```bash
npx tsx scripts/restore-ph-bots.ts
```

## 📊 预期输出

```
📦 Restoring ProductHunt bot users...

✅ Created: ProductHunt Bot 1 (ph-bot-1@aat.ee)
✅ Created: ProductHunt Bot 2 (ph-bot-2@aat.ee)
✅ Created: ProductHunt Bot 3 (ph-bot-3@aat.ee)
✅ Created: ProductHunt Bot 4 (ph-bot-4@aat.ee)
✅ Created: ProductHunt Bot 5 (ph-bot-5@aat.ee)

🎉 ProductHunt bot users restoration completed!

📊 Summary:
  Created: 5
  Already existed: 0
  Total: 5

✅ ProductHunt auto-import feature is now ready to use
```

## 🔍 创建的账号

| ID       | 名称              | 邮箱            | 用途       |
| -------- | ----------------- | --------------- | ---------- |
| ph-bot-1 | ProductHunt Bot 1 | ph-bot-1@aat.ee | PH自动导入 |
| ph-bot-2 | ProductHunt Bot 2 | ph-bot-2@aat.ee | PH自动导入 |
| ph-bot-3 | ProductHunt Bot 3 | ph-bot-3@aat.ee | PH自动导入 |
| ph-bot-4 | ProductHunt Bot 4 | ph-bot-4@aat.ee | PH自动导入 |
| ph-bot-5 | ProductHunt Bot 5 | ph-bot-5@aat.ee | PH自动导入 |

## ⚠️ 重要：修复已发布项目

如果在删除旧账号前已经通过 ProductHunt 自动导入发布了项目，这些项目的 `created_by` 字段现在指向不存在的用户 ID。

### 方案1：将所有无效创建者的项目分配给 ph-bot-1

```sql
-- 查看受影响的项目数量
SELECT COUNT(*)
FROM project
WHERE created_by NOT IN (SELECT id FROM "user");

-- 修复：将这些项目分配给 ph-bot-1
UPDATE project
SET created_by = 'ph-bot-1'
WHERE created_by NOT IN (SELECT id FROM "user");
```

### 方案2：根据 ProductHunt 导入记录修复

如果您有 `product_hunt_import` 表：

```sql
-- 查看 ProductHunt 导入的项目中有多少创建者失效
SELECT COUNT(*)
FROM project p
INNER JOIN product_hunt_import phi ON p.id = phi.project_id
WHERE p.created_by NOT IN (SELECT id FROM "user");

-- 修复：轮询分配给5个 ph-bot
UPDATE project
SET created_by = 'ph-bot-' || ((ROW_NUMBER() OVER (ORDER BY created_at) - 1) % 5 + 1)
WHERE id IN (
  SELECT p.id
  FROM project p
  INNER JOIN product_hunt_import phi ON p.id = phi.project_id
  WHERE p.created_by NOT IN (SELECT id FROM "user")
);
```

### 方案3：只修复 ProductHunt 导入的项目（推荐）

```sql
-- 更精准的修复：只修复确实是 ProductHunt 导入的项目
UPDATE project
SET created_by = 'ph-bot-1'
WHERE created_by NOT IN (SELECT id FROM "user")
  AND id IN (SELECT project_id FROM product_hunt_import);
```

## 🔧 验证恢复结果

### 1. 检查 ProductHunt 机器人账号

```sql
SELECT id, name, email, is_bot
FROM "user"
WHERE id LIKE 'ph-bot-%'
ORDER BY id;
```

预期结果：5行记录

### 2. 检查 ProductHunt 导入功能

手动触发一次导入测试：

```bash
curl -X GET "https://www.aat.ee/api/cron/import-producthunt?secret=YOUR_CRON_SECRET"
```

检查日志中是否有：

- ✅ "Found X bot users"（应该至少找到5个）
- ❌ "No bot users found"（不应该出现）

### 3. 检查项目创建者

```sql
-- 查看 ProductHunt 导入的项目及其创建者
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

所有项目都应该有有效的 `creator_name` 和 `creator_email`。

## 📈 现在可以正常使用的功能

- ✅ ProductHunt 自动导入
- ✅ 轮询分配项目给5个机器人账号
- ✅ 项目页面显示创建者信息（修复后）
- ✅ 已发布项目不会报错（修复后）

## 🎯 总结

1. ✅ 运行 `npx tsx scripts/restore-ph-bots.ts` 恢复5个 ProductHunt 机器人
2. ✅ 运行 SQL 修复已发布项目的创建者关联
3. ✅ 验证 ProductHunt 自动导入功能正常
4. ✅ 虚拟互动功能使用独立的80个账号，互不影响

现在 ProductHunt 自动发布功能已恢复正常！🎉
