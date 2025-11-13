# ⚡ Cron 配置方案对比

## 🎯 快速决策

### 我应该使用哪种方案？

| 您的部署环境                  | 推荐方案              | 文档链接                                                   |
| ----------------------------- | --------------------- | ---------------------------------------------------------- |
| **Zeabur / Vercel / Railway** | 外部 Cron 服务        | [PRODUCTHUNT_CRON_ZEABUR.md](./PRODUCTHUNT_CRON_ZEABUR.md) |
| **Docker / Kubernetes**       | 外部 Cron 服务        | [PRODUCTHUNT_CRON_ZEABUR.md](./PRODUCTHUNT_CRON_ZEABUR.md) |
| **VPS / 独立服务器**          | Linux Cron 或外部服务 | [PRODUCTHUNT_AUTO_IMPORT.md](./PRODUCTHUNT_AUTO_IMPORT.md) |

---

## 📊 详细对比

### 方案 1: 外部 Cron 服务（推荐）

**适用场景**:

- ✅ Zeabur、Vercel、Railway 等 PaaS 平台
- ✅ Docker 容器化部署
- ✅ Kubernetes 集群
- ✅ 无服务器访问权限的环境
- ✅ 希望可视化管理定时任务

**优点**:

- ✅ 无需服务器访问权限
- ✅ 可视化配置界面
- ✅ 内置执行历史和日志
- ✅ 自动失败重试
- ✅ 邮件/Webhook 通知
- ✅ 完全免费（cron-job.org）

**缺点**:

- ⚠️ 依赖第三方服务
- ⚠️ 需要公网访问

**推荐服务**:

- **cron-job.org** ⭐⭐⭐⭐⭐ (完全免费，最推荐)
- **EasyCron** ⭐⭐⭐⭐
- **GitHub Actions** ⭐⭐⭐⭐

**配置时间**: 2 分钟

---

### 方案 2: Linux 系统 Cron

**适用场景**:

- ✅ VPS（如 DigitalOcean、Linode）
- ✅ 独立服务器
- ✅ 有完整 SSH 访问权限
- ✅ 希望完全自主控制

**优点**:

- ✅ 完全自主控制
- ✅ 无需依赖第三方
- ✅ 系统原生支持

**缺点**:

- ❌ 需要 SSH 访问权限
- ❌ 不适用于容器化环境
- ❌ 日志管理需手动配置
- ❌ 故障通知需额外配置

**配置时间**: 5 分钟

---

## 🚀 快速配置指南

### Zeabur 用户（推荐配置）

```bash
# 1. 生成密钥
CRON_SECRET=$(openssl rand -base64 32)

# 2. 在 Zeabur Dashboard 配置环境变量
CRON_SECRET=<生成的密钥>
PRODUCTHUNT_API_KEY=<你的 ProductHunt Token>

# 3. 部署应用
git push origin main

# 4. 配置 cron-job.org
访问: https://cron-job.org/
创建 Cron Job:
  - URL: https://aat.ee/api/cron/import-producthunt
  - Schedule: 每天 01:00 UTC
  - Header: Authorization: Bearer <CRON_SECRET>
```

**详细文档**: [PRODUCTHUNT_CRON_ZEABUR.md](./PRODUCTHUNT_CRON_ZEABUR.md)

---

### VPS 用户

```bash
# 1. SSH 连接到服务器
ssh your-server

# 2. 运行自动安装脚本
cd /home/ivmm/Open-Launch
bash scripts/setup-cron.sh

# 3. 按提示输入信息
```

**详细文档**: [PRODUCTHUNT_AUTO_IMPORT.md](./PRODUCTHUNT_AUTO_IMPORT.md) (步骤 5)

---

## 🔍 常见问题

### Q1: 我用 Zeabur，能用 Linux Cron 吗？

**A**: ❌ 不能。Zeabur 运行在容器中，您无法访问宿主机配置 Cron。请使用外部 Cron 服务。

---

### Q2: 外部 Cron 服务安全吗？

**A**: ✅ 是的。通过 Bearer Token 认证，只有知道 `CRON_SECRET` 的人才能触发 API。

---

### Q3: 外部 Cron 服务会一直免费吗？

**A**: ✅ cron-job.org 和 GitHub Actions 承诺永久免费。对于个人项目，完全够用。

---

### Q4: 我可以同时使用两种方案吗？

**A**: ✅ 可以，但不推荐。会导致重复导入（虽然有去重逻辑）。

---

### Q5: 如何知道 Cron 是否正常执行？

**A**:

- **外部 Cron**: 在服务的 Dashboard 查看执行历史
- **Linux Cron**: 查看日志文件 `logs/producthunt-import-*.log`
- **通用**: 查看 Zeabur 应用日志

---

## 📚 相关文档索引

- **Zeabur 环境 Cron 配置**: [PRODUCTHUNT_CRON_ZEABUR.md](./PRODUCTHUNT_CRON_ZEABUR.md)
- **完整安装指南**: [PRODUCTHUNT_AUTO_IMPORT.md](./PRODUCTHUNT_AUTO_IMPORT.md)
- **快速开始**: [PRODUCTHUNT_QUICKSTART.md](./PRODUCTHUNT_QUICKSTART.md)
- **环境变量配置**: [env.example.txt](./env.example.txt)

---

**如有疑问，请优先查看对应环境的详细文档。** 🚀
