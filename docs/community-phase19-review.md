# Community Phase 19 reaction route-refresh review

Date: 2026-09-15. Scope: remove unnecessary route invalidation after Community
vote and bookmark writes. No migration, feature flag, remote target or deployment
changed.

## Finding

Phase 18 made both reactions return a compact authoritative result, and the feed
and thread-detail clients already merge that result into their existing post
projection. However, each corresponding Server Action still called
`revalidatePath("/community")` and `revalidatePath("/community/t/[id]")`.

Community page loaders first call `connection()` and the Community data layer
does not use a shared response cache because its projections contain viewer state.
The route invalidation therefore had no Community cache entry to purge for the
current interaction. [Next.js documents](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
that a Server Function revalidation updates the active affected UI immediately and
currently refreshes previously visited paths when they are visited again. The extra
refresh could remount the interaction tree and add a redundant page-data read after
every vote or bookmark.

## Correction

- `setCommunityVote` and `setCommunityBookmark` now return their compact service
  result without path or sitemap invalidation.
- The local client continues to optimistically update, then merges the server's
  authoritative desired state. A later navigation receives current runtime data.
- Revalidation remains unchanged for content, visibility and metadata mutations:
  drafts, publishing, editing, deleting, replies, reports and moderation keep
  their existing targeted path and, where applicable, sitemap invalidation.

## Review result

A focused Server Action regression test first failed against the prior code,
recording four path invalidations for one vote and one bookmark. It now verifies
the exact compact responses, service arguments, and absence of both path and tag
invalidation. This keeps the optimization limited to reactions; it does not
weaken consistency for mutations that change rendered content beyond the current
client projection.

## Validation

- Focused Community Server Action suite: 6 passed.
- Isolated PostgreSQL Community suite: 21 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 542 passed, 30 conditional skips.
- `bun run community:test-browser` passed all 12 Playwright cases against an
  isolated PostgreSQL/Redis fixture, all 65 migrations and a production
  standalone build.

No staging or production service was used.
