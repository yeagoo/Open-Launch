# Community Phase 18 reaction response review

Date: 2026-09-15. Scope: remove unnecessary full-post hydration after Community
vote and bookmark writes. No migration, feature flag, remote target or deployment
changed.

## Finding

`setVote` and `setBookmark` correctly performed a desired-state write under the
thread row lock, but each then called `getPost`. That reloaded and serialized the
whole thread, including its body, author, optional product and current viewer
vote/bookmark state, even though the controls only need the changed reaction
fields. Feed cards already limit rendered bodies to 480 characters, so the full
response also bypassed the intended list projection budget.

## Correction

- Added explicit, serializable vote and bookmark result types to the shared
  Community contract.
- Made the mutation return the actual desired reaction state directly. Vote
  writes use the locked `voteCount` and the `RETURNING` result from the insert or
  delete to calculate the authoritative count without an extra read.
- Kept the existing database counter trigger, row lock, participant checks and
  revalidation behavior. A repeated desired vote or bookmark remains a no-op
  and returns the same desired state.
- Added one pure client helper to merge a compact reaction into an existing post.
  The production feed, detail client and fixture preview use it, so no surface
  replaces replies or a full body with a partial response.
- Changed the isolated PostgreSQL trace to require compact vote and bookmark
  responses and to reject post, user-display, product, reply, vote-state and
  bookmark-state hydration after either write. The only user-table query left is
  the required actor lookup.

## Review result

The new trace failed against the previous implementation because it returned a
full `CommunityPost`; it passes after the correction. The reaction contract is
discriminated by `kind`, and overloads ensure `setVote` and `setBookmark` retain
their distinct TypeScript result types. Concurrent desired votes remain serialized
by the existing thread lock; the integration suite now also checks that all eight
concurrent desired votes return a count of one.

## Validation

- Isolated PostgreSQL Community suite: 21 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 541 passed, 30 conditional skips.
- `bun run community:test-browser` passed all 12 Playwright cases against an
  isolated PostgreSQL/Redis fixture, all 65 migrations and a production
  standalone build.
- The browser gate cleanup check found no remaining named Community test
  containers.

No staging or production service was used.
