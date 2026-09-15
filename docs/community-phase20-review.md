# Community Phase 20 private-write and report refresh review

Date: 2026-09-15. Scope: remove redundant Community route invalidation after
private draft writes and report submissions. No migration, feature flag, remote
target or deployment changed.

## Finding

`saveCommunityDraft` called `revalidatePath("/community/new")`, and the composer
then explicitly called `router.refresh()` after both saving and discarding. The
draft is private and the composer retains the exact local draft state, while the
explicit refresh renews that route's client cache for a later return.

Post and reply reports only insert a pending moderation record. They do not
change the public thread, reply, feed or sitemap projection, yet their Server
Actions invalidated the feed and thread paths. Reply reports also returned a
parent thread ID solely so the action could perform that invalidation.

## Correction

- Draft writes no longer use `revalidatePath`; the existing composer
  `router.refresh()` remains the one deliberate refresh for its private route.
- Post and reply report actions no longer invalidate public Community paths.
- `reportReply` and its underlying moderation helper now return `void`, removing
  the service-boundary value that only supported the removed invalidation.
- Content, visibility and sitemap mutations keep their existing invalidation
  behavior. The moderation queue remains runtime-dynamic and is refreshed by a
  later navigation rather than a reporter's current-page action.

## Review result

The focused Server Action regression test first failed against the prior code,
recording five path invalidations for one draft save, one post report and one
reply report. It now verifies the three successful writes, their exact service
arguments, and the absence of path or tag invalidation. Type checking confirms
that no consumer still expects a reply-report thread ID.

## Validation

- Focused Community Server Action suite: 7 passed.
- Isolated PostgreSQL Community suite: 21 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 543 passed, 30 conditional skips.
- `bun run community:test-browser` passed all 12 Playwright cases against an
  isolated PostgreSQL/Redis fixture, all 65 migrations and a production
  standalone build.

No staging or production service was used.
