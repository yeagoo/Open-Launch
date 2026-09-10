import { Link } from "@/i18n/navigation"

import { SerifHeading } from "@/components/ds/serif-heading"
import { SoftCard } from "@/components/ds/soft-card"
import { TagPill } from "@/components/ds/tag-pill"

export interface HomeBlogPost {
  slug: string
  title: string
  description: string | null
  image: string | null
  tags: string[] | null
  /**
   * ISO 8601 string, NOT a Date — the value crosses `unstable_cache`, which
   * serializes its return value, so a Date comes back as a string anyway.
   * Declaring it a string keeps the type honest and forces callers to parse.
   */
  publishedAt: string
}

interface BlogStripProps {
  title: string
  posts: HomeBlogPost[]
  locale: string
}

/**
 * Date formatting that cannot take the page down.
 *
 * Two distinct failure modes are handled, both of which have bitten here:
 * a reduced-ICU runtime that rejects the locale (hence the try/catch around
 * building the formatter), and a value that is not a valid date at all —
 * `Intl.format()` throws `RangeError: Invalid time value` for those, so the
 * parsed date is validated before use and the raw string is the last resort.
 */
function createDateFormatter(locale: string): (value: string | Date) => string {
  let formatter: Intl.DateTimeFormat | null = null
  try {
    formatter = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    formatter = null
  }

  return (value) => {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    if (!formatter) return date.toISOString().slice(0, 10)
    return formatter.format(date)
  }
}

/**
 * "Latest from the blog" strip under the feed.
 *
 * The cover art is drawn with palette tokens rather than loaded from a bitmap:
 * the arch is the reference layout's editorial signature, and drawing it in CSS
 * keeps the strip free of image requests, LCP contention and dark-mode
 * mismatches. A post that does have a real `image` still uses it.
 */
export function BlogStrip({ title, posts, locale }: BlogStripProps) {
  if (posts.length === 0) return null

  const formatDate = createDateFormatter(locale)

  return (
    <section className="space-y-4">
      <SerifHeading as="h2">{title}</SerifHeading>
      <div className="grid gap-4 sm:grid-cols-2">
        {posts.map((post) => (
          <SoftCard key={post.slug} asChild interactive padding="none" className="overflow-hidden">
            <Link href={`/blog/${post.slug}`} className="flex h-full flex-col">
              <div className="from-home-highlight-soft to-home-surface relative h-28 overflow-hidden bg-gradient-to-b">
                {post.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="from-home-highlight to-home-highlight-soft absolute inset-x-8 top-7 -bottom-1 rounded-t-full bg-gradient-to-b" />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {post.tags?.[0] && <TagPill>{post.tags[0]}</TagPill>}
                  <span className="text-muted-foreground text-[11px]">
                    {formatDate(post.publishedAt)}
                  </span>
                </div>
                <SerifHeading as="h3" size="card" className="line-clamp-2">
                  {post.title}
                </SerifHeading>
                {post.description && (
                  <p className="text-muted-foreground line-clamp-2 text-[13px] leading-snug">
                    {post.description}
                  </p>
                )}
              </div>
            </Link>
          </SoftCard>
        ))}
      </div>
    </section>
  )
}
