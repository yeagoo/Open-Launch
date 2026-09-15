# Community Phase 11 cursor integrity review

Date: 2026-09-15. Scope: close two cursor-related Community correctness and
abuse-control gaps found during the local review. No migration, feature flag,
remote target or deployment was changed.

## Delivered

- Search cursor actions now require both the bounded cursor-page budget and the
  existing public search budget before calling `service.list`.
- The initial RSC route retains its friendly rate-limited empty state; cursor
  actions return a typed retryable result so the existing client error handling
  can keep the current results visible.
- `CommunityReply` now carries the database `createdAt` projection for both
  first-page and newly created replies.
- Reply merges use the database's ascending `(createdAt, id)` order, preventing
  a locally posted reply from being rendered ahead of unseen older cursor rows.

## Review findings and corrections

| Finding                                                                                                                                                                                                                                | Resolution                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The initial server-rendered search spent the `community:search` budget, but `loadMoreCommunityPosts` checked only `community:page`. A caller could invoke the Server Action with a search cursor and bypass the dedicated search gate. | Add `assertCommunitySearchAllowed` to the same action after the page budget and before the service query. The normal initial-page flow still uses its non-throwing check to render a recoverable state. |
| The reply service sorted every cursor page by `created_at, id`, but omitted `createdAt` from the client projection. The client therefore appended a new reply immediately, then appended older cursor data after it.                   | Project the timestamp for page and mutation results, make it part of the UI contract, and sort deduplicated reply merges by the same stable keyset order.                                               |
| The existing unit test proved duplicate reply submits were serialized, but it did not exercise a reply arriving between two pages.                                                                                                     | Add a jsdom regression with an initial reply, a locally posted later reply and a subsequently loaded middle reply; it asserts the final DOM order.                                                      |
| Timestamp propagation could drift between mutation and page query paths.                                                                                                                                                               | Extend the isolated PostgreSQL test to require a finite timestamp from `replyTo` and verify merged cursor pages already follow `(createdAt, id)`.                                                       |

## Validation

- Focused Community action, page-loader, rate-limit and detail-client tests:
  14 passed.
- `bun run community:test-db`: 18 isolated PostgreSQL integration tests passed;
  its temporary cluster was removed.
- `bun run test`: 537 passed, with 27 existing conditional skips.
- `bun run community:test-browser`: 10 Playwright tests passed against a fresh
  PostgreSQL/Redis pair, a complete 65-migration history and a production
  standalone build. Its temporary containers were removed after completion.
- TypeScript, strict-index type checking, ESLint, Prettier, ShellCheck and
  whitespace checks passed.

No staging or production service was used.
