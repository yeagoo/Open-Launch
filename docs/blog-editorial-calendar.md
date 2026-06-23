# Blog editorial calendar

Four content tracks, each doing a specific job. Posts are authored as
`content/blog/*.mdx` (frontmatter + MDX body) and published with
`bun scripts/seed-blog.ts` (idempotent upsert into the `blog_article` table).

**Per-post rules:** open with a 2–3 sentence TL;DR/definition block (LLM-quotable);
`##`/`###` headings; one table or checklist; an FAQ section; internal links to
`/projects/submit`, `/pricing`, and relevant `/categories` · `/compare` · `/friends`;
contextual CTA at the end. English-first; translate top performers later.

## Tracks

- **GEO** — GEO/AIEO & search-visibility guides (the moat: rank + get LLM-cited → directory/GEO tiers)
- **PLAY** — Founder launch playbooks (high-intent → sign-ups)
- **BEST** — "Best [category] tools" roundups (traffic + "best X" LLM citations)
- **DATA** — Data/trend reports from aat.ee's own data (linkable authority)

## Calendar (first 12)

| #   | Track | Title                                                                    | Slug                                | Primary keyword                    | Main CTA               | Status     |
| --- | ----- | ------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------- | ---------------------- | ---------- |
| 1   | GEO   | GEO & AIEO: How to Get Your Product Recommended by AI                    | `geo-aieo-get-recommended-by-ai`    | get recommended by AI / GEO        | submit + pricing       | ✅ drafted |
| 2   | GEO   | How to Get ChatGPT, Claude, Perplexity & Gemini to Name Your Product     | `get-named-by-ai-assistants`        | get product recommended by ChatGPT | pricing                | drafted    |
| 3   | GEO   | Dofollow Directory Backlinks for SaaS in 2026                            | `dofollow-directory-backlinks-saas` | dofollow backlinks SaaS            | pricing + friends      | drafted    |
| 4   | GEO   | What Domain Rating (DR) Is and Why It Matters for AI Visibility          | `domain-rating-dr-ai-visibility`    | domain rating                      | pricing                | drafted    |
| 5   | PLAY  | The Pre-Launch Checklist: 3 Weeks to Launch Day                          | `pre-launch-checklist`              | product launch checklist           | submit                 | drafted    |
| 6   | PLAY  | How to Get Your First 100 Users After Launch                             | `first-100-users-after-launch`      | first 100 users                    | submit                 | drafted    |
| 7   | PLAY  | Where to Launch in 2026: Product Hunt and How to Choose Alternatives     | `where-to-launch-2026`              | product hunt alternatives          | submit + /alternatives | drafted    |
| 8   | BEST  | Best AI Writing Tools (2026)                                             | `best-ai-writing-tools`             | best AI writing tools              | /categories + submit   | todo       |
| 9   | BEST  | Best Product Hunt Alternatives (2026)                                    | `best-product-hunt-alternatives`    | product hunt alternatives          | submit                 | todo       |
| 10  | BEST  | Best [Category] Tools — repeatable template, seed from top `/categories` | `best-<category>-tools`             | best [category] tools              | /categories + submit   | template   |
| 11  | DATA  | State of Product Launches 2026 (annual flagship)                         | `state-of-product-launches-2026`    | product launch trends              | submit                 | drafted    |
| 12  | DATA  | Monthly Launch Recap: Top Products & Trends (recurring)                  | `launch-recap-<yyyy>-<mm>`          | monthly product launches           | submit                 | template   |

## Suggested 30-day rollout

1. **Week 1** — #1 GEO pillar (live), #5 pre-launch checklist (conversion).
2. **Week 2** — #2 + #3 GEO supporting (build the moat), #8 first "best of" roundup.
3. **Week 3** — #6 first-100-users, #9 best PH alternatives, #4 DR explainer.
4. **Week 4** — #7 where-to-launch, stand up #12 monthly recap; plan #11 flagship.

## Authoring workflow

1. Add `content/blog/<slug>.mdx` with frontmatter:
   `slug, title, description` (required) + `tags, author, image, metaTitle, metaDescription, publishedAt` (optional).
2. Body starts at `##` (the page renders the title separately). GFM tables/lists work.
3. Preview locally (`bun run dev`) at `/blog/<slug>`.
4. Publish: `bun scripts/seed-blog.ts --dry-run` to check, then `bun scripts/seed-blog.ts`.
