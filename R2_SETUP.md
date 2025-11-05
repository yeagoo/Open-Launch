# Cloudflare R2 快速设置指南

## 环境变量配置

在您的 `.env` 或 `.env.local` 文件中添加以下配置：

```env
# Cloudflare R2 配置
R2_ACCOUNT_ID=你的账户ID
R2_ACCESS_KEY_ID=你的访问密钥ID
R2_SECRET_ACCESS_KEY=你的密钥
R2_BUCKET_NAME=你的存储桶名称
R2_PUBLIC_DOMAIN=https://你的公共域名
```

## 快速步骤

### 1. 安装依赖

```bash
bun install
# 或
npm install
```

### 2. 在 Cloudflare 创建 R2 存储桶

1. 访问 https://dash.cloudflare.com/
2. 选择 R2 存储
3. 创建新存储桶

### 3. 创建 API 令牌

1. 在 Cloudflare 仪表板，进入 API 令牌
2. 创建 R2 编辑令牌
3. 保存 Access Key ID 和 Secret Access Key

### 4. 配置公共访问

1. 在存储桶设置中启用公共访问
2. 添加自定义域名或使用 R2.dev 子域
3. 将公共 URL 设置为 `R2_PUBLIC_DOMAIN`

### 5. 测试上传

启动开发服务器并测试文件上传功能：

```bash
bun dev
```

访问项目提交页面，尝试上传图片。

## 文件结构

```
lib/
  ├── r2-client.ts          # R2 客户端配置
  └── r2-upload.ts          # 上传组件导出
components/ui/
  └── upload-button.tsx     # 上传按钮组件
app/api/
  └── upload/
      └── route.ts          # 上传 API 路由
```

## 常见问题

**Q: 上传失败怎么办？**
A: 检查环境变量是否正确配置，特别是 Account ID 和 API 令牌。

**Q: 图片无法访问？**
A: 确保存储桶已配置公共访问，并且 R2_PUBLIC_DOMAIN 设置正确。

**Q: 如何查看上传的文件？**
A: 在 Cloudflare R2 仪表板中查看存储桶内容。

**Q: 成本如何？**
A: Cloudflare R2 提供慷慨的免费层：
- 10GB 免费存储
- 100 万次免费写操作/月
- 1000 万次免费读操作/月
- 零出口费用

详细信息请查看 `MIGRATION_R2.md`。

