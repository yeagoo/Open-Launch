# Phase 6：资产、包体与维护性

日期：2026-07-30
状态：代码完成；生产头像交付方案与现场性能观察仍需外部确认。

## 范围与边界

本阶段处理四类问题：

1. 建立可重复的 route JavaScript 预算和 bundle ownership 制品；
2. 减少 OG 字体运行时制品，同时保持中文、日文和 Latin 渲染；
3. 将 submit 的 Tiptap/TagInput 与 Stripe webhook 从入口依赖和路由职责中拆出；
4. 删除已证明未使用的依赖，并记录头像池的后续交付决策。

本阶段没有部署、推送、连接生产数据库、调用真实 Stripe、上传 R2、修改头像
公开 URL 或缩小头像池。

## 基线与结果

### 路由 JavaScript

测量来自同一套 Next production build 的 client-reference manifest。
`initial` 是 `entryJSFiles` 的唯一 JS gzip 总和；`referenced` 是 route 所有 client
module 引用的保守上界。

| Route                                    | Phase 5 referenced gzip | Phase 6 referenced gzip | Phase 6 initial gzip |
| ---------------------------------------- | ----------------------: | ----------------------: | -------------------: |
| 首页 `/[locale]/page`                    |               136,279 B |               136,336 B |            134,958 B |
| submit `/[locale]/projects/submit/page`  |               440,692 B |               277,573 B |            276,195 B |
| project `/[locale]/projects/[slug]/page` |               147,050 B |               147,138 B |            145,760 B |
| payment success                          |               170,918 B |               170,975 B |            169,597 B |

submit referenced gzip 减少 163,119 B（37.0%），initial gzip 减少
163,119 B（37.1%）；其他三个 route 基本持平，没有把成本转移到共享 chunk。

`config/route-budgets.json` 对四个 route 设置带余量的阻塞阈值。CI 在 build 后执行
`bun run perf:routes`；报告缺失、route 不匹配、配置错误或超过阈值都会 fail
closed。Next 16 自带的 `experimental-analyze --output` 另外生成
`.next/diagnostics/analyze/` ownership 制品，作为 release diagnostics 上传；
预算不依赖其未公开的二进制格式。

### OG 字体

原运行时字体：

- `Inter-Bold.ttf`：326,468 B；
- `NotoSansSC-Bold.ttf`：10,530,408 B。

Satori 当前支持 TTF、OTF、WOFF，不支持 WOFF2。因此实现采用 46 个按 Unicode
0x800 页生成的 WOFF 分片，而不是计划草案中的 WOFF2。分片总计 6,487,352 B；
加 Inter 与 manifest 后，standalone 字体目录为 6,829,190 B/48 文件，比误带
完整 TTF 时的 17,363,310 B 减少 60.7%。

运行时先用 Inter coverage ranges 二分判断，再只读取最终显示文本命中的 Noto
分片。字体 buffer 按进程缓存。generator 记录源字体、Inter、每个分片的 SHA-256、
大小、fontTools 版本和参数；测试逐个核对 hash/size，并通过真实
`ImageResponse` 渲染中文和日文 PNG。Latin-only OG 只读取 Inter。

源 TTF 仍保留在仓库中以便可重复生成，但被 `.dockerignore` 排除。manifest 不
再包含会被 Next tracer 误判为运行时路径的 `.ttf` 文件名；打包脚本还会精确删除
旧 trace 的源 TTF，并校验 standalone 只能包含 Inter、manifest 和声明过的 WOFF
分片。

当前 Noto Sans SC 源字体没有 Hangul；这不是本阶段引入的回归。韩文 OG 的完整
字形支持需要另行选择字体和评估制品成本。

### 头像池

当前 fallback 池保持 20,000 个 SVG、28,622,025 B 及原
`/avatars/pool/{slot}.svg` URL。generator 不再只看最后一个 sentinel，而是核对
完整 numeric set，发现缺失时只补缺失文件，发现越界 numeric slot 时失败。
本地生成池同时被 `.dockerignore` 排除，镜像构建必须在 builder 内从 generator
重建，避免 Git build-input hash 相同但本地 ignored 文件不同而生成不同 runner。

详细方案见 `docs/adr/0001-avatar-pool-delivery.md`。建议在保持旧路径兼容的
前提下映射到 R2/CDN，但状态仍为 Proposed。必须先确认边缘路由、缓存策略和
回滚能力；当前没有执行外部迁移。

## 模块拆分

### Submit

- `RichTextEditorLazy` 使用 literal dynamic import，SSR 关闭；
- 空内容时只在字段接近 viewport、点击或获得焦点后加载 Tiptap；
- 恢复的非空草稿首次渲染即加载编辑器；
- Step 2 的 `emblor` TagInput 移入独立 dynamic chunk；
- 父表单继续拥有原 state、校验、草稿和提交 handler，公开行为不变。

交互测试固定“空初始 render 不加载、激活后加载、非空恢复立即加载”的行为。

### Stripe webhook

公开 Route Handler 只保留 `POST(request)` 并委托 server handler。金额/币种
判断、directory reference 解析和终止订阅状态成为有纯测试的决策模块。原有数据库
写入、签名验证、退款、邮件、幂等和响应结构没有重写。

characterization tests 覆盖：

- 缺失/错误签名；
- 超过 1 MiB 的 body；
- 未处理事件无副作用；
- 健康订阅 no-op；
- deleted-project orphan 只退款/告警一次；
- malformed `dir_` 或非 UUID reference 在数据库查询前被拒绝，并进入 orphan
  refund/admin review 分支；
- orphan session 缺少 `amount_total` 时，管理员告警使用实际 refund 的
  amount/currency，不再把真实退款显示为 0 USD；
- directory order 既有幂等、项目删除和支付分支。

## 依赖清理

- 支付成功页从未声明的传递依赖 `framer-motion` 改为已声明的 `motion/react`；
- 删除无源码、CSS 或脚本引用的 `remixicon`、`remixicon-react`、`react-icons`；
- 保留实际使用的 `@remixicon/react`、`lucide-react`、`motion`、
  `tailwindcss-animate` 和 build-time `boring-avatars`。

删除依据包括静态引用检查、锁文件 ownership、TypeScript、测试、production
build 和 dependency audit，未按包名猜测。

## Review 修复

按安全、性能、正确性、维护性、测试顺序审查后，修复了：

- Next tracer 因 manifest 中 `.ttf` 字符串把 10.5 MiB 源字体重新带入 14 个
  route 的问题；
- 字体 coverage ranges 未显式验证排序，以及 shard 页边界/文件名未绑定的问题；
- standalone 仅“删除旧文件”但不证明运行时字体 inventory 完整的问题；
- Stripe directory reference 未验证 UUID 会触发 PostgreSQL cast 500 并导致
  webhook 永久重试的问题；
- Docker context 会把 Git ignored 的本地头像池带入镜像、破坏 build-input
  identity 的问题；
- route budget 首版使用不存在的 submit route 路径的问题。

最终 review 未发现剩余 Critical/High 代码问题。

## 验证与回滚

最终本地门禁通过：TypeScript、ESLint、73 个 Vitest 文件（325 passed、7
skipped）、frozen install、无漏洞 dependency audit、production build、四 route
budget、Next Analyzer、Playwright 8/8、真实 standalone 中文 OG PNG，以及最终
linux/amd64 runner 的全迁移、SBOM/provenance/checksum 和 HTTP smoke。runner
验证制品来自 dirty worktree，因此明确为 `validationOnly=true`、
`releasable=false`，没有推送或部署。

回滚边界：

- submit：恢复父组件对编辑器/TagInput 的直接 import；
- Stripe：Route Handler 可恢复为原单文件实现，数据库和 API schema 无变化；
- 字体：恢复 `getOgFonts()` 和完整 TTF tracing；不涉及数据迁移；
- 依赖：重新加入被删除的三个无引用包；
- route budget：若确有合理增长，应在 Analyzer ownership review 后调整阈值，
  不应把门禁静默改为 non-blocking；
- 头像：尚未迁移，无需回滚；未来切换必须遵循 ADR 的双读/旧路径恢复方案。

## 外部门禁

- 选择并批准头像池交付方案；
- 远端 CI 首次运行并保存 Analyzer/route budget 制品；
- 部署后观察 route transfer、OG 错误率和至少 7 天移动 field LCP；
- 如需完整韩文字形，确认字体、语言覆盖和制品预算。
