# Next.js 配置修复说明

## 🐛 问题描述

构建时出现错误：

```
Invalid next.config.ts options detected:
    Invalid input at "images.remotePatterns[5]"
    Input not instance of URL at "images.remotePatterns[5]"
    "images.remotePatterns[5].hostname" is missing, expected string
```

## 🔍 原因分析

在 `next.config.ts` 文件中，存在一个 **uploadthing** 的遗留配置：

```typescript
{
  protocol: "https",
  hostname: process.env.NEXT_PUBLIC_UPLOADTHING_URL!, // ❌ 问题代码
}
```

**问题**：
1. 项目已迁移到 Cloudflare R2，不再使用 uploadthing
2. `NEXT_PUBLIC_UPLOADTHING_URL` 环境变量不存在或为空
3. 导致 `hostname` 字段为 `undefined`，构建失败

## ✅ 解决方案

### 1. 删除 uploadthing 配置

从 `next.config.ts` 中删除了以下配置：

```typescript
{
  protocol: "https",
  hostname: process.env.NEXT_PUBLIC_UPLOADTHING_URL!,
},
```

### 2. 添加 R2 配置说明

添加了注释说明如何配置 R2 域名（可选）：

```typescript
images: {
  remotePatterns: [
    // 如果需要通过 Next.js Image 组件优化 R2 图片，请取消注释并填入您的 R2 公开域名
    // {
    //   protocol: "https",
    //   hostname: "your-bucket.r2.dev", // 或您的自定义域名
    // },
    // ... 其他域名配置
  ],
}
```

## 📝 如何配置 R2 图片域名（可选）

如果您需要在项目中使用 Next.js 的 `<Image>` 组件来显示 R2 的图片，需要配置 R2 的公开域名。

### 步骤 1: 确定您的 R2 公开域名

您的 R2 公开域名可能是：
- **R2.dev 子域**: `https://your-bucket.r2.dev`
- **自定义域名**: `https://cdn.yourdomain.com`

### 步骤 2: 编辑 next.config.ts

在 `next.config.ts` 中取消注释并修改：

```typescript
images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: "your-bucket.r2.dev", // 替换为您的实际 R2 域名
    },
    // ... 其他域名
  ],
}
```

### 步骤 3: 重新构建

```bash
bun run build
```

## ⚠️ 注意事项

### 关于 Next.js Image 组件

- **如果使用 `<img>` 标签**：不需要配置 `remotePatterns`
- **如果使用 `<Image>` 组件**：必须配置 R2 域名

### hostname 不能使用环境变量

❌ **错误**：
```typescript
hostname: process.env.R2_PUBLIC_DOMAIN, // 构建时可能为 undefined
```

✅ **正确**：
```typescript
hostname: "your-bucket.r2.dev", // 硬编码域名
```

**原因**：`next.config.ts` 在构建时执行，此时环境变量可能未加载或为空。

## 🎯 当前配置

修复后的 `next.config.ts` 包含以下允许的图片域名：

1. `yt3.googleusercontent.com` - YouTube 头像
2. `yt3.ggpht.com` - YouTube 缩略图
3. `avatars.githubusercontent.com` - GitHub 头像
4. `lh3.googleusercontent.com` - Google 头像
5. `designmodo.com` - 设计资源
6. `images.unsplash.com` - Unsplash 图片
7. `nexty.dev` - Nexty 相关资源

## 📚 相关文档

- **R2 设置**: `R2_SETUP.md`
- **R2 迁移**: `MIGRATION_R2.md`
- **环境变量**: `ENV_SETUP_GUIDE.md`

## 🔄 变更历史

| 日期 | 变更 | 原因 |
|-----|------|------|
| 2024-11 | 删除 uploadthing 配置 | 迁移到 R2 |
| 2024-11 | 添加 R2 配置说明 | 提供可选的 R2 图片优化 |

---

**修复完成！现在应该可以成功构建了。** ✅

