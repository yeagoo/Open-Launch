# 2026-07-30 Phase 9 Cron ledger 发布

Status: **生产部署完成**

- 应用 commit：`12e526a2ba941c48dc2745cc12e8c760f734a0fe`
- CI：`30541281848`，三个 release gate 全部通过
- 最终计划：`deploy_aat-ee-phase9-r22-20260730`
- 最终快照：`snap_aat-ee-phase9-r22-20260730_1785414534794576889`
- 最终 journal：
  `deploy-deploy_aat-ee-phase9-r22-20260730-20260730122944`
- 部署后备份：`backup-aat-ee-restic-20260730123217`

## 发布内容

- 发布同一不可变 `linux/amd64` runner，Web 与独立 Cron worker 共用该镜像。
- 应用 `0058_cron_job_ledger.sql`，新增持久化 Cron job ledger、materialization
  cursor，以及 `cron_schedule` 的 7 个策略字段。
- 生产继续显式使用 `CRON_SCHEDULER_MODE=legacy`；ledger 不执行任务。
- `PAYMENT_EMAIL_OUTBOX_ENABLED=false` 保持不变。
- 一次性迁移器以非 root、只读根文件系统运行，并只允许
  `--apply 0058_cron_job_ledger.sql`。

## Review 与修复记录

首次 r20 执行被迁移不可变检查拒绝：生产登记的 0049/0053 哈希对应带
`CONCURRENTLY` 运维注释的已部署文件，而候选镜像错误地恢复成更早的字节版本。
SQL 语义未变化，但 hash drift 门正确地阻止了写入。应用立即恢复到 r19；随后：

1. 恢复生产实际登记的 0049/0053 字节版本。
2. 用生产哈希更新 `applied-migration-integrity` 回归锁。
3. 重新运行 TypeScript、ESLint、361 项测试及完整 CI。
4. 从修复提交重新构建 runner/migrator，重新生成 provenance、SBOM 和校验和。

r21 已成功应用 0058 并启动新应用，但 opsctl 把正常 `Exited (0)` 的一次性迁移
容器当作长期容器，部署健康门因此记录 1/3 失败并停止注册表写入。r22 只将
`aat-ee-app` 纳入长期容器健康检查；迁移器仍是 Compose 的
`service_completed_successfully` 启动条件。最终 6/6 操作成功。

生产 dry-run 还确认 0044/0045 在本次发布前已经登记，且
`/api/cron/skill-publish` 已存在；本次迁移器实际只执行 0058。

## 部署后证据

- `aat-ee-app`：`healthy`，restart 0，非 root，read-only rootfs，镜像 revision
  与发布 commit 完全一致。
- 0058 的登记哈希与镜像 SQL 一致：
  `53171b06a7e6e17ed94f7975a0e90a540c1a2ebe451f4ce3fac87ea226a06caa`。
- `cron_job`、`cron_materialization_cursor` 均存在；7 个 Cron 策略列齐全。
- 再次运行迁移 dry-run 返回 `No pending hand-written migrations`。
- 最近 15 分钟 `cron_run_log`：31 次执行、31 次成功、0 次失败、9 个任务；
  `cron_job` 为 0 行，符合 legacy 模式预期。
- `/api/health`、首页、英语/西语 Ogtv 项目页、sitemap、robots、logo 均返回
  200；未授权普通 Cron 与 dispatch 均返回 401。
- 新应用日志没有 error；存在一条 Node `DecompressInterceptor` experimental
  warning，不影响请求或 Cron。
- 部署后 Restic systemd unit：`Result=success`、`ExecMainStatus=0`；备份历史
  状态 `ready`，无 stale target。

## 后续事项

- `X-RapidAPI-Key` 仍需在提供方后台轮换。本地 dotenv 中该变量使用非标准键名，
  直接由 shell 读取时会进入错误输出；后续发布必须使用 dotenv parser，不得
  `source .env.local`。
- ledger/shadow/canary 切换仍需单独计划和批准；本次没有改变生产调度模式。
