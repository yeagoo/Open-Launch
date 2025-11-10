/**
 * Resend 邮件发送测试脚本
 * 
 * 使用方法:
 *   bun tsx scripts/test-resend-email.ts
 * 
 * 或者指定收件人:
 *   bun tsx scripts/test-resend-email.ts your-email@example.com
 */

import { sendEmail } from "@/lib/email"

// 从命令行参数获取测试邮箱，如果没有提供则使用默认值
const testEmail = process.argv[2] || "test@example.com"

console.log("=" .repeat(60))
console.log("📧 Resend 邮件发送测试")
console.log("=" .repeat(60))

// 1. 检查环境变量
console.log("\n🔍 步骤 1: 检查环境变量配置\n")

const apiKey = process.env.RESEND_API_KEY
const fromEmail = process.env.RESEND_FROM_EMAIL

console.log("RESEND_API_KEY:")
if (apiKey) {
  console.log(`  ✅ 已设置: ${apiKey.substring(0, 10)}...`)
  if (apiKey.startsWith("re_")) {
    console.log("  ✅ 格式正确 (以 're_' 开头)")
  } else {
    console.log("  ⚠️  格式可能不正确 (应该以 're_' 开头)")
  }
} else {
  console.log("  ❌ 未设置 - 请在 .env.local 或 Zeabur 中配置")
  process.exit(1)
}

console.log("\nRESEND_FROM_EMAIL:")
if (fromEmail) {
  console.log(`  ✅ 已设置: ${fromEmail}`)
  if (fromEmail.includes("resend.dev")) {
    console.log("  ⚠️  使用测试域名 (仅用于开发)")
  } else {
    console.log("  ✅ 使用自定义域名")
    console.log("  💡 请确保该域名已在 Resend 中验证")
  }
} else {
  console.log("  ⚠️  未设置 (将使用默认值 'onboarding@resend.dev')")
}

// 2. 测试邮件发送
console.log("\n" + "=" .repeat(60))
console.log("🚀 步骤 2: 发送测试邮件")
console.log("=" .repeat(60))
console.log(`\n收件人: ${testEmail}`)
console.log("发件人:", fromEmail || "onboarding@resend.dev")
console.log("\n发送中...\n")

async function testEmailSending() {
  try {
    const result = await sendEmail({
      to: testEmail,
      subject: "🧪 aat.ee 测试邮件",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h1 style="color: #16a34a;">✅ 邮件发送成功！</h1>
          <p>如果您收到这封邮件，说明 Resend 配置正确。</p>
          <p><strong>配置信息：</strong></p>
          <ul>
            <li>发件人: ${fromEmail || "onboarding@resend.dev"}</li>
            <li>API Key: ${apiKey?.substring(0, 15)}...</li>
            <li>发送时间: ${new Date().toLocaleString("zh-CN")}</li>
          </ul>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            这是一封自动生成的测试邮件，来自 aat.ee 邮件系统测试脚本。
          </p>
        </div>
      `,
    })

    console.log("=" .repeat(60))
    console.log("✅ 邮件发送成功！")
    console.log("=" .repeat(60))
    console.log("\n响应数据:")
    console.log(JSON.stringify(result, null, 2))
    
    console.log("\n" + "=" .repeat(60))
    console.log("📝 下一步操作:")
    console.log("=" .repeat(60))
    console.log("\n1. 检查邮箱:", testEmail)
    console.log("2. 如果没收到，检查垃圾邮件文件夹")
    console.log("3. 查看 Resend Dashboard: https://resend.com/logs")
    console.log("4. 确认域名已验证: https://resend.com/domains")
    console.log("\n如果使用 onboarding@resend.dev:")
    console.log("  ⚠️  只能发送到您在 Resend 注册的邮箱")
    console.log("  💡 生产环境请验证自己的域名\n")
    
  } catch (error: any) {
    console.log("=" .repeat(60))
    console.log("❌ 邮件发送失败！")
    console.log("=" .repeat(60))
    console.log("\n错误信息:")
    console.error(error)
    
    console.log("\n" + "=" .repeat(60))
    console.log("🔧 故障排查建议:")
    console.log("=" .repeat(60))
    
    const errorMessage = error.message || ""
    
    if (errorMessage.includes("API key")) {
      console.log("\n❌ API Key 问题:")
      console.log("  1. 检查 RESEND_API_KEY 是否正确")
      console.log("  2. 确保格式为: re_xxxxxxxxxxxxxxxxxxxx")
      console.log("  3. 在 Resend Dashboard 重新生成: https://resend.com/api-keys")
    }
    
    if (errorMessage.includes("domain") || errorMessage.includes("verified")) {
      console.log("\n❌ 域名验证问题:")
      console.log("  1. 前往 Resend Domains: https://resend.com/domains")
      console.log("  2. 检查域名验证状态")
      console.log("  3. 添加所需的 DNS 记录 (SPF, DKIM, MX)")
      console.log("  4. 或临时使用: RESEND_FROM_EMAIL=onboarding@resend.dev")
    }
    
    if (errorMessage.includes("rate limit")) {
      console.log("\n❌ 发送限额问题:")
      console.log("  1. 检查 Resend 用量: https://resend.com/overview")
      console.log("  2. 免费计划: 3,000 封/月, 100 封/天")
      console.log("  3. 考虑升级到付费计划")
    }
    
    console.log("\n📖 完整故障排查指南:")
    console.log("  docs/cursor/RESEND_TROUBLESHOOTING.md")
    console.log("")
    
    process.exit(1)
  }
}

// 执行测试
testEmailSending()

