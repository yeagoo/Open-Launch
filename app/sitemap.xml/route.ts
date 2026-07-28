import { unstable_cache } from "next/cache"

import { db } from "@/drizzle/db"
import { launchStatus, project, tag, tagModerationStatus } from "@/drizzle/db/schema"
import { count, eq, or } from "drizzle-orm"

import { SITEMAP_ENTRIES_TAG } from "@/lib/cache-tags"
import { getSitemapIndexPaths, serializeSitemapIndex } from "@/lib/sitemap-xml"
import { countPublicProfileUsers } from "@/lib/user-profile-query"

export const dynamic = "force-dynamic"

async function countShardedSitemapRows() {
  const [[projectRow], [tagRow], users] = await Promise.all([
    db
      .select({ count: count() })
      .from(project)
      .where(
        or(
          eq(project.launchStatus, launchStatus.ONGOING),
          eq(project.launchStatus, launchStatus.LAUNCHED),
        ),
      ),
    db
      .select({ count: count() })
      .from(tag)
      .where(eq(tag.moderationStatus, tagModerationStatus.APPROVED)),
    countPublicProfileUsers(),
  ])
  return {
    projects: projectRow?.count ?? 0,
    tags: tagRow?.count ?? 0,
    users,
  }
}

const cachedShardCounts = unstable_cache(countShardedSitemapRows, ["sitemap-shard-counts"], {
  revalidate: 3600,
  tags: [SITEMAP_ENTRIES_TAG],
})

export async function GET() {
  const paths = getSitemapIndexPaths(await cachedShardCounts())
  return new Response(serializeSitemapIndex(paths), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/xml; charset=utf-8",
    },
  })
}
