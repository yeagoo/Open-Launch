/**
 * Email Templates Library
 * Contains all types of email templates
 */

const PRIMARY_COLOR = "#16a34a" // Brand green color
const LOGO_URL = "https://www.aat.ee/logo.png" // Your Logo URL

/**
 * Base email layout
 */
function getEmailLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
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
                This is an automated email from <a href="https://www.aat.ee" style="color: ${PRIMARY_COLOR}; text-decoration: none; font-weight: 500;">aat.ee</a>
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
 * Button component
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
 * Info box component
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
 * Email verification template
 */
export function getVerificationEmailTemplate(userName: string, verificationUrl: string): string {
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; font-size: 32px; margin-bottom: 20px;">
        ✉️
      </div>
    </div>

    <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 700; color: #111827; text-align: center; line-height: 1.3;">
      Verify Your Email Address
    </h1>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
      Hello <strong style="color: #111827;">${userName}</strong>,
    </p>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #374151; text-align: center; line-height: 1.6;">
      Thanks for signing up for aat.ee! Please click the button below to verify your email address and complete your registration.
    </p>

    ${getButton(verificationUrl, "Verify Email")}

    <p style="margin: 30px 0 0; font-size: 14px; color: #6b7280; text-align: center; line-height: 1.6;">
      Or copy and paste this URL into your browser:
    </p>
    <div style="margin: 12px 0; padding: 12px; background-color: #f3f4f6; border-radius: 8px; word-break: break-all;">
      <a href="${verificationUrl}" style="color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 13px; font-family: monospace;">
        ${verificationUrl}
      </a>
    </div>

    ${getInfoBox("⏰ This verification link will expire in 24 hours.", "warning")}

    <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        If you didn't create an account with aat.ee, please ignore this email.
      </p>
    </div>
  `

  return getEmailLayout(content)
}

/**
 * Password reset template
 */
export function getPasswordResetTemplate(userName: string, resetUrl: string): string {
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #fef3c7; border-radius: 50%; line-height: 64px; font-size: 32px; margin-bottom: 20px;">
        🔑
      </div>
    </div>

    <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 700; color: #111827; text-align: center; line-height: 1.3;">
      Reset Your Password
    </h1>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
      Hello <strong style="color: #111827;">${userName}</strong>,
    </p>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #374151; text-align: center; line-height: 1.6;">
      We received a request to reset your password. Click the button below to set a new password.
    </p>

    ${getButton(resetUrl, "Reset Password")}

    <p style="margin: 30px 0 0; font-size: 14px; color: #6b7280; text-align: center; line-height: 1.6;">
      Or copy and paste this URL into your browser:
    </p>
    <div style="margin: 12px 0; padding: 12px; background-color: #f3f4f6; border-radius: 8px; word-break: break-all;">
      <a href="${resetUrl}" style="color: ${PRIMARY_COLOR}; text-decoration: none; font-size: 13px; font-family: monospace;">
        ${resetUrl}
      </a>
    </div>

    ${getInfoBox("⏰ This reset link will expire in 1 hour.", "warning")}
    ${getInfoBox("🔒 If you didn't request a password reset, please ignore this email. Your account is still secure.", "info")}

    <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 14px; color: #111827; font-weight: 600;">
        Keep Your Account Secure
      </p>
      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        Never share your password or reset link with anyone. The aat.ee team will never ask for your password.
      </p>
    </div>
  `

  return getEmailLayout(content)
}

/**
 * Welcome email template (optional)
 */
export function getWelcomeEmailTemplate(userName: string): string {
  const content = `
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="display: inline-block; width: 64px; height: 64px; background-color: #dcfce7; border-radius: 50%; line-height: 64px; font-size: 32px; margin-bottom: 20px;">
        🎉
      </div>
    </div>

    <h1 style="margin: 0 0 16px; font-size: 28px; font-weight: 700; color: #111827; text-align: center; line-height: 1.3;">
      Welcome to aat.ee!
    </h1>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #6b7280; text-align: center; line-height: 1.6;">
      Hello <strong style="color: #111827;">${userName}</strong>,
    </p>
    
    <p style="margin: 0 0 24px; font-size: 16px; color: #374151; text-align: center; line-height: 1.6;">
      Your email has been successfully verified! Now you can start exploring aat.ee to discover the latest startup projects, AI tools, and product launches.
    </p>

    ${getButton("https://www.aat.ee", "Start Exploring")}

    <div style="margin-top: 40px;">
      <h2 style="margin: 0 0 20px; font-size: 20px; font-weight: 600; color: #111827; text-align: center;">
        Quick Start Guide
      </h2>
      
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
          <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 24px; margin-bottom: 8px;">🚀</div>
            <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #111827;">Launch Your Project</h3>
            <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
              Showcase your product to developers and early adopters worldwide
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px; margin-bottom: 12px;">
            <div style="font-size: 24px; margin-bottom: 8px;">⬆️</div>
            <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #111827;">Upvote Projects</h3>
            <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
              Support products you love and help them gain more visibility
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 16px; background-color: #f9fafb; border-radius: 8px;">
            <div style="font-size: 24px; margin-bottom: 8px;">💬</div>
            <h3 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #111827;">Join Discussions</h3>
            <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
              Connect with creators and community members, share your ideas
            </p>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0 0 8px; font-size: 14px; color: #111827; font-weight: 600;">
        Need Help?
      </p>
      <p style="margin: 0; font-size: 14px; color: #6b7280; line-height: 1.6;">
        Visit our <a href="https://www.aat.ee" style="color: ${PRIMARY_COLOR}; text-decoration: none;">Help Center</a> or reply to this email
      </p>
    </div>
  `

  return getEmailLayout(content)
}
