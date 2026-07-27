import { db } from "@/drizzle/db"
import { tag as tagTable, tagModerationStatus } from "@/drizzle/db/schema"
import { and, eq } from "drizzle-orm"

import { brandedOgImage, OG_SIZE } from "@/lib/og-template"

export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 86400

export default async function TagOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Same APPROVED predicate as the public tag page/search/sitemap — a
  // flagged tag must not get a branded OG card.
  const [tag] = await db
    .select({ name: tagTable.name })
    .from(tagTable)
    .where(and(eq(tagTable.slug, slug), eq(tagTable.moderationStatus, tagModerationStatus.APPROVED)))
    .limit(1)
    .catch(() => [])

  return brandedOgImage(tag ? `#${tag.name}` : "Tags", "Projects by tag on aat.ee")
}
