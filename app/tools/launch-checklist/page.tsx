"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { RiArrowLeftLine, RiRefreshLine } from "@remixicon/react"

import { PillButton } from "@/components/ds/pill-button"
import { SerifHeading } from "@/components/ds/serif-heading"
import { SoftCard } from "@/components/ds/soft-card"

const STORAGE_KEY = "aat-tools-launch-checklist-v1"

/**
 * Grouped by when the work happens, because that is how a launch is actually
 * run — the useful question is "what is left before I submit", not "what is
 * left overall".
 */
const GROUPS: { title: string; items: string[] }[] = [
  {
    title: "Before you submit",
    items: [
      "The landing page explains what the product does in one sentence",
      "A visitor can sign up or buy without waiting for you",
      "Pricing is published, including what the free tier does not include",
      "The site works on a phone, on a slow connection",
      "Title, description and social image are set — check them in the generator",
      "Analytics is installed and you have looked at it once",
    ],
  },
  {
    title: "On launch day",
    items: [
      "You are reachable for the first few hours to answer comments",
      "The launch post says what it does and who it is for, not how it was built",
      "You have somewhere to send people: a changelog, a demo, or a waitlist",
      "You know which number matters today, and it is not the upvote count",
    ],
  },
  {
    title: "After launch",
    items: [
      "Every comment gets an answer, even the critical one",
      "You wrote down what the traffic actually did",
      "The people who signed up heard from you within a week",
    ],
  },
]

const ALL_ITEMS = GROUPS.flatMap((group) => group.items)

export default function LaunchChecklistPage() {
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [ready, setReady] = useState(false)

  // Read once on mount. Guarded because a browser with storage disabled throws
  // on access rather than returning null.
  //
  // The effect-then-setState shape is deliberate: localStorage does not exist
  // during the server render, so seeding state in a `useState` initialiser
  // would produce markup that differs from the client's and fail hydration.
  // `useSyncExternalStore` would also work and would satisfy the rule, at the
  // cost of a subscribe/parse pair for a value that changes once per mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
          setChecked(new Set(parsed.filter((item): item is string => typeof item === "string")))
        }
      }
    } catch {
      // Storage unavailable — the checklist still works, it just forgets.
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...checked]))
    } catch {
      // Same as above: persistence is a convenience, not a requirement.
    }
  }, [checked, ready])

  const done = checked.size
  const total = ALL_ITEMS.length
  const percent = useMemo(() => Math.round((done / total) * 100), [done, total])

  const toggle = (item: string) =>
    setChecked((previous) => {
      const next = new Set(previous)
      if (next.has(item)) next.delete(item)
      else next.add(item)
      return next
    })

  return (
    <div className="bg-secondary/20 min-h-screen">
      <div className="container mx-auto max-w-3xl px-4 pt-8 pb-12">
        <Link
          href="/tools"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <RiArrowLeftLine className="h-4 w-4" aria-hidden="true" />
          All tools
        </Link>

        <div className="mb-6 space-y-2">
          <SerifHeading as="h1" size="section">
            Launch-day checklist
          </SerifHeading>
          <p className="text-muted-foreground text-sm">
            {total} things worth getting right. Ticks are stored in this browser only.
          </p>
        </div>

        <SoftCard padding="md" className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div
                className="bg-home-surface-muted h-2 w-full overflow-hidden rounded-full"
                role="progressbar"
                aria-valuenow={done}
                aria-valuemin={0}
                aria-valuemax={total}
                aria-label={`${done} of ${total} done`}
              >
                <div
                  className="bg-home-accent h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-2 text-xs tabular-nums">
                {done} of {total} done
              </p>
            </div>
            <PillButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setChecked(new Set())}
              disabled={done === 0}
            >
              <RiRefreshLine className="h-4 w-4" aria-hidden="true" />
              Reset
            </PillButton>
          </div>
        </SoftCard>

        <div className="space-y-6">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <SerifHeading as="h2" size="card" className="mb-3">
                {group.title}
              </SerifHeading>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isChecked = checked.has(item)
                  return (
                    <li key={item}>
                      <label className="hover:bg-home-surface-muted flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggle(item)}
                          className="accent-home-accent mt-0.5 h-4 w-4 flex-shrink-0"
                        />
                        <span
                          className={
                            isChecked
                              ? "text-muted-foreground text-sm line-through"
                              : "text-foreground text-sm"
                          }
                        >
                          {item}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
