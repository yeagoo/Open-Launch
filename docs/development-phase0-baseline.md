# Phase 0 基线与决策门禁

日期：2026-07-29
状态：Implemented / awaiting human decisions
代码基线：`6cc28e4792f822334bacbff143aba91d1f05a890`

本文是
[development-optimization-plan.md](./development-optimization-plan.md#phase-0基线和决策门禁)
的 Phase 0 交付记录。本阶段只增加策略提案、只读测量工具、测试和 CI
一致性检查，不改变生产 Cron、数据库、部署或观测行为。

## 1. Cron 策略矩阵

机器可校验的完整定义在 [`lib/cron-policy.ts`](../lib/cron-policy.ts)。其中记录
每项任务的最终迁移表达式、幂等类别、misfire 策略、最大补跑窗口、重试类别、
最大尝试次数、并发组、外部副作用、是否依赖原始 `scheduled_for` 及决策状态。

当前 22 项均为 `proposed`，不是已获批准的生产策略。普通检查只验证矩阵、route
和迁移历史一致；`--require-approved` 会 fail-closed，直到全部人工确认。

| Task                        | Schedule (UTC)                     | Idempotency    | Misfire  | Max catch-up | Retry         | Group             | Scheduled time |
| --------------------------- | ---------------------------------- | -------------- | -------- | -----------: | ------------- | ----------------- | -------------- |
| `cron-health`               | `*/30 * * * *`                     | guarded        | latest   |          60m | next schedule | monitoring        | no             |
| `cron-log-cleanup`          | `15 0 * * *`                       | convergent     | latest   |           1d | 2 attempts    | maintenance       | no             |
| `db-backup`                 | `0 2 */3 * *`                      | non-idempotent | latest   |           5d | 2 attempts    | backup            | no             |
| `drain-email-outbox`        | `*/10 * * * *`                     | strict         | latest   |          60m | handler       | email             | no             |
| `enrich-projects`           | `*/5 0,4,5,10-23 * * *`            | guarded        | latest   |          60m | next schedule | deepseek          | no             |
| `generate-alternatives`     | `5,35 0,4,5,10-23 * * *`           | convergent     | latest   |          12h | next schedule | deepseek          | no             |
| `generate-blog-recap`       | `0 0 1 * *`                        | convergent     | latest   |          30d | 2 attempts    | deepseek          | **yes**        |
| `generate-blog-roundup`     | `0 12 * * 1`                       | guarded        | latest   |           7d | 2 attempts    | deepseek          | no             |
| `generate-comparisons`      | `15,45 0,4,5,10-23 * * *`          | convergent     | latest   |          12h | next schedule | deepseek          | no             |
| `import-producthunt`        | `0 0 * * *`                        | guarded        | **skip** |            0 | 2 attempts    | producthunt       | no             |
| `moderate-tags`             | `0 0,12,15,18,21 * * *`            | guarded        | latest   |           6h | next schedule | deepseek          | no             |
| `quality-check-projects`    | `*/5 0,4,5,10-23 * * *`            | guarded        | latest   |          60m | next schedule | deepseek          | no             |
| `relate-projects`           | `*/5 0,4,5,10-23 * * *`            | guarded        | latest   |          60m | next schedule | deepseek          | no             |
| `send-ongoing-reminders`    | `5 8 * * *`                        | strict         | latest   |           2d | handler       | email             | no             |
| `send-winner-notifications` | `0 9 * * *`                        | strict         | latest   |           3d | handler       | email             | no             |
| `simulate-engagement`       | `0 0,4,10,12,14,16,18,20,22 * * *` | guarded        | **skip** |            0 | next schedule | deepseek          | no             |
| `skill-publish`             | `*/2 * * * *`                      | guarded        | latest   |          60m | handler       | skill publishing  | no             |
| `syndicate-launches`        | `*/2 * * * *`                      | strict         | latest   |          60m | handler       | syndication       | no             |
| `translate-blog`            | `0 0,4,5,10-23 * * *`              | convergent     | latest   |           1d | next schedule | deepseek          | no             |
| `translate-projects`        | `*/5 0,4,5,10-23 * * *`            | convergent     | latest   |          60m | next schedule | deepseek          | no             |
| `update-launches`           | `*/10 * * * *`                     | convergent     | latest   |           1d | 2 attempts    | launch state      | no             |
| `webhook-health`            | `0 */6 * * *`                      | non-idempotent | latest   |           6h | 2 attempts    | Stripe monitoring | no             |

关键边界：

- Product Hunt endpoint 只读取当前 feed，无法补抓错过的历史日期；历史窗口必须
  `skip`。
- engagement 每多执行一次都可能增加新的模拟评论或改写，因此历史窗口必须
  `skip`。
- monthly recap 目前按执行时刻推导月份。Phase 1 在传递和使用原始
  `scheduled_for` 前，不得启用跨月补跑。
- AI 类任务即使数据库结果趋于收敛，并发仍会重复产生 crawl/AI 费用；建议共用
  单并发组。
- email outbox、syndication 和 skill publication 已是持久化 backlog drain；
  错过多个 dispatcher tick 不等于需要重放多个等价 drain。

副作用全集以机器定义为准，类别包括 database、email、external AI/crawl/HTTP、
object storage、Redis 和 Stripe。结构检查命令：

```bash
bun run cron:policy:check
bun scripts/check-cron-policy.ts --require-approved
```

第一条必须通过。第二条当前应失败并报告 22 项未批准；这是预期门禁，不是待绕过
的测试失败。

## 2. 性能基线

### 2.1 数据库与请求查询数

`.env.local` 的数据库目标经脱敏分类为非 loopback、非 RFC1918 的远端地址。本机
没有发现可认定为 Open Launch 的数据库副本，因此没有对该目标运行 SQL、
`EXPLAIN` 或 `EXPLAIN ANALYZE`。执行计划基线处于 **blocked**，解除条件是：

1. 提供经确认的本地生产脱敏恢复副本；或
2. 提供专用只读 staging 数据库并明确授权查询。

基于当前源码可得到不包含 auth 内部查询的静态下限：

| Home state                           | Application DB calls |
| ------------------------------------ | -------------------: |
| Anonymous, cold list/category caches |                    8 |
| Anonymous, hot caches                |                    1 |
| Signed in, cold caches               |                   11 |
| Signed in, hot caches                |                    4 |

冷缓存的 8 次包括三个列表聚合、三个 category attach、top categories 和一次合并
translation 查询；登录用户另有三个分列表 upvote 查询。除此以外，Nav、Home
和缓存后的 `getCurrentUserId()` 目前仍形成三个 session API 调用，auth 内部实际
SQL 次数需要在安全数据库环境中测量，不能由源码猜测。

### 2.2 路由 JS

现有 `.next` 产物的 build id 为 `-j_Ki1OUgGln-gVYDidDK`，manifest 修改时间为
2026-07-29 06:26 UTC。产物没有 commit 绑定标记，因此以下只作为“未绑定现有
产物”的参考上限，不能证明属于当前 HEAD：

| Route manifest                   | Unique JS chunks |       Raw |      Gzip |    Brotli |
| -------------------------------- | ---------------: | --------: | --------: | --------: |
| `/[locale]/page`                 |               15 | 489,672 B | 151,102 B | 132,542 B |
| `/[locale]/projects/[slug]/page` |               16 | 513,323 B | 159,639 B | 139,881 B |

这是 client-reference manifest 可达 chunk 的上限，不等于首次下载量。复现：

```bash
bun run perf:build --route '/[locale]/page'
bun run perf:build --route '/[locale]/projects/[slug]/page'
```

### 2.3 移动实验室数据

2026-07-29 对当前公网生产页面执行冷 profile，每个 URL 三次。profile 为
390×844、DPR 3、4× CPU slowdown、150ms RTT、1.6Mbps down / 750Kbps up。

| URL                 | LCP runs                 | Median LCP | Median TTFB | Median FCP | Median JS transfer | Median decoded JS |
| ------------------- | ------------------------ | ---------: | ----------: | ---------: | -----------------: | ----------------: |
| `/projects/ogtv`    | 7,112 / 2,848 / 3,080ms  |    3,080ms |       551ms |    2,848ms |          469,637 B |       1,543,145 B |
| `/es/projects/ogtv` | 3,636 / 14,144 / 4,144ms |    4,144ms |       742ms |    3,768ms |          469,637 B |       1,543,145 B |

两组 LCP element 都是首屏 `<p>`，且存在 TTFB 正常而 FCP/LCP 显著延迟的异常
样本。这提示问题不只是 hero 图片；需要在后续阶段拆分 server response、streaming
和主线程/脚本延迟。三次数据波动很大，只能作为实验室回归基线，不能替代 Search
Console 的 28 天现场数据。

复现命令：

```bash
bun run perf:mobile --url https://www.aat.ee/projects/ogtv --runs 3
bun run perf:mobile --url https://www.aat.ee/es/projects/ogtv --runs 3
```

工具输出会移除目标 URL 的 query string，且只输出资源聚合量，不输出资源 URL。

## 3. 部署能力基线

本地已安装的真实 CLI 为 `opsctl 0.6.6`。查询 `--help` 后确认：

- 支持带 snapshot/approval 的 typed `deploy`；
- 支持 `project git-trigger` 和 `project deliver` 的精确 commit/branch
  immutable Git delivery；
- registry 与 state-dir 可以显式固定；
- 本项目 CI 当前只做检查和构建，没有 push container image；
- 仓库有 `Dockerfile`，没有 compose 文件，也没有已确认的外部镜像仓库配置。

因此 Phase 2 不能预设 GHCR、Docker Hub 或新 registry。现有 opsctl 的 immutable
Git delivery 是可复用候选，但必须先从生产 canonical registry 验证 `aat-ee`
profile 和部署合同。

生产只读检查尝试连接文档记录的主机。TCP 22 建连成功，但远端在交换 host key
前返回 `kex_exchange_identification: Connection closed by remote host`。没有进入
认证，也没有执行任何远程命令。因此以下事实当前均为 **blocked/unverified**：

- 生产安装的 opsctl 版本；
- canonical registry 中 `aat-ee` 的实际 profile；
- 当前 status、deploy gates、backup 和 snapshot readiness；
- 是否已有可复用镜像仓库。

不要用本地 0.6.6 或 2026-07-29 早前 runbook 记录替代实时生产核对。

## 4. 可观测性边界

当前已存在：

- Next request error 与 Node runtime error 的结构化 JSON 日志；
- query value、cookie/authorization 等敏感字段的脱敏测试；
- Matomo page view 与 GA，外部脚本延迟 7 秒加载；
- Matomo URL 对敏感 query 参数的移除。

当前不存在：

- Sentry/OpenTelemetry/Pino 等第三方错误追踪或集中日志 SDK；
- Web Vitals 的浏览器 RUM 上报；
- 已确认的第三方处理边界、保留期和费用预算。

Phase 0 决策是：不新增第三方 provider；保留现有结构化日志和 Matomo。Phase 3
若使用 Matomo custom events 上报 Web Vitals，只允许 route template、locale、
device class、metric/value/rating 和匿名 sample id，不允许完整 URL query、用户
ID、email、project owner 或 session 标识。保留期和采样率仍需人工确认后才能
实施。

## 5. 人工决策与 Phase 1 门禁

进入 Phase 1 实施前需要确认：

1. 逐项批准或修改 22 项 Cron policy，尤其是 Product Hunt、engagement、
   monthly recap、通知和备份。
2. 确认 DeepSeek 共用单并发组是否符合吞吐预期。
3. 提供安全 SQL 基线环境，或接受 SQL 执行计划延后到该环境可用时。
4. 恢复生产 SSH 后，重新查询 canonical opsctl/registry 状态。
5. 选择镜像/制品交付方式；在此之前不得编写假定 registry 的 push 流程。
6. 确认 RUM 采样率、保留期和 Matomo 是否允许承载匿名 Web Vitals events。

在这些项目完成前：

- `cron:policy:check` 可以作为结构一致性 CI 门禁；
- `--require-approved` 必须保持失败；
- Phase 1 可设计 schema/纯逻辑，但不得把 proposed policy 用于生产补跑；
- Phase 2 的 registry push 和 Phase 3 的 RUM 外发不得实施。
