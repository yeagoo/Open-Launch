# Cron API 认证方式说明

> ⚠️ **历史版本曾描述两种认证方式(`Authorization: Bearer` 与 `x-cron-secret` /
> `?secret=`,以及 `CRON_SECRET` 变量)。这些都已废弃且不安全(`?secret=` 会把密钥
> 泄露到访问日志 / Referer)。当前代码只有一种认证方式,见下文;按旧方式配置会得到
> 401。请勿据旧描述"修正"代码。**

## 🔑 唯一认证方式:`Authorization: Bearer <CRON_API_KEY>`

所有 `app/api/cron/*` 路由统一通过 `lib/cron-auth.ts` 的 `verifyCronAuth()` 校验:

- **只**从 `Authorization: Bearer <key>` 请求头读取密钥(**不**从 URL 查询参数读取)。
- 使用 `crypto.timingSafeEqual` 做**恒定时间比较**,避免计时侧信道。
- 环境变量名为 **`CRON_API_KEY`**(不是 `CRON_SECRET`);未配置时**拒绝**(fail-closed)。

**配置方式(cron-job.org → 任务 Advanced → Headers):**

```
Key:   Authorization
Value: Bearer your-cron-api-key-here     （Bearer 和密钥之间有一个空格）
```

**cURL 示例:**

```bash
curl -X GET "https://www.aat.ee/api/cron/dispatch" \
  -H "Authorization: Bearer your-cron-api-key-here"
```

**代码实现(权威来源):**

```typescript
// lib/cron-auth.ts
import { timingSafeEqual } from "node:crypto"

export function verifyCronAuth(request: Request): NextResponse | null {
  const apiKey = process.env.CRON_API_KEY
  if (!apiKey) return NextResponse.json({ error: "..." }, { status: 500 })
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  const a = Buffer.from(provided)
  const b = Buffer.from(apiKey)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null // authorized
}
```

## 🎯 单一入口:`/api/cron/dispatch`

实践中 cron-job.org **只需配置一个任务**:每分钟调用 `/api/cron/dispatch`(带上面的
Bearer 头)。dispatcher 读取 `cron_schedule` 表,把当分钟到期的子任务在内部分发执行
(详见 `drizzle/migrations/0016_cron_dispatcher.sql`)。无需为每个子任务单独配置 cron。

## ⚠️ 常见错误:401 Unauthorized

```
❌ Authorization: your-key              （缺少 "Bearer " 前缀）
❌ Authorization: Beareryour-key        （Bearer 与密钥之间缺空格）
❌ Authorization: bearer your-key       （前缀匹配大小写不敏感,可接受,但请规范用 "Bearer"）
❌ ?secret=your-key / x-cron-secret 头  （已不支持,返回 401）
✅ Authorization: Bearer your-key
```

## 🔍 测试认证

```bash
export CRON_API_KEY="your-cron-api-key-here"

curl -v -X GET "https://www.aat.ee/api/cron/dispatch" \
  -H "Authorization: Bearer $CRON_API_KEY"

# 成功: HTTP 200,返回 { dispatchedAt, ranCount, ... }
# 失败: HTTP 401,返回 { "error": "Unauthorized" }
```

## 🔒 安全建议

1. ✅ **不要把 `CRON_API_KEY` 提交到 Git。**
2. ✅ 使用强随机密钥:`openssl rand -base64 32`。
3. ✅ 定期轮换(每 3–6 个月)。
4. ✅ 全程 HTTPS(已配置 `https://www.aat.ee`)。
5. ✅ 监控 401 日志,排查异常访问。

## 📚 相关文档

- [CRON_JOB_ORG_SETUP.md](./CRON_JOB_ORG_SETUP.md) - 完整配置指南
- [CRON_QUICK_REFERENCE.md](./CRON_QUICK_REFERENCE.md) - 快速参考卡片
- [env.example.txt](./env.example.txt) - 环境变量示例
