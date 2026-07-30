# Open Launch 优化开发方案（已审查）

日期：2026-07-29
状态：Proposed / reviewed
适用仓库：`Open-Launch`
范围：开发与发布方案；本文不授权生产部署、数据库写入、密钥轮换或基础设施删除。

## 1. 结论

项目不需要重写。优化应沿以下顺序逐步交付：

1. Cron 持久化调度与可补跑能力。
2. CI 构建不可变制品，生产机只校验和部署。
3. 结构化日志与真实用户 Web Vitals。
4. 首页 Session、搜索组件和聚合查询优化。
5. standalone、迁移、浏览器与性能发布门禁。
6. 静态资源、前端包体和大型模块治理。

每一阶段都必须是独立 PR、独立发布、独立回滚。不能把 Cron、部署系统、首页
查询和大型重构放进同一个版本。

执行依赖不是简单串行：先完成 Phase 1 的数据模型和 shadow，再完成 Phase 2
的不可变发布能力，之后才允许执行 Phase 1 的权威 Worker canary/cutover。这样
既保持 Cron 可靠性优先开发，也避免用旧的高风险制品流程切换新调度器。

## 2. 已确认基线

- 当前生产制品：`93f7349`（r19）。
- 当前主分支：`6cc28e4`；该 follow-up 尚不能视为已部署。
- Cron 当前由进程内触发器和 cron-job.org 双路触发，Redis 分钟租约去重。
- 当前调度没有持久化的 `scheduled_for` 记录，错过分钟窗口后不能补跑。
- 生产主机约 3.4 GiB RAM；在生产机执行 Next.js 构建曾造成资源饱和和请求超时。
- CI 已包含 TypeScript、Lint、Vitest、Next build、Sharp x64 校验、依赖审计和
  Semgrep。
- CI 尚未启动真实 standalone 服务做 HTTP 冒烟，也没有迁移全链测试、
  Playwright 和性能预算。
- 首页列表查询同时关联 upvote 与 comments，存在聚合中间结果膨胀风险。
- 全局 Nav 和首页分别读取 Session；全局搜索对话框随每个页面加载。
- `public/` 约 95 MiB、20,453 个文件；头像目录约 20,377 个文件。
- 本地现有构建产物中存在约 2.58 MiB 的大 chunk，但必须先用 bundle analyzer
  确认真实路由归属和下载路径。

权威运行与部署约束继续以
[production-deployment-runbook.md](./production-deployment-runbook.md) 和
[production-runtime.md](./production-runtime.md) 为准。

## 3. 总体完成标准

方案全部完成后应满足：

- 调度器停顿后，允许补跑的任务能够按策略恢复，且不会无限制造历史任务。
- 同一任务窗口在数据库层最多存在一个 job；重试和多 Worker 不造成重复认领。
- 对具有外部副作用的任务，不宣称分布式“绝对 exactly-once”；必须使用稳定
  idempotency key，或在执行结果不确定时停止自动重试并进入人工核对。
- 生产部署使用精确 commit 对应的不可变镜像 digest，生产机不再构建应用。
- 所有 `opsctl` 调用固定使用 canonical registry/state-dir，保留人工审批门禁。
- 能按 route、locale、device 分析移动端 LCP 的 TTFB、load delay 和 render
  delay，且不采集敏感查询参数或用户身份。
- 首页每个请求最多进行一次 Session 校验，首页项目点赞状态合并查询。
- 首页聚合 SQL 不再生成 upvote × comments 的乘法中间结果。
- 真实 standalone 镜像、完整迁移链和关键浏览器路径成为 CI 门禁。

## 4. 阶段计划

### Phase 0：基线和决策门禁

预计开发量：1–2 个工程日。

交付：

1. 记录当前 Cron 每项任务的：
   - 是否幂等；
   - 允许的补跑策略；
   - 最大补跑窗口；
   - 重试类别；
   - 外部服务及并发组；
   - 是否具有业务副作用。
2. 保存首页 SQL 执行计划、请求查询次数、路由 JS 和三次移动端实验室数据。
3. 查询现有镜像仓库和 `opsctl` 实际支持能力，不预设 GHCR、Docker Hub 或新
   的发布接口。
4. 决定异常追踪是否使用第三方服务；没有隐私、保留期和费用确认时，仅实施
   本地结构化日志及现有 Matomo RUM。

需要人工确认：

- 当前迁移定义的 22 项调度任务之 missed-run 策略，特别是通知、更新、发布、
  AI 生成和清理任务；生产实施前以数据库实际 enabled/disabled 行重新核对。
- 允许使用的镜像仓库。
- 观测数据的保留期和第三方处理边界。

验收：

- 决策矩阵完整，不存在“默认全部补跑”或“默认全部跳过”。
- 所有后续性能指标都有可复现基线。

回滚：本阶段只增加文档和测试工具，不改变运行行为。

### Phase 1：Cron 持久化调度

预计开发量：6–10 个工程日，另需至少 48 小时 shadow 观察。

#### 1.1 数据模型

使用下一可用迁移编号（当前仓库下一编号为 0058，实施时重新确认）增加
`cron_job` 账本。建议字段：

- `id`
- `task_path`
- `scheduled_for`
- `status`
- `attempt_count`
- `available_at`
- `lease_owner`
- `lease_token`
- `lease_expires_at`
- `started_at`
- `finished_at`
- `status_code`
- `duration_ms`
- `last_error`
- `created_at`
- `updated_at`

约束与索引：

- `UNIQUE(task_path, scheduled_for)`。
- 待领取索引覆盖 `status, available_at`。
- 过期 lease 索引覆盖 `lease_expires_at`。
- 保留 `cron_run_log`，第一版不删除表、不改管理后台既有读取。

建议状态集合为 `pending`、`running`、`retry_wait`、`succeeded`、
`dead_lettered`、`uncertain` 和 `cancelled`，并用数据库 `CHECK` 限制。
`uncertain` 表示 Worker 失联后无法证明外部副作用是否已经发生，必须等待人工
对账或任务专用幂等机制处理。

`cron_schedule` 同步增加 `misfire_policy`、`max_catch_up_minutes`、
`concurrency_group` 和 `max_attempts`。迁移初期允许这些列为空，按 Phase 0
批准的矩阵回填；任一 enabled schedule 缺少策略时，`ledger` 模式必须
fail-closed，不能猜测默认行为。

同时增加数据库 materialization cursor，在同一事务中完成“生成 job + 推进
已扫描分钟水位”。不能只把水位保存在进程内，也不能先推进水位再写 job。每个
job 保存 cron expression、策略和 schedule version/updated-at 快照；后台修改
schedule 从下一个完整分钟生效，不追溯修改已经生成的 job。
并发 Materializer 必须先锁定同一个 cursor 行，再扫描和推进，不能各自读取旧
水位后独立前进。

`last_error` 必须脱敏并限制长度，防止凭据泄露和异常响应造成行膨胀。增加终态
数据保留策略：成功/取消记录按既有 Cron 日志周期清理；`pending`、`running`、
`retry_wait` 和未处理的 `uncertain`/`dead_lettered` 不得被普通清理任务删除。

`task_path` 保存调度时快照，不强制绑定可变的 schedule path 外键；是否同时
保存 `schedule_id` 由迁移 review 决定。所有时间使用 `timestamptz`，避免
服务器时区影响；Drizzle schema 必须显式使用 `withTimezone: true`。

#### 1.2 Materializer 与 Worker

- 继续复用 `/api/cron/dispatch`、现有鉴权、cron 表达式解析和外部触发器。
- Materializer 从上次水位生成允许的待执行窗口，写入 `cron_job`；唯一约束
  吸收重复触发。
- 高频任务默认不能生成无限历史 backlog。具体采用 `latest`、`bounded-all`
  或 `skip`，必须来自 Phase 0 的任务矩阵。
- Materializer 每次扫描还有全局最大追赶范围，防止 cursor 损坏或首次启用时
  回放全部历史。
- Worker 使用数据库原子 claim 或 `FOR UPDATE SKIP LOCKED`，生成新的
  `lease_token` 并设置有期限的 lease；续租和完成均使用
  `id + lease_token` compare-and-set，过期 Worker 不能覆盖新 Worker 的状态。
- Worker 在任务运行期间续租。lease 过期后，只有已证明幂等的任务可以自动
  恢复；其他任务进入 `uncertain`，不能直接再次执行。
- 第一版 Worker 调用现有受鉴权的内部 Cron route，避免同时重写全部业务
  handler。
- Worker 只允许调用当前 `cron_schedule` 中、以 `/api/cron/` 开头且不包含
  query、fragment、`..` 或绝对 URL 的 path；内部 base URL 固定为 loopback/
  Compose 服务地址。
- Worker 为 route 提供稳定 job identity。涉及邮件、发布或其他外部
  副作用的 handler 必须在 canary 前将该 identity 落到现有 outbox/业务唯一键，
  或明确归类为 `uncertain` 后人工对账。
- 为 AI、邮件、爬取和数据库维护任务设置独立并发组；不得继续将所有 due task
  无限制 `Promise.all` 扇出。
- 仅对任务矩阵明确允许的错误重试；通常网络失败、429 和 5xx 可重试，其他
  4xx 进入人工检查，最终以各 route 的既有返回约定为准。
- Worker 完成后继续写入兼容的 `cron_run_log`，使现有后台和 cron-health 在
  迁移期保持可用。

Worker 最终作为无公网端口、带 CPU/内存限制的独立服务运行。它使用与 Web
相同 digest 的不可变镜像、Node 24 entrypoint 和只读文件系统，但使用不同
command。entrypoint 的构建方式先做本地 packaging spike，不能假定生产 runner
已经包含 Bun 或 TypeScript 运行器。
独立 Worker 会增加数据库连接来源，因此 canary 前必须计算 Web、Worker、备份
和运维连接的总预算；Worker 使用显式小连接池和连接/语句超时，具体数值以实际
PostgreSQL 配置和负载测试为准。

现有 `CRON_HEARTBEAT_URL` 只代表 external trigger/materializer 活着，不能被
解释成 Worker 健康。Worker 需要独立 dead-man 信号或等价外部监控；queue depth
和 oldest-pending-age 负责发现“materializer 正常、Worker 已死”的情况。

第一版限制：业务任务仍在 Web 应用 route 中执行，因此实现了持久化、补跑和
背压，但尚未实现 CPU/内存层面的完全隔离。后续可逐项把纯业务 handler 提取为
可由独立 Node Worker 直接调用的服务函数。

#### 1.3 灰度切换

建议引入一个明确的调度模式开关（名称在实现 PR 中确认），支持：

- `legacy`：保持现有直接扇出。
- `shadow`：生成账本但不由新 Worker 执行业务。
- `ledger`：账本和 Worker 为权威执行路径。

切换顺序：

1. 迁移上线，运行模式保持 `legacy`。
2. 开启 `shadow`，对比理论 due 窗口、旧 run log 和新 job，至少 48 小时。
3. Phase 2 的不可变镜像、runner smoke 和 canonical `opsctl` 入口验收通过。
4. 开启 Worker 小并发，但只选择一项低风险、幂等任务作为 canary。
5. 分组切换高频 AI 任务、日常维护任务、通知/更新任务。
6. 全部稳定后使用现有 `EMBEDDED_CRON_DISABLED=true` 停止进程内触发器；
   cron-job.org 和外部 heartbeat 保留。
7. 连续稳定至少 7 天后，才允许讨论删除 legacy 路径；本阶段不删除。

测试：

- 同一分钟重复 materialize 只生成一个 job。
- job 插入失败时 materialization cursor 不前进；重复恢复后不丢窗口。
- 两个 Worker 不能同时 claim 同一 job。
- 旧 lease token 不能续租或提交完成。
- lease 到期后，幂等任务可恢复，非幂等任务进入 `uncertain`。
- 宕机跨过多个窗口时严格遵守每项 misfire policy。
- 429、5xx、超时、永久 4xx、进程中止和数据库写失败。
- 非法/非 Cron path 被拒绝，不发生任意内部 URL 请求。
- 清理只删除超过保留期的允许终态，不删除待执行、运行中或待人工处理记录。
- 每日通知、更新任务的业务幂等 fixture。
- cron-health 在 shadow 和 ledger 两种模式下不产生重复告警。

验收：

- shadow 期间理论窗口和旧调度匹配率 100%，差异均有解释。
- 人工制造 10 分钟调度停顿后，允许补跑的任务恢复，禁止补跑的任务不执行。
- 并发 Worker 测试中没有重复 claim。
- fault injection 中，外部副作用任务要么由稳定 idempotency key 去重，要么进入
  `uncertain`，不能盲目重复执行。
- materializer 和 Worker 任一停止都能由不同信号发现。
- 7 天无未知 stale、无重复通知、无 backlog 无界增长。

回滚：

- 停止 Worker，将模式切回 `legacy`。
- 保留 `cron_job` 数据用于审计，不删除迁移。
- 恢复进程内触发前，确认外部触发和 Redis 租约状态，避免产生额外执行源。

### Phase 2：不可变制品与安全部署

预计开发量：4–7 个工程日。

交付：

1. CI 从精确 commit 构建 linux/amd64 镜像，一次构建后推送到 Phase 0 确认的
   现有 registry。
2. 镜像以 commit 和不可变 digest 标识；生成 checksum、SBOM 和构建
   provenance。
3. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` 改为 BuildKit secret mount，不通过
   普通 build arg、命令行参数或日志输出。
4. 在 CI 中启动最终 runner 镜像，等待 Docker health，再检查：
   - `/api/health`
   - 首页和至少一个 locale 页面
   - sitemap XML
   - 未授权 Cron route 返回 401
   - 静态资源可读取
5. 在 `/home/ivmm/tools/deploy-tools` 的规则和实际 CLI 能力核对后，为 `opsctl`
   提供唯一受支持入口，固定：
   - `--registry /srv/server-registry`
   - `--state-dir /var/lib/opsctl`
6. Deploy plan 只引用已验证的镜像 digest。备份、snapshot、dry-run、人工批准、
   journal、部署后验证和部署后备份继续保留。

明确禁止：

- 在生产主机运行 `next build`、`bun run build` 或等价全量构建。
- 绕过 `opsctl` 直接执行 `docker compose up`。
- 自动批准生产发布。
- 为修正文档记录而手工复制或合并历史 `.opsctl` 状态目录。

测试与验收：

- 同一 commit 重建结果的应用输入哈希一致；最终发布记录绑定镜像 digest。
- runner 镜像在无源码、无 dotenv 的条件下通过 HTTP 冒烟。
- production plan 中不存在源码构建步骤。
- `opsctl` journal、snapshot 和 backup 都出现在 canonical state 中。
- 用前一个 digest 完成一次非生产回滚演练。

回滚：重新部署上一个已验证 digest；数据库迁移按各迁移的独立回滚方案处理，
不得把镜像回滚误当成 schema 回滚。

备注：主分支 `6cc28e4` 的 r20 发布属于独立维护发布，不应与 Cron schema 或
部署流水线首次切换捆绑。

### Phase 3：结构化日志与真实用户性能

预计开发量：3–5 个工程日，另需 7–14 天采样。

交付：

1. 增加 server-only 结构化 logger，默认输出 JSON：
   - `timestamp`
   - `level`
   - `event`
   - `request_id` / `job_id`
   - `route`
   - `status`
   - `duration_ms`
   - `provider`
2. 建立统一脱敏：
   - 不记录 Cookie、Authorization、Stripe secret、API key 和环境变量值。
   - URL 去除敏感查询参数。
   - 用户 ID 如确需关联，使用短期不可逆散列，不记录邮箱。
3. 优先迁移 Cron dispatcher/worker、Stripe webhook、safe-fetch、邮件 outbox
   和数据库连接错误；不要求一次替换全仓库所有 console。
4. 复用现有 Matomo 队列上报 Web Vitals，记录 allowlist 中的 route family、
   locale、device class、metric name/value/rating，以及 LCP 的
   TTFB/load-delay/render-delay 分解；不发送完整 URL、slug、搜索词或用户身份。
   Matomo 尚未就绪时先进入有界内存队列，初始化后再 flush。
5. 增加 Cron 仪表：
   - materialization lag
   - queue depth
   - lease recovery
   - scheduled-to-start
   - task p50/p95
   - dead-letter count

测试与验收：

- 脱敏回归测试证明敏感 header、查询参数和 Error cause 不会泄露。
- 生产采样中能区分 `/projects/[slug]` 与 locale，但不能还原用户或私密参数。
- 连续 7 天能够回答 Ogtv 移动 LCP 是 TTFB、资源加载还是渲染阶段变慢。
- 预期降级（例如超大 OG logo 回退）使用 warning/metric，不进入 error 告警。

回滚：关闭 RUM 采样和外部 exporter；JSON 日志可退回兼容文本输出。不得通过
回滚删除已经收集的审计日志。

### Phase 4：首页与 LCP 优化

预计开发量：4–8 个工程日；拆成三个独立 PR。

#### PR 4.1：全局搜索按需加载

- 复用 `MobileNavLazy` 的动态加载模式。
- 初始 Nav 只保留轻量按钮与快捷键监听；打开时才加载 Command/Dialog、
  搜索 hook 和结果 UI。
- 保持键盘导航、认证用户入口和无障碍标题。

验收：交互测试通过，首页初始路由 JS 明确下降；下降值以 Phase 0 基线为准，
不预先猜测固定字节数。

#### PR 4.2：Session 与并行数据流

- 在 `lib/server-auth.ts` 增加请求级缓存的完整 Session getter。
- Nav、首页和 `getCurrentUserId()` 共享同一次 Session 校验。
- 独立 translations、Session 和数据 promise 尽早启动。
- 如果 Phase 3 证明 Session 是首字节关键路径，再将 Nav 的公开壳与登录相关
  控件拆成 Suspense 边界；fallback 必须保持尺寸稳定并避免错误显示登录状态。
- 保持匿名、登录用户和管理员导航行为不变。

验收：单个首页请求最多一次 `auth.api.getSession()`；认证边界测试和 locale
导航测试通过。

#### PR 4.3：首页聚合 SQL

- 将 upvote 和 comments 分别预聚合后再关联 project，消除 U×C 中间结果。
- 在首页聚合三个列表的 project ID，对当前用户执行一次 upvote 查询。
- 使用首页专用 assembler 合并用户点赞；保留现有列表 action 的兼容行为，且
  Session/用户点赞数据始终留在共享 `unstable_cache` 之外。
- 保持列表排序、数量、缓存 tag、revalidate、返回结构和空列表行为不变。
- 在 staging/数据库恢复副本执行 `EXPLAIN (ANALYZE, BUFFERS)`；生产只读
  验证需要单独授权并设置 statement timeout。
- 查询计划证明需要后，才增加索引。
- 在查询并发基线明确后，以显式 `pg.Pool` 配置连接上限和超时；具体数值依据
  PostgreSQL `max_connections`、容器内存和峰值并发计算，不能直接照搬默认值。

验收：

- fixture 覆盖 0、1 和大量 upvote/comments，计数与排序不变。
- SQL 计划不再出现两个一对多表的乘法聚合。
- 登录首页点赞状态只发生一次数据库查询。
- 服务器 p95、首页 HTML、客户端 hydration 和错误率无回归。
- 移动端实验室三次中位 LCP 达到内部预算；现场目标为 p75 LCP ≤2.5 秒，
  但最终结论必须等待现场数据窗口，不能用单次 Lighthouse 代替。

回滚：三个 PR 可分别回滚；数据库索引使用独立 migration，应用回滚前确认旧
查询仍与 schema 兼容。

### Phase 5：发布质量门禁

预计开发量：4–6 个工程日。

交付：

- Playwright 最小冒烟：
  - locale 路由和导航；
  - 匿名搜索；
  - 登录边界；
  - submit 表单客户端验证；
  - project 页面和评论懒加载；
  - sitemap/canonical/JSON-LD；
  - 支付成功页只使用测试 fixture，不产生真实 charge。
- PostgreSQL service container 从 `0000` 应用到最新迁移，并检查 schema drift。
- 最终 Docker runner HTTP 冒烟成为阻塞门禁。
- 增加 route JS、HTML 大小和移动 Lighthouse 预算。先观察两周，再将稳定阈值
  设为阻塞，避免用波动阈值误伤发布。

每个前述阶段仍必须随 PR 提供单元/集成测试；Phase 5 不是把测试推迟到最后，
而是补齐跨系统门禁。

回滚：单项不稳定预算可暂时降为 non-blocking，但安全测试、迁移测试和 runner
健康检查不得静默跳过。

### Phase 6：资产、包体和维护性

预计开发量：按小 PR 持续 1–2 周。

顺序：

1. 接入 bundle analyzer，建立 route 归属和预算。
2. 评估头像池：
   - 缩小池；
   - 发布到 R2/CDN；
   - 或保留本地池但从每次应用制品中解耦。
     该选择会影响头像稳定性和缓存，必须先做 ADR。
3. 将 10.5 MiB 中文 OG 字体改为 WOFF2 子集/按字符集拆分，或缓存预生成 OG。
4. 将 `submit-form.tsx` 按步骤拆分，Tiptap 只在进入富文本步骤时加载。
5. 在 characterization tests 保护下拆分 Stripe webhook；签名验证、幂等、订单
   匹配和孤儿支付行为不得改变。
6. 清理确认未使用的图标/动画依赖，不依赖传递依赖提供运行时包。

验收：

- 每项都有制品体积和路由 JS 的 before/after。
- 头像 URL 稳定、缓存命中和 fallback 经验证。
- Stripe 重复事件、乱序事件、孤儿支付和签名失败测试全部通过。

回滚：资产迁移先支持双读；代码拆分保持公开接口，避免与业务功能改动混合。

## 5. 推荐 PR 序列

1. `docs/bench: record cron policies and performance baseline`
2. `feat/cron: add durable job ledger and pure scheduling tests`
3. `feat/cron: shadow materialization and admin visibility`
4. `feat/cron: leased worker, retries and concurrency groups`（本地/CI，不切生产）
5. `ci/release: build and smoke immutable runner image`
6. `ops/deploy-tools: canonical opsctl wrapper`（独立仓库、独立 review）
7. `ops/cron: canary and ledger cutover documentation`
8. `observability: structured logging and redaction`
9. `perf: privacy-bounded Matomo Web Vitals`
10. `perf/nav: lazy-load global search`
11. `perf/auth: request-cached session`
12. `perf/home: pre-aggregate counts and batch user upvotes`
13. `test/release: migration, Playwright and performance gates`
14. 后续资产和大型模块 PR。

## 6. 发布与暂停条件

任一阶段出现以下情况必须暂停继续切换：

- Cron 出现重复通知、重复发布、其他重复外部副作用或未知 backlog 增长。
- 数据库迁移 dry-run 与预期 schema/行数不一致。
- 新镜像不能证明 exact commit、digest 或 x64 Sharp 运行时。
- `opsctl` canonical state、backup、snapshot 或 deploy gate 不是 ready。
- RUM/log 数据包含敏感查询参数、邮箱、凭据或可还原身份信息。
- 首页计数、排序、locale、认证边界或 sitemap 出现回归。
- p95 延迟、错误率或数据库连接等待明显恶化。

生产切换、密钥轮换、数据库写入、旧容器/资源删除均需要独立批准。

## 7. 方案 Review

Review 顺序：安全 → 性能 → 正确性 → 维护性 → 测试。

结论：**有条件通过**。没有必须推翻方案的 Critical 问题；以下高风险项已在
正文中修正。

### High：Cron 补跑可能制造重复或洪峰

原始方向如果把所有漏掉的分钟全部补跑，会让高频 AI 任务在恢复时集中爆发，
并可能重复发送通知。

修订：

- 增加逐任务 misfire/idempotency 矩阵。
- 使用 `latest`、`bounded-all`、`skip` 三类策略，而非统一补跑。
- 增加数据库唯一键、lease、并发组、shadow 和单任务 canary。
- legacy 路径至少保留 7 天，不在首次切换中删除。

### High：lease 过期不等于业务副作用没有发生

Worker 可能已完成外部请求，却在写回状态前失联；简单地让另一个 Worker 在
lease 过期后重跑，会重复通知、发布或其他副作用。

修订：

- claim、续租和完成使用 lease token compare-and-set。
- 执行期间续租。
- 只有证明幂等的任务能自动恢复。
- 非幂等任务在结果未知时进入 `uncertain`，等待人工对账。
- job identity 必须进入外部 provider idempotency key 或业务唯一约束。

### High：一个 heartbeat 会掩盖 Worker 死亡

Materializer 仍能成功响应时，现有 dispatcher heartbeat 会继续绿色，即使
Worker 已停止消费。

修订：

- 保留现有 heartbeat 表示 external trigger/materializer。
- 为 Worker 增加独立 dead-man 信号或等价外部监控。
- queue depth 和 oldest-pending-age 成为阻塞性告警指标。

### High：新调度器不应先于制品流水线权威切换

Cron 代码可以先开发并进入 shadow，但 Worker canary 会同时改变数据库、Compose
和运行方式。

修订：

- Phase 1 shadow 后先完成 Phase 2。
- immutable runner、回滚演练和 canonical `opsctl` 入口通过后，才开始 canary。

### High：部署自动化可能绕过现有审批模型

直接从 CI 自动更新生产会破坏已有 `opsctl` backup/snapshot/approval/journal
边界。

修订：

- CI 只生产并验证不可变制品。
- 生产切换继续要求 typed plan 和人工批准。
- wrapper 固定 registry/state-dir，但不自动批准。

### High：构建密钥可能再次出现在参数或诊断输出

修订：

- 使用 BuildKit secret mount。
- 禁止将 secret 放入普通 build arg、制品元数据和命令行。
- 密钥轮换单独审批，不夹带进架构发布。

### High：测试若集中到最后，前期 Cron/部署变更风险过高

修订：

- 每个 Cron PR 都必须先交付纯逻辑、并发、lease、misfire 和错误路径测试。
- Phase 5 只负责跨系统 E2E 和发布门禁，不替代前面阶段测试。

### Medium：数据库中的任务 path 会成为内部请求目标

虽然当前后台只能修改 cron expression，Worker 仍不能假定数据库内容永远可信。

修订：

- path 必须来自当前 schedule，并通过 `/api/cron/` allowlist、无 query/fragment/
  traversal 的校验。
- base URL 固定为内部地址，不能由 job payload 覆盖。

### Medium：第一版 Worker 仍调用 Web route，隔离程度有限

这是有意的渐进式取舍。它先解决丢窗口、无补跑、无背压和不可审计问题，同时
避免一次重写全部 Cron handler。资源隔离作为后续演进：先把共享业务逻辑提取
成 server-only service，再让独立 Node Worker 直接执行。

### Medium：任务账本会增加数据库连接和历史数据

修订：

- Worker canary 前计算总连接预算，使用显式小连接池和超时。
- 错误文本脱敏、截断。
- 只清理超过保留期的允许终态；未处理的 uncertain/dead-letter 不自动消失。

### Medium：观测平台选择可能扩大隐私和费用范围

修订：

- 第一版复用 Matomo，并对 route 模板化、采样和脱敏。
- Sentry/OpenTelemetry exporter 需要单独确认数据处理、保留期和预算。

### Medium：性能阈值不能在没有基线时拍定

修订：

- Phase 0 先建立 bundle、SQL、查询次数和移动端基线。
- CI 预算先 non-blocking 观察两周，再固化阻塞阈值。
- Search Console 现场 LCP 与单次实验室结果分别判断。

### Review 后的剩余外部依赖

- 生产 registry 和 `opsctl` 实际能力需要从部署工具及服务器查询。
- Cron missed-run 策略需要业务确认。
- 第三方错误追踪需要隐私和费用确认。
- 生产迁移、canary、环境变量切换及密钥轮换都需要单独授权。

以上依赖不会阻止本地开发 Phase 0、Cron 纯逻辑、CI smoke、结构化日志和首页
测试，但会阻止对应的生产切换。
