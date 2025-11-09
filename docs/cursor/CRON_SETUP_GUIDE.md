# ⏰ Cron 定时任务实现指南

## 📋 概述

本项目使用 **Next.js API Routes** 结合外部定时调度服务来实现 cron 定时任务。项目中已实现了 3 个核心定时任务，本指南将教您如何配置和创建新的定时任务。

---

## 🏗️ 系统架构

### 工作原理

```
外部定时服务 (Zeabur/Vercel Cron/GitHub Actions)
         ↓
   定时触发 HTTP 请求
         ↓
   Next.js API Route (/api/cron/*)
         ↓
   API Key 验证
         ↓
   执行定时任务逻辑
```

### 为什么使用这种架构？

1. **无服务器友好**：适用于 Vercel、Zeabur 等无服务器平台
2. **简单易用**：无需额外的后台进程或数据库调度
3. **灵活调度**：可以使用任何支持 HTTP 的定时服务
4. **易于测试**：可以手动调用 API 进行测试

---

## 📦 项目现有的 Cron 任务

### 1. **更新产品发布状态** (`/api/cron/update-launches`)

**执行时间**：每天 08:00 UTC  
**功能**：
- 将 `SCHEDULED` 状态的产品更新为 `ONGOING`
- 将 `ONGOING` 状态的产品更新为 `LAUNCHED`
- 计算昨日 Top 3 获奖产品
- 清理超过 24 小时的未完成支付

**代码位置**：`app/api/cron/update-launches/route.ts`

---

### 2. **发送获奖通知邮件** (`/api/cron/send-winner-notifications`)

**执行时间**：每天 08:30 UTC  
**功能**：
- 查找昨日获得 Top 1/2/3 排名的产品
- 向产品创建者发送获奖通知邮件
- 包含徽章获取链接

**代码位置**：`app/api/cron/send-winner-notifications/route.ts`

---

### 3. **发送产品发布提醒** (`/api/cron/send-ongoing-reminders`)

**执行时间**：每天 09:00 UTC  
**功能**：
- 查找当天正在发布的产品（`ONGOING` 状态）
- 向产品创建者发送提醒邮件
- 鼓励分享和推广

**代码位置**：`app/api/cron/send-ongoing-reminders/route.ts`

---

## ⚙️ 配置步骤

### 步骤 1：设置环境变量

在 `.env.local`（本地）或 Zeabur/Vercel 环境变量中添加：

```bash
# Cron API Key - 用于保护 cron 端点
CRON_API_KEY=your_super_secret_cron_key_here_minimum_32_characters
```

**生成安全的 API Key**：

```bash
# 使用 OpenSSL
openssl rand -base64 32

# 或使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 或使用在线工具
# https://www.uuidgenerator.net/
```

**⚠️ 安全提示**：
- 生成至少 32 字符的随机字符串
- 不要在代码中硬编码
- 不要提交到 Git 仓库

---

### 步骤 2：选择定时调度服务

#### **方案 A：Zeabur Cron（推荐）**

Zeabur 内置了 Cron 功能，无需额外配置。

1. **登录 Zeabur Dashboard**
2. **进入您的项目**
3. **点击 "Cron Jobs" 标签**
4. **添加新的 Cron Job**：

```yaml
# 更新产品发布状态
Name: update-launches
Schedule: 0 8 * * *
URL: https://www.aat.ee/api/cron/update-launches
Method: GET
Headers:
  Authorization: Bearer your_cron_api_key_here
```

```yaml
# 发送获奖通知
Name: send-winner-notifications
Schedule: 30 8 * * *
URL: https://www.aat.ee/api/cron/send-winner-notifications
Method: GET
Headers:
  Authorization: Bearer your_cron_api_key_here
```

```yaml
# 发送发布提醒
Name: send-ongoing-reminders
Schedule: 0 9 * * *
URL: https://www.aat.ee/api/cron/send-ongoing-reminders
Method: GET
Headers:
  Authorization: Bearer your_cron_api_key_here
```

---

#### **方案 B：Vercel Cron**

如果部署在 Vercel，可以使用 Vercel Cron。

1. **创建 `vercel.json`**（如果还没有）：

```json
{
  "crons": [
    {
      "path": "/api/cron/update-launches",
      "schedule": "0 8 * * *"
    },
    {
      "path": "/api/cron/send-winner-notifications",
      "schedule": "30 8 * * *"
    },
    {
      "path": "/api/cron/send-ongoing-reminders",
      "schedule": "0 9 * * *"
    }
  ]
}
```

2. **Vercel 会自动在请求头中添加验证**，需要稍微修改 API Route 代码：

```typescript
// 检测是否是 Vercel Cron 请求
const isVercelCron = request.headers.get("x-vercel-cron") === "1"
const authHeader = request.headers.get("authorization")
const providedKey = authHeader?.replace("Bearer ", "")

if (!isVercelCron && (!API_KEY || providedKey !== API_KEY)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

**注意**：Vercel Cron 仅在 Pro 计划及以上可用。

---

#### **方案 C：GitHub Actions（免费）**

使用 GitHub Actions 作为免费的 cron 调度器。

1. **创建 `.github/workflows/cron-jobs.yml`**：

```yaml
name: Cron Jobs

on:
  schedule:
    # 更新产品发布状态 - 每天 08:00 UTC
    - cron: '0 8 * * *'
    # 发送获奖通知 - 每天 08:30 UTC
    - cron: '30 8 * * *'
    # 发送发布提醒 - 每天 09:00 UTC
    - cron: '0 9 * * *'
  workflow_dispatch: # 允许手动触发

jobs:
  update-launches:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 8 * * *' || github.event_name == 'workflow_dispatch'
    steps:
      - name: Trigger Update Launches
        run: |
          curl -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_API_KEY }}" \
            -H "Content-Type: application/json" \
            "https://www.aat.ee/api/cron/update-launches"

  send-winner-notifications:
    runs-on: ubuntu-latest
    if: github.event.schedule == '30 8 * * *' || github.event_name == 'workflow_dispatch'
    steps:
      - name: Trigger Winner Notifications
        run: |
          curl -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_API_KEY }}" \
            -H "Content-Type: application/json" \
            "https://www.aat.ee/api/cron/send-winner-notifications"

  send-ongoing-reminders:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 9 * * *' || github.event_name == 'workflow_dispatch'
    steps:
      - name: Trigger Launch Reminders
        run: |
          curl -X GET \
            -H "Authorization: Bearer ${{ secrets.CRON_API_KEY }}" \
            -H "Content-Type: application/json" \
            "https://www.aat.ee/api/cron/send-ongoing-reminders"
```

2. **在 GitHub Repository Settings 中添加 Secret**：
   - 前往 **Settings → Secrets and variables → Actions**
   - 添加 `CRON_API_KEY` secret

**优点**：
- ✅ 完全免费
- ✅ 可靠稳定
- ✅ 易于管理

**缺点**：
- ⏱️ 最小间隔为 5 分钟
- 🕐 可能有 5-10 分钟的延迟

---

#### **方案 D：EasyCron（第三方服务）**

1. 注册 [EasyCron](https://www.easycron.com/)
2. 创建新的 Cron Job
3. 配置 URL 和 HTTP Headers

---

#### **方案 E：cron-job.org（免费）**

1. 注册 [cron-job.org](https://cron-job.org/)
2. 创建新的 Cron Job
3. 设置 URL、时间和 Headers

---

## 🧪 测试 Cron 任务

### 方法 1：使用 curl

```bash
# 测试更新发布状态
curl -X GET \
  -H "Authorization: Bearer your_cron_api_key_here" \
  -H "Content-Type: application/json" \
  "https://www.aat.ee/api/cron/update-launches"

# 测试发送获奖通知
curl -X GET \
  -H "Authorization: Bearer your_cron_api_key_here" \
  -H "Content-Type: application/json" \
  "https://www.aat.ee/api/cron/send-winner-notifications"

# 测试发送发布提醒
curl -X GET \
  -H "Authorization: Bearer your_cron_api_key_here" \
  -H "Content-Type: application/json" \
  "https://www.aat.ee/api/cron/send-ongoing-reminders"
```

### 方法 2：使用 Postman/Insomnia

1. 创建新的 GET 请求
2. URL: `https://www.aat.ee/api/cron/update-launches`
3. 添加 Header: `Authorization: Bearer your_cron_api_key_here`
4. 发送请求

### 方法 3：使用浏览器（不推荐）

直接访问 URL 会失败，因为缺少 Authorization Header。

---

## 🆕 创建新的 Cron 任务

### 步骤 1：创建 API Route

在 `app/api/cron/your-task-name/route.ts` 创建新文件：

```typescript
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/drizzle/db"

const API_KEY = process.env.CRON_API_KEY

export async function GET(request: NextRequest) {
  try {
    // 1. 验证 API Key
    const authHeader = request.headers.get("authorization")
    const providedKey = authHeader?.replace("Bearer ", "")

    if (!API_KEY || providedKey !== API_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 2. 记录开始时间
    const now = new Date()
    console.log(`[${now.toISOString()}] Starting cron: Your Task Name`)

    // 3. 执行您的定时任务逻辑
    // 例如：查询数据库、发送邮件、调用外部 API 等
    
    // 示例：查询所有用户
    const users = await db.query.user.findMany()
    console.log(`Found ${users.length} users`)

    // 4. 返回成功响应
    console.log(`[${now.toISOString()}] Cron task completed successfully`)
    
    return NextResponse.json({
      message: "Task completed successfully",
      details: {
        timestamp: now.toISOString(),
        usersProcessed: users.length,
      },
    })
  } catch (error) {
    console.error("Error in cron task:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
```

### 步骤 2：配置定时调度

根据您选择的调度服务（Zeabur、GitHub Actions 等），添加新的 cron 配置。

### 步骤 3：测试

```bash
curl -X GET \
  -H "Authorization: Bearer your_cron_api_key_here" \
  "https://www.aat.ee/api/cron/your-task-name"
```

---

## 📊 Cron 表达式参考

```
格式: * * * * *
      │ │ │ │ │
      │ │ │ │ └─── 星期几 (0-7, 0 和 7 都代表星期日)
      │ │ │ └───── 月份 (1-12)
      │ │ └─────── 日期 (1-31)
      │ └───────── 小时 (0-23)
      └─────────── 分钟 (0-59)
```

### 常用示例

```bash
# 每天 8:00 AM UTC
0 8 * * *

# 每天 8:30 AM UTC
30 8 * * *

# 每小时
0 * * * *

# 每 15 分钟
*/15 * * * *

# 每周一 9:00 AM
0 9 * * 1

# 每月 1 号 0:00 AM
0 0 1 * *

# 工作日每天 9:00 AM (周一到周五)
0 9 * * 1-5

# 每 6 小时
0 */6 * * *
```

### 在线 Cron 表达式生成器

- https://crontab.guru/
- https://crontab-generator.org/

---

## 🔍 监控和日志

### 查看日志

#### Zeabur
1. 进入 Zeabur Dashboard
2. 选择您的服务
3. 点击 "Logs" 标签
4. 搜索 "Starting cron" 或 "completed"

#### Vercel
1. 进入 Vercel Dashboard
2. 选择您的项目
3. 点击 "Functions" 标签
4. 查看 Cron 函数的执行日志

#### GitHub Actions
1. 进入 GitHub Repository
2. 点击 "Actions" 标签
3. 查看 Workflow 运行历史

### 添加错误通知

您可以集成错误监控服务：

```typescript
// app/api/cron/your-task/route.ts
import * as Sentry from "@sentry/nextjs"

export async function GET(request: NextRequest) {
  try {
    // ... 任务逻辑
  } catch (error) {
    // 记录到错误监控服务
    Sentry.captureException(error)
    
    // 发送 Discord 通知
    await fetch(process.env.DISCORD_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `❌ Cron task failed: ${error.message}`,
      }),
    })
    
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
```

---

## ⚠️ 常见问题

### 1. **Cron 任务没有执行**

**排查步骤**：
- ✅ 检查 `CRON_API_KEY` 环境变量是否正确设置
- ✅ 检查调度服务配置是否正确
- ✅ 查看调度服务的日志
- ✅ 手动测试 API 端点

### 2. **返回 401 Unauthorized**

**原因**：API Key 不匹配

**解决方案**：
- 确保 Header 中的 API Key 与环境变量中的一致
- 格式必须是：`Authorization: Bearer your_key`

### 3. **任务执行时间不准确**

**原因**：
- GitHub Actions 可能有 5-10 分钟延迟
- 免费服务可能不够精确

**解决方案**：
- 使用付费调度服务（Zeabur、Vercel Pro）
- 使用专业的 Cron 服务（EasyCron）

### 4. **任务执行超时**

**原因**：任务执行时间过长

**解决方案**：
- 优化查询性能
- 分批处理大量数据
- 增加超时限制（Vercel Pro 可配置）

### 5. **重复执行**

**原因**：多个调度服务同时触发

**解决方案**：
- 只使用一个调度服务
- 添加幂等性检查（使用数据库锁）

---

## 🎯 最佳实践

### 1. **幂等性**

确保任务可以安全地重复执行：

```typescript
// 使用数据库锁或唯一键
const existingRecord = await db.query.taskLog.findFirst({
  where: eq(taskLog.taskName, "update-launches"),
})

if (existingRecord && isToday(existingRecord.lastRun)) {
  return NextResponse.json({ message: "Task already ran today" })
}
```

### 2. **错误处理**

每个操作都应该有 try-catch：

```typescript
for (const item of items) {
  try {
    await processItem(item)
  } catch (error) {
    console.error(`Failed to process item ${item.id}:`, error)
    // 继续处理其他项目
  }
}
```

### 3. **日志记录**

详细记录执行过程：

```typescript
console.log(`[${now.toISOString()}] Starting task`)
console.log(`Processing ${items.length} items`)
console.log(`Successfully processed ${successCount} items`)
console.log(`Failed to process ${failedCount} items`)
```

### 4. **性能优化**

- 使用批量操作
- 限制查询结果数量
- 使用索引

### 5. **监控和告警**

- 设置执行时间监控
- 失败时发送通知
- 定期检查日志

---

## 📚 相关资源

- [Next.js API Routes 文档](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Crontab Guru - Cron 表达式生成器](https://crontab.guru/)
- [GitHub Actions Schedule](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)

---

## 🆘 获取帮助

如果您在配置 Cron 任务时遇到问题：

1. 检查 Zeabur/Vercel 日志
2. 手动测试 API 端点
3. 查看 `docs/cron-launches.md`
4. 联系支持团队

---

**祝您定时任务配置顺利！** ⏰✨

