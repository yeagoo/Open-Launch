# Community Phase 16 editor interaction-projection review

Date: 2026-09-15. Scope: remove interaction-state reads that the Community
editor does not render while preserving them everywhere that does. No migration,
feature flag, remote target or deployment changed.

## Delivered

- Added an explicit `includeInteractions` option to the shared post-projection
  helper. Its default remains enabled, preserving feed, detail and mutation
  response behavior.
- Disabled that option only for `getEditablePost`. An authorized editor request
  no longer queries `community_thread_vote` or `community_bookmark`.
- Extended the isolated PostgreSQL query trace to enforce the editor's reply,
  vote and bookmark query budget for both rejected and authorized paths.
- Added assertions that normal desired-state vote and bookmark operations still
  return `voted: true` and `saved: true`.

## Review findings and correction

1. Phase 15 removed reply reads and moved authorization before projection, but
   the shared projection still fetched an actor's vote and bookmark state for
   the authorized author. `CommunityComposerClient` reads neither field, so
   those two queries could not change the editor's rendering or behavior.
2. Removing interaction reads globally would have broken the feed and detail
   controls, as well as the optimistic action results. The option therefore
   defaults to the existing behavior and the editor is the only explicit
   opt-out.
3. The query trace failed before the correction by observing
   `community_thread_vote` for an owner editor load. The corrected trace proves
   both interaction tables are absent while the existing vote/bookmark contract
   tests cover the default path.

## Validation

- The isolated PostgreSQL gate passed all 20 Community integration tests.
- `bunx tsc --noEmit`, `bun run typecheck:strict-indexes`, `bun run lint`,
  Prettier and whitespace checks passed.
- `bun run test` passed: 541 tests, with 29 conditional skips in the default
  test environment.
- `bun run community:test-browser` passed all 12 Playwright tests against a
  fresh PostgreSQL/Redis fixture, the full 65-migration history and a
  production standalone build. The real publish-and-edit flow remained
  functional.

No staging or production service was used.

Status: implemented locally; no staging or production target has been contacted.
