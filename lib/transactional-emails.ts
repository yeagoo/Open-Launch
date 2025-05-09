import { sendEmail } from "@/lib/email"

interface BasicUser {
  email: string
  name: string | null
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://open-launch.com"

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
}: {
  user: BasicUser
  ranking: number
  projectName: string
  projectSlug: string
}) {
  const badgeName = getBadgeName(ranking)
  const effectiveUserName = user.name || "Winner"
  const effectiveUserEmail = user.email

  const projectBadgesPageUrl = `${APP_URL}/projects/${projectSlug}/badges`

  const subject = `${projectName} is an Open-Launch ${badgeName}!`

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="font-size: 22px; color: #1a1a1a;">Hi ${effectiveUserName},</h1>
      <p>Your project, <strong>${projectName}</strong>, is an Open-Launch <strong>${badgeName}</strong> today!</p>

      <p style="margin-top: 25px;">Showcase your achievement! Visit your project's badge page to get your official ${badgeName} badge and the HTML snippet to display it:</p>
      <p style="text-align: center; margin: 25px 0;">
        <a href="${projectBadgesPageUrl}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">
          Get Your Badge
        </a>
      </p>
      <p style="text-align: center; font-size: 12px; color: #777; margin-top: -10px;">(Please ensure you are logged in to access your badges.)</p>
      <p>Displaying your badge helps highlight your success and provides a valuable link back to your project on our platform.</p>
      <p>And don't forget you also earned a dofollow backlink! :)</p>

      <p style="margin-top: 25px;">Best,</p>
      <p>Eric<br>Founder of Open-Launch</p>
    </div>
  `

  return sendEmail({
    to: effectiveUserEmail,
    subject,
    html: htmlBody,
  })
}
