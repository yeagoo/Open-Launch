# Community Phase 26 desired-state moderation invalidation review

Date: 2026-09-15. Scope: skip Community invalidation after idempotent moderation
retries. No migration, feature flag, remote target or deployment changed.

## Finding

Post and reply moderation already use desired-state semantics. A request that
repeats the current state returns successfully without updating the target or
creating a duplicate audit event. The Server Actions could not distinguish that
no-op outcome from a real change, so both invalidated public Community routes;
post moderation also invalidated the sitemap tag.

This makes a recovered request after a lost response do unnecessary route and
sitemap work even though the first successful request already made the durable
change.

## Correction

- The underlying post moderation mutation returns whether it wrote a change.
- The production backend exposes a compact post moderation outcome while the
  generic preview service continues returning `void`.
- Reply moderation returns its parent thread ID together with `changed`.
- Server Actions invalidate public paths and sitemap entries only when `changed`
  is true.

## Review result

Regression tests were added before the implementation. The Server Action suite
failed because it had no change-aware post contract and still invalidated paths
for no-op results. The isolated PostgreSQL suite also lacked that result surface.
They now verify that concurrent desired-state retries produce exactly one true
outcome, one audit event, and no invalidation for an explicit no-op retry.

Changed moderation still triggers the four public route invalidations for one
post-plus-reply sequence and the single sitemap tag invalidation for the post.

## Validation

- Focused Community Server Action suite: 10 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 548 passed, with 31 conditional skips.
- Isolated PostgreSQL Community suite: 22 passed.
- `bun run community:test-browser` passed all 12 Playwright cases against
  isolated loopback PostgreSQL, Redis and a production standalone build.

No staging or production service was used.
