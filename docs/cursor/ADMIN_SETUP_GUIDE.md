# 管理员账号设置指南

## 📋 概述

这个项目有一个功能完整的管理后台，位于 `/admin` 路径。管理后台需要用户角色为 `admin` 才能访问。

## 🔑 管理员权限

管理员可以：
- 📊 查看网站统计数据（用户数、项目数、Premium 项目数等）
- 👥 管理用户（封禁/解封、删除、模拟登录）
- 📅 查看免费发布日期的可用性
- 🏷️ 管理项目分类
- 🎯 查看每日新增数据

## 🚀 访问管理后台

### 访问地址
```
https://your-domain.com/admin
```

### 访问条件
- ✅ 必须已登录
- ✅ 用户的 `role` 字段必须为 `"admin"`

### 导航入口
管理员登录后，在用户菜单中会显示 "Admin Dashboard" 链接。

---

## 🔧 如何设置管理员

### 方法 1: 直接修改数据库（推荐）

#### 1. 首先注册一个账号
通过网站正常注册流程创建一个账号。

#### 2. 获取用户 ID
登录后，可以在浏览器开发者工具的 Network 或 Application 标签中找到你的用户信息，或者直接查询数据库：

```sql
SELECT id, email, name, role FROM "user" WHERE email = 'your-email@example.com';
```

#### 3. 设置为管理员
使用数据库客户端或命令行工具执行以下 SQL：

```sql
UPDATE "user" 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

或者使用用户 ID：

```sql
UPDATE "user" 
SET role = 'admin' 
WHERE id = 'user_id_here';
```

#### 4. 验证
查询确认 role 已更新：

```sql
SELECT id, email, name, role FROM "user" WHERE email = 'your-email@example.com';
```

应该看到 `role` 字段显示为 `admin`。

---

### 方法 2: 使用 PostgreSQL 命令行（适用于 Zeabur 或远程数据库）

#### 1. 连接到数据库

如果使用 Zeabur：
```bash
# 从 Zeabur 数据库服务获取连接字符串
psql "your-database-connection-string"
```

如果使用本地数据库：
```bash
psql postgresql://user:password@localhost:5432/database_name
```

#### 2. 执行更新命令
```sql
UPDATE "user" SET role = 'admin' WHERE email = 'your-email@example.com';
```

#### 3. 退出
```bash
\q
```

---

### 方法 3: 创建数据库迁移脚本

创建一个临时脚本来设置管理员（仅首次使用）：

#### 1. 创建脚本文件
创建 `scripts/set-admin.ts`：

```typescript
import { db } from "@/drizzle/db"
import { user } from "@/drizzle/db/schema"
import { eq } from "drizzle-orm"

async function setAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || "your-email@example.com"
  
  try {
    const result = await db
      .update(user)
      .set({ role: "admin" })
      .where(eq(user.email, adminEmail))
      .returning()

    if (result.length > 0) {
      console.log("✅ Admin role set successfully!")
      console.log("Admin user:", result[0].email)
    } else {
      console.log("❌ User not found with email:", adminEmail)
      console.log("Please make sure the user is registered first.")
    }
  } catch (error) {
    console.error("❌ Error setting admin role:", error)
  }
  
  process.exit(0)
}

setAdmin()
```

#### 2. 在 package.json 添加脚本
```json
{
  "scripts": {
    "set-admin": "tsx scripts/set-admin.ts"
  }
}
```

#### 3. 运行脚本
```bash
ADMIN_EMAIL=your-email@example.com bun run set-admin
```

---

## 🔐 安全建议

1. **限制管理员数量**
   - 只设置必要的管理员账号
   - 定期审查管理员列表

2. **使用强密码**
   - 管理员账号应使用强密码或 OAuth 登录
   - 启用两步验证（如果支持）

3. **监控管理员操作**
   - 定期检查管理员操作日志
   - 注意异常的封禁或删除操作

4. **环境变量保护**
   - 不要在代码中硬编码管理员邮箱
   - 使用环境变量存储敏感信息

---

## 📱 管理后台功能说明

### 用户管理
- **查看用户列表**: 所有注册用户及其信息
- **搜索和过滤**: 按姓名、邮箱、角色、状态筛选
- **封禁用户**: 临时封禁用户 30 天
- **解封用户**: 解除封禁
- **模拟登录**: 以其他用户身份登录（调试用）
- **删除用户**: 永久删除用户及其数据

### 统计数据
- **总用户数**: 包含今日新增
- **总项目数**: 包含今日新增
- **Premium 项目**: 包含今日新增
- **Premium Plus 项目**: 包含今日新增

### 分类管理
- **查看所有分类**: 当前可用的项目分类
- **添加新分类**: 创建新的项目分类

### 发布日程
- **免费发布槽位**: 查看最近可用的免费发布日期

---

## ⚠️ 常见问题

### Q: 设置 role 后仍无法访问管理后台？
A: 请确保：
1. 完全退出登录后重新登录
2. 清除浏览器缓存和 Cookies
3. 检查数据库中 role 字段确实为 "admin"（区分大小写）

### Q: 数据库连接字符串在哪里？
A: 
- 本地开发: 检查 `.env.local` 中的 `DATABASE_URL`
- Zeabur: 在服务的 Variables 标签页查看 `DATABASE_URL`

### Q: 可以有多个管理员吗？
A: 可以！对任意数量的用户执行相同的 UPDATE 操作即可。

### Q: 如何撤销管理员权限？
A: 执行以下 SQL：
```sql
UPDATE "user" SET role = NULL WHERE email = 'user-email@example.com';
```

### Q: 忘记管理员邮箱怎么办？
A: 查询所有管理员：
```sql
SELECT id, email, name, role FROM "user" WHERE role = 'admin';
```

---

## 🎯 快速开始检查清单

- [ ] 1. 注册一个账号
- [ ] 2. 获取注册账号的邮箱或 ID
- [ ] 3. 连接到数据库
- [ ] 4. 执行 UPDATE 语句设置 role = 'admin'
- [ ] 5. 退出登录并重新登录
- [ ] 6. 访问 `/admin` 查看管理后台
- [ ] 7. 验证所有管理功能正常工作

---

## 📚 相关文件

- **管理后台页面**: `app/admin/page.tsx`
- **权限检查**: `app/admin/layout.tsx`
- **管理操作**: `app/actions/admin.ts`
- **用户导航**: `components/layout/user-nav.tsx`
- **数据库 Schema**: `drizzle/db/schema.ts`

---

## 💡 提示

管理员角色的设置是基于数据库的 `role` 字段，没有复杂的权限系统。这个设计简单但有效，适合中小型项目。

如果需要更复杂的权限系统（如多级权限、权限组等），建议：
1. 扩展 user 表添加 permissions 字段
2. 创建单独的 roles 和 permissions 表
3. 实现基于角色的访问控制（RBAC）

---

**祝您管理愉快！** 🎉


