# Blog editorial calendar

Four content tracks, each doing a specific job. Posts are authored as
`content/blog/*.mdx` (frontmatter + MDX body) and published with
`bun run blog:seed` (idempotent upsert into the `blog_article` table).

**Per-post rules:** open with a 2–3 sentence TL;DR/definition block (LLM-quotable);
`##`/`###` headings; one table or checklist; an FAQ section; internal links to
`/projects/submit`, `/pricing`, and relevant `/categories` · `/compare` · `/friends`;
contextual CTA at the end. English-first; translate top performers later.

**How the files map to the DB:** `content/blog/*.mdx` → `blog_article` (English
source of truth). Hand-written translations live in `content/blog/<locale>/*.mdx`
and land in `blog_article_translation` — the same table the `translate-blog` cron
fills with machine translations. Locale directories are picked up automatically and
the directory name is what sets the locale — a `locale:` frontmatter key is kept
for readability but is not read by the script.

## Tracks

- **GEO** — GEO/AIEO & search-visibility guides (the moat: rank + get LLM-cited → directory/GEO tiers)
- **PLAY** — Founder launch playbooks (high-intent → sign-ups)
- **BEST** — "Best [category] tools" roundups (traffic + "best X" LLM citations)
- **DATA** — Data/trend reports from aat.ee's own data (linkable authority)

## Calendar (first 12)

| #   | Track | Title                                                                    | Slug                                | Primary keyword                    | Main CTA               | Status              |
| --- | ----- | ------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------- | ---------------------- | ------------------- |
| 1   | GEO   | GEO & AIEO: How to Get Your Product Recommended by AI                    | `geo-aieo-get-recommended-by-ai`    | get recommended by AI / GEO        | submit + pricing       | ✅ live             |
| 2   | GEO   | How to Get ChatGPT, Claude, Perplexity & Gemini to Name Your Product     | `get-named-by-ai-assistants`        | get product recommended by ChatGPT | pricing                | ✅ live             |
| 3   | GEO   | Dofollow Directory Backlinks for SaaS in 2026                            | `dofollow-directory-backlinks-saas` | dofollow backlinks SaaS            | pricing + friends      | ✅ live             |
| 4   | GEO   | What Domain Rating (DR) Is and Why It Matters for AI Visibility          | `domain-rating-dr-ai-visibility`    | domain rating                      | pricing                | ✅ live             |
| 5   | PLAY  | The Pre-Launch Checklist: 3 Weeks to Launch Day                          | `pre-launch-checklist`              | product launch checklist           | submit                 | ✅ live             |
| 6   | PLAY  | How to Get Your First 100 Users After Launch                             | `first-100-users-after-launch`      | first 100 users                    | submit                 | ✅ live             |
| 7   | PLAY  | Where to Launch in 2026: Product Hunt and How to Choose Alternatives     | `where-to-launch-2026`              | product hunt alternatives          | submit + /alternatives | ✅ live             |
| 8   | BEST  | Best AI Writing Tools (2026)                                             | `best-ai-writing-tools`             | best AI writing tools              | /categories + submit   | todo                |
| 9   | BEST  | Best Product Hunt Alternatives (2026)                                    | `best-product-hunt-alternatives`    | product hunt alternatives          | submit                 | ✅ superseded by B1 |
| 10  | BEST  | Best [Category] Tools — repeatable template, seed from top `/categories` | `best-<category>-tools`             | best [category] tools              | /categories + submit   | cron-generated      |
| 11  | DATA  | State of Product Launches 2026 (annual flagship)                         | `state-of-product-launches-2026`    | product launch trends              | submit                 | ✅ live             |
| 12  | DATA  | Monthly Launch Recap: Top Products & Trends (recurring)                  | `launch-recap-<yyyy>-<mm>`          | monthly product launches           | submit                 | cron-generated      |

#9 was superseded by `product-hunt-alternatives` (B1 below), which covers the same
"product hunt alternatives" intent as a seven-way comparison rather than a thin
roundup. #10 and #12 are written by `generate-blog-roundup` / `generate-blog-recap`
as drafts for review, so do not hand-author those slugs.

## Bilingual batch (EN + ZH, hand-written)

Five posts written in English and Chinese together, published 2026-06-30 → 2026-07-13.
Both locales are live in the DB; the zh rows are hand-written, not machine output.

| #   | Track    | Title (EN)                                                                | Slug                                | Primary keyword                | Main CTA         |
| --- | -------- | ------------------------------------------------------------------------- | ----------------------------------- | ------------------------------ | ---------------- |
| B1  | BEST+GEO | Product Hunt Alternatives in 2026: 7 Places to Launch (and How to Choose) | `product-hunt-alternatives`         | product hunt alternatives      | submit + pricing |
| B2  | PLAY     | Launched, and Nobody Came: What to Do in the 30 Days After a Quiet Launch | `nobody-came-after-launch`          | product hunt flop / no traffic | submit           |
| B3  | GEO      | The Directory Submission Tracker: 25 Directories Worth Your Time in 2026  | `directory-submission-tracker`      | directory submission list 2026 | pricing + submit |
| B4  | GEO      | How to Track GEO: Using Google Search Console as an AI-Visibility Proxy   | `tracking-geo-with-search-console`  | how to measure GEO             | pricing          |
| B5  | GEO      | The 2026 Founder's Guide to AI Crawlers: robots.txt, llms.txt & Citation  | `ai-crawlers-robots-llms-txt-guide` | llms.txt / AI crawler rules    | submit + pricing |

## Suggested 30-day rollout

1. **Week 1** — #1 GEO pillar (live), #5 pre-launch checklist (conversion).
2. **Week 2** — #2 + #3 GEO supporting (build the moat), #8 first "best of" roundup.
3. **Week 3** — #6 first-100-users, #9 best PH alternatives, #4 DR explainer.
4. **Week 4** — #7 where-to-launch, stand up #12 monthly recap; plan #11 flagship.

## Authoring workflow

> **The local checkout cannot reach the production database.** `.env.local` sets
> `DATABASE_URL` to a local prodsample DB, so `bun run blog:seed` writes _there_,
> not to the live site — the scripts print which DB they target, so read that
> line. Production Postgres (`aat-ee-postgres`) publishes no host port; it sits on
> a private Docker network behind the deploy host. Use the `blog:prod` wrapper
> (see "Publishing to production" below).

1. Add `content/blog/<slug>.mdx` with frontmatter:
   `slug, title, description` (required) + `tags, author, image, metaTitle, metaDescription, publishedAt` (optional).
2. Body starts at `##` (the page renders the title separately). GFM tables/lists work.
3. Preview locally (`bun run dev`) at `/blog/<slug>`.
4. Publish: `bun run blog:seed:dry` to check, then `bun run blog:seed`.
   For a cover-only change on an existing article, use
   `bun run blog:sync-images:dry` then `bun run blog:sync-images`; it
   intentionally leaves `updated_at` unchanged.

**Dates:** `publishedAt` must be an unambiguous UTC instant. A bare `2026-06-23`
is parsed as UTC midnight and renders correctly everywhere; the older
`T16:00:00Z` (-08:00) form renders **one day early** wherever the rendering
process runs in UTC, which is the case in the production container. Prefer
`2026-07-13T00:00:00Z`.

**`blog:seed` rewrites every MDX file.** It also sets `status: published` for
anything lacking `status: draft` in frontmatter, so never point a plain
`blog:seed` at a DB holding cron-generated drafts written from the same slug.
For a new batch, `blog:seed:batch` (an explicit slug list in
`scripts/seed-blog-batch.ts`) touches only those rows.

### Hand-written translations

Use the `blog:seed:translations*` scripts instead of letting the cron machine-translate
a post you have written by hand. The scripts call `seed-blog-translations.ts` through
`--preload ./scripts/preload/server-only-shim.ts`, which is required because
`lib/observability/structured-logger.ts` imports `server-only` — a specifier Next
aliases at build time but the `server-only` package is not installed for bare bun runs.

1. Add `content/blog/<locale>/<slug>.mdx` with the same `slug` as the English post
   (required) plus `title`, `description`, and optionally `metaTitle`, `metaDescription`.
2. The English row must exist first — the script skips a translation whose
   `blog_article` row is missing, since the page merges the translation over the
   article and the cron's staleness check needs something to compare against.
3. Write: `bun run blog:seed:translations:dry`, then `bun run blog:seed:translations`
   (optionally scoped to one locale, e.g. `… scripts/seed-blog-translations.ts zh`).

The script stamps `updated_at = max(now, article.updated_at)` so the hand-written
translation is never considered stale by `translate-blog` and silently replaced
with a machine translation. Verify a seed with `bun run blog:verify`, which also
reports any translation older than its English source.

## Publishing to production

`scripts/seed-blog-prod.sh` resolves the Postgres container IP on the deploy host,
opens an SSH tunnel to it, reads `DATABASE_URL` out of the running app container
(so credentials cannot drift), and runs the requested step. It never deploys,
restarts, or writes outside the blog tables.

```bash
bun run blog:prod articles --dry-run      # EN: preview the batch insert/update
bun run blog:prod articles                # EN: write
bun run blog:prod images --dry-run        # preview cover-only updates
bun run blog:prod images                  # write cover-only updates
bun run blog:prod translations --dry-run  # ZH: preview
bun run blog:prod translations            # ZH: write
bun run blog:prod dates --dry-run         # re-align published_at only
bun run blog:prod verify                  # read-only post-check
```

### Two traps when writing to production

- **Do not re-seed articles that already have translations.** `translate-blog`
  marks a translation stale when `translation.updated_at < article.updated_at`,
  so bumping an old article's `updated_at` queues its whole locale set for
  re-translation (8 locales per article) and can overwrite reviewed text.
  `blog:seed:batch` and `patch-blog-dates.ts` exist to avoid exactly this —
  the latter changes `published_at` only.
- **`blog:seed:dry` is not a production preview.** It reports what _would_ be
  written, but to whatever DB is configured; run it under `blog:prod` to preview
  the production effect.
