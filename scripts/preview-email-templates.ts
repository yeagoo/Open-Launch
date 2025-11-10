/**
 * 邮件模板预览脚本
 * 生成 HTML 文件以便在浏览器中预览邮件模板
 *
 * 使用方法:
 *   bun tsx scripts/preview-email-templates.ts
 */

import { writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  getPasswordResetTemplate,
  getVerificationEmailTemplate,
  getWelcomeEmailTemplate,
} from "@/lib/email-templates"

console.log("📧 生成邮件模板预览...\n")

// 测试数据
const testData = {
  userName: "张三",
  verificationUrl: "https://www.aat.ee/api/auth/verify-email?token=abc123xyz789",
  resetUrl: "https://www.aat.ee/api/auth/reset-password?token=xyz789abc123",
}

// 生成预览文件
const templates = [
  {
    name: "verification",
    title: "邮箱验证邮件",
    html: getVerificationEmailTemplate(testData.userName, testData.verificationUrl),
  },
  {
    name: "password-reset",
    title: "密码重置邮件",
    html: getPasswordResetTemplate(testData.userName, testData.resetUrl),
  },
  {
    name: "welcome",
    title: "欢迎邮件",
    html: getWelcomeEmailTemplate(testData.userName),
  },
]

// 创建预览目录
const previewDir = join(process.cwd(), "email-previews")
try {
  const fs = require("node:fs")
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true })
  }
} catch (error) {
  // 目录可能已存在，忽略错误
}

// 生成每个模板的预览文件
templates.forEach((template) => {
  const filePath = join(previewDir, `${template.name}.html`)
  writeFileSync(filePath, template.html, "utf-8")
  console.log(`✅ ${template.title}`)
  console.log(`   文件: ${filePath}`)
  console.log("")
})

// 生成索引页面
const indexHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>aat.ee 邮件模板预览</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: white;
      text-align: center;
      margin-bottom: 40px;
      font-size: 36px;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 30px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
      transition: transform 0.3s, box-shadow 0.3s;
      text-decoration: none;
      color: inherit;
      display: block;
    }
    .card:hover {
      transform: translateY(-5px);
      box-shadow: 0 15px 40px rgba(0,0,0,0.3);
    }
    .card-icon {
      font-size: 48px;
      margin-bottom: 20px;
      text-align: center;
    }
    .card-title {
      font-size: 20px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 10px;
      text-align: center;
    }
    .card-desc {
      font-size: 14px;
      color: #6b7280;
      text-align: center;
      line-height: 1.6;
    }
    .footer {
      text-align: center;
      margin-top: 60px;
      color: white;
      font-size: 14px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📧 aat.ee 邮件模板预览</h1>
    <div class="grid">
      ${templates
        .map(
          (template) => `
        <a href="${template.name}.html" class="card" target="_blank">
          <div class="card-icon">${
            template.name === "verification"
              ? "✉️"
              : template.name === "password-reset"
                ? "🔑"
                : "🎉"
          }</div>
          <div class="card-title">${template.title}</div>
          <div class="card-desc">点击预览</div>
        </a>
      `,
        )
        .join("")}
    </div>
    <div class="footer">
      <p>所有模板支持深色模式和移动端自适应</p>
      <p style="margin-top: 8px;">© ${new Date().getFullYear()} aat.ee</p>
    </div>
  </div>
</body>
</html>
`

const indexPath = join(previewDir, "index.html")
writeFileSync(indexPath, indexHtml, "utf-8")

console.log("=".repeat(60))
console.log("✨ 所有模板预览已生成！")
console.log("=".repeat(60))
console.log("")
console.log("📂 预览目录:", previewDir)
console.log("")
console.log("🌐 在浏览器中打开以下文件预览:")
console.log(`   file://${indexPath}`)
console.log("")
console.log("或者运行以下命令:")
console.log(`   open ${indexPath}  # macOS`)
console.log(`   xdg-open ${indexPath}  # Linux`)
console.log(`   start ${indexPath}  # Windows`)
console.log("")
