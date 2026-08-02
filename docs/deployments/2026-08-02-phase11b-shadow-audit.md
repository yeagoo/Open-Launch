# 2026-08-02 Phase 11B Cron Shadow audit 发布

Status: **生产部署完成；Canary 与 Ledger Worker 未开启**

- 应用 commit：`4a7746890e899e9b22145d51ff846d45496f1050`
- GitHub CI：
  [run 30754097554](https://github.com/yeagoo/Open-Launch/actions/runs/30754097554)
- 最终计划：`deploy_aat-ee-phase11b-shadow-audit-r25-20260802`
- 最终快照：
  `snap_aat-ee-phase11b-shadow-audit-r25-20260802_1785686417047233274`
- 执行审批：
  `appr_aat-ee-phase11b-shadow-audit-r25-20260802_1785686536885666226`
- 最终 journal：
  `deploy-deploy_aat-ee-phase11b-shadow-audit-r25-20260802-20260802160259`
- 部署前备份：`backup-aat-ee-restic-20260802155152`
- 部署后备份：`backup-aat-ee-restic-20260802160845`
- 执行时间：2026-08-02 16:02:59–16:04:13 UTC

## 发布范围

本次部署 additive migration `0059_cron_materialization_audit.sql` 与 Phase 11B
应用代码。每次实际推进 materialization cursor 时，job、cursor 与 immutable audit
现在由同一个数据库事务提交，为后续 48 小时连续性判断提供可验证证据。

生产执行权威没有改变：

- `CRON_SCHEDULER_MODE=shadow`
- `CRON_LEDGER_CANARY_TASK_PATH` 为空
- `CRON_LEDGER_EMBEDDED_WORKER=false`
- 不启动独立 Cron Worker
- `PAYMENT_EMAIL_OUTBOX_ENABLED=false`
- legacy dispatcher 继续执行生产任务

## 制品与发布门禁

1. 精确 commit 的 CI 三个 job 全绿，包括 Semgrep、数据库/浏览器/性能 release
   gates、linux/amd64 immutable runner build 与 HTTP smoke。
2. 使用生产稳定 Server Actions key 在生产机外构建可发布 runner；release manifest
   为 `sourceDirty=false`、`sourceOnMain=true`、`validationOnly=false`、
   `releasable=true`。
3. Runner OCI SHA-256 为
   `ee64d9bd3bc45f9ccb343e7c997cf784927d4e4e96ebc8dceea5110d9b063bd4`；
   0059 migrator tar SHA-256 为
   `6b1822880cb28ab604d6794df423107335487f95b08b151499b42aeeda18a7ed`。
4. 两个镜像均为 `linux/amd64`、非 root，revision 为精确 commit，build-input
   SHA-256 为
   `7cec8f643472a1c3a369c76fdf3e80a828f5f2ca138cac9b644e863570e4f416`。
5. 候选 runner 在隔离 PostgreSQL/Redis 上通过完整 0000→0059 migration、Worker
   check、health、首页/语言页、sitemap、Cron 401 和静态资源 smoke。
6. preflight 为 0 warning / 0 blocker；部署前备份和 repository check 成功。
7. 快照包含 database dump，7/7 artifact checksum verified；最终 dry-run 只有 6 个
   non-destructive operation。审批后由 canonical opsctl 执行，6/6 成功。

## 部署后验证

- `aat-ee-app` 使用精确 commit 镜像，状态 `healthy`、restart 0、用户 `nextjs`、
  root filesystem read-only。
- 一次性容器 `aat-ee-cron-ledger-migration-r25` 显式执行
  `--apply 0059_cron_materialization_audit.sql`，exit code 0。
- 0059 的生产登记 SHA-256 为
  `0a7f37affff12bc753cbb7e0c99d13622f4682c18c9ca839e759bb2d24425a58`，
  与镜像和源码完全一致；新表有 18 个约束和 4 个索引。
- 首批 audit 从 16:01 UTC 覆盖到 16:10 UTC：7 次提交、0 continuity gap、
  0 clamp、0 planned/inserted mismatch。最新 cursor 与 audit 的
  `scanned_through` 完全相等。
- 所有 Shadow job 均为 `cancelled` 且最大 attempt 为 0；没有 active Ledger job。
- 连续 dispatcher tick 均返回 200，`schedulerMode=shadow`、Canary path 为 null、
  `ledgerRanCount=0`、`failedCount=0`、materialization lag 为 0。
- 新容器日志没有 `error`、`fatal`、`panic`、`unhandled`、`uncaught` 或非零
  `failedCount`；最近 10 分钟 19 条 legacy Cron 记录全部为 2xx 且 error 为空。
- Origin 的 health、首页、四个 locale、Ogtv 项目页、sitemap shards、robots 和 logo
  均为 200；未授权 dispatch/syndication 均为 401。Cloudflare 公开 health、首页、
  西语 Ogtv、sitemap 和 robots 也均为 200。
- 部署后备份的 systemd 结果为 `success`、退出码 0；repository check
  `check-restic-idrive-e2-20260802161026` 成功。最终 opsctl status、backup history、
  snapshot coverage 和 deploy gates 均为 `ready`，doctor error/warning 均为 0。

## 48 小时 Shadow evidence 与后续门禁

相同版本的 Shadow preflight 已为 `ready=true`、0 blocker、0 warning。相同版本的
Canary preflight 按设计继续 fail-closed：

- 新 audit 尚未覆盖过去 48 小时，当前有 2,879 个 uncovered minute；
- candidate/non-candidate 的 expected/extra 差异均来自 audit 启用前的历史 Shadow
  job，不是新的 planner count mismatch；
- clamp、overlap、over-catch-up、count mismatch 和 policy drift 均为 0；
- active Ledger job、未处置终态分发、stale claim、missing durable item 和
  configuration issue 均为 0。

连续观察从首个有效 audit 的 2026-08-02 16:01 UTC 重新计算。考虑 5 分钟
reconciliation lag，最早约在 2026-08-04 16:06 UTC 才能重新评估完整 48 小时窗口；
达到时间下限不代表自动批准，仍必须让相同版本 Canary preflight 的全部 blocker、
warning 和业务指标归零，并取得新的独立生产授权。

## 非阻塞运维备注

只读 preflight 容器运行时，Docker Compose 报告三个更早发布留下的 stopped orphan
container：`aat-ee-validate-comment-fks-1`、`aat-ee-cleanup-comments-1`、
`aat-ee-migrate-1`。它们未运行、未参与 r25 部署，也未影响门禁；本次没有使用
`--remove-orphans`，后续如需清理应先做独立范围确认。

本次部署未回滚 0059。应用如需回退，可通过已验证 snapshot 和 opsctl rollback
重新部署 Phase 11A 精确镜像；0059 为 additive schema，audit 历史应保留。
