/* eslint-disable @next/next/no-img-element */
"use client"

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

export default function FooterSection({ navSites }: { navSites: NavSite[] }) {
  const pathname = usePathname()
  const isHomePage = pathname === "/" || /^\/[a-z]{2}$/.test(pathname)
  const t = useTranslations("footer")
  const tLinks = useTranslations("footer.links")
  return (
    <footer className="bg-background border-t pt-6 pb-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-12 md:gap-x-8">
          {/* Left Section: Brand, Copyright */}
          <div className="flex flex-col items-start text-left md:col-span-4 lg:col-span-4">
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
          <div className="grid grid-cols-2 gap-8 md:col-span-8 md:grid-cols-3">
            {/* Discover Column */}
            <div className="text-left">
              <h3 className="text-foreground text-sm font-semibold tracking-wider uppercase">
                {t("discover")}
              </h3>
              <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
                {discoverLinks.map((link) =>
                  link.localized ? (
                    <li key={link.key}>
                      <Link
                        href={link.href}
                        className="text-muted-foreground hover:text-primary text-sm transition-colors duration-150"
                      >
                        {tLinks(link.key)}
                      </Link>
                    </li>
                  ) : (
                    <li key={link.key}>
                      <a
                        href={link.href}
                        className="text-muted-foreground hover:text-primary text-sm transition-colors duration-150"
                      >
                        {tLinks(link.key)}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </div>

            {/* Resources Column */}
            <div className="text-left">
              <h3 className="text-foreground text-sm font-semibold tracking-wider uppercase">
                {t("resources")}
              </h3>
              <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
                {resourcesLinks.map((link) => (
                  <li key={link.key}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-primary text-sm transition-colors duration-150"
                    >
                      {tLinks(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal Column */}
            <div className="text-left">
              <h3 className="text-foreground text-sm font-semibold tracking-wider uppercase">
                {t("legal")}
              </h3>
              <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
                {legalLinks.map((link) => (
                  <li key={link.key}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-primary text-sm transition-colors duration-150"
                    >
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
                  className={`hover:text-primary inline-flex items-center gap-1.5 transition-colors ${
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
      </div>
    </footer>
  )
}
