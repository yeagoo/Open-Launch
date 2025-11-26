# Cron-Job.org 定时任务配置指南

本指南将帮助您在 cron-job.org 上配置 Open-Launch 的所有自动化任务。

## 📋 准备工作

### 1. 注册 Cron-Job.org 账号

访问 https://cron-job.org/en/ 并注册账号（免费）

### 2. 获取必要的环境变量

确保您的 `.env` 文件中已配置：

```env
# 定时任务密钥（用于认证）
CRON_SECRET=your-secure-random-string-here

# ProductHunt API 密钥（如需 PH 自动导入）
PRODUCTHUNT_API_KEY=your-producthunt-api-key

# DeepSeek API 密钥（用于 AI 评论生成）
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-chat
```

### 3. 确保机器人账号已创建

```bash
# 生成 80 个虚拟账号
npx tsx scripts/seed-bot-users.ts
```

## 🎯 需要配置的定时任务

Open-Launch 有以下自动化任务：

| 任务                      | 用途                       | 运行频率  | API 端点                              |
| ------------------------- | -------------------------- | --------- | ------------------------------------- |
| **ProductHunt 自动导入**  | 每日导入 ProductHunt Top 5 | 每天 1 次 | `/api/cron/import-producthunt`        |
| **虚拟互动（点赞+评论）** | 模拟用户点赞和评论         | 每 2 小时 | `/api/cron/simulate-engagement`       |
| **更新项目状态**          | 更新即将发布/已发布状态    | 每小时    | `/api/cron/update-launches`           |
| **发送提醒邮件**          | 提醒项目即将发布           | 每天 1 次 | `/api/cron/send-ongoing-reminders`    |
| **通知获奖者**            | 通知周冠军获得者           | 每周 1 次 | `/api/cron/send-winner-notifications` |

## 🚀 详细配置步骤

### 任务 1: ProductHunt 自动导入 📦

**目的：** 每天自动导入 ProductHunt 的 Top 5 产品

#### 步骤：

1. 登录 cron-job.org，点击 **"Create cronjob"**

2. **基本信息：**
   - **Title:** `ProductHunt Daily Import`
   - **Address (URL):** `https://www.aat.ee/api/cron/import-producthunt`
3. **时间设置：**

   - **Schedule:** 选择 "Every day"
   - **Time:** 选择 `17:00` (UTC 17:00 = 太平洋时间 09:00)
   - 💡 **为什么选这个时间？** ProductHunt 基于太平洋时间，每天数据在 UTC 17:00 左右最稳定

4. **高级设置：**

   - 点击 **"Advanced"**
   - **Request method:** `GET`
   - **Headers:** 添加 Authorization 头部
     ```
     Key: Authorization
     Value: Bearer your-cron-secret-here
     ```
   - 💡 **注意：** 这里的 Value 格式是 `Bearer ` 加上您的 `CRON_SECRET` 值
   - **Request timeout:** `120` 秒（导入需要上传图片，可能较慢）

5. **通知设置：**

   - **Execution:** 选择 "On failure" (只在失败时通知)
   - **Email:** 填写您的邮箱

6. **保存：** 点击 **"Create cronjob"**

#### 验证：

```bash
# 手动测试 API
curl -X GET "https://www.aat.ee/api/cron/import-producthunt" \
  -H "Authorization: Bearer your-cron-secret-here"
```

---

### 任务 2: 虚拟互动（点赞 + 评论）💬

**目的：** 每 2 小时模拟用户点赞和评论，增加平台活跃度

#### 步骤：

1. 点击 **"Create cronjob"**

2. **基本信息：**

   - **Title:** `Virtual Engagement (Upvotes + Comments)`
   - **Address (URL):** `https://www.aat.ee/api/cron/simulate-engagement`

3. **时间设置：**

   - **Schedule:** 选择 "Every X hours"
   - **Hours:** `2` (每 2 小时)
   - **Starting time:** `00:00` (从午夜开始)
   - 💡 **执行时间：** 00:00, 02:00, 04:00, 06:00, 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00, 22:00

4. **高级设置：**

   - **Request method:** `GET`
   - **Headers:**
     ```
     Key: x-cron-secret
     Value: your-cron-secret-here
     ```
   - 💡 **注意：** 虚拟互动 API 使用 `x-cron-secret` header（不需要 `Bearer` 前缀）
   - **Request timeout:** `60` 秒

5. **通知设置：**

   - **Execution:** 选择 "On failure"
   - **Email:** 填写您的邮箱

6. **保存：** 点击 **"Create cronjob"**

#### 功能说明：

每次运行会：

- 🎯 随机选择 6 个今天/昨天发布的项目进行点赞
- 💬 随机选择 3 个机器人用户发布 AI 生成的英文评论（3-20 个单词）
- 🔄 自动刷新缓存

#### 验证：

```bash
# 手动测试 API
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement" \
  -H "x-cron-secret: your-cron-secret-here"
```

---

### 任务 3: 更新项目状态 🔄

**目的：** 自动更新项目的发布状态（即将发布 → 正在发布 → 已发布）

#### 步骤：

1. 点击 **"Create cronjob"**

2. **基本信息：**

   - **Title:** `Update Project Launch Status`
   - **Address (URL):** `https://www.aat.ee/api/cron/update-launches`

3. **时间设置：**

   - **Schedule:** 选择 "Every hour"
   - **Starting time:** `00:00`
   - 💡 **执行频率：** 每小时一次，确保状态及时更新

4. **高级设置：**

   - **Request method:** `GET`
   - **Headers:**
     ```
     Key: Authorization
     Value: Bearer your-cron-secret-here
     ```
   - **Request timeout:** `30` 秒

5. **保存：** 点击 **"Create cronjob"**

---

### 任务 4: 发送项目提醒邮件 📧

**目的：** 提醒用户项目即将发布（发布前 1 天）

#### 步骤：

1. 点击 **"Create cronjob"**

2. **基本信息：**

   - **Title:** `Send Launch Reminder Emails`
   - **Address (URL):** `https://www.aat.ee/api/cron/send-ongoing-reminders`

3. **时间设置：**

   - **Schedule:** 选择 "Every day"
   - **Time:** `09:00` (UTC 上午 9 点)

4. **高级设置：**

   - **Request method:** `GET`
   - **Headers:**
     ```
     Key: Authorization
     Value: Bearer your-cron-secret-here
     ```
   - **Request timeout:** `60` 秒

5. **保存：** 点击 **"Create cronjob"**

---

### 任务 5: 通知每日获奖者 🏆

**目的：** 通知前一天的 Top 3 项目创建者（日排名第 1, 2, 3 名）

**逻辑说明：**

- 查找昨天发布的项目中 `dailyRanking` 为 1, 2, 3 的项目
- 发送获奖徽章邮件给项目创建者
- 邮件包含排名信息和项目链接

#### 步骤：

1. 点击 **"Create cronjob"**

2. **基本信息：**

   - **Title:** `Send Daily Winner Notifications`
   - **Address (URL):** `https://www.aat.ee/api/cron/send-winner-notifications`

3. **时间设置（推荐）：**

   - **Schedule:** 选择 "Every day"
   - **Time:** `01:00` (UTC 凌晨 1 点)
   - 💡 **为什么选这个时间？**
     - 前一天的项目排名已经稳定
     - 避开业务高峰期
     - 用户会在早上看到获奖邮件（激动人心的开始！）

   **备选时间：**

   - `00:30` UTC - 如果您希望尽早发送
   - `02:00` UTC - 如果担心排名还在变化

4. **高级设置：**

   - **Request method:** `GET`
   - **Headers:**
     ```
     Key: Authorization
     Value: Bearer your-cron-secret-here
     ```
   - **Request timeout:** `60` 秒

5. **保存：** 点击 **"Create cronjob"**

---

## 📊 完整配置总览

配置完成后，您的 cron-job.org 面板应该有以下 5 个任务：

| 任务名称                   | URL                                   | 频率      | 时间 (UTC)      | Header 格式                 |
| -------------------------- | ------------------------------------- | --------- | --------------- | --------------------------- |
| ProductHunt Daily Import   | `/api/cron/import-producthunt`        | 每天      | 17:00           | `Authorization: Bearer xxx` |
| Virtual Engagement         | `/api/cron/simulate-engagement`       | 每 2 小时 | 00:00, 02:00... | `x-cron-secret: xxx`        |
| Update Launch Status       | `/api/cron/update-launches`           | 每小时    | 每小时整点      | `Authorization: Bearer xxx` |
| Launch Reminder Emails     | `/api/cron/send-ongoing-reminders`    | 每天      | 09:00           | `Authorization: Bearer xxx` |
| Daily Winner Notifications | `/api/cron/send-winner-notifications` | 每天      | 01:00           | `Authorization: Bearer xxx` |

### 🔑 认证方式说明

系统使用两种不同的认证方式：

1. **`Authorization: Bearer xxx`** - 大部分API使用

   - ProductHunt 导入
   - 更新项目状态
   - 发送提醒邮件
   - 通知获奖者

2. **`x-cron-secret: xxx`** - 虚拟互动API使用
   - 虚拟点赞和评论

## 🔍 监控和验证

### 查看执行日志

1. 在 cron-job.org 面板，点击任务名称
2. 查看 **"Execution history"** 标签
3. 检查最近的执行状态（Success / Failed）

### 查看 HTTP 响应

每个成功的请求应该返回：

```json
{
  "success": true,
  "message": "...",
  "results": [...]
}
```

### 检查应用日志

在 Zeabur 或服务器上查看应用日志：

```bash
# 查看最近的 cron 任务日志
grep "cron" logs/app.log | tail -50
```

### 数据库验证

```sql
-- 查看最近导入的 ProductHunt 项目
SELECT name, created_at, created_by
FROM project
WHERE created_by IN (SELECT id FROM "user" WHERE is_bot = true)
ORDER BY created_at DESC
LIMIT 5;

-- 查看最近的点赞活动
SELECT COUNT(*) as recent_upvotes
FROM upvote
WHERE created_at > NOW() - INTERVAL '2 hours';

-- 查看最近的评论活动
SELECT COUNT(*) as recent_comments
FROM fuma_comments
WHERE timestamp > NOW() - INTERVAL '2 hours';
```

## 🐛 故障排除

### 问题 1: "401 Unauthorized" 错误

**原因：** `x-cron-secret` 头部未设置或错误

**解决方案：**

1. 检查环境变量 `CRON_SECRET` 是否设置
2. 确保 cron-job.org 的 Header 中 `x-cron-secret` 与环境变量一致

### 问题 2: "500 Internal Server Error"

**原因：** 可能是数据库连接问题或环境变量缺失

**排查步骤：**

1. 检查 Zeabur 应用是否正常运行
2. 查看应用日志：`https://dash.zeabur.com/projects/YOUR_PROJECT`
3. 确认所有必需的环境变量已设置

### 问题 3: ProductHunt 导入没有数据

**原因：** 可能获取的是历史 Top 5

**解决方案：**

1. 确保定时任务在 UTC 17:00 运行（太平洋时间 09:00）
2. 检查 `PRODUCTHUNT_API_KEY` 是否有效
3. 手动测试 API：
   ```bash
   curl -X GET "https://www.aat.ee/api/cron/import-producthunt?secret=YOUR_SECRET"
   ```

### 问题 4: 评论没有生成

**原因：** DeepSeek API 密钥问题

**解决方案：**

1. 确认 `DEEPSEEK_API_KEY` 已设置
2. 测试 API：
   ```bash
   curl https://api.deepseek.com/v1/chat/completions \
     -H "Authorization: Bearer YOUR_DEEPSEEK_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"test"}]}'
   ```

### 问题 5: 请求超时

**原因：** API 响应时间过长（特别是 ProductHunt 导入需要上传图片）

**解决方案：**

1. 增加 cron-job.org 的 "Request timeout" 到 120 秒
2. 检查 Cloudflare R2 配置是否正确
3. 优化图片上传流程

## 📧 通知设置建议

### 邮件通知

推荐只在任务失败时接收邮件：

- ✅ 节省邮箱空间
- ✅ 只关注异常情况
- ✅ 及时发现问题

### Webhook 通知（高级）

如果您使用 Slack 或 Discord，可以配置 Webhook：

1. 在 cron-job.org，点击任务 → **"Notifications"**
2. 选择 **"Webhook"**
3. 输入您的 Webhook URL
4. 选择触发条件（Success / Failure）

## 🎯 最佳实践

### 1. 错峰运行

避免所有任务同时运行，分散服务器负载：

- ProductHunt 导入：17:00
- 提醒邮件：09:00
- 获奖通知：周一 10:00

### 2. 合理频率

- ✅ 虚拟互动：每 2 小时（不要太频繁，避免看起来不自然）
- ✅ 状态更新：每小时（确保及时性）
- ✅ ProductHunt：每天 1 次（避免 API 限制）

### 3. 监控健康度

每周检查一次：

- 成功率是否 > 95%
- 响应时间是否正常
- 导入/互动数据是否符合预期

### 4. 定期清理

每月检查并清理：

- 失效的机器人账号
- 孤立的项目数据
- 过期的日志

## 🎉 完成验证

配置完成后，等待各个任务首次执行，然后验证：

```bash
# 1. 检查 ProductHunt 导入（第二天 17:00 后）
curl "https://www.aat.ee/api/projects?sort=recent" | jq '.projects[:5]'

# 2. 检查虚拟互动（2 小时后）
psql $DATABASE_URL -c "SELECT COUNT(*) FROM upvote WHERE created_at > NOW() - INTERVAL '2 hours';"

# 3. 检查项目状态更新
psql $DATABASE_URL -c "SELECT launch_status, COUNT(*) FROM project GROUP BY launch_status;"
```

全部正常后，您的自动化系统就完整运行起来了！🚀

## 📚 相关文档

- [BOT_USERS_GUIDE.md](./BOT_USERS_GUIDE.md) - 机器人账号管理
- [VIRTUAL_ENGAGEMENT.md](./VIRTUAL_ENGAGEMENT.md) - 虚拟互动详细说明
- [PRODUCTHUNT_QUICKSTART.md](./PRODUCTHUNT_QUICKSTART.md) - ProductHunt 导入快速开始
- [FIX_HISTORICAL_PROJECTS.md](./FIX_HISTORICAL_PROJECTS.md) - 修复历史项目

---

**需要帮助？** 查看 cron-job.org 的执行历史或应用日志来诊断问题。
