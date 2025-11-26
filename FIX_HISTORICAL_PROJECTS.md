# 修复历史项目创建者指南

## 📋 问题说明

在迁移到统一的80个虚拟账号体系后，历史上通过 ProductHunt 自动发布的项目可能存在以下问题：

1. **创建者 ID 不存在** - `created_by` 字段指向已删除的旧账号
2. **项目页面报错** - 无法显示创建者信息
3. **查询失败** - JOIN 查询返回 NULL

## ✅ 自动修复脚本

我们提供了一个自动化脚本来修复所有受影响的项目。

### 运行修复脚本

```bash
npx tsx scripts/fix-project-creators.ts
```

### 预期输出

```
🔧 Starting project creators fix...

✅ Found 80 bot users

⚠️  Found 15 projects with invalid creators

📋 Projects to be fixed:
  - Amazing AI Tool (abc-123) - old creator: bot-user-1
  - Cool SaaS Product (def-456) - old creator: ph-bot-2
  - Awesome App (ghi-789) - old creator: bot-user-3
  ... and 12 more

🔄 Reassigning projects to bot users...
  ✅ Fixed: Amazing AI Tool → Alex Smith (bot1@aat.ee)
  ✅ Fixed: Cool SaaS Product → Blake Wang (bot2@aat.ee)
  ✅ Fixed: Awesome App → Casey Gonzalez (bot3@aat.ee)
  ... (继续)

🎉 Project creators fix completed!

📊 Summary:
  Total bot users: 80
  Projects fixed: 15
  Distribution: Each bot user got ~1 projects

🔍 Verifying fix...
✅ All projects now have valid creators!
```

## 🔧 脚本工作原理

### 1. 查找受影响的项目

```typescript
// 找到所有创建者不存在的项目
const orphanProjects = await db
  .select()
  .from(project)
  .where(notInArray(project.createdBy, validUserIds))
```

### 2. 轮询分配给虚拟账号

```typescript
// 轮流分配给80个虚拟账号
for (let i = 0; i < orphanProjects.length; i++) {
  const botUser = botUsers[i % botUsers.length]
  await db.update(project).set({ createdBy: botUser.id })
}
```

### 3. 验证修复结果

脚本会自动验证所有项目都有有效的创建者。

## 📊 手动检查（可选）

如果您想在运行脚本前检查受影响的项目数量：

```sql
-- 查看有多少项目的创建者不存在
SELECT COUNT(*)
FROM project
WHERE created_by NOT IN (SELECT id FROM "user");

-- 查看受影响的具体项目
SELECT
  p.id,
  p.name,
  p.created_by as old_creator_id,
  p.created_at
FROM project p
WHERE p.created_by NOT IN (SELECT id FROM "user")
ORDER BY p.created_at DESC
LIMIT 10;
```

## 🔍 修复后验证

### 1. 检查所有项目都有有效创建者

```sql
-- 应该返回 0
SELECT COUNT(*)
FROM project
WHERE created_by NOT IN (SELECT id FROM "user");
```

### 2. 查看项目创建者分布

```sql
SELECT
  u.name as creator_name,
  u.email,
  COUNT(p.id) as project_count
FROM "user" u
LEFT JOIN project p ON u.id = p.created_by
WHERE u.is_bot = true
GROUP BY u.id, u.name, u.email
ORDER BY project_count DESC
LIMIT 20;
```

### 3. 查看 ProductHunt 导入的项目

```sql
SELECT
  p.name,
  u.name as creator_name,
  u.email as creator_email,
  phi.product_hunt_url,
  p.created_at
FROM project p
INNER JOIN product_hunt_import phi ON p.id = phi.project_id
LEFT JOIN "user" u ON p.created_by = u.id
ORDER BY p.created_at DESC
LIMIT 10;
```

所有项目都应该显示有效的 `creator_name` 和 `creator_email`。

## ⚠️ 注意事项

### 运行前提条件

1. ✅ 已生成80个虚拟账号

   ```bash
   npx tsx scripts/seed-bot-users.ts
   ```

2. ✅ 数据库连接正常
   ```bash
   echo $DATABASE_URL
   ```

### 安全性

- ✅ **只修复无效的创建者** - 不会影响有效的项目
- ✅ **保留原始数据** - 可以通过 `product_hunt_import` 表追溯
- ✅ **轮询分配** - 确保负载均衡
- ✅ **自动验证** - 修复后自动检查结果

### 备份建议

虽然脚本只更新无效的创建者，但建议在运行前备份数据库：

```bash
# PostgreSQL 备份示例
pg_dump $DATABASE_URL > backup_before_fix_$(date +%Y%m%d).sql
```

## 🎯 ProductHunt 自动发布已更新

**好消息：** ProductHunt 自动发布的代码逻辑已经正确配置！

```typescript
// app/api/cron/import-producthunt/route.ts
const botUsers = await db.select().from(user).where(eq(user.isBot, true))
const botUser = botUsers[i % botUsers.length] // 轮询使用80个账号
```

**这意味着：**

- ✅ 新导入的项目会自动使用80个虚拟账号
- ✅ 轮询分配，自动负载均衡
- ✅ 无需任何额外配置

## 📈 完整迁移步骤

如果您是从旧的账号体系迁移过来：

```bash
# 1. 删除旧的机器人账号
npx tsx scripts/delete-bot-users.ts

# 2. 生成新的80个虚拟账号
npx tsx scripts/seed-bot-users.ts

# 3. 修复历史项目的创建者
npx tsx scripts/fix-project-creators.ts

# 4. 验证结果
psql $DATABASE_URL -c "SELECT COUNT(*) FROM project WHERE created_by NOT IN (SELECT id FROM \"user\");"
# 应该返回: 0
```

## 🎉 总结

运行修复脚本后：

- ✅ 所有历史项目都有有效的创建者
- ✅ 项目页面正常显示
- ✅ 查询不会返回 NULL
- ✅ ProductHunt 自动导入使用新账号
- ✅ 虚拟互动功能正常工作

您的系统现在完全迁移到统一的80个虚拟账号体系了！🚀
