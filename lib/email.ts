import { fetchWithTimeout, withTimeout } from "@/lib/fetch-timeout"

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

interface ResendSendSuccess {
  id: string
}

interface ResendSendError {
  message?: string
  name?: string
}

const RESEND_API_URL = "https://api.resend.com/emails"
const RESEND_TIMEOUT_MS = 10_000

/**
 * Sends an email using Resend's REST API.
 *
 * Do not use the `resend` SDK here: it currently calls global `fetch`, and
 * aborting/cancelling fetch-backed WebStreams is the production Node 22 SSR
 * crash trigger (`controller[kState].transformAlgorithm is not a function`).
 * @param payload - Email configuration object
 * @returns Promise that resolves when email is sent
 */
export async function sendEmail(payload: EmailPayload) {
  const { to, html, replyTo } = payload

  // Strip CR/LF from the subject before passing it to Resend. Project
  // names (interpolated by callers into the subject) come from
  // user-submitted DB rows; without this, a name containing
  // `\r\nBcc: attacker@…` could inject extra SMTP headers. Defending here
  // protects every caller in one place.
  const subject = sanitizeHeader(payload.subject)

  // 使用环境变量配置发件人，如果未设置则使用默认值
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev"
  const effectiveReplyTo = replyTo ?? process.env.RESEND_REPLY_TO ?? null

  try {
    const data = await sendResendEmail({
      apiKey: getResendApiKey(),
      from: fromEmail,
      to,
      subject,
      html,
      replyTo: effectiveReplyTo,
    })

    console.log("Email sent successfully:", { to, subject, id: data?.id })
    return { success: true, data }
  } catch (error) {
    console.error("Failed to send email:", error)
    console.error("Email details:", { from: fromEmail, to, subject })
    throw error
  }
}

function getResendApiKey(): string {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable")
  }
  return apiKey
}

async function sendResendEmail(payload: {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
  replyTo: string | null
}): Promise<ResendSendSuccess> {
  const deadline = Date.now() + RESEND_TIMEOUT_MS
  const response = await fetchWithTimeout(
    RESEND_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${payload.apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "aat.ee/1.0",
      },
      body: JSON.stringify({
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
      }),
      redirect: "error",
    },
    RESEND_TIMEOUT_MS,
    "Resend email API",
  )

  const remaining = Math.max(1, deadline - Date.now())
  const rawText = await withTimeout(response.text(), remaining, "Resend email API body")
  const parsed = parseResendJson(rawText)

  if (!response.ok) {
    const error = parsed as ResendSendError | null
    throw new Error(`Resend API error: ${error?.message ?? error?.name ?? response.statusText}`)
  }

  if (!isResendSendSuccess(parsed)) {
    throw new Error("Resend API error: invalid success response")
  }

  return parsed
}

function parseResendJson(rawText: string): unknown {
  try {
    return rawText ? JSON.parse(rawText) : null
  } catch {
    return null
  }
}

function isResendSendSuccess(value: unknown): value is ResendSendSuccess {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string"
  )
}

// Collapse CR/LF (and tab, which some MTAs treat as folding
// whitespace) to single spaces. Used on header-bound fields like
// the subject so attacker-controlled content can't inject
// additional SMTP headers.
function sanitizeHeader(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").trim()
}
