"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { ArrowRightLeft, ExternalLink, Layers } from "lucide-react"

interface Sponsor {
  name: string
  description: string
  url: string
  logoUrl: string
}

const sponsors: Sponsor[] = [
  {
    name: "ii.Pe",
    description: "A zero-upload, browser-based file conversion tool.",
    url: "https://ii.pe",
    logoUrl: "https://statics.aat.ee/logos/1768923821937-3jd6itzhhxa.avif",
  },
  {
    name: "ScreenHello",
    description: "Beautiful Screenshots in Seconds | Online Mockup Generator",
    url: "https://screenhello.com",
    logoUrl: "https://statics.aat.ee/logos/1768924192870-5aa3cxgphay.avif",
  },
  {
    name: "EOL.Wiki",
    description: "Know when your software reaches end of life",
    url: "https://eol.wiki/",
    logoUrl: "https://statics.aat.ee/logos/1773211667127-g2ha01fraao.avif",
  },
]

const exploreLinks = [
  {
    href: "/compare",
    icon: ArrowRightLeft,
    label: "Compare Tools",
    description: "Side-by-side comparisons",
  },
  {
    href: "/alternatives",
    icon: Layers,
    label: "Alternatives",
    description: "Find similar products",
  },
]

export function SidebarSponsors() {
  const pathname = usePathname()
  // Hide the explore block on pages that already have their own Explore More section
  const hideExplore = pathname.startsWith("/compare") || pathname.startsWith("/alternatives")

  return (
    <div className="space-y-4 py-4">
      <h3 className="flex items-center gap-2 font-semibold">Sponsors</h3>
      <div className="space-y-3">
        {sponsors.map((sponsor) => (
          <Link
            key={sponsor.name}
            href={sponsor.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="group hover:bg-muted/50 block rounded-lg border p-3 transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="bg-background shrink-0 overflow-hidden rounded-md border p-1">
                <Image
                  src={sponsor.logoUrl}
                  alt={`${sponsor.name} Logo`}
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground group-hover:text-primary text-sm font-medium transition-colors">
                    {sponsor.name}
                  </span>
                  <ExternalLink className="text-muted-foreground h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="text-muted-foreground line-clamp-2 text-xs">{sponsor.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {!hideExplore && (
        <div className="border-border/50 border-t pt-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold">Explore</h3>
          <div className="space-y-1">
            {exploreLinks.map(({ href, icon: Icon, label, description }) => (
              <Link
                key={href}
                href={href}
                className="hover:bg-muted/50 group flex items-center gap-3 rounded-md p-2 transition-colors"
              >
                <Icon className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-colors" />
                <div className="min-w-0">
                  <div className="text-sm leading-none font-medium">{label}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
