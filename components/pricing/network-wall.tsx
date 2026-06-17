/**
 * The finalized "scrolling chips wall" (v6 display type 01):
 *   - Directory network: static chips, sorted by DR (high→low),
 *     DR ≥ 35 highlighted orange.
 *   - Authority network: three rows auto-scrolling horizontally (slow,
 *     seamless, pause-on-hover, reduced-motion safe), DR > 30 orange.
 *
 * Server component — fetches its own DR from the cache. Drop it on any
 * pricing page: `<NetworkWall lang={lang} />`.
 */
import type { DRRecord } from "@/lib/dr-domains"
import { AUTHORITY_NETWORK, DIRECTORY_NETWORK } from "@/lib/site-network"

type Lang = "en" | "zh"

// DR highlight thresholds & tints — directory ≥ 35, authority > 30,
// both orange.
const DIR_DR_HIGHLIGHT = 35
const AUTH_DR_HIGHLIGHT = 30
const PRIMARY_PILL = "bg-primary/10 text-primary"
const ORANGE_PILL = "bg-orange-500/15 text-orange-600 dark:bg-orange-400/15 dark:text-orange-400"

function dirTint(dr: number | null): string {
  return dr !== null && dr >= DIR_DR_HIGHLIGHT ? ORANGE_PILL : PRIMARY_PILL
}
function authTint(dr: number | null): string {
  return dr !== null && dr > AUTH_DR_HIGHLIGHT ? ORANGE_PILL : PRIMARY_PILL
}

const MARQUEE_CSS = `
@keyframes netwall-marquee-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.netwall-marquee {
  animation-name: netwall-marquee-x;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  will-change: transform;
}
@media (prefers-reduced-motion: reduce) {
  .netwall-marquee { animation: none; }
}
`

// Distribute items round-robin into N rows (even spread, varied order).
function splitIntoRows<T>(arr: T[], rows: number): T[][] {
  const out: T[][] = Array.from({ length: rows }, () => [])
  arr.forEach((item, i) => out[i % rows].push(item))
  return out
}

// Repeat a short list until two copies of it always overflow the
// container, so the seamless -50% loop never reveals a gap.
function padToWidth<T>(arr: T[], min: number): T[] {
  if (arr.length === 0) return arr
  const out = [...arr]
  while (out.length < min) out.push(...arr)
  return out
}

// One auto-scrolling row. Renders its children twice; the track shifts
// by exactly one copy (-50%) on an infinite linear loop, so the motion
// is seamless. Pauses on hover; respects prefers-reduced-motion.
function Marquee({
  children,
  duration,
  reverse,
}: {
  children: React.ReactNode
  duration: number
  reverse: boolean
}) {
  return (
    <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]">
      <div
        className="netwall-marquee flex w-max group-hover:[animation-play-state:paused]"
        style={{
          animationDuration: `${duration}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        <div className="flex shrink-0 items-center gap-2 pr-2">{children}</div>
        <div className="flex shrink-0 items-center gap-2 pr-2" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}

export function NetworkWall({
  lang,
  records,
  dirLabel,
  authLabel,
}: {
  lang: Lang
  records: DRRecord[]
  dirLabel: string
  authLabel: string
}) {
  const drMap = new Map(records.map((r) => [r.domain, r.dr]))
  const dr = (domain: string): number | null => drMap.get(domain) ?? null

  // Directory: highest DR first.
  const directory = [...DIRECTORY_NETWORK].sort(
    (a, b) => (dr(b.domain) ?? -1) - (dr(a.domain) ?? -1),
  )
  const authorityRows = splitIntoRows(AUTHORITY_NETWORK, 3)

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: MARQUEE_CSS }} />

      {/* Directory — static chips, sorted by DR */}
      <p className="text-muted-foreground/80 mb-3 font-mono text-[11px] tracking-wider uppercase">
        {dirLabel}
      </p>
      <div className="mb-8 flex flex-wrap gap-2">
        {directory.map((s) => (
          <span
            key={s.domain}
            className="border-border/70 inline-flex items-center gap-2 rounded-full border py-1 pr-1.5 pl-3 text-sm"
          >
            <span className="font-medium">{s.brand}</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums ${dirTint(dr(s.domain))}`}
            >
              DR {dr(s.domain) ?? "—"}
            </span>
          </span>
        ))}
      </div>

      {/* Authority — three slow auto-scrolling rows */}
      <p className="text-muted-foreground/80 mb-3 font-mono text-[11px] tracking-wider uppercase">
        {authLabel}
      </p>
      <div className="space-y-2.5">
        {authorityRows.map((row, ri) => (
          <Marquee key={ri} duration={150 + ri * 20} reverse={ri % 2 === 0}>
            {padToWidth(row, 10).map((s, i) => (
              <span
                key={`${s.domain}-${i}`}
                className="border-border/70 inline-flex shrink-0 items-center gap-2 rounded-full border py-1 pr-1.5 pl-3 text-sm"
              >
                <span className="font-mono text-xs">{s.domain}</span>
                <span className="text-muted-foreground text-[11px]">{s.topic[lang]}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums ${authTint(dr(s.domain))}`}
                >
                  DR {dr(s.domain) ?? "—"}
                </span>
              </span>
            ))}
          </Marquee>
        ))}
      </div>
    </div>
  )
}
