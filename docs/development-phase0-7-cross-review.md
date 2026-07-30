# Phase 0–7 跨阶段代码复核

日期：2026-07-30
状态：本地代码复核与修复完成；生产部署、采样与业务批准仍为外部门禁。

## 范围

本轮不把单个 Phase 的既有测试结果视为跨阶段正确，按以下顺序重新检查：

1. auth、支付、SQL/XSS、analytics 隐私、secret 与 Cron 权威；
2. transaction、lease、幂等、重试、错误与回滚路径；
3. 首页查询、bundle、字体、Docker context 与不可变 runner；
4. migration、CI、浏览器夹具、文档和失败路径。

本轮没有连接生产、部署、推送镜像、触发真实 Stripe/Cron、写 R2 或批准 Cron
policy。

## 已修复问题

### High

- Analytics URL 最小化：Matomo 原先只删除五个 query key，GA 显式 config
  默认仍使用完整 `document.location`。初始 GA/Matomo pageview、App Router
  Matomo tracker 与 RUM restore 现在只保留 origin + pathname，并有源码契约测试。
- Stripe directory reference：`directory_order.id` 是 PostgreSQL UUID，原 helper
  只检查 `dir_` 后非空，malformed signed webhook 会在 UUID cast 持续 500。
  现在查询前要求 canonical UUID，并进入既有幂等 orphan refund/admin review。
- Cron secret 边界：legacy/shadow dispatcher 原先直接信任
  `INTERNAL_BASE_URL`。所有模式现在统一复用 ledger 的内部 URL resolver，在构造
  Authorization request 前拒绝 public、带 credentials、非 HTTP 或带 path/query
  的 origin。
- Migration 历史完整性：已应用文件 hash drift 原先只告警；首版修复又漏掉
  “tracker 有记录但文件已删除”。现在内容变化和文件缺失都会在任何
  migration/tracker 写入前 fail closed。
- Runner 可复现性：Git ignored 的本地头像池原先仍进入 Docker context，导致同一
  build-input identity 可能得到不同 runtime assets。构建 context 现在排除头像池，
  builder 必须从 checked-in generator 重建完整 20,000 个文件。

### Medium

- Email outbox 的 `remaining` 与 due selection 共用同一 retryable selector，包含
  尚未耗尽预算的 failed rows。
- Cron policy inventory 复用真实 journal + hand-written migration 顺序，不再按
  filename lexical order 推导最终 schedule。
- 首页月榜改为 `[UTC 月初, 下月 UTC 月初)`，不再依赖服务器本地时区或包含式月末。
- Orphan payment 在 session 缺少 `amount_total` 时使用实际 Stripe refund
  amount/currency，避免成功退款却告警 0 USD。
- Payment success 校验 response payload、编码 session query/slug segment，并在
  unmount 时 abort fetch、清理 redirect timer。
- Monthly recap Cron 的原始 `console.error` 和 provider/DB error response 改为
  structured logger + 通用 500；OG fallback 同样改走脱敏 logger。
- Better Auth 浏览器夹具增加真实 padded-base64 + URL-encoding cookie 格式测试；
  本地 E2E 固定使用与构建配置一致的 loopback origin。

## 验证证据

- TypeScript：通过。
- 全仓 ESLint：通过。
- Bun dependency audit（low 及以上）：0 vulnerabilities。
- Cron policy inventory：22 项结构检查通过；policy 状态没有被擅自修改。
- Vitest：76 files passed、2 skipped；344 tests passed、8 skipped。
- PostgreSQL 16：
  - migration 0058 backfill、unique window 和 constraints；
  - 首页 0/1/300 upvotes、0/1/250 comments 与执行计划；
  - 空库完整 Drizzle + 59 个 hand-written migration replay 和 runtime schema drift；
  - Cron materialize/claim/recovery allowlist 与 observability integration。
- Production build、standalone font inventory、Cron worker `--check` 和四 route
  JavaScript budgets：通过。
- Playwright：setup、locale/nav、匿名搜索、auth boundary、submit validation、
  project metadata/lazy comments、sitemap 和 intercepted payment 共 8 项通过。
- Validation-only linux/amd64 runner：
  - Docker context 387 KiB，builder 内从零生成 20,000 个头像；
  - checksum、SPDX SBOM、max provenance、59 个迁移与最终 HTTP smoke 通过；
  - `validationOnly=true`、`releasable=false`，没有 push 或部署。

## 未自动处理的事项

- 22 项 Cron policy 仍是 `proposed`。Canary/cutover 必须经过业务批准、只读
  preflight、观察窗口和生产变更授权。
- Premium webhook 的 replay/延迟付款代码问题已由后续
  [Phase 8](./development-phase8-payment-webhook-outbox.md) 使用 durable outbox
  和共享收尾路径修复；consumer-first 生产启用与现场收件验证仍是外部门禁。
- 生产 Matomo/GA network payload、Google Analytics property 的自动 pageview
  设置、至少 7 天 RUM/Search Console LCP、真实日志与 Cron 告警仍需部署后验证。
- 头像 R2/CDN 方案、韩文字体覆盖、前一生产 digest 的非生产回滚演练仍需外部
  决策或 registry 状态。

## 回滚

本轮修改均保持现有数据库/API schema：

- Analytics 可恢复旧 page URL helper，但会重新引入 query/fragment 隐私风险；
- Cron URL resolver、migration guard 和 Docker context 都是 fail-closed 门禁，
  不应为绕过错误配置而回滚；
- 首页 UTC window、payment payload guard 和日志迁移可按文件独立回滚；
- Stripe malformed reference 走现有 orphan refund 分支，不需要数据迁移。
