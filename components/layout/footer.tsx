/* eslint-disable @next/next/no-img-element */
import Link from "next/link"

import { RiGithubFill, RiTwitterXFill } from "@remixicon/react"

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
  { title: "Attribution Badges", href: "/legal/badges" },
]

// Liens pour la nouvelle colonne "Connect"
const connectLinkItems = [
  {
    href: "https://github.com/drdruide/open-launch",
    icon: RiGithubFill,
    label: "GitHub",
  },
  {
    href: "https://twitter.com/Ericbn09",
    icon: RiTwitterXFill,
    label: "Twitter / X",
  },
]

export default function FooterSection() {
  return (
    <footer className="bg-background border-t pt-6 pb-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-12 md:gap-x-8">
          {/* Left Section: Brand, Copyright, Author, Badges - Align left on mobile */}
          <div className="flex flex-col items-start text-left md:col-span-4 lg:col-span-4">
            <Link href="/" className="font-heading mb-3 flex items-center">
              <span className="font-heading flex items-center text-lg font-bold">
                <img src="/logo.svg" alt="logo" className="mr-1 h-6 w-6" />
                Open-Launch
              </span>
            </Link>
            <p className="text-muted-foreground text-sm">
              © {new Date().getFullYear()} Open-Launch. All rights reserved.
            </p>
            <p className="text-muted-foreground mb-4 text-sm">
              Open source project by{" "}
              <Link
                href="https://x.com/Ericbn09"
                target="_blank"
                rel="noopener"
                className="hover:text-primary underline"
              >
                Eric
              </Link>
            </p>
            <div className="flex items-center justify-start space-x-3">
              <img
                src="/images/badges/top1-light.svg"
                alt="Top 1 Product Badge (Light Theme)"
                className="block w-[200px] dark:hidden"
              />
              <img
                src="/images/badges/top1-dark.svg"
                alt="Top 1 Product Badge (Dark Theme)"
                className="hidden w-[200px] dark:block"
              />
            </div>
          </div>

          {/* Right Section: Columnar Navigation Links - 2 colonnes sur mobile, 4 sur md */}
          <div className="grid grid-cols-2 gap-8 md:col-span-8 md:grid-cols-4">
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

            {/* Connect Column */}
            <div className="text-left">
              <h3 className="text-foreground text-sm font-semibold tracking-wider uppercase">
                Connect
              </h3>
              <ul role="list" className="mt-4 flex flex-col items-start space-y-3">
                {connectLinkItems.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 text-sm transition-colors duration-150"
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        {/* Badges Section */}
        <div className="border-border/40 mt-8 border-t">
          <div className="mx-auto max-w-5xl pt-4">
            <h3 className="text-muted-foreground mb-4 text-center text-xs font-medium tracking-wider uppercase">
              Earned Badges
            </h3>
            {/* Featured on findly.tools */}
            <div className="mb-4 flex flex-wrap items-center justify-center">
              <a href="https://findly.tools/open-launch?utm_source=open-launch" target="_blank">
                <img
                  src="https://findly.tools/badges/findly-tools-badge-light.svg"
                  alt="Featured on findly.tools"
                  width="150"
                  height="auto"
                  className="block dark:hidden"
                />
              </a>

              <a href="https://findly.tools/open-launch?utm_source=open-launch" target="_blank">
                <img
                  src="https://findly.tools/badges/findly-tools-badge-dark.svg"
                  alt="Featured on findly.tools"
                  width="150"
                  height="auto"
                  className="hidden dark:block"
                />
              </a>
            </div>
            {/* Featured on Twelve Tools */}
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a
                href="https://twelve.tools"
                target="_blank"
                rel="noopener"
                className="hidden dark:block"
              >
                <img
                  src="https://twelve.tools/badge0-dark.svg"
                  alt="Featured on Twelve Tools"
                  className="h-8"
                />
              </a>
              <a
                href="https://twelve.tools"
                target="_blank"
                rel="noopener"
                className="block dark:hidden"
              >
                <img
                  src="https://twelve.tools/badge0-white.svg"
                  alt="Featured on Twelve Tools"
                  className="h-8"
                />
              </a>
              <a
                href="https://bestdirectories.org"
                target="_blank"
                rel="noopener"
                className="hidden dark:block"
              >
                <img
                  src="https://bestdirectories.org/feature-badge-dark.svg"
                  alt="Featured on Best Directories"
                  className="h-8"
                />
              </a>
              <a
                href="https://bestdirectories.org"
                target="_blank"
                rel="noopener"
                className="block dark:hidden"
              >
                <img
                  src="https://bestdirectories.org/feature-badge.svg"
                  alt="Featured on Best Directories"
                  className="h-8"
                />
              </a>
              <a
                href="https://aiwith.me/tools/open-launch-com/?utm_source=badge-featured&utm_medium=badge&ref=embed"
                target="_blank"
                rel="noopener"
                className="hidden dark:block"
                title="Open Launch - Featured on AI With Me"
              >
                <img
                  src="https://aiwith.me/ai_with_me_dark_badge.svg"
                  alt="Open Launch - Featured on AI With Me"
                  className="h-8"
                />
              </a>
              <a
                href="https://aiwith.me/tools/open-launch-com/?utm_source=badge-featured&utm_medium=badge&ref=embed"
                target="_blank"
                rel="noopener"
                className="block dark:hidden"
                title="Open Launch - Featured on AI With Me"
              >
                <img
                  src="https://aiwith.me/ai_with_me_light_badge.svg"
                  alt="Open Launch - Featured on AI With Me"
                  className="h-8"
                />
              </a>

              {/* Featured on Startup Fame */}
              <a
                href="https://startupfa.me/s/open-launch?utm_source=open-launch.com"
                target="_blank"
                rel="noopener"
              >
                <img
                  src="https://startupfa.me/badges/featured/dark.webp"
                  alt="Featured on Startup Fame"
                  className="h-8"
                />
              </a>
              <a
                href="https://www.producthunt.com/products/open-launch?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-open-launch"
                target="_blank"
                rel="noopener"
                className="hidden dark:block"
              >
                <img
                  src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=972224&theme=neutral&t=1748776168767"
                  alt="Open Launch - The first complete open source alternative to Product Hunt. | Product Hunt"
                  className="h-8"
                />
              </a>
              <a
                href="https://www.producthunt.com/products/open-launch?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-open-launch"
                target="_blank"
                rel="noopener"
                className="block dark:hidden"
              >
                <img
                  src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=972224&theme=light&t=1748776063921"
                  alt="Open Launch - The first complete open source alternative to Product Hunt. | Product Hunt"
                  className="h-8"
                />
              </a>

              {/* Featured on MagicBox.tools */}
              <a
                href="https://magicbox.tools"
                target="_blank"
                rel="noopener"
                className="hidden dark:block"
              >
                <img
                  src="https://magicbox.tools/badge-dark.svg"
                  alt="Featured on MagicBox.tools"
                  className="h-8"
                />
              </a>
              <a
                href="https://magicbox.tools"
                target="_blank"
                rel="noopener"
                className="block dark:hidden"
              >
                <img
                  src="https://magicbox.tools/badge.svg"
                  alt="Featured on MagicBox.tools"
                  className="h-8"
                />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
