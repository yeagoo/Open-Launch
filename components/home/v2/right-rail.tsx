import Image from "next/image"

import { Link } from "@/i18n/navigation"
import { RiFlashlightLine } from "@remixicon/react"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"
import { TagPill } from "@/components/ds/tag-pill"
import { SearchCommandLazy } from "@/components/layout/search-command-lazy"
import { SidebarExplore } from "@/components/layout/sidebar-explore"

export interface HomeCategoryLink {
  id: string
  name: string
  count: number
}

export interface RightRailLabels {
  submitCta: string
  topCategories: string
  quickAccess: string
  trendingNow: string
  dailyWinners: string
  bestOfMonth: string
  /** The legacy home's "Yesterday's Launches →" entry point; without it
   *  /trending?filter=yesterday loses its only link from the home page. */
  yesterdayLaunches: string
  dashboard: string
  linuxAlliance: string
  linuxAllianceFooter: string
  recommended: string
  webcasaDesc: string
  litehttpdDesc: string
  viewAll: string
  /** "{count} projects" — pre-interpolated by the caller. */
  renderProjectCount: (count: number) => string
}

interface RightRailProps {
  labels: RightRailLabels
  isAuthenticated: boolean
  categories: HomeCategoryLink[]
}

const ALLIANCE_SITES = [
  { name: "Debian.Club", href: "https://debian.club/" },
  { name: "Ubuntu.Fan", href: "https://ubuntu.fan/" },
  { name: "RunEntLinux", href: "https://runentlinux.com/" },
  { name: "AlmaLinuxCN", href: "https://www.almalinux.com.cn/" },
] as const

const RECOMMENDED_SITES = [
  { name: "WebCasa", href: "https://web.casa" },
  { name: "LiteHTTPD", href: "https://litehttpd.com" },
] as const

/**
 * Right rail: search, the submit CTA, partner logos, then the link blocks the
 * legacy two-column home kept in its sidebar (top categories, quick access,
 * Explore, the Linux docs alliance and the two recommended sites).
 *
 * Those blocks are carried over verbatim on purpose. They are the home page's
 * main source of internal links to /categories, /compare and /alternatives, so
 * dropping them for visual tidiness would have been a silent SEO regression.
 */
export function RightRail({ labels, isAuthenticated, categories }: RightRailProps) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <SearchCommandLazy isAuthenticated={isAuthenticated} />
        <PillButton asChild full>
          <Link href="/projects/submit">
            <RiFlashlightLine aria-hidden="true" />
            {labels.submitCta}
          </Link>
        </PillButton>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <SerifHeading as="h2" size="eyebrow">
            {labels.topCategories}
          </SerifHeading>
          <Link
            href="/categories"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            {labels.viewAll}
          </Link>
        </div>
        <div className="space-y-1">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/categories?category=${category.id}`}
              className="hover:bg-home-surface-muted -mx-2 flex items-center justify-between gap-2 rounded-md p-2 transition-colors"
            >
              <span className="truncate text-[13px]">{category.name}</span>
              <TagPill>{labels.renderProjectCount(category.count)}</TagPill>
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <SerifHeading as="h2" size="eyebrow">
          {labels.quickAccess}
        </SerifHeading>
        <div className="flex flex-col">
          {isAuthenticated && (
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground py-1 text-[13px]"
            >
              {labels.dashboard}
            </Link>
          )}
          <Link
            href="/trending"
            className="text-muted-foreground hover:text-foreground py-1 text-[13px]"
          >
            {labels.trendingNow}
          </Link>
          <Link
            href="/trending?filter=yesterday"
            className="text-muted-foreground hover:text-foreground py-1 text-[13px]"
          >
            {labels.yesterdayLaunches}
          </Link>
          <Link
            href="/winners"
            className="text-muted-foreground hover:text-foreground py-1 text-[13px]"
          >
            {labels.dailyWinners}
          </Link>
          <Link
            href="/trending?filter=month"
            className="text-muted-foreground hover:text-foreground py-1 text-[13px]"
          >
            {labels.bestOfMonth}
          </Link>
        </div>
      </div>

      <SidebarExplore />

      <div className="space-y-2">
        <SerifHeading as="h2" size="eyebrow">
          {labels.linuxAlliance}
        </SerifHeading>
        <div className="flex flex-col">
          {ALLIANCE_SITES.map((site) => (
            <a
              key={site.href}
              href={site.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground py-1 text-[13px]"
            >
              {site.name}
            </a>
          ))}
        </div>
        <p className="text-muted-foreground text-[11px] leading-snug">
          {labels.linuxAllianceFooter}
          <a
            href="https://eol.wiki/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-home-accent-strong ml-1 underline underline-offset-2"
          >
            EOL.Wiki
          </a>
        </p>
      </div>

      <div className="space-y-2">
        <SerifHeading as="h2" size="eyebrow">
          {labels.recommended}
        </SerifHeading>
        <div className="space-y-2">
          {RECOMMENDED_SITES.map((site) => (
            <a
              key={site.href}
              href={site.href}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:bg-home-surface-muted -mx-2 block rounded-md p-2 transition-colors"
            >
              <span className="block text-[13px] font-medium">{site.name}</span>
              <span className="text-muted-foreground block text-[11px] leading-snug">
                {site.name === "WebCasa" ? labels.webcasaDesc : labels.litehttpdDesc}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Carried over from the legacy sidebar verbatim. It is an existing
          placement, not decoration — silently dropping it in the redesign
          would have retired someone's promo slot. */}
      <Image
        src="/images/img1.png"
        alt="build for joy"
        width={960}
        height={540}
        sizes="(max-width: 1024px) 100vw, 300px"
        className="rounded-home-card h-auto w-full"
      />
    </div>
  )
}
