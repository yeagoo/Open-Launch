import { unstable_cache } from "next/cache"

import { db } from "@/drizzle/db"
import { directoryOrder, project } from "@/drizzle/db/schema"
import { and, asc, eq, inArray } from "drizzle-orm"

import { ULTRA_SPONSOR_SLOT_LIMIT } from "@/lib/directory-tiers"

export interface Sponsor {
  // Stable identifier for keying the React render. Uses the
  // directory_order id (UUID) — distinct even if two orders point
  // at the same project.
  id: string
  name: string
  description: string
  url: string
  logoUrl: string
}

// Cache tag broadcast by the Stripe webhook on Ultra status
// transitions (paid, canceled, refunded). Bust the tag and the
// next sidebar render picks up the new state without waiting on
// the per-page revalidate window.
export const ULTRA_SPONSORS_CACHE_TAG = "ultra-sponsors"

/**
 * Active Ultra sponsors, oldest paid first (FIFO). Limited to the
 * declared slot cap so an over-the-cap order (race condition at
 * checkout) never leaks into the rendered sidebar.
 *
 * The card content is sourced from the project row at *render*
 * time, so a sponsor who polishes their description / logo gets
 * the update on the next cache bust. The link URL, however, comes
 * from the order — capturing what they paid to feature even if
 * the project's primary URL later changes.
 *
 * Wrapped in `unstable_cache` so all sidebar-using pages share a
 * single DB read per cache window. Tag invalidation runs from the
 * webhook (see `ULTRA_SPONSORS_CACHE_TAG`).
 */
export const getActiveSponsors = unstable_cache(fetchActiveSponsors, ["ultra-sponsors-v1"], {
  // 1h matches the existing page-level `revalidate` floor; tag
  // invalidation makes new subscriptions visible immediately.
  revalidate: 3600,
  tags: [ULTRA_SPONSORS_CACHE_TAG],
})

async function fetchActiveSponsors(): Promise<Sponsor[]> {
  try {
    // No `LIMIT` here so we can detect over-cap (race-condition)
    // rows below. The slice + log gives the admin a paper trail
    // when concurrency wins. Bounded set (active Ultra) so it's
    // safe to fetch without a cap.
    const rows = await db
      .select({
        orderId: directoryOrder.id,
        orderUrl: directoryOrder.url,
        projectName: project.name,
        // `project.description` is rich-text HTML; we strip tags below
        // for the plain-text sidebar. `tagline` lives on
        // `project_translation` (per-locale) and isn't needed for the
        // sidebar — descriptions are short enough after `line-clamp-2`.
        projectDescription: project.description,
        projectLogoUrl: project.logoUrl,
      })
      .from(directoryOrder)
      .innerJoin(project, eq(project.id, directoryOrder.projectId))
      .where(
        and(
          eq(directoryOrder.tier, "ultra"),
          inArray(directoryOrder.status, ["paid", "fulfilled"]),
        ),
      )
      // FIFO: paid_at is set at the same time as fulfilled_at for
      // auto-fulfilled Ultra orders, so ordering by paid_at gives
      // a stable "earliest sponsor first" rendering. Falls back to
      // created_at for paranoia (a row missing paid_at would sort
      // NULLS LAST in PG; explicit secondary key keeps the order
      // deterministic in any backend).
      .orderBy(asc(directoryOrder.paidAt), asc(directoryOrder.createdAt))

    if (rows.length > ULTRA_SPONSOR_SLOT_LIMIT) {
      // Concurrency race: more than the cap squeezed through the
      // checkout gate. Sidebar still renders the first N — admin
      // should refund the surplus.
      console.warn(
        `⚠️ Over-cap Ultra sponsors: ${rows.length} active rows, expected ≤ ${ULTRA_SPONSOR_SLOT_LIMIT}. Refund the latest order(s).`,
      )
    }

    return rows.slice(0, ULTRA_SPONSOR_SLOT_LIMIT).map((r) => ({
      id: r.orderId,
      name: r.projectName,
      description: descriptionFor(r.projectDescription, r.projectName),
      url: r.orderUrl,
      logoUrl: r.projectLogoUrl,
    }))
  } catch (err) {
    // A DB hiccup shouldn't take down the homepage / project pages
    // that render the sidebar. Surface in logs and serve an empty
    // sponsor list — `SidebarSponsors` then hides the section
    // entirely until the next cache window.
    console.error("Failed to fetch active sponsors:", err)
    return []
  }
}

// HTML-strip the description for the sidebar's plain-text card.
// Falls back to the project name itself (better than an empty `<p>`)
// when the description is empty or only contained markup.
function descriptionFor(description: string, name: string): string {
  const stripped = description.replace(/<[^>]*>/g, "").trim()
  return stripped.length > 0 ? stripped : name
}
