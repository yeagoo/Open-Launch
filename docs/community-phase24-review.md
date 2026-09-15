# Community Phase 24 moderation-queue resolve refresh review

Date: 2026-09-15. Scope: remove redundant Community route invalidation after a
moderator resolves one report. No migration, feature flag, remote target or
deployment changed.

## Finding

Resolving a report changes only its private moderation-queue record. On a
successful response, the moderation client already filters that exact report
from its local queue and renders the empty state when no records remain.

Despite the complete local update, the Server Action invalidated
`/community/moderation`. That caused an unnecessary Server Action-driven
re-read of the route that had just been updated in place.

## Correction

- `resolveCommunityReport` now returns the existing `void` service result
  without calling `revalidatePath`.
- The local queue update remains the source of immediate UI feedback.
- Post and reply moderation retain their targeted invalidation because changing
  content visibility affects Community pages outside the current queue.

## Review result

A Server Action regression test was added before the implementation and failed
because resolving a report invalidated `/community/moderation`. It now verifies
the exact backend call, compact success result, and absence of both path and
sitemap invalidation.

The existing real-browser moderator flow hides a reported thread, returns to
the moderation queue, resolves the report, and verifies the local empty state
against a production standalone build.

## Validation

- Focused Community Server Action suite: 8 passed.
- Focused Community client action-lock suite: 4 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 546 passed, with 31 conditional skips.
- Isolated PostgreSQL Community suite: 22 passed.
- `bun run community:test-browser` passed all 12 Playwright cases against
  isolated loopback PostgreSQL, Redis and a production standalone build.

No staging or production service was used.
