# 邮件通知排除虚拟用户

## 🎯 修复说明

所有邮件通知功能现在都会自动排除虚拟用户（bot用户），避免向机器人账号发送不必要的邮件。

## ✅ 已修复的 API

### 1. 发送项目发布提醒 (`/api/cron/send-ongoing-reminders`)

**功能：** 提醒用户项目即将发布（发布前1天）

**修复内容：**

- ✅ 查询用户信息时，同时获取 `isBot` 字段
- ✅ 如果用户是 bot（`isBot = true`），跳过发送邮件
- ✅ 记录日志：`Skipping bot user {email} for project {name}`

**代码位置：** `app/api/cron/send-ongoing-reminders/route.ts`

### 2. 通知每日获奖者 (`/api/cron/send-winner-notifications`)

**功能：** 通知前一天的 Top 3 项目创建者

**修复内容：**

- ✅ 查询用户信息时，同时获取 `isBot` 字段
- ✅ 如果用户是 bot（`isBot = true`），跳过发送邮件
- ✅ 记录日志：`Skipping bot user {email} for project {name}`

**代码位置：** `app/api/cron/send-winner-notifications/route.ts`

## 🔧 实现细节

### 修复前

```typescript
const projectCreator = await db
  .select({
    email: user.email,
    name: user.name,
  })
  .from(user)
  .where(eq(user.id, projectCreatorId))
  .limit(1)
  .then((res) => res[0])

// 直接发送邮件，没有检查 isBot
await sendEmail({...})
```

### 修复后

```typescript
const projectCreator = await db
  .select({
    email: user.email,
    name: user.name,
    isBot: user.isBot,  // ✅ 添加 isBot 字段
  })
  .from(user)
  .where(eq(user.id, projectCreatorId))
  .limit(1)
  .then((res) => res[0])

// ✅ 检查是否为 bot 用户
if (projectCreator.isBot) {
  console.log(`Skipping bot user ${projectCreator.email} for project ${projectName}.`)
  continue
}

// 只向真实用户发送邮件
await sendEmail({...})
```

## 📊 影响范围

### 受影响的用户

- ✅ **虚拟用户（bot）** - 不再接收邮件通知

  - `bot1@aat.ee` ~ `bot80@aat.ee`
  - `ph-bot-1@aat.ee` ~ `ph-bot-5@aat.ee`（如果存在）
  - 所有 `is_bot = true` 的用户

- ✅ **真实用户** - 正常接收邮件通知
  - 所有 `is_bot = false` 或 `is_bot IS NULL` 的用户

### 邮件类型

以下邮件会排除 bot 用户：

1. ✅ **项目发布提醒邮件**

   - 当项目即将发布时（发布前1天）
   - 提醒用户项目即将上线

2. ✅ **获奖者通知邮件**
   - 当项目获得 Top 3 排名时
   - 通知用户项目获奖

## 🧪 测试验证

### 测试场景 1: Bot 用户的项目

```sql
-- 创建一个 bot 用户的项目（用于测试）
-- 注意：这只是一个测试查询，实际项目中 bot 用户的项目会自动被排除

-- 查看 bot 用户的项目
SELECT
  p.name,
  p.scheduled_launch_date,
  u.email,
  u.is_bot
FROM project p
INNER JOIN "user" u ON p.created_by = u.id
WHERE u.is_bot = true
  AND p.launch_status = 'ongoing'
LIMIT 5;
```

**预期结果：**

- Bot 用户的项目不会触发邮件发送
- 日志中会显示：`Skipping bot user {email} for project {name}`

### 测试场景 2: 真实用户的项目

```sql
-- 查看真实用户的项目
SELECT
  p.name,
  p.scheduled_launch_date,
  u.email,
  u.is_bot
FROM project p
INNER JOIN "user" u ON p.created_by = u.id
WHERE (u.is_bot = false OR u.is_bot IS NULL)
  AND p.launch_status = 'ongoing'
LIMIT 5;
```

**预期结果：**

- 真实用户的项目会正常发送邮件
- 邮件发送成功，记录在日志中

### 手动测试

```bash
# 测试发送提醒邮件（应该跳过 bot 用户）
curl -X GET "https://www.aat.ee/api/cron/send-ongoing-reminders" \
  -H "Authorization: Bearer $CRON_API_KEY"

# 测试发送获奖通知（应该跳过 bot 用户）
curl -X GET "https://www.aat.ee/api/cron/send-winner-notifications" \
  -H "Authorization: Bearer $CRON_API_KEY"
```

**查看日志：**

```bash
# 在应用日志中查找
grep "Skipping bot user" logs/app.log
```

## 📈 预期效果

### 邮件发送统计

修复后，邮件发送统计会显示：

```json
{
  "message": "Launch reminder process completed.",
  "details": {
    "projectsFound": 10, // 包括 bot 和真实用户的项目
    "emailsSent": 7, // 只发送给真实用户
    "emailsFailed": 0
  }
}
```

**说明：**

- `projectsFound` - 所有符合条件的项目（包括 bot 用户的项目）
- `emailsSent` - 实际发送的邮件数（排除 bot 用户）
- 差值 = 被跳过的 bot 用户项目数

### 日志输出示例

```
[2025-01-15T10:00:00Z] Starting cron: Send Ongoing Launch Reminders
Found 5 ongoing projects to remind.
Skipping bot user bot1@aat.ee for project ProductHunt Import #1.
Sending launch reminder email to realuser@example.com for project My Project.
Skipping bot user bot2@aat.ee for project ProductHunt Import #2.
Sending launch reminder email to anotheruser@example.com for project Another Project.
[2025-01-15T10:00:05Z] Launch reminder process completed.
- Emails sent successfully: 2
- Emails failed: 0
```

## ⚠️ 注意事项

### 1. Bot 用户的项目仍然有效

- ✅ Bot 用户的项目仍然会正常显示在平台上
- ✅ 项目的功能不受影响
- ✅ 只是不会发送邮件通知

### 2. 历史数据

如果之前已经向 bot 用户发送过邮件，这些邮件已经发送，无法撤回。但从现在开始，不会再向 bot 用户发送邮件。

### 3. 日志记录

所有跳过的 bot 用户都会记录在日志中，方便追踪和调试。

## 🔍 验证清单

- [x] 代码已修复（两个 API 都添加了 bot 用户检查）
- [x] 构建成功
- [ ] 已测试真实用户正常接收邮件
- [ ] 已验证 bot 用户被跳过
- [ ] 已检查日志输出

## 📚 相关文档

- [BOT_USERS_GUIDE.md](./BOT_USERS_GUIDE.md) - 机器人账号管理
- [CRON_JOB_ORG_SETUP.md](./CRON_JOB_ORG_SETUP.md) - Cron 任务配置
- [VIRTUAL_ENGAGEMENT.md](./VIRTUAL_ENGAGEMENT.md) - 虚拟互动功能

---

**修复完成！** 现在所有邮件通知都会自动排除虚拟用户，节省邮件配额并避免不必要的通知。🎉
