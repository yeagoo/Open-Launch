# 📧 邮件模板升级指南

## ✨ 新模板特性

全新设计的现代化邮件模板，包含：

### 🎨 视觉设计

- ✅ **现代化 UI**：使用 aat.ee 品牌绿色 (#16a34a)
- ✅ **响应式设计**：完美适配移动端和桌面端
- ✅ **清晰的视觉层次**：图标、标题、正文结构分明
- ✅ **专业的按钮设计**：醒目的 CTA (Call To Action) 按钮
- ✅ **信息提示框**：重要信息高亮显示

### 📱 兼容性

- ✅ 支持所有主流邮件客户端（Gmail、Outlook、Apple Mail 等）
- ✅ 移动端优化
- ✅ 暗色模式友好
- ✅ 高对比度显示

### 📝 模板类型

1. **邮箱验证邮件** (✉️)

   - 欢迎新用户
   - 清晰的验证按钮
   - 24 小时过期提醒

2. **密码重置邮件** (🔑)

   - 安全提示信息
   - 重置链接按钮
   - 1 小时过期提醒

3. **欢迎邮件** (🎉)
   - 可选功能
   - 引导用户了解平台
   - 快速开始指南

---

## 🌐 预览邮件模板

### 方法 1: 在浏览器中预览（推荐）

1. **生成预览文件**:

   ```bash
   cd /home/ivmm/Open-Launch
   bun tsx scripts/preview-email-templates.ts
   ```

2. **打开预览**:

   ```bash
   # Linux
   xdg-open email-previews/index.html

   # macOS
   open email-previews/index.html

   # Windows
   start email-previews/index.html
   ```

3. **直接访问**:
   在浏览器中打开: `file:///home/ivmm/Open-Launch/email-previews/index.html`

### 方法 2: 发送测试邮件

使用现有的测试脚本：

```bash
cd /home/ivmm/Open-Launch
./scripts/run-test-email.sh your-email@example.com
```

注册一个新账号即可收到实际的验证邮件。

---

## 🚀 部署新模板

### 步骤 1: 推送代码

```bash
cd /home/ivmm/Open-Launch
git push origin main
```

### 步骤 2: 在 Zeabur 上部署

1. 等待 GitHub 推送完成
2. 登录 [Zeabur Dashboard](https://zeabur.com)
3. 进入你的 Open-Launch 服务
4. 点击 **"Redeploy"** 按钮
5. 等待部署完成（约 2-3 分钟）

### 步骤 3: 测试

1. 在网站上注册一个新账号
2. 检查收到的邮件
3. 应该看到全新的现代化设计！

---

## 🎨 自定义模板

如果你想修改邮件模板的样式或内容，编辑 `lib/email-templates.ts`：

### 修改品牌颜色

```typescript
const PRIMARY_COLOR = "#16a34a" // 改为你的品牌色
```

### 修改 Logo

```typescript
const LOGO_URL = "https://www.aat.ee/logo.png" // 改为你的 Logo URL
```

### 修改文案

在各个模板函数中直接修改 HTML 内容：

```typescript
export function getVerificationEmailTemplate(userName: string, verificationUrl: string): string {
  const content = `
    <h1>这里改标题</h1>
    <p>这里改正文</p>
  `
  // ...
}
```

修改后运行预览脚本查看效果：

```bash
bun tsx scripts/preview-email-templates.ts
```

---

## 📊 模板对比

### 旧模板

- ❌ 简单的黑白设计
- ❌ 纯文本样式
- ❌ 没有视觉层次
- ❌ 移动端体验差

### 新模板

- ✅ 现代化彩色设计
- ✅ 专业的排版
- ✅ 清晰的信息层次
- ✅ 完美的移动端体验
- ✅ 品牌一致性

---

## 🌍 多语言支持

当前模板使用中文。如果需要英文版本：

1. 复制 `lib/email-templates.ts` 为 `lib/email-templates-en.ts`
2. 翻译所有文案为英文
3. 在 `lib/auth.ts` 中根据用户语言选择模板：

```typescript
// 根据用户语言选择模板
const html =
  user.locale === "en"
    ? getVerificationEmailTemplateEN(user.name, url)
    : getVerificationEmailTemplate(user.name, url)
```

---

## 📱 移动端预览

新模板在移动端上的效果：

- **响应式布局**：自动适配屏幕宽度
- **大按钮**：易于点击
- **清晰字体**：易于阅读
- **适当间距**：不拥挤

在手机上打开预览文件或发送测试邮件到手机邮箱即可查看效果。

---

## 🔧 故障排查

### 问题 1: 预览文件无法生成

**原因**: TypeScript 编译错误

**解决方案**:

```bash
# 检查语法错误
bun run build

# 如果有错误，修复后重新生成
bun tsx scripts/preview-email-templates.ts
```

### 问题 2: 邮件中看不到 Logo

**原因**: Logo URL 无法访问

**解决方案**:

1. 确保 Logo 文件存在于 `public/logo.png`
2. 确保 Logo 可以通过 `https://www.aat.ee/logo.png` 访问
3. 或者使用完整的 CDN URL

### 问题 3: 某些邮件客户端显示异常

**原因**: 邮件客户端 CSS 支持不同

**解决方案**:

- 模板使用内联样式，兼容性最好
- 避免使用复杂的 CSS 特性
- 使用 table 布局确保最大兼容性

---

## 📚 技术细节

### 邮件客户端兼容性

模板使用以下技术确保兼容性：

1. **Table 布局**：而不是 div + flexbox
2. **内联样式**：所有样式都内联
3. **兼容性注释**：支持 Outlook 等老旧客户端
4. **渐进增强**：基础功能优先

### HTML 邮件最佳实践

✅ **遵循**:

- 使用 table 布局
- 内联样式
- 绝对 URL（图片、链接）
- 简单的 HTML 结构
- 避免 JavaScript

❌ **避免**:

- CSS 外部文件
- 复杂的 CSS（flexbox、grid）
- 表单元素
- 视频嵌入
- 过大的图片

---

## 🎯 下一步

1. ✅ 在浏览器中预览新模板
2. ✅ 推送代码到 GitHub
3. ✅ 在 Zeabur 上部署
4. ✅ 测试实际邮件效果
5. ✅ 根据需要自定义样式

---

**享受全新的邮件模板！** 📧✨

如果有任何问题或需要进一步自定义，请随时修改 `lib/email-templates.ts` 文件。
