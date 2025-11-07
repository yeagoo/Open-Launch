# 部署故障排查快速指南

## 🚨 您当前的错误及解决方案

### 错误 1: Google OAuth 警告

```
WARN [Better Auth]: Social provider google is missing clientId or clientSecret
```

#### 解决方案 A: 配置 Google OAuth

如果您需要 Google 登录功能：

1. **在 Zeabur 添加环境变量**:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-your_google_client_secret
   ```

2. **获取凭据**: 参考 `OAUTH_SETUP_GUIDE.md`

3. **重启应用**: Zeabur Dashboard → 应用 → Restart

#### 解决方案 B: 暂时忽略（推荐快速修复）

如果暂时不需要 Google 登录：

1. 这只是警告，不影响核心功能
2. 可以先部署，之后再配置
3. 用户仍然可以使用邮箱注册/登录

---

### 错误 2: 数据库表不存在（关键错误）

```
error: relation "project" does not exist
```

这是最严重的错误，必须解决。

#### ⭐ 快速解决方案

**步骤 1: 访问 Zeabur Terminal**

1. 登录 Zeabur Dashboard
2. 选择您的项目
3. 点击应用服务
4. 进入 **"Terminal"** 或 **"Console"** 标签

**步骤 2: 运行数据库迁移**

```bash
# 执行迁移（推荐）
bun run db:push

# 或者分步执行
bun run db:generate
bun run db:migrate
```

**步骤 3: 初始化分类数据**

```bash
bun scripts/categories.ts
```

**步骤 4: 重启应用**

```bash
# 在 Zeabur Dashboard 点击 Restart
# 或在 Terminal 中
exit
```

然后在 Dashboard 点击 Restart。

#### 详细解决步骤

如果上述方法不行，使用本地迁移：

1. **本地克隆项目**:
   ```bash
   git clone https://github.com/your-username/Open-Launch.git
   cd Open-Launch
   ```

2. **安装依赖**:
   ```bash
   bun install
   ```

3. **配置数据库连接**:
   
   创建 `.env` 文件：
   ```env
   DATABASE_URL=postgresql://...
   # 从 Zeabur PostgreSQL 服务复制 Connection String
   ```

4. **运行迁移**:
   ```bash
   bun run db:generate
   bun run db:push
   ```

5. **初始化分类**:
   ```bash
   bun scripts/categories.ts
   ```

6. **在 Zeabur 重启应用**

---

## 🔍 检查部署状态

### 1. 查看日志

在 Zeabur Dashboard:
1. 选择应用服务
2. 点击 **"Logs"** 标签
3. 查看实时日志

**正常启动日志应该是：**
```
✓ Ready in XXXms
```

**如果还有错误：**
- 记录错误信息
- 对照下方的错误代码表

### 2. 检查环境变量

**必需的环境变量：**

```env
✅ NODE_ENV=production
✅ NEXT_PUBLIC_URL=https://...
✅ BETTER_AUTH_SECRET=...
✅ DATABASE_URL=postgresql://...
✅ REDIS_URL=redis://...
✅ R2_ACCOUNT_ID=...
✅ R2_ACCESS_KEY_ID=...
✅ R2_SECRET_ACCESS_KEY=...
✅ R2_BUCKET_NAME=...
✅ R2_PUBLIC_DOMAIN=...
✅ RESEND_API_KEY=...
✅ RESEND_FROM_EMAIL=...
```

**检查方法：**
1. Zeabur Dashboard → 应用 → Variables
2. 确认所有必需变量都已设置
3. 检查没有拼写错误

### 3. 验证数据库连接

在 Zeabur Terminal 测试：

```bash
# 检查 DATABASE_URL
echo $DATABASE_URL

# 尝试连接数据库（如果有 psql）
psql $DATABASE_URL -c "SELECT version();"
```

---

## 📊 常见错误代码对照表

### 数据库错误

| 错误代码 | 含义 | 解决方案 |
|---------|------|---------|
| `42P01` | 表不存在 | 运行数据库迁移 |
| `28P01` | 认证失败 | 检查 DATABASE_URL |
| `08006` | 连接失败 | 检查数据库服务状态 |
| `23505` | 唯一约束冲突 | 数据重复，检查数据 |

### 应用错误

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `MODULE_NOT_FOUND` | 依赖缺失 | 重新部署 |
| `ECONNREFUSED` | 服务未启动 | 检查服务状态 |
| `Unauthorized` | 认证失败 | 检查 API 密钥 |
| `Domain not verified` | 域名未验证 | 验证 Resend 域名 |

---

## 🛠️ 完整部署检查流程

### 第 1 步: 服务检查

```bash
✅ PostgreSQL 服务: Running
✅ Redis 服务: Running
✅ 应用服务: Running
```

### 第 2 步: 环境变量检查

使用此清单逐一检查：

```
[ ] BETTER_AUTH_SECRET - 已设置且为随机字符串
[ ] DATABASE_URL - 格式正确，可连接
[ ] REDIS_URL - 格式正确，可连接
[ ] R2_ACCOUNT_ID - 已设置
[ ] R2_ACCESS_KEY_ID - 已设置
[ ] R2_SECRET_ACCESS_KEY - 已设置
[ ] R2_BUCKET_NAME - 已设置
[ ] R2_PUBLIC_DOMAIN - 已设置且可访问
[ ] RESEND_API_KEY - 已设置
[ ] RESEND_FROM_EMAIL - 使用验证的域名
```

### 第 3 步: 数据库迁移检查

```bash
# 在 Zeabur Terminal 运行
bun run db:push

# 检查表是否存在
# 如果有 psql 工具
psql $DATABASE_URL -c "\dt"
```

应该看到以下表：
- `project`
- `user`
- `session`
- `launch_quota`
- `category`
- 等等

### 第 4 步: 应用启动检查

查看日志，确认：
- ✅ 没有致命错误
- ✅ 显示 `✓ Ready in XXXms`
- ✅ 可以访问应用 URL

---

## 🔧 快速修复命令

### 重置数据库（⚠️ 会删除所有数据）

```bash
# 如果数据库状态混乱，重新初始化
bun run db:push --force

# 重新添加分类
bun scripts/categories.ts
```

### 清除缓存

```bash
# 在 Zeabur Dashboard
# 应用 → Settings → Clear Build Cache
# 然后 Redeploy
```

### 重新构建

```bash
# 触发新的部署
# 方法 1: 推送新的 commit
git commit --allow-empty -m "Trigger redeploy"
git push

# 方法 2: 在 Zeabur Dashboard 点击 Redeploy
```

---

## 📋 部署前检查清单

在部署到 Zeabur 之前，确认：

### 本地开发环境

- [ ] 本地可以正常运行 `bun dev`
- [ ] 所有测试通过
- [ ] `.env.example` 文件已更新
- [ ] 依赖都在 `package.json` 中

### Zeabur 环境

- [ ] PostgreSQL 服务已创建
- [ ] Redis 服务已创建
- [ ] 所有环境变量已配置
- [ ] 数据库连接字符串正确
- [ ] R2 存储桶已创建并配置

### 外部服务

- [ ] Cloudflare R2 已配置
- [ ] Resend 域名已验证
- [ ] OAuth 应用已创建（如果需要）
- [ ] Stripe Webhook 已配置（如果需要）

---

## 💡 最佳实践

### 1. 分阶段部署

```
第一阶段: 核心功能
- 只配置必需的环境变量
- 确保应用可以启动
- 验证基本功能

第二阶段: OAuth
- 添加 Google/GitHub OAuth
- 测试登录功能

第三阶段: 支付
- 配置 Stripe
- 测试支付流程

第四阶段: 其他服务
- Turnstile, Discord, Plausible
```

### 2. 使用环境变量管理

```env
# 开发环境
NODE_ENV=development
NEXT_PUBLIC_URL=http://localhost:3000

# 生产环境
NODE_ENV=production
NEXT_PUBLIC_URL=https://your-app.zeabur.app
```

### 3. 监控日志

定期检查 Zeabur 日志：
- 部署后立即检查
- 每天检查一次
- 用户报告问题时检查

### 4. 备份数据库

定期备份 PostgreSQL 数据：

```bash
# 导出数据库
pg_dump $DATABASE_URL > backup.sql

# 恢复数据库
psql $DATABASE_URL < backup.sql
```

---

## 🆘 仍然有问题？

### 收集信息

1. **完整错误日志**
   - 从 Zeabur Logs 复制完整错误
   - 包括堆栈跟踪

2. **环境信息**
   - Node 版本
   - Bun 版本
   - Next.js 版本

3. **配置信息**（脱敏后）
   - 环境变量列表（隐藏实际值）
   - 数据库连接状态

### 获取帮助

1. **查看文档**
   - `ZEABUR_DEPLOYMENT_GUIDE.md`
   - `ENV_SETUP_GUIDE.md`
   - 其他配置指南

2. **社区支持**
   - [Zeabur Discord](https://discord.gg/zeabur)
   - [GitHub Issues](https://github.com/drdruide/open-launch/issues)

3. **调试技巧**
   - 逐步排查
   - 对比本地和生产环境
   - 使用 Zeabur Terminal 直接调试

---

## ✅ 成功部署标志

当看到以下情况，说明部署成功：

```
[Zeabur] ✓ Ready in 871ms
```

没有以下错误：
- ❌ `relation "project" does not exist`
- ❌ `ECONNREFUSED`
- ❌ `MODULE_NOT_FOUND`

可以：
- ✅ 访问首页
- ✅ 用户注册
- ✅ 用户登录
- ✅ 提交项目

---

**记住**: 部署问题通常是配置问题，耐心检查每一个环境变量！


