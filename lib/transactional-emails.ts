import { routing } from "@/i18n/routing"

import { resolveAppUrl } from "@/lib/app-url"
import type { DirectoryTier } from "@/lib/directory-tiers"
import { sendEmail } from "@/lib/email"

interface BasicUser {
  email: string
  name: string | null
}

// Escape user-supplied strings before interpolating into HTML email
// bodies. Project names, customer names, and URLs all originate
// from user input — without escaping, a name like
// `<img onerror=alert(1)>` would execute in HTML-rendering email
// clients (Gmail web, Outlook online, etc.).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Returns a properly-encoded URL only if it uses an http(s) scheme
// AND has no embedded credentials. Anything else (`javascript:`,
// `data:`, malformed, `https://user:pass@…`) returns null so
// callers can render the URL as plain text instead of a clickable
// link. Belt-and-braces for project URLs that may have skipped
// validation upstream.
function safeHttpUrl(raw: string): string | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    // Reject user:pass embedded URLs — they would render in
    // emails and leak credentials, and there's no legitimate
    // reason for a project's marketing URL to carry auth.
    if (u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

function getBadgeName(ranking: number): string {
  switch (ranking) {
    case 1:
      return `Top 1 Winner`
    case 2:
      return `Top 2 Winner`
    case 3:
      return `Top 3 Winner`
    default:
      return `Winner`
  }
}

export async function sendWinnerBadgeEmail({
  projectName,
  projectSlug,
  ranking,
  user,
  launchType,
}: {
  user: BasicUser
  ranking: number
  projectName: string
  projectSlug: string
  launchType: string | null
}) {
  const badgeName = getBadgeName(ranking)
  const effectiveUserName = escapeHtml(user.name || "Winner")
  const effectiveUserEmail = user.email
  const isPremium = launchType === "premium" || launchType === "premium_plus"
  const safeProjectName = escapeHtml(projectName)
  const safeProjectSlug = encodeURIComponent(projectSlug)

  const projectBadgesPageUrl = `${resolveAppUrl()}/projects/${safeProjectSlug}/badges`

  // `projectName` in the subject line is rendered as plain text by
  // every mail client, so no HTML escape needed there. Only escape
  // when it lands inside HTML body markup.
  const subject = `🏆 ${projectName} is a Top ${ranking} Winner!`

  // Message différent selon le type de lancement
  const dofollowMailtoSubject = encodeURIComponent(`Dofollow Request - ${projectName}`)
  const doFollowMessage = isPremium
    ? `<p><strong>🎉 Dofollow Backlink:</strong> Congrats! You automatically earned a dofollow backlink as a premium winner.</p>`
    : `<p><strong>🔗 Dofollow Backlink:</strong> Add your badge to your website and <a href="mailto:contact@aat.ee?subject=${dofollowMailtoSubject}&body=Hi, I placed the badge on my website. Here's the URL: [YOUR_WEBSITE_URL]">email us your site URL</a> to activate your dofollow link!</p>`

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="font-size: 24px; color: #1a1a1a;">Hi ${effectiveUserName} 👋</h1>
      <p><strong>${safeProjectName}</strong> is a <strong>${badgeName}</strong> on aat.ee!</p>

      <p style="text-align: center; margin: 25px 0;">
        <a href="${projectBadgesPageUrl}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
          🏆 Get Your Badge
        </a>
      </p>

      ${doFollowMessage}

      <p style="margin-top: 25px;">Congrats! 🎉<br>Eric</p>
    </div>
  `

  return sendEmail({
    to: effectiveUserEmail,
    subject,
    html: htmlBody,
  })
}

export async function sendLaunchReminderEmail({
  projectName,
  projectSlug,
  user,
}: {
  user: BasicUser
  projectName: string
  projectSlug: string
}) {
  const effectiveUserName = escapeHtml(user.name || "Creator")
  const effectiveUserEmail = user.email
  const safeProjectName = escapeHtml(projectName)
  const safeProjectSlug = encodeURIComponent(projectSlug)

  const subject = `🚀 ${projectName} is Live on aat.ee!`
  const projectUrl = `${resolveAppUrl()}/projects/${safeProjectSlug}`

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="font-size: 22px; color: #1a1a1a;">Hi ${effectiveUserName},</h1>
      <p>Just a quick heads-up: your project, <strong>${safeProjectName}</strong>, is launching today on aat.ee!</p>
      <p>We hope you had a great launch day!</p>
      <p>You can view your project live here: <a href="${projectUrl}">${projectUrl}</a></p>
      <p style="margin-top: 25px;">Best of luck!</p>
      <p>The aat.ee Team</p>
    </div>
  `

  return sendEmail({
    to: effectiveUserEmail,
    subject,
    html: htmlBody,
  })
}

// Per-tier copy for the buyer confirmation email. Subject and the
// "What's next" timeline differ; the rest of the email is shared.
//
// TODO: site names ("HiCyou, MF8.BIZ, BigKr") and counts are
// hardcoded here. The authoritative list lives in `lib/dr.ts`
// (DR_DOMAINS_PLUS / DR_DOMAINS_PRO). When the network expands or
// renames a partner site, this copy goes stale silently. Either
// derive from the constants (needs a domain→displayName map) or
// keep the strings minimal enough that drift doesn't matter.
const BUYER_TIER_COPY: Record<
  DirectoryTier,
  { subjectSuffix: string; timeline: string; extra?: string }
> = {
  basic: {
    subjectSuffix: "is now listed on aat.ee",
    timeline:
      "Your listing is live on <strong>aat.ee</strong> right now — your dofollow backlink is already passing authority. No further action needed.",
  },
  plus: {
    subjectSuffix: "Plus order confirmed",
    // Original copy promised a per-site go-live email — we don't
    // currently have that flow wired, so soften to "we'll be in
    // touch when fulfilment is complete" to avoid a false promise.
    timeline:
      '<strong>aat.ee</strong> goes live within 1 business day. Your other 3 directory placements (HiCyou, MF8.BIZ, BigKr) roll out within 3 business days. Reach out to <a href="mailto:contact@aat.ee">contact@aat.ee</a> if anything looks off.',
  },
  pro: {
    subjectSuffix: "Pro order confirmed",
    timeline:
      '<strong>aat.ee</strong> goes live within 1 business day. The other 11 placements (3 directories + 8 high-DR documentation sites) roll out within 3 business days. Reach out to <a href="mailto:contact@aat.ee">contact@aat.ee</a> if anything looks off.',
  },
  ultra: {
    subjectSuffix: "Ultra subscription active",
    timeline:
      "Everything in Pro rolls out as above, AND your <strong>sponsor card is now visible in the sidebar across the network</strong>. The sidebar updates within an hour of payment.",
    extra:
      "You can cancel or update payment method anytime from your dashboard — see the <em>Manage subscription</em> button next to your project.",
  },
}

/**
 * Confirmation email to the buyer after a directory listing
 * purchase. Best-effort: a send failure should NOT bubble up to
 * the webhook handler (Stripe would retry forever otherwise).
 *
 * Sent for every tier including Basic — Basic auto-fulfils so the
 * email doubles as a "your listing is live" notice.
 */
export async function sendBuyerDirectoryOrderConfirmation({
  buyerEmail,
  buyerName,
  tier,
  projectName,
  websiteUrl,
  amount,
  currency,
  locale,
}: {
  buyerEmail: string
  buyerName: string | null
  tier: DirectoryTier
  projectName: string
  websiteUrl: string
  amount: number
  currency: string
  // Buyer's checkout-time locale (captured on directory_order). When
  // omitted (older rows pre-locale column) we fall through to the
  // default locale and the link lands on the English dashboard.
  locale?: string | null
}) {
  const copy = BUYER_TIER_COPY[tier]
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1)
  const safeProjectName = escapeHtml(projectName)
  const greeting = escapeHtml(buyerName?.trim() || "there")
  // Subject lines are sanitised (CRLF stripped) inside `sendEmail`
  // — no HTML escape needed since clients render subject as text.
  const subject = `✅ ${projectName} — ${copy.subjectSuffix}`
  // With `localePrefix: "as-needed"`, the default locale carries no
  // path prefix; everything else gets `/<locale>`. Skip the prefix
  // for unknown locale values too — defensive against drift.
  const validLocales = routing.locales as readonly string[]
  const localePath =
    locale && locale !== routing.defaultLocale && validLocales.includes(locale) ? `/${locale}` : ""
  const dashboardUrl = `${resolveAppUrl()}${localePath}/dashboard`

  // If the project URL isn't a valid http(s) URL, render it as
  // plain text rather than an exploitable `<a href>`.
  const safeUrl = safeHttpUrl(websiteUrl)
  const urlHtml = safeUrl
    ? `<a href="${safeUrl}">${escapeHtml(safeUrl)}</a>`
    : escapeHtml(websiteUrl)

  const safeCurrency = escapeHtml(currency.toUpperCase())

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="font-size: 22px; color: #1a1a1a;">Hi ${greeting} 👋</h1>
      <p>Thanks for purchasing <strong>Directory ${tierLabel}</strong> for <strong>${safeProjectName}</strong>.</p>

      <div style="background-color: #f8f9fa; border-left: 4px solid #28a745; padding: 12px 16px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Amount:</strong> ${amount.toFixed(2)} ${safeCurrency}</p>
        <p style="margin: 6px 0 0 0;"><strong>URL:</strong> ${urlHtml}</p>
      </div>

      <h2 style="font-size: 16px; margin-top: 28px; color: #1a1a1a;">What happens next</h2>
      <p>${copy.timeline}</p>

      ${copy.extra ? `<p>${copy.extra}</p>` : ""}

      <p style="text-align: center; margin: 28px 0;">
        <a href="${dashboardUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Open dashboard
        </a>
      </p>

      <p style="color: #666; font-size: 13px; margin-top: 28px;">
        Questions? Reply to this email or write to <a href="mailto:contact@aat.ee">contact@aat.ee</a>.
      </p>
      <p style="color: #666; font-size: 12px; margin-top: 6px;">
        Stripe sent a separate receipt for your records.
      </p>
    </div>
  `

  return sendEmail({
    to: buyerEmail,
    subject,
    html: htmlBody,
    // Buyer should be able to hit "Reply" and reach support, not
    // the noreply Resend sender. `sendEmail` itself falls back to
    // `RESEND_REPLY_TO` env when omitted; the literal here is the
    // floor for environments that haven't set the env yet.
    replyTo: "contact@aat.ee",
  })
}

export async function sendAdminPaymentNotification({
  userEmail,
  amount,
  currency,
  projectName,
  websiteUrl,
  orphan = false,
}: {
  userEmail: string
  amount: number
  currency: string
  projectName: string
  websiteUrl: string
  /**
   * Webhook couldn't find a matching project/order. Swaps the email
   * styling from green "✅ paid" to amber "⚠️ needs attention" so the
   * admin can triage refunds / manual fulfilment quickly.
   */
  orphan?: boolean
}) {
  const adminEmail = process.env.ADMIN_EMAIL || "cjwbbs@gmail.com"
  const safeCurrency = escapeHtml(currency.toUpperCase())
  const safeProjectName = escapeHtml(projectName)
  const safeUserEmail = escapeHtml(userEmail)
  const safeUrl = safeHttpUrl(websiteUrl)
  const websiteCell = safeUrl
    ? `<a href="${safeUrl}">${escapeHtml(safeUrl)}</a>`
    : escapeHtml(websiteUrl)

  const subject = orphan
    ? `⚠️ ORPHAN PAYMENT: ${amount} ${currency.toUpperCase()} — ${projectName}`
    : `💰 New Payment: ${amount} ${currency.toUpperCase()} - ${projectName}`
  const heading = orphan ? "Orphan Payment — needs review ⚠️" : "New Payment Received! 💰"
  const accentColor = orphan ? "#d97706" : "#28a745" // amber-600 vs green-600

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="font-size: 22px; color: #1a1a1a;">${heading}</h1>

      <div style="background-color: #f8f9fa; border-left: 4px solid ${accentColor}; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; font-size: 18px; font-weight: bold;">
          Amount: ${amount} ${safeCurrency}
        </p>
        ${orphan ? `<p style="margin: 8px 0 0; color: #92400e; font-size: 13px;">Stripe charged the buyer but no project/order matched — review in Stripe Dashboard and either refund or backfill.</p>` : ""}
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Project:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${safeProjectName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Website:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${websiteCell}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>User Email:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${safeUserEmail}</td>
        </tr>
      </table>

      <p style="margin-top: 25px; color: #666; font-size: 12px;">
        This is an automated notification from your Open Launch system.
      </p>
    </div>
  `

  return sendEmail({
    to: adminEmail,
    subject,
    html: htmlBody,
  })
}
