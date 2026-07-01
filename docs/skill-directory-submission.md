# Skill-driven free directory submission

> **Status:** design (not yet implemented). This doc is the decision record and
> build spec. Nothing here ships until the plan is approved. Written 2026-07.

## What this is

A **free, nofollow** cold-start channel for indie makers. Instead of us
generating listing content with DeepSeek (cost) and manually placing it, the
user runs a **Claude Code / Codex / opencode / …** Skill that:

1. verifies they own the domain,
2. crawls their own site and generates the listing copy **+ 14 SEO-differentiated
   variants + translations** using _their own_ AI tool,
3. submits everything to aat.ee via an API-key'd endpoint,

and aat.ee then **slowly** publishes those variants across our 14 directory
sites (nofollow), gated by automated abuse/quality checks. The maker tracks
progress on a per-submission `uuid` status page.

The whole point: **aat.ee spends ~zero AI compute** — the user's coding agent
does the writing and translating. It also helps the "nobody can find my launched
project" problem by seeding 14 real backlinks over ~5+ days.

This is a **separate product line** from the paid syndication
(`docs/launch-syndication.md`): that one is dofollow, we generate content, 1–3
day rollout, $6.99+. This one is free, nofollow, user-generated, slow. See
[Positioning & paid separation](#positioning--paid-separation).

## Locked decisions

| #   | Dimension              | Decision                                                                                                                                                     |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Review gate            | **Fully automated** (AI scoring + rules). No human in the loop.                                                                                              |
| 2   | Differentiated content | **User's AI generates all 14 variants** + translations.                                                                                                      |
| 3   | Canary quality signal  | Publish to the 2 lowest-DR sites first, then **AI re-check** the live pages before continuing.                                                               |
| 4   | Similarity guard       | **Local similarity check** across the 14 variants — _lenient_: only reject if variants are near-identical ("enough that a search engine sees a difference"). |
| 5   | Paid separation        | Free = nofollow + slow + queued; paid = dofollow + fast + priority.                                                                                          |
| 6   | Cooperating sites      | All 14 are **our own** sites → no partner-acceptance blocker.                                                                                                |
| 7   | Receiver contract      | Submission payload carries a `rel` field (`nofollow` for this channel).                                                                                      |
| 8   | Identity               | **Must be logged in + per-user API key** (generated in dashboard).                                                                                           |
| 9   | Quota                  | **3 projects/account/month** + per-domain permanent dedupe + global ≤10 site-publishes/day (rest queue). No free top-up; more/faster → pay on the site.      |
| 10  | Takedown               | Every receiver site implements an **unpublish/delete API**; aat.ee can pull a listing from all 14.                                                           |
| 11  | uuid status page       | **noindex** (don't dilute aat.ee authority; don't expose pre-review content).                                                                                |
| 12  | Domain verification    | **One-time, domain-level** (HTML file / DNS TXT / meta tag). First step of the Skill, runs in parallel with content gen, hard-gated at submit.               |
| 13  | Queue fairness         | **Global cap,口径 A**: in-flight submissions drain before new ones start (see [Queue](#publish-queue--global-throttle-口径-a)).                              |

## Positioning & paid separation

The free channel must not cannibalize paid syndication. The moats:

- **Link equity:** free = `rel="nofollow"`; paid = dofollow. This is the SEO
  value difference and the primary reason to pay.
- **Speed:** free rolls out over 5+ days _and_ is subject to the global 10/day
  throttle (can stretch much longer under load); paid publishes in 1–3 days
  with priority and is exempt from the free throttle.
- **Effort:** free makes the user do the writing (via their agent); paid we do
  for them.
- **Upsell:** the uuid page and completion email surface a "want it dofollow /
  faster? upgrade" CTA. Running out of free monthly quota also points to paid.

## Automated defense (replaces the human gate)

Because放行 is fully automatic (decision #1), the safety net is layered:

1. **Domain ownership (hard gate).** Can't submit for a domain the account
   hasn't verified. Kills the vast majority of malicious third-party
   submissions. Reuses `lib/safe-fetch.ts` + `node:dns`.
2. **AI content scoring at submit.** One cheap classification pass
   (spam / adult / scam / illegal). High-risk → rejected immediately, recorded
   on the submission. This is the _only_ AI cost we take, and it's tiny vs
   generating content.
3. **Similarity guard (local, decision #4).** Reject if the 14 variants are
   near-duplicates — lenient threshold. No AI; a local shingle/Jaccard or
   trigram-cosine over the variant bodies. **Starting default: reject only when
   pairwise similarity > 0.9** (i.e. near-identical); tune down from real data.
   The goal is merely "a search engine sees a difference", not originality.
4. **Canary + AI re-check (decision #3).** Day 1 publishes only the 2
   lowest-DR sites. Before advancing, an AI re-check reads the **live** pages
   (via `lib/tinyfish.ts`) and confirms they rendered the intended, clean
   content. Failure → **auto-takedown**: unpublish everything already sent for
   that submission (the 2 canary sites), mark it `taken_down`, alert admin, and
   never advance to day 2. Fully automatic, no human gate (decision #1).
5. **Rate/dedupe limits.** Per-account monthly quota, per-domain permanent
   dedupe, global daily throttle. Reuses `lib/rate-limit.ts` (`dedupeOnce`,
   `checkRateLimit`).
6. **Takedown safety net (decision #10).** If something slips through, one call
   unpublishes from all 14 sites.

## Domain verification (decision #12)

One-time, **domain-level** (not per-submission): once `(account, domain)` is
verified, later submissions for that domain skip it.

Placement in the Skill flow: **first step, parallel with content generation,
hard-gated at submit.**

- _First_ → fail-fast on unverifiable junk domains before the user's AI wastes
  tokens crawling + writing.
- _Parallel_ → DNS TXT can take minutes to propagate; let content gen proceed
  meanwhile.
- _Hard-gated at submit_ → the real gate is server-side: `submit` re-checks the
  DB for a verified `(account, domain)`; it never trusts a client claim.

Three methods (user picks one; all reuse existing fetch/DNS infra):

| Method                                                            | Best for                                                                  | How we verify                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------- |
| HTML file `/.well-known/aat-verify-<token>.txt`                   | repo-backed sites (Claude Code can add the file + redeploy автоматически) | `safeFetch` GET + compare token     |
| DNS TXT `_aat-verify.<domain>` = `<token>`                        | no code access, controls DNS                                              | `dns.lookup`/`resolveTxt` + compare |
| Meta tag `<meta name="aat-verify" content="<token>">` on homepage | no-code site builders                                                     | `safeFetch` homepage + parse        |

> Verification I/O uses `undici.request`, never global `fetch` — see the
> web-streams-teardown note in `lib/tinyfish.ts` / memory
> `transform-algorithm-webstreams`.

## Publish queue & global throttle (口径 A)

Two stacked rate limiters:

1. **Per-submission canary schedule.** Day 1 = 2 lowest-DR sites; after the
   canary passes, +3 sites/day until all 14 are done. Each site becomes _due_
   on its scheduled day.
2. **Global daily cap = 10 site-publishes/day** across _all_ free submissions.
   A worker tick publishes due rows oldest-first until the daily budget is
   spent; the rest carry to the next day.

**Fairness (decision #13):** due rows are drained **oldest-submission-first**,
so in-flight submissions finish before newer ones get any of the daily budget.
A single project therefore takes ≥5 days, and longer when the global queue is
busy. Makers who want to skip the queue pay on the site (fast + dofollow).

The canary AI re-check sits between day 1 and day 2 of a submission: day-2+ rows
don't become due until the re-check passes.

## Data model

New tables (Drizzle + hand-written SQL migration, applied by
`scripts/apply-pending-sql.ts`):

```
verified_domain
  id            uuid pk
  account_id    text  → user.id
  domain        text                      -- normalized (lowercase, no scheme/path)
  method        text  -- 'html' | 'dns' | 'meta'
  token         text
  verified_at   timestamp null            -- null until confirmed
  created_at    timestamp
  UNIQUE(account_id, domain)

skill_submission
  id            uuid pk                    -- the public status-page id (noindex)
  account_id    text  → user.id
  domain        text                       -- must match a verified_domain
  website_url   text
  status        text  -- 'pending_review' | 'rejected' | 'publishing' | 'completed' | 'paused' | 'taken_down'
  review_score  integer null               -- AI content score
  review_reason text null
  locale        text
  created_at / updated_at

skill_submission_variant                   -- the 14 user-generated variants
  id            uuid pk
  submission_id uuid  → skill_submission.id (cascade)
  site          text                        -- target directory site key
  title / tagline / body_md  text
  lang          text
  UNIQUE(submission_id, site)

skill_publication                          -- per (submission, site) publish tracking
  id            uuid pk
  submission_id uuid  → skill_submission.id (cascade)
  site          text
  rel           text default 'nofollow'
  batch_day     integer                     -- 1 = canary, 2.. = rollout
  scheduled_for date                         -- becomes due on/after this day
  status        text  -- 'scheduled' | 'sent' | 'failed' | 'unpublished'
  attempts      integer default 0
  external_id / external_url  text null
  last_error    text null
  next_attempt_at / sent_at   timestamp null
  created_at / updated_at
  UNIQUE(submission_id, site)
```

`skill_publication` intentionally mirrors `launch_syndication` (same
retry/backoff shape) but adds `rel`, `batch_day`, `scheduled_for`. We keep it a
**separate table** so the free channel can't destabilize the paid pipeline and
the two evolve independently.

## API contract

All endpoints are API-key authenticated (decision #8): `Authorization: Bearer
<user_api_key>`, key minted in the dashboard, revocable, quota-metered.

```
POST /api/skill/domains                 → register a domain, get {token, methods}
POST /api/skill/domains/:id/verify      → aat.ee fetches/looks up, marks verified
GET  /api/skill/domains                 → list caller's verified domains
POST /api/skill/submit                  → {domain, website_url, variants[14], tosAccepted:true}
                                          server re-checks domain verification,
                                          rejects if tosAccepted!=true,
                                          runs AI score + similarity guard,
                                          creates skill_submission + rows,
                                          returns {uuid, statusUrl}
GET  /api/skill/status/:uuid            → progress (also the public noindex page)
```

Internal (cron / admin):

```
GET  /api/cron/skill-publish            → drains due skill_publication rows under
                                          the global 10/day cap, canary gating,
                                          AI re-check; registered in cron_schedule
POST /api/admin/skill/:uuid/takedown    → unpublish from all 14 sites
```

Receiver side (each of the 14 sites, **cross-repo**):

- extend `POST /api/external/launch` to honor `rel` (render `nofollow`),
- add `POST /api/external/unpublish` (idempotent delete by our idempotency key).

## Skill flow (SKILL.md, runs in the user's agent)

```
1. Register domain        → POST /api/skill/domains        (needs API key)
2. Already verified?      → GET  /api/skill/domains        → skip to 5
3. Place verification     → agent writes HTML file & redeploys, OR
                            instructs user for DNS TXT / meta tag
4. Confirm                → POST /api/skill/domains/:id/verify
   ── in parallel with 3–4 ──
   Crawl own site, generate 14 SEO-differentiated variants + translations
5. Submit                 → POST /api/skill/submit  {domain, variants[]}
                            → returns uuid + status URL
6. Poll / show status     → GET /api/skill/status/:uuid
```

The SKILL.md prompt instructs the agent to produce **genuinely differentiated**
variants (distinct titles / opening paragraphs / taglines per site), not
find-replace clones — the server's similarity guard enforces a lenient floor.

## Reused vs new

**Reused (≈80% of infra already exists):**

- `lib/safe-fetch.ts` + `node:dns` — domain verification fetches.
- `lib/tinyfish.ts` — canary live-page AI re-check crawl.
- `lib/rate-limit.ts` — quota / dedupe / global throttle.
- `lib/launch-syndication.ts` patterns — retry/backoff/idempotency (mirror, don't reuse the table).
- cron dispatcher + `cron_schedule` + `cron-health` monitor — schedule the new worker.
- uuid-keyed public page pattern (like `directory_order`).
- better-auth session → API-key minting.

**New:**

- 4 tables + migration.
- `/api/skill/*` endpoints + API-key auth middleware.
- `/api/cron/skill-publish` worker (canary + global-cap + AI re-check).
- AI content-score + local similarity modules.
- noindex uuid status page + dashboard "API keys" UI.
- SKILL.md (the distributable Skill).
- **cross-repo:** `rel` support + unpublish API on all 14 receivers.

## Open items to finalize before build

_All resolved (2026-07) — recorded below and folded into the sections above._

| Item                      | Decision                                                                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monthly per-account quota | **3 projects / account / month** (per-domain permanent dedupe on top).                                                                                                                                                                        |
| Free quota top-up         | **No à-la-carte free top-up** — running out points to paid dofollow only (cleanest separation).                                                                                                                                               |
| Canary re-check failure   | **Auto-takedown**: if the AI re-check fails on the 2 canary sites, automatically unpublish everything already sent for that submission and mark it `taken_down` + alert admin. Matches the fully-automatic, zero-human posture (decision #1). |
| ToS acceptance            | **Required** — the Skill submit must carry an explicit ToS acceptance (user attests domain + content ownership, content legality, and liability). Server rejects a submit without it.                                                         |
| Similarity threshold      | Not a launch-blocking constant — **start lenient and tune from real data**. Documented default in the similarity-guard section; adjustable without a schema change.                                                                           |

## Quality guardrails & CI

This system's risk is **not UI/code quality** — it's _distribution correctness,
security correctness, and idempotency/concurrency correctness_. The guardrails
are scoped accordingly. Package manager is **bun** (`bun.lockb`); there is no
`.github/workflows` yet — **building CI is step 0** before this ships.

### CI (GitHub Actions, triggered on push to main)

Per decision, CI runs on **push** (matches the "no PRs, push straight to repo"
workflow — [[no-pr-just-push]]). It is **non-blocking to the push** (the push
already landed) but surfaces status and alerts on failure. Five stages:

```
1. Type safety     bun run tsc --noEmit         (tsc + Drizzle types)
2. Lint            bun run lint                  (eslint . — NOT `next lint`, removed in Next 16)
3. Schema/unit     bun run test                  (vitest: all *.test.ts)
4. Security        bun audit  +  semgrep --config auto   (see caveats)
5. System suites   vitest fanout / ssrf / cron / ai-policy (tagged subsets)
```

### The four must-have test suites (system correctness)

These are the real risk surface — treated as acceptance gates for the feature,
not optional:

**1. Idempotency + fan-out consistency** (`*.fanout.test.ts`)

- Re-submitting the same submission creates no duplicate `skill_publication`
  rows (`UNIQUE(submission_id, site)` + `onConflictDoNothing`, same proven
  pattern as `launch_syndication`).
- All 14 site payloads are structurally identical except the intended
  per-site differentiation (`title`/`tagline`/`body_md`) and `rel`.
- Partial failure (e.g. 3/14 sent) → retry re-publishes only the remaining 11,
  never the already-`sent` rows.

**2. SSRF security suite** (`*.ssrf.test.ts`)

- `safeFetch` rejects `127.0.0.1`, `169.254.169.254` (cloud metadata),
  `localhost`, decimal/hex IPv4, IPv4-mapped IPv6, non-http(s) schemes.
- Every redirect hop is re-validated (a public host 302→internal IP is
  blocked). Locks in the manual per-hop check already in `lib/safe-fetch.ts`.
- **Known limitation (documented, not faked):** DNS rebinding (TOCTOU between
  resolve-time check and connect-time) is _not_ fully closed at the app layer.
  `safeFetch` validates at resolve time; true rebinding defense needs
  connect-time IP pinning. Tracked as a follow-up, not claimed as covered.

**3. Concurrency / quota correctness** (`*.cron.test.ts`)

- Global ≤10 site-publishes/day is never exceeded even with two worker ticks
  running concurrently (Redis-backed counter/lock).
- Per-domain dedupe holds; the cron dispatcher's per-minute `dedupeOnce` lease
  prevents a double-fire from double-publishing.
- Fairness (口径 A): due rows drain oldest-submission-first.

**4. AI-policy enforcement** (`*.ai-policy.test.ts`)

- The review/canary code path only _reads_ variants and returns
  `{score, reasons}` — it can never write back to `skill_submission_variant`.
  Enforced by type (the audit fn's signature has no DB writer) **and** test.
- Circuit-breaker behavior: DeepSeek 402/timeout trips `lib/ai-circuit.ts`,
  submission holds rather than failing open.

### Tooling caveats (honest notes, since "full guardrails" was chosen)

- **semgrep** — powerful but a new dependency + rule tuning + false-positive
  noise. Included per your call, but the _targeted SSRF vitest suite above is
  the primary defense_ (more precise than generic rules); semgrep is the
  secondary net. Run `--config auto` in CI, triage noise before making it a
  hard gate.
- **playwright multi-domain matrix** — the 14 sites are **our own** and
  published to via **server-side API**, not browser interaction, so E2E across
  them is low-value; fan-out is better asserted with vitest mocking the 14
  receiver HTTP endpoints. Reserve playwright for the uuid status page's real
  render only.
- **bun audit** — available (bun 1.3.14). Include as "better than nothing", not
  a hard blocker (bun's advisory coverage is younger than npm's).

### PHP-tooling mental map (for reference)

| PHP world                   | Here                                                                    |
| --------------------------- | ----------------------------------------------------------------------- |
| PHPStan / Psalm             | `tsc --noEmit` + Zod schemas (the real type boundary at `/api/skill/*`) |
| PHPUnit                     | Vitest (unit + the 4 system suites)                                     |
| PHPCS                       | ESLint                                                                  |
| Composer audit              | `bun audit` + semgrep                                                   |
| Laravel Queue/Horizon tests | Redis + cron + fanout suites                                            |
| Web security scanner        | SSRF suite + undici hardening + semgrep                                 |

### Top 3 risks to optimize (if only three)

1. **SSRF + undici chain safety** — largest attack surface. DNS/IP block +
   per-hop redirect control; connect-time pinning as follow-up.
2. **14-site fan-out consistency** — the commercial asset. Idempotent,
   retry-safe, partial-failure recovery.
3. **cron + Redis race conditions** — the "silently wrong, nobody notices"
   class. Locks + the `cron-health` monitor already in the repo.
