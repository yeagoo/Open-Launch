/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next"

import { Link } from "@/i18n/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"

import {
  authorityDocumentationSites,
  footerNavigationSites,
  logoUrl,
  sectionTitle,
  siteDescription,
  type FriendSite,
} from "@/lib/directories-links"
import { buildLocaleAlternates } from "@/lib/i18n-metadata"
import { SerifHeading } from "@/components/ds/serif-heading"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "friends" })
  return {
    title: `${t("title")} | aat.ee`,
    description: t("subtitle"),
    alternates: buildLocaleAlternates("/friends", locale),
  }
}

/** Status text for a site that is not serving yet, or null when it is fine.
 *  Replaces an `opacity-60` dim, which conveyed the state by fading the card —
 *  the card is still a link, so it is not exempt from contrast, and even 90%
 *  opacity only reached ~4.3:1. Naming the state is both accessible and more
 *  informative: the reader learns *why* a card is marked. */
function statusKeyFor(site: FriendSite): "pendingDns" | "unreachable" | null {
  if (site.status === "pending_dns") return "pendingDns"
  if (site.status === "unreachable") return "unreachable"
  return null
}

function SiteCard({
  site,
  locale,
  statusLabel,
}: {
  site: FriendSite
  locale: string
  statusLabel: string | null
}) {
  const logo = logoUrl(site)
  const desc = siteDescription(site, locale)
  return (
    <a
      href={site.url}
      target="_blank"
      rel="noopener"
      className="bg-home-surface border-home-hairline hover:border-home-hairline-strong rounded-home-card shadow-home-card flex gap-3 border p-4 transition-colors"
    >
      {logo && (
        <img
          src={logo}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          className="h-8 w-8 shrink-0 rounded"
        />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="text-foreground flex items-center gap-2 text-sm font-medium">
          {site.name}
          {typeof site.dr === "number" && (
            <span className="text-muted-foreground bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
              DR {site.dr}
            </span>
          )}
          {statusLabel && (
            <span className="text-muted-foreground bg-muted rounded px-1 py-0.5 text-[10px]">
              {statusLabel}
            </span>
          )}
        </span>
        {desc && <span className="text-muted-foreground mt-1 line-clamp-2 text-xs">{desc}</span>}
      </span>
    </a>
  )
}

export default async function FriendsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations("friends")

  const sections = [
    { title: sectionTitle("footer_navigation_sites_title", locale), sites: footerNavigationSites },
    {
      title: sectionTitle("authority_documentation_sites_title", locale),
      sites: authorityDocumentationSites,
    },
  ]

  return (
    <div className="bg-secondary/20 min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 pt-8 pb-12">
        <div className="mb-8">
          <SerifHeading as="h1" size="section">
            {t("title")}
          </SerifHeading>
          <p className="text-muted-foreground mt-2 text-sm">{t("subtitle")}</p>
        </div>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <SerifHeading as="h2" size="card" className="mb-4">
                {section.title}
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  ({section.sites.length})
                </span>
              </SerifHeading>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {section.sites.map((site) => (
                  <SiteCard
                    key={site.id}
                    site={site}
                    locale={locale}
                    statusLabel={statusKeyFor(site) ? t(statusKeyFor(site)!) : null}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-muted-foreground hover:text-primary text-sm transition-colors"
          >
            &larr; {t("backToHome")}
          </Link>
        </div>
      </div>
    </div>
  )
}
