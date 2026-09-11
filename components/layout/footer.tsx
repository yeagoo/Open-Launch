/* eslint-disable @next/next/no-img-element */
"use client"

import type * as React from "react"
import { usePathname } from "next/navigation"

import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"

import { LanguageSwitcher } from "./language-switcher"

const discoverLinks = [
  { key: "trending", href: "/trending", localized: true },
  { key: "categories", href: "/categories", localized: true },
  // /compare and /alternatives are English-only — bypass locale routing
  { key: "compareTools", href: "/compare", localized: false },
  { key: "alternatives", href: "/alternatives", localized: false },
  { key: "submitProject", href: "/projects/submit", localized: true },
] as const

const resourcesLinks = [
  { key: "pricing", href: "/pricing" },
  { key: "freeDirectorySubmission", href: "/skill/free-directory-submission" },
  { key: "sponsors", href: "/sponsors" },
  { key: "blog", href: "/blog" },
  { key: "friendsPage", href: "/friends" },
] as const

const legalLinks = [
  { key: "termsOfService", href: "/legal/terms" },
  { key: "privacyPolicy", href: "/legal/privacy" },
] as const

// Footer nav links come from the build-time directories-links snapshot, passed
// as a small serialized slice from the (server) root layout so the full ~138KB
// snapshot never reaches the client bundle.
type NavSite = {
  name: string
  url: string
  domain: string
  logo: string | null
  deemphasized: boolean
}

// Data-backed taxonomy columns. Serialized from the server layout, sourced from
// the cached `getFooterTaxonomy()` action — the footer renders on every route,
// so an uncached query here would tax the whole site.
type FooterTaxonomy = {
  categories: { id: string; name: string; count: number }[]
  tags: { slug: string; name: string; count: number }[]
}

/**
 * One footer column. Deliberately palette-neutral (`text-muted-foreground`,
 * not `--home-*`): the footer ships on every route, including the legacy home
 * while the HOME_V2 rollout is in progress, so it must not depend on either
 * palette.
 *
 * Extracted because five near-identical `<div><h3><ul>` blocks were both noisy
 * and — since the footer is a client component that ships on every route —
 * measurably expensive in bundle bytes.
 */
function LinkColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="text-left">
      <h3 className="text-muted-foreground font-mono text-[10px] font-semibold tracking-[0.16em] uppercase">
        {title}
      </h3>
      <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
        {children}
      </ul>
    </div>
  )
}

const linkClass = "text-muted-foreground hover:text-foreground text-sm transition-colors"

export default function FooterSection({
  navSites,
  taxonomy,
}: {
  navSites: NavSite[]
  taxonomy: FooterTaxonomy
}) {
  const pathname = usePathname()
  const isHomePage = pathname === "/" || /^\/[a-z]{2}$/.test(pathname)
  const t = useTranslations("footer")
  const tLinks = useTranslations("footer.links")
  return (
    <footer className="bg-background border-t pt-8 pb-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-12 md:gap-x-8">
          {/* Left Section: Brand, Copyright */}
          <div className="flex flex-col items-start text-left md:col-span-4 lg:col-span-3">
            <Link href="/" className="font-heading mb-3 flex items-center">
              <span className="font-heading flex items-center text-lg font-bold">
                <img src="/logo.svg" alt="logo" className="mr-1 h-6 w-6" />
                aat.ee
              </span>
            </Link>
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} aat.ee. {t("rightsReserved")}
            </p>
          </div>

          {/* Right Section: Columnar Navigation Links */}
          <div className="grid grid-cols-2 gap-8 md:col-span-8 md:grid-cols-3 lg:col-span-9 lg:grid-cols-5">
            {/* Discover Column */}
            <LinkColumn title={t("discover")}>
              {discoverLinks.map((link) => (
                <li key={link.key}>
                  {link.localized ? (
                    <Link href={link.href} className={linkClass}>
                      {tLinks(link.key)}
                    </Link>
                  ) : (
                    <a href={link.href} className={linkClass}>
                      {tLinks(link.key)}
                    </a>
                  )}
                </li>
              ))}
            </LinkColumn>

            {/* Categories Column — real counts, real landing pages. */}
            {taxonomy.categories.length > 0 && (
              <LinkColumn title={tLinks("categories")}>
                {taxonomy.categories.map((category) => (
                  <li key={category.id}>
                    <Link href={`/categories?category=${category.id}`} className={linkClass}>
                      {category.name}
                    </Link>
                  </li>
                ))}
              </LinkColumn>
            )}

            {/* Best Tags Column */}
            {taxonomy.tags.length > 0 && (
              <LinkColumn title={t("bestTags")}>
                {taxonomy.tags.map((tag) => (
                  <li key={tag.slug}>
                    <Link href={`/tags/${tag.slug}`} className={linkClass}>
                      {tag.name}
                    </Link>
                  </li>
                ))}
              </LinkColumn>
            )}

            {/* Resources Column */}
            <LinkColumn title={t("resources")}>
              {resourcesLinks.map((link) => (
                <li key={link.key}>
                  <Link href={link.href} className={linkClass}>
                    {tLinks(link.key)}
                  </Link>
                </li>
              ))}
            </LinkColumn>

            {/* Legal Column — the language switcher rides along underneath. */}
            <div className="text-left">
              <h3 className="text-muted-foreground font-mono text-[10px] font-semibold tracking-[0.16em] uppercase">
                {t("legal")}
              </h3>
              <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
                {legalLinks.map((link) => (
                  <li key={link.key}>
                    <Link href={link.href} className={linkClass}>
                      {tLinks(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <LanguageSwitcher variant="footer" />
              </div>
            </div>
          </div>
        </div>

        {/* Friends Links */}
        {isHomePage && (
          <div className="border-border/40 mt-8 border-t pt-6">
            <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
              {t("friends")}
            </h3>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
              {navSites.map((site) => (
                <a
                  key={site.domain}
                  href={site.url}
                  target="_blank"
                  rel="noopener"
                  className={`hover:text-primary inline-flex items-center gap-1.5 py-1 transition-colors ${
                    site.deemphasized ? "opacity-50" : ""
                  }`}
                >
                  {site.logo && (
                    <img
                      src={site.logo}
                      alt=""
                      width={14}
                      height={14}
                      loading="lazy"
                      className="h-3.5 w-3.5 rounded-sm"
                    />
                  )}
                  {site.name}
                </a>
              ))}
            </div>
          </div>
        )}

        {isHomePage && (
          <div className="mt-6 flex justify-center">
            <a
              href="https://aieo.ee"
              rel="noopener noreferrer"
              data-aieo-badge="144bd413-d511-4341-9ba9-1ded93ec9a6b"
              className="inline-flex"
            >
              <img
                src="https://aieo.ee/aieo-badge.svg"
                alt="Verified by AIEO"
                width="144"
                height="36"
              />
            </a>
          </div>
        )}
      </div>
    </footer>
  )
}
