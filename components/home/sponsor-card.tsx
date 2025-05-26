import Image from "next/image"
import Link from "next/link"

import { ExternalLink } from "lucide-react"

import { cn } from "@/lib/utils"

interface SponsorCardProps {
  name: string
  description: string
  url: string
  imageUrl?: string
  icon?: React.ReactNode
  className?: string
}

export function SponsorCard({
  name,
  description,
  url,
  imageUrl,
  icon,
  className,
}: SponsorCardProps) {
  const isMailto = url.startsWith("mailto:")

  return (
    <Link
      href={url}
      target={isMailto ? undefined : "_blank"}
      rel={isMailto ? undefined : "noopener"}
      className={cn(
        "bg-secondary/70 hover:bg-secondary border-primary block rounded-md border-l-4 px-5 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-colors",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {icon ? (
          <div className="bg-muted/30 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg border">
            {icon}
          </div>
        ) : imageUrl ? (
          <Image
            src={imageUrl}
            alt={`${name} logo`}
            width={48}
            height={48}
            className="flex-shrink-0 rounded-lg border"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
            {name}
            {!isMailto && (
              <ExternalLink size={12} className="text-muted-foreground flex-shrink-0" />
            )}
          </div>
          <p className="text-muted-foreground truncate text-xs">{description}</p>
        </div>
      </div>
    </Link>
  )
}
