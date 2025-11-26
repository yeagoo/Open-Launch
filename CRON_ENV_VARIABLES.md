# Cron API 环境变量对照表

## 📋 完整对照表

| API 端点                              | 认证方式 | Header Key      | Header Value 格式 | 环境变量名     |
| ------------------------------------- | -------- | --------------- | ----------------- | -------------- |
| `/api/cron/import-producthunt`        | Bearer   | `Authorization` | `Bearer <value>`  | `CRON_SECRET`  |
| `/api/cron/simulate-engagement`       | Custom   | `x-cron-secret` | `<value>`         | `CRON_SECRET`  |
| `/api/cron/simulate-upvotes`          | Custom   | `x-cron-secret` | `<value>`         | `CRON_SECRET`  |
| `/api/cron/update-launches`           | Bearer   | `Authorization` | `Bearer <value>`  | `CRON_API_KEY` |
| `/api/cron/send-ongoing-reminders`    | Bearer   | `Authorization` | `Bearer <value>`  | `CRON_API_KEY` |
| `/api/cron/send-winner-notifications` | Bearer   | `Authorization` | `Bearer <value>`  | `CRON_API_KEY` |

## 🔑 环境变量说明

### 1. `CRON_SECRET`

**使用的 API：**

- ✅ ProductHunt 自动导入
- ✅ 虚拟互动（点赞 + 评论）
- ✅ 虚拟点赞（如果使用）

**特点：**

- ProductHunt 导入使用 `Authorization: Bearer` 格式
- 虚拟互动使用 `x-cron-secret` 格式
- **同一个环境变量，不同的 Header 格式**

### 2. `CRON_API_KEY`

**使用的 API：**

- ✅ 更新项目状态
- ✅ 发送提醒邮件
- ✅ 通知每日获奖者

**特点：**

- 全部使用 `Authorization: Bearer` 格式
- 统一的认证方式

## 🎯 为什么有两个不同的环境变量？

### 历史原因

1. **`CRON_SECRET`** - 较新的 API

   - ProductHunt 导入功能
   - 虚拟互动功能（最新添加）
   - 使用更现代的实现

2. **`CRON_API_KEY`** - 较旧的 API
   - 项目状态更新
   - 邮件提醒功能
   - 获奖者通知
   - 原有的实现方式

### 建议

虽然使用两个不同的环境变量，但**可以设置为相同的值**：

```env
# .env
CRON_SECRET=your-secure-random-string-here
CRON_API_KEY=your-secure-random-string-here
```

或者使用不同的值以提高安全性：

```env
# .env
CRON_SECRET=secret-for-producthunt-and-engagement-abc123
CRON_API_KEY=secret-for-status-and-emails-xyz789
```

## 📝 .env 配置示例

### 最简配置（推荐）

```env
# Cron 任务认证密钥（所有 API 使用相同值）
CRON_SECRET=your-secure-random-string
CRON_API_KEY=your-secure-random-string
```

### 安全增强配置

```env
# ProductHunt 和虚拟互动专用密钥
CRON_SECRET=producthunt-engagement-secret-abc123

# 状态更新和邮件专用密钥
CRON_API_KEY=status-email-secret-xyz789
```

### 完整配置

```env
# ========================================
# Cron 任务认证
# ========================================

# ProductHunt 导入 + 虚拟互动
CRON_SECRET=your-cron-secret-here

# 状态更新 + 邮件通知
CRON_API_KEY=your-cron-api-key-here

# ========================================
# 其他相关配置
# ========================================

# ProductHunt API（用于导入功能）
PRODUCTHUNT_API_KEY=your-producthunt-api-key

# DeepSeek API（用于 AI 评论生成）
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-chat
```

## 🔧 Cron-Job.org 配置对照

### 任务 1: ProductHunt 自动导入

```
Header Key: Authorization
Header Value: Bearer <CRON_SECRET 的值>
```

**示例：**

```
如果 CRON_SECRET=abc123
则 Header Value: Bearer abc123
```

### 任务 2: 虚拟互动

```
Header Key: x-cron-secret
Header Value: <CRON_SECRET 的值>
```

**示例：**

```
如果 CRON_SECRET=abc123
则 Header Value: abc123
```

### 任务 3: 更新项目状态

```
Header Key: Authorization
Header Value: Bearer <CRON_API_KEY 的值>
```

**示例：**

```
如果 CRON_API_KEY=xyz789
则 Header Value: Bearer xyz789
```

### 任务 4: 发送提醒邮件

```
Header Key: Authorization
Header Value: Bearer <CRON_API_KEY 的值>
```

### 任务 5: 通知每日获奖者

```
Header Key: Authorization
Header Value: Bearer <CRON_API_KEY 的值>
```

## 🧪 测试命令

### 测试使用 CRON_SECRET 的 API

```bash
# 设置环境变量
export CRON_SECRET="your-cron-secret-here"

# 测试 ProductHunt 导入（Bearer 格式）
curl -X GET "https://www.aat.ee/api/cron/import-producthunt" \
  -H "Authorization: Bearer $CRON_SECRET"

# 测试虚拟互动（x-cron-secret 格式）
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement" \
  -H "x-cron-secret: $CRON_SECRET"
```

### 测试使用 CRON_API_KEY 的 API

```bash
# 设置环境变量
export CRON_API_KEY="your-cron-api-key-here"

# 测试更新项目状态
curl -X GET "https://www.aat.ee/api/cron/update-launches" \
  -H "Authorization: Bearer $CRON_API_KEY"

# 测试发送提醒邮件
curl -X GET "https://www.aat.ee/api/cron/send-ongoing-reminders" \
  -H "Authorization: Bearer $CRON_API_KEY"

# 测试通知获奖者
curl -X GET "https://www.aat.ee/api/cron/send-winner-notifications" \
  -H "Authorization: Bearer $CRON_API_KEY"
```

## 🔍 验证环境变量

在服务器或 Zeabur 控制台中检查：

```bash
# 检查 CRON_SECRET
echo $CRON_SECRET

# 检查 CRON_API_KEY
echo $CRON_API_KEY
```

如果输出为空，说明环境变量未设置。

## ⚠️ 常见问题

### 问题 1: "401 Unauthorized" 但密钥正确

**可能原因：**

- 使用了错误的环境变量
- ProductHunt 导入应该用 `CRON_SECRET`
- 状态更新/邮件应该用 `CRON_API_KEY`

**解决方案：**

```bash
# 检查使用的是哪个环境变量
# ProductHunt/虚拟互动 → CRON_SECRET
# 状态更新/邮件 → CRON_API_KEY
```

### 问题 2: 记不清哪个 API 用哪个变量

**快速记忆法：**

- **新功能（ProductHunt + 虚拟互动）** → `CRON_SECRET`
- **旧功能（状态 + 邮件）** → `CRON_API_KEY`

或者：

- **数据导入和互动类** → `CRON_SECRET`
- **系统维护和通知类** → `CRON_API_KEY`

### 问题 3: 可以统一使用一个环境变量吗？

**答：** 不能直接统一，但可以设置为相同的值。

代码中使用的环境变量名是硬编码的：

- `process.env.CRON_SECRET`
- `process.env.CRON_API_KEY`

**推荐做法：**

```env
# 设置为相同的值
CRON_SECRET=same-secret-value-abc123
CRON_API_KEY=same-secret-value-abc123
```

这样只需要记住一个密钥值即可。

## 🔒 安全建议

### 生成强密钥

```bash
# 方式 1: 使用 openssl
openssl rand -base64 32

# 方式 2: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 输出示例: K7j9L2mP5qR8sT1vW4yZ6aC3dF0gH9jN
```

### 密钥管理

1. ✅ **不要提交到 Git**

   - 添加到 `.gitignore`
   - 使用 `.env.local` 文件

2. ✅ **定期轮换**

   - 每 3-6 个月更换一次
   - 同时更新服务器和 cron-job.org

3. ✅ **使用不同的值**

   - 生产环境和开发环境使用不同密钥
   - 可选：`CRON_SECRET` 和 `CRON_API_KEY` 使用不同值

4. ✅ **监控失败日志**
   - 定期检查 401 错误
   - 发现异常立即更换密钥

## 📊 快速总结表

| 环境变量       | 使用 API 数量 | 认证格式        | 功能类型           |
| -------------- | ------------- | --------------- | ------------------ |
| `CRON_SECRET`  | 3 个          | Bearer + Custom | 数据导入、虚拟互动 |
| `CRON_API_KEY` | 3 个          | Bearer          | 系统维护、邮件通知 |

**简化记忆：**

- `CRON_SECRET` = 新功能（ProductHunt + 互动）
- `CRON_API_KEY` = 旧功能（状态 + 邮件）

## 📚 相关文档

- [CRON_AUTH_METHODS.md](./CRON_AUTH_METHODS.md) - 认证方式详解
- [CRON_JOB_ORG_SETUP.md](./CRON_JOB_ORG_SETUP.md) - 完整配置指南
- [CRON_QUICK_REFERENCE.md](./CRON_QUICK_REFERENCE.md) - 快速参考
- [env.example.txt](./env.example.txt) - 环境变量示例

---

**需要帮助？** 如果仍然不确定使用哪个环境变量，查看上面的对照表或测试命令。
