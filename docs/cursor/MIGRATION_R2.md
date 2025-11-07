# Cloudflare R2 迁移指南

本项目已从 uploadthing 迁移到 Cloudflare R2 进行文件存储管理。

## 迁移内容

### 已完成的更改

1. **依赖更新**
   - ✅ 添加了 `@aws-sdk/client-s3` 和 `@aws-sdk/s3-request-presigner`
   - ✅ 移除了 `uploadthing` 和 `@uploadthing/react`

2. **新增文件**
   - ✅ `lib/r2-client.ts` - R2 客户端配置和上传功能
   - ✅ `lib/r2-upload.ts` - 上传组件导出（保持 API 兼容性）
   - ✅ `components/ui/upload-button.tsx` - 新的上传按钮组件
   - ✅ `app/api/upload/route.ts` - 文件上传 API 路由

3. **已删除文件**
   - ✅ `lib/uploadthing.ts`
   - ✅ `app/api/uploadthing/core.ts`
   - ✅ `app/api/uploadthing/route.ts`

4. **修改文件**
   - ✅ `components/project/submit-form.tsx` - 更新导入路径
   - ✅ `app/globals.css` - 移除 uploadthing 样式导入
   - ✅ `package.json` - 更新依赖

## 配置步骤

### 1. 安装依赖

```bash
# 使用 bun
bun install

# 或使用 npm
npm install
```

### 2. 配置 Cloudflare R2

#### 2.1 创建 R2 存储桶

1. 登录 [Cloudflare 仪表板](https://dash.cloudflare.com/)
2. 进入 R2 存储
3. 点击 "创建存储桶"
4. 输入存储桶名称（例如：`open-launch-files`）
5. 选择位置并创建

#### 2.2 配置公共访问（可选但推荐）

1. 在存储桶设置中，找到 "公共访问" 选项
2. 添加自定义域名或使用 R2.dev 子域
3. 记录公共访问 URL

#### 2.3 创建 API 令牌

1. 在 Cloudflare 仪表板中，进入 "我的个人资料" > "API 令牌"
2. 点击 "创建令牌"
3. 选择 "R2 编辑" 模板
4. 配置权限：
   - 权限：对象读写
   - 存储桶资源：选择您的存储桶
5. 创建令牌并保存 Access Key ID 和 Secret Access Key

### 3. 配置环境变量

将 `.env.r2.example` 文件中的内容复制到您的 `.env` 或 `.env.local` 文件，并填入实际值：

```bash
# Cloudflare R2 配置
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=your_bucket_name_here
R2_PUBLIC_DOMAIN=https://your-public-domain.com
```

**获取 Account ID：**
- 在 Cloudflare 仪表板的 R2 页面右侧可以找到

**配置 R2_PUBLIC_DOMAIN：**
- 如果使用自定义域名：`https://files.yourdomain.com`
- 如果使用 R2.dev 子域：`https://pub-xxxxx.r2.dev`
- 如果没有配置公共访问，文件 URL 将使用预签名 URL（不推荐用于生产环境）

### 4. 测试上传功能

1. 启动开发服务器：
   ```bash
   bun dev  # 或 npm run dev
   ```

2. 访问项目提交页面
3. 尝试上传项目 logo 或产品图片
4. 检查是否成功上传到 R2

## API 变更

### 上传组件 API

新的 `UploadButton` 组件保持了与原 uploadthing 组件相同的 API：

```tsx
import { UploadButton } from "@/lib/r2-upload"

<UploadButton
  endpoint="projectLogo" // 或 "projectProductImage"
  onUploadBegin={() => {
    console.log("开始上传")
  }}
  onClientUploadComplete={(res) => {
    console.log("上传完成:", res[0].serverData.fileUrl)
  }}
  onUploadError={(error) => {
    console.error("上传错误:", error)
  }}
  appearance={{
    button: "your-custom-classes",
    allowedContent: "hidden"
  }}
  content={{
    button({ ready, isUploading }) {
      if (isUploading) return "上传中..."
      if (ready) return "上传图片"
      return "准备中..."
    }
  }}
/>
```

### 文件限制

- **最大文件大小**: 1MB
- **支持的文件类型**: JPEG, PNG, WEBP, GIF
- **存储路径**: 
  - Logo: `logos/timestamp-random.ext`
  - 产品图片: `products/timestamp-random.ext`

## 故障排查

### 上传失败

1. **检查环境变量**
   - 确保所有 R2 环境变量都已正确配置
   - 检查 Account ID 和 API 令牌是否有效

2. **检查存储桶权限**
   - 确认 API 令牌有读写权限
   - 确认存储桶名称正确

3. **检查公共访问**
   - 如果文件无法访问，检查存储桶的公共访问设置
   - 确认 R2_PUBLIC_DOMAIN 配置正确

### 开发环境测试

如果在开发环境中遇到问题，可以：

1. 检查浏览器控制台错误
2. 检查 Next.js 服务器日志
3. 使用 Cloudflare R2 仪表板查看存储桶内容

## 成本说明

Cloudflare R2 的优势：

- ✅ 免费层：每月 10GB 存储
- ✅ 免费层：每月 100 万次 Class A 操作（上传）
- ✅ 免费层：每月 1000 万次 Class B 操作（下载）
- ✅ 零出口费用（egress free）

相比 uploadthing，R2 在大规模使用时更经济实惠。

## 需要帮助？

如果遇到任何问题，请：

1. 查看 [Cloudflare R2 文档](https://developers.cloudflare.com/r2/)
2. 检查项目的 GitHub Issues
3. 联系项目维护者

## 回滚到 uploadthing（不推荐）

如果您需要回滚到 uploadthing，可以：

1. 恢复 Git 提交
2. 重新安装 uploadthing 依赖
3. 恢复删除的文件

但我们强烈建议继续使用 R2，因为它更灵活且成本更低。

