# 2026-07-30 Phase 10 Cron shadow 发布

Status: **生产部署完成；48 小时观察中**

- 应用 commit：`12e526a2ba941c48dc2745cc12e8c760f734a0fe`
- 最终计划：`deploy_aat-ee-phase10-shadow-r23-20260730`
- 最终快照：
  `snap_aat-ee-phase10-shadow-r23-20260730_1785416675294875638`
- 最终 journal：
  `deploy-deploy_aat-ee-phase10-shadow-r23-20260730-20260730130522`
- 部署前备份：`backup-aat-ee-restic-20260730130304`
- 部署后备份：`backup-aat-ee-restic-20260730131001`
- Shadow 起始时间：2026-07-30 13:05 UTC

## 发布范围

本阶段只开启 Cron ledger 的生产 shadow materialization，不改变任务执行权威：

- `CRON_SCHEDULER_MODE=shadow`
- `CRON_LEDGER_CANARY_TASK_PATH` 为空
- `CRON_LEDGER_EMBEDDED_WORKER=false`
- 不启动独立 Cron worker
- `PAYMENT_EMAIL_OUTBOX_ENABLED=false`
- legacy dispatcher 继续执行全部生产任务
- shadow job 直接写为 `cancelled`，不能被 claim 或重试

应用继续使用 Phase 9 已验证的精确 commit 镜像，没有在生产机重新构建，也没有
批准任何 Cron policy。一次性迁移器只核对并应用 0058，完成后正常退出；长期
健康检查只包含 `aat-ee-app`。

## 部署前门禁

执行前完成：

1. Cron cutover 只读检查返回 `ready=true`，22 项 schedule 无 blocker/warning，
   materialization cursor 为空，active ledger job 为 0。
2. 定向 Vitest：26 passed、2 skipped；Cron policy checker 验证 22 项结构有效。
3. Compose 展开验证确认镜像 commit、非 root 用户、只读根文件系统和精确环境
   变量；没有 Worker 或 payment producer 被意外开启。
4. Code review 样式检查发现 healthcheck 行过长，改为 YAML folded scalar 后
   通过；配置中没有发现 secret。
5. opsctl preflight 为 0 warning / 0 blocker；部署前 Restic 备份成功。
6. 快照包含 registry、Docker、filesystem、Caddy、Compose 和 database dump，
   复核为 7/7 scope 通过。
7. 最终 dry-run 为 6 个操作、0 destructive operation，人工批准后执行。

## 部署与验证证据

- opsctl journal 6/6 操作成功，registry 已更新。
- `aat-ee-app` 为 `running/healthy`、restart 0，镜像 revision 与发布 commit
  完全一致，运行用户为 `nextjs`，根文件系统只读。
- 运行环境确认是 shadow、空 Canary path、embedded worker 关闭、payment
  producer 关闭。
- 前四个 dispatcher tick 均返回 200：
  - 13:05：5 个 legacy 执行、5 个 shadow window、0 个 ledger 执行；
  - 13:06：2 个 legacy 执行、2 个 shadow window、0 个 ledger 执行；
  - 13:07：没有计划窗口；
  - 13:08：2 个 legacy 执行、2 个 shadow window、0 个 ledger 执行。
- 上述 9 个 shadow window 全部写为 `cancelled`，与 legacy minute/path 匹配，
  active/attention ledger job 为 0，materialization lag 为 0。
- 最近 15 分钟 `cron_run_log` 为 31 次执行、0 次失败。
- 应用日志没有 `error`、`fatal`、`panic`、`unhandled` 或非零
  `failedCount`。仅有 Node `DecompressInterceptor` experimental warning，
  不影响服务或调度。
- `/api/health`、首页、英语/西语 Ogtv 项目页、sitemap 和 robots 均返回 200；
  未授权普通 Cron 与 dispatch 均返回 401。
- opsctl 最终状态：doctor errors/warnings 为 0，backup、deploy gates 和
  snapshot coverage 均为 `ready`。
- 部署后 Restic unit 返回 `Result=success`、`ExecMainStatus=0`，备份历史为
  `ready`，无 stale target。

## 观察期与下一门禁

Shadow 必须连续观察至少 48 小时。按 2026-07-30 13:05 UTC 起点计算，Canary
最早也不能在 2026-08-01 13:05 UTC 前启动；该时间只是下限，不是自动批准。

当前 Canary preflight 按设计拒绝：

- 观察期不足 48 小时；
- 22 项 policy 仍为 `proposed`；
- `/api/cron/syndicate-launches` 虽满足 strict 和独占组的结构条件，但尚未获得
  业务、运维与代码 review 的明确批准；
- Shadow 开启前 48 小时窗口中的 legacy 历史会暂时显示为 extra window，必须
  随完整观察窗口自然淘汰，不能通过删除日志伪造通过。

到达时间下限后仍必须立即重新运行只读 preflight，确认 cursor 新鲜、
missing/extra window 均为 0、没有 active/attention ledger job，并将 policy
批准作为独立代码和生产变更。不得从 shadow 直接进入 full ledger。

## 回滚

出现窗口不一致、cursor stale、应用健康失败或 shadow 写入错误时：

1. 使用同一 opsctl 流程将 `CRON_SCHEDULER_MODE` 恢复为 `legacy`；
2. 保持 Canary path 为空，Worker 和 payment producer 继续关闭；
3. 不删除 `cron_job`、cursor、`cron_run_log` 或审计历史；
4. 从下一个完整 UTC 分钟恢复并重新核对 Redis minute lease 与 dispatcher。

## 安全遗留

`X-RapidAPI-Key` 仍需在提供方后台轮换。后续运维脚本不得直接 `source`
`.env.local`，必须使用不会把异常键值展开到日志的 dotenv parser。
