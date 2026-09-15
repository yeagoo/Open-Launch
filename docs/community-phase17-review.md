# Community Phase 17 editor author-display review

Date: 2026-09-15. Scope: remove the unused author-name lookup from the
Community editor while retaining identity and normal post presentation. No
migration, feature flag, remote target or deployment changed.

## Delivered

- Added an explicit `includeAuthorName` option to the shared post projection.
  It defaults to enabled for feed cards, details and mutation responses.
- Disabled author display-name loading only in `getEditablePost`; `authorId`
  remains available to the editor's ownership check and client state.
- Extended the isolated PostgreSQL trace to require exactly one user-table
  query for an authorized editor request: the necessary actor lookup.
- Added a companion detail assertion that still receives the author's name.

## Review findings and correction

1. After Phases 15 and 16, an author editor load correctly skipped replies,
   votes and bookmarks, but still made two user-table queries. One resolved the
   session actor and is required; the other fetched a display name that
   `CommunityComposerClient` never renders.
2. Dropping author names from every projection would have broken cards and
   detail pages. The shared option therefore preserves existing output by
   default and is explicitly disabled only for the editor.
3. The new query-count assertion failed before the correction with two
   user-table statements. It now proves the editor keeps its required actor
   identity while omitting the unconsumed display projection.

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
