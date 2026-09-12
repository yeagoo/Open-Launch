# 🚀 ProductHunt 自动导入完整指南

## 📋 功能概述

自动从 ProductHunt 获取每日 Top 5 产品并导入到 aat.ee，使用 bot 账号模拟不同用户提交。

### ✨ 特性

- ✅ 每天自动导入 ProductHunt Top 5 产品
- ✅ 使用 5 个不同的 bot 账号模拟真实用户
- ✅ 智能去重（避免重复导入）
- ✅ 自动生成 slug 和处理冲突
- ✅ 详细日志记录
- ✅ 使用 Linux Cron 定时执行
- ✅ 安全的 API 认证机制

---

## 🏗️ 架构设计

```
┌────────────────────────────────────────────────────────────┐
│                   Linux Cron Job                           │
│              每天 UTC 01:00 自动执行                        │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ↓
┌────────────────────────────────────────────────────────────┐
│          scripts/cron-import-producthunt.sh                │
│              (Shell 脚本 + Bearer Token 认证)              │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ↓
┌────────────────────────────────────────────────────────────┐
│       /api/cron/import-producthunt (Next.js API)           │
│              (验证 CRON_SECRET + 业务逻辑)                 │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ↓
┌────────────────────────────────────────────────────────────┐
│           lib/producthunt.ts (API Client)                  │
│              (调用 ProductHunt GraphQL API)                │
└─────────────────────┬──────────────────────────────────────┘
                      │
                      ↓
┌────────────────────────────────────────────────────────────┐
│                  数据库操作                                 │
│   1. 检查是否已导入 (product_hunt_import 表)               │
│   2. 选择 bot 用户 (user 表, is_bot=true)                  │
│   3. 创建项目 (project 表)                                  │
│   4. 记录导入 (product_hunt_import 表)                     │
└────────────────────────────────────────────────────────────┘
```

---

## 📦 安装步骤

### 前置要求

- ✅ PostgreSQL 数据库
- ✅ Node.js 18+
- ✅ ProductHunt API Key
- ✅ Cloudflare R2 存储配置（用于存储 logo）
- ✅ 定时任务服务（Linux Cron 或外部 Cron 服务）

---

### 步骤 1: 获取 ProductHunt Developer Token

ProductHunt API v2 使用 **Developer Token** 进行认证，该令牌永久有效，适合自动化脚本。

#### 获取步骤

1. **登录 ProductHunt**

   ```
   https://www.producthunt.com/
   ```

2. **访问 API 管理页面**

   ```
   https://www.producthunt.com/v2/oauth/applications
   ```

3. **创建新的 OAuth Application**

   - 点击 **"Create an application"**
   - **Application Name**: `aat.ee Auto Import`
   - **Redirect URI**: `https://aat.ee` (您的网站 URL)
   - **Description**: `Automatically import top products from ProductHunt`

4. **获取 Developer Token**

   - 创建成功后，页面会显示 **Developer Token**
   - 这个 Token 格式类似: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **重要**: 立即复制并保存，刷新页面后可能无法再次查看完整 Token

5. **验证 Token**

   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
        -H "Content-Type: application/json" \
        -X POST \
        -d '{"query": "{ viewer { id name } }"}' \
        https://api.producthunt.com/v2/api/graphql
   ```

   **预期响应**:

   ```json
   {
     "data": {
       "viewer": {
         "id": "123456",
         "name": "Your Name"
       }
     }
   }
   ```

#### Token 特点

- ✅ **永久有效**: Developer Token 不会过期
- ✅ **无需用户授权**: 直接使用，无需 OAuth 流程
- ✅ **只读权限**: 默认只能读取公开数据
- ✅ **适合脚本**: 专为自动化场景设计

#### 重要说明

⚠️ **商业使用限制**: ProductHunt API 默认不得用于商业用途。如果您的项目属于商业性质，需要：

1. 联系 ProductHunt 官方: api@producthunt.com
2. 说明您的使用场景
3. 获得官方许可

对于个人项目或内部使用，Developer Token 完全足够。

---

### 步骤 2: 数据库迁移

```bash
# 1. 连接到数据库
psql $DATABASE_URL

# 2. 执行迁移
\i drizzle/migrations/add_bot_and_producthunt.sql

# 3. 验证表创建
\dt product_hunt_import

# 4. 验证 bot 用户
SELECT id, name, email, is_bot FROM "user" WHERE is_bot = true;
```

**预期结果**：应该看到 5 个 bot 用户：

```
         id          |     name      |       email        | is_bot
---------------------+---------------+--------------------+--------
 bot-user-ph-1       | TechHunter    | bot-ph-1@aat.ee    | t
 bot-user-ph-2       | ProductScout  | bot-ph-2@aat.ee    | t
 bot-user-ph-3       | LaunchTracker | bot-ph-3@aat.ee    | t
 bot-user-ph-4       | StartupDigger | bot-ph-4@aat.ee    | t
 bot-user-ph-5       | InnoFinder    | bot-ph-5@aat.ee    | t
```

---

### 步骤 3: 配置环境变量

#### 3.1 生产环境（Zeabur/Vercel）

登录部署平台，添加环境变量：

```bash
# ProductHunt API Key
PRODUCTHUNT_API_KEY=your_producthunt_api_key_here

# Cron Secret（生成随机密钥）
CRON_SECRET=your_super_secret_cron_key_here

# Cloudflare R2 配置（用于存储 logo）
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_DOMAIN=https://your-r2-domain.com
```

**生成 CRON_SECRET**:

```bash
openssl rand -base64 32
```

#### 3.2 本地开发环境

```bash
# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件
nano .env

# 添加以下内容
PRODUCTHUNT_API_KEY=your_producthunt_api_key
CRON_SECRET=your_cron_secret
```

---

### 步骤 4: 测试 API 端点

```bash
# 手动触发导入（测试）
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://www.aat.ee/api/cron/import-producthunt

# 预期响应
{
  "success": true,
  "timestamp": "2025-11-13T10:00:00.000Z",
  "summary": {
    "total": 5,
    "imported": 5,
    "skipped": 0,
    "errors": 0
  },
  "results": [
    {
      "name": "Amazing Product",
      "status": "imported"
    }
  ]
}
```

---

### 步骤 5: 配置定时任务

#### ⚠️ 重要说明

**如果您使用 Zeabur、Vercel、Railway 等容器化部署平台**，请参考 **[PRODUCTHUNT_CRON_ZEABUR.md](./PRODUCTHUNT_CRON_ZEABUR.md)** 使用外部 Cron 服务（推荐 cron-job.org）。

容器化环境**无法直接配置系统 Cron**，需要使用外部服务触发 API。

---

#### 方案 A: 外部 Cron 服务（推荐，适用于 Zeabur/容器环境）

**推荐使用 cron-job.org（完全免费）**:

1. **注册账号**

   ```
   https://cron-job.org/
   ```

2. **创建 Cron Job**

   - **URL**: `https://www.aat.ee/api/cron/import-producthunt`
   - **Schedule**: 每天 01:00 UTC
   - **Request method**: GET
   - **Headers**:
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     ```

3. **测试执行**
   点击 "Run now" 验证配置

**详细配置请参考**: [PRODUCTHUNT_CRON_ZEABUR.md](./PRODUCTHUNT_CRON_ZEABUR.md)

---

#### 方案 B: Linux 系统 Cron（仅适用于 VPS/独立服务器）

⚠️ **注意**: 仅当您在独立服务器或 VPS 上部署时使用此方案。

**自动安装**:

```bash
cd /home/ivmm/Open-Launch
bash scripts/setup-cron.sh
```

**手动配置**:

```bash
# 1. 设置脚本执行权限
chmod +x /home/ivmm/Open-Launch/scripts/cron-import-producthunt.sh

# 2. 创建环境变量文件
cat > /home/ivmm/Open-Launch/.env.cron << 'EOF'
CRON_SECRET=your_cron_secret_here
API_URL=https://aat.ee
EOF

# 3. 编辑 crontab
crontab -e

# 4. 添加定时任务
0 1 * * * source /home/ivmm/Open-Launch/.env.cron && /home/ivmm/Open-Launch/scripts/cron-import-producthunt.sh >> /home/ivmm/Open-Launch/logs/cron.log 2>&1
```

---

### 步骤 6: 验证配置

#### 6.1 查看 Crontab

```bash
crontab -l
```

预期输出：

```
0 1 * * * source /home/ivmm/Open-Launch/.env.cron && /home/ivmm/Open-Launch/scripts/cron-import-producthunt.sh >> /home/ivmm/Open-Launch/logs/cron.log 2>&1
```

#### 6.2 手动测试执行

```bash
# 手动运行脚本
bash /home/ivmm/Open-Launch/scripts/cron-import-producthunt.sh
```

#### 6.3 查看日志

```bash
# 查看最新日志
tail -f /home/ivmm/Open-Launch/logs/producthunt-import-*.log

# 查看 cron 日志
tail -f /home/ivmm/Open-Launch/logs/cron.log
```

**预期日志输出**：

```
[2025-11-13 10:00:00] ==========================================
[2025-11-13 10:00:00] 🚀 Starting ProductHunt import cron job
[2025-11-13 10:00:00] ==========================================
[2025-11-13 10:00:00] 📍 API URL: https://aat.ee
[2025-11-13 10:00:00] 📂 Project root: /home/ivmm/Open-Launch
[2025-11-13 10:00:00] 📡 Calling import API...
[2025-11-13 10:00:05] 📊 HTTP Status: 200
[2025-11-13 10:00:05] ✅ Import completed successfully
[2025-11-13 10:00:05] 📈 Summary: Imported=5, Skipped=0, Errors=0
```

---

## 📊 数据流转说明

### 1. ProductHunt 数据获取

```typescript
// lib/producthunt.ts
const posts = await getTop5Posts()
// 返回: id, name, tagline, description, url, votesCount, website, thumbnail, topics
```

### 2. 数据转换

```typescript
// 项目字段映射
{
  name: post.name,                    // 产品名称
  slug: generateSlug(post.name),      // URL slug
  description: post.description,      // 产品描述
  websiteUrl: post.website,           // 官网链接
  logoUrl: post.thumbnail.url,        // Logo 图片
  techStack: extractTags(post.topics), // 标签/关键词
  launchType: 'free',                 // 免费发布
  launchStatus: 'scheduled',          // 计划发布
  scheduledLaunchDate: tomorrow,      // 明天上线
}
```

### 3. Bot 用户分配

```typescript
// 循环使用 5 个 bot 用户
const botUser = botUsers[i % botUsers.length]
// 第 1 个产品 → bot-user-ph-1
// 第 2 个产品 → bot-user-ph-2
// ...
// 第 5 个产品 → bot-user-ph-5
```

### 4. 导入记录

```typescript
// product_hunt_import 表
{
  productHuntId: post.id,       // PH 产品 ID (用于去重)
  productHuntUrl: post.url,     // PH 产品链接
  projectId: projectId,         // aat.ee 项目 ID
  votesCount: post.votesCount,  // 投票数
  rank: 1-5,                    // 当日排名
  importedAt: new Date()        // 导入时间
}
```

---

## 🔍 常见问题排查

### 问题 1: Cron Job 未执行

**症状**: 日志文件中没有新记录

**排查步骤**:

```bash
# 1. 检查 cron 服务状态
sudo systemctl status cron

# 2. 检查 crontab 配置
crontab -l

# 3. 检查系统日志
grep CRON /var/log/syslog | tail -20

# 4. 手动测试脚本
bash /home/ivmm/Open-Launch/scripts/cron-import-producthunt.sh
```

**解决方案**:

- ✅ 确保 cron 服务运行: `sudo systemctl start cron`
- ✅ 验证脚本路径正确
- ✅ 检查文件权限: `chmod +x scripts/cron-import-producthunt.sh`

---

### 问题 2: API 认证失败

**症状**: HTTP 401 Unauthorized

**日志示例**:

```
❌ Import failed with status code: 401
📄 Response: {"error":"Unauthorized"}
```

**解决方案**:

```bash
# 1. 验证 CRON_SECRET 是否匹配
echo $CRON_SECRET

# 2. 检查 .env.cron 文件
cat /home/ivmm/Open-Launch/.env.cron

# 3. 重新生成密钥
openssl rand -base64 32

# 4. 更新环境变量（Zeabur/Vercel + .env.cron）
```

---

### 问题 3: ProductHunt API 错误

**症状**: HTTP 500, "Failed to fetch ProductHunt data"

**日志示例**:

```
❌ Failed to fetch ProductHunt posts: ProductHunt API error: 401
```

**解决方案**:

```bash
# 1. 测试 ProductHunt API Token
curl -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -X POST \
     -d '{"query": "{ viewer { id } }"}' \
     https://api.producthunt.com/v2/api/graphql

# 2. 检查 Token 权限
# 需要 "public" 读取权限

# 3. 检查 Rate Limit
# ProductHunt API 限制: 100 请求/小时
```

---

### 问题 4: 重复导入

**症状**: 同一个产品被多次导入

**排查**:

```sql
-- 检查重复记录
SELECT product_hunt_id, COUNT(*)
FROM product_hunt_import
GROUP BY product_hunt_id
HAVING COUNT(*) > 1;
```

**解决方案**:

- ✅ 代码已实现去重逻辑（通过 `product_hunt_id` 唯一索引）
- ✅ 如果发现重复，检查数据库约束是否正确创建

---

### 问题 5: 没有 bot 用户

**症状**: "No bot users found in database"

**解决方案**:

```bash
# 方法 1: 运行种子脚本
npx tsx scripts/seed-bot-users.ts

# 方法 2: 手动执行 SQL
psql $DATABASE_URL < drizzle/migrations/add_bot_and_producthunt.sql

# 方法 3: 手动创建
psql $DATABASE_URL -c "
INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at, is_bot, role)
VALUES ('bot-user-ph-1', 'TechHunter', 'bot-ph-1@aat.ee', true, NOW(), NOW(), true, 'user')
ON CONFLICT (id) DO NOTHING;
"
```

---

## 📈 监控和维护

### 1. 日志轮转

```bash
# 创建日志轮转配置
sudo nano /etc/logrotate.d/aat-producthunt

# 添加以下内容
/home/ivmm/Open-Launch/logs/producthunt-import-*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
}

# 测试配置
sudo logrotate -d /etc/logrotate.d/aat-producthunt
```

### 2. 告警配置

```bash
# 创建告警脚本
cat > /home/ivmm/Open-Launch/scripts/check-import-status.sh << 'EOF'
#!/bin/bash
LOG_FILE=$(ls -t /home/ivmm/Open-Launch/logs/producthunt-import-*.log 2>/dev/null | head -1)
if [ -z "$LOG_FILE" ]; then
    echo "❌ No log file found!"
    exit 1
fi

if grep -q "❌" "$LOG_FILE"; then
    echo "⚠️  Import errors detected!"
    grep "❌" "$LOG_FILE"
    exit 1
fi

echo "✅ Import running normally"
exit 0
EOF

chmod +x /home/ivmm/Open-Launch/scripts/check-import-status.sh

# 添加到 crontab（每天检查）
# 0 2 * * * /home/ivmm/Open-Launch/scripts/check-import-status.sh || mail -s "PH Import Failed" admin@aat.ee
```

### 3. 性能监控

```sql
-- 查看导入统计
SELECT
    DATE(imported_at) as date,
    COUNT(*) as imported_count,
    AVG(votes_count) as avg_votes
FROM product_hunt_import
GROUP BY DATE(imported_at)
ORDER BY date DESC
LIMIT 30;

-- 查看最近导入的产品
SELECT
    phi.rank,
    p.name,
    p.slug,
    phi.votes_count,
    phi.imported_at,
    u.name as bot_user
FROM product_hunt_import phi
JOIN project p ON phi.project_id = p.id
JOIN "user" u ON p.user_id = u.id
ORDER BY phi.imported_at DESC
LIMIT 20;
```

---

## 🔒 安全建议

### 1. API 密钥保护

- ✅ 永远不要将 API Key 提交到 Git
- ✅ 使用环境变量存储敏感信息
- ✅ 定期轮换 CRON_SECRET
- ✅ 使用 `chmod 600` 保护 `.env.cron` 文件

### 2. Rate Limiting

```typescript
// 代码中已实现，但建议监控
// ProductHunt API Limit: 100 请求/小时
// 我们的使用: 每天 1 次请求（远低于限制）
```

### 3. 错误处理

- ✅ API 失败不影响现有数据
- ✅ 重复导入自动跳过
- ✅ 详细错误日志便于排查

---

## 📝 维护清单

### 每日检查

- [ ] 查看日志确认导入成功
- [ ] 检查网站是否有新产品上线

### 每周检查

- [ ] 查看导入统计（成功率）
- [ ] 检查 bot 用户是否正常
- [ ] 清理过期日志

### 每月检查

- [ ] 审查 ProductHunt API 使用量
- [ ] 检查是否有重复导入
- [ ] 更新文档（如有变化）

---

## 🚨 紧急停止

如需停止自动导入：

```bash
# 方法 1: 临时禁用
crontab -e
# 注释掉相关行（添加 # 号）

# 方法 2: 完全移除
crontab -l | grep -v "cron-import-producthunt" | crontab -

# 方法 3: 停止 cron 服务（不推荐，影响其他任务）
sudo systemctl stop cron
```

---

## 📚 相关文档

- **环境变量配置**: `.env.example`
- **数据库迁移**: `drizzle/migrations/add_bot_and_producthunt.sql`
- **API 客户端**: `lib/producthunt.ts`
- **Cron 端点**: `app/api/cron/import-producthunt/route.ts`
- **Shell 脚本**: `scripts/cron-import-producthunt.sh`
- **安装脚本**: `scripts/setup-cron.sh`

---

## ✅ 完成检查清单

- [ ] 已获取 ProductHunt API Key
- [ ] 已执行数据库迁移
- [ ] 已创建 5 个 bot 用户
- [ ] 已配置环境变量（PRODUCTHUNT_API_KEY, CRON_SECRET）
- [ ] 已部署应用到生产环境
- [ ] 已手动测试 API 端点成功
- [ ] 已配置 Linux Cron Job
- [ ] 已验证 Cron Job 自动执行
- [ ] 已设置日志监控
- [ ] 已了解排查流程

---

**如有问题，请查看日志文件或联系技术支持。** 🚀
