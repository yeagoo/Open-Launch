"use server"

import { unstable_cache } from "next/cache"

import { db } from "@/drizzle/db"
import {
  category as categoryTable,
  projectToCategory,
  tagModerationStatus,
  tag as tagTable,
} from "@/drizzle/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"

import { TOP_CATEGORIES_TAG } from "@/lib/cache-tags"
import { clampInteger } from "@/lib/query-limits"

/**
 * Data for the site footer's taxonomy columns.
 *
 * The footer renders on EVERY route, so this must never become an uncached
 * query — it is wrapped in `unstable_cache` and shares `TOP_CATEGORIES_TAG`
 * with the home sidebar, which the launch-transition cron and the admin
 * moderation flows already bust when the counts move.
 *
 * The existing `getAllTags()` action is deliberately not reused: it is
 * uncached and returns whole tag rows, which is the wrong shape and the wrong
 * cost for a footer block.
 */
const fetchFooterTaxonomyBase = unstable_cache(
  async (categoryLimit: number, tagLimit: number) => {
    const [categories, tags] = await Promise.all([
      db
        .select({
          id: categoryTable.id,
          name: categoryTable.name,
          count: sql<number>`cast(count(${projectToCategory.projectId}) as int)`.mapWith(Number),
        })
        .from(categoryTable)
        .innerJoin(projectToCategory, eq(projectToCategory.categoryId, categoryTable.id))
        .groupBy(categoryTable.id, categoryTable.name)
        .orderBy(desc(sql`count(${projectToCategory.projectId})`))
        .limit(categoryLimit),
      db
        .select({
          slug: tagTable.slug,
          name: tagTable.name,
          count: tagTable.projectCount,
        })
        .from(tagTable)
        // Same visibility rule as the public tag pages: only approved tags are
        // linked, so the footer can never point at a 404 or an unmoderated tag.
        .where(
          and(
            eq(tagTable.moderationStatus, tagModerationStatus.APPROVED),
            sql`${tagTable.projectCount} > 0`,
          ),
        )
        .orderBy(desc(tagTable.projectCount))
        .limit(tagLimit),
    ])

    return { categories, tags }
  },
  ["footer-taxonomy-v1"],
  { revalidate: 3600, tags: [TOP_CATEGORIES_TAG] },
)

export async function getFooterTaxonomy(categoryLimit = 6, tagLimit = 8) {
  return fetchFooterTaxonomyBase(
    clampInteger(categoryLimit, 6, 1, 20),
    clampInteger(tagLimit, 8, 1, 30),
  )
}
