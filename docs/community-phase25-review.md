# Community Phase 25 moderation-action queue refresh review

Date: 2026-09-15. Scope: remove redundant moderation-queue invalidation after
post and reply moderation. No migration, feature flag, remote target or
deployment changed.

## Finding

The moderation queue selects only pending report identifiers, target identifiers,
reasons, and immutable content snapshots. It does not select post or reply
moderation state. Hiding, restoring, locking, pinning, unpinning, or moderating
a reply leaves its pending queue row unchanged.

Both moderation Server Actions nevertheless invalidated
`/community/moderation`. This re-read a route whose rendered queue projection
was identical, while the affected public feed and detail route still needed
fresh content.

## Correction

- Post moderation keeps Community feed/detail and sitemap invalidation, but no
  longer invalidates the moderation queue route.
- Reply moderation keeps Community feed/detail invalidation, but no longer
  invalidates the moderation queue route.
- Resolving a report remains the only queue mutation that changes local queue
  state; the client removes that record immediately.

## Review result

A Server Action regression test was added before the implementation and failed:
the post-plus-reply moderation sequence made six path invalidations, including
two moderation-queue refreshes. It now requires the four public content path
invalidations, the existing sitemap invalidation for post moderation, and no
moderation-queue refresh.

The real-browser moderator flow now explicitly confirms that a pending report
remains visible after its post is hidden, before the moderator resolves it.

## Validation

- Focused Community Server Action suite: 9 passed.
- Focused Community client action-lock suite: 4 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 547 passed, with 31 conditional skips.
- Isolated PostgreSQL Community suite: 22 passed.
- `bun run community:test-browser` passed all 12 Playwright cases against
  isolated loopback PostgreSQL, Redis and a production standalone build.

No staging or production service was used.
