# Cron API 认证方式说明

## 🔑 两种认证方式

Open-Launch 的 Cron API 使用两种不同的认证方式：

### 方式 1: `Authorization: Bearer xxx` 🔐

**使用此方式的 API：**

- ✅ ProductHunt 自动导入 (`/api/cron/import-producthunt`)
- ✅ 更新项目状态 (`/api/cron/update-launches`)
- ✅ 发送提醒邮件 (`/api/cron/send-ongoing-reminders`)
- ✅ 通知周冠军 (`/api/cron/send-winner-notifications`)

**配置方式：**

```
Key: Authorization
Value: Bearer your-cron-secret-here
```

**cURL 示例：**

```bash
curl -X GET "https://www.aat.ee/api/cron/import-producthunt" \
  -H "Authorization: Bearer your-cron-secret-here"
```

**代码实现：**

```typescript
// app/api/cron/import-producthunt/route.ts
const authHeader = request.headers.get("authorization")
const cronSecret = process.env.CRON_SECRET

if (authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

---

### 方式 2: `x-cron-secret: xxx` 🗝️

**使用此方式的 API：**

- ✅ 虚拟互动 (`/api/cron/simulate-engagement`)
- ✅ 虚拟点赞 (`/api/cron/simulate-upvotes`) - 如果使用

**配置方式：**

```
Key: x-cron-secret
Value: your-cron-secret-here
```

**cURL 示例：**

```bash
curl -X GET "https://www.aat.ee/api/cron/simulate-engagement" \
  -H "x-cron-secret: your-cron-secret-here"
```

**代码实现：**

```typescript
// app/api/cron/simulate-engagement/route.ts
const { searchParams } = new URL(request.url)
const secret = searchParams.get("secret") || request.headers.get("x-cron-secret")

if (secret !== process.env.CRON_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

**额外支持：** 也支持 URL 参数 `?secret=xxx`

---

## 📊 快速对比表

| API 端点                              | 认证方式 | Header Key      | Header Value 格式 |
| ------------------------------------- | -------- | --------------- | ----------------- |
| `/api/cron/import-producthunt`        | Bearer   | `Authorization` | `Bearer <secret>` |
| `/api/cron/simulate-engagement`       | Custom   | `x-cron-secret` | `<secret>`        |
| `/api/cron/update-launches`           | Bearer   | `Authorization` | `Bearer <secret>` |
| `/api/cron/send-ongoing-reminders`    | Bearer   | `Authorization` | `Bearer <secret>` |
| `/api/cron/send-winner-notifications` | Bearer   | `Authorization` | `Bearer <secret>` |

## 🎯 在 Cron-Job.org 中配置

### 配置 Bearer 认证的任务

1. 点击任务的 **"Advanced"** 设置
2. 在 **Headers** 部分添加：
   - **Key:** `Authorization`
   - **Value:** `Bearer your-cron-secret-value`（注意 `Bearer` 和密钥之间有空格）

### 配置自定义 Header 认证的任务

1. 点击任务的 **"Advanced"** 设置
2. 在 **Headers** 部分添加：
   - **Key:** `x-cron-secret`
   - **Value:** `your-cron-secret-value`（直接是密钥值，不需要前缀）

## ⚠️ 常见错误

### 错误 1: "401 Unauthorized" - Bearer API

**原因：**

- 忘记添加 `Bearer ` 前缀
- `Bearer` 和密钥之间没有空格
- 密钥值不正确

**错误示例：**

```
❌ Authorization: your-secret
❌ Authorization: Beareryour-secret
❌ Authorization: bearer your-secret (小写)
```

**正确示例：**

```
✅ Authorization: Bearer your-secret
```

### 错误 2: "401 Unauthorized" - Custom Header API

**原因：**

- Header Key 拼写错误（`x-cron-secret` 而不是 `x-cron-secrets`）
- 密钥值不正确
- 意外添加了 `Bearer ` 前缀

**错误示例：**

```
❌ x-cron-secrets: your-secret (多了 s)
❌ x-cron-secret: Bearer your-secret (不需要 Bearer)
```

**正确示例：**

```
✅ x-cron-secret: your-secret
```

## 🔍 测试认证

### 测试 Bearer 认证

```bash
# 设置变量
export CRON_SECRET="your-cron-secret-here"

# 测试 ProductHunt 导入
curl -v -X GET "https://www.aat.ee/api/cron/import-producthunt" \
  -H "Authorization: Bearer $CRON_SECRET"

# 成功返回: {"success": true, ...}
# 失败返回: {"error": "Unauthorized"}
```

### 测试自定义 Header 认证

```bash
# 测试虚拟互动
curl -v -X GET "https://www.aat.ee/api/cron/simulate-engagement" \
  -H "x-cron-secret: $CRON_SECRET"

# 或者使用 URL 参数
curl -v -X GET "https://www.aat.ee/api/cron/simulate-engagement?secret=$CRON_SECRET"

# 成功返回: {"success": true, ...}
# 失败返回: {"error": "Unauthorized"}
```

### 使用 `-v` 查看详细信息

添加 `-v` 参数可以看到完整的请求和响应头：

```bash
curl -v -X GET "https://www.aat.ee/api/cron/import-producthunt" \
  -H "Authorization: Bearer $CRON_SECRET"

# 输出会包含：
# > GET /api/cron/import-producthunt HTTP/2
# > Authorization: Bearer xxx
# < HTTP/2 200
# < content-type: application/json
```

## 🛠️ 故障排除步骤

### 步骤 1: 检查环境变量

```bash
# 在服务器或 Zeabur 控制台中
echo $CRON_SECRET

# 应该输出您的密钥值
# 如果为空，说明环境变量未设置
```

### 步骤 2: 检查 Header 格式

在 cron-job.org 中，点击任务 → **"Edit"** → **"Advanced"** 查看配置的 Headers。

确认：

- Key 拼写正确
- Value 格式正确（Bearer API 需要 `Bearer ` 前缀）
- 没有多余的空格或换行

### 步骤 3: 查看执行日志

在 cron-job.org 中，点击任务 → **"Execution history"** 查看最近的执行结果。

**200 状态码** = 成功 ✅
**401 状态码** = 认证失败 ❌
**500 状态码** = 服务器错误 ❌

### 步骤 4: 查看应用日志

在 Zeabur 或您的服务器上查看应用日志：

```bash
# 查看最近的认证错误
grep "Unauthorized" logs/app.log

# 查看最近的 cron 任务日志
grep "cron" logs/app.log | tail -20
```

## 💡 最佳实践

### 1. 统一使用环境变量

所有 API 都使用同一个 `CRON_SECRET` 环境变量，只是 Header 格式不同。

```env
# .env
CRON_SECRET=your-secure-random-string-here
```

### 2. 使用强密钥

生成一个强随机字符串作为密钥：

```bash
# 方式 1: 使用 openssl
openssl rand -base64 32

# 方式 2: 使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 输出示例: J7x9K2mP5qR8sT1vW4yZ6aC3dF0gH9jL
```

### 3. 在 cron-job.org 中保存配置

配置好 Headers 后，cron-job.org 会自动保存。您可以随时编辑和测试。

### 4. 先本地测试，再部署

在配置 cron-job.org 之前，先用 curl 测试 API 是否可以正常访问。

## 🔒 安全建议

1. ✅ **不要将 `CRON_SECRET` 提交到 Git**
2. ✅ **定期轮换密钥**（每 3-6 个月）
3. ✅ **使用 HTTPS**（已配置 `https://www.aat.ee`）
4. ✅ **监控失败的认证尝试**（查看 401 错误日志）
5. ✅ **只在可信的 cron 服务上使用**（如 cron-job.org）

## 📚 相关文档

- [CRON_JOB_ORG_SETUP.md](./CRON_JOB_ORG_SETUP.md) - 完整配置指南
- [CRON_QUICK_REFERENCE.md](./CRON_QUICK_REFERENCE.md) - 快速参考卡片
- [env.example.txt](./env.example.txt) - 环境变量示例

---

**需要帮助？** 如果认证仍然失败，检查应用日志或联系支持。
