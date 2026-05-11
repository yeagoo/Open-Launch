import { permanentRedirect } from "next/navigation"

/**
 * The old /sponsors page sold weekly / monthly slots through a
 * mailto form — predates the directory-network pricing redesign.
 * The Ultra tier (self-serve via Stripe, capped at 5 active
 * sponsors) is now the canonical sponsorship product, so the two
 * pages were selling the same thing in two places.
 *
 * 308 permanent redirect keeps existing backlinks and SEO equity
 * flowing into the new canonical URL. The `#ultra` anchor jumps
 * the visitor straight to the Ultra spotlight section on the
 * directory pricing page.
 *
 * Internal links across the codebase (nav, footer, sponsor cards)
 * still point at /sponsors — that's fine, they hit this redirect
 * and land on the right place. We can clean those up later if we
 * want to skip the extra hop.
 */
export default async function SponsorsRedirect({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  permanentRedirect(`/${locale}/pricing/directories#ultra`)
}
