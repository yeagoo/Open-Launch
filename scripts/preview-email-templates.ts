/**
 * Email Template Preview Script
 * Generate HTML files for previewing email templates in browser
 *
 * Usage:
 *   bun tsx scripts/preview-email-templates.ts
 */

import { writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  getPasswordResetTemplate,
  getVerificationEmailTemplate,
  getWelcomeEmailTemplate,
} from "@/lib/email-templates"

console.log("📧 Generating email template previews...\n")

// Test data
const testData = {
  userName: "John Doe",
  verificationUrl: "https://www.aat.ee/api/auth/verify-email?token=abc123xyz789",
  resetUrl: "https://www.aat.ee/api/auth/reset-password?token=xyz789abc123",
}

// Generate preview files
const templates = [
  {
    name: "verification",
    title: "Email Verification",
    html: getVerificationEmailTemplate(testData.userName, testData.verificationUrl),
  },
  {
    name: "password-reset",
    title: "Password Reset",
    html: getPasswordResetTemplate(testData.userName, testData.resetUrl),
  },
  {
    name: "welcome",
    title: "Welcome Email",
    html: getWelcomeEmailTemplate(testData.userName),
  },
]

// Create preview directory
const previewDir = join(process.cwd(), "email-previews")
try {
  const fs = require("node:fs")
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true })
  }
} catch (error) {
  // Directory might already exist, ignore error
}

// Generate preview file for each template
templates.forEach((template) => {
  const filePath = join(previewDir, `${template.name}.html`)
  writeFileSync(filePath, template.html, "utf-8")
  console.log(`✅ ${template.title}`)
  console.log(`   File: ${filePath}`)
  console.log("")
})

// Generate index page
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
    <h1>📧 aat.ee Email Templates Preview</h1>
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
          <div class="card-desc">Click to preview</div>
        </a>
      `,
        )
        .join("")}
    </div>
    <div class="footer">
      <p>All templates support dark mode and responsive design</p>
      <p style="margin-top: 8px;">© ${new Date().getFullYear()} aat.ee</p>
    </div>
  </div>
</body>
</html>
`

const indexPath = join(previewDir, "index.html")
writeFileSync(indexPath, indexHtml, "utf-8")

console.log("=".repeat(60))
console.log("✨ All template previews generated!")
console.log("=".repeat(60))
console.log("")
console.log("📂 Preview directory:", previewDir)
console.log("")
console.log("🌐 Open this file in your browser to preview:")
console.log(`   file://${indexPath}`)
console.log("")
console.log("Or run one of these commands:")
console.log(`   open ${indexPath}  # macOS`)
console.log(`   xdg-open ${indexPath}  # Linux`)
console.log(`   start ${indexPath}  # Windows`)
console.log("")
