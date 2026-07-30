# Phase 5：发布质量门禁

日期：2026-07-30
状态：代码与本地门禁完成；等待远端 CI 首次运行及两周性能观察窗口。

## 已交付

### 跨系统浏览器 smoke

- Playwright Chromium 覆盖 locale 导航、匿名搜索、登录边界、已登录 submit
  客户端校验、项目页评论懒加载、canonical、JSON-LD 和 sitemap。
- 认证 fixture 写入隔离 PostgreSQL，使用真实 Better Auth session cookie；没有增加
  测试后门。
- 支付成功页仅拦截本地 `/api/payment/verify` fixture，浏览器层阻止所有非 loopback
  请求，不会访问 Stripe 或产生真实 charge。
- 测试目标必须是 loopback，数据库名必须以 `open_launch_e2e` 开头，认证 secret
  必须以 `open-launch-e2e-` 开头；条件不满足时 fail closed。

### 数据库发布门禁

`bun run test:release-db` 只接受 loopback 且名为
`open_launch_release_test*` 的空数据库，然后：

1. 复用正式 `bun run db:migrate`，执行 Drizzle journal 0000–0006 和全部手写迁移；
2. 核对 Drizzle tracker 条数；
3. 核对手写 migration tracker 的文件集合和 SHA-256；
4. 核对 runtime schema 的表、列、类型、NOT NULL、主键和已声明索引。

门禁首次运行发现并修复了两处已有声明漂移：

- `domain_dr_cache.raw_response`：runtime `json` 与迁移 `jsonb` 不一致；
- `promo_code.discount_amount`：runtime `text` 与迁移 `numeric(10,2)` 不一致。

### CI 与最终 runner

主 CI 新增两个 job：

- `release-gates`：空库全迁移、schema drift、production standalone build、
  Playwright、route JS/HTML/Lighthouse 观测；
- `runner-smoke`：依赖普通 checks 和 release-gates 成功，构建最终
  linux/amd64 immutable runner，并以隔离 PostgreSQL/Redis 检查 health、首页、
  locale、sitemap、cron 认证和静态资源。

迁移、安全测试、浏览器测试和 runner smoke 都是阻塞步骤。性能阈值目前为
`observe`，只有阈值超出不阻塞；报告缺失、目标错误或采集失败仍会让 job 失败。

要让它成为合并/部署的外部门禁，还需在 GitHub 仓库设置中把对应 status checks
设为 required，并让生产部署依赖成功的 workflow。代码无法代替这项仓库设置。

## 本地验证结果

- TypeScript：通过。
- ESLint：通过。
- Vitest：64 files passed、2 skipped；302 tests passed、7 skipped。
- Playwright：8/8 通过。
- 空库完整迁移和 schema drift：通过（7 个 journal migration、59 个手写
  migration）。
- 首页真实 PostgreSQL 聚合：通过；fixture 计划峰值行数从 75,009 降到 301。
- production standalone build：通过。
- immutable linux/amd64 runner build、SBOM/provenance/checksum：通过，制品为
  `validation-only`、`releasable=false`。
- 最终 runner HTTP smoke：通过。
- dependency audit：无已知漏洞。

本机一次移动 Lighthouse 观测：

| 指标                    |      实测 |  观察阈值 | 结果         |
| ----------------------- | --------: | --------: | ------------ |
| 首页 route JS gzip 上界 | 136,279 B | 160,000 B | 通过         |
| 首页 HTML               | 102,157 B | 350,000 B | 通过         |
| Lighthouse performance  |      0.87 |     ≥0.70 | 通过         |
| Lighthouse LCP          |  3,975 ms | ≤3,000 ms | 超出、仅观察 |

单次实验室 Lighthouse 不能替代 CrUX/Search Console 的移动 p75。按方案保留两周
观察窗口后，依据稳定分布调整阈值并将其改为 `enforce`；当前 3.98 秒仍说明 LCP
优化没有结束。

## Review 中修复的问题

- Tiptap v2/v3 混装导致 submit 页 hydration 时 ProseMirror keyed plugin 冲突：
  统一到 Tiptap 3.27.3，采用 v3 extensions import，并按 Next.js SSR 要求关闭
  immediate render。
- 首页评论和点赞子查询都暴露 `project_id`，生成 SQL 的第二个 JOIN 字段不带
  qualifier：保留 Drizzle column ownership，消除 PostgreSQL ambiguous column。
- E2E 的 route announcer 也使用 `role=alert`：断言收窄到 form，避免把框架
  live region 当成字段错误。
- standalone 在 `127.0.0.1` 请求下会把默认 locale 内部 rewrite 规范化为
  `localhost`：CI browser target 统一使用 `localhost`，数据库仍固定 loopback。

Review 后未发现剩余 Critical/High 代码问题。

## 回滚

- 浏览器门禁：回滚 `e2e/`、`playwright.config.ts` 和 Playwright scripts；
  不涉及生产数据。
- 数据库门禁：回滚 `scripts/test-release-database.ts` 和对应 CI step；不要回滚
  已确认正确的 `jsonb`/`numeric` runtime schema 声明。
- 性能观测：可单独回滚 budget config/library/script，或继续保持 `observe`；
  不得通过删除报告采集来“通过”门禁。
- runner gate：可回滚主 CI 的 `runner-smoke` job，但保留已有手动 immutable
  runner workflow 和 smoke script。
- Tiptap：如需回退，必须整体回退到一个主版本，不能恢复 v2/v3 混装。

本阶段未连接生产数据库、未产生真实支付、未推送或部署生产版本。
