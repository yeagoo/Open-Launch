/* eslint-disable @next/next/no-img-element */
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

// Link groups for a columnar layout
const discoverLinks = [
  { title: "Trending", href: "/trending" },
  { title: "Categories", href: "/categories" },
  { title: "Submit Project", href: "/projects/submit" },
]

const resourcesLinks = [
  { title: "Pricing", href: "/pricing" },
  { title: "Sponsors", href: "/sponsors" },
  { title: "Blog", href: "/blog" },
]

const legalLinks = [
  { title: "Terms of Service", href: "/legal/terms" },
  { title: "Privacy Policy", href: "/legal/privacy" },
]

export default function FooterSection() {
  const pathname = usePathname()
  const isHomePage = pathname === "/"
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
              © {new Date().getFullYear()} aat.ee. All rights reserved.
            </p>
          </div>

          {/* Right Section: Columnar Navigation Links */}
          <div className="grid grid-cols-2 gap-8 md:col-span-8 md:grid-cols-3">
            {/* Discover Column */}
            <div className="text-left">
              <h3 className="text-foreground text-sm font-semibold tracking-wider uppercase">
                Discover
              </h3>
              <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
                {discoverLinks.map((link) => (
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-primary text-sm transition-colors duration-150"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources Column */}
            <div className="text-left">
              <h3 className="text-foreground text-sm font-semibold tracking-wider uppercase">
                Resources
              </h3>
              <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
                {resourcesLinks.map((link) => (
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-primary text-sm transition-colors duration-150"
                    >
                      {link.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal Column */}
            <div className="text-left">
              <h3 className="text-foreground text-sm font-semibold tracking-wider uppercase">
                Legal
              </h3>
              <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
                {legalLinks.map((link) => (
                  <li key={link.title}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground hover:text-primary text-sm transition-colors duration-150"
                    >
                      {link.title}
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
              Friends
            </h3>
            <div className="text-muted-foreground mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <a
                href="https://debian.club/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                Debian.Club
              </a>
              <span>|</span>
              <a
                href="https://hestiacp.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                hestiacp.cn
              </a>
              <span>|</span>
              <a
                href="https://portcyou.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                PortCyou
              </a>
              <span>|</span>
              <a
                href="https://cloud.fan/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                CloudFan
              </a>
              <span>|</span>
              <a
                href="https://mulerun.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                MuleRun
              </a>
              <span>|</span>
              <a
                href="https://www.almalinux.com.cn/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                AlmaLinuxCN
              </a>
              <span>|</span>
              <a
                href="https://p.cafe/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                P.Cafe
              </a>
              <span>|</span>
              <a
                href="https://www.rank.fan/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                RankFan
              </a>
              <span>|</span>
              <a
                href="https://run.claw.cloud/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                ClawCloud Run
              </a>
              <span>|</span>
              <a
                href="https://www.apponarm.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                APP on ARM
              </a>
              <span>|</span>
              <a
                href="https://freehost.work/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                FreeHost
              </a>
              <span>|</span>
              <a
                href="https://mf8.biz/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                MF8
              </a>
              <span>|</span>
              <a
                href="https://aat.ee/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                AAT.ee
              </a>
              <span>|</span>
              <a
                href="https://ii.pe/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                II.Pe
              </a>
            </div>

            {/* Badges Section */}
            <div className="flex flex-wrap items-center gap-3">
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
                  width="150"
                  height="44"
                  className="block dark:hidden"
                />
                <img
                  src="https://open-launch.com/images/badges/powered-by-dark.svg"
                  alt="Powered by Open-Launch"
                  width="150"
                  height="44"
                  className="hidden dark:block"
                />
              </a>

              {/* Findly.tools Badge */}
              <a
                href="https://findly.tools/aat-ee?utm_source=aat-ee"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="https://findly.tools/badges/findly-tools-badge-light.svg"
                  alt="Featured on findly.tools"
                  width="150"
                  className="block dark:hidden"
                />
                <img
                  src="https://findly.tools/badges/findly-tools-badge-dark.svg"
                  alt="Featured on findly.tools"
                  width="150"
                  className="hidden dark:block"
                />
              </a>

              {/* Dofollow.tools Badge */}
              <a href="https://dofollow.tools" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://dofollow.tools/badge/badge_transparent.svg"
                  alt="Featured on Dofollow.Tools"
                  width="200"
                  height="54"
                />
              </a>

              {/* Startup Fame Badge */}
              <a
                href="https://startupfa.me/s/aat.ee?utm_source=www.aat.ee"
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src="https://startupfa.me/badges/featured-badge.webp"
                  alt="aat.ee - Featured on Startup Fame"
                  width="171"
                  height="54"
                />
              </a>

              {/* Twelve Tools Badge */}
              <a href="https://twelve.tools" target="_blank" rel="noopener noreferrer">
                <img
                  src="https://twelve.tools/badge0-white.svg"
                  alt="Featured on Twelve Tools"
                  width="200"
                  height="54"
                  className="block dark:hidden"
                />
                <img
                  src="https://twelve.tools/badge0-dark.svg"
                  alt="Featured on Twelve Tools"
                  width="200"
                  height="54"
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
                  width="200"
                  height="54"
                  className="block dark:hidden"
                />
                <img
                  src="/images/badges/featured-badge-dark.svg"
                  alt="Featured on aat.ee"
                  width="200"
                  height="54"
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
                  width="150"
                  height="44"
                  className="block dark:hidden"
                />
                <img
                  src="https://open-launch.com/images/badges/powered-by-dark.svg"
                  alt="Powered by Open-Launch"
                  width="150"
                  height="44"
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
