# Phase 11B Cron Shadow 缺口修复开发记录

日期：2026-08-02
状态：**本地开发与 review 完成；生产部署、48 小时 Shadow 观察和 Canary 切换均未执行**

方案来源：

- [Phase 11B 修复方案](./development-phase11b-cron-shadow-gap-remediation-plan.md)
- [Phase 11A Canary readiness](./development-phase11-cron-canary-readiness.md)

## 1. 交付结果

本阶段新增 migration `0059_cron_materialization_audit.sql`，让每次实际推进 cursor 的
materialization 在同一事务内保存 scan range、scope、mode、planner/insert 计数和
非敏感策略指纹。cursor 同分钟重复触发现在明确返回 no-op，不写伪 audit。

`cron:cutover:check` 不再把所有理论 fire 当成必须存在的 job，而是逐段复用现有
`planCronMaterialization`，按 `latest`、`skip` 和 `bounded-all` 重建实际预期。
Shadow→Canary 只由已批准的 `/api/cron/syndicate-launches` 候选证据阻断；非候选差异
保留为 warning/diagnostic。Canary→Ledger 同样按实际 materialized jobs 验证成功终态。

预检仍使用当前 cursor 的 120 秒 freshness，但 legacy/job 对账使用固定 5 分钟结算
缓冲后的完整 48 小时窗口，避免最长 240 秒 fan-out 尚未写完 `cron_run_log` 时误报。

## 2. 方案 Review 后的修正

开发前和开发后共修复以下 High 风险：

1. 候选 fingerprint 和 planned/inserted count 独立保存，避免无关任务的策略变化再次
   污染候选门禁。
2. `boundedDeferredSuccess` 只允许代码已批准、数据库仍为 `latest`、幂等等级仍为
   `strict` 的 syndication 候选；其他任务不能复用该豁免。
3. 48 小时连续性按 `scanned_from/scanned_through` UTC minute range 判断，不使用
   audit 写入时间猜测覆盖范围。
4. 单次 scan 跨度超过候选 catch-up 上限、clamp、重叠、缺口、候选计数或指纹漂移
   均 fail closed。
5. audit/job/cursor 写入保持同一事务；通过唯一窗口故障注入验证 audit 冲突时 job 和
   cursor 一并回滚。
6. 90 天 audit retention 始终执行，不依赖 scheduler mode；uncertain/dead-letter job
   的人工保留语义未改变。

## 3. 主要文件

- `drizzle/migrations/0059_cron_materialization_audit.sql`
- `drizzle/db/schema.ts`
- `lib/cron-materialization-audit.ts`
- `lib/cron-ledger-db.ts`
- `lib/cron-cutover-readiness.ts`
- `scripts/check-cron-cutover.ts`
- `app/api/cron/cron-log-cleanup/route.ts`
- 对应的纯逻辑、readiness、migration 和 PostgreSQL integration tests

## 4. 验证结果

通过：

- TypeScript `tsc --noEmit`
- 全仓 ESLint
- 全量 Vitest：82 files / 369 tests passed；2 files / 8 tests 按环境跳过
- Cron policy inventory：22 tasks valid
- Bun dependency audit：0 vulnerabilities
- PostgreSQL 16 migration constraints、同分钟 no-op、事务故障回滚和 90 天清理边界
- 空库完整 0000→0059 migration 与 Drizzle runtime schema drift gate
- 90 天、约 129,606 条 audit fixture 上的 48 小时查询：index scan，约 0.66 ms
- Cron worker package 与 Node 24 `--check` smoke
- 旧/空 audit 数据的 cutover CLI 按设计非零退出并输出明确 blockers

后续 [Phase 11B.4 可靠字体构建门禁](./development-phase11b4-resilient-font-build.md)
已关闭 Google Fonts 网络不稳定造成的 production build 缺口，并补跑 production build、
route budgets、standalone Playwright 和 Cron worker smoke。本机仍未安装 Semgrep；继续由
CI 的固定 `semgrep==1.171.0 --error` 门禁执行。

## 5. 部署边界

本记录不构成生产部署授权。下一步必须先让同一精确 commit 的 CI/build 全绿，再按既有
runbook 完成 preflight、备份、snapshot、dry-run 和人工批准。部署 0059 与应用后继续
保持 Shadow、Canary path 为空、embedded ledger worker 关闭；从首条有效 audit 重新
累计至少 48 小时。只有新的 `--target canary` 全部 blocker 为 0，才单独申请 Phase 11C
Canary 切换授权。
