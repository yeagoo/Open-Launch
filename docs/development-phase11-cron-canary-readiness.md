# Phase 11A Cron Canary 准备版本

日期：2026-07-30
状态：开发与 Review 完成；准备版本待部署，实际 Canary 仍被门禁阻止。
前置阶段：[Phase 10 Cron shadow](./deployments/2026-07-30-phase10-cron-shadow.md)

## 1. 批准边界

业务方于 2026-07-30 明确批准 `/api/cron/syndicate-launches` 作为首个 Canary
候选。代码只把这一项 policy 从 `proposed` 改为 `approved`：

- idempotency：`strict`
- concurrency group：`syndication`，没有其他任务共享
- misfire：`latest`，最多回看 60 分钟
- retry：由业务 durable queue 管理，Ledger 每个窗口最多尝试一次
- side effects：数据库和接收端 HTTPS 请求

其余 21 项 policy 保持 `proposed`，所以 full ledger 仍 fail closed。准备版本
部署后生产继续使用 `CRON_SCHEDULER_MODE=shadow`、空 Canary path、关闭 embedded
和独立 Worker；代码批准不会自动改变调度权威。

## 2. 新增业务级 preflight

通用 Cron 窗口对账只能证明 dispatcher 成功，不能证明任务内部 durable queue
健康。本阶段为批准候选增加只读业务快照：

- 已耗尽重试或 orphaned、但订单仍为 `paid/fulfilled` 的终态交付数；
- 超过 10 分钟的 `sending` claim；
- 已付款、应分发但缺少 `launch_syndication` 行的订单数；
- 四个接收端 endpoint 和 API key 是否齐全；
- endpoint 必须是无 credentials/query/fragment 的
  `https://<host>/api/external/launch`。

任何一项非零或配置异常都会让 `cron:cutover:check --target canary` 返回
`ready=false`。未知的未来候选若没有专用业务检查，也会因缺少 operational
evidence 被拒绝。

生产只读验证确认：

- Shadow 理论窗口 101、匹配 101、missing 0；
- cursor 新鲜，active/attention Ledger job 为 0；
- 接收端配置完整，stale claim 0，missing durable item 0；
- 存在 1 条 mf8 终态失败，已耗尽 8 次重试，关联订单仍为已验证 `paid`；
- Shadow 观察不足 48 小时，且开启前 48 小时的 legacy 历史尚未自然淘汰。

因此 preflight 按设计拒绝。失败记录保持不动，不自动重试、不修改订单、不退款，
等待单独业务核对。

## 3. Review 与修复

### Important

- 初版 CLI 为复用常量导入了完整 Next/数据库模块，导致 standalone preflight
  加载 `server-only` 失败。已把任务常量、配置解析和 URL 校验提取到无数据库、
  无 Next 依赖的纯模块。
- pnpm 误生成的依赖树同时存在 React 19.2.8 与 Bun 锁定的 19.2.7，完整测试出现
  `Invalid hook call`。旧 `node_modules` 已移到仓库外隔离目录，再按 Bun lock
  全新安装；源码没有为依赖污染修改测试。

### Suggestion

- Canary 路径原先在 policy、CLI 和测试重复。现由 policy 导出唯一常量。
- 单查询被无意义地包装在 `Promise.all`，且快照函数职责过多；现已拆分为指标
  查询和快照组装。
- Endpoint 过去只检查非空；preflight 现额外验证 HTTPS、固定路径和无
  credentials/query/fragment，但不输出 URL 或 key 值。

Review 后没有遗留 Critical/Important 代码问题。

## 4. 验证

- 定向 Vitest：6 files、34 tests 通过；
- 全仓 Vitest：81 files passed、2 skipped；365 tests passed、8 skipped；
- TypeScript、全仓 ESLint、Prettier、review style checker：通过；
- Cron policy inventory：22 项结构有效，只有批准候选为 `approved`；
- Bun dependency audit：0 vulnerabilities；
- 四条 route JavaScript budget：通过；
- 使用无效 loopback database/Redis guard 的 production build：通过；
- 新 CLI 以单文件 Node bundle 在生产容器环境执行，read-only transaction
  正确返回上述阻塞项，退出码为 1。

## 5. 实际 Canary 的剩余门禁

实际切换不得早于 2026-08-01 13:05 UTC，且到时必须重新运行同一版本的只读
preflight。只有以下条件全部成立才可创建 Canary 部署：

1. 连续 48 小时 Shadow，missing/extra window 都为 0；
2. cursor 新鲜，无 active/attention Ledger job；
3. mf8 终态失败已由业务核对并以可审计方式处置；
4. operational metrics 和配置问题均为 0；
5. 新 backup、snapshot、dry-run、人工批准和 opsctl journal 全部通过。

到达日期或完成代码批准都不是自动切换信号。
