# 2026-07-30 Phase 11A Cron Canary readiness 发布

Status: **准备版本生产部署完成；实际 Canary 未开启**

- 应用 commit：`3cf724fa8579a11677574ea03c84ebdd92d451ab`
- GitHub CI：
  [run 30549350085](https://github.com/yeagoo/Open-Launch/actions/runs/30549350085)
- 最终计划：`deploy_aat-ee-phase11a-canary-ready-r24-20260730`
- 最终快照：
  `snap_aat-ee-phase11a-canary-ready-r24-20260730_1785420539000879303`
- 最终 journal：
  `deploy-deploy_aat-ee-phase11a-canary-ready-r24-20260730-20260730141110`
- 部署前备份：`backup-aat-ee-restic-20260730140721`
- 部署后备份：`backup-aat-ee-restic-20260730141415`
- 部署时间：2026-07-30 14:11 UTC

## 发布范围

本次把 `/api/cron/syndicate-launches` 标记为唯一获批的首个 Canary 候选，并为
它增加业务级、只读、fail-closed 的 operational preflight。该检查覆盖终态交付、
过期 claim、缺少 durable row，以及四个接收端的 endpoint/key 配置。

本次只部署准备能力，没有改变生产执行权威：

- `CRON_SCHEDULER_MODE=shadow`
- `CRON_LEDGER_CANARY_TASK_PATH` 为空
- `CRON_LEDGER_EMBEDDED_WORKER=false`
- 不启动独立 Cron worker
- `PAYMENT_EMAIL_OUTBOX_ENABLED=false`
- legacy dispatcher 继续执行生产任务
- ledger 只进行 shadow materialization，`ledgerRanCount` 保持为 0

## 构建、Review 与门禁

1. 定向 Vitest 为 6 files、34 tests 通过；全仓 Vitest 为 81 files passed、
   2 skipped，365 tests passed、8 skipped。
2. TypeScript、全仓 ESLint、Prettier、route JavaScript budgets 和生产构建通过；
   Bun audit 为 0 vulnerabilities。
3. Cron policy checker 验证 22 项结构有效，只有
   `/api/cron/syndicate-launches` 为 `approved`。
4. GitHub CI 的 Bun checks、浏览器/数据库/性能发布门禁及最终不可变镜像 HTTP
   smoke 全部成功。
5. 发布镜像的 OCI archive SHA-256 为
   `f3096b393a35c6a929d6b382bd76f7884f1387f3e0c202e72549e613918a7462`；
   服务器端校验 manifest、平台、revision 和非 root 用户后才打精确 commit tag。
6. opsctl preflight 为 0 warning / 0 blocker；部署前备份成功。
7. 快照包含 database dump，7/7 scope 验证通过；最终 dry-run 只有 6 个
   non-destructive 操作。人工批准后由 opsctl 执行并写入 journal。

## 部署后验证

- opsctl 返回 `status=success`，6 项部署操作完成，registry 已更新。
- `aat-ee-app` 使用精确 commit 镜像，状态为 `running/healthy`、restart 0，
  用户为 `nextjs`，根文件系统只读。
- 0058 一次性迁移核验容器 `aat-ee-cron-ledger-migration-r24` 正常退出，
  exit code 为 0。
- `/api/health`、首页、英语/西语 Ogtv 项目页、sitemap 和 robots 均为 200；
  未授权 syndication Cron 和 dispatch 均为 401。
- 部署后 dispatcher tick 持续返回 200；日志确认 scheduler 为 `shadow`、
  Canary path 为空、`ledgerRanCount=0`、`failedCount=0`、materialization lag
  为 0。
- 部署后日志没有 `error`、`fatal`、`panic`、`unhandled` 或非零
  `failedCount`。
- 部署后的相同版本 preflight 读取到 147 个 Shadow 窗口，147 个匹配、
  missing 0；stale claim 0、missing durable item 0、配置问题 0。
- 部署后 Restic systemd unit 的结果为 success、退出码为 0；备份历史、
  doctor、snapshot coverage 和 deploy gates 最终均为 `ready`，doctor
  errors/warnings 为 0。

## Canary 仍被阻止

部署后的只读 preflight 正确返回 `ready=false`，没有修改任何订单、交付记录或
调度历史。当前三项 blocker 为：

1. 从 2026-07-30 13:05 UTC 开始的连续 Shadow 观察仍不足 48 小时；
2. Shadow 开启前的 5,214 个 legacy 窗口仍在 48 小时比较范围内，必须自然淘汰；
3. syndication durable queue 中仍有 1 条 mf8 终态失败记录，已耗尽 8 次尝试，
   关联订单仍为已验证付款状态，需要单独业务核对和可审计处置。

因此 Canary 最早不能在 2026-08-01 13:05 UTC 前开启。到达时间下限不是自动
批准；届时必须重新运行同一 commit 的 preflight，并要求 missing/extra、
业务指标、配置问题和 active/attention job 全部为 0。

## mf8 终态记录调查

2026-07-30 15:08 UTC 完成了不修改生产数据的跨站核对：

- 失败项属于 WallPreview Pro 订单；订单付款已验证，bigkr、hicyou 和 toolso
  均已成功，只有 mf8 在 2026-07-01 连续 8 次收到 `Internal error`。
- mf8 当前运行 revision
  `533837ad6a89816a595185567e36f9956ca94ab8`，已包含 2026-07-02 发布的
  receiver idempotency/unique-conflict 修复。
- 从 aat.ee 生产容器使用现有 endpoint/key 发送空 payload，receiver 正确返回
  400 `Invalid payload`，证明 HTTPS、认证和当前 validation path 可用；该请求
  在数据库写入前结束。
- mf8 数据库和公开页面确认已有一个 2026-07-06 创建的 WallPreview live
  listing：
  `https://www.mf8.biz/en/product/wallpreview-1782896531602`。
- 该 listing 来自 hicyou 同步，不属于 launch bot，没有 aat.ee order
  idempotency key；它是 dofollow，但仍启用了 backlink check。aat.ee 因此无法
  把它自动识别为付费交付结果。
- 当前 receiver 会按规范化 URL 找到该 listing，并因 key 不同返回 409。直接
  重置 attempts 只能继续失败，不会修复订单，也不应尝试创建重复页面。

推荐的业务处置是复用现有 live listing：先在 mf8 关闭该 listing 的 backlink
check，再在 aat.ee 以该公开 URL 对账 syndication 行、把 Pro 订单标记为
fulfilled，并向买家发送/补发交付通知。这个流程会修改两个生产数据库和财务订单
状态，必须在新的备份、精确条件保护和人工批准后执行；当前调查没有进行这些写入。

调查结束时 Shadow 为 263/263 匹配、missing 0、active Ledger job 0；历史
extra 已自然下降到 5,098。aat.ee 容器仍为 healthy、restart 0，最近 60 分钟
没有 error signature。

## 回滚

本版本没有开启新的执行权威。如应用健康或 Shadow materialization 异常：

1. 仍通过 opsctl 使用已验证的上一精确镜像创建新计划；
2. 保持 Canary path 为空、embedded/独立 worker 和 payment producer 关闭；
3. 必要时把 scheduler mode 从 `shadow` 恢复为 `legacy`；
4. 不删除 ledger、cursor、cron log、syndication 或审计记录。

## 安全遗留

`X-RapidAPI-Key` 仍需在提供方后台轮换。运维输出和文档不得记录该值。
