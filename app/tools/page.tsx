import type { Metadata } from "next"
import Link from "next/link"

import { RiArrowRightLine, RiCheckboxCircleLine, RiCodeSSlashLine } from "@remixicon/react"

import { SerifHeading } from "@/components/ds/serif-heading"
import { SoftCard } from "@/components/ds/soft-card"

const PATH = "/tools"

export const metadata: Metadata = {
  title: "Free tools for makers | aat.ee",
  description:
    "Free tools for people launching a product: a launch-day checklist and a social meta tag generator. No account needed.",
  alternates: { canonical: `https://www.aat.ee${PATH}` },
  openGraph: {
    title: "Free tools for makers | aat.ee",
    description:
      "Free tools for people launching a product: a launch-day checklist and a social meta tag generator.",
    url: `https://www.aat.ee${PATH}`,
    siteName: "aat.ee",
    type: "website",
  },
}

/**
 * The tools hub.
 *
 * English-only, like `/compare` and `/alternatives`: the footer marks those as
 * `localized: false` and the sitemap registers them with `englishSitemapEntry`.
 * These pages are made of long-form instructional copy, so translating them is
 * a real editorial job rather than a find-and-replace; leaving them English is
 * the honest interim state, and they carry their own canonical URL.
 *
 * Every tool here runs entirely in the browser. Nothing fetches a
 * user-supplied URL, which is why there is no server-side work to abuse.
 */
export default function ToolsPage() {
  const tools = [
    {
      href: `${PATH}/launch-checklist`,
      icon: RiCheckboxCircleLine,
      name: "Launch-day checklist",
      description:
        "Everything worth doing before, during and after launch day. Your progress is kept in this browser.",
    },
    {
      href: `${PATH}/meta-tags`,
      icon: RiCodeSSlashLine,
      name: "Social meta tag generator",
      description:
        "Fill in a title, description and image, preview the card people will see, and copy the tags to paste.",
    },
  ]

  return (
    <div className="bg-secondary/20 min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 pt-8 pb-12">
        <nav aria-label="Breadcrumb" className="text-muted-foreground mb-4 text-sm">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>Tools</li>
          </ol>
        </nav>

        <div className="mb-8 space-y-2">
          <SerifHeading as="h1" size="section">
            Free tools for makers
          </SerifHeading>
          <p className="text-muted-foreground text-sm">
            No account, no email, no server round-trip — everything runs in your browser.
          </p>
        </div>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool.href}>
              <SoftCard asChild interactive padding="md" className="h-full">
                <Link href={tool.href} className="flex h-full flex-col gap-2 no-underline">
                  <tool.icon className="text-home-accent-strong h-5 w-5" aria-hidden="true" />
                  <span className="text-foreground font-semibold">{tool.name}</span>
                  <span className="text-muted-foreground flex-1 text-sm">{tool.description}</span>
                  <span className="text-home-accent-strong inline-flex items-center gap-1 text-sm font-medium">
                    Open
                    <RiArrowRightLine className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </SoftCard>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
