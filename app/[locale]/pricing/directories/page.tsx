import { permanentRedirect } from "next/navigation"

/**
 * The directory-network pricing content has been folded into the
 * main `/pricing` hub (Free + 4 paid tiers + SEO Growth Package
 * in one comparison page). This stub keeps existing backlinks /
 * search-result hits working via a 308 permanent redirect, so the
 * old URL's SEO equity flows into the canonical `/pricing`.
 *
 * The page sat under `/pricing/directories` for a few weeks while
 * we trialled splitting Launch pricing from Directory pricing into
 * two pages — but since the two flows share the same Stripe tiers
 * and the same audience, one consolidated page won out.
 */
export default async function DirectoryPricingRedirect({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  permanentRedirect(`/${locale}/pricing`)
}
