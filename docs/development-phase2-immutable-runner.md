# Phase 2 不可变制品与安全部署开发记录

日期：2026-07-30
状态：Development complete / registry push and production deployment blocked
前置阶段：[development-phase1-cron-ledger.md](./development-phase1-cron-ledger.md)

本文记录 Phase 2 的代码、供应链审查和本地验证结果。它不授权推送镜像、
修改生产配置、部署迁移或切换 Cron 权威模式。

## 1. 已实现内容

### 1.1 单一不可变 runner

根目录 `Dockerfile` 现在：

- 固定 Dockerfile frontend、Node 24.18.0 和 Bun 1.3.14 的镜像摘要；
- 只构建 `linux/amd64`，并在最终镜像中使用非 root 用户；
- 从同一 `.next/standalone` 产物提供 Web 与独立 Cron Worker；
- 通过 `SERVICE_ROLE` 为 Web 和 Worker 使用不同的 Docker health check；
- 记录 source commit、deployment version 和完整构建输入哈希的 OCI labels；
- 只通过 required BuildKit secret mount 读取
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`，不再使用普通 build arg；
- 不复制源码、dotenv 或运行时 provider/database secrets 到最终镜像。

`scripts/hash-build-input.mjs` 对 Git tracked 文件和未忽略的 untracked 文件建立
确定性输入哈希，同时包含文件模式和 symlink target。dirty build 只允许显式
`--allow-dirty --validation-only`，manifest 永远标记为不可发布。

### 1.2 一次构建、多种验证输出

`scripts/build-immutable-runner.sh` 从同一次 BuildKit build 输出：

- 本地 Docker smoke image；
- OCI archive；
- rootfs local export 中的 SPDX 2.3 SBOM 和 SLSA provenance；
- build metadata、release manifest 和 `SHA256SUMS`。

Dockerfile frontend、基础镜像和官方 BuildKit Syft scanner 均固定到摘要。
provenance 使用 `mode=max`。脚本验证：

- `--commit` 必须是当前完整 40 位 HEAD；
- release build 的 commit 必须可证明位于 `origin/main`；
- 输出目录为空，不覆盖既有制品；
- BuildKit secret 不出现在 image history 或 metadata；
- image labels 与 commit、输入哈希一致；
- SBOM 是裸 SPDX 或 BuildKit in-toto SPDX envelope；
- OCI archive、metadata、SBOM、provenance 和 manifest checksum 一致。

使用 passwordless sudo Docker 时，脚本只修复本次新输出目录的 ownership，
不会修改其他目录。

### 1.3 最终镜像冒烟

`scripts/smoke-runner-image.sh` 不依赖源码运行 Web。它：

1. 验证 image 是 `linux/amd64` 且默认用户为 `nextjs`；
2. 用裸 Node 执行 Worker `--check`；
3. 验证最终镜像不含 dotenv；
4. 启动固定摘要的 PostgreSQL 16 与 Redis 7.4；
5. 从空库执行完整 SQL migration chain；
6. 以只读 rootfs、tmpfs、768 MiB memory 和 2 CPU 启动 runner；
7. 等待 Docker health 并检查：
   - `/api/health`
   - `/`
   - `/es`
   - `/sitemap.xml` 的 XML 内容
   - 未授权 Cron 请求返回 401
   - `/logo.svg`

测试容器和 network 使用精确名称并由 trap 清理。

### 1.4 独立 Cron Worker 和连接预算

`cron-ledger-worker.mjs` 由 Bun 构建为 Node 24 ESM bundle，复用现有
`runCronLedgerBatch`，不重写账本 claim/lease 逻辑。它只在以下条件成立时运行：

- `SERVICE_ROLE=cron-worker`；
- `CRON_SCHEDULER_MODE=ledger`；
- 22 项 policy 全部 approved；
- `INTERNAL_BASE_URL` 是分离的单标签 Web service，而不是 loopback 或公网。

Worker 提供 loopback-only health endpoint、独立 dead-man heartbeat、有界 poll
配置、结构化 tick 日志和 graceful shutdown。当前 policy 全部仍是 proposed，
因此生产执行会按设计 fail-closed。

node-postgres 改为显式 `Pool` 并注入 Drizzle。Web 默认上限 10 个连接，Worker
默认 3 个连接，连接超时 5 秒、空闲超时 30 秒，Worker statement timeout
默认 120 秒。生产 canary 前仍需按实际 Web/Worker replica、备份和运维连接
计算总预算。

### 1.5 CI 与 canonical opsctl

手动 `Immutable runner validation` workflow：

- checkout 用户输入的精确 main commit；
- 固定全部 GitHub Actions commit；
- 生成一次性、masked 的 validation-only Server Actions key；
- 构建一次、执行最终镜像 smoke；
- 上传保留 7 天的不可晋升验证制品。

它不读取生产 key、不登录 registry、不 push、不 deploy。

`scripts/opsctl-canonical.sh` 固定真实接口：

- binary：`/usr/bin/opsctl`
- registry：`/srv/server-registry`
- state directory：`/var/lib/opsctl`

包装器不会创建 approval，也不会增加自动执行选项。备份、snapshot、dry-run、
人工批准、journal、部署后验证和部署后备份继续以既有 production runbook
为权威。

## 2. Review 中发现并修复

按安全、供应链、正确性、性能和维护性顺序 review 后修复：

1. 生产 Server Actions key 若进入通用 CI artifact，会扩大密钥暴露面：
   workflow 改为一次性 validation key，manifest 强制
   `validationOnly=true`、`releasable=false`。
2. 基础镜像、Dockerfile frontend 和 SBOM scanner 的 tag 可漂移：
   全部固定官方 registry 返回的 index digest，并加入静态契约测试。
3. Server Actions key 作为 Docker build arg 会进入命令或 provenance：
   改为 required BuildKit secret file mount，并扫描 history/metadata。
4. sudo Docker 的 local exporter 归 root，普通用户会误判 SBOM 缺失：
   仅对本次新 output directory 恢复调用用户 ownership。
5. BuildKit 实际 SBOM 使用 in-toto Statement 包装：
   manifest 解析器同时验证 envelope predicate type 与内部 SPDX version。
6. OCI archive 初版一次性读入内存：
   改为 streaming SHA-256，避免制品大小线性放大 Node 内存。
7. 完整空库 smoke 在 `0049` 发现 `user.is_bot` 尚未建立：
   Git 历史证明六个旧式命名迁移早于编号迁移，但文件名字典序把它们放到
   `0058` 之后。新增 fail-closed historical migration order，并使生产
   pending migration 脚本与 smoke 共用同一排序。
8. Worker bundle 首版 externalize 运行依赖，裸 Node 无法解析
   `dotenv/config`：
   改为 bundle 运行依赖，并保留 `server-only` 的构建期虚拟 stub。
9. Docker secret detector 把公开 Turnstile site key 的旧参数名视为 secret：
   改名为 public site identifier 并在 build RUN 内映射，没有关闭安全规则。

当前 review 没有遗留 Critical/High 代码问题。生产门禁未满足，不应把
development complete 解释为 deploy ready。

## 3. 验证结果

本地已完成：

- Dockerfile BuildKit `--check`，无 warning；
- 单次 `linux/amd64` build 的 Docker、OCI 和 local 三路 exporter；
- SPDX SBOM、max provenance、release manifest 和 checksum 验证；
- 完整空库 migration chain；
- 最终只读 runner 的 Web/locale/sitemap/auth/static smoke；
- Worker bundle 的裸 Node `--check`；
- TypeScript、ESLint、actionlint、shellcheck 和 `git diff --check`；
- Vitest：56 个文件通过、1 个跳过；279 项测试通过、6 项跳过；
- 22 项 policy 结构检查通过，approval gate 对 22 项 proposed policy 按预期
  fail-closed；
- 使用无效本地 database guard URL 的 Next production build。

CI workflow 只完成本地静态检查，尚未在 GitHub Actions 远端运行。

## 4. 生产启用前的阻塞项

1. 生产 private registry、认证方式、Compose image reference 和前一个可回滚
   digest 尚未从生产核实。
2. 本轮没有生产 SSH 写入，也没有 push/deploy；此前连接在 KEX 前被关闭。
3. CI validation key 不是生产稳定 key，验证 OCI archive不能晋升为生产制品。
4. 22 项 Cron policy 仍为 proposed；ledger Worker 会 fail-closed。
5. migration 0058 尚未生产部署，也没有完成至少 48 小时 shadow。
6. 实际 PostgreSQL `max_connections`、当前 replicas 和保留运维连接未知，
   连接池总预算尚不能批准。
7. canonical `opsctl` 的生产 registry/status/gates、backup、snapshot 和 journal
   仍需只读核对。
8. 尚未用前一个生产 digest 完成非生产回滚演练。

## 5. 后续批准顺序

1. 恢复生产 SSH 后只读核对 registry、opsctl status/gates、Compose 和数据库
   连接预算。
2. 确认私有 registry 后，增加“build-and-push by digest”步骤；稳定生产 key
   只进入直接 push 的受保护 build，不上传 OCI archive。
3. 对前一个和候选 digest 执行非生产 deploy/rollback 演练。
4. 按 runbook 完成 backup、snapshot、dry-run、人工批准和 journal。
5. Phase 1 仍先部署 migration 并保持 legacy，再单独批准 shadow；不可直接
   ledger cutover。

## 6. 回滚

- 应用回滚只重新部署上一个已验证 digest，生产机不重新构建。
- Worker 回滚为停止独立 Worker 并设置 `CRON_SCHEDULER_MODE=legacy`。
- 镜像回滚不回滚数据库 schema；0058 的数据和审计记录保留。
- 不复制、合并或重建历史 `.opsctl` state directory。
