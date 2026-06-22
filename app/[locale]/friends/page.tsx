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

function SiteCard({ site, locale }: { site: FriendSite; locale: string }) {
  const logo = logoUrl(site)
  const desc = siteDescription(site, locale)
  const dim = site.status === "pending_dns" || site.status === "unreachable"
  return (
    <a
      href={site.url}
      target="_blank"
      rel="noopener"
      className={`bg-background border-border/40 hover:border-primary/30 hover:bg-muted/50 flex gap-3 rounded-lg border p-4 transition-colors ${
        dim ? "opacity-60" : ""
      }`}
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
    <main className="bg-muted/30 min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
        <div className="mb-8">
          <h1 className="text-foreground text-2xl font-bold md:text-3xl">{t("title")}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{t("subtitle")}</p>
        </div>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-foreground mb-4 text-lg font-semibold">
                {section.title}
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  ({section.sites.length})
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {section.sites.map((site) => (
                  <SiteCard key={site.id} site={site} locale={locale} />
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
    </main>
  )
}
