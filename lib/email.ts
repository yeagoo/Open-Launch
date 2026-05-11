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
  // Optional reply-to. When omitted, falls back to
  // `RESEND_REPLY_TO` env (typical: contact@aat.ee). This way
  // users who hit "Reply" land in support instead of the noreply
  // sender that Resend uses by default.
  replyTo?: string
}

/**
 * Sends an email using Resend
 * @param payload - Email configuration object
 * @returns Promise that resolves when email is sent
 */
export async function sendEmail(payload: EmailPayload) {
  const { to, html, replyTo } = payload

  // Strip CR/LF from the subject before passing to the SDK. Project
  // names (interpolated by callers into the subject) come from
  // user-submitted DB rows; without this, a name containing
  // `\r\nBcc: attacker@…` could inject extra SMTP headers. Belt-
  // and-braces: Resend's SDK normalises too, but defending here
  // protects every caller in one place.
  const subject = sanitizeHeader(payload.subject)

  // 使用环境变量配置发件人，如果未设置则使用默认值
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
  const effectiveReplyTo = replyTo ?? process.env.RESEND_REPLY_TO ?? null

  try {
    const client = getResendClient()
    const data = await client.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
      ...(effectiveReplyTo ? { replyTo: effectiveReplyTo } : {}),
    })

    console.log("Email sent successfully:", { to, subject, data })
    return { success: true, data }
  } catch (error) {
    console.error("Failed to send email:", error)
    console.error("Email details:", { from: fromEmail, to, subject })
    throw error
  }
}

// Collapse CR/LF (and tab, which some MTAs treat as folding
// whitespace) to single spaces. Used on header-bound fields like
// the subject so attacker-controlled content can't inject
// additional SMTP headers.
function sanitizeHeader(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").trim()
}
