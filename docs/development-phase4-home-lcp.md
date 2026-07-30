# Phase 4：首页与 LCP 优化

完成日期：2026-07-30
状态：代码完成；staging/生产性能和现场 LCP 验收待单独授权

## 交付范围

本阶段在不部署生产、不查询生产数据库的前提下完成：

- 全局搜索初始包只保留按钮和 Cmd/Ctrl+K 监听；首次使用时才加载
  Command/Dialog、搜索 hook 和结果 UI。
- 桌面与移动导航复用同一 lazy shell；移动抽屉关闭重复的全局快捷键监听。
- 新增请求级完整 Session getter，Nav、首页和 `getCurrentUserId()` 共享同一次
  `auth.api.getSession()`。
- 首页 namespace translations、Session、三组项目和 top categories 尽早并行
  启动；拿到基础项目后，项目翻译和用户点赞查询并行执行。
- upvote 和 comments 分别预聚合后再关联 project，移除
  upvote × comments 的乘法中间结果。
- 首页合并 today/yesterday/month 的 project ID，登录用户只执行一次 upvote
  状态查询；其他公开列表 action 保持兼容。

现有搜索键盘导航、认证用户入口、无障碍标题、列表数量、排序、cache tag、
revalidate、返回结构和空列表行为均保留。没有新增数据库索引。

## Review 与修复

按安全、性能、正确性、维护性和测试顺序完成 review。已修复：

1. 移动抽屉仍引用旧搜索导出；改为复用 lazy shell，并禁用第二个全局快捷键
   listener，避免桌面和移动入口同时响应。
2. 搜索 chunk 在加载期间卸载组件可能在卸载后更新状态；增加 mounted guard。
3. 首页项目翻译最初仍等待用户点赞查询完成；两者改为在基础列表完成后并行。
4. 三组列表最初返回 readonly tuple，导致通用本地化函数丢失具体项目类型；
   改为保持可变分组返回类型并由类型检查锁定。
5. `unstable_cache` key 从 v1 提升到 v2，避免部署后复用旧查询结果；tag 和
   revalidate 未改变。
6. 跨阶段复核发现 month window 仍依赖服务器本地时区并使用包含式月末；现改为
   `[UTC 月初, 下月 UTC 月初)`，避免非 UTC 主机跨月错收或漏收项目。

Review 后无剩余 Critical/High 代码问题。

## 查询验证

专用本地 PostgreSQL 16 临时容器使用 0、1、300 upvotes 和
0、1、250 comments 的夹具执行旧、新查询及
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`：

| 指标                    | 旧双明细表查询 | 预聚合查询 |
| ----------------------- | -------------- | ---------- |
| 结果与排序              | 基准           | 完全一致   |
| 执行计划峰值实际行数    | 75,009         | 301        |
| 本地样本 execution time | 26.432 ms      | 0.106 ms   |

本地耗时仅证明查询结构和夹具行为，不代表生产 p95。测试容器完成后已删除；没有
连接或修改生产数据库。

## 客户端体积

使用同一个 `perf:build --route '/[locale]/page'` 工具比较 Phase 3 产物和
Phase 4 production build 的 client-reference manifest 上限：

| 指标   |   Phase 3 |   Phase 4 | 变化                |
| ------ | --------: | --------: | ------------------- |
| chunks |        15 |        14 | -1                  |
| raw    | 493,439 B | 440,017 B | -53,422 B（-10.8%） |
| gzip   | 152,407 B | 136,279 B | -16,128 B（-10.6%） |
| brotli | 133,709 B | 119,421 B | -14,288 B（-10.7%） |

该工具明确是 route manifest 上限，不等同浏览器初始传输量；首次使用搜索时会
再下载延迟 chunk。

## 验证结果

- `bunx tsc --noEmit`：通过。
- `bun run lint`：通过。
- `bun run test`：63 files passed、2 skipped；298 tests passed、7 skipped。
- `bun run build`：Next 16.2.12 production build、Cron worker bundle 和
  standalone preparation 全部通过。
- 搜索交互：初始不渲染 Dialog；点击和 Ctrl+K 均加载并打开；认证状态传递
  通过。
- 首页契约：分别预聚合、无双明细表 join、单次分组点赞查询和共享 Session
  路径均有回归检查。
- PostgreSQL 16：0/1/大量 fixture、计数、排序和执行计划验证通过。

## 外部门禁与回滚

本阶段没有修改生产。以下验收仍需 staging/生产部署授权：

- staging/恢复副本的真实数据量 `EXPLAIN (ANALYZE, BUFFERS)`；
- 匿名、登录用户和管理员导航的浏览器 E2E；
- 首页 HTML、hydration、错误率和服务器 p95 无回归；
- 移动实验室三次中位 LCP；
- 至少 7 天现场样本和 Search Console p75 LCP，目标不高于 2.5 秒。

三个改动面可独立回滚：Nav 搜索 lazy shell、共享 Session/并行数据流、首页
预聚合和 grouped assembler。回滚查询时同时恢复对应 v1 cache key；本阶段
没有 schema migration 或索引需要回滚。
