"use client"

import * as React from "react"

interface LaunchCountdownProps {
  /** ISO timestamp of the next launch-window boundary. */
  targetIso: string
  /** Already-translated prefix, e.g. "New launches in". */
  label: string
  /** BCP-47 tag used for the localized unit suffixes ("20h" / "20 時間"). */
  locale: string
}

interface Remaining {
  hours: number
  minutes: number
  seconds: number
}

function remainingUntil(targetIso: string, now: number): Remaining | null {
  const target = Date.parse(targetIso)
  if (!Number.isFinite(target)) return null
  const diff = target - now
  // Past the boundary the caller should have re-rendered with the next window;
  // showing a negative countdown would be worse than showing nothing.
  if (diff <= 0) return null
  const totalSeconds = Math.floor(diff / 1000)
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

/**
 * Ticking countdown to the next launch window.
 *
 * The only client component on the home page. Two things keep it cheap and
 * hydration-safe:
 *
 * 1. The first render is deliberately empty (`useState(null)`), so the server
 *    HTML and the hydration pass agree; the interval only starts on the
 *    client. Nothing here is LCP-relevant.
 * 2. Units are formatted with `Intl.NumberFormat`'s narrow unit style rather
 *    than three translated strings per locale. If the runtime lacks the unit
 *    data (slim ICU builds) it falls back to a plain "20h 42m 22s" — the same
 *    defensive pattern the legacy home page uses for date formatting.
 */
export function LaunchCountdown({ targetIso, label, locale }: LaunchCountdownProps) {
  const [remaining, setRemaining] = React.useState<Remaining | null>(null)

  React.useEffect(() => {
    const tick = () => setRemaining(remainingUntil(targetIso, Date.now()))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [targetIso])

  // Three formatters built once per locale. Deliberately NOT a lazily-filled
  // Map: mutating a value captured by render is flagged by
  // react-hooks/immutability and buys nothing here — three small objects is
  // cheaper than the bookkeeping.
  const format = React.useMemo(() => {
    const make = (unit: "hour" | "minute" | "second") => {
      try {
        const formatter = new Intl.NumberFormat(locale, {
          style: "unit",
          unit,
          unitDisplay: "narrow",
        })
        return (value: number) => formatter.format(value)
      } catch {
        // Slim ICU builds can reject a locale/unit pair; degrade to "20h"
        // rather than breaking the whole countdown.
        return (value: number) => `${value}${unit.charAt(0)}`
      }
    }
    return { hour: make("hour"), minute: make("minute"), second: make("second") }
  }, [locale])

  return (
    <p
      data-slot="launch-countdown"
      className="text-muted-foreground flex items-center gap-2 text-sm"
      aria-live="off"
    >
      <span>{label}</span>
      {/* `tabular-nums` + a reserved min-width keep the row from twitching as
          the digits change every second. */}
      <span className="text-foreground min-w-[9rem] font-mono text-sm font-semibold tabular-nums">
        {remaining
          ? `${format.hour(remaining.hours)} ${format.minute(remaining.minutes)} ${format.second(
              remaining.seconds,
            )}`
          : "—"}
      </span>
    </p>
  )
}
