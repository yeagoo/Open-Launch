# 2026-07-27 全站审计修复 + 新功能（0–9 阶段）

Status: **生产部署完成**（2026-07-28，最终应用 commit
`ea606e9cf65099272615b14ea595cd5daed14bc8`）；0048–0057 已应用，评论 FK
已验证，sitemap hotfix/分片、runtime/LCP 修复及 canonical redirect hotfix
、locale context hotfix 与 alternatives 临时失败重试修复均已发布

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
curl -fsS https://www.aat.ee/sitemaps/users-1.xml | head
curl -fsS https://www.aat.ee/sitemaps/tags-1.xml | head
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
5. **Cloudflare Rocket Loader 已关闭**（2026-07-28）：关闭前公网响应注入
   `rocket-loader.min.js`，并把 Next.js/React 流式 reveal 脚本改写为非标准
   script type；生产源站对照没有这些改写。关闭后英语与西语 Ogtv 页面中的
   `rocket-loader`、`data-cf-settings`、改写 script type 均为 0，闭环证据见
   r16 执行记录。
6. **轮换 `X-RapidAPI-Key`**：本次本地制品构建前，误用 shell 读取非标准
   dotenv 键名时，该凭据曾进入工具错误输出。后续已改用 Bun dotenv parser，
   但该 key 仍应在提供方后台轮换。
7. **Aegis systemd 状态漂移**：`aegis.service` 因 2026-07-28
   unattended-upgrade 后遗留进程而显示 failed；标准 restart 仍被旧 updater
   的 SIGKILL 中断。`AliYunDunUpdate`、`AliYunDun`、
   `AliYunDunMonitor` 三个核心进程实际都在运行（客户端
   `aegis_12_93`）。未强杀在线安全代理；后续应在阿里云控制台确认在线状态，
   再安排维护窗修正 unit 接管。

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

### sitemap 分片发布

hotfix 验证时发现 projects/users 的展开后 hreflang 对象超过 Next.js 2MB
单项 Data Cache 上限。`r13` 将两类 sitemap 改为每片 250 个源记录，并只缓存
紧凑源行；locale/hreflang 在缓存读取后展开：

- 最终应用 commit：
  `176b6d37ac32d80fca66a0ab8010a8becb03b59a`
- CI：
  `30290783482`（TypeScript、Lint、228 tests、Build、dependency audit、
  Semgrep 全部通过）
- 计划：
  `deploy_aat-ee-sitemap-sharding-r13-20260728`
- 快照：
  `snap_aat-ee-sitemap-sharding-r13-20260728_1785174671066687746`
- journal：
  `deploy-deploy_aat-ee-sitemap-sharding-r13-20260728-20260727175306`
- 结果：仅替换 `aat-ee-app`，7/7 操作成功，0 失败；未运行迁移或写业务数据。

生产 index 实际生成 8 个 projects 分片和 3 个 users 分片。两轮抓取均为 200：
projects 共 14,704 个 locale URL，users 共 4,624 个 locale URL，合计 19,328
个 `<loc>` 且全部唯一；每片不超过 2,000 URL，远低于 sitemap 协议的
50,000 URL / 50MB 上限。旧的 `projects.xml`、`users.xml` 均 308 到完整
index；非法分片号返回 404。应用日志不再出现 `items over 2MB can not be
cached`。

- 部署后备份记录：
  `backup-aat-ee-restic-20260727175821`，状态 success。
- restic 仓库检查：
  `check-restic-idrive-e2-20260727175936`，状态 success。
- 最终 `opsctl status`：doctor errors/warnings 均为 0；deploy gates、backup
  readiness/history、snapshot coverage 均为 ready。

### runtime 与移动 LCP 修复（r14）

近两天日志审计确认三类应用问题：x64 生产容器装入 arm64 `sharp` 可选包、
tags sitemap 单项 Data Cache 超过 2 MiB，以及 Better Auth 拒绝
`https://aat.ee` Origin。移动 LCP 的关键链路还包括：五个字体 preload、完整
next-intl messages 下发、首屏同时 SSR 移动抽屉、analytics 过早下载，以及
项目详情页 viewer/below-fold 查询阻塞公开描述。

- 最终应用 commit：
  `45758f2cd62e619c45ebf162a291d8cc4f0dd925`
- CI：
  `30326006194`（TypeScript、Lint、Test、Build、dependency audit、
  standalone x64 `sharp` 校验、Semgrep 全部通过）
- 计划：
  `deploy_aat-ee-lcp-sharp-r14-20260728`
- 快照：
  `snap_aat-ee-lcp-sharp-r14-20260728_1785210312707185261`
- journal：
  `deploy-deploy_aat-ee-lcp-sharp-r14-20260728-20260728034632`
- 结果：仅替换 `aat-ee-app`，7/7 操作成功，0 失败；未运行迁移或写业务数据。

发布内容：

- Bun install 明确 `--os=linux --cpu=x64`，CI、Docker dependency stage 与
  standalone stage 均实际 import `sharp`；生产为 Node `v24.18.0` /
  `x64`、`sharp 0.35.3`、libvips `8.18.3`。
- tags 与 projects/users 一样按每片 250 个源行分片；生产 index 为
  projects 8 片、users 3 片、tags 6 片，日志不再出现 2 MiB cache 报错。
- trusted origins 同时包含 `https://www.aat.ee` 与 `https://aat.ee`。
- 仅预加载 sans 字体；analytics 外部下载延后 7 秒；next-intl 只向各客户端
  子树下发所需 namespace；移动抽屉首次点击才动态加载。
- 项目公开描述不再等待 owner/viewer 状态；translation 查询在 request 内共享；
  related/sidebar/creator 与 viewer 状态并行，并在各自 Suspense 边界中流式返回。

生产验收：容器 healthy，liveness/deep health 均 200，Postgres/Redis 为
`ok`；OG 返回 1200×630 PNG；未授权 deep/cron 为 401；部署后新容器日志中
`sharp`、cache oversize、invalid origin、error/fatal/exception 匹配均为 0。
以上错误统计来自首轮项目页与 API 验收；后续补充四语言首页遍历时发现
message scope 调整遗漏 route children 的 locale context，已由 r16 修复。
初始项目 HTML 不再包含移动抽屉，公网西语页面约 169 KiB（Cloudflare 注入后）。

Lighthouse 13.4.1 的公网移动模拟 LCP 仍有明显长尾：西语两次为
3.76s / 6.85s，英语为 6.24s；TBT 89–118ms，CLS 约为 0。trace 实际观测的
公网 LCP 为 6.06s / 3.17s / 2.69s。绕过 Cloudflare、直接命中同一生产源站
时，HTML 中 Rocket Loader 改写为 0，两次 trace 实际观测 LCP 为
1.98s / 2.90s（中位 2.44s）。因此代码侧瓶颈已显著收敛；Rocket Loader
随后已关闭，但 Search Console 的 4.4s 群组在 28 天窗口更新前不会立即变化。

部署前备份：
`backup-aat-ee-restic-20260728034049`；仓库检查：
`check-restic-idrive-e2-20260728034201`，均为 success。

### canonical sitemap redirect hotfix（r15）

r14 验收发现 legacy `projects.xml`、`users.xml`、`tags.xml` 虽返回 308，
但用 `request.url` 构造的 Location 暴露了内部
`https://0.0.0.0:8080/sitemap.xml`。r15 改为由
`NEXT_PUBLIC_URL` 的 canonical origin 构造，并增加回归测试：

- 最终应用 commit：
  `5704b6a60a178ed11bf7f169e04c6b58cad4af0e`
- CI：
  `30327108270`（全部关卡通过）
- 计划：
  `deploy_aat-ee-sitemap-redirect-r15-20260728`
- 快照：
  `snap_aat-ee-sitemap-redirect-r15-20260728_1785211763201191327`
- journal：
  `deploy-deploy_aat-ee-sitemap-redirect-r15-20260728-20260728040948`
- 结果：仅替换 `aat-ee-app`，7/7 操作成功，0 失败；三条 legacy URL 现均
  308 到 `https://www.aat.ee/sitemap.xml`。

r15 验收同时确认：非法 `projects-0.xml`、`tags-1001.xml` 为 404；Serena
页只有一个三项 `BreadcrumbList`；非 www Origin 的 session 请求为 200；
容器健康、deep health、`sharp` x64 和项目页错误日志检查全部通过。补充遍历
`/`、`/zh`、`/es`、`/et` 时发现它们均因缺少 `next-intl` locale context
返回 500，因此立即进入 r16 热修复；没有把 r15 误记为最终健康版本。

- r15 部署前备份：
  `backup-aat-ee-restic-20260728040045`；仓库检查：
  `check-restic-idrive-e2-20260728040600`。
- 最终部署后备份：
  `backup-aat-ee-restic-20260728041917`；仓库检查：
  `check-restic-idrive-e2-20260728042031`。
- 四条记录均为 success。

本地 standalone 早期烟测曾沿用生产环境变量，整点触发一次内置冗余 cron：
数据库结果为 0 个项目变更，但发出一封“14 个任务 stale”运维告警邮件。进程
随后停止，所有后续本地运行均强制 `EMBEDDED_CRON_DISABLED=true`，未再触发
调度或邮件。

### locale context hotfix（r16）

r14 为降低客户端消息体积，把 `NextIntlClientProvider` 收窄到 Nav、Footer
和各 route 自己需要的 namespace。项目详情页正常，但 route children 内的
`next-intl/navigation` Link 仍需要 locale context；四个首页因此在 r15
容器中返回 500。r16 在 route children 外恢复一个 `messages={{}}` 的最小
provider，继续保留 route-level 消息分片，不重新下发整份 messages：

- 最终应用 commit：
  `7db3e9abff0ff6c45f5f479948662d08c0fe306a`
- CI：
  `30328777000`（TypeScript、Lint、Test、Build、dependency audit、
  standalone x64 `sharp` 校验、Semgrep 全部通过）
- 计划：
  `deploy_aat-ee-intl-context-r16-20260728`
- 快照：
  `snap_aat-ee-intl-context-r16-20260728_1785213876969201865`
- journal：
  `deploy-deploy_aat-ee-intl-context-r16-20260728-20260728044557`
- 结果：仅替换 `aat-ee-app`，7/7 操作成功，0 失败、0 跳过；未运行迁移或
  写业务数据。

r16 生产回归：

- 源站与公网的 `/`、`/zh`、`/es`、`/et`、`/projects/ogtv`、
  `/es/projects/ogtv` 均为 200，且没有应用错误页。
- 新容器日志中 `next-request-error`、`use-intl`/locale context 和通用
  error 匹配均为 0。
- 容器 healthy；Node `v24.18.0` / x64、`sharp 0.35.3`、libvips `8.18.3`；
  deep health 为 200，Postgres/Redis 均为 `ok`。
- sitemap index 为 projects 8 片、users 3 片、tags 6 片；合法首片为 200，
  非法 `projects-0.xml`、`tags-1001.xml` 为 404；三条 legacy URL 均 308
  到 `https://www.aat.ee/sitemap.xml`。
- Ogtv OG 图为有效的 1200×630 PNG。

r16 发布后、关闭 Rocket Loader 前的单次 Lighthouse 13.4.1 西语移动复测：
公网模拟 LCP 4.42s、trace 实际观测 2.68s；直连源站模拟 LCP 3.83s、trace
实际观测 1.27s，TBT 分别 89ms / 69ms，CLS 均为 0。当时公网 HTML 有 1 个
Rocket Loader 脚本、1 个 `data-cf-settings` 和 82 个被改写的 Next 流式
脚本；源站三项均为 0。

Rocket Loader 关闭后的闭环复测：

- 英语与西语 Ogtv 公网页面的 `rocket-loader`、`data-cf-settings` 和改写
  script type 均为 0（关闭前为 1 / 1 / 82）。
- 三次标准移动测试的 trace 实际观测 LCP 为 0.97s / 1.78s / 3.63s，
  中位数 1.78s；标准模拟 LCP 仍受网络与节流模型影响，在 1.95–8.29s 波动。
- 使用 `throttling-method=provided` 的同条件对照中，公网 LCP 为 1.99s、
  直连源站为 1.41s；TTFB 分别 168ms / 150ms，TBT 均为 0。
- Search Console 群组指标仍需等待最近 28 天的 CrUX 窗口更新；不能用一次
  Lighthouse 结果替代群组第 75 百分位 field data。

- r16 部署前备份：
  `backup-aat-ee-restic-20260728043558`，状态 success。
- r16 部署后备份：
  `backup-aat-ee-restic-20260728045256`；仓库检查：
  `check-restic-idrive-e2-20260728045515`，均为 success。
- 最终 `opsctl` 状态：doctor errors/warnings 均为 0；deploy gates、backup
  readiness/history、snapshot coverage 均为 ready。

### alternatives 临时失败重试修复（r17）

2026-07-28 的近两天日志复核发现 `generate-alternatives` 在 DeepSeek 返回空内容
时记录了 `prescreenAlternatives failed: No content generated from DeepSeek API`，
但调用方把该异常吞掉并按“明确没有替代项目”处理：Hero Widget
（`09d87bce-579b-4b5a-935f-2972514a6059` / `hero-widget`）被写入 30 天冷却
时间，同时 cron 仍返回 200。r17 将“明确的空数组”与临时提供商、抓取、解析
或数据库失败分开处理：

- 只有结构正确的显式空数组进入 30 天确定性冷却；
- 临时失败写入可在 1 小时后重新入选的兼容时间戳，不增加数据库字段；
- 当本轮没有任何成功生成且出现错误时，cron 返回 500，使现有调度告警可见；
- 候选分析不足也进入短重试与错误计数，不再静默休眠 30 天。

发布证据：

- 最终应用 commit：
  `ea606e9cf65099272615b14ea595cd5daed14bc8`
- CI：
  `30340560869`（TypeScript、Lint、238 tests、Build、standalone x64
  `sharp`、dependency audit、Semgrep 全部通过）
- 应用计划：
  `deploy_aat-ee-alternative-retry-r17-20260728`
- 应用快照：
  `snap_aat-ee-alternative-retry-r17-20260728_1785226485727744734`
- 应用 journal：
  `deploy-deploy_aat-ee-alternative-retry-r17-20260728-20260728081509`
- 结果：7 项操作全部成功，仅替换 `aat-ee-app`；未运行迁移。

为让已被错误置入 30 天冷却的唯一记录立即恢复，另行执行了受控的一次性计划。
该计划在独立数据库快照后取得
`destructive_operation_requires_approval` 风险审批和发布执行审批；SQL 同时
匹配项目 ID、slug 与原时间戳 `2026-07-28 05:35:32.201`，只将
`alternatives_attempted_at` 设为 NULL，且非恰好更新一行就回滚：

- 一次性计划：
  `deploy_aat-ee-alternative-retry-reset-r17-20260728`
- 数据快照：
  `snap_aat-ee-alternative-retry-reset-r17-20260728_1785226676330130550`
- journal：
  `deploy-deploy_aat-ee-alternative-retry-reset-r17-20260728-20260728082132`
- 结果：任务容器退出码 0，日志精确报告 `updated: 1`；随后数据库查询确认
  唯一目标行的 `alternatives_attempted_at` 为 NULL。

r17 生产回归确认：容器 healthy，部署标记为
`20260728-alternative-retry-r17`；`/`、四语言入口、英语/西语 Ogtv 和
`/sitemap.xml` 在源站与使用浏览器 UA 的 Cloudflare 公网检查中均为 200；
deep health 为 200，Postgres/Redis 均为 `ok`；Node `v24.18.0` / x64、
`sharp 0.35.3`、libvips `8.18.3`；新容器错误日志匹配为 0。最终
`opsctl doctor` 为 0 errors / 0 warnings，deploy gates 为 ready。

- 发布前备份：
  `backup-aat-ee-restic-20260728081143`，状态 success。
- 发布后备份：
  `backup-aat-ee-restic-20260728082210`，状态 success。
- 独立仓库检查：
  `check-restic-idrive-e2-20260728082442`，状态 success。

本次没有为验收人工调用 `generate-alternatives`，避免额外制造生产内容写入。
其正式表达式为 `5,35 0,4,5,10-23 * * *`；重置发生在 08:21 UTC，08:35
不属于允许小时，所以下一次自然执行为 10:05 UTC。08:30–08:38 期间调度器
持续运行，产生的 13 条其他任务记录全部为 200；目标行在发布验收结束时仍为
NULL，等待自然调度领取。
