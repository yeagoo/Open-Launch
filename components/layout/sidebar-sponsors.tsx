import { SidebarExplore } from "./sidebar-explore"

/**
 * Sidebar block. The Ultra "sponsor slot" product was retired when Ultra
 * became a one-time tier (full directory network + GEO articles), so the
 * paid-sponsor section was removed; this now just renders the Explore
 * links. The component name + export are kept so the pages embedding it
 * don't need to change.
 */
export function SidebarSponsors() {
  return (
    <div className="space-y-4 py-4">
      <SidebarExplore />
    </div>
  )
}
