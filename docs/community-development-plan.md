# English community development plan

Status: Phase 0–29 are implemented and reviewed behind a disabled feature flag.
Phase 4's isolated-database search/performance and final-runner runtime gates
are implemented and reviewed. Phase 5 adds a read-only staging canary gate;
Phase 6 adds privacy-safe service telemetry for that rollout; Phase 7 reviews
an operator-supplied telemetry export without assuming a log platform; Phase 8
hardens client transition races; Phase 9 adds a real-browser race gate. Staging
and production rollout remain. See
[Phase 4 delivery and review](community-phase4-review.md),
[Phase 5 canary gate](community-phase5-review.md),
[Phase 6 telemetry review](community-phase6-review.md), and
[Phase 7 telemetry export review](community-phase7-review.md), and
[Phase 8 client-race review](community-phase8-review.md), and
[Phase 9 browser-race review](community-phase9-review.md),
[Phase 18 reaction-response review](community-phase18-review.md), and
[Phase 19 reaction-refresh review](community-phase19-review.md), and
[Phase 20 private-write and report refresh review](community-phase20-review.md), and
[Phase 21 navigation-write response review](community-phase21-review.md), and
[Phase 22 navigation-refresh review](community-phase22-review.md), and
[Phase 23 reply-refresh review](community-phase23-review.md), and
[Phase 24 moderation-queue resolve refresh review](community-phase24-review.md), and
[Phase 25 moderation-action queue refresh review](community-phase25-review.md), and
[Phase 26 desired-state moderation invalidation review](community-phase26-review.md), and
[Phase 27 detail authorization review](community-phase27-review.md), and
[Phase 28 client projection refresh review](community-phase28-review.md), and
[Phase 29 locked-reply controls review](community-phase29-review.md).
Date: 2026-09-14, updated 2026-09-15. Product constraint: forum UI and supported posting language are English.

## Product scope

An English maker community for the ongoing process of building, launching and
growing products. The public feed welcomes short progress updates as well as
longer discussions. The primary classification is posting intent, not discipline:

| Post type | Purpose                     | Composer guidance                                   |
| --------- | --------------------------- | --------------------------------------------------- |
| Shipped   | A release or improvement    | What changed, and who benefits?                     |
| Learning  | A practical lesson          | What did you try, observe and learn?                |
| Question  | A specific request for help | What is the context and what have you tried?        |
| Milestone | A meaningful result         | What did you reach and how did you get there?       |
| Todo      | A next step                 | What will you do, and what would success look like? |

Use one public feed with Latest and Hot (past seven days). Saved and My posts
are personal views, not post types. Defer Following until a real follow model is
available. Pricing, Marketing, Design and Development may become optional topic
tags later; do not split the initial audience into separate topic boards.

A post requires a type and a contextual body (20–10,000 characters); its title is
optional (maximum 160 characters). The feed includes a lightweight composer and
shows author, type, short body, optional product context, votes and replies.
Long bodies are truncated with a clear route to the full discussion. The expanded
composer uses the same fields and draft state. Switching feed filters must retain
unsent input. Drafts in production are private and need explicit save/failure states;
the standalone preview keeps only one in-memory draft that resets on refresh.

A post may link one publicly visible product; authors without a listed product can
still participate. An association does not prove ownership: only verified ownership
earns a maker label. Production product cards link to existing product detail pages;
fictional demo product cards are visibly labeled and do not invent production URLs.
Encourage promotion through useful context, changes and feedback requests.

Initial editorial themes are product iteration, validation/feedback and growth
retrospectives. Use concrete experiences and follow-up replies. Evaluate useful
response rate, returning participants and sustained product updates; raw post
volume alone is not a success criterion.

The initial forum contains real member contributions and clearly attributed
staff posts. Existing automated product comments are not imported as forum
threads or counted as human community activity. Launch with honest empty states
and staff-written opening discussions.

## Visual direction (updated after review)

Match the existing aat.ee site: white surfaces, neutral hairline borders, orange
primary actions, and a more visible green secondary palette: pale green active
navigation and maker callout, forest-green type labels and product icons, and a
green composer top border. Keep the feed white for readability. Use the existing
logo and a 64px navigation bar. All forum typography is sans-serif: Inter for text and headings,
Outfit for the brand. Do not use the home page’s editorial serif font in the forum.
The demo loads these fonts from Google Fonts with system sans-serif fallbacks;
the Next.js implementation reuses the existing font configuration and tokens.
The confirmed production address is **https://www.aat.ee/community**. This is a
planned production route; the standalone demo does not publish it.

## Language and routing

- Canonical routes: `/community`, `/community/new`, `/community?type=shipped`,
  `/community/t/[id]`, `/community/t/[id]/edit`, `/community?view=mine`,
  `/community?view=saved`. The early `/community/mine` and `/community/saved`
  addresses permanently redirect to their canonical query forms; early
  `/community/[id]` and `/community/[id]/edit` addresses permanently redirect
  to the canonical thread namespace.
- `/community` is in the existing non-localized route boundary in `proxy.ts`.
  Locale-prefixed variants redirect to the English route while persisting the
  selected site-chrome locale and preserving valid query parameters. A trusted
  proxy marker makes the forum document `lang="en"`; the surrounding localized
  navigation and footer retain their own locale annotations.
- Use `next/link` for community links, including links originating in localized
  site navigation. Forum header and UI use English, without a language switch.
  Audit root-layout language/provider behavior; ensure the served forum document
  has `lang="en"`, including visits from a Chinese-language session.
- English is the supported content language. Tell authors before they compose;
  use human moderation for non-English submissions, not an ASCII-only rule or
  unreliable automatic language rejection. Names, code and product names may
  contain other scripts. No machine translation in the initial release.
- Post IDs are stable and determine the detail URL; changing or removing an optional
  title never changes that URL. Type, sort and search filters use validated query
  parameters; filter/search variants must not become indexable duplicates.

## Phase 0 — frontend contract and visual demo (this delivery)

Deliver a responsive standalone English prototype and this reviewed plan.
Show the maker feed, five post-type filters, search, Latest/Hot sorting, post details,
upvote toggling, saved/my posts, inline and expanded composer/reply interactions.
Titles and product associations are optional; include all five post types in fixtures. Mark all data
as fictional demo content; local interactions reset on reload. Include useful
empty states, readable mobile layout, visible keyboard focus, and no real API
requests. External fonts are optional and have sans-serif fallbacks. Demo: `docs/demos/community/index.html`.

Acceptance: open directly or via a static server; filters and search combine;
open/back navigation works; compose validates fields and permits untitled posts; unsent drafts survive filter
and route changes; product context survives publishing; voting toggles; replies
appear locally; 390px viewport has no horizontal overflow; no browser errors.
Phase 0 deliverables:

- Prototype: `docs/demos/community/index.html` and its local logo asset.
- [Frontend state and route contract](community-phase0-contract.md).
- Reusable verification: `node scripts/verify-community-demo.mjs`; this starts an
  isolated static server on a free port, requiring no application services.
- [Review and acceptance record](community-phase0-review.md).
- Generated desktop/mobile evidence: `artifacts/community-demo/phase0/` (ignored).

The demo includes plain-text rendering and only session-local state; Markdown,
server loading/failure states, editing and moderation previews are Phase 1 work.
This demo is a visual/product artifact, not the completed Next.js implementation.

## Phase 1 — complete Next.js frontend framework before backend work

Status: implemented in `/design-preview/community` with the existing production
preview gate, plus a standalone SSR/hydrated export of the same React components.
See [Phase 1 delivery, review and validation](community-phase1-review.md).
Run `bun run community:preview` and `bun run community:verify` to reproduce.
The internal preview route bypasses locale rewriting. The same components now
power the gated production routes described in Phase 3.

Build `components/community/` with CommunityShell, PostTypeNav, PostFeed,
PostCard, PostDetail, ProductContext, VoteButton, PostComposer, ReplyList, ReplyComposer,
CommunityRules and moderation affordances. Reuse the existing design-system
atoms, icons and responsive breakpoints. Keep all English strings together.
Use shared fixture types and an explicitly named demo adapter; isolate fixture
pages under the local design-preview workflow so public production routes never
serve pretend posts. Define a server-facing service contract without importing DB
modules into client bundles. Real pages will use server rendering; only controls
and the composer need client JavaScript.

Complete these screens and states before proceeding:

| Surface          | Required states                                                                        |
| ---------------- | -------------------------------------------------------------------------------------- |
| Feed/type/search | populated, loading, empty, no results, error/retry, next page                          |
| Thread           | public, deleted, hidden, locked, missing, pending review                               |
| Composer/edit    | signed out, unverified, banned, valid, invalid, saving, failed, draft, unsaved changes |
| Replies/votes    | loading, pending, retry, optimistic rollback, logged-out prompt                        |
| My threads/saved | empty, drafts, published, removed                                                      |
| Admin preview    | pending reports, report details, hide/restore, lock/unlock, pin/unpin                  |

Use accessible dialogs where needed, restore focus on close and route changes,
and prevent duplicate submissions. Existing site navigation gets a Community
entry when the real feature flag is enabled; the home rail integration is also
flagged. Phase 1 acceptance is a reviewed responsive walkthrough and Playwright
coverage of critical fixture interactions, with lint/typecheck and bundle budget.

## Phase 2 — persistence, permissions and reads

Use independent forum tables with foreign keys to existing users/projects;
reuse authentication, content sanitization, uploads where appropriate, logging,
rate limits and notification delivery primitives. Do not overload `fuma_comments`:
its page identity, project visibility checks and moderation semantics are specific
to product comments. Likewise extend notification targets/rendering explicitly;
a forum thread must never be placed into an existing project-ID field.

Implemented tables (migration `0063_community_core.sql`):

| Table                      | Core fields and constraints                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| community_thread           | UUID, author, constrained type (five stable values), optional project, nullable title, Markdown body, draft/published/deleted lifecycle, separate moderation state, lockedAt, pinnedUntil, timestamps, version |
| community_reply            | UUID, thread FK, author, optional parent, Markdown body, deletion/moderation states, timestamps, version                                                                                                       |
| community_thread_vote      | thread/user composite primary key; one positive vote per person                                                                                                                                                |
| community_bookmark         | thread/user composite primary key                                                                                                                                                                              |
| community_report           | reporter, exactly one thread/reply target, reason, content snapshot, status, resolver; target/reporter uniqueness                                                                                              |
| community_moderation_event | actor, target, action, reason, timestamp; append-only audit                                                                                                                                                    |

A seventh table, `community_feed_snapshot`, stores at most 2,000 public thread IDs per five-minute Hot bucket; each snapshot expires after 15 minutes.

Draft ownership, pending/hidden content and moderation permissions are checked
server-side on every read/write, including metadata, previews, notifications and
search. Reply parents must belong to the same thread; allow one reply level.
Use tombstones to retain conversations; define admin restore explicitly rather
than copying the existing irreversible product-comment trigger. Account deletion
anonymizes contributions through an explicit policy; avoid cascade deletion of
whole conversations. Product deletion removes the association, not the thread.

Indexes: public threads by type/publishedAt/ID and publishedAt/ID;
replies by thread/createdAt/ID; user threads by author/createdAt/ID;
reports by status/createdAt. Add bounded full-text search only after query plans
are measured. Phase 2 preserves literal substring search and records its 10,000-post baseline; production search indexing and read abuse controls are Phase 3 launch requirements. No shared cache is introduced in Phase 2. Any future cache must contain public projections only; separately batch current-user votes
and bookmarks. Feed/reply page size is fixed at 20 with deterministic keyset pagination; moderation returns the oldest 50 pending reports.
Hot uses a bounded seven-day window and a stable ranking snapshot/cursor;
changing vote counts must not invalidate page boundaries. Hot filters apply within the shared top 2,000 candidate set; personal views use creation/publication ordering, not Hot ranking. Avoid full-table
count/join hydration per thread. The demo uses vote ordering over its small fixed
recent fixture set; production Hot requires the window and snapshot contract.

Service operations: list/get/createDraft/publish/edit/delete threads; list/create/
edit/delete replies; setVote(desired boolean), setBookmark(desired boolean);
report; moderator hide/restore/lock/pin. Choose server actions for application
writes and shared server service functions for reads; introduce REST endpoints
only when an external consumer requires them. Validate all inputs with Zod.
Idempotency keys protect create/publish retries; desired-state vote writes avoid
race-prone toggle APIs. Use transactions/row locks and version checks for
edit-versus-moderation and reply-versus-lock races. Return typed validation,
authorization, conflict and retryable failure responses.

## Phase 3 — production frontend integration and moderation (implemented, closed by default)

The real `/community`, `/community/new`, `/community/moderation`,
`/community/t/[id]` and `/community/t/[id]/edit` routes now use the Phase 2
server service. Earlier `/community/[id]` preview paths permanently redirect to
the canonical thread namespace. `COMMUNITY_ENABLED` defaults to `0`; the Proxy
returns a real 404 for canonical forum paths before the shared layout can begin
streaming, while preserving the documented legacy personal-view, detail and
editor redirects. Every page loader also calls `connection()` before reading
that runtime flag, and every server action asks the server-only service to
recheck the same flag, session, role and write limit.

The routes use durable UUID request keys, reply cursors and server `replyCount`.
The client handles transport failures without losing a reply's idempotency key,
keeps optimistic vote/bookmark updates reversible and cannot offer Hot in a
personal view. The edit loader itself denies non-authors and closed posts, in
addition to the mutation's ownership/version checks. Moderation supports
thread/reply reports, resolve, hide/restore, lock/unlock and pin/unpin with the
existing append-only audit records.

Public feed cards transfer at most 480 characters of each body. Product context
is reduced to a plain 180-character display excerpt after a bounded database
read, and the composer gets at most 100 deterministic public products. Search
requires at least three characters, treats `%`, `_` and backslash literally,
uses the public partial trigram index from `0064_community_search_indexes.sql`,
and has a 15-per-minute public search budget. Cursor actions have a separate
120-per-10-minute public-read budget; both use the existing bounded Redis
fallback. Write limits remain fail-closed.

Posts and replies render through the existing safe Markdown component: raw HTML
and images are excluded, and links are external with
`rel="ugc nofollow noopener noreferrer"`. Attachments and arbitrary pasted-URL
fetching remain out of scope. Public threads receive canonical metadata,
`DiscussionForumPosting` JSON-LD and feature-flagged sitemap entries; drafts,
moderation, compose/edit, search variants and unavailable content remain
noindex. Sitemap tags are invalidated when public thread visibility or metadata
changes.

Thread/reply notifications, subscriptions, email digests, private messages and
gamification remain deliberately deferred. They need an explicit notification
target/permission design before a later phase; the existing project notification
target is not reused implicitly.

## Phase 4 — rollout and performance gates

Test with isolated Postgres: FK/check constraints, uniqueness, cross-thread
parent rejection, repeated submissions, vote races, edit-versus-hide,
reply-versus-lock, account removal and pagination under concurrent inserts.
Test authorization for anonymous/verified/unverified/banned/author/admin users.
Playwright: English routing from every site locale, feed → thread → reply,
create/edit, keyboard navigation, mobile, draft privacy, moderation and errors.
Verify query counts and EXPLAIN plans on realistic fixtures; establish cold/warm
TTFB and route-JS baselines, compare against existing discovery pages, and block
unexplained regressions. No whole-table aggregation on ordinary list requests.

The additive migrations and default-off flag are ready. Before a release, run the
normal migration runner against a backup-verified staging/production target, then
enable the feature for staff review before public users. Check query plans and
real route budgets under representative traffic, including the product-name search
branch. Disable the flag to stop participation without dropping tables; review
schema/code compatibility before any image rollback. The design preview remains
production-gated rather than public.

Implemented in this iteration: the isolated database gate now applies the
existing `0053_search_indexes.sql` product-name index as well as the community
migrations, verifies typed product-search cursor pagination, and records plans
at 110,000 community-thread fixtures plus 100,000 product fixtures. Public Latest
search first probes a 500-row chronological window, then falls back to separate
text and product candidate branches only when that window cannot fill a page.
This preserves index ordering for common current searches while avoiding a
date-ordered walk for a rare old product-name match. See
[Phase 4 delivery and review](community-phase4-review.md).

The existing loopback-only Playwright release gate now starts the standalone
server with `COMMUNITY_ENABLED=1` only for its isolated test fixture. It seeds a
public thread, a member session and an administrator report, then covers the
English locale bridge, member reactions/replies, publish/edit, and moderator
hide/resolve flows. The production default remains closed.

For a randomized local browser-gate port, build with that same
`http://localhost:<port>` value as `NEXT_PUBLIC_URL` before starting the
standalone server: public `NEXT_PUBLIC_*` values are embedded during the build.
The gate intentionally accepts only this canonical HTTP loopback host, avoiding
the standalone/default-locale rewrite loop caused by alternate loopback host
spellings.

## Phase 5 — read-only staging canary gate

Status: implemented locally; no staging or production target has been contacted.
`bun run community:canary` accepts an explicit origin-only base URL and checks
the flag state without writes, credentials, browser session cookies or direct
database connections. In `disabled` mode it requires a real forum 404, absent
navigation and a working locale bridge. In `enabled` mode it requires the public
feed, English document language, navigation, locale bridge, and the stale Client
Router shape that must not write `NEXT_LOCALE`.

The enabled check records one initial feed TTFB sample followed by 1–10 warm
samples. It reports observations by default; passing
`--max-initial-ttfb-ms` and `--max-warm-ttfb-ms` turns operator-established
staging limits into a blocking gate. The initial sample is only a true cold
measurement when the operator deliberately restarts or clears the target first.
The command never prints response bodies or raw `Set-Cookie` values.

Use it against a staging origin only after the normal backup-verified migration
process. It complements, but does not replace, the manual authenticated staff
canary for verified writing and moderator actions. See
[Phase 5 canary delivery and review](community-phase5-review.md).

## Phase 6 — runtime operation telemetry and staff-canary support

Status: implemented locally; no staging or production target has been contacted.
The Community Proxy now forwards its generated `x-aat-request-id` to the
renderer through Next's request-header override channel. The same ID remains on
the response, so an operator can correlate a Community service log with the
request observed by a staff canary without adding IDs or content to the fixed
telemetry metadata.

Every Community operation that reaches the shared service execution boundary is
measured there. This covers session resolution, applicable rate limiting and its
transaction, while excluding React rendering, response streaming, logging
callbacks and pre-boundary input validation. It is therefore an operation signal,
not a replacement for the Phase 5 route TTFB measurements. Operations taking at
least one second emit a
`community_operation_slow` warning with only the internal operation name,
read/write mode, moderator requirement, outcome and duration. Unexpected
service failures emit `community_service_error` with the same safe metadata,
the request ID and an error handled by the existing structured-log redaction.

The observer receives no actor, thread, reply, product, search or body fields.
Its callback is explicitly best-effort: a logging failure cannot replace an
authorization, validation, conflict or retryable Community result. This makes
the signal safe to enable with `COMMUNITY_ENABLED=1` for staff review while the
manual authenticated canary still verifies verified writes, moderation and the
flag-off rollback. See [Phase 6 telemetry delivery and review](community-phase6-review.md).

## Phase 7 — offline telemetry export review gate

Status: implemented locally; no staging or production target has been contacted.
`bun run community:telemetry -- --input <structured-log.ndjson>` reads an
operator-exported file of the default newline-delimited JSON structured logs.
It has no network, database or credential behavior. The parser accepts only the
fixed Community event contract, rejects a malformed matching event rather than
printing it, and ignores unrelated well-formed application events. Its report
contains aggregate event counts, a time window, slow-event duration statistics,
and fixed operation names. It never echoes input rows, request IDs or errors.
`STRUCTURED_LOG_FORMAT=text` exports are deliberately outside this contract;
export the logger's default JSON lines for this review.

All limits are optional because their values must come from a defined staging
observation window: `--max-slow-events`, `--max-error-events`,
`--max-missing-request-id-events` and `--max-p95-slow-duration-ms` turn a
review into a blocking gate. Slow and error counts remain separate because one
failed operation can intentionally emit both event types when it also exceeds
the one-second slow threshold. A zero-event export is only an absence of these
slow/error signals; it does not prove a healthy authenticated operation. Phase
5's HTTP canary and the manual staff flow remain required. See
[Phase 7 telemetry export review](community-phase7-review.md).

## Phase 8 — client transition race hardening

Status: implemented locally; no staging or production target has been contacted.
React transition state is committed after an input event, so a disabled control
based only on `pending` can still receive a second submit or click in the same
event turn. The Community client now uses one immediate per-view mutation lock
and separate immediate locks for cursor reads. The lock is acquired only after
local validation, released from every `finally` block, and does not replace
database authorization, idempotency or optimistic-version checks.

This closes a concrete reply issue: two immediate submissions reused the same
server idempotency key, so the database created one reply, but both successful
client callbacks incremented the displayed reply count. The response path now
runs once. A failed reply remains retryable with its original request key and
draft text. The same guard protects publish/edit/save/discard actions, detail
page mutations, production moderation actions, the preview moderation panel,
and both public/reply cursor actions from duplicate client requests before the
UI re-renders disabled.

The shared lock intentionally serializes mutations within one rendered view,
matching the existing UI behavior that disables its mutation controls while a
transition is pending. Cursor reads use their own locks, so loading another page
does not block a vote, reply or moderation action. See
[Phase 8 client-race review](community-phase8-review.md).

## Phase 9 — real-browser reply race gate

Status: implemented and run locally against an isolated loopback database; no
staging or production target has been contacted. The Playwright release suite
now submits a valid reply by dispatching two synchronous `submit` events to the
actual hydrated form. It verifies the exact route's Server Action request count,
one rendered reply, and a reply-heading increase of one. This gives the Phase 8
client lock a real Next Server Action boundary check in addition to its jsdom
unit coverage.

The test generates unique fixture text, listens only for the route-local
`next-action` request shape, and retains only a count. It does not log request
bodies, cookies or action IDs. It runs with the existing authenticated member
fixture and is part of the normal release gate. See
[Phase 9 browser-race review](community-phase9-review.md).

## Phase 10 — reproducible isolated Community browser gate

Status: implemented locally; no staging or production target has been contacted.
`bun run community:test-browser` turns the Phase 9 manual browser exercise into
one repeatable local command. It verifies the supported Node runtime, starts
pinned PostgreSQL 16 and Redis 7.4 containers bound only to random IPv4
loopback ports, applies the complete migration history to a freshly named E2E
database, and builds the standalone server with a matching random
`http://localhost:<port>` public origin. It then runs only
`e2e/community.spec.ts` under the existing CI-like Playwright configuration.

The command accepts no database, Redis, URL or deployment arguments, so it
cannot accidentally target a developer, staging or production service. Its exit
trap force-removes both named containers after either success or failure. Docker
may be available through the current user or passwordless `sudo`; Node 24.15+
and the existing Chromium Playwright installation are required. See
[Phase 10 local browser-gate review](community-phase10-review.md).

## Phase 11 — cursor integrity hardening

Status: implemented locally; no staging or production target has been contacted.
The initial Community feed applies its 15-per-minute budget to expensive text
and product searches, but cursor loads are Server Actions that can be called
directly. Search cursor loads now pass both the existing 120-per-10-minute
cursor-read budget and the search budget before the feed service can issue its
query. An exhausted search budget returns the same typed, recoverable action
failure pattern used by the other Community read limits.

Replies use ascending keyset pagination. A newly posted reply can arrive while
an older cursor page remains unloaded, so the UI now receives every reply's
stable `createdAt` value and merges replies by `(createdAt, id)`. This preserves
chronological order when local replies and later cursor pages meet, including
the deterministic database tie-breaker. See
[Phase 11 cursor-integrity review](community-phase11-review.md).

## Phase 12 — canonical thread 404 correctness

Status: implemented locally; no staging or production target has been contacted.
The Community thread namespace and malformed canonical UUID paths are knowable
before rendering. The Proxy now returns a real HTTP 404 and the existing
not-found page for those requests, including malformed encoded path segments,
so the streamable root layout cannot turn an invalid URL into a successful
response. The lightweight Proxy validator and server-side input schema share one
Community UUID format, while a valid UUID continues to reach the
permission-aware page service.

A valid UUID can still refer to a deleted, hidden or never-created record. That
answer requires the database and therefore remains in the page service, where it
renders the normal noindex not-found content without moving a database query
into the Proxy or removing Community's loading boundary. See
[Phase 12 canonical-404 review](community-phase12-review.md).

## Phase 13 — finite canonical thread namespace boundary

Status: implemented locally; no staging or production target has been contacted.
The only current canonical descendants of `/community/t` are the exact detail
and editor shapes: `/community/t/[uuid]` and `/community/t/[uuid]/edit`.
The Proxy now rejects every other descendant before rendering, including a
syntactically valid UUID followed by an unsupported child path. This closes the
remaining route-shape path to a streamed HTTP 200 for a URL that cannot match
an App Router page.

The boundary is intentionally explicit rather than querying the database in the
Proxy. A valid detail or editor URL remains available to its permission-aware
page service; database-dependent absence and visibility still render the normal
noindex not-found content. Add a supported shape to the Proxy matcher and its
regression tests whenever a new canonical thread child route is introduced. See
[Phase 13 canonical-namespace review](community-phase13-review.md).

## Phase 14 — idempotent moderation commands

Status: implemented locally; no staging or production target has been contacted.
Thread and reply moderation controls now express their target state rather than
an event to apply repeatedly. After a lost response, a retry of an already
completed hide, restore, lock, unlock, active pin, or unpin leaves the record's
version and `updatedAt` unchanged and does not append a duplicate moderation
audit event. An expired pin may be pinned again; removing an already inactive
pin is a no-op.

The existing row locks serialize concurrent commands before this state check, so
two requests that arrive together still produce one transition. This is
independent of the browser's immediate-action lock and protects direct Server
Action retries as well. See
[Phase 14 moderation-idempotency review](community-phase14-review.md).

## Phase 15 — editor authorization and query boundary

Status: implemented locally; no staging or production target has been contacted.
The editor route now checks post ownership and its editable state in the initial
thread query. A non-author, anonymous visitor, locked post, hidden/deleted post
or draft therefore reaches the normal missing-post result before the service
projects author/product/reaction state or asks for reply rows.

The editor has no reply UI, so its page loader returns the existing post
projection with its default empty reply list rather than loading the first reply
page and discarding it. The visible composer contract remains unchanged: title,
body, type, linked product, version and viewer/product context remain available
to the author.

The PostgreSQL regression test uses Drizzle query logging to prove that a
non-author editor request touches neither replies nor the requesting member's
vote/bookmark rows; it also proves an authorized editor load does not query
replies. This protects the authorization order as well as the page-data budget.

[Phase 15 editor authorization review](community-phase15-review.md).

## Phase 16 — editor interaction projection budget

Status: implemented locally; no staging or production target has been contacted.
The reusable post projection now has an explicit interaction-state option. It
continues to load a signed-in visitor's vote and bookmark state by default for
feeds, details and action results, while the editor disables those two lookups
because its composer has no vote or bookmark controls.

The isolated PostgreSQL trace verifies both sides of that contract: an
authorized editor request does not query `community_thread_vote` or
`community_bookmark`, and normal desired-state vote/bookmark results still
return `voted` and `saved` as true. This removes two queries from each editor
page load without weakening the regular Community interaction UI.

[Phase 16 editor projection-budget review](community-phase16-review.md).

## Phase 17 — editor author-display projection budget

Status: implemented locally; no staging or production target has been contacted.
The shared post projection now separately controls author display-name loading.
Cards and detail pages continue to receive names by default; the editor retains
the author ID it needs for authorization but omits the unused display-name
lookup. Its required session lookup remains intact.

The isolated PostgreSQL trace confirms an authorized editor request makes one
user-table query for actor resolution rather than two. Its companion assertion
confirms a standard post detail still returns the author name. This removes one
more query from an editor page without changing public post presentation.

[Phase 17 editor author-display review](community-phase17-review.md).

## Phase 18 — compact reaction response budget

Status: implemented locally; no staging or production target has been contacted.
Desired-state vote and bookmark writes no longer reload a complete post after
the database mutation. The server action returns only the authoritative fields
the control needs: `{ id, kind: "vote", votes, voted }` or
`{ id, kind: "bookmark", saved }`. The existing row lock, participant check,
database vote counter trigger and desired-state idempotency remain in place.

The vote response derives its count from the locked thread row plus the actual
insert/delete result, so a retried desired vote returns the correct count without
a follow-up interaction read. Feed, thread-detail and design-preview clients
apply that compact result to their existing post projection, preserving the
loaded body, product context and reply page. The isolated PostgreSQL trace
requires both reaction variants to skip post, author, product, reply and
viewer-interaction hydration after the write.

[Phase 18 reaction response review](community-phase18-review.md).

## Phase 19 — reaction route-refresh budget

Status: implemented locally; no staging or production target has been contacted.
Community feed and detail pages call `connection()` before their service reads,
and the Community data layer intentionally has no shared response cache because
the projections include viewer-specific state. After Phase 18, vote and bookmark
actions return just the authoritative fields that the interactive client merges
into its current projection.

Those two desired-state writes therefore no longer call `revalidatePath`. In a
Server Action, Next.js updates the active affected UI immediately and currently
refreshes previously visited paths on a later navigation; doing that after every
reaction discarded the lightweight response budget and could remount the client
tree. A subsequent Community navigation still reads fresh runtime data. Publish,
edit, delete, reply, report and moderation mutations retained their targeted
path and sitemap invalidation at this phase because they changed content,
visibility or metadata outside the reacting control. Phase 23 later applies the
same local-state criterion to reply lifecycle writes.

[Phase 19 reaction-refresh review](community-phase19-review.md).

## Phase 20 — private-write and report refresh budget

Status: implemented locally; no staging or production target has been contacted.
Saving or discarding a draft changes only the current member's private draft.
The composer already calls `router.refresh()` after that write so its own route
cache is replaced with the saved state. Its Server Action therefore no longer
also calls `revalidatePath`, avoiding the broader Server Function refresh
behavior while retaining one intentional local refresh.

Submitting a post or reply report writes a pending moderation record and does
not alter the public post, reply, feed or sitemap projection. Those actions no
longer invalidate `/community` or the thread path. The reply-report backend now
returns `void`: its resolved parent-thread ID was only crossing the service
boundary to support the removed invalidation. The dynamic moderation page reads
the pending queue on a later navigation; there is no real-time cross-tab queue
contract in this phase.

[Phase 20 private-write and report refresh review](community-phase20-review.md).

## Phase 21 — navigation-write response budget

Status: implemented locally; no staging or production target has been contacted.
The production composer redirects to the canonical thread after publishing, so
its Server Action receives only the new thread ID. Editing already has the thread
ID and redirects to its freshly rendered canonical route, so its action receives
no post projection at all. The backend exposes these two navigation-specific
methods while the generic Community service retains full post results for the
interactive design preview that renders them in place.

Both compact mutations use the same validation, participant gate, write limit,
transaction, row locks, idempotency and underlying mutation functions as the
full-result operations. Publishing and editing continue to invalidate their
content routes and public sitemap entries because a subsequent canonical page
must receive its updated content and metadata. The PostgreSQL query trace rejects
author/product detail projection, reply loading and viewer reaction hydration
after either navigation write.

[Phase 21 navigation-write response review](community-phase21-review.md).

## Phase 22 — navigation-refresh budget

Status: implemented locally; no staging or production target has been contacted.
Publishing, editing and deleting a post each end by replacing the current route
with a canonical Community destination. Those target pages are runtime-dynamic
through `connection()`, and their Server Actions continue to invalidate the
affected Community and sitemap paths. The explicit client `router.refresh()`
after every replacement therefore issued another request after the navigation
had already obtained the current target projection.

The redundant refreshes are removed only from post mutations that immediately
navigate away. Saving or discarding a private draft deliberately remains on the
composer route and keeps its explicit refresh. The browser gate publishes,
edits and deletes a real post, proving that each canonical destination receives
fresh state through navigation alone.

[Phase 22 navigation-refresh review](community-phase22-review.md).

## Phase 23 — reply-refresh budget

Status: implemented locally; no staging or production target has been contacted.
The detail client already merges an authoritative newly created reply and updates
the locally rendered body, tombstone, version and count for successful reply
edits and deletes. Those reply writes no longer invalidate `/community` or the
thread route, avoiding a Server Action-driven detail-page re-read after each
local state update.

The reply mutation still resolves its parent thread internally before it locks
the post, but edit and delete operations now return `void` at the backend
boundary. The parent ID formerly existed only to drive the removed path
invalidation. A later Community navigation reads current runtime data; real-time
cross-tab synchronization remains outside this phase. Reply moderation keeps
its parent-thread return and targeted invalidation because it changes visibility
outside the reporter's local reply projection.

[Phase 23 reply-refresh review](community-phase23-review.md).

## Phase 24 — moderation-queue resolve refresh budget

Status: implemented locally; no staging or production target has been contacted.
Resolving a report only marks that private moderation-queue record as resolved.
The moderation client removes the exact record from its own state after the
successful action, so the Server Action no longer invalidates and re-reads the
same moderation route.

Post and reply moderation retains Community and where applicable sitemap
invalidation because it changes content visibility beyond the local queue item.
A later navigation to the runtime-dynamic moderation page reads the current
queue; real-time cross-tab synchronization remains outside this phase.

[Phase 24 moderation-queue resolve refresh review](community-phase24-review.md).

## Phase 25 — moderation-action queue refresh budget

Status: implemented locally; no staging or production target has been contacted.
The pending moderation queue contains immutable report snapshots and identifiers;
it does not project thread or reply moderation state. Hiding, restoring, locking,
pinning, or unpinning content therefore leaves every pending queue row unchanged.

Post and reply moderation no longer invalidate `/community/moderation`. When a
moderation command changes content, they continue to invalidate the public
Community feed and affected detail route, and post moderation invalidates sitemap
entries. The browser gate keeps the pending report visible after hiding its
target, then resolves it explicitly.

[Phase 25 moderation-action queue refresh review](community-phase25-review.md).

## Phase 26 — desired-state moderation invalidation budget

Status: implemented locally; no staging or production target has been contacted.
Moderation commands are idempotent desired-state writes: repeating an already
hidden, restored, locked, unlocked, pinned, or unpinned state makes no database
change and creates no audit event. The backend now surfaces that outcome only to
the production Server Actions.

Actions skip Community route and sitemap invalidation for those no-op retries.
Actual post changes retain feed/detail and sitemap invalidation; actual reply
changes retain feed/detail invalidation. The generic preview service remains
`void`-returning, so its consumer contract stays unchanged.

[Phase 26 desired-state moderation invalidation review](community-phase26-review.md).

## Phase 27 — detail authorization display and deletion boundary

Status: implemented locally; no migration, feature-flag, remote target or deployment changed.
The server already returns a hidden post's retained body only to an eligible
moderator, but the interactive detail view treated every hidden post as an
unavailable placeholder and discarded that authorized projection. It also used
one author-and-unlocked condition for both Edit and Delete, even though the
server deliberately permits an author to delete a locked post and preserve its
tombstone.

The detail client now renders an explicit moderator-only hidden-post notice
alongside the authorized retained body. Members retain the redacted hidden-post
state. Edit remains unavailable for locked or hidden posts, while deletion is a
separate author capability for every non-deleted post. The browser gate covers a
real moderator hiding a thread and then reviewing its body; unit and PostgreSQL
tests protect the presentation and service projection boundaries.

[Phase 27 detail authorization review](community-phase27-review.md).

## Phase 28 — complete client projection refresh

Status: implemented locally; no migration, feature-flag, remote target or deployment changed.
The feed, detail and moderation clients keep local interactive state, but their
previous reset boundaries did not cover all data returned by their server
projections. Author names and linked product visibility are loaded independently
from a thread revision, and the moderation queue is an independent server list.

Each of those clients now keys its stateful subtree from the complete serializable
server projection. A route refresh or navigation therefore replaces local state
when any displayed authoritative field changes, while an identical projection
preserves ongoing local interaction state. The composer remains intentionally
outside this reset mechanism because its local state is an unsaved user draft;
its explicit save and discard flows already refresh their authoritative draft.

[Phase 28 client projection refresh review](community-phase28-review.md).

## Phase 29 — locked reply action boundary

Status: implemented locally; no migration, feature-flag, remote target or deployment changed.
Locking a public thread closes reply creation and editing at the service layer,
while preserving an author's ability to delete their own reply and leave a
tombstone. The detail UI now uses the same open/closed condition for root and
nested reply controls, so it no longer exposes Reply or Edit controls that the
server will reject after a lock.

The author-facing Delete control and reporting remain available where their
server rules allow them. A defensive presentation check also closes an existing
edit form if the authoritative thread projection becomes locked.

[Phase 29 locked-reply controls review](community-phase29-review.md).

## Plan review and corrections

1. Frontend first is explicit: Phase 0 demo and the Phase 1 screen/state framework
   were completed before persistence. The remaining static artifact stays clearly
   labeled as a demo rather than a production forum.
2. English-only includes routing, document language, metadata and composing rules;
   merely hardcoding English labels inside `[locale]` would be insufficient.
3. Independent discussion data prevents existing product counters, bot activity,
   launch guards and comment moderation from silently affecting forum behavior.
4. Reusable notification infrastructure still needs new target and permission
   semantics; existing project notifications cannot be copied unchanged.
5. Mutable popularity sorting needs stable pagination. Hot and Latest have
   separate cursor contracts, with bounded reads and user-independent caches.
6. The revised content model separates post type, topic and personal navigation.
   Optional titles use stable ID routes, and the same composer supports short updates
   and longer discussions. Type values are constrained rather than free-form boards.
7. Moderation, concurrency and retry behavior are release requirements, not
   optional polish after the forum opens.

## Demo boundary and preview

Current Phase 1 React preview: `http://localhost:40867`.
The Phase 0 static artifact remains at `http://localhost:40893` (both randomly assigned available ports).
If that server has stopped, allocate a new available port rather than reusing 4176:

```sh
python3 -m http.server 0 --bind 0.0.0.0 --directory docs/demos/community
```

Read the assigned port from startup output. The server exposes only the demo directory.
The demo uses in-memory sample state, has no authentication/database and does not
publish posts. Refresh resets votes, bookmarks, drafts and replies. Visual review
can guide the React implementation; it does not validate production APIs.

## Direction references

Reviewed 2026-09-14: [Uneed community](https://www.uneed.best/community),
[official introduction](https://www.uneed.best/blog/introducing-uneed-community),
and [August 18 category update](https://www.uneed.best/changelog).
The five posting intents and unified Todo composer inform this direction; content
examples in the demo are fictional and do not reproduce community members' posts.
The visual system remains aat.ee's, with sans-serif typography throughout.
