import { formatDistanceToNow } from "date-fns"

import type { DRRecord } from "@/lib/dr"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface DrBadgeProps {
  record: DRRecord
  // sm: pricing card stats grid (24px tall)
  // md: pricing comparison table cell (32px tall) — default
  size?: "sm" | "md"
}

/**
 * Two-pill DR badge: domain on the left, DR value on the right.
 * Both pills use the primary color so the badge feels like a single
 * branded unit rather than a generic gray label.
 *
 * Visual states:
 *   - Fresh (≤3 days): solid primary, no decoration
 *   - Stale (>3 days): same colors but a subtle outline ring + tooltip
 *     telling the reader when the data was last fetched
 *   - Missing (never fetched): "—" placeholder, muted styling, tooltip
 *     says "DR not yet fetched"
 */
export function DrBadge({ record, size = "md" }: DrBadgeProps) {
  const sizing = size === "sm" ? "h-6 text-[11px]" : "h-8 text-xs"
  const padX = size === "sm" ? "px-2" : "px-2.5"

  const hasValue = record.dr !== null
  const tooltipLabel = hasValue
    ? record.fetchedAt
      ? `Updated ${formatDistanceToNow(record.fetchedAt, { addSuffix: true })}`
      : "Fetched"
    : "DR not yet fetched"

  const valueText = hasValue ? `DR ${record.dr}` : "DR —"

  // Border ring for stale; subtle and only on the value pill so the
  // shape stays visually balanced.
  const stalenessClass =
    hasValue && !record.isFresh ? "ring-1 ring-amber-400/50 dark:ring-amber-300/40" : ""

  // Missing values get a desaturated treatment so they don't visually
  // compete with the populated ones in a list.
  const missingFill = !hasValue
    ? "bg-muted text-muted-foreground border-muted-foreground/10"
    : "bg-primary text-primary-foreground"

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-stretch overflow-hidden rounded-md border ${sizing} font-medium tabular-nums`}
            aria-label={`${record.domain} ${valueText}`}
          >
            <span
              className={`flex items-center ${padX} bg-primary/10 text-primary border-primary/20 border-r font-mono lowercase ${
                hasValue ? "" : "bg-muted text-muted-foreground border-muted-foreground/10"
              }`}
            >
              {record.domain}
            </span>
            <span className={`flex items-center ${padX} ${missingFill} ${stalenessClass}`}>
              {valueText}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <p className="text-xs">{tooltipLabel}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface DrBadgeRowProps {
  records: DRRecord[]
  size?: "sm" | "md"
}

/**
 * Convenience wrapper for laying out a row of DR badges (used on
 * the directory pricing tier cards and comparison table). Wraps to
 * multiple lines on narrow screens.
 */
export function DrBadgeRow({ records, size = "md" }: DrBadgeRowProps) {
  if (records.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {records.map((r) => (
        <DrBadge key={r.domain} record={r} size={size} />
      ))}
    </div>
  )
}

interface OverflowDrBadgeProps {
  // The hidden records we want the user to see only on hover.
  records: DRRecord[]
  // Pill text — usually "+ N+ sites" or its localised equivalent.
  // Translated upstream so we don't bake locale into this UI atom.
  label: string
  // Tooltip header, e.g. "More sites in this tier".
  tooltipHeading: string
  size?: "sm" | "md"
}

/**
 * Single-cell overflow pill that matches the DR badge sizing. On
 * hover/focus it reveals a tooltip listing every hidden site with
 * its current DR — useful for tier cards where rendering all 12 DR
 * pills would crowd the layout.
 */
export function OverflowDrBadge({
  records,
  label,
  tooltipHeading,
  size = "sm",
}: OverflowDrBadgeProps) {
  const sizing = size === "sm" ? "h-6 text-[11px] px-2" : "h-8 text-xs px-2.5"

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`bg-primary/10 text-primary border-primary/20 inline-flex items-center rounded-md border ${sizing} cursor-help font-mono font-medium`}
          >
            {label}
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="max-w-[280px] p-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            {tooltipHeading}
          </p>
          <ul className="space-y-1.5">
            {records.map((r) => (
              <li
                key={r.domain}
                className="flex items-center justify-between gap-4 text-xs tabular-nums"
              >
                <span className="font-mono">{r.domain}</span>
                <span className="text-primary font-mono font-medium">DR {r.dr ?? "—"}</span>
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
