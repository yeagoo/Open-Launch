# Phase 8 支付 Webhook 持久化通知与重放修复

日期：2026-07-30
状态：本地开发与 review 完成；两步生产启用和现场验证仍为外部门禁。

## 1. 范围

本阶段处理 Phase 0–7 跨阶段复核留下的支付可靠性问题：

- Premium `already_processed` 重放不再直接重复发送管理员邮件；
- `checkout.session.completed` 与
  `checkout.session.async_payment_succeeded` 复用同一个 Premium 成功收尾；
- Directory 同一 session 重放会补齐项目调度、cache revalidation、
  launch-syndication enqueue 和支付邮件入队；
- 支付邮件复用现有 `email_outbox.event_key UNIQUE`、Resend
  `Idempotency-Key` 和 `drain-email-outbox` 重试机制。

本阶段不改变价格、套餐、配额、退款、孤儿付款或 Stripe 签名规则，不新增支付
接口，也不授权生产部署或真实 Stripe 事件。

## 2. 可靠性契约

逻辑邮件键按 Stripe Checkout Session 固定：

- `stripe:premium:<session_id>:admin`
- `stripe:directory:<session_id>:admin`
- `stripe:directory:<session_id>:buyer`

同一个 session 的 completed、async-success、并发投递和人工 replay 会命中相同
键。数据库唯一约束吸收入队重复，Resend 使用同一键吸收 provider-accept 后进程
中断造成的重复发送。

在 outbox 模式下，入队数据库错误不再被吞掉：webhook 返回 500，让 Stripe
重试。Premium `already_processed` 和 Directory same-session 分支均会重新执行
幂等收尾，所以能修复“业务状态已提交、outbox 尚未写入”的中断窗口。不同
Directory session 仍走既有 duplicate-payment refund，不能伪装成 replay。

未知 outbox kind 现在 fail closed，不会再落入 launch-reminder 分支。

## 3. 两步启用与回滚

为了保持 Phase 2 的不可变 digest 回滚门禁，生产者默认不产生新 kind：

```dotenv
PAYMENT_EMAIL_OUTBOX_ENABLED=false
```

发布顺序：

1. 部署包含 Phase 8 消费者的镜像，保持该变量为 `false`；支付通知继续使用既有
   inline 路径。
2. 验证 `drain-email-outbox` 健康、无未知 kind/dead letter，并把该 digest
   记录为支付 outbox 的最低回滚版本。
3. 单独批准配置变更，将变量设为精确小写 `true` 并重启 Web。
4. 用受控测试付款确认三种新 event key 能被 drain 为 `sent`，同 session replay
   不增加新行或重复邮件。

启用后可以直接回滚到任一包含 Phase 8 consumer 的 digest。若必须回滚到更旧
版本，应先关闭支付入口/生产者并确认没有新 kind 的 active row：

```sql
SELECT kind, status, count(*)
FROM email_outbox
WHERE kind IN ('payment_admin', 'directory_order_confirmation')
GROUP BY kind, status
ORDER BY kind, status;
```

存在 `pending` 或可重试 `failed` 时不得启动旧消费者；应先用 Phase 8 consumer
完成发送或人工处置。不得删除支付通知行来伪造可回滚状态。

## 4. Review 修复

### High

- Premium 首次请求可能在项目提交后、cache revalidation 前中断。replay 现在对
  `scheduled` 和 `already_processed` 都幂等执行 revalidation，Discord 仍只在
  首次调度时发送。
- 新 outbox kind 会使 Phase 8 前 digest 不再是无条件安全回滚目标。增加
  `PAYMENT_EMAIL_OUTBOX_ENABLED` 两步启用门禁，先部署 consumer，再单独启用
  producer。

### Medium

- Directory replay 原先只补项目调度，未补 syndication enqueue、邮件和 cache。
  现在统一经过同一幂等收尾。
- outbox 对未知 kind 原先隐式当作 launch reminder；现在明确抛错并进入既有失败/
  dead-letter 监控。

未发现新的 SQL injection、XSS、鉴权绕过、N+1 或 Critical 问题。邮件模板继续
在现有 helper 中执行 URL、HTML 和 subject header 清理。

## 5. 部署影响

- 不新增数据库迁移；依赖生产已存在迁移 0052 和 0057。
- 新环境变量为可选且默认关闭，不加入生产启动 fail-fast。
- Cron scheduler 切换不属于本阶段；首次部署仍保持
  `CRON_SCHEDULER_MODE=legacy`。
- 部署后必须检查 payment webhook 5xx、`drain-email-outbox`、payment kind
  dead letter 和管理员/买家实际收件。

## 6. 本地验证

- TypeScript 和全仓 ESLint：通过。
- Vitest：78 files passed、2 skipped；356 tests passed、8 skipped。
- 支付定向测试：5 files、34 tests，通过同步付款、延迟付款、same-session
  replay、outbox 写失败、consumer-only 模式、provider idempotency 和未知 kind。
- Production build、Cron policy 22-task inventory 和四 route JavaScript budget：
  通过。
- Bun dependency audit：0 vulnerabilities。
- `git diff --check`：通过。

本轮没有连接生产数据库、发送真实邮件、触发真实 Stripe、构建 releasable 镜像、
推送 registry 或部署。
