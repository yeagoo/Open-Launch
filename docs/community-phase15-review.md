# Community Phase 15 editor authorization review

Date: 2026-09-15. Scope: remove unnecessary Community editor-page reads and
authorize the editor before projecting unrelated data. No migration, feature
flag, remote target or deployment changed.

## Delivered

- Added `getEditablePost`, which constrains the first thread lookup to the
  current author, published lifecycle, public or pending moderation state, and
  an unlocked post.
- Replaced the editor loader's full detail request with that constrained lookup.
  A rejected editor URL no longer loads reply rows or the visitor's vote and
  bookmark state before returning the existing `missing` result.
- Removed the editor loader's first reply-page read. The edit composer never
  renders replies; its existing `CommunityPost` projection already supplies an
  empty reply list and all fields the composer consumes.
- Added isolated PostgreSQL query-tracing coverage for both a rejected
  non-author request and an authorized author request.

## Review findings and correction

1. The previous editor loader called `details()` before checking ownership.
   That loaded the full detail projection and up to 20 replies for every
   existing public thread, even when a non-author would immediately receive a
   not-found result. The new trace assertion failed before the correction by
   observing a `community_reply` query.
2. `details()` is correct for a thread page, where reply content is rendered.
   Reusing it for the composer was unnecessary work. The new focused query
   retains the same editable-state behavior: authors can edit open public or
   pending posts, while drafts, hidden/deleted posts, locked posts, anonymous
   visitors and non-authors remain unavailable.
3. The authorization condition lives in the SQL predicate instead of a
   post-query JavaScript check. A rejected request receives no thread row to
   project, so author, product, reaction and reply work cannot begin.

## Validation

- The isolated PostgreSQL gate passed all 20 Community integration tests. The
  new trace test verifies rejected requests do not query `community_reply`,
  `community_thread_vote` or `community_bookmark`; it also verifies an author
  editor load has no reply query.
- `bunx tsc --noEmit`, `bun run typecheck:strict-indexes`, `bun run lint`,
  Prettier and whitespace checks passed.
- `bun run test` passed: 541 tests, with 29 conditional skips in the default
  test environment.
- `bun run community:test-browser` passed all 12 Playwright tests against a
  fresh PostgreSQL/Redis fixture, the full 65-migration history and a
  production standalone build. The real post publish-and-edit flow remained
  functional.

No staging or production service was used.

Status: implemented locally; no staging or production target has been contacted.
