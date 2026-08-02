# Phase 11B.4 可靠字体构建门禁开发记录

日期：2026-08-02
状态：**本地开发、review 与 release smoke 完成；未部署生产**

关联记录：

- [Phase 11B Cron Shadow 缺口修复](./development-phase11b-cron-shadow-gap-remediation.md)
- [Phase 11B 修复方案](./development-phase11b-cron-shadow-gap-remediation-plan.md)

## 1. 结果

`next/font/google` 的 Inter、Outfit 和 IBM Plex Serif 继续保持现有 family、weight、
`display`、variable 与 preload 语义，不改 UI 和运行时接口。构建前新增一个有界、串行、
可重试的预取步骤，将审核过的 Google Fonts CSS 和 woff2 暂存到本轮独占目录，再通过
Next 16 已有的 `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` 接口交给字体 loader。无论构建成功或
失败，临时目录都会清理。

本地 `build`、CI 的独立 Next build，以及 release gate 的完整 standalone build 现在都
经过同一 wrapper。Next CLI 由仓库规定的 Node 24 runtime 执行；Bun 只负责预取与构建
编排，避免 Bun 执行 Next TypeScript worker 时的额外内存峰值。

## 2. Review 后的安全与可靠性边界

- CSS URL 固定为 `app/layout.tsx` 实际使用的三条精确 URL，调用方不能扩展 allowlist。
- 请求仅允许 HTTPS `fonts.googleapis.com` 和 `fonts.gstatic.com`，最终重定向目标再次
  校验；不发送项目 secret。
- 每次请求最多 6 次、单次 20 秒、整轮最多 10 分钟；CSS、每族/总文件数、单字体和
  总字体字节均有硬上限。
- CSS 中只接受审核过的 gstatic woff2 path 形态；其他 host、query、hash、认证信息或
  非字体 URL 均 fail closed。
- mock 文件只包含本地临时路径和公开字体 CSS；构建输出未残留临时路径或远端字体 URL。
- Next 16 Turbopack 会把 mock CSS 的绝对本地字体路径当成模块 URL；因此 wrapper 使用
  Next CLI 明确支持的 `--webpack`，并由真实 production build、路由预算和 E2E 验证。

## 3. 构建预算兼容修复

Webpack 的 client-reference manifest 使用紧凑赋值，且不包含 Turbopack 专属的
`entryJSFiles`。旧测量脚本因此无法读取新制品。修复后：

- parser 不执行生成的 JavaScript，只提取并解析 route assignment 中的 JSON；
- 同时覆盖 Webpack 紧凑格式和 Turbopack 空白格式；
- 有 `entryJSFiles` 时保持原精确入口算法；没有时使用 Webpack 的 route-specific
  `clientModules` chunk union；
- 对 `%5B...%5D` 文件名安全解码，并阻止路径逃逸 `.next`。

四条现有 enforce budget 全部通过：

| Route                            | Initial gzip | 上限    |
| -------------------------------- | ------------ | ------- |
| `/[locale]/page`                 | 123,212 B    | 160,000 |
| `/[locale]/projects/submit/page` | 289,926 B    | 310,000 |
| `/[locale]/projects/[slug]/page` | 157,418 B    | 165,000 |
| `/[locale]/payment/success/page` | 165,301 B    | 190,000 |

## 4. 验证结果

本地通过：

- TypeScript 与全仓 ESLint；
- Vitest：85 files / 382 tests passed，2 files / 9 tests 按环境跳过；
- 字体缓存、host/size allowlist、重试、清理、双 bundler manifest 和路径逃逸测试；
- 完整 `bun run build`：24 个 woff2、401,032 bytes，Next production build、Cron worker
  打包和 standalone 整理全部成功；
- 四条 route budgets；
- Cron worker Node 24 `--check`；
- 隔离 PostgreSQL 16 的完整 0000→0059 migration；
- standalone Playwright release smoke：8/8；
- Cron policy inventory：22 tasks valid；
- Bun audit：0 vulnerabilities。

本机未安装 Semgrep，最终 linux/amd64 immutable runner/SBOM/provenance 仍由已存在的 CI
release gate 执行。本轮没有绕过或放宽这些门禁。

## 5. 部署边界与下一步

本记录不构成生产部署授权，也没有 push、切换 Cron mode 或启动独立 Worker。Phase 11C
仍被以下硬门禁阻挡：先部署 additive migration 0059 与本阶段构建修复，保持 Shadow，
再从首条有效 materialization audit 起累计完整 48 小时 evidence。只有同版本
`cron:cutover:check --target canary` 全部 blocker 为 0，才可单独申请 Canary 切换。
