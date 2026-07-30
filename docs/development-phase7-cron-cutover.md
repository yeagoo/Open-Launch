# Phase 7 Cron canary 与切换门禁

日期：2026-07-30
状态：Development complete / production shadow active / canary and cutover blocked
前置阶段：[development-phase1-cron-ledger.md](./development-phase1-cron-ledger.md)、
[development-phase2-immutable-runner.md](./development-phase2-immutable-runner.md)

本文记录单任务 canary、只读 preflight、对账和回滚契约。0058 已部署，生产
`shadow` 已于 2026-07-30 13:05 UTC 开启，详见
[Phase 10 部署记录](./deployments/2026-07-30-phase10-cron-shadow.md)。
`/api/cron/syndicate-launches` 已在
[Phase 11A](./development-phase11-cron-canary-readiness.md) 获得首个 Canary
代码批准；本文仍不授权实际 Canary、Worker 启停或 ledger 切换。

## 1. 权威模式

| 模式   | Ledger 写入              | Ledger 执行 | 其余任务权威 |
| ------ | ------------------------ | ----------- | ------------ |
| legacy | 无                       | 无          | legacy       |
| shadow | 全任务理论窗口，终态取消 | 永不 claim  | legacy       |
| canary | 仅一个显式批准的任务     | 仅该任务    | legacy       |
| ledger | 全部已批准任务           | 全部任务    | ledger       |

`CRON_SCHEDULER_MODE=canary` 必须同时设置
`CRON_LEDGER_CANARY_TASK_PATH`。被选任务必须：

- 存在于代码 policy inventory；
- 在代码 review 中将 `decision` 显式改为 `approved`；
- 具备 strict end-to-end idempotency；
- 独占自己的 concurrency group，避免 ledger 与仍由 legacy 执行的同组任务并发。

环境变量只能选择已批准策略，不能替代批准。当前只有
`/api/cron/syndicate-launches` 获批且同时满足 strict 和独占并发组；其余 21 项
仍为 `proposed`，因此 full ledger 按设计 fail closed。实际 Canary 还必须通过
48 小时 Shadow、业务队列和生产变更门禁。

## 2. 实现边界

- Dispatcher 在同一个 Redis minute lease 内解析一次 authority。
- canary task 只进入 ledger materializer/worker，不再进入 legacy fan-out。
- materialize、claim 和 expired-lease recovery 使用同一条单任务 allowlist。
- 数据库 materializer 会再次验证 code approval、strict idempotency 和独占组，
  并核对候选数据库行的完整 policy；调用方不能仅传入路径绕过门禁。
- full ledger 同样只 claim 已批准 code inventory 中的路径；materializer 会拒绝
  缺失、额外或 safety-policy 漂移的数据库 schedule。
- Worker 必须与 Web 使用相同的 `canary`/`ledger` 模式和 canary path。
- Worker `/health` 返回当前 scheduler mode 与 canary path，便于核对实际权威。
- Admin Cron 页面显示当前模式、canary authority 与 backlog，但不提供自动批准
  或自动切换按钮。
- shadow/canary/ledger 共用一个 materialization cursor；模式切换只能从工具报告
  的下一个完整 UTC 分钟开始。

canary 期间未选任务继续由 legacy 执行。cursor 会继续前进，因此未来切入 full
ledger 时只从切换后的窗口开始，不补跑 canary 期间其他任务的历史窗口。

## 3. 只读 preflight

命令使用数据库连接环境中已有的 `DATABASE_URL`，在 PostgreSQL
`READ ONLY` transaction、UTC timezone 和 10 秒 statement timeout 内运行：

```bash
bun run cron:cutover:check --target shadow
bun run cron:cutover:check \
  --target canary \
  --canary-task /api/cron/<reviewed-task>
bun run cron:cutover:check \
  --target ledger \
  --canary-task /api/cron/<reviewed-task>
```

`--at <canonical-ISO-timestamp>` 仅用于可重复的演练和测试。命令输出 JSON；
`ready=false` 时退出码为 1。它不会写数据库、修改 policy 或切换环境变量。

门禁含义：

- `shadow`：0058 schema 可查询，22 项数据库 schedule 与 code policy 无漂移，
  且没有遗留 active/attention ledger job。
- `canary`：候选 policy 已批准并满足 strict + 独占组；cursor 新鲜；至少连续
  48 小时 shadow；理论窗口与 legacy minute/path 完全对齐；没有活动 ledger
  job；候选任务没有终态业务失败、陈旧 claim、缺失 durable queue 或接收端配置
  问题。
- `ledger`：全部 policy 已批准；cursor 新鲜；候选 canary 已连续观察至少
  48 小时；最近 48 小时每个理论窗口恰有一个成功 ledger job；不存在失败、
  retry、uncertain、dead letter 或其他 active job。

输出中的 `nextFullMinute` 是最早允许切换的 UTC 分钟。preflight 结果只代表读取
时刻；切换前必须立即重跑，不能复用旧报告。

## 4. 生产执行顺序

当前第 1、2 步已完成；其余步骤仍需满足各自门禁和独立生产授权：

1. 部署 migration 0058，保持 `CRON_SCHEDULER_MODE=legacy`。
2. 执行 `--target shadow`，在报告的下一个完整 UTC 分钟切为 `shadow`。
3. 连续观察至少 48 小时；任何 missing/extra window 或 cursor stale 都先修复并
   重新累计观察期。
4. 由业务、运维和代码 review 共同批准一个满足条件的任务；把批准作为独立代码
   变更发布。
5. 立即执行 `--target canary`。通过后先使用 embedded worker：
   `CRON_SCHEDULER_MODE=canary`、
   `CRON_LEDGER_CANARY_TASK_PATH=/api/cron/<reviewed-task>`、
   `CRON_LEDGER_EMBEDDED_WORKER=true`。
6. 从报告的下一个完整 UTC 分钟切换；核对 dispatcher response、Admin backlog、
   worker/job 日志和业务侧唯一键。
7. 如需独立 Worker，先从同一验证镜像启动 Worker，确认其 `/health` 中 mode/path
   与 Web 完全一致且持续健康，再把 Web 的 embedded worker 设为 `false`。
8. 连续观察 canary 至少 48 小时。出现 retry、uncertain、dead letter、窗口缺失、
   业务重复副作用或 dead-man 告警时停止推进。
9. 只有全部 22 项 policy 分别获批后才执行 `--target ledger`。通过后在
   `nextFullMinute` 切换为 `ledger`，并删除
   `CRON_LEDGER_CANARY_TASK_PATH`；非 canary 模式保留该变量会 fail closed。

## 5. 中止与回滚

出现重复副作用、未知状态、持续 backlog、cursor stale、Worker 健康失败或对账
差异时：

1. 暂停新的 dispatcher 调用，停止独立 Worker，禁止产生新 claim。
2. 只读核对所有 `pending/running/retry_wait/uncertain/dead_lettered` job；等待已
   running handler 结束。不要手工把 uncertain 改回 pending。
3. 确认没有活动 ledger job 后，将 Web 改回 `CRON_SCHEDULER_MODE=legacy`，删除
   canary path，并保持 ledger 历史不删除。
4. 从下一个完整 UTC 分钟恢复 dispatcher，再核对 Redis minute lease、external
   trigger 与 cron health。

回滚不删除 `cron_job` 或 cursor。若无法暂停 dispatcher 或无法确认 running
副作用是否完成，应保持停机/只读状态并由人工协调，不能用 legacy 重跑来猜测恢复。

## 6. 本地验证

Phase 7 使用隔离的 loopback PostgreSQL 16 完成：

- migration 0058 policy backfill、唯一键和约束测试；
- canary allowlist materialize/claim/expired-lease recovery 集成测试；
- 完整 migration 后运行只读 shadow preflight；
- 未批准 canary 的 preflight 按预期以退出码 1 拒绝，并报告 policy、cursor 和
  shadow evidence blockers；
- TypeScript、全仓 ESLint、76 个 test files（337 passed、8 skipped）、生产
  build、Worker bundle 与 validation-only runner smoke。

本轮未连接生产数据库、未触发真实 Cron、未修改生产配置，也未批准任何 policy。
