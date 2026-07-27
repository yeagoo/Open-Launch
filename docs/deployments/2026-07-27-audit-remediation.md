# 2026-07-27 全站审计修复 + 新功能（0–9 阶段）

Status: **生产部署完成**（2026-07-28，最终应用 commit
`805c25efb2188bb23d3b998eb29affd60f081118`）；0048–0057 已应用，评论 FK
已验证，部署后 hotfix 已发布

本次改造源于四路并行审计（安全 / 数据正确性 / 前端·SEO / 基础设施），覆盖
0–9 十个阶段：紧急安全修复、数据并发、运维可靠性、SEO 前端、搜索升级、
收藏、站内通知中心、评论举报审核、公开用户主页、动态 OG 图。每阶段均经
codex review 迭代至 0 findings；另完成两轮整体跨阶段 review（独立代理发现
7 项 + 自审发现 1 项，均已修复）。

---

## 一、各阶段内容速览

| 阶段 | 主题     | 关键变更                                                                                                                                                                                                                                                                                                                                 |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | 紧急安全 | `scheduleLaunch` launchType 白名单（支付绕过）；directory_order / launch_syndication 的 project_id FK 改 SET NULL（财务记录不再随项目删除）；submitProject/评论点赞/投票限流（fail-closed）；限流 IP 改用 cf-connecting-ip；better-auth Redis secondary storage（会话/验证令牌仍在 Postgres）；Tinyfish/crawl4ai 路径补 DNS 级 SSRF 校验 |
| 1    | 数据并发 | toggleUpvote/收藏 advisory lock 原子化；syndication `sending` 认领守卫 + 10 分钟回收；tag 计数按 id 排序防 AB-BA 死锁；cancelPendingDirectoryOrder 事务化；4 个热路径索引；simulate-engagement 全局锁防超发；缓存失效链修复                                                                                                              |
| 2    | 运维可靠 | `lib/env.ts` 启动 fail-fast（仅生产、跳过 build）；`/api/health` + Dockerfile HEALTHCHECK（8080）；durable email outbox（event_key 幂等 + Resend Idempotency-Key + 10 分钟 drain + 死信 24h 告警窗）；R2 超时；admin 告警 Discord 降级通道；CI 安全关卡阻塞 + Node 24；webhook 支付边界测试                                              |
| 3    | SEO/前端 | sitemap 补 blog（仅 published）/reviews 分片；robots 覆盖 locale 前缀；reviews Article schema + 列表页 ItemList；llms.txt 动态化（防 markdown 注入）；6 语言 headingRotateWords 数组修复；settings/dashboard 全量 i18n + 白屏改重定向；全局 error/not-found/loading 边界；upvote aria                                                    |
| 4    | 搜索     | trgm + FTS 索引（0053）；`%`/word-`<%`/ILIKE 索引臂 + tsvector + 源语言 tagline；零结果才走的全表 similarity 回退；游客开放搜索；⌘K 全量 i18n + AbortController 竞态修复；`/search` 结果页（noindex、限流、页码钳制）                                                                                                                    |
| 5    | 收藏     | bookmark 表（0054）；原子 toggle；项目页按钮（ongoing/launched 才显示）；dashboard Bookmarks tab（无 boost 按钮）                                                                                                                                                                                                                        |
| 6    | 通知中心 | notification 表（0055，dedupeKey 唯一）；评论/回复/mention/里程碑/状态翻转五类生产者（isBot 双向过滤、里程碑跨阈值补发、回复限定同项目）；铃铛 + /notifications 页；评论通知改为落库成功后触发（Discord 幽灵通知一并修复）                                                                                                               |
| 7    | 举报审核 | comment_report（0056）+ fuma_comments hidden 列；tombstone 隐藏（PATCH/DELETE/投票/回复/再举报全封锁，作者不可恢复）；admin 审核队列（hide/delete/dismiss + 审计日志）；评论与回复均有举报入口                                                                                                                                           |
| 8    | 用户主页 | `/users/[id]`（select 白名单、无公开项目 404、banned/bot 404、base64 头像剥离）；页面/sitemap/链接三处共享可见性谓词；maker 卡与通知 actor 链接经 hasPublicProfile 门禁                                                                                                                                                                  |
| 9    | 动态 OG  | 项目卡（logo 经 safeFetch + sharp 转 PNG/16MP 上限、CJK 全字形字体）、列表页品牌卡；字体打进 standalone（outputFileTracingIncludes）；twitter-image 独立声明                                                                                                                                                                             |
| 整体 | 跨阶段   | moderation 清理相关通知 excerpt；bot owner 不通知；死信 24h 告警窗（0057）；outbox attempts 原子自增；DELETE hidden 守卫 fail-closed；OG 16MP 上限                                                                                                                                                                                       |

---

## 二、生产部署步骤（按顺序执行）

### 1. 应用迁移（0048–0057）

```bash
bun scripts/apply-pending-sql.ts --dry-run   # 先确认待应用清单
bun scripts/apply-pending-sql.ts             # 按编号顺序应用
```

注意事项：

- **0049 / 0053 为 `CREATE INDEX CONCURRENTLY`**（no-transaction 逐句执行）。
  若构建被中断，PostgreSQL 会留下 INVALID 索引，`IF NOT EXISTS` 重跑会跳过。
  重跑前先检查并删除：
  `SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;`
- **0050（fuma FK）是 NOT VALID**：应用后执行孤儿清理再 VALIDATE（见第 2 步）。
- **0057** 给 email_outbox 加 `updated_at`，老行回填 `now()`：历史死信会再
  告警一次（24h 窗口）后自动安静，属预期。

### 2. 评论孤儿清理 + FK VALIDATE

```bash
bun scripts/ops/cleanup-comment-orphans.ts            # dry-run，先看统计
bun scripts/ops/cleanup-comment-orphans.ts --apply
```

然后在数据库手动执行：

```sql
ALTER TABLE fuma_rates VALIDATE CONSTRAINT fuma_rates_user_id_fkey;
ALTER TABLE fuma_rates VALIDATE CONSTRAINT fuma_rates_comment_id_fkey;
ALTER TABLE fuma_comments VALIDATE CONSTRAINT fuma_comments_thread_fkey;
```

### 3. 环境变量核对（启动 fail-fast）

部署后若进程启动即退出，看日志里 `[env] missing required environment
variables` 列出的缺失项。本轮新增/强调的必需项（完整列表见 `lib/env.ts`）：

- `R2_PUBLIC_DOMAIN`（此前缺失时上传会先存对象再报错，现已列入必需）
- `REDIS_URL`（明确为硬依赖：启动必检；运行时故障仍按端点降级）
- `CRON_API_KEY`、OAuth 四件套、`TURNSTILE_SECRET_KEY` 等均在必需列表

校验仅在生产运行时生效（instrumentation，跳过 build 阶段），CI/build 不受影响。

### 4. 部署后验证清单

```bash
curl -fsS https://www.aat.ee/api/health                 # liveness 200
curl -fsS -H "Authorization: Bearer $CRON_API_KEY" \
  "https://www.aat.ee/api/health?deep=1"                # DB+Redis readiness
curl -fsS https://www.aat.ee/sitemaps/blog.xml | head   # 含文章、无 draft
curl -fsS https://www.aat.ee/sitemaps/reviews.xml | head
curl -fsS https://www.aat.ee/sitemaps/users.xml | head
# 抽查一个 AVIF-logo 项目 + 一个 CJK 名项目：
curl -fsS -o /tmp/og.png https://www.aat.ee/projects/<slug>/opengraph-image
curl -fsS "https://www.aat.ee/search?q=prduct"          # typo 容忍应有结果
docker ps                                                # 容器 healthy 状态
```

功能抽查：游客模式 ⌘K 搜索可用；评论后作者铃铛 +1；dashboard Bookmarks tab；
`/notifications` 页面；举报一条评论后 admin/comment-reports 可见；
tombstone 评论的作者无法编辑/删除它（403）。

### 5. Cron 告警确认

- 部署后首个 drain-email-outbox tick（每 10 分钟）应出现在 cron_run_log。
- cron-health 若报死信：查 `email_outbox` 中 `status='failed'` 行的
  `last_error`；24h 后告警自动停止。
- 若再次出现"全部每日任务静默"：先查外部触发器（cron-job.org）与
  CRON_HEARTBEAT_URL 死人ping（dispatch 成功才 ping，调度器死亡 = 静默）。

---

## 三、遗留事项

1. **Codex 整体复核**：本轮整体 review 时代码已过多轮 codex 单阶段 review；
   整体复核因 codex 额度耗尽（2026-08-02 13:52 恢复）改用独立代理 + 自审
   完成（8 项发现已修复）。额度恢复后可用 `/tmp/codex-review-overall.log`
   中的 prompt 复核。
2. **静态子集字体风险已规避但成本高**：NotoSansSC-Bold.ttf 约 10.5MB，打进
   standalone 并在首个 OG 请求时载入内存（模块级缓存）。可接受；若镜像体积
   敏感，后续可换 woff2 子集 + 缺字回退策略。
3. **OG 路由为动态渲染**（每命中一次 safeFetch + sharp）：社交爬虫自身缓存 +
   CF 前置兜底；如需进一步降载可在 CF 层为 `*/opengraph-image` 配缓存规则。
4. **fuma author 匿名化策略**：删用户时评论 author 由清理脚本改为
   `deleted-user`；admin removeUser 路径暂不含自动匿名化（better-auth 无
   delete hook），依赖定期清理。
5. **大型 sitemap 不进入 Next Data Cache**：`users.xml` 与 `projects.xml`
   未压缩响应分别约 3.6MB / 9.8MB，超过 Next.js 单项 2MB cache 上限。
   当前请求均返回 200，搜索引擎 50MB 上限也未触及，但每次会重新查询并序列化；
   后续宜按条目数继续分片，而不是依赖 `unstable_cache`。

## 四、相关文档

- 迁移制度：`drizzle/migrations/`（0007 起全手写，禁止 `db:generate`）
- 环境变量清单：`lib/env.ts` + `docs/production-runtime.md`
- 生产 runbook：`docs/production-deployment-runbook.md`
- 计划档案：`~/.claude/plans/tender-beaming-lerdorf.md`

## 五、生产执行记录（2026-07-28）

### 主部署

- 应用源 commit：
  `1fc846d79882420b7b78cabfb66f378397969ee2`
- 计划：
  `deploy_aat-ee-audit-remediation-r10-20260728`
- 快照：
  `snap_aat-ee-audit-remediation-r10-20260728_1785171879384142497`
- journal：
  `deploy-deploy_aat-ee-audit-remediation-r10-20260728-20260727171337`
- 结果：7/7 操作成功，0 失败；应用容器和 `127.0.0.1:8080` 健康检查通过。

迁移容器按顺序应用并登记了 0048–0057 共 10 个手写迁移。清理脚本在应用前后
均确认四类评论孤儿为 0；三条 Fuma FK 的 `pg_constraint.convalidated` 均为
`true`；`pg_index` 中 INVALID 索引为 0。

### sitemap hotfix

主部署后的连续 sitemap 验证发现：`unstable_cache` 命中时会把 `Date` 恢复为
ISO 字符串，blog sitemap 序列化仍调用 `toISOString()`，导致缓存命中请求
500。修复加入字符串日期兼容与缓存往返回归测试：

- 最终应用 commit：
  `805c25efb2188bb23d3b998eb29affd60f081118`
- CI：
  `30288857076`（TypeScript、Lint、227 tests、Build、dependency audit、
  Semgrep 全部通过）
- 计划：
  `deploy_aat-ee-sitemap-hotfix-r12-20260728`
- 快照：
  `snap_aat-ee-sitemap-hotfix-r12-20260728_1785173220403871261`
- journal：
  `deploy-deploy_aat-ee-sitemap-hotfix-r12-20260728-20260727172810`
- 结果：仅替换 `aat-ee-app`，7/7 操作成功，0 失败；未重跑迁移或执行其他
  数据写入。

### 部署后证据

- `/api/health` 返回 200；容器内带授权调用 deep health 返回 200，
  Postgres/Redis 均为 `ok`。
- 同一 `/sitemaps/blog.xml` 连续三次返回 200，覆盖首次生成与缓存命中；
  sitemap index、reviews、users、projects 均返回 200 和 XML content type。
- `q=prduct` 返回 10 个搜索结果，搜索页返回 200。
- AVIF-logo 项目 `fluentdb` 与 CJK 名项目“拼豆AI”（slug `ai`）的 OG 路由
  均返回有效 PNG。
- 未授权 deep health、cron 和 upload 请求均返回 401。
- `drain-email-outbox` 在 `2026-07-27T17:30:29.195Z` 返回 200、无错误；
  email outbox 当时为空。
- 未执行会制造生产评论、收藏、通知或举报记录的认证写入抽查。
- 部署后备份记录：
  `backup-aat-ee-restic-20260727173253`，状态 success。
- restic 仓库检查：
  `check-restic-idrive-e2-20260727173405`，状态 success。
- 最终 `opsctl status`：doctor errors/warnings 均为 0；deploy gates、backup
  readiness/history、snapshot coverage 均为 ready。
