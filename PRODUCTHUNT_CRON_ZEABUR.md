# 🚀 Zeabur 环境下的 ProductHunt 自动导入方案

## 🔍 问题说明

由于项目运行在 **Zeabur 容器**中，您无法直接访问宿主机配置 Linux Cron。需要使用外部 Cron 服务触发 API。

---

## ✅ 推荐方案

### 方案 1: cron-job.org（推荐，完全免费）

**优点**:

- ✅ 完全免费
- ✅ 配置简单
- ✅ 支持 HTTPS
- ✅ 可查看执行历史
- ✅ 失败自动重试
- ✅ 邮件通知

#### 配置步骤

1. **注册账号**

   ```
   https://cron-job.org/
   点击 "Sign up" 注册免费账号
   ```

2. **创建 Cron Job**

   - 点击 "Create cronjob"
   - **Title**: ProductHunt Auto Import
   - **URL**: `https://www.aat.ee/api/cron/import-producthunt`
   - **Schedule**:
     - 选择 "Every day"
     - 时间: `01:00` UTC (北京时间 09:00)
   - **Request method**: GET
   - **Headers**: 添加认证头
     ```
     Authorization: Bearer YOUR_CRON_SECRET_HERE
     ```

3. **高级设置（可选）**

   - **Request timeout**: 30 秒
   - **Execution schedule**: Enabled
   - **Notification**: 开启失败通知

4. **保存并测试**
   - 点击 "Create"
   - 点击 "Run now" 测试执行

---

### 方案 2: EasyCron（免费版足够）

**优点**:

- ✅ 每天 1 次免费额度充足
- ✅ 支持自定义 Headers
- ✅ 详细的执行日志

#### 配置步骤

1. **注册账号**

   ```
   https://www.easycron.com/
   注册免费账号（每天可执行 1 次）
   ```

2. **创建 Cron Job**

   - 点击 "Add Cron Job"
   - **Cron Job Name**: ProductHunt Import
   - **URL**: `https://www.aat.ee/api/cron/import-producthunt`
   - **Cron Expression**: `0 1 * * *` (每天 01:00 UTC)
   - **HTTP Headers**:
     ```
     Authorization: Bearer YOUR_CRON_SECRET
     ```

3. **启用并测试**
   - 点击 "Create"
   - 点击 "Test" 测试

---

### 方案 3: GitHub Actions（适合已使用 GitHub）

**优点**:

- ✅ 与代码仓库集成
- ✅ 完全免费
- ✅ 易于版本控制
- ✅ 可查看执行日志

#### 配置步骤

1. **创建 Workflow 文件**

创建文件: `.github/workflows/producthunt-import.yml`

```yaml
name: ProductHunt Daily Import

on:
  schedule:
    # 每天 UTC 01:00 执行 (北京时间 09:00)
    - cron: "0 1 * * *"
  workflow_dispatch: # 允许手动触发

jobs:
  import:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger ProductHunt Import
        run: |
          response=$(curl -s -w "\n%{http_code}" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            https://www.aat.ee/api/cron/import-producthunt)

          http_code=$(echo "$response" | tail -n 1)
          body=$(echo "$response" | head -n -1)

          echo "HTTP Status: $http_code"
          echo "Response: $body"

          if [ "$http_code" -ne 200 ]; then
            echo "Import failed!"
            exit 1
          fi

          echo "Import completed successfully!"
```

2. **添加 Secret**

   - 进入 GitHub 仓库 → Settings → Secrets and variables → Actions
   - 点击 "New repository secret"
   - Name: `CRON_SECRET`
   - Value: 你的 CRON_SECRET 值

3. **启用 Workflow**
   - 提交代码到 GitHub
   - 进入 Actions 标签页
   - 选择 "ProductHunt Daily Import"
   - 点击 "Run workflow" 手动测试

---

### 方案 4: Zeabur Cron（如果 Zeabur 支持）

**注意**: Zeabur 目前可能不直接支持 Cron Jobs，但可以关注官方更新。

如果 Zeabur 未来支持 Cron，配置方式可能类似：

```yaml
# zeabur.yaml (假设的配置格式)
services:
  app:
    cron:
      - schedule: "0 1 * * *"
        command: "curl -H 'Authorization: Bearer $CRON_SECRET' https://www.aat.ee/api/cron/import-producthunt"
```

---

## 📊 方案对比

| 方案           | 成本 | 难度 | 可靠性     | 推荐度     |
| -------------- | ---- | ---- | ---------- | ---------- |
| cron-job.org   | 免费 | ⭐   | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| EasyCron       | 免费 | ⭐⭐ | ⭐⭐⭐⭐   | ⭐⭐⭐⭐   |
| GitHub Actions | 免费 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐   |
| Zeabur Cron    | 未知 | -    | -          | -          |

---

## 🎯 推荐配置流程

### 步骤 1: 生成 CRON_SECRET

```bash
# 在本地生成
openssl rand -base64 32
```

### 步骤 2: 配置 Zeabur 环境变量

在 Zeabur Dashboard 添加：

```bash
CRON_SECRET=your_generated_secret_here
PRODUCTHUNT_API_KEY=your_producthunt_token_here

# R2 配置（用于存储 logo）
R2_ACCOUNT_ID=your_r2_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=your_bucket_name
R2_PUBLIC_DOMAIN=https://your-r2-domain.com
```

**R2 配置说明**：

- 如果未配置 R2，导入将失败
- 需要先在 Cloudflare 创建 R2 bucket
- 详细配置请查看 R2_SETUP.md

### 步骤 3: 部署应用

```bash
git push origin main
# Zeabur 自动部署
```

### 步骤 4: 配置外部 Cron（推荐 cron-job.org）

1. 访问 https://cron-job.org/
2. 创建账号并登录
3. 创建 Cron Job：
   - URL: `https://www.aat.ee/api/cron/import-producthunt`
   - Schedule: 每天 01:00 UTC
   - Header: `Authorization: Bearer YOUR_CRON_SECRET`

### 步骤 5: 测试执行

在 cron-job.org 点击 "Run now" 测试，或手动执行：

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://www.aat.ee/api/cron/import-producthunt
```

**预期响应**:

```json
{
  "success": true,
  "summary": {
    "imported": 5,
    "skipped": 0,
    "errors": 0
  }
}
```

---

## 🔍 监控和日志

### 查看应用日志

在 Zeabur Dashboard:

1. 进入项目 → 选择服务
2. 点击 "Logs" 标签
3. 搜索关键词: `ProductHunt import`

**预期日志**:

```
🚀 Starting ProductHunt import cron job...
📦 Fetched 5 posts from ProductHunt
🤖 Found 5 bot users
✅ Imported #1: "Amazing Product" (234 votes)
✅ Imported #2: "Cool App" (189 votes)
...
🎉 Import completed: 5 imported, 0 skipped, 0 errors
```

### 查看 Cron 执行历史

- **cron-job.org**: Dashboard → Execution history
- **EasyCron**: Cron Job → Logs
- **GitHub Actions**: Actions 标签页 → Workflow runs

---

## 🔧 故障排查

### 问题 1: 401 Unauthorized

**原因**: CRON_SECRET 不匹配

**解决**:

```bash
# 1. 检查 Zeabur 环境变量
在 Zeabur Dashboard 确认 CRON_SECRET 已配置

# 2. 检查 Cron 服务的 Header 配置
确保格式: Authorization: Bearer YOUR_SECRET
```

### 问题 2: 500 Internal Server Error

**原因**: 可能是 PRODUCTHUNT_API_KEY 未配置或无效

**解决**:

```bash
# 1. 检查 Zeabur 环境变量
PRODUCTHUNT_API_KEY 是否配置

# 2. 查看 Zeabur 日志
搜索错误信息
```

### 问题 3: Cron 未执行

**原因**: Cron 服务配置错误或被禁用

**解决**:

- 检查 Cron 服务状态是否为 "Enabled"
- 验证时间表达式是否正确
- 手动点击 "Run now" 测试

---

## 📝 维护清单

### 每日检查

- [ ] 查看 Cron 服务执行历史
- [ ] 检查 Zeabur 日志确认导入成功

### 每周检查

- [ ] 验证网站是否有新产品上线
- [ ] 检查导入成功率

### 每月检查

- [ ] 审查 ProductHunt API 使用情况
- [ ] 检查是否有重复导入

---

## 🚨 紧急停止

如需停止自动导入：

1. **临时禁用**:

   - 在 cron-job.org/EasyCron 点击 "Disable"

2. **永久停止**:
   - 删除 Cron Job
   - 或在 Zeabur 移除 PRODUCTHUNT_API_KEY 环境变量

---

## ✅ 快速开始（推荐流程）

```bash
# 1. 生成密钥
CRON_SECRET=$(openssl rand -base64 32)
echo "CRON_SECRET: $CRON_SECRET"

# 2. 在 Zeabur Dashboard 配置环境变量
CRON_SECRET=<上面生成的值>
PRODUCTHUNT_API_KEY=<你的 ProductHunt Token>

# 3. 部署应用
git push origin main

# 4. 注册 cron-job.org 并创建任务
URL: https://www.aat.ee/api/cron/import-producthunt
Schedule: 0 1 * * * (每天 01:00 UTC)
Header: Authorization: Bearer <CRON_SECRET>

# 5. 测试
点击 "Run now" 并查看结果
```

---

## 📚 相关文档

- **API 端点实现**: `app/api/cron/import-producthunt/route.ts`
- **ProductHunt 客户端**: `lib/producthunt.ts`
- **环境变量配置**: `.env.example`
- **完整指南**: `PRODUCTHUNT_AUTO_IMPORT.md`

---

**推荐使用 cron-job.org，配置最简单，完全免费且可靠！** 🚀
