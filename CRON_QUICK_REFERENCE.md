# Cron 定时任务快速参考

## 🎯 需要配置的 5 个任务

### 1️⃣ ProductHunt 自动导入

```
URL: https://www.aat.ee/api/cron/import-producthunt
频率: 每天 1 次
时间: 17:00 UTC (太平洋时间 09:00)
Header: Authorization: Bearer YOUR_SECRET
超时: 120 秒
```

### 2️⃣ 虚拟互动（点赞 + 评论）

```
URL: https://www.aat.ee/api/cron/simulate-engagement
频率: 每 2 小时
时间: 00:00, 02:00, 04:00, 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00
Header: x-cron-secret: YOUR_SECRET
超时: 60 秒
```

### 3️⃣ 更新项目状态

```
URL: https://www.aat.ee/api/cron/update-launches
频率: 每小时
时间: 每小时整点
Header: Authorization: Bearer YOUR_SECRET
超时: 30 秒
```

### 4️⃣ 发送提醒邮件

```
URL: https://www.aat.ee/api/cron/send-ongoing-reminders
频率: 每天 1 次
时间: 09:00 UTC
Header: Authorization: Bearer YOUR_SECRET
超时: 60 秒
```

### 5️⃣ 通知每日获奖者

```
URL: https://www.aat.ee/api/cron/send-winner-notifications
频率: 每天 1 次
时间: 01:00 UTC（推荐）
Header: Authorization: Bearer YOUR_SECRET
超时: 60 秒
说明: 通知前一天 Top 3 项目的创建者
```

## 📋 通用配置

### 所有任务的共同设置：

1. **Request Method:** `GET`
2. **Headers:** 根据 API 类型选择
   - **大部分 API** (ProductHunt, 更新状态, 邮件):
     ```
     Key: Authorization
     Value: Bearer <你的 CRON_SECRET 值>
     ```
   - **虚拟互动 API**:
     ```
     Key: x-cron-secret
     Value: <你的 CRON_SECRET 值>
     ```
3. **Notifications:** 选择 "On failure"（只在失败时通知）

## 🔍 快速测试

```bash
# 设置变量
export CRON_SECRET="your-cron-secret-here"
export API_URL="https://www.aat.ee"

# 测试 ProductHunt 导入（使用 Authorization: Bearer）
curl -X GET "$API_URL/api/cron/import-producthunt" \
  -H "Authorization: Bearer $CRON_SECRET"

# 测试虚拟互动（使用 x-cron-secret）
curl -X GET "$API_URL/api/cron/simulate-engagement" \
  -H "x-cron-secret: $CRON_SECRET"

# 测试状态更新（使用 Authorization: Bearer）
curl -X GET "$API_URL/api/cron/update-launches" \
  -H "Authorization: Bearer $CRON_SECRET"

# 测试提醒邮件（使用 Authorization: Bearer）
curl -X GET "$API_URL/api/cron/send-ongoing-reminders" \
  -H "Authorization: Bearer $CRON_SECRET"

# 测试获奖通知（使用 Authorization: Bearer）
curl -X GET "$API_URL/api/cron/send-winner-notifications" \
  -H "Authorization: Bearer $CRON_SECRET"
```

## ✅ 验证清单

- [ ] 在 `.env` 中设置了 `CRON_SECRET`
- [ ] 在 `.env` 中设置了 `PRODUCTHUNT_API_KEY`（如需 PH 导入）
- [ ] 在 `.env` 中设置了 `DEEPSEEK_API_KEY`（用于 AI 评论）
- [ ] 已生成 80 个机器人账号（`npx tsx scripts/seed-bot-users.ts`）
- [ ] 已在 cron-job.org 注册账号
- [ ] 已创建所有 5 个定时任务
- [ ] 每个任务都设置了正确的 `x-cron-secret` Header
- [ ] 已配置邮件通知（失败时）
- [ ] 已手动测试所有 API 端点

## 📊 预期结果

### ProductHunt 导入（每天 17:00 后）

```sql
-- 应该看到最近导入的项目
SELECT name, created_at FROM project
WHERE created_by IN (SELECT id FROM "user" WHERE is_bot = true)
ORDER BY created_at DESC LIMIT 5;
```

### 虚拟互动（每 2 小时后）

```sql
-- 点赞数
SELECT COUNT(*) FROM upvote WHERE created_at > NOW() - INTERVAL '2 hours';

-- 评论数
SELECT COUNT(*) FROM fuma_comments WHERE timestamp > NOW() - INTERVAL '2 hours';
```

## 🐛 常见问题

| 错误                      | 原因                     | 解决方案                                                                                      |
| ------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| 401 Unauthorized          | Header 格式或值错误      | ProductHunt/状态/邮件 API 使用 `Authorization: Bearer xxx`，虚拟互动使用 `x-cron-secret: xxx` |
| 500 Internal Server Error | 环境变量缺失或数据库问题 | 查看应用日志，检查环境变量                                                                    |
| Timeout                   | 响应时间过长             | 增加超时时间（ProductHunt 需要 120 秒）                                                       |
| No data imported          | API Key 问题或时间不对   | 检查 PRODUCTHUNT_API_KEY，确保在 UTC 17:00 运行                                               |

## 📱 监控面板

访问 cron-job.org 查看：

- ✅ 执行历史
- 📊 成功/失败统计
- ⏱️ 响应时间
- 📧 邮件通知记录

---

**详细文档：** [CRON_JOB_ORG_SETUP.md](./CRON_JOB_ORG_SETUP.md)
