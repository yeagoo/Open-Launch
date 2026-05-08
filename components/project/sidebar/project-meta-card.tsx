import { RiGithubFill, RiTwitterFill } from "@remixicon/react"
import { format } from "date-fns"
import { useTranslations } from "next-intl"

interface ProjectMetaCardProps {
  scheduledDate: Date | null
  platforms: string[]
  pricing: string | null
  techStack: string[]
  githubUrl?: string | null
  twitterUrl?: string | null
}

/**
 * Single card grouping all the at-a-glance project metadata into a
 * scannable key:value table. Replaces the previous loose stack of
 * dotted-line rows so the eye doesn't track over a dozen separate
 * mini-sections.
 */
export function ProjectMetaCard({
  scheduledDate,
  platforms,
  pricing,
  techStack,
  githubUrl,
  twitterUrl,
}: ProjectMetaCardProps) {
  const t = useTranslations("project.sidebar")
  const hasSocials = !!githubUrl || !!twitterUrl
  const tags = (techStack ?? []).slice(0, 6)

  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground mb-4 text-xs font-medium tracking-wider uppercase">
        {t("projectInfo")}
      </p>

      <dl className="space-y-3 text-sm">
        {scheduledDate && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground text-xs">{t("launchDate")}</dt>
            <dd className="text-foreground font-medium tabular-nums">
              {format(scheduledDate, "yyyy-MM-dd")}
            </dd>
          </div>
        )}

        {platforms.length > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground text-xs">{t("platform")}</dt>
            <dd className="text-foreground font-medium capitalize">{platforms[0]}</dd>
          </div>
        )}

        {pricing && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground text-xs">{t("pricing")}</dt>
            <dd className="text-foreground font-medium capitalize">{pricing}</dd>
          </div>
        )}

        {hasSocials && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground text-xs">{t("socials")}</dt>
            <dd className="flex items-center gap-2">
              {githubUrl && (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="GitHub"
                >
                  <RiGithubFill className="h-4 w-4" />
                </a>
              )}
              {twitterUrl && (
                <a
                  href={twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Twitter"
                >
                  <RiTwitterFill className="h-4 w-4" />
                </a>
              )}
            </dd>
          </div>
        )}
      </dl>

      {tags.length > 0 && (
        <div className="border-border/60 mt-4 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-xs">{t("productKeywords")}</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="bg-muted text-muted-foreground inline-flex items-center rounded-md px-2 py-0.5 text-xs"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
