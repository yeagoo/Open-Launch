import { Link } from "@/i18n/navigation"

import { cn } from "@/lib/utils"

export interface HomeTimeTab {
  key: string
  label: string
  href: string
}

interface TimeTabsProps {
  tabs: HomeTimeTab[]
  activeKey: string
  /** Already-translated landmark label for the tab list. */
  ariaLabel: string
  /** Right-aligned slot — the "Daily archives" link in the reference layout. */
  trailing?: React.ReactNode
}

/**
 * Daily / Weekly / Monthly switcher for the home feed.
 *
 * Rendered as links rather than a client-side tab state: the three windows are
 * genuinely different server queries, so a tab click should produce a real
 * navigation (shareable URL, cached RSC payload) instead of fetching
 * everything up front.
 */
export function TimeTabs({ tabs, activeKey, ariaLabel, trailing }: TimeTabsProps) {
  return (
    <div className="border-home-hairline flex items-center justify-between gap-3 border-b pb-3">
      <nav aria-label={ariaLabel} className="flex items-center gap-1">
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey
          const classes = cn(
            "rounded-home-pill px-3 py-1.5 text-sm font-medium transition-colors",
            isActive
              ? "bg-home-accent-soft text-home-accent-strong"
              : "text-muted-foreground hover:bg-home-surface-muted hover:text-foreground",
          )
          // The active tab points at the URL you are already on. Rendering it
          // as a link made Next prefetch the current page (twice on the home
          // route), which is pure wasted round-trips on the critical path — and
          // "a link to here" is the wrong semantics anyway.
          return isActive ? (
            <span key={tab.key} aria-current="page" className={classes}>
              {tab.label}
            </span>
          ) : (
            <Link key={tab.key} href={tab.href} className={classes}>
              {tab.label}
            </Link>
          )
        })}
      </nav>
      {trailing && <div className="flex-shrink-0">{trailing}</div>}
    </div>
  )
}
