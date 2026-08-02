# Phase 11B Cron Shadow 缺口修复开发方案

日期：2026-08-02
状态：**方案已 review 并完成本地开发；未部署，未切换 Canary**

前置记录：

- [Phase 7 Cron canary 与切换门禁](./development-phase7-cron-cutover.md)
- [Phase 11A Canary readiness](./development-phase11-cron-canary-readiness.md)
- [Phase 11A 生产部署与 mf8 对账](./deployments/2026-07-30-phase11a-cron-canary-readiness.md)

## 1. 结论

Phase 11B 不通过并发运行 legacy handler 或忽略全部差异来解锁 Canary。推荐增加
与 cursor/job 同事务的 materialization audit，并让 preflight 按任务自身的
`latest`、`skip`、`bounded-all` misfire policy 重建预期结果。

修复版需要先保持 `shadow` 部署，再重新累计完整 48 小时审计证据。历史审计不能
回填；同一次发布不允许直接切换 Canary。

预计本地开发与 review 为 3–5 个工程日；生产侧另需至少 48 小时新 Shadow 观察，
之后的 Phase 11C Canary 还需独立的至少 48 小时观察。时间估算不替代验收门禁。

## 2. 生产事实与根因

2026-08-02 的只读生产检查得到：

| 项目                           | 结果                                                |
| ------------------------------ | --------------------------------------------------- |
| 应用                           | commit `3cf724f`，healthy，restart 0                |
| opsctl                         | 0 errors / 0 warnings，deploy/backup/snapshot ready |
| Shadow                         | 5,388 windows                                       |
| 同分钟匹配                     | 5,362                                               |
| missing legacy                 | 26                                                  |
| extra legacy                   | 0                                                   |
| Ledger active/attention        | 0                                                   |
| Syndication operational issues | 全部为 0                                            |

26 条差异只涉及每两分钟运行的 `skill-publish` 与 `syndicate-launches`，对应
13 个 dispatcher 分钟。每个缺口都与前一轮 65–227 秒的长 dispatch 对齐；相关
Shadow job 在原定窗口后 84–86 秒由下一次 materialization 创建，均在 60 分钟
catch-up 上限内。

当前链路是：

```text
embedded/external minute trigger
          |
          v
  Redis same-minute dedupe
          |
          v
materialize(cursor -> jobs) ----> shadow cancelled jobs
          |
          v
await Promise.all(legacy handlers)   最高可持续 240 秒
          |
          v
 embedded single-flight 跳过重叠 tick
```

因此差异并非 Ledger 没有捕获窗口，而是 legacy 没有在同一分钟产生 attempt。
当前 preflight 把 Ledger 的 bounded catch-up 能力本身判成 blocker。

另一个后续缺陷是 canary→ledger 门禁要求最近 48 小时每个理论 cron fire 都有
ledger success。这个条件与 `latest`/`skip` 本来就允许合并或跳过历史窗口的业务
定义冲突，也必须在 Phase 11B 一并修正。

## 3. 目标与非目标

### 目标

1. 为每次成功 materialization 保存可查询、不可伪造的 scan continuity 证据。
2. 依据真实 misfire policy 判断应该生成的 job，不把理论 cron fire 等同于实际 job。
3. 只让获批候选的安全证据阻塞 Canary，同时继续报告其他 legacy 可靠性差异。
4. 保留 schedule/code drift、未知 extra、业务终态、active/uncertain/dead-letter 的
   fail-closed 门禁。
5. 用真实 PostgreSQL、故障注入、完整 CI、不可变 runner 和新的 48 小时 Shadow
   观察证明修复。

### 非目标

- 不取消 embedded single-flight。
- 不让不同分钟的 legacy fan-out 并发运行。
- 不改变 22 项 Cron 表达式、业务 handler 或既有 policy 决策。
- 不批准新的 Canary task；候选仍只有 `/api/cron/syndicate-launches`。
- 不回填历史 audit，不人工补写成功记录。
- 不在 Phase 11B 发布中切换 Canary 或启动独立 Worker。
- 不把上传、OG、OAuth、AI 输出等非阻断日志问题混入本阶段高风险调度改造。

## 4. 数据模型：migration 0059

开发开始前重新确认迁移 inventory；按当前仓库下一编号为
`0059_cron_materialization_audit.sql`。

新增 `cron_materialization_run`：

| 字段                               | 用途                                       |
| ---------------------------------- | ------------------------------------------ |
| `id`                               | identity/UUID 主键                         |
| `execution_mode`                   | `shadow` 或 `ledger`                       |
| `scope_kind`                       | `all` 或 `task`                            |
| `task_path`                        | task scope 时的安全 Cron path，否则为 null |
| `scanned_from` / `scanned_through` | 本事务覆盖的 UTC minute range              |
| `cursor_was_clamped`               | 是否因全局上限截断历史范围                 |
| `planned_count` / `inserted_count` | planner 与唯一键写入结果                   |
| `canary_planned/inserted_count`    | 候选独立计数，避免非候选变化污染门禁       |
| `policy_fingerprint`               | 当前 scope 的排序 schedule/policy 快照摘要 |
| `canary_policy_fingerprint`        | 已批准候选的独立策略摘要（scope 含候选时） |
| `created_at`                       | materialization 事务时间                   |

约束：

- 所有时间使用 `timestamptz`，scan 边界必须是完整 UTC minute。
- task scope 必须满足现有 `/api/cron/<direct-path>` allowlist；`all` scope 不允许
  `task_path`。
- count 非负且 inserted 不得大于 planned；fingerprint 使用固定长度 SHA-256
  十六进制字符串。候选 fingerprint 独立保存，避免无关任务的策略变更错误重置候选观察期。
- 只有 cursor 实际前进时记录一次审计，避免同分钟重复 trigger 产生伪观察样本。
- cursor 已到目标分钟时返回明确的 no-op 结果，不更新 cursor，也不写 audit。
- 增加 48 小时 preflight 与 90 天 retention 所需的 scope/time 索引。

写入顺序必须位于同一个数据库事务：

1. 锁定 cursor；
2. 读取并验证 schedule/policy；
3. 生成并写入 jobs；
4. 推进 cursor；
5. 写入 audit；
6. 一次提交。

任一步失败必须整体回滚。不得先写 audit、先推进 cursor，或在事务提交后补记。

旧版本应用会忽略新增表，因此 migration 是 additive；新版本缺表时 Shadow
materialization 会记录失败并让 preflight fail closed，但 legacy 权威仍不应中断。

## 5. Policy-aware preflight

### 5.1 Materialization continuity

最近 48 小时必须满足：

- scope 和 execution mode 与目标阶段一致；
- audit scan ranges 按 UTC 分钟连续覆盖完整 48 小时，没有未解释的范围洞；首尾按
  `scanned_from/scanned_through` 判断，不使用 audit 写入时间推断覆盖范围；
- `cursor_was_clamped=0`；
- 最新 audit/cursor 不超过现有 120 秒 freshness 上限；
- cursor freshness 仍检查当前时间；legacy/job 成功对账使用固定 5 分钟结算缓冲后的
  完整 48 小时窗口，避免 240 秒 fan-out 尚未落完 cron log 时产生假 blocker；
- 每个 audit range 的跨度不超过候选 `maxCatchUpMinutes`，避免长时间停摆被一个
  `latest` job 掩盖；
- 候选 schedule 的 `updated_at`、job `schedule_version` 和 policy fingerprint 在
  观察期内一致，否则从候选变更后重新计时；非候选 policy 变化作为 diagnostics，
  不无条件重置候选观察；
- full-ledger readiness 才要求全 inventory fingerprint 在观察期内一致。

preflight 使用每个 audit scan segment 和 policy 重新调用同一纯 planner，得到该次
scan 真正应该生成的 jobs，再与 `cron_job` 比较。不能复制第二套 cron/misfire
算法。

### 5.2 Shadow→Canary

候选 task 的结果分为：

| 分类                     | 含义                                                 | 门禁             |
| ------------------------ | ---------------------------------------------------- | ---------------- |
| `sameMinuteSuccess`      | Shadow window 同分钟存在 2xx legacy attempt          | 通过             |
| `boundedDeferredSuccess` | 在 catch-up 上限内 materialize，随后 legacy 2xx 恢复 | 仅候选通过并警告 |
| `failedAttempt`          | 对应 legacy attempt 为 0/4xx/5xx 且未恢复            | 阻断             |
| `unexplainedMissing`     | 无合法 catch-up/恢复证据                             | 阻断             |
| `unexpectedExtra`        | 未被 schedule/policy 解释的 legacy window/path       | 阻断             |

非候选 task 仍由 legacy 执行，其 missing 按 task/reason 输出 diagnostics；它们不再
替代候选的安全判断，但未知 path、schedule drift 或越权执行仍阻断。

`boundedDeferredSuccess` 不是通用豁免：只允许当前代码批准的
`/api/cron/syndicate-launches`，且数据库策略仍为 `latest`、幂等等级仍为 `strict`、
恢复时间未超过该任务的 catch-up 上限。任何其他任务即使稍后成功，也只能作为诊断，
不能据此获得 Canary 权限。

现有业务级门禁保持不变：unresolved terminal、stale claim、missing durable item、
configuration issue 和 active/attention Ledger job 必须全部为 0。

### 5.3 Canary→Ledger

候选 Canary 的 48 小时验收改为：

- audit continuity 满足第 5.1 节；
- planner 按每个 scan segment 推导的 jobs 与实际 ledger jobs 完全一致；
- 每个实际 ledger job 最终为 `succeeded`；
- 没有 retry_wait、running、uncertain、dead_lettered 或 completion-lost；
- task-specific operational metrics 为 0；
- Worker mode/path、Web mode/path 和代码 approval 一致。

不得继续要求 `latest`/`skip` policy 本来就不会生成的理论 fire 全部存在。
Full ledger 仍要求全部 22 项 policy 分别获批；Phase 11B 不改变这一门禁。

## 6. 开发分片

### 11B.0 Characterization 与纯模型

- 固定 13 个生产缺口的脱敏 fixture：长 dispatch、下一次 scan、latest catch-up。
- 为 scan range、scope fingerprint、policy-aware expected jobs 和对账分类建立纯函数。
- 先写失败测试，证明现有“全部理论窗口”和“全局 missing”规则会误阻断。

验收：纯测试覆盖 latest、skip、bounded-all、policy change、clamp、unknown extra、
候选与非候选隔离。

### 11B.1 Migration 与原子 audit writer

- 增加 0059、Drizzle schema 和索引/约束。
- 在现有 materializer 事务中写 audit，不建立平行 materializer。
- 同分钟 no-op 不制造 audit；并发 materializer 继续由 cursor row lock 串行化。
- cleanup route 增加 90 天 audit retention。

验收：真实 PostgreSQL 验证 commit/rollback 原子性、唯一/检查约束、并发 cursor、
90 天清理边界及查询计划。

### 11B.2 Read-only CLI 与 Admin diagnostics

- 扩展现有 `cron:cutover:check` snapshot，不新增有写副作用的检查 endpoint。
- 输出 candidate、non-candidate、audit continuity 和 operational 四组指标。
- 所有 SQL 保持 read-only、UTC、10 秒 statement timeout 和 48 小时有界范围。
- Admin 只展示结果，不增加“批准/切换”按钮。

验收：旧 schema、audit 不足 48 小时、scope/policy drift、clamp、延迟超限和业务
异常均 fail closed；输出不包含 endpoint、key、用户或订单信息。

### 11B.3 Review 与全量验证

按以下顺序 review：

1. 安全：path/scope/fingerprint、SQL 参数化、无 secret/PII；
2. 正确性与并发：audit/job/cursor 原子性、mode 切换边界、无双权威；
3. 策略：latest/skip/bounded-all、catch-up 上限、strict/guarded 差异；
4. 性能：每分钟写放大、索引、48 小时 query plan、90 天 retention；
5. 回滚：新旧 image、migration additive、Shadow failure isolation；
6. 测试与文档：失败路径、生产 runbook、preflight 示例。

必须通过：TypeScript、ESLint、Prettier、定向/全量 Vitest、真实 PostgreSQL migration
和 integration、空库完整迁移、production build、route budgets、Playwright、Cron
worker package/smoke、Bun audit、Semgrep 和最终 linux/amd64 runner HTTP smoke。

## 7. 生产发布与观察

Phase 11B 生产发布需要单独授权，顺序固定为：

1. CI 全绿并从精确 commit 构建不可变镜像；
2. canonical opsctl preflight；
3. 新 Restic/database backup；
4. snapshot、dry-run 和人工批准；
5. 应用 migration 0059，部署应用，但继续保持：
   - `CRON_SCHEDULER_MODE=shadow`
   - Canary path 为空
   - `CRON_LEDGER_EMBEDDED_WORKER=false`
   - 不启动独立 Worker
6. 验证 health、容器、migration、audit/cursor 原子写入、dispatcher、日志和公网；
7. 完成部署后备份；
8. 从首条有效 audit 开始重新观察至少 48 小时；
9. 立即执行同版本 `--target canary`；只有全部 blocker 为 0，才提交独立 Canary
   切换授权。

若通过，下一阶段 Phase 11C 才执行 syndication Canary：先使用 embedded ledger
worker，其他 21 项仍由 legacy 执行，再观察至少 48 小时。独立 Worker 和 full
ledger 都是后续单独阶段。

## 8. 回滚与暂停条件

### 代码/部署回滚

- 应用可回滚到 Phase 11A 精确镜像；0059 为 additive，不删除表或 audit 历史。
- 回滚后保持 `shadow` 或按既有流程恢复 `legacy`；不得在存在 active ledger job 时
  改变权威。
- 不手工修改 cursor、job 或 audit 行来让 preflight 变绿。

### 立即暂停

- audit 与 cursor/job 不在同一事务；
- scope/policy fingerprint 漂移；
- cursor clamped、范围不连续或 freshness 超限；
- candidate 出现 duplicate side effect、unresolved terminal、stale claim、
  uncertain/dead-letter；
- 48 小时查询超过 statement timeout 或出现不可接受的写放大；
- 容器重启、数据库/Redis degraded、backup/snapshot/deploy gate 非 ready。

## 9. 方案 Review 结论

Review 后确认以下原始方向不可接受并已从方案排除：

- 让 embedded scheduler 并发发起重叠 legacy dispatch；
- 把所有 missing 直接降为 warning；
- 只检查当前 cursor，不保存连续审计；
- 按理论 cron fire 验收所有 misfire policy；
- 回填无法证明的历史 audit；
- 修复部署后立即切 Canary。

Review 同时修正了两个设计歧义：materialization 停摆以 audit scan range 跨度判断，
不能用 `created_at - scanned_through` 的当前 freshness 掩盖历史长间隔；Shadow→Canary
只要求候选 schedule/policy 稳定，不能因无关 legacy task 的 policy 更新重置候选
48 小时观察。Full ledger 仍要求全 inventory 稳定。

当前方案没有已知未处理的 Critical/High 设计问题。仍需在实现 review 中重点验证
audit 原子性、policy fingerprint 稳定性、scan segment 重算和 48 小时 SQL 性能。

## 10. 后续路线

1. **Phase 11B**：开发本方案、review、测试和 Shadow-only 部署。
2. **48 小时新审计观察**：preflight 必须真实通过。
3. **Phase 11C**：单独授权并切换 syndication Canary，观察至少 48 小时。
4. **Phase 11D**：处理非阻断日志问题，包括上传 413 UX、OG 像素上限回退、OAuth
   state mismatch 诊断和 AI 输出解析韧性。
5. **后续 task-by-task rollout**：逐项完成 policy、幂等与业务批准；不得从一个
   Canary 直接跳到未批准的 full ledger。
