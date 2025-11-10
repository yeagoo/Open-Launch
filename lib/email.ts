import { Resend } from "resend"

// Lazy initialization to avoid build-time errors
let resend: Resend | null = null

function getResendClient(): Resend {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error("Missing RESEND_API_KEY environment variable")
    }
    resend = new Resend(apiKey)
  }
  return resend
}

interface EmailPayload {
  to: string
  subject: string
  html: string
}

/**
 * Sends an email using Resend
 * @param payload - Email configuration object
 * @returns Promise that resolves when email is sent
 */
export async function sendEmail(payload: EmailPayload) {
  const { to, subject, html } = payload

  // 使用环境变量配置发件人，如果未设置则使用默认值
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"

  try {
    const client = getResendClient()
    const data = await client.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    })

    console.log("Email sent successfully:", { to, subject, data })
    return { success: true, data }
  } catch (error) {
    console.error("Failed to send email:", error)
    console.error("Email details:", { from: fromEmail, to, subject })
    throw error
  }
}
