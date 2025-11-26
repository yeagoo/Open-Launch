# 🤖 自动模拟点赞 (Simulate Upvotes)

Open-Launch 提供了一个 API 端点，用于模拟用户点赞活动。这对于新站点的冷启动非常有用，可以保持首页的活跃度。

## 📋 前置条件

1. **Bot 用户**: 数据库中必须存在 `isBot: true` 的用户。
   - 运行 `npm run seed:bots` (如果已配置) 或 `npx tsx scripts/seed-bot-users.ts` 来生成 Bot 用户。
2. **活跃项目**: 数据库中必须有状态为 `ongoing`, `launched` 或 `scheduled` 的项目。

## 🚀 API 端点

- **URL**: `/api/cron/simulate-upvotes`
- **Method**: `GET`
- **Auth**: 需要提供 `CRON_SECRET`
  - Header: `x-cron-secret: YOUR_SECRET`
  - Query Param: `?secret=YOUR_SECRET`

### 功能逻辑

每次调用该 API：

1. 从数据库获取所有 Bot 用户。
2. 随机选取 5 个活跃项目（Ongoing/Launched/Scheduled）。
3. 对每个项目，有 70% 的概率参与投票。
4. 如果参与，随机选取 1-3 个 Bot 用户进行点赞。
5. 检查是否已点赞，避免重复。

## 💻 使用脚本运行

我们提供了一个 shell 脚本用于定时任务：

```bash
# 赋予执行权限
chmod +x scripts/cron-simulate-upvotes.sh

# 手动运行测试
export CRON_SECRET="your_cron_secret"
./scripts/cron-simulate-upvotes.sh
```

## ⏰ 定时任务配置 (Cron)

建议每小时或每 30 分钟运行一次，以产生自然的增长曲线。

### Linux Crontab

```bash
# 每小时执行一次
0 * * * * /path/to/Open-Launch/scripts/cron-simulate-upvotes.sh
```

### 外部 Cron 服务 (如 cron-job.org)

由于 Zeabur 等容器环境可能无法持久化本地 Cron，建议使用外部服务。

1. **URL**: `https://www.aat.ee/api/cron/simulate-upvotes?secret=YOUR_CRON_SECRET`
2. **Method**: `GET`
3. **Schedule**: 每 30 分钟或 60 分钟。

## ⚠️ 注意事项

- 此功能仅用于增加测试数据或冷启动活跃度。
- 请确保 Bot 用户数量足够，否则每个项目很快就会被所有 Bot 赞过，之后将不再增加新的点赞。
- 建议定期增加新的 Bot 用户。
