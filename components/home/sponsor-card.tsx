import Link from "next/link";
import Image from "next/image";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

interface SponsorCardProps {
  name: string;
  description: string;
  url: string;
  imageUrl?: string; 
  icon?: React.ReactNode; 
  className?: string;
}

export function SponsorCard({ name, description, url, imageUrl, icon, className }: SponsorCardProps) {
  const isMailto = url.startsWith("mailto:");

  return (
    <Link
      href={url}
      target={isMailto ? undefined : "_blank"}
      rel={isMailto ? undefined : "noopener"}
      className={cn(
        "flex items-center -mx-3 gap-4 rounded-md p-3 transition-colors hover:bg-muted/40", // Always apply hover effect
        className
      )}
    >
      {icon ? (
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border bg-muted/30">
          {icon}
        </div>
      ) : imageUrl ? (
        <Image
          src={imageUrl}
          alt={`${name} logo`}
          width={36}
          height={36}
          className="rounded-lg border flex-shrink-0"
        />
      ) : null}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold flex items-center gap-1.5 truncate">
          {name}
          {!isMailto && <ExternalLink size={12} className="text-muted-foreground flex-shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {description}
        </p>
      </div>
    </Link>
  );
} 