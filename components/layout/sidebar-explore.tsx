"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { ArrowRightLeft, Layers } from "lucide-react"

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

/**
 * Small client island for the sidebar's "Explore" block. Lives
 * apart from the sponsor list so the parent stays a server
 * component and the sponsor data fetch runs on the server.
 *
 * Hides itself on pages that already host their own Explore More
 * section (compare/* and alternatives/*).
 */
export function SidebarExplore() {
  const pathname = usePathname()
  if (pathname.startsWith("/compare") || pathname.startsWith("/alternatives")) {
    return null
  }

  return (
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
  )
}
