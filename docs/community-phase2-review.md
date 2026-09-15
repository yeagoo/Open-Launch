# Community Phase 2 delivery and review

Date: 2026-09-14. Scope: PostgreSQL persistence, server permissions and services.
Phase 0/1's English-only, sans-serif, orange/green preview remains the visual baseline.
The real `/community` route and server actions are Phase 3 work. No production
migration or deployment was performed; `COMMUNITY_ENABLED` defaults to disabled.

## Delivered

- Migration `0063_community_core.sql` and matching Drizzle definitions: threads,
  replies, votes, bookmarks, reports, append-only moderation events and Hot snapshots.
  This follows the existing manual SQL migration ledger; historical migrations and
  Drizzle's old generated journal are unchanged.
- Server-only factory using the existing session resolver, fresh database account
  permissions, structured logger and Redis limiter with fail-closed write policy.
  Caller-supplied actor/role data is never part of the production interface.
- Private drafts, publish/edit/delete, one-level replies and pagination, desired-state
  votes/bookmarks, thread/reply reports and moderation. Writes require verified,
  non-banned, non-bot accounts; moderation also requires the existing admin role.
- Transaction locks and versions serialize edits/moderation and replies/locking.
  Publish/reply request keys validate a SHA-256 payload hash; retries cannot create
  duplicate content or reuse a key for a different payload.
- Database triggers maintain vote/reply counts, including account deletion and reply
  visibility changes. Account deletion purges private drafts and anonymizes public
  contributions. Deleting a project clears its association without deleting discussions.
- Public list reads exclude drafts/pending/hidden/deleted posts. Removed detail views
  return redacted placeholders; pending content is limited to its author/admin.
  Hidden post bodies are available only to eligible moderators. Public product
  context is checked independently on every projection and search.

## Query and interface decisions

Feeds load 20 posts and batched author/product/vote/bookmark projections, without
loading reply bodies. Details load at most 20 replies, with a separate reply cursor.
`replyCount` counts visible replies; hidden/deleted replies remain tombstones in the
reply sequence. Lists do not compute full-table totals.

Latest uses date/UUID keysets. Hot snapshots contain up to 2,000 public posts from
the last seven days, ordered by active pin, votes, publication date and UUID. One
snapshot is shared per five-minute bucket and expires after 15 minutes. Every page
rechecks visibility; expired cursors produce a typed refresh conflict. Hot filters
apply within that bounded candidate set. Personal feeds use chronological ordering.

The moderator service returns the oldest 50 pending reports. Resolved reports and
audit events remain in PostgreSQL; a historical audit browser is not implemented.
Bodies are stored as text, never trusted HTML. Phase 3 must reuse the existing
sanitized rendering boundary when adding formatted content.

No shared response cache is introduced: permissions and personalized projections
are evaluated per request. Existing notifications/uploads are not wired to forum
events in this phase.

## Review findings fixed

1. Parenthesized the combined text/product search predicate so an OR match cannot
   bypass public visibility restrictions.
2. Added stored reply counts and bounded reply loading to prevent feed hydration
   from growing with the total reply volume.
3. Added stable, expiring Hot snapshots instead of paginating mutable vote counts.
4. Kept a newer saved draft when publishing an older composition; only an exact
   matching draft is removed on successful publication.
5. Restricted audit reference nulling to deleted referenced records. Manual
   anonymization of existing actors/targets, content edits and deletion are rejected.
6. Preserved ownership/version metadata for an author's hidden post so the author
   can still delete it without gaining access to its hidden body.
7. Unified moderator eligibility across queue and content reads. Infrastructure
   failures from session resolution, limiting and queries become typed retryable
   errors with private details confined to structured logging.
8. Exposed optional reply IDs on report contracts, rejected null characters in
   product IDs, and validated same-thread/root-only reply parents at both service
   and database boundaries.

## Validation

- `bun run community:test-db`: 15 integration tests against a fresh isolated
  PostgreSQL 18 cluster, applying the actual migration. Covers concurrent retries,
  counter consistency/cascades, private content/search, stale versions, reply/lock
  and edit/hide races, audit protection, draft preservation and pagination.
  The runner never reads `DATABASE_URL`, binds a random loopback port and removes
  its disposable cluster after completion.
- Four community unit/contract suites: 13 tests, including the disabled production
  factory and trusted-session/fail-closed limiter wiring.
- `bunx tsc --noEmit` and scoped ESLint pass.
- The 10,000-post fixture check uses `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and
  asserts actual use of the public date and public type/date indexes. Query plans
  and a substring-search timing are written to
  `artifacts/community-database/query-plans.json` on every integration run.
- `bun run community:preview && bun run community:verify`: passed React hydration,
  interaction/error/permission flows and responsive browser acceptance. Total
  JavaScript gzip is 93.9 KiB, within the 180 KiB preview budget.
- `bun run build:next`: passed; build log is stored locally at
  `artifacts/community-database/next-build.log`.

The local fixture is a correctness/query-plan baseline, not a production load test.
Literal substring search still scans matching text and needs an indexed search
strategy plus public-read abuse controls before Phase 3 launch. No production
latency claim is made from this test.

## Phase 3 handoff

Connect real routes/actions and session UI; keep the exact public URL `/community`
and English-only interface. Replace demo request counters with per-composition UUID
keys retained across retries. Wire reply cursors, nested replies, server counts,
reply report targets and the pending moderation queue. Personal views must not
offer a misleading Hot sort. Implement production search/read limits, metadata,
sanitized rendering and cache invalidation before enabling the feature. Apply the
migration through the existing migration runner during the eventual release;
do not use the isolated integration fixture as an existing-database migration tool.
