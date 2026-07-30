# Phase 1 Cron 持久化调度开发记录

日期：2026-07-29
状态：Development complete / production shadow active / canary and cutover blocked
前置基线：[development-phase0-baseline.md](./development-phase0-baseline.md)

本文记录 Phase 1 的代码、迁移、审查和验证结果。迁移 0058 已于 2026-07-30
部署，生产随后在 13:05 UTC 单独开启 `shadow`；legacy 仍是唯一执行方，
shadow job 全部为不可领取的终态 `cancelled`。Canary 和 ledger cutover
仍未获批准，详见
[Phase 10 部署记录](./deployments/2026-07-30-phase10-cron-shadow.md)。

## 1. 已实现内容

### 1.1 数据模型

`0058_cron_job_ledger.sql` 增加：

- `cron_schedule` 的 nullable policy 字段：
  - `misfire_policy`
  - `max_catch_up_minutes`
  - `retry_policy`
  - `max_attempts`
  - `concurrency_group`
  - `idempotency_class`
  - `requires_scheduled_for`
- `cron_job`：
  - `UNIQUE(task_path, scheduled_for)`；
  - `pending`、`running`、`retry_wait`、`succeeded`、`dead_lettered`、
    `uncertain`、`cancelled` 状态约束；
  - execution mode、attempt、available time、lease owner/token/expiry；
  - 实际开始/完成时间、状态码、耗时和 2,000 字符错误上限；
  - Cron expression、policy、concurrency group 和 schedule version 快照；
  - claim、group、lease 和 retention indexes。
- `cron_materialization_cursor`：
  - 单一 `main` cursor；
  - minute-aligned `timestamptz`；
  - cursor 与 job inserts 在同一事务提交。

Phase 0 的 22 项 proposal 会回填到 nullable policy 字段，供 shadow 比较。
回填不代表批准；ledger 还会检查代码中的 22 项 decision，当前全部为
`proposed`，因此 fail-closed。

所有新时间字段使用 `timestamptz`。`task_path` 是不可变快照，不对可编辑
schedule path 建外键。

### 1.2 Materializer

materializer：

- 锁定 `main` cursor 后读取 schedule；
- 首次启用只扫描当前分钟，不回放数据库全部历史；
- 每次有全局 scan cap，默认 1,440 分钟，允许范围 1–10,080；
- 按任务应用 `skip`、`latest` 或未来可用的 `bounded-all`；
- 同时应用 task-specific max catch-up；
- 新 schedule expression 从下一个完整 UTC 分钟生效，不反向套用到旧窗口；
- 每个表达式只解析一次并有界枚举 fire times；
- job insert 失败时事务回滚，cursor 不前进；
- 唯一约束吸收 embedded/external 重复 materialization。

本地 22 项、1,440 分钟恢复规划耗时约 54ms，生成 20 个 latest/skip jobs。
该数值只用于发现算法级退化，不是生产 SLA。

### 1.3 Worker、claim 和恢复

ledger worker 当前仍在 Web dispatcher 内调用现有 Cron routes，这是 Phase 1
明确允许的过渡限制。已实现：

- `FOR UPDATE SKIP LOCKED` candidate claim；
- concurrency group advisory lock 和 running/uncertain blocker；
- 默认每 tick 最多并行 8 个不同 group，范围限制为 1–20；
- UUID lease token、owner 和 5 分钟 lease；
- 运行期间每分钟续租；
- renew/complete 都使用 `job id + lease token + running status` CAS；
- 旧 token 不能覆盖新 Worker；
- 只有 `strict` idempotency 的过期 lease 可以自动恢复；
- guarded、convergent、non-idempotent 的失联执行进入 `uncertain`；
- transport timeout/status 0 对非 strict 任务同样进入 `uncertain`，因为底层
  non-aborting request 可能已经完成副作用；
- transient-bounded 只重试 network/429/5xx，永久 4xx 和非 retry policy
  进入 dead letter；
- retry backoff 30 秒起、最多 15 分钟；
- route 收到稳定 `X-AAT-Cron-Job-Id` 和
  `X-AAT-Cron-Scheduled-For`；
- 兼容 `cron_run_log` 记录实际 attempt time；原始 schedule time 保留在
  `cron_job`。

worker 只接受：

- `/api/cron/<single-safe-segment>` allowlist path；
- 不含 query、fragment、`..` 或 absolute URL；
- credential-free HTTP loopback 或 single-label Compose service
  `INTERNAL_BASE_URL`。

### 1.4 四态迁移

`CRON_SCHEDULER_MODE`：

- `legacy`：默认值；现有 Redis lease + direct fan-out 保持权威。
- `shadow`：materialize 理论窗口，但 job 直接写为 `cancelled`，不能 claim；
  legacy 继续执行。shadow 错误会结构化记录并显示在 dispatcher response，
  不会中断当前生产任务。
- `canary`：仅一个代码内已批准、strict 幂等且独占 concurrency group 的任务由
  ledger 执行；其余任务继续 legacy。完整门禁见
  [development-phase7-cron-cutover.md](./development-phase7-cron-cutover.md)。
- `ledger`：materializer + worker 成为权威；22 项 policy 未全部批准时直接
  失败，不回退到 legacy。

shadow 和 ledger 共享 cursor。cutover 必须从下一个完整分钟开始，避免该分钟
的 shadow cancelled row 与 ledger unique window 冲突。

### 1.5 运维兼容

- Admin Cron 页面在非 legacy 模式显示 pending、running、retry、uncertain、
  dead-letter 和 oldest-pending。
- Dispatcher ledger response 同样包含 backlog summary。
- 90 天 cleanup 只删除 `succeeded` 和 `cancelled` ledger history。
- pending、running、retry、uncertain 和 dead-letter 不会被普通 cleanup 删除。
- Monthly blog recap 现在验证并使用原始 scheduled-for minute；没有 header 的
  legacy 请求保持当前行为。
- CI 检查 Phase 0 policy、migration 0058 backfill、routes 和最终 Cron
  expressions 一致。

## 2. Review 中发现并修复

按安全、并发正确性、恢复语义、性能和维护性顺序审查后修复：

1. SQL comment 和字符串内分号会误导 migration inventory：
   改为字符串感知 parser，并限定 `cron_schedule` INSERT。
2. `cron_run_log.dispatched_at` 初版使用 schedule time：
   改为实际 attempt time，避免 cron-health 在成功补跑后仍误判 stale。
3. 初版把所有 convergent job 视为 lease-expiry 可自动重试：
   改为只有 `strict` 自动恢复；其余进入 `uncertain`，避免重复 AI/crawl
   费用或不确定副作用。
4. catch-up 初版对 task × minute 重复解析 Cron：
   改为单次 parser 的有界 fire-time enumeration。
5. 单 job/tick 会导致高频任务 backlog：
   改为每 tick 最多 8 个不同 concurrency groups 并行，group 内仍严格串行。
6. Worker base URL/path 可能形成任意内部请求：
   增加 URL origin 与 task path 双 allowlist。
7. 过期 lease 的旧 Worker 可能覆盖恢复后的状态：
   renew/complete 全部增加 lease-token CAS。
8. shadow 历史若保持 pending，会在 cutover 后被误执行：
   shadow job 使用终态 `cancelled`，worker 只 claim `execution_mode=ledger`。
9. 偶数 performance runs 的 median 算法、CLI 未知参数和 URL credentials：
   已在 Phase 0 工具中一并 fail-closed 修复。
10. non-aborting HTTP timeout 不能证明副作用未发生：
    非 strict job 的 transport/status 0 直接进入 `uncertain`，不自动重放。

当前 review 未保留 Critical/High 代码问题。生产运维门禁仍未满足，见下一节。

## 3. 验证结果

已完成：

- TypeScript `--noEmit`；
- 全仓 ESLint；
- 全仓 Vitest：53 个 test files 通过、1 个跳过，269 项 tests 通过、6 项跳过；
- policy/migration/route consistency checker；
- 使用本地无效数据库 guard URL 的生产构建；
- 临时 PostgreSQL 16 migration test：
  - 22 项 policy backfill；
  - task-window duplicate absorption；
  - running-without-lease constraint；
  - cursor minute-alignment constraint。
- 临时容器验证后已停止并由 `--rm` 删除。

数据库脚本只接受 loopback 且数据库名以 `open_launch_cron_test` 开头，拒绝
远程或名称不符的目标：

```bash
CRON_LEDGER_TEST_DATABASE_URL=postgresql://.../open_launch_cron_test \
  bun run test:cron-ledger-db
```

本轮没有连接或修改 `.env.local` 指向的远程数据库。

## 4. 生产推进状态

原始开发完成时的门禁已经逐项复核。当前状态为：

1. `/api/cron/syndicate-launches` 已获首个 Canary 批准，其余 21 项 policy
   仍为 `proposed`；`--require-approved` 按设计失败。
2. 生产 SSH、canonical registry、opsctl、backup、snapshot 和数据库 schedule
   rows 已核对。
3. 0058 已部署，生产 `cron_schedule` 的 22 项 backfill/enabled rows 已核对。
4. Shadow 已于 2026-07-30 13:05 UTC 开启；至少 48 小时连续观察尚未完成。
5. Node 24 不可变 worker artifact 已随同一镜像部署，但生产没有启动独立
   worker，embedded worker 也保持关闭。
6. 每日通知、发布、Product Hunt、engagement 和 AI 任务尚未获 canary 分组
   批准。
7. `uncertain` 的人工 reconcile UI/审批流程未定义；canary 前至少要有
   operator runbook，不能直接改行重试。

因此当前允许的后续顺序是：

1. 连续观察 shadow 至少 48 小时；
2. 重新运行只读 canary preflight；
3. 处置并复核候选任务的终态业务失败；
4. 再规划 ledger canary，不能直接进入 full ledger。

## 5. 回滚

- 运行行为回滚：`CRON_SCHEDULER_MODE=legacy`，停止 ledger worker。
- 数据回滚：不删除 `cron_job`、cursor 或审计历史。
- shadow 回滚不会产生待执行 job，因为 shadow rows 已是 `cancelled`。
- 恢复 embedded trigger 前仍需检查 external trigger 和 Redis minute lease，
  避免额外执行源。
