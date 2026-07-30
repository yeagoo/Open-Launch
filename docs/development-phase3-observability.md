# Phase 3：结构化日志与隐私安全 RUM

完成日期：2026-07-30
状态：代码完成；生产采样与效果验收待单独授权

## 交付范围

本阶段在不更换观测平台、不部署生产的前提下完成：

- server-only 单行 JSON logger，固定顶层字段：
  `timestamp`、`level`、`event`、`request_id`、`job_id`、`route`、
  `status`、`duration_ms`、`provider`、`context`、`error`。
- 深层日志脱敏：Cookie、Authorization、Stripe signature、OAuth
  code/state、token、API key、secret、邮箱、用户 ID、URL、查询/搜索参数、
  Stripe ID、UUID 和敏感环境变量值。
- request/auth/runtime error、Cron dispatcher/worker、Stripe webhook、
  safe-fetch、邮件 outbox 和 PostgreSQL pool error 的结构化日志迁移。
- 基于 `web-vitals/attribution` 的 CLS、FCP、INP、LCP、TTFB 真实用户指标；
  LCP 另记录 TTFB、资源加载等待、资源加载耗时和元素渲染等待。
- 复用 Matomo `_paq`，延迟加载期间最多保留 100 条命令。
- Cron materialization lag、queue depth、lease recovery、scheduled-to-start、
  24 小时任务 duration p50/p95 和 dead-letter count。

现有鉴权、Stripe signature 校验、Cron lease/幂等、HTTP 响应状态和告警语义
均未改变。

## 隐私契约

RUM 仅允许以下维度：

- route family，例如 `project_detail`，不含 slug；
- `en/zh/es/pt/fr/ja/ko/et/default` locale；
- `mobile/tablet/desktop` viewport class；
- 指标名、数值、评级；
- 四个纯数值 LCP timing segment。

RUM 不发送完整 URL、slug、搜索词、邮箱、用户 ID、DOM selector/target 或
Web Vitals attribution 中的资源 URL。事件发送前临时把 Matomo custom URL
设为 `https://www.aat.ee/__rum/<locale>/<route-family>`，发送后恢复既有页面
分析状态，避免 Web Vitals 事件关联到页面 slug。

普通分析 pageview 同样只记录 origin + pathname；显式 GA config、Matomo 初始
inline tracker、App Router tracker 与 RUM restore 都删除全部 query 和 fragment，
避免未知或未来新增的查询参数进入分析平台。

`WEB_VITALS_SAMPLE_RATE` 是 server-only 的 `[0,1]` 数值，默认 `0`。无显式
配置时不会加载 collector。无效值 fail-fast；采样在一次 page load 中只决定
一次，不对每个指标分别抽样。

## Review 与修复

按安全、隐私、性能、正确性、维护性和测试顺序完成 review。已修复的
Critical/High 项：

1. 原邮件脱敏仍保留 provider domain；现改为完整 `[redacted-email]`。
2. OAuth `code/state`、相对 request URL、camelCase sensitive key 和嵌套
   search params 覆盖不足；现统一 allowlist/redaction。
3. Web Vitals 输入最初只依赖 route mapper；命令构造器现再次验证 metric、
   rating、route family、locale 和 device allowlist。
4. attribution 是五种指标的联合类型；仅在 LCP 分支通过 record/numeric
   guard 读取四个字段，不使用不安全断言。
5. 延迟 collector chunk 失败可能产生 unhandled rejection；现静默降级，
   不影响页面体验。
6. Cron claim 曾把 scheduled-to-start 误写为统一 `duration_ms`；现移入明确
   context 字段。materialization result 也改为报告完成后的真实 lag。
7. Shadow materializer 失败从 error 调整为 warning，避免非权威路径制造
   错误告警。
8. 仅按日志字段名脱敏仍可能泄漏裸环境密钥值；logger 写出前会对敏感环境
   变量值做最后一道替换。

Review 后无剩余 Critical/High 代码问题。

## 验证结果

- `bunx tsc --noEmit`：通过。
- `bun run lint`：通过。
- `bun run test`：60 files passed、2 skipped；289 tests passed、7 skipped。
- `bun run build`：Next 16.2.12 production build、Cron worker bundle 和
  standalone preparation 全部通过。
- Cron worker：裸 Node `cron-ledger-worker.mjs --check` 通过。
- PostgreSQL 16 专用临时数据库：
  migration 0058 backfill/constraint 测试通过；实际执行 Cron observability
  SQL，验证 lag、p50/p95 和 scheduled-to-start 返回值。测试容器使用
  `--rm`，完成后已删除。

## 生产启用与回滚

本阶段没有修改生产。

启用时先保持 `WEB_VITALS_SAMPLE_RATE=0` 部署，确认结构化日志解析与容量；
经过隐私审批后从小样本（建议 `0.05`）开始，连续观察至少 7 天。重点核对：

- 日志中没有 Cookie、Authorization、完整 URL、邮箱或密钥；
- RUM Matomo request 不含 slug、search、user/DOM/resource URL；
- project detail mobile LCP 的样本量、p75 与四段耗时；
- Cron queue/lag、lease recovery、dead letter 和 duration p95；
- 日志量与 Matomo ingestion 没有异常增长。

RUM 回滚只需把 `WEB_VITALS_SAMPLE_RATE` 设为 `0` 并重新部署。若结构化日志
下游解析不兼容，可临时设置 `STRUCTURED_LOG_FORMAT=text`；不要关闭脱敏。
生产 7 天采样、Search Console field LCP 改善和告警阈值校准属于外部门禁，
不能由本地测试宣称完成。
