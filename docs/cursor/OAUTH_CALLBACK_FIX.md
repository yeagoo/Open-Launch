# OAuth 回调错误修复指南

## 问题描述

Google/GitHub OAuth 登录时出现 `redirect_uri_mismatch` 错误（Error 400）。

## 根本原因

Better Auth 缺少 `baseURL` 配置，导致无法生成正确的 OAuth 回调 URL。

## 修复内容

### 1. 服务端配置（lib/auth.ts）

添加了 `baseURL` 配置：

```typescript
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_URL || "http://localhost:3000",
  // ... 其他配置
})
```

### 2. 环境变量配置

**Zeabur 生产环境必须配置：**

```bash
BETTER_AUTH_URL=https://www.aat.ee
NEXT_PUBLIC_URL=https://www.aat.ee
```

**本地开发环境：**

```bash
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_URL=http://localhost:3000
```

## 🚀 部署步骤

### 1️⃣ 更新 Zeabur 环境变量

1. 登录 Zeabur Dashboard
2. 进入项目 > 服务 > 环境变量
3. 添加或更新：
   ```bash
   BETTER_AUTH_URL=https://www.aat.ee
   NEXT_PUBLIC_URL=https://www.aat.ee
   ```
4. 保存环境变量

### 2️⃣ 推送代码

```bash
git add .
git commit -m "fix: 添加 Better Auth baseURL 配置以修复 OAuth 回调"
git push origin main
```

### 3️⃣ 等待重新部署

Zeabur 会自动检测代码更新并重新部署。

### 4️⃣ 验证 OAuth 回调 URL

**Google OAuth 回调 URL：**
```
https://www.aat.ee/api/auth/callback/google
```

**GitHub OAuth 回调 URL：**
```
https://www.aat.ee/api/auth/callback/github
```

## ✅ 验证配置

### Google Cloud Console

1. 访问：https://console.cloud.google.com/
2. API 和服务 > 凭据
3. 编辑 OAuth 客户端
4. **已获授权的重定向 URI** 应包含：
   ```
   https://www.aat.ee/api/auth/callback/google
   ```

### GitHub OAuth App

1. 访问：https://github.com/settings/developers
2. 找到您的 OAuth App
3. **Authorization callback URL** 应为：
   ```
   https://www.aat.ee/api/auth/callback/github
   ```

## 🧪 测试

1. 清除浏览器缓存或使用无痕模式
2. 访问 `https://www.aat.ee`
3. 点击 Google 或 GitHub 登录
4. 应该能正常完成授权流程

## 🔍 排查问题

如果仍然出错，检查以下内容：

### 1. 检查环境变量是否生效

在 Zeabur 终端中运行：
```bash
echo $BETTER_AUTH_URL
echo $NEXT_PUBLIC_URL
```

应该输出：
```
https://www.aat.ee
https://www.aat.ee
```

### 2. 检查域名一致性

确保所有配置中的域名完全一致：
- ✅ 使用 `www.aat.ee` 就全部用 `www.aat.ee`
- ✅ 使用 `aat.ee` 就全部用 `aat.ee`
- ❌ 不要混用（部分地方有 www，部分地方没有）

### 3. 检查 HTTPS

生产环境必须使用 HTTPS：
- ✅ `https://www.aat.ee`
- ❌ `http://www.aat.ee`

### 4. 查看 Better Auth 日志

在 Zeabur 日志中搜索：
```
[Better Auth]
```

查看实际使用的回调 URL 是什么。

## 相关文档

- [OAuth 设置指南](./OAUTH_SETUP_GUIDE.md)
- [环境变量配置指南](./ENV_SETUP_GUIDE.md)
- [Zeabur 部署指南](./ZEABUR_DEPLOYMENT_GUIDE.md)

