import { project as projectSchema } from "@/drizzle/db/schema"
import { RiExternalLinkLine } from "@remixicon/react"
import { useTranslations } from "next-intl"

import { getProjectWebsiteRelAttribute } from "@/lib/link-utils"

type ProjectRow = typeof projectSchema.$inferSelect

interface VisitWebsiteCardProps {
  websiteUrl: string
  // Pulled from the schema so the types line up with
  // getProjectWebsiteRelAttribute without `as never` escape hatches.
  // The helper applies detail-page dofollow rules (top-3 rank or badge
  // verified → dofollow, otherwise nofollow).
  launchStatus: ProjectRow["launchStatus"]
  launchType: ProjectRow["launchType"]
  dailyRanking: ProjectRow["dailyRanking"]
  hasBadgeVerified: boolean
  isLowQuality: boolean
}

/**
 * Prominent "Visit Website" call-to-action. Lives high in the sidebar
 * so the website link doesn't get lost between metadata rows.
 *
 * Strips the protocol from the displayed URL ("notion.so" beats
 * "https://www.notion.so/") so it scans like a label not a copy-pasted
 * link.
 */
export function VisitWebsiteCard({
  websiteUrl,
  launchStatus,
  launchType,
  dailyRanking,
  hasBadgeVerified,
  isLowQuality,
}: VisitWebsiteCardProps) {
  const t = useTranslations("project.sidebar")
  const rel = getProjectWebsiteRelAttribute(
    { launchStatus, launchType, dailyRanking, hasBadgeVerified, isLowQuality },
    { isDetailPage: true },
  )

  let displayHost = websiteUrl
  try {
    const u = new URL(websiteUrl)
    displayHost = u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname)
  } catch {
    // Keep the raw string if it's not a valid URL — better than nothing.
  }

  return (
    <a
      href={websiteUrl}
      target="_blank"
      rel={rel}
      className="group bg-primary text-primary-foreground hover:bg-primary/90 block rounded-lg p-4 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t("visitWebsite")}</p>
          <p className="mt-0.5 truncate text-xs opacity-80">{displayHost}</p>
        </div>
        <RiExternalLinkLine className="h-5 w-5 flex-shrink-0 transition-transform group-hover:translate-x-0.5" />
      </div>
    </a>
  )
}
