#!/usr/bin/env bun
/**
 * Loads a sampled slice of REAL production rows into a local database, so the
 * app can be rendered against production shapes instead of a hand-written
 * fixture.
 *
 * Why: the synthetic fixture in `seed-local-home-fixture.ts` proves the layout
 * renders, but it cannot prove anything about the shapes production actually
 * has — 52 of 52 sampled projects carry a tech stack while 0 carry
 * `cover_image_url`, taglines are always present, `daily_ranking` is set on
 * only 12 of 52, and the launched/ongoing/scheduled split is nothing like an
 * even three-way. Rendering against those shapes is the point.
 *
 * The sample file is produced by a read-only SELECT against production (see
 * docs §23) and lives under `artifacts/`, which is gitignored.
 *
 * Safety:
 *  - refuses a non-loopback host
 *  - refuses a database whose name does not start with `open_launch_prodsample`
 *  - deletes only the tables it is about to fill, inside one transaction
 *
 * Usage:
 *   bun scripts/load-prod-sample.ts [path/to/sample.json]
 */
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { Client } from "pg"

const DEFAULT_SAMPLE = resolve(import.meta.dirname, "../artifacts/prod-sample.json")

const connectionString =
  process.env.PRODSAMPLE_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:55432/open_launch_prodsample"

const LOOPBACK = ["127.0.0.1", "localhost", "::1"]

/**
 * Query parameters node-postgres honours that OVERRIDE the authority section of
 * the URL. `postgresql://postgres@127.0.0.1:55432/db?host=evil.example.com`
 * passes any hostname check done on the URL while connecting to
 * evil.example.com, so their mere presence is disqualifying rather than
 * something to reconcile. (Verified: `?dbname=` does NOT override the path, so
 * the database half of the guard was already sound — the host half was not.)
 */
const CONNECTION_OVERRIDE_PARAMS = ["host", "hostaddr", "port", "dbname", "database"]

function assertLocalTarget(url: string): { database: string; host: string } {
  const parsed = new URL(url)

  for (const key of CONNECTION_OVERRIDE_PARAMS) {
    if (parsed.searchParams.has(key)) {
      throw new Error(
        `refusing a connection string carrying "?${key}=": pg resolves it AFTER the URL, so it ` +
          `would silently redirect this script away from the host it appears to target`,
      )
    }
  }

  // `new URL("postgresql://u@[::1]:5432/x").hostname` keeps the brackets, so
  // comparing against a bare "::1" could never match — legitimate IPv6 loopback
  // was rejected while looking supported.
  const host = parsed.hostname.replace(/^\[|\]$/g, "")
  const database = parsed.pathname.replace(/^\//, "")

  if (!LOOPBACK.includes(host)) {
    throw new Error(`refusing to load a sample into a non-loopback database: ${host}`)
  }
  if (!database.startsWith("open_launch_prodsample")) {
    throw new Error(
      `refusing to load into a database not named open_launch_prodsample*: ${database}`,
    )
  }
  return { database, host }
}

/**
 * The URL checks above validate what we INTENDED to reach. This validates what
 * we actually reached, which is the property the safety promise is really
 * about — and the only one that survives a parsing difference between our code
 * and the driver's.
 */
async function assertConnectedToLocalTarget(
  client: Client,
  expectedDatabase: string,
): Promise<void> {
  const { rows } = await client.query<{ db: string; addr: string | null }>(
    // `host()` strips the netmask: inet_server_addr() renders as "127.0.0.1/32",
    // which an exact-match allowlist would reject — including for the
    // legitimate target this script exists to serve.
    "select current_database() as db, host(inet_server_addr()) as addr",
  )
  const actual = rows[0]
  if (!actual) throw new Error("could not read the server identity after connecting")
  if (actual.db !== expectedDatabase) {
    throw new Error(`connected to database "${actual.db}", expected "${expectedDatabase}"`)
  }
  // NULL means a unix-domain socket, which is loopback by construction.
  if (actual.addr !== null && !["127.0.0.1", "::1"].includes(actual.addr)) {
    throw new Error(`connected to a non-loopback server address: ${actual.addr}`)
  }
}

interface Sample {
  projects: Record<string, unknown>[]
  translations: Record<string, unknown>[]
  upvoteCounts: { project_id: string; n: number }[]
  commentCounts: { project_id: string; n: number }[]
  projectCategories: { project_id: string; category_id: string }[]
  projectTags: { project_id: string; tag_id: string }[]
  creators: { id: string; name: string; image: string | null; is_bot: boolean }[]
  categories: { id: string; name: string }[]
  tags: { id: string; name: string; slug: string; project_count: number }[]
  comments: { id: number; page: string; author: string; content: unknown; timestamp: string }[]
  commentAuthors: { id: string; name: string; image: string | null; is_bot?: boolean }[]
  blogPosts: Record<string, unknown>[]
}

const { database: targetDatabase, host: targetHost } = assertLocalTarget(connectionString)
const samplePath = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_SAMPLE
const sample = JSON.parse(await readFile(samplePath, "utf8")) as Sample

console.log(`[prodsample] ${targetHost}/${targetDatabase} <- ${samplePath}`)
console.log(
  `[prodsample] projects=${sample.projects.length} comments=${sample.comments.length} creators=${sample.creators.length}`,
)

const client = new Client({ connectionString })
await client.connect()

try {
  // Re-check against the server itself: the URL guard and the driver can
  // disagree about which host a connection string resolves to (see B1).
  await assertConnectedToLocalTarget(client, targetDatabase)

  await client.query("BEGIN")

  // Every table is listed explicitly and CASCADE is deliberately NOT used.
  // The previous version listed nine tables with CASCADE, and the cascade
  // silently reached fourteen more — including `bookmark`, `notification` and
  // `promo_code_usage`, which hold user data. Listing them makes the blast
  // radius reviewable; omitting CASCADE turns any NEW dependency into a loud
  // error instead of quiet collateral damage.
  const TABLES_TO_CLEAR = [
    "project_to_category",
    "project_to_tag",
    "project_related",
    "upvote",
    "bookmark",
    "comment_report",
    "fuma_comments",
    "fuma_rates",
    "notification",
    "promo_code_usage",
    "launch_syndication",
    "hicyou_campaign_sync",
    "crawled_data",
    "product_hunt_import",
    "directory_order",
    "alternative_page_to_project",
    "alternative_page",
    "comparison_page",
    "project_translation",
    "project",
    "tag",
    "category",
    "blog_article",
  ]
  console.log(`[prodsample] clearing ${TABLES_TO_CLEAR.length} tables (no CASCADE)`)
  await client.query(`TRUNCATE ${TABLES_TO_CLEAR.join(", ")}`)

  for (const category of sample.categories) {
    await client.query(
      "INSERT INTO category (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
      [category.id, category.name],
    )
  }

  for (const tag of sample.tags) {
    await client.query(
      `INSERT INTO tag (id, name, slug, moderation_status, project_count)
       VALUES ($1, $2, $3, 'approved', $4) ON CONFLICT (id) DO NOTHING`,
      [tag.id, tag.name, tag.slug, tag.project_count],
    )
  }

  // Creators and comment authors only — no emails are sampled, so synthesize
  // placeholders that cannot be mistaken for real addresses.
  const people = [...sample.creators, ...sample.commentAuthors]
  const seen = new Set<string>()
  for (const person of people) {
    if (seen.has(person.id)) continue
    seen.add(person.id)
    await client.query(
      `INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at, role, banned, is_bot)
       VALUES ($1, $2, $3, true, $4, now(), now(), 'user', false, $5)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image`,
      [
        person.id,
        person.name,
        `${person.id}@prodsample.local`,
        person.image,
        person.is_bot ?? false,
      ],
    )
  }

  for (const project of sample.projects) {
    const row = project as Record<string, unknown>
    await client.query(
      `INSERT INTO project
         (id, name, slug, description, website_url, logo_url, cover_image_url, product_image,
          github_url, twitter_url, tech_stack, pricing, platforms, launch_status,
          scheduled_launch_date, launch_type, daily_ranking, featured_on_homepage,
          has_badge_verified, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now())`,
      [
        row.id,
        row.name,
        row.slug,
        row.description,
        row.website_url,
        row.logo_url,
        row.cover_image_url,
        row.product_image,
        row.github_url,
        row.twitter_url,
        row.tech_stack,
        row.pricing,
        row.platforms,
        row.launch_status,
        row.scheduled_launch_date,
        row.launch_type,
        row.daily_ranking,
        row.featured_on_homepage ?? false,
        row.has_badge_verified ?? false,
        row.created_by,
        row.created_at,
      ],
    )
  }

  for (const translation of sample.translations) {
    const row = translation as Record<string, unknown>
    await client.query(
      `INSERT INTO project_translation
         (project_id, locale, description, long_description, tagline, is_source, ai_generated)
       VALUES ($1,$2,$3,$4,$5,$6,true)`,
      [
        row.project_id,
        row.locale,
        row.description,
        row.long_description,
        row.tagline,
        row.is_source,
      ],
    )
  }

  for (const link of sample.projectCategories) {
    await client.query(
      "INSERT INTO project_to_category (project_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [link.project_id, link.category_id],
    )
  }
  for (const link of sample.projectTags) {
    await client.query(
      "INSERT INTO project_to_tag (project_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [link.project_id, link.tag_id],
    )
  }

  // Upvotes and comments are NOT sampled row-by-row (that would mean tens of
  // thousands of rows and a pile of user ids). Their real COUNTS are sampled
  // and the rows are generated to match, so ordering and chip numbers are the
  // production numbers while the payload stays small.
  const voters = sample.creators.map((creator) => creator.id)
  if (voters.length === 0) throw new Error("sample has no creators to attribute votes to")

  // The one-vote-per-user index means reaching production counts (hundreds per
  // project) needs that many distinct voters. Capping at the sampled creator
  // count silently flattened every project to ~40 votes, which would have made
  // the "ordered by upvotes" path look verified while proving nothing.
  const maxVotes = Math.max(0, ...sample.upvoteCounts.map((entry) => entry.n))
  const voterPoolSize = Math.min(Math.max(maxVotes, voters.length), 1000)
  await client.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at, role, banned, is_bot)
     SELECT 'sample-voter-' || g, 'Sample Voter ' || g, 'sample-voter-' || g || '@prodsample.local',
            true, now(), now(), 'user', false, false
     FROM generate_series(1, $1::int) AS g
     ON CONFLICT (id) DO NOTHING`,
    [voterPoolSize],
  )
  const voterPool = Array.from({ length: voterPoolSize }, (_, index) => `sample-voter-${index + 1}`)

  for (const { project_id, n } of sample.upvoteCounts) {
    await client.query(
      `INSERT INTO upvote (id, user_id, project_id, created_at)
       SELECT 'sample-vote-' || $1 || '-' || g, ($2::text[])[g], $1, now()
       FROM generate_series(1, LEAST($3::int, array_length($2::text[], 1))) AS g
       ON CONFLICT DO NOTHING`,
      [project_id, voterPool, n],
    )
  }

  // Bots are excluded from the author pool on purpose: the schema has a partial
  // unique index on (page, author) for bot authors, so reusing one across
  // comments on the same project would make ON CONFLICT drop rows silently and
  // leave the comment count below the sampled number.
  const commentAuthors = sample.creators.filter((creator) => !creator.is_bot).map((c) => c.id)
  if (commentAuthors.length === 0) {
    throw new Error("sample has no non-bot creators to attribute comments to")
  }

  const realBodies = sample.comments.map((comment) => comment.content)
  if (realBodies.length > 0) {
    // `row_number() OVER ()` restarts at 1 for every INSERT, so deriving the id
    // from it alone made every project collide on ids 100001.. and only the
    // first project's comments survived the ON CONFLICT. Offset per project.
    let commentIdBase = 100000
    for (const { project_id, n } of sample.commentCounts) {
      commentIdBase += 100
      await client.query(
        `INSERT INTO fuma_comments (id, page, author, content, timestamp)
         SELECT $5::int + row_number() OVER (),
                $1,
                ($2::text[])[1 + (g % array_length($2::text[], 1))],
                ($3::json[])[1 + (g % array_length($3::json[], 1))],
                now() - (g || ' minutes')::interval
         FROM generate_series(1, LEAST($4::int, 40)) AS g
         ON CONFLICT DO NOTHING`,
        [
          project_id,
          commentAuthors,
          realBodies.map((body) => JSON.stringify(body)),
          n,
          commentIdBase,
        ],
      )
    }
  }

  for (const post of sample.blogPosts) {
    const row = post as Record<string, unknown>
    await client.query(
      `INSERT INTO blog_article (id, slug, title, description, content, image, tags, status, published_at, created_at, updated_at)
       VALUES ($1,$1,$2,$3,$4,$5,$6,'published',$7, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        row.slug,
        row.title,
        row.description,
        "# Sampled post\n\nBody omitted.",
        row.image,
        row.tags,
        row.published_at,
      ],
    )
  }

  await client.query("COMMIT")
  console.log("[prodsample] loaded")
} catch (error) {
  await client.query("ROLLBACK")
  throw error
} finally {
  await client.end()
}
