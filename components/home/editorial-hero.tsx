import Image from "next/image"

import { Link } from "@/i18n/navigation"
import { RiChat3Line, RiThumbUpLine } from "@remixicon/react"

import { oneLineSummary } from "@/lib/text-summary"
import { Badge } from "@/components/ui/badge"

interface HeroProject {
  id: string
  slug: string
  name: string
  tagline?: string | null
  description: string | null
  logoUrl: string
  upvoteCount: number
  commentCount?: number | null
  categories?: { id: string; name: string }[]
}

interface EditorialHeroProps {
  projects: HeroProject[]
  // Section heading rendered above the cards. Caller controls i18n.
  heading: string
  // Optional small label rendered above the heading (e.g. the date).
  kicker?: string
}

/**
 * Three featured-project long cards for the editorial home page.
 *
 * Replaces the dense uniform grid with a hierarchical layout: bigger
 * type, more whitespace, serif title, AI 1-liner from the description.
 * Designed to feel more like a daily reading list than a leaderboard.
 *
 * Falls back gracefully if `projects.length < 3` (renders fewer cards).
 */
export function EditorialHero({ projects, heading, kicker }: EditorialHeroProps) {
  const top = projects.slice(0, 3)
  if (top.length === 0) return null

  return (
    <section className="space-y-6">
      <div className="border-border/40 border-b pb-4">
        {kicker && (
          <p className="text-muted-foreground mb-1 font-mono text-xs tracking-wider uppercase">
            {kicker}
          </p>
        )}
        <h2 className="font-editorial text-2xl font-semibold tracking-tight sm:text-3xl">
          {heading}
        </h2>
      </div>

      <div className="space-y-5">
        {top.map((p, idx) => (
          <HeroCard key={p.id} project={p} index={idx + 1} />
        ))}
      </div>
    </section>
  )
}

function HeroCard({ project, index }: { project: HeroProject; index: number }) {
  // Tagline (one-line marketing copy entered by the maker) wins; fall
  // back to the AI-extracted first sentence of the description.
  const summary = project.tagline?.trim() || oneLineSummary(project.description)
  return (
    <Link
      href={`/projects/${project.slug}`}
      className="group hover:border-foreground/20 hover:bg-muted/30 border-border/40 relative block rounded-xl border p-5 transition-colors"
    >
      <div className="flex items-start gap-5">
        {/* Rank number — editorial flourish */}
        <div className="flex flex-shrink-0 flex-col items-center gap-2">
          <span className="text-muted-foreground/50 font-editorial text-2xl font-semibold tabular-nums">
            {String(index).padStart(2, "0")}
          </span>
          <div className="bg-muted relative h-14 w-14 overflow-hidden rounded-md sm:h-16 sm:w-16">
            {project.logoUrl && (
              <Image
                src={project.logoUrl}
                alt={`${project.name} logo`}
                fill
                quality={95}
                className="object-contain"
                sizes="64px"
              />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-editorial group-hover:text-primary text-foreground text-xl leading-tight font-semibold transition-colors sm:text-2xl">
            {project.name}
          </h3>
          {summary && (
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
              {summary}
            </p>
          )}

          <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-3 text-xs">
            {project.categories && project.categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {project.categories.slice(0, 2).map((cat) => (
                  <Badge
                    key={cat.id}
                    variant="outline"
                    className="text-[11px] font-normal capitalize"
                  >
                    {cat.name}
                  </Badge>
                ))}
              </div>
            )}
            <span className="flex items-center gap-1">
              <RiThumbUpLine className="h-3.5 w-3.5" />
              {project.upvoteCount}
            </span>
            {typeof project.commentCount === "number" && project.commentCount > 0 && (
              <span className="flex items-center gap-1">
                <RiChat3Line className="h-3.5 w-3.5" />
                {project.commentCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
