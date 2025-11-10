/**
 * 邮件模板库
 * 包含所有类型的邮件模板
 */

const PRIMARY_COLOR = "#16a34a" // 绿色主题
const LOGO_URL = "https://www.aat.ee/logo.png" // 你的 Logo URL

/**
 * 基础邮件布局
 */
function getEmailLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>aat.ee</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <a href="https://www.aat.ee" style="display: inline-block; text-decoration: none;">
                <img src="${LOGO_URL}" alt="aat.ee" style="height: 40px; width: auto; display: block; margin: 0 auto;" />
              </a>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb; background-color: #f9fafb; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #6b7280; line-height: 1.5;">
                这是一封来自 <a href="https://www.aat.ee" style="color: ${PRIMARY_COLOR}; text-decoration: none; font-weight: 500;">aat.ee</a> 的自动邮件
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} aat.ee. All rights reserved.
              </p>
              <p style="margin: 10px 0 0; font-size: 12px; color: #9ca3af;">
                <a href="https://www.aat.ee/legal/privacy" style="color: #9ca3af; text-decoration: none; margin: 0 8px;">Privacy Policy</a>
                <span style="color: #d1d5db;">|</span>
                <a href="https://www.aat.ee/legal/terms" style="color: #9ca3af; text-decoration: none; margin: 0 8px;">Terms of Service</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * 按钮样式组件
 */
function getButton(url: string, text: string): string {
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 30px auto;">
  <tr>
    <td style="border-radius: 8px; background-color: ${PRIMARY_COLOR};">
      <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 16px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; text-align: center;">
        ${text}
      </a>
    </td>
  </tr>
</table>
  `.trim()
}

/**
 * 信息框组件
 */
function getInfoBox(content: string, type: "info" | "warning" = "info"): string {
  const bgColor = type === "warning" ? "#fef3c7" : "#dbeafe"
  const borderColor = type === "warning" ? "#f59e0b" : "#3b82f6"
  const textColor = type === "warning" ? "#92400e" : "#1e40af"

  return `
<div style="margin: 20px 0; padding: 16px; background-color: ${bgColor}; border-left: 4px solid ${borderColor}; border-radius: 8px;">
  <p style="margin: 0; font-size: 14px; color: ${textColor}; line-height: 1.6;">
    ${content}
  </p>
</div>
  `.trim()
}

/**
 * 邮箱验证模板
 */
export function getVerificationEmailTemplate(userName: string, verificationUrl: string): string {
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; font-size: 32px; margin-bottom: 20px;">
        ✉️
      </div>
    </div>

    <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 700; color: #111827; text-align: center; line-height: 1.3;">
      验证你的邮箱地址
    </h1>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
      你好 <strong style="color: #111827;">${userName}</strong>，
    </p>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #374151; text-align: center; line-height: 1.6;">
      感谢注册 aat.ee！请点击下方按钮验证你的邮箱地址，完成账号注册。
    </p>

    ${getButton(verificationUrl, "验证邮箱")}

    <p style="margin: 30px 0 0; font-size: 14px; color: #6b7280; text-align: center; line-height: 1.6;">
      或者复制以下链接到浏览器中打开：
    </p>
    <div style="margin: 12px 0; padding: 12px; background-color: #f3f4f6; border-radius: 8px; word-break: break-all;">
      <a href="${verificationUrl}" style="color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 13px; font-family: monospace;">
        ${verificationUrl}
      </a>
    </div>

    ${getInfoBox("⏰ 此验证链接将在 24 小时后过期。", "warning")}

    <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        如果你没有注册 aat.ee 账号，请忽略此邮件。
      </p>
    </div>
  `

  return getEmailLayout(content)
}

/**
 * 密码重置模板
 */
export function getPasswordResetTemplate(userName: string, resetUrl: string): string {
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #fef3c7; border-radius: 50%; line-height: 64px; font-size: 32px; margin-bottom: 20px;">
        🔑
      </div>
    </div>

    <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 700; color: #111827; text-align: center; line-height: 1.3;">
      重置你的密码
    </h1>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
      你好 <strong style="color: #111827;">${userName}</strong>，
    </p>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #374151; text-align: center; line-height: 1.6;">
      我们收到了重置你账号密码的请求。点击下方按钮设置新密码。
    </p>

    ${getButton(resetUrl, "重置密码")}

    <p style="margin: 30px 0 0; font-size: 14px; color: #6b7280; text-align: center; line-height: 1.6;">
      或者复制以下链接到浏览器中打开：
    </p>
    <div style="margin: 12px 0; padding: 12px; background-color: #f3f4f6; border-radius: 8px; word-break: break-all;">
      <a href="${resetUrl}" style="color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 13px; font-family: monospace;">
        ${resetUrl}
      </a>
    </div>

    ${getInfoBox("⏰ 此重置链接将在 1 小时后过期。", "warning")}
    ${getInfoBox("🔒 如果你没有请求重置密码，请忽略此邮件。你的账号仍然安全。", "info")}

    <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 14px; color: #111827; font-weight: 600;">
        保护你的账号安全
      </p>
      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        请勿与任何人分享你的密码或重置链接。aat.ee 团队永远不会主动询问你的密码。
      </p>
    </div>
  `

  return getEmailLayout(content)
}

/**
 * 欢迎邮件模板（可选）
 */
export function getWelcomeEmailTemplate(userName: string): string {
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; font-size: 32px; margin-bottom: 20px;">
        🎉
      </div>
    </div>

    <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 700; color: #111827; text-align: center; line-height: 1.3;">
      欢迎加入 aat.ee！
    </h1>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
      你好 <strong style="color: #111827;">${userName}</strong>，
    </p>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #374151; text-align: center; line-height: 1.6;">
      你的邮箱已成功验证！现在你可以开始探索 aat.ee，发现最新的创业项目、AI 工具和产品发布。
    </p>

    ${getButton("https://www.aat.ee", "开始探索")}

    <div style="margin-top: 40px;">
      <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #111827; text-align: center;">
        快速开始
      </h2>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 24px; margin-bottom: 8px;">🚀</div>
            <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #111827;">发布你的项目</h3>
            <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
              向全球开发者和早期用户展示你的产品
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 24px; margin-bottom: 8px;">⬆️</div>
            <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #111827;">为项目投票</h3>
            <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
              支持你喜欢的产品，帮助它们获得更多曝光
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px;">
            <div style="font-size: 24px; margin-bottom: 8px;">💬</div>
            <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #111827;">参与讨论</h3>
            <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
              与创作者和社区成员交流，分享你的想法
            </p>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 14px; color: #111827; font-weight: 600;">
        需要帮助？
      </p>
      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        访问我们的 <a href="https://www.aat.ee" style="color: ${PRIMARY_COLOR}; text-decoration: none;">帮助中心</a> 或直接回复此邮件
      </p>
    </div>
  `

  return getEmailLayout(content)
}
