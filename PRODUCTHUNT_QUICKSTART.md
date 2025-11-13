# ⚡ ProductHunt 自动导入 - 快速开始

## 🎯 5 分钟快速部署

### 步骤 1: 获取 ProductHunt Developer Token (2 分钟)

```bash
1. 访问: https://www.producthunt.com/v2/oauth/applications
2. 创建 OAuth Application: "aat.ee Auto Import"
3. 复制 Developer Token (永久有效)
```

**注意**: Developer Token 不会过期，适合自动化脚本

---

### 步骤 2: 配置环境变量 (1 分钟)

**Zeabur Dashboard** → Variables → 添加:

```bash
PRODUCTHUNT_API_KEY=your_producthunt_api_key_here
CRON_SECRET=$(openssl rand -base64 32)
```

---

### 步骤 3: 数据库迁移 (1 分钟)

```bash
# SSH 连接到服务器
ssh your-server

# 执行迁移
psql $DATABASE_URL < drizzle/migrations/add_bot_and_producthunt.sql

# 验证 bot 用户
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"user\" WHERE is_bot = true;"
# 预期结果: 5
```

---

### 步骤 4: 配置 Cron Job (1 分钟)

```bash
# 自动安装（推荐）
cd /home/ivmm/Open-Launch
bash scripts/setup-cron.sh

# 输入信息:
# - CRON_SECRET: [从环境变量复制]
# - API_URL: https://aat.ee
# - 时间: 0 1 * * * (每天 UTC 01:00)
```

---

### 步骤 5: 验证 (30 秒)

```bash
# 手动测试
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://aat.ee/api/cron/import-producthunt

# 预期响应
{
  "success": true,
  "summary": {
    "imported": 5,
    "skipped": 0
  }
}
```

---

## 📊 日常监控

```bash
# 查看最新日志
tail -f /home/ivmm/Open-Launch/logs/producthunt-import-*.log

# 查看 crontab
crontab -l

# 查看最新导入的产品
psql $DATABASE_URL -c "
SELECT p.name, phi.votes_count, phi.rank
FROM product_hunt_import phi
JOIN project p ON phi.project_id = p.id
ORDER BY phi.imported_at DESC
LIMIT 5;
"
```

---

## 🔧 常见问题

### ❌ "No bot users found"

```bash
npx tsx scripts/seed-bot-users.ts
```

### ❌ "PRODUCTHUNT_API_KEY is not configured"

在 Zeabur Dashboard 添加环境变量并重新部署

### ❌ Cron 未执行

```bash
# 检查 cron 服务
sudo systemctl status cron

# 手动测试
bash /home/ivmm/Open-Launch/scripts/cron-import-producthunt.sh
```

---

## 📚 完整文档

详细文档请查看: **[PRODUCTHUNT_AUTO_IMPORT.md](./PRODUCTHUNT_AUTO_IMPORT.md)**

---

**祝您使用愉快！** 🚀
