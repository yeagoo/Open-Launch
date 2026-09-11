#!/usr/bin/env bun
/**
 * Seeds the LOCAL database with a home-page-shaped dataset.
 *
 * Why: the redesigned home page needs a database to render, and production is
 * not an acceptable target for that. This fills a throwaway local cluster with
 * exactly the shapes the home sections read — a live launch window, completed
 * days, a future queue, comments (including bot-authored ones), blog posts and
 * the footer taxonomy — with counts deliberately mirroring production's scale
 * (7 live / 8 queued / ~1.7k makers) rather than a flattering fixture.
 *
 * Safety: refuses to run unless the target is loopback AND the database name
 * starts with `open_launch_local`. Same guard shape as `e2e/helpers/
 * release-fixture.ts`, and for the same reason — a seeding script that can be
 * pointed at production is a footgun.
 *
 * Idempotent: every insert is an upsert or `ON CONFLICT DO NOTHING`, so it can
 * be re-run after a schema change without dropping the database.
 *
 * Usage:
 *   bun scripts/seed-local-home-fixture.ts
 *   DATABASE_URL=... bun scripts/seed-local-home-fixture.ts
 */
import { Client } from "pg"

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1:55432/open_launch_local"

function assertLocalTarget(url: string): URL {
  const parsed = new URL(url)
  const database = parsed.pathname.replace(/^\//, "")
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error(`refusing to seed a non-loopback database: ${parsed.hostname}`)
  }
  if (!database.startsWith("open_launch_local")) {
    throw new Error(`refusing to seed a database not named open_launch_local*: ${database}`)
  }
  return parsed
}

const target = assertLocalTarget(connectionString)
console.log(`[seed] target ${target.hostname}:${target.port || 5432}/${target.pathname.slice(1)}`)

/**
 * Render a Date as a wall-clock timestamp for a `timestamp without time zone`
 * column.
 *
 * `scheduled_launch_date` has no time zone, and production stores it as literal
 * wall time — a launch on 2026-09-09 sits at `08:00`, not at a UTC instant. The
 * app compares it against `timestamptz` bounds, which PostgreSQL resolves in the
 * connection's zone, so what the column holds has to be the wall time the
 * comparison expects.
 *
 * Passing a Date instead lets `pg` serialise it in the machine's local zone:
 * `setUTCHours(8)` yields the instant 08:00Z, which `pg` writes as `16:00+08:00`
 * on a UTC+8 host, and the column keeps `16:00`. That put every fixture launch
 * eight hours later than production's, outside the winners window — so
 * `/winners` rendered its empty state locally and the card component was never
 * exercised during review.
 *
 * Formatting here rather than relying on `setHours` keeps the result identical
 * on any host, whatever its zone.
 */
function toWallClock(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  )
}

/** The launch window is 08:00 UTC → 08:00 UTC, so anchor fixtures to it. */
function launchWindowStart(dayOffset: number): Date {
  const start = new Date()
  start.setUTCHours(8, 0, 0, 0)
  if (start > new Date()) start.setUTCDate(start.getUTCDate() - 1)
  start.setUTCDate(start.getUTCDate() + dayOffset)
  return start
}

const TODAY = launchWindowStart(0)
const YESTERDAY = launchWindowStart(-1)
const TOMORROW = launchWindowStart(1)
const MONTH_ANCHOR = launchWindowStart(-10)

const CATEGORIES = [
  { id: "artificial-intelligence", name: "Artificial Intelligence" },
  { id: "productivity", name: "Productivity" },
  { id: "saas", name: "SaaS" },
  { id: "developer-tools", name: "Developer Tools" },
  { id: "marketing-tools", name: "Marketing Tools" },
  { id: "design-tools", name: "Design Tools" },
] as const

const TAGS = [
  { slug: "artificial-intelligence", name: "Artificial Intelligence", count: 422 },
  { slug: "productivity", name: "Productivity", count: 366 },
  { slug: "ai", name: "AI", count: 266 },
  { slug: "developer-tools", name: "Developer Tools", count: 262 },
  { slug: "saas", name: "SaaS", count: 236 },
  { slug: "marketing", name: "Marketing", count: 129 },
  { slug: "open-source", name: "Open Source", count: 96 },
  { slug: "github", name: "GitHub", count: 87 },
] as const

/** 7 live launches — the count production actually shows in the current window. */
const LIVE = [
  {
    name: "Nimbus Analytics",
    tagline: "Privacy-first product analytics with warehouse sync",
    category: "artificial-intelligence",
    votes: 312,
  },
  {
    name: "Slate Notes",
    tagline: "Markdown notebook that publishes straight to the web",
    category: "productivity",
    votes: 268,
  },
  {
    name: "Pixelforge",
    tagline: "App store screenshots from one Figma frame",
    category: "design-tools",
    votes: 194,
  },
  {
    name: "Mailstrait",
    tagline: "Deliverability monitoring for transactional email",
    category: "marketing-tools",
    votes: 88,
  },
  {
    name: "Quiet Hours",
    tagline: "Focus timer that blocks notifications across devices",
    category: "productivity",
    votes: 41,
  },
  {
    name: "Hexpack",
    tagline: "Bundle any web app into a signed desktop build",
    category: "developer-tools",
    votes: 27,
  },
  {
    name: "Ledgerlight",
    tagline: "Plain-text accounting that reconciles itself",
    category: "saas",
    votes: 12,
  },
] as const

const COMPLETED = [
  {
    name: "TarotGuide",
    tagline: "Daily tarot readings with a plain-language explainer",
    category: "productivity",
    votes: 410,
    day: -1,
  },
  {
    name: "ToolVerified",
    tagline: "Hand-checked AI, SaaS and developer tools",
    category: "developer-tools",
    votes: 388,
    day: -1,
  },
  {
    name: "Story Generator Tools",
    tagline: "Turn a one-line prompt into a full short story",
    category: "artificial-intelligence",
    votes: 172,
    day: -2,
  },
  {
    name: "AIforASMR",
    tagline: "Loopable ASMR video generated from text",
    category: "artificial-intelligence",
    votes: 165,
    day: -3,
  },
  {
    name: "Karpo",
    tagline: "Your AI sidekick for going out",
    category: "saas",
    votes: 247,
    day: -12,
  },
  {
    name: "VizNow AI",
    tagline: "AI video creation, enhancement and motion graphics",
    category: "artificial-intelligence",
    votes: 227,
    day: -18,
  },
] as const

const QUEUED = [
  "Beacon Logs",
  "Signaldeck",
  "Paperline",
  "Halfpipe",
  "Rootnote",
  "Clearpath",
  "Wavelength",
  "Boxcar",
] as const

const TAG_SLUGS = new Set<string>(TAGS.map((tag) => tag.slug))

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

/** Fuma comment bodies are ProseMirror/Tiptap docs, not plain strings. */
function commentBody(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  })
}

const client = new Client({ connectionString })
await client.connect()

try {
  await client.query("BEGIN")

  // ── Taxonomy ──────────────────────────────────────────────────────────────
  for (const category of CATEGORIES) {
    await client.query(
      `INSERT INTO category (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [category.id, category.name],
    )
  }

  for (const tag of TAGS) {
    await client.query(
      `INSERT INTO tag (id, name, slug, moderation_status, project_count)
       VALUES ($1, $2, $1, 'approved', $3)
       ON CONFLICT (id) DO UPDATE SET project_count = EXCLUDED.project_count`,
      [tag.slug, tag.name, tag.count],
    )
  }

  // A pending tag proves the footer's moderation filter is doing something.
  await client.query(
    `INSERT INTO tag (id, name, slug, moderation_status, project_count)
     VALUES ('unmoderated-spam', 'Unmoderated Spam', 'unmoderated-spam', 'pending', 9999)
     ON CONFLICT (id) DO UPDATE SET project_count = EXCLUDED.project_count`,
  )

  // ── People ────────────────────────────────────────────────────────────────
  // One maker has no avatar on purpose: the avatar stack must not break on
  // `image IS NOT NULL`, and the hero's initials fallback should be exercised.
  const makers = [
    { id: "maker-1", name: "Vladyslav Havrylash", image: "https://i.pravatar.cc/64?img=12" },
    { id: "maker-2", name: "HTML5 Development", image: null },
    { id: "maker-3", name: "郑晓欣", image: "https://i.pravatar.cc/64?img=32" },
    { id: "maker-4", name: "ji xiang", image: "https://i.pravatar.cc/64?img=45" },
    { id: "maker-5", name: "Contact", image: "https://i.pravatar.cc/64?img=58" },
  ]

  for (const maker of makers) {
    await client.query(
      `INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at, role, banned, is_bot)
       VALUES ($1, $2, $3, true, $4, now(), now(), 'user', false, false)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image`,
      [maker.id, maker.name, `${maker.id}@local.test`, maker.image],
    )
  }

  // A bot account, matching the `bot-user-*` id convention the app uses.
  await client.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, banned, is_bot)
     VALUES ('bot-user-1', 'cobra_keys', 'bot-user-1@local.test', true, now(), now(), 'user', false, true)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
  )

  // The rest of the maker population, so "Join N makers" has a real number.
  await client.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, banned, is_bot)
     SELECT 'bulk-' || g, 'Maker ' || g, 'bulk-' || g || '@local.test', true, now(), now(), 'user', false, false
     FROM generate_series(1, 1700) AS g
     ON CONFLICT (id) DO NOTHING`,
  )

  // ── Projects ──────────────────────────────────────────────────────────────
  const upsertProject = async (input: {
    name: string
    tagline: string
    status: "ongoing" | "launched" | "scheduled"
    /** Wall-clock timestamp, already formatted for the column. */
    launchAt: string
    votes: number
    category: string
    makerIndex: number
    /** Ranks 1-3 are what `/winners` shows; leave undefined for everything else. */
    dailyRanking?: number
  }) => {
    const slug = slugify(input.name)
    const id = `project-${slug}`
    await client.query(
      `INSERT INTO project
         (id, name, slug, description, website_url, logo_url, pricing, launch_status,
          scheduled_launch_date, daily_ranking, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'free', $7, $8, $10, $9, now(), now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         launch_status = EXCLUDED.launch_status,
         scheduled_launch_date = EXCLUDED.scheduled_launch_date,
         daily_ranking = EXCLUDED.daily_ranking`,
      [
        id,
        input.name,
        slug,
        `<p>${input.tagline}. Built by a small team, shipped this week.</p>`,
        `https://example.com/${slug}`,
        `https://api.dicebear.com/9.x/shapes/svg?seed=${slug}`,
        input.status,
        input.launchAt,
        makers[input.makerIndex % makers.length].id,
        input.dailyRanking ?? null,
      ],
    )
    await client.query(
      `INSERT INTO project_to_category (project_id, category_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, input.category],
    )
    // Categories and tags are separate taxonomies with overlapping-but-not-equal
    // ids, so only link a tag that actually exists.
    if (TAG_SLUGS.has(input.category)) {
      await client.query(
        `INSERT INTO project_to_tag (project_id, tag_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [id, input.category],
      )
    }
    // Votes are what the feed orders by, so they must differ per project.
    for (let vote = 0; vote < input.votes; vote += 1) {
      await client.query(
        `INSERT INTO upvote (id, user_id, project_id, created_at)
         VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING`,
        [`upvote-${slug}-${vote}`, `bulk-${(vote % 1700) + 1}`, id],
      )
    }
    return id
  }

  const liveIds: string[] = []
  for (const [index, project] of LIVE.entries()) {
    liveIds.push(
      await upsertProject({
        ...project,
        status: "ongoing",
        launchAt: toWallClock(TODAY),
        makerIndex: index,
      }),
    )
  }

  const completedIds: string[] = []
  for (const [index, project] of COMPLETED.entries()) {
    const launchAt = new Date(YESTERDAY)
    launchAt.setUTCDate(launchAt.getUTCDate() + (project.day + 1))
    completedIds.push(
      await upsertProject({
        ...project,
        status: "launched",
        launchAt: toWallClock(launchAt),
        makerIndex: index + 1,
        // The first three launched yesterday (`day: -1`) stand in for the
        // ranks the 08:00 cron would have stamped, so `/winners` has content.
        // Without them the page renders its empty state and its card component
        // — where the r35 token migration was missed — never renders at all.
        ...(project.day === -1 && index < 3 ? { dailyRanking: index + 1 } : {}),
      }),
    )
  }

  const queuedIds: string[] = []
  for (const [index, name] of QUEUED.entries()) {
    queuedIds.push(
      await upsertProject({
        name,
        tagline: `Scheduled for the next launch window (#${index + 1} in the queue)`,
        status: "scheduled",
        launchAt: toWallClock(TOMORROW),
        votes: 0,
        category: CATEGORIES[index % CATEGORIES.length].id,
        makerIndex: index,
      }),
    )
  }

  // One project further out, so "this month" is bigger than the visible rows.
  await upsertProject({
    name: "Archive Runner",
    tagline: "Long-running archive jobs with resumable checkpoints",
    status: "launched",
    launchAt: toWallClock(MONTH_ANCHOR),
    votes: 64,
    category: "developer-tools",
    makerIndex: 2,
  })

  // ── Detail-page content ───────────────────────────────────────────────────
  // The home page only needs name/tagline/logo, but the project detail page
  // renders cover art, a long description, tech stack and social links. Without
  // these the page audits as an empty shell and any redesign of it would be
  // designed against a shape that never occurs in production.
  const LONG_DESCRIPTION = `## What it does

Hexpack takes a web app you already ship and wraps it in a signed desktop
bundle for macOS, Windows and Linux — no Electron boilerplate, no second build
pipeline to maintain.

## Why we built it

We kept writing the same packaging scripts for every side project. Signing and
notarisation were the steps that broke, usually the night before a launch, so
we made those the steps that are handled for you.

## What is in the box

- One command to produce a signed bundle for all three platforms
- Automatic notarisation and a stapled ticket for offline installs
- Auto-update channel wired to your existing release tags`

  for (const [index, id] of liveIds.entries()) {
    const marker = LIVE[index] ?? LIVE[0]
    const slug = slugify(marker.name)
    await client.query(
      `UPDATE project SET
         product_image = $2,
         cover_image_url = $2,
         github_url = $3,
         twitter_url = $4,
         tech_stack = $5,
         platforms = ARRAY['macOS','Windows','Linux']
       WHERE id = $1`,
      [
        id,
        `https://picsum.photos/seed/${slug}/1200/630`,
        `https://github.com/example/${slug}`,
        `https://twitter.com/${slug.replace(/-/g, "")}`,
        ["TypeScript", "Rust", "Tauri"],
      ],
    )
    // The source-locale translation row carries the long description and the
    // tagline the detail page reads.
    await client.query(
      `INSERT INTO project_translation
         (project_id, locale, description, long_description, tagline, is_source, ai_generated)
       VALUES ($1, 'en', $2, $3, $4, true, false)
       ON CONFLICT (project_id, locale) DO UPDATE SET
         description = EXCLUDED.description,
         long_description = EXCLUDED.long_description,
         tagline = EXCLUDED.tagline`,
      [
        id,
        `<p>${marker.tagline}. Built by a small team, shipped this week.</p>`,
        LONG_DESCRIPTION,
        marker.tagline,
      ],
    )
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  // Mix of human and bot authors, mirroring production's ratio so the rail is
  // rendered under realistic conditions.
  const commenters = [
    {
      author: "bot-user-1",
      text: "Tried a few of these curated directories before. Usually the signal-to-noise dies once sponsored listings creep in.",
    },
    {
      author: "maker-3",
      text: "The warehouse sync is the part I care about — does it handle late-arriving dimensions, or do I need to backfill on a schedule?",
    },
    {
      author: "maker-1",
      text: "Shipped this after six weeks of nights and weekends. Happy to answer anything about the packaging pipeline.",
    },
    {
      author: "bot-user-1",
      text: "Bookmarked. The publishing flow is exactly what I have been hacking together with a static site and a folder of shell scripts.",
    },
    {
      author: "maker-4",
      text: "Does the free tier include custom domains, or is that paid only?",
    },
  ]

  for (const [index, comment] of commenters.entries()) {
    const projectId = liveIds[index % liveIds.length]
    const timestamp = new Date()
    timestamp.setUTCMinutes(timestamp.getUTCMinutes() - index * 37)
    await client.query(
      `INSERT INTO fuma_comments (id, page, author, content, timestamp)
       VALUES ($1, $2, $3, $4::json, $5)
       ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content`,
      [2000 + index, projectId, comment.author, commentBody(comment.text), timestamp],
    )
  }

  // A tombstoned comment: must never reach the rail.
  // Authored by a human account on purpose — `fuma_comments_bot_page_author_uniq`
  // allows a bot only ONE comment per project, so reusing `bot-user-1` here would
  // collide with the row above.
  await client.query(
    `INSERT INTO fuma_comments (id, page, author, content, timestamp, hidden_at)
     VALUES (2999, $1, 'maker-2', $2::json, now(), now())
     ON CONFLICT (id) DO UPDATE SET hidden_at = now()`,
    [liveIds[0], commentBody("THIS SHOULD NEVER APPEAR — hidden comment")],
  )

  // ── Blog ──────────────────────────────────────────────────────────────────
  const posts = [
    {
      slug: "pre-launch-checklist",
      title: "The Pre-Launch Checklist: 3 Weeks to Launch Day",
      tags: ["Guides"],
    },
    {
      slug: "state-of-launches-2026",
      title: "State of Product Launches: 2026 So Far",
      tags: ["Product"],
    },
  ]
  for (const [index, post] of posts.entries()) {
    await client.query(
      `INSERT INTO blog_article (id, slug, title, description, content, tags, status, published_at, created_at, updated_at)
       VALUES ($1, $1, $2, $3, $4, $5, 'published', $6, now(), now())
       ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title`,
      [
        post.slug,
        post.title,
        "A short, opinionated guide with the three things most makers forget.",
        "# Draft body\n\nRendered from the local fixture.",
        post.tags,
        new Date(Date.now() - (index + 1) * 86400_000),
      ],
    )
  }
  // A draft: `getLatestBlogPosts` must exclude it.
  await client.query(
    `INSERT INTO blog_article (id, slug, title, description, content, tags, status, published_at, created_at, updated_at)
     VALUES ('draft-post', 'draft-post', 'DRAFT — SHOULD NOT APPEAR ON HOME', 'draft', 'x', ARRAY['Draft'], 'draft', now(), now(), now())
     ON CONFLICT (id) DO UPDATE SET status = 'draft'`,
  )

  await client.query("COMMIT")
  console.log(
    `[seed] ok — ${liveIds.length} live, ${completedIds.length} completed, ${queuedIds.length} queued, ${posts.length} posts, ${commenters.length + 1} comments`,
  )
} catch (error) {
  await client.query("ROLLBACK")
  throw error
} finally {
  await client.end()
}
