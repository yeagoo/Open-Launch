# 机器人用户重新生成指南

## 📦 统一的机器人账号体系

系统现在使用 **80个虚拟机器人账号**，同时服务于：

- ✅ ProductHunt 自动发布
- ✅ 虚拟点赞和评论

不再需要单独的 ProductHunt 专用账号。

## 问题说明

初始版本的机器人用户生成脚本存在逻辑错误，导致所有用户都使用了"Chen"姓氏。新版本已修复此问题，现在使用多样化的国际化姓名。

## 姓名库分布

新版本包含80个姓氏，来自世界各地：

### 欧美姓氏（30个）

Smith, Johnson, Williams, Brown, Jones, Garcia, Miller, Davis, Rodriguez, Martinez, Anderson, Taylor, Thomas, Moore, Jackson, Martin, Lee, Thompson, White, Harris, Clark, Lewis, Walker, Hall, Allen, Young, King, Wright, Scott, Green

### 亚洲姓氏（30个）

Chen, Wang, Li, Zhang, Liu, Yang, Huang, Wu, Zhou, Xu, Sun, Ma, Zhu, Hu, Guo, He, Kim, Park, Choi, Jung, Kang, Cho, Yoon, Jang, Tanaka, Suzuki, Takahashi, Watanabe, Ito, Yamamoto

### 拉美姓氏（20个）

Gonzalez, Hernandez, Lopez, Perez, Sanchez, Ramirez, Torres, Flores, Rivera, Gomez, Diaz, Cruz, Morales, Reyes, Gutierrez, Ortiz, Alvarez, Castillo, Ruiz, Mendoza

## 重新生成步骤

### 步骤1：删除现有机器人用户

```bash
npx tsx scripts/delete-bot-users.ts
```

**预期输出：**

```
🗑️  Starting bot users deletion...
✅ All bot users deleted successfully!
📊 Deleted users count: 80
```

### 步骤2：生成新的机器人用户

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

### 步骤3：验证生成结果

在数据库中检查机器人用户：

```sql
-- 查看所有机器人用户
SELECT id, name, email, role
FROM "user"
WHERE is_bot = true
ORDER BY id
LIMIT 10;

-- 统计姓氏分布
SELECT
  SPLIT_PART(name, ' ', 2) as last_name,
  COUNT(*) as count
FROM "user"
WHERE is_bot = true
GROUP BY last_name
ORDER BY count DESC;
```

**预期结果：**

- 应该看到多样化的姓氏，而不是全部都是"Chen"
- 姓氏应该来自欧美、亚洲和拉美

## 生成逻辑说明

新版本使用质数偏移算法确保姓名组合多样化：

```typescript
const firstNameIndex = i % FIRST_NAMES.length
const lastNameIndex = (i * 7 + 13) % LAST_NAMES.length // 使用质数7和13避免重复模式
```

这确保了：

- 80个用户使用80个不同的名字
- 姓氏均匀分布在80个姓氏库中
- 没有重复的姓名组合

## 示例生成结果

```
bot1@aat.ee  - Alex Smith
bot2@aat.ee  - Blake Wang
bot3@aat.ee  - Casey Gonzalez
bot4@aat.ee  - Drew Brown
bot5@aat.ee  - Evan Hernandez
bot6@aat.ee  - Finn Zhang
bot7@aat.ee  - Grey Garcia
bot8@aat.ee  - Harper Flores
bot9@aat.ee  - Indie Liu
bot10@aat.ee - Jules Miller
...
```

## 注意事项

1. **生产环境操作**：如果在生产环境执行此操作，请确保：

   - 已备份数据库
   - 在低流量时段进行
   - 删除操作会清除所有 `is_bot = true` 的用户

2. **关联数据**：删除机器人用户会级联删除：

   - 该用户的所有点赞记录
   - 该用户的所有评论记录
   - 该用户提交的项目（如果有）

3. **虚拟互动**：重新生成后，虚拟点赞和评论功能会立即使用新的机器人用户。

## 验证脚本

如果需要快速验证姓氏分布，可以使用以下命令：

```bash
# 查看前20个用户的名字
npx tsx -e "
import { db } from './drizzle/db';
import { user } from './drizzle/db/schema';
import { eq } from 'drizzle-orm';

const bots = await db.select().from(user).where(eq(user.isBot, true)).limit(20);
bots.forEach(bot => console.log(\`\${bot.email} - \${bot.name}\`));
process.exit(0);
"
```

## 完成确认

重新生成完成后，您应该看到：

- ✅ 80个机器人用户
- ✅ 多样化的国际化姓名
- ✅ 姓氏来自欧美、亚洲和拉美
- ✅ 没有"全是Chen"的问题

现在虚拟互动功能可以正常使用了！🎉
