import { Link } from "@/i18n/navigation"

interface RelatedPagesCardProps {
  // Card heading (e.g. "Compare with", "Alternatives").
  heading: string
  // Each link: a slug under the corresponding aat.ee section + a
  // human-readable title. Caller decides which path prefix to use.
  pathPrefix: "/compare/" | "/alternatives/"
  links: Array<{ slug: string; title: string }>
}

/**
 * Generic compact list card used for the "Compare with" and
 * "Alternatives" sidebar widgets on the project detail page. Surfaces
 * the AI-generated /compare/[slug] and /alternatives/[slug] pages that
 * feature this project — the cron jobs build them but currently
 * nothing on the project page links to them.
 *
 * Returns null when there are no links so callers can render this
 * unconditionally without an empty card.
 */
export function RelatedPagesCard({ heading, pathPrefix, links }: RelatedPagesCardProps) {
  if (links.length === 0) return null

  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
        {heading}
      </p>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.slug}>
            <Link
              href={`${pathPrefix}${link.slug}`}
              className="text-foreground hover:text-primary block text-sm leading-snug underline-offset-4 hover:underline"
            >
              {link.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
