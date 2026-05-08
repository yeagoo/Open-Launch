/* eslint-disable @next/next/no-img-element */
// Avatars come from arbitrary OAuth providers (GitHub / Google / Microsoft
// / Apple / Discord / etc.). Using next/image would require every host
// to be in next.config.ts remotePatterns; an unknown host would throw at
// runtime. A 40px <img> tag is the right tool here — small, plenty of
// browser cache, no optimization win to gain.
import { useTranslations } from "next-intl"

interface MakerCardProps {
  creator: {
    id: string
    name: string | null
    image: string | null
  } | null
}

/**
 * Top-of-sidebar maker presence card. Bigger than the previous one-line
 * "Publisher" row — a 12px avatar disappears, a 40px one establishes
 * "this is a real person who made this".
 */
export function MakerCard({ creator }: MakerCardProps) {
  const t = useTranslations("project.sidebar")

  if (!creator) {
    return (
      <div className="bg-card rounded-lg border p-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {t("maker")}
        </p>
        <p className="text-muted-foreground mt-2 text-sm">{t("unknownCreator")}</p>
      </div>
    )
  }

  const initial = creator.name?.charAt(0)?.toUpperCase() || "?"

  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
        {t("maker")}
      </p>
      <div className="flex items-center gap-3">
        {creator.image ? (
          <img
            src={creator.image}
            alt={creator.name || "Maker"}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">
            {creator.name || "Anonymous"}
          </p>
        </div>
      </div>
    </div>
  )
}
