import Image from "next/image"
import Link from "next/link"

import { ExternalLink } from "lucide-react"

import { getActiveSponsors, type Sponsor } from "@/lib/sponsors"

import { SidebarExplore } from "./sidebar-explore"

/**
 * Sidebar block: live Ultra-tier sponsors + Explore links.
 *
 * Server component — fetches sponsor rows from `directory_order`
 * (joined to `project`) on every render. Pages using the sidebar
 * are typically `force-static` with a 1h `revalidate`, so a new
 * Ultra subscription appears on the sidebar within an hour of
 * payment without any extra plumbing.
 *
 * The "Sponsors" section hides entirely when no slots are taken,
 * so an early-stage launch doesn't show an empty header.
 */
export async function SidebarSponsors() {
  const sponsors = await getActiveSponsors()

  return (
    <div className="space-y-4 py-4">
      {sponsors.length > 0 && (
        <>
          <h3 className="flex items-center gap-2 font-semibold">Sponsors</h3>
          <div className="space-y-3">
            {sponsors.map((sponsor) => (
              <SponsorCard key={sponsor.id} sponsor={sponsor} />
            ))}
          </div>
        </>
      )}
      <SidebarExplore />
    </div>
  )
}

function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
  return (
    <Link
      href={sponsor.url}
      target="_blank"
      // `sponsored` rel value is the standard SEO marker for paid
      // placements; `noopener` + `noreferrer` are baseline safety.
      rel="noopener noreferrer sponsored"
      // Bold border + subtle shadow so the paid slot reads as the
      // most prominent block in the sidebar. The visual weight is the
      // deliverable Ultra subscribers are paying for; muted styling
      // would undercut that.
      className="group border-primary/40 hover:border-primary hover:bg-muted/50 block rounded-lg border-2 p-3 shadow-sm transition-colors"
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
            <span className="text-foreground group-hover:text-primary text-sm font-bold transition-colors">
              {sponsor.name}
            </span>
            <ExternalLink className="text-muted-foreground h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="text-muted-foreground line-clamp-2 text-xs font-medium">
            {sponsor.description}
          </p>
        </div>
      </div>
    </Link>
  )
}
