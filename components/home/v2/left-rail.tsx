import { Link } from "@/i18n/navigation"

import { SerifHeading } from "@/components/ds/serif-heading"
import { SoftCard } from "@/components/ds/soft-card"
import { StatPill } from "@/components/ds/stat-pill"

export interface HomeCommunityPost {
  id: number
  authorName: string
  authorImage: string | null
  projectName: string
  projectSlug: string
  projectLogo: string
  /** ISO 8601 string — crosses `unstable_cache`, which serializes Dates. */
  createdAt: string
  excerpt: string
}

interface LeftRailProps {
  labels: {
    launchesThisMonth: string
    makers: string
    latestPosts: string
  }
  stats: { launchesThisMonth: number; makers: number }
  posts: HomeCommunityPost[]
  /** BCP-47 tag for the counter formatting ("1 248" vs "1,248" vs "1,248"). */
  locale: string
}

/**
 * Number formatting with a guarded fallback: slim Node images ship reduced ICU
 * data, and an unformattable locale must not take the home page down.
 */
function createCounter(locale: string): (value: number) => string {
  try {
    const formatter = new Intl.NumberFormat(locale)
    return (value) => formatter.format(value)
  } catch {
    return (value) => String(value)
  }
}

/** Fallback avatar: the first letter of the display name on a tinted disc. */
function InitialAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="bg-home-accent-soft text-home-accent-strong flex size-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  )
}

/**
 * Left rail: the "this month" counters plus the community feed.
 *
 * The reference layout opens with a monthly-visits counter. This app has no
 * page-view table (analytics only ever went to Matomo/GA), so the counters here
 * are real database numbers instead — launches this month and registered
 * makers. Faking a visit count would have been the easier option and the wrong
 * one.
 */
export function LeftRail({ labels, stats, posts, locale }: LeftRailProps) {
  const counter = createCounter(locale)

  return (
    <div className="space-y-5">
      {/* `flex flex-col`, not `space-y-*`: StatPill renders an inline-flex
          span, and vertical margins do not apply to inline-level boxes — the
          two counters silently collided into one line on wide mobile rails. */}
      <SoftCard padding="md" className="flex flex-col items-start gap-2">
        <StatPill value={counter(stats.launchesThisMonth)} label={labels.launchesThisMonth} />
        <StatPill value={counter(stats.makers)} label={labels.makers} />
      </SoftCard>

      {posts.length > 0 && (
        <div className="space-y-3">
          <SerifHeading as="h2" size="eyebrow">
            {labels.latestPosts}
          </SerifHeading>
          <ul className="space-y-3">
            {posts.map((post) => (
              <li key={post.id}>
                <Link
                  href={`/projects/${post.projectSlug}`}
                  className="group flex gap-3 rounded-md transition-opacity hover:opacity-80"
                >
                  {post.authorImage ? (
                    // Avatars come from arbitrary OAuth/upload hosts, so they
                    // stay plain <img>: a remote-host allowlist for a 32px
                    // decorative circle is not worth the maintenance.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.authorImage}
                      alt=""
                      width={32}
                      height={32}
                      loading="lazy"
                      decoding="async"
                      className="bg-home-surface-muted size-8 flex-shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <InitialAvatar name={post.authorName} />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{post.projectName}</p>
                    <p className="text-muted-foreground line-clamp-2 text-[12px] leading-snug">
                      {post.excerpt}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
