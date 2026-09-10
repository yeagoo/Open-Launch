import { Link } from "@/i18n/navigation"

import { PillButton } from "@/components/ds/pill-button"

interface PremiumSpotProps {
  title: string
  cta: string
  href: string
}

/**
 * Dashed "this slot is for sale" placeholder from the reference layout, wired
 * to the real paid placement product (premium launches / badge fast-track)
 * instead of a dead decorative box.
 */
export function PremiumSpot({ title, cta, href }: PremiumSpotProps) {
  return (
    <div className="border-home-hairline-strong rounded-home-card flex flex-col items-center justify-center gap-3 border border-dashed px-6 py-8 text-center">
      <p className="text-muted-foreground text-sm">{title}</p>
      <PillButton asChild variant="soft" size="sm">
        <Link href={href}>{cta}</Link>
      </PillButton>
    </div>
  )
}
