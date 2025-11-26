# 🤖 虚拟互动 (Virtual Engagement)

Open-Launch 提供了一个自动化系统，使用虚拟用户（Bot）在项目上生成评论和点赞，帮助新项目获得初始互动。

## 📋 功能概述

### 自动互动

- **点赞**: 每次运行随机选择6个最近发布的项目，每个项目获得1-3个点赞
- **评论**: 随机选择3个不同的机器人用户，在1-3个项目上发布AI生成的评论
- **目标项目**: 今天和昨天发布的项目（Ongoing/Launched状态）
- **运行频率**: 每2小时执行一次

### AI生成评论

- 使用 DeepSeek API 生成真实、自然的评论
- 评论长度: 3-20个英文单词
- 基于项目的 title、tagline 和 description 生成
- 多样化的评论风格

## 🚀 快速开始

### 1. 配置 DeepSeek API

#### 获取 API Key

1. 访问 [DeepSeek Platform](https://platform.deepseek.com/)
2. 注册账号并登录
3. 在 API Keys 页面创建新的 API Key
4. 复制 API Key（格式: `sk-...`）

#### 配置环境变量

在 `.env` 或 `.env.local` 文件中添加：

```env
# DeepSeek API 配置
DEEPSEEK_API_KEY=sk-your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-chat
```

### 2. 生成机器人用户

#### 初次生成

运行种子脚本生成80个机器人用户：

```bash
npx tsx scripts/seed-bot-users.ts
```

机器人用户将使用多样化的国际化姓名，包括：

- 欧美姓氏（Smith, Johnson, Williams, Brown等）
- 亚洲姓氏（Chen, Wang, Kim, Park, Tanaka等）
- 拉美姓氏（Gonzalez, Hernandez, Lopez等）

#### 删除并重新生成（如需要）

如果需要删除现有机器人用户并重新生成：

```bash
# 1. 删除所有机器人用户
npx tsx scripts/delete-bot-users.ts

# 2. 重新生成
npx tsx scripts/seed-bot-users.ts
```

**输出示例**:

```
🤖 Starting bot users seed...
✅ Created bot user: Alex Chen (bot1@aat.ee)
✅ Created bot user: Blake Smith (bot2@aat.ee)
...
🎉 Bot users seed completed!
```

### 3. 手动测试

在配置定时任务前，先手动测试：

```bash
# 设置环境变量
export CRON_SECRET="your_cron_secret"

# 运行脚本
./scripts/cron-simulate-engagement.sh
```

或直接调用 API：

```bash
curl "https://www.aat.ee/api/cron/simulate-engagement?secret=YOUR_CRON_SECRET"
```

**成功响应示例**:

```json
{
  "success": true,
  "message": "Virtual engagement simulation completed",
  "data": {
    "botsAvailable": 80,
    "projectsFound": 5,
    "upvotesAdded": 12,
    "commentsPosted": 3,
    "errors": []
  }
}
```

## ⏰ 配置定时任务

### 方式 A: Linux Crontab（本地服务器）

```bash
# 赋予执行权限
chmod +x scripts/cron-simulate-engagement.sh

# 编辑 crontab
crontab -e

# 添加以下行（每2小时执行一次）
0 */2 * * * /path/to/Open-Launch/scripts/cron-simulate-engagement.sh
```

### 方式 B: 外部 Cron 服务（推荐用于 Zeabur）

由于 Zeabur 等容器环境无法持久化本地 Cron，建议使用外部服务：

#### 使用 cron-job.org

1. 访问 [cron-job.org](https://cron-job.org/)
2. 注册并登录
3. 创建新的 Cron Job：
   - **Title**: `aat.ee Virtual Engagement`
   - **URL**: `https://www.aat.ee/api/cron/simulate-engagement?secret=YOUR_CRON_SECRET`
   - **Schedule**: Every 2 hours (`0 */2 * * *`)
   - **Method**: GET

#### 使用 EasyCron

1. 访问 [EasyCron](https://www.easycron.com/)
2. 创建 Cron Job：
   - **URL**: `https://www.aat.ee/api/cron/simulate-engagement?secret=YOUR_CRON_SECRET`
   - **Cron Expression**: `0 */2 * * *`

#### 使用 GitHub Actions

创建 `.github/workflows/virtual-engagement.yml`:

```yaml
name: Virtual Engagement

on:
  schedule:
    - cron: "0 */2 * * *" # 每2小时
  workflow_dispatch: # 允许手动触发

jobs:
  simulate-engagement:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Virtual Engagement
        run: |
          curl -X GET \
            "https://www.aat.ee/api/cron/simulate-engagement?secret=${{ secrets.CRON_SECRET }}"
```

然后在 GitHub Repository Settings > Secrets 中添加 `CRON_SECRET`。

## 📊 工作原理

### 点赞逻辑

1. 查询今天和昨天发布的项目
2. 随机选择6个项目
3. 每个项目随机分配1-3个机器人用户点赞
4. **允许重复点赞**：如果机器人已经点赞过，会静默跳过
5. 更新首页和 Trending 页面缓存

### 评论逻辑

1. 随机选择3个不同的机器人用户
2. 随机选择1-3个项目进行评论
3. 对每个项目：
   - 检查该机器人是否已评论过（避免重复）
   - 调用 DeepSeek API 生成评论
   - 将评论插入 Fuma Comments 系统
4. 评论格式化为 JSON（Fuma Comments 格式）

### AI 评论生成

**System Prompt**:

```
You are a tech enthusiast reviewing product launches.
Write a brief, authentic comment based on the product information.
Use 3-20 words only. Be positive and natural.
No hashtags or emojis.
```

**User Prompt 模板**:

```
Product: {title}
Tagline: {tagline}
Description: {description}

Write a brief comment (3-20 words):
```

**示例评论**:

- "This looks promising!"
- "Great idea, can't wait to try it."
- "Finally a tool for this!"
- "Love the UI design."
- "Interesting approach to solving this problem."

## 📁 文件结构

```
Open-Launch/
├── lib/
│   └── ai-comment.ts                    # AI评论生成工具
├── app/
│   └── api/
│       └── cron/
│           └── simulate-engagement/
│               └── route.ts              # 虚拟互动API端点
├── scripts/
│   ├── seed-bot-users.ts                # 机器人用户生成脚本
│   └── cron-simulate-engagement.sh      # Cron执行脚本
├── logs/
│   └── simulate-engagement-YYYYMMDD.log # 日志文件
└── VIRTUAL_ENGAGEMENT.md                # 本文档
```

## 🔍 查看日志

日志文件位于 `logs/simulate-engagement-YYYYMMDD.log`:

```bash
# 查看今天的日志
tail -f logs/simulate-engagement-$(date +%Y%m%d).log

# 查看最近的运行
tail -100 logs/simulate-engagement-*.log
```

**日志示例**:

```
[2025-01-15 10:00:01] 🤖 Starting Virtual Engagement cron job
[2025-01-15 10:00:01] 📍 API URL: https://www.aat.ee
[2025-01-15 10:00:01] 📡 Calling simulate-engagement API...
[2025-01-15 10:00:05] 📊 HTTP Status: 200
[2025-01-15 10:00:05] ✅ Simulation completed successfully
[2025-01-15 10:00:05] 📈 Summary: Upvotes=12, Comments=3
```

## 🛠️ 故障排除

### 问题 1: API 返回 401 Unauthorized

**原因**: `CRON_SECRET` 未配置或不正确

**解决**:

```bash
# 检查环境变量
echo $CRON_SECRET

# 确保 .env 文件中配置了
CRON_SECRET=your_super_secret_cron_key_here
```

### 问题 2: No bot users found

**原因**: 机器人用户未生成

**解决**:

```bash
npx tsx scripts/seed-bot-users.ts
```

### 问题 3: DeepSeek API error

**原因**: `DEEPSEEK_API_KEY` 未配置或无效

**解决**:

1. 检查 API Key 是否正确
2. 确认 API Key 是否有足够的配额
3. 查看 DeepSeek 控制台的使用情况

```bash
# 测试 API Key
curl https://api.deepseek.com/v1/chat/completions \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 问题 4: No recent projects found

**原因**: 没有今天或昨天发布的项目

**解决**: 这是正常情况，脚本会返回成功但不执行任何操作

### 问题 5: 评论未显示在项目页面

**原因**: 可能是缓存问题

**解决**:

1. 检查数据库中是否有评论记录
2. 清除浏览器缓存
3. 等待缓存自动刷新（通常几分钟）

## ⚙️ 高级配置

### 调整运行频率

修改 cron 表达式：

```bash
# 每小时
0 * * * *

# 每2小时（当前设置）
0 */2 * * *

# 每4小时
0 */4 * * *

# 每天一次（中午12点）
0 12 * * *
```

### 修改评论长度限制

编辑 `lib/ai-comment.ts`:

```typescript
content: "... Use 5-30 words only. ..." // 修改范围
```

```typescript
max_tokens: 60,  // 增加 token 限制
```

### 修改选择的项目数量

编辑 `app/api/cron/simulate-engagement/route.ts`:

```typescript
// 修改点赞项目数量（当前6个）
const projectsToUpvote = shuffledForUpvotes.slice(0, Math.min(10, recentProjects.length))

// 修改评论项目数量（当前1-3个）
const commentCount = Math.floor(Math.random() * 5) + 1
```

## 📊 数据库表

### 机器人用户 (user 表)

```sql
SELECT * FROM "user" WHERE is_bot = true;
```

### 点赞记录 (upvote 表)

```sql
SELECT * FROM upvote WHERE user_id LIKE 'bot-user-%' ORDER BY created_at DESC LIMIT 10;
```

### 评论记录 (fuma_comments 表)

```sql
SELECT * FROM fuma_comments WHERE author LIKE 'bot-user-%' ORDER BY timestamp DESC LIMIT 10;
```

## 🔒 安全注意事项

1. **保护 CRON_SECRET**: 使用强密钥（至少32字符）
2. **保护 DEEPSEEK_API_KEY**: 不要泄露到公开仓库
3. **监控使用量**: 定期检查 DeepSeek API 使用情况
4. **限制频率**: 避免过于频繁的调用

## 💰 成本估算

### DeepSeek API

- **定价**: 约 $0.14 / 1M tokens（输入）
- **每条评论**: 约 100-200 tokens
- **每次运行**: 3条评论 × 200 tokens = 600 tokens
- **每天**: 12次运行 × 600 tokens = 7,200 tokens
- **月成本**: 约 $0.03/月（非常便宜）

### 存储和带宽

- 评论数据极小（每条约100字节）
- 基本可忽略不计

## 📈 效果监控

### 查看统计

```bash
# 查看今天的总运行次数
grep "Starting Virtual Engagement" logs/simulate-engagement-$(date +%Y%m%d).log | wc -l

# 查看今天添加的点赞数
grep "Upvotes=" logs/simulate-engagement-$(date +%Y%m%d).log

# 查看今天发布的评论数
grep "Comments=" logs/simulate-engagement-$(date +%Y%m%d).log
```

### 数据库统计

```sql
-- 今天的机器人点赞数
SELECT COUNT(*) FROM upvote
WHERE user_id LIKE 'bot-user-%'
AND created_at >= CURRENT_DATE;

-- 今天的机器人评论数
SELECT COUNT(*) FROM fuma_comments
WHERE author LIKE 'bot-user-%'
AND timestamp >= CURRENT_DATE;
```

## 🎯 最佳实践

1. **逐步增加**: 先从较少的机器人开始（如20个），观察效果后再增加
2. **自然分布**: 不要所有机器人在同一时间行动
3. **质量优先**: 确保AI生成的评论质量高、相关性强
4. **定期监控**: 每周检查一次日志和数据库
5. **调整策略**: 根据实际效果调整运行频率和数量

## 📚 相关文档

- [ProductHunt 自动导入](./PRODUCTHUNT_AUTO_IMPORT.md)
- [Cron 定时任务配置](./docs/cursor/CRON_SETUP_GUIDE.md)
- [环境变量配置](./env.example.txt)
- [点赞模拟](./SIMULATE_UPVOTES.md)

## ❓ 常见问题

### Q: 机器人用户会被用户看到吗？

A: 是的，机器人的评论和点赞会显示为正常用户行为。建议使用真实的名字和头像。

### Q: 可以只运行点赞不运行评论吗？

A: 可以，修改 API 代码注释掉评论逻辑即可。

### Q: DeepSeek API 有免费额度吗？

A: 是的，DeepSeek 提供免费试用额度，具体查看官网。

### Q: 评论语言可以改成中文吗？

A: 可以，修改 `lib/ai-comment.ts` 中的 System Prompt 即可。

### Q: 如何删除所有机器人数据？

A:

```sql
-- 删除机器人点赞
DELETE FROM upvote WHERE user_id LIKE 'bot-user-%';

-- 删除机器人评论
DELETE FROM fuma_comments WHERE author LIKE 'bot-user-%';

-- 删除机器人用户（谨慎）
DELETE FROM "user" WHERE is_bot = true;
```
