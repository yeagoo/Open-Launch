/* eslint-disable @next/next/no-img-element */
"use client"

import { usePathname } from "next/navigation"

import { Link } from "@/i18n/navigation"
import { useTranslations } from "next-intl"

const discoverLinks = [
  { key: "trending", href: "/trending" },
  { key: "categories", href: "/categories" },
  { key: "compareTools", href: "/compare" },
  { key: "alternatives", href: "/alternatives" },
  { key: "submitProject", href: "/projects/submit" },
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

const friendLinks = [
  { title: "Debian.Club", href: "https://debian.club/" },
  { title: "HestiaCP CN", href: "https://hestiacp.cn/" },
  { title: "PortCyou", href: "https://portcyou.com/" },
  { title: "CloudFan", href: "https://cloud.fan/" },
  { title: "AlmaLinuxCN", href: "https://www.almalinux.com.cn/" },
  { title: "P.Cafe", href: "https://p.cafe/" },
  { title: "RankFan", href: "https://www.rank.fan/" },
  { title: "APP on ARM", href: "https://www.apponarm.com/" },
  { title: "ScreenHello", href: "https://www.screenhello.com/" },
  { title: "MF8", href: "https://mf8.biz/" },
  { title: "AAT.ee", href: "https://aat.ee/" },
  { title: "II.Pe", href: "https://ii.pe/" },
  { title: "FreeHost", href: "https://freehost.work/" },
  { title: "BigKr", href: "https://bigkr.com/" },
  { title: "EOL.Wiki", href: "https://eol.wiki/" },
  { title: "GEO.Fan", href: "https://geo.fan/" },
  { title: "WebCasa", href: "https://web.casa" },
  { title: "LiteHTTPD", href: "https://litehttpd.com" },
  { title: "LLStack", href: "https://llstack.com" },
  { title: "HiEmdash", href: "https://hiemdash.com" },
  { title: "QOO.IM", href: "https://qoo.im" },
  { title: "Ubuntu.Fan", href: "https://ubuntu.fan/" },
  { title: "RunEntLinux", href: "https://runentlinux.com/" },
]

export default function FooterSection() {
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
                {discoverLinks.map((link) => (
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
            </div>
          </div>
        </div>

        {/* Friends Links and Badges Section */}
        {isHomePage && (
          <div className="border-border/40 mt-8 border-t pt-6">
            {/* Friends Links */}
            <h3 className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
              {t("friends")}
            </h3>
            <div className="text-muted-foreground mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              {friendLinks.map((link, i) => (
                <span key={link.title} className="flex items-center gap-2">
                  {i > 0 && <span>|</span>}
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    {link.title}
                  </a>
                </span>
              ))}
            </div>

            {/* Badges Section */}
            <div className="flex flex-wrap items-center gap-3">
              {/* aat.ee Badge - Featured on aat.ee */}
              <a
                href="https://www.aat.ee/?ref=badge"
                target="_blank"
                title="Featured on aat.ee"
                rel="noopener noreferrer"
              >
                <img
                  src="/images/badges/featured-badge-light.svg"
                  alt="Featured on aat.ee"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="/images/badges/featured-badge-dark.svg"
                  alt="Featured on aat.ee"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* OPEN-LAUNCH Badge */}
              <a
                href="https://open-launch.com/projects/aat-ee"
                target="_blank"
                title="Powered by Open-Launch"
                rel="noopener noreferrer"
              >
                <img
                  src="https://open-launch.com/images/badges/powered-by-light.svg"
                  alt="Powered by Open-Launch"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://open-launch.com/images/badges/powered-by-dark.svg"
                  alt="Powered by Open-Launch"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* Dofollow.tools Badge */}
              <a
                href="https://dofollow.tools/product/aatee"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="https://dofollow.tools/badge/badge_transparent.svg"
                  alt="Featured on Dofollow.Tools"
                  style={{ height: "30px", width: "auto" }}
                />
              </a>

              {/* Twelve Tools Badge */}
              <a href="https://twelve.tools" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://twelve.tools/badge0-white.svg"
                  alt="Featured on Twelve Tools"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://twelve.tools/badge0-dark.svg"
                  alt="Featured on Twelve Tools"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* Turbo0 Badge */}
              <a href="https://turbo0.com/item/aatee" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://img.turbo0.com/badge-listed-light.svg"
                  alt="Listed on Turbo0"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://img.turbo0.com/badge-listed-dark.svg"
                  alt="Listed on Turbo0"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* Hi Cyou Badge */}
              <a href="https://hicyou.com" target="_blank" rel="dofollow">
                <img
                  src="https://hicyou.com/badge/featured-light.svg"
                  alt="Featured on Hi Cyou"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://hicyou.com/badge/featured-dark.svg"
                  alt="Featured on Hi Cyou"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* MF8 Badge */}
              <a href="https://www.mf8.biz" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://www.mf8.biz/badge/badge_light.svg"
                  alt="Featured on MF8"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://www.mf8.biz/badge/badge_dark.svg"
                  alt="Featured on MF8"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* BigKr Badge */}
              <a href="https://bigkr.com" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://bigkr.com/badge/badge_light.svg"
                  alt="Featured on BigKr"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://bigkr.com/badge/badge_dark.svg"
                  alt="Featured on BigKr"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>
            </div>
          </div>
        )}

        {/* Badges Section for Non-Homepage */}
        {!isHomePage && (
          <div className="border-border/40 mt-8 border-t pt-6">
            <div className="flex flex-wrap items-center gap-3">
              {/* aat.ee Badge */}
              <a
                href="https://www.aat.ee/?ref=badge"
                target="_blank"
                title="Featured on aat.ee"
                rel="noopener noreferrer"
              >
                <img
                  src="/images/badges/featured-badge-light.svg"
                  alt="Featured on aat.ee"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="/images/badges/featured-badge-dark.svg"
                  alt="Featured on aat.ee"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* OPEN-LAUNCH Badge */}
              <a
                href="https://open-launch.com/projects/aat-ee"
                target="_blank"
                title="Powered by Open-Launch"
                rel="noopener noreferrer"
              >
                <img
                  src="https://open-launch.com/images/badges/powered-by-light.svg"
                  alt="Powered by Open-Launch"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://open-launch.com/images/badges/powered-by-dark.svg"
                  alt="Powered by Open-Launch"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* Hi Cyou Badge */}
              <a href="https://hicyou.com" target="_blank" rel="dofollow">
                <img
                  src="https://hicyou.com/badge/featured-light.svg"
                  alt="Featured on Hi Cyou"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://hicyou.com/badge/featured-dark.svg"
                  alt="Featured on Hi Cyou"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* MF8 Badge */}
              <a href="https://www.mf8.biz" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://www.mf8.biz/badge/badge_light.svg"
                  alt="Featured on MF8"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://www.mf8.biz/badge/badge_dark.svg"
                  alt="Featured on MF8"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>

              {/* BigKr Badge */}
              <a href="https://bigkr.com" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://bigkr.com/badge/badge_light.svg"
                  alt="Featured on BigKr"
                  style={{ height: "30px", width: "auto" }}
                  className="block dark:hidden"
                />
                <img
                  src="https://bigkr.com/badge/badge_dark.svg"
                  alt="Featured on BigKr"
                  style={{ height: "30px", width: "auto" }}
                  className="hidden dark:block"
                />
              </a>
            </div>
          </div>
        )}
      </div>
    </footer>
  )
}
