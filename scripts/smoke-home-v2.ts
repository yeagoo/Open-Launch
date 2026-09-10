#!/usr/bin/env bun
/**
 * End-to-end smoke test for the redesigned home page (`HOME_V2=1`).
 *
 * Why this exists: the new home has never been rendered against the real
 * database. Every query in `app/actions/home.ts` was written against the schema
 * and type-checked, but type-checking cannot tell you that a join matches rows,
 * that a locale has every message key, or that a `next-intl` lookup isn't
 * silently rendering a raw key path. This script answers exactly those
 * questions, in one command, wherever the database is reachable.
 *
 * It is deliberately a *runtime* check, not a unit test: it does not import the
 * server actions (which need Next's request context for `unstable_cache`) and
 * it does not need a database client. It reads the rendered HTML.
 *
 * Usage:
 *   bun scripts/smoke-home-v2.ts --url https://www.aat.ee
 *   bun scripts/smoke-home-v2.ts --url http://localhost:3000 --locales en,zh
 *   bun scripts/smoke-home-v2.ts --file artifacts/design-preview/home-v2.html
 *
 * Exit code is non-zero when any check fails, so it can gate a deploy.
 */
import { readFileSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

/** Structural markers the shipped components emit via `data-slot`. */
/**
 * Slots that must always render, whatever the data looks like.
 */
const REQUIRED_SLOTS = ["serif-heading", "pill-button", "stat-pill", "soft-card"] as const

/**
 * Slots that only exist when there is something to show: the ranked rows need
 * projects, the wall needs logos, and the countdown needs a next launch. On an
 * empty or freshly seeded database these are legitimately absent, so asserting
 * them unconditionally would make the gate red for a data reason rather than a
 * regression — and a gate that cries wolf gets ignored.
 */
/**
 * Strings that must never appear in rendered HTML. Each one is a real failure
 * mode that has either happened or is one typo away:
 *  - `search.placeholder`: next-intl renders the key path when a namespace is
 *    missing from the provider. This actually shipped once in the right rail.
 *  - `home.v2.` / `home.sections.`: same failure for the home namespaces.
 *  - `NaN` / `undefined`: a count or a query result that never arrived.
 *  - `{count}`: an ICU placeholder that was never interpolated.
 */
const FORBIDDEN = [
  { pattern: "search.placeholder", why: "search namespace missing from the client provider" },
  { pattern: "home.v2.", why: "home.v2 message key missing for this locale" },
  { pattern: "home.sections.", why: "home.sections message key missing for this locale" },
  { pattern: ">NaN<", why: "a count rendered as NaN" },
  { pattern: ">undefined<", why: "a value that never resolved" },
  { pattern: "{count}", why: "an ICU placeholder that was not interpolated" },
  { pattern: "{rank}", why: "an ICU placeholder that was not interpolated" },
  { pattern: "upvote.", why: "upvote namespace missing from the client provider" },
  { pattern: "projectRow.", why: "projectRow namespace missing from the client provider" },
] as const

/**
 * Rendered text shaped like a next-intl key path — but anchored to the
 * namespaces this app actually has.
 *
 * When a client component calls `useTranslations(ns)` and `ns` was not handed
 * to the nearest provider, next-intl does NOT throw: it renders the key path as
 * visible text. That has happened twice here (`search` in the right rail,
 * `upvote` in the upvote button) and neither tsc nor eslint can see it.
 *
 * Matching the bare shape "word.word" was tried first and was all false
 * positives: `example.com` in a fixture URL, then `figma.com` in a project
 * description, then `aat.ee` in the footer — allow-listing them one by one is
 * whack-a-mole and would eventually hide a real leak. Anchoring on the actual
 * message namespaces is precise instead of heuristic: no domain is a namespace.
 */
const MESSAGE_NAMESPACES = Object.keys(
  JSON.parse(readFileSync(resolve(import.meta.dirname, "../messages/en.json"), "utf8")),
).filter((key) => /^[a-zA-Z][a-zA-Z0-9]*$/.test(key))

const KEY_PATH_SHAPE = new RegExp(`\\b(?:${MESSAGE_NAMESPACES.join("|")})\\.[a-zA-Z][a-zA-Z0-9.]*`)

/** Counts non-overlapping occurrences of a literal substring. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/** Whether a view rendered any ranked rows — the per-view data signal. */
function hasRankedRows(html: string): boolean {
  return countOccurrences(visibleMarkup(html), 'data-slot="rank-badge"') > 0
}

function visibleMarkup(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
}

function check(html: string, name: string, ok: boolean, detail: string): CheckResult {
  return { name, ok, detail }
}

/** Checks that apply to any rendered (or exported) home page. */
function checkMarkup(
  rawHtml: string,
  label: string,
  viewHasRows: boolean,
  heroHasData: boolean,
): CheckResult[] {
  const html = visibleMarkup(rawHtml)
  const servesV2 = html.includes('data-home-v2="true"')
  const results: CheckResult[] = [
    check(
      html,
      `${label}: serves the home v2 layout`,
      servesV2,
      servesV2 ? "data-home-v2 present" : "missing data-home-v2 — is HOME_V2=1 on the target?",
    ),
  ]

  for (const slot of REQUIRED_SLOTS) {
    const count = countOccurrences(html, `data-slot="${slot}"`)
    results.push(
      check(html, `${label}: ${slot}`, count > 0, count > 0 ? `${count}×` : "not rendered"),
    )
  }

  // `targetHasData` is computed once in main() from the canonical home page.
  // An earlier attempt inferred it here from "/projects/" and was always true,
  // because the nav links to /projects/submit.
  // Each slot is gated by the signal that actually governs it: the feed slots
  // follow THIS view's rows, the hero slots follow the hero's data (which is
  // shared across tabs).
  for (const [slot, governedBy] of [
    ["rank-badge", viewHasRows],
    ["tag-pill", viewHasRows],
    ["launch-countdown", heroHasData],
    ["home-hero-wall", heroHasData],
  ] as const) {
    const count = countOccurrences(html, `data-slot="${slot}"`)
    results.push(
      check(
        html,
        `${label}: ${slot}`,
        count > 0 || !governedBy,
        count > 0 ? `${count}×` : governedBy ? "not rendered" : "absent — nothing to render",
      ),
    )
  }

  // The feed can legitimately be empty (nothing launched in the window yet), so
  // this is reported rather than asserted — but it is the number a human needs
  // to see to know whether the run proved anything about the list.
  const rows = countOccurrences(html, 'data-slot="rank-badge"')
  results.push(
    check(
      html,
      `${label}: feed rows`,
      true,
      rows > 0
        ? `${rows} ranked rows`
        : "0 rows — empty state. Legitimate only if nothing launched yet; the list itself is unverified.",
    ),
  )

  // `checkRenderedText` already runs the FORBIDDEN list; an earlier refactor
  // left a second copy of that loop here, so every forbidden-string check was
  // reported twice and the pass total was inflated.
  results.push(...checkRenderedText(html, label))

  return results
}

/**
 * Text-level checks that apply to EVERY route: forbidden strings plus the
 * "a namespace is missing from the provider" key-path shape. Kept separate
 * from `checkMarkup`, whose structural assertions are home-page-specific and
 * would all fail on an inner page.
 */
function checkRenderedText(rawHtml: string, label: string): CheckResult[] {
  const html = visibleMarkup(rawHtml)

  const results: CheckResult[] = []

  for (const { pattern, why } of FORBIDDEN) {
    const count = countOccurrences(html, pattern)
    results.push(
      check(
        html,
        `${label}: no "${pattern}"`,
        count === 0,
        count === 0 ? "absent" : `${count}× — ${why}`,
      ),
    )
  }

  // Scanned over the markup INCLUDING attributes, not just the visible text:
  // the leak this exists for surfaces as `aria-label="upvote.label"`, which
  // stripping tags would hide. Calibrated by deliberately removing the
  // namespace from the provider and confirming this check goes red.
  // Scan only the places a leak can actually surface: visible text and the
  // label-bearing attributes an aria-label leak shows up in. Deliberately NOT
  // Only the places a leak can surface: visible text and the label-bearing
  // attributes. Namespace anchoring makes the check precise, so there is no
  // domain allow-list to maintain.
  const labelAttributes = [...html.matchAll(/\b(?:aria-label|title|alt|placeholder)="([^"]*)"/g)]
    .map((match) => match[1])
    .join(" \n ")
  const scanned = `${labelAttributes} \n ${html.replace(/<[^>]+>/g, " ")}`.replace(/\s+/g, " ")
  const keyPathLeak = scanned.match(KEY_PATH_SHAPE)

  results.push(
    check(
      html,
      `${label}: no untranslated key path`,
      !keyPathLeak,
      keyPathLeak
        ? `rendered "${keyPathLeak[0].trim()}" — a useTranslations namespace is missing from the provider`
        : "none",
    ),
  )

  return results
}

async function fetchPage(url: string): Promise<{ status: number; html: string }> {
  const response = await fetch(url, {
    headers: { "user-agent": "aat-home-v2-smoke/1.0" },
    redirect: "follow",
  })
  return { status: response.status, html: await response.text() }
}

function parseArgs(argv: string[]): { url?: string; file?: string; locales: string[] } {
  let url: string | undefined
  let file: string | undefined
  let locales = ["en", "zh", "ja", "es"]
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--url") url = argv[++i]
    else if (arg === "--file") file = argv[++i]
    else if (arg === "--locales") locales = (argv[++i] ?? "").split(",").filter(Boolean)
    else throw new Error(`unknown argument: ${arg}`)
  }
  return { url, file, locales }
}

function report(results: CheckResult[]): void {
  for (const result of results) {
    console.log(`${result.ok ? "  ok  " : " FAIL "} ${result.name} — ${result.detail}`)
  }
  const failed = results.filter((result) => !result.ok)
  console.log(`\n[smoke-home-v2] ${results.length - failed.length}/${results.length} checks passed`)
  if (failed.length > 0) {
    console.log(`[smoke-home-v2] ${failed.length} failure(s)`)
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const { url, file, locales } = parseArgs(process.argv.slice(2))
  const results: CheckResult[] = []

  if (file) {
    const html = await readFile(file, "utf8")
    const hasRows = countOccurrences(visibleMarkup(html), 'data-slot="rank-badge"') > 0
    results.push(...checkMarkup(html, file.split("/").pop() ?? file, hasRows, hasRows))
  } else {
    const base = url ?? "http://localhost:3000"

    // Every view is fetched BEFORE anything is asserted, because whether a
    // data-dependent slot is required depends on that view's own rows.
    //
    // An earlier version derived one flag from the canonical daily page and
    // reused it for the weekly and monthly tabs, which produced both failure
    // modes at once:
    //   - false negative: daily empty but the month ranking full -> the tab's
    //     row assertions were skipped, so a full-colour run was indistinguishable
    //     from a broken one;
    //   - false positive: a launch day with no finished week yet -> weekly is
    //     legitimately empty, but the flag said "has data" and the run failed.
    const views: { label: string; html: string; hasRows: boolean }[] = []

    for (const locale of locales) {
      const prefix = locale === "en" ? "" : `/${locale}`
      const { status, html } = await fetchPage(`${base}${prefix}`)
      results.push(check(html, `${locale}: HTTP 200`, status === 200, `status ${status}`))
      if (status !== 200) continue
      views.push({ label: locale, html, hasRows: hasRankedRows(html) })
    }

    // Tabs are fetched BEFORE the hero signal is computed, because the hero is
    // drawn from today + yesterday + month data: a day whose daily ranking is
    // empty (dates rolled over, a fresh install) can still have a full monthly
    // ranking, and the wall renders from that. Sampling only the daily views
    // left the wall unenforced in exactly that case.
    for (const tab of ["weekly", "monthly"]) {
      const { status, html } = await fetchPage(`${base}/?tab=${tab}`)
      results.push(check(html, `tab=${tab}: HTTP 200`, status === 200, `status ${status}`))
      if (status !== 200) continue
      views.push({ label: `tab=${tab}`, html, hasRows: hasRankedRows(html) })
    }

    // If ANY view has rows, the hero had something to draw and its slots are
    // required everywhere.
    const heroHasData = views.some((view) => view.hasRows)
    if (views.length > 0) {
      results.push(
        check(
          views[0].html,
          `${views[0].label}: target has ranked projects`,
          true,
          heroHasData
            ? "yes — data-dependent assertions are live"
            : "no — data-dependent assertions are reported, not enforced",
        ),
      )
    }

    for (const view of views) {
      results.push(...checkMarkup(view.html, view.label, view.hasRows, heroHasData))

      if (view.label.startsWith("tab=")) {
        // Deliberately NOT expected on tab views: the weekly/monthly variants
        // are query-param views of the same canonical URL, and labelling a
        // weekly ranking "Today's Launched Products" would be wrong structured
        // data.
        results.push(
          check(
            view.html,
            `${view.label}: no stale "Today" structured data`,
            !view.html.includes('id="schema-itemlist"'),
            "found ItemListSchema on a non-canonical tab view",
          ),
        )
        continue
      }

      // `ItemListSchema` only rides on the canonical daily view, so it follows
      // that view's own rows rather than the hero's.
      const hasList = view.html.includes('id="schema-itemlist"')
      results.push(
        check(
          view.html,
          `${view.label}: ItemList structured data`,
          hasList || !view.hasRows,
          hasList ? "present" : "absent — this view has no ranked projects",
        ),
      )
    }

    // The home page does not render the upvote control at all, so a
    // namespace-provider leak there is invisible. These routes do.
    //
    // The status is enforced unconditionally. An earlier version relaxed it to
    // "404 is fine when the target has no data", which — combined with the flag
    // problem above — could report a genuinely broken route as ok. In practice
    // these routes render their own empty states and return 200 even on an
    // empty database, so the relaxation was never needed.
    for (const route of ["/trending", "/categories", "/projects"]) {
      const { status, html } = await fetchPage(`${base}${route}`)
      results.push(check(html, `${route}: HTTP 200`, status === 200, `status ${status}`))
      if (status !== 200) continue
      // Text-level checks only: these routes are not the redesigned home, so its
      // structural markers do not apply — but a missing message namespace does.
      results.push(...checkRenderedText(html, route))
    }
  }

  report(results)
}

await main()
