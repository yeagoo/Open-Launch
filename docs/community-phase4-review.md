# Community Phase 4 delivery and review

Date: 2026-09-14. Scope: make the public Latest-search path safe at realistic
forum and product-catalogue sizes, add a reproducible database gate, and verify
the feature flag against the final runner. The feature remains disabled by
default; this work does not migrate, enable, or deploy the forum.

## Finding and correction

The original public-search predicate combined full-post text matching with a
linked-product `EXISTS` clause and ordered results by publication date. For a
rare product-name-only result deep in history, PostgreSQL can preserve that
ordering by walking the public date index until it finds the match. A direct
candidate union fixes that case, but applying it to every query makes a common
term materialize and sort every matching trigram result.

`listPosts` now uses two bounded paths for public Latest searches:

1. It selects the first 500 IDs in the current public/type/cursor timeline,
   then applies the existing literal text-or-product predicate. A derived-table
   boundary keeps this probe on `community_thread_public_date_idx`. If it
   contains 21 results, those are necessarily the next page.
2. When the probe cannot fill a page, it builds two independently bounded
   candidate branches: text through
   `community_thread_public_text_trgm_idx`, and product names through the
   already-migrated `project_name_trgm_idx` followed by
   `community_thread_project_idx`. Their distinct IDs are ordered back into
   the normal keyset feed.

Each candidate branch applies visibility, type and cursor filters before its
page limit. This keeps hidden/pending content excluded and preserves type and
keyset semantics. Personal and Hot views retain their existing bounded paths.

## Review findings fixed

| Finding                                                                                                                      | Resolution                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Rare product-name matches could require a date-ordered walk through old public threads.                                      | Added the indexed fallback candidate branches.                                                                                         |
| An unconditional candidate union makes common terms scan and sort all trigram matches.                                       | Added the 500-row chronological probe and uses the fallback only if a page remains incomplete.                                         |
| Product search validation did not exercise the existing directory trigram migration.                                         | The isolated community runner applies the reviewed `0053_search_indexes.sql` migration against a compatible fixture.                   |
| Product-name search pagination was not covered with a type filter.                                                           | Added a 23-post typed product-search test that verifies two pages contain each expected post exactly once.                             |
| Search-plan evidence did not cover the linked-product branch at useful size.                                                 | Added a 100,000-product / 110,000-thread fixture, persisted ignored plan evidence, and asserts all relevant index names.               |
| Phase 0 documentation named personal-feed paths that the query-based implementation did not serve.                           | Corrected the canonical addresses and added permanent redirects from `/community/mine` and `/community/saved`.                         |
| A closed forum reached `notFound()` after the shared root layout started streaming and returned HTTP 200.                    | Added a Proxy preflight that returns 404 for every canonical forum route before rendering.                                             |
| The two legacy personal-view `permanentRedirect()` calls also streamed a 200 response.                                       | Moved their stable 308 redirects into the Proxy and verify both paths in unit and runner tests.                                        |
| Legacy post-detail redirects could also stream a 200 response, and an encoded ID could be double-encoded.                    | Proxy redirects the exact legacy detail/editor shapes before rendering and normalizes the ID once; runner coverage uses an encoded ID. |
| The first redirect parser used GNU awk's `IGNORECASE`, which is unavailable in the runner's mawk.                            | Use portable `tolower()` matching when reading the `Location` header.                                                                  |
| The read-only runner lacked the bounded cache mount required by the production Compose contract.                             | Mount the documented 256 MiB Next.js cache tmpfs, assert it is writable to UID 1001, and reject cache-write errors in both runs.       |
| The forum had no true browser coverage through its Server Actions and moderator screen.                                      | Extended the loopback-only Playwright fixture with opt-in Community data, member and moderator sessions, and real browser flows.       |
| Reply input changes cleared an idempotency key to `""`; `??=` then kept that invalid value when a reply was submitted.       | Delete invalidated keys so submit always creates a valid key, while transport retries retain the existing one.                         |
| Path revalidation remounted the client tree and discarded the detail/composer's local success message.                       | Send successful forum mutations through the root Sonner live region, which survives the server-driven refresh.                         |
| A failed Playwright run left ignored report assets that ESLint still scanned on the next command.                            | Add the existing `playwright-report/` and `test-results/` outputs to flat-config ignores.                                              |
| The release harness accepted `127.0.0.1` and HTTPS even though the standalone/default-locale rewrite requires one HTTP host. | Require `http://localhost` with a clear early error.                                                                                   |
| A late Client Router request from the old locale could finish after a language switch and overwrite `NEXT_LOCALE`.           | Use a `localeCookie: false` next-intl pipeline for Client Router work; document locale navigation still persists the selection.        |

## Validation

Completed locally:

```sh
bun run community:test-db
bunx tsc --noEmit
bun run typecheck:strict-indexes
bun run lint
bun run test
bun run community:preview
bun run community:verify
bun run build:next
# after building a local linux/amd64 runner image
scripts/smoke-runner-image.sh <runner-image-tag>
```

The isolated PostgreSQL runner creates and removes a loopback cluster. It passed
18 integration tests and recorded these verified plan properties:

- ordinary Latest and type feeds use their public date indexes;
- a rare linked-product search uses the text trigram, project-name trigram and
  thread-project indexes in the candidate plan;
- a common current term uses the public date index for the bounded probe rather
  than the community text trigram index;
- typed product search and two pages of broad current search return no duplicate
  posts.

The final Vitest run passed 497 tests across 116 files; 27 conditional tests
were skipped. Both TypeScript checks, ESLint and ShellCheck passed. The
standalone community preview remains 94.0 KiB gzip against its 180 KiB budget,
its browser verifier passed, and a Dockerfile production build compiled the
gated community routes.

The follow-up browser gate built the standalone app with its randomized
`http://localhost:<port>` value supplied as `NEXT_PUBLIC_URL` at build time,
applied all 65 hand-written migrations to a temporary loopback PostgreSQL
database, and ran `CI=1 bun run e2e` with temporary Redis. All 20 browser tests
passed: every supported site locale through the English forum bridge, signed-out
participation boundaries, 390 px keyboard/mobile navigation, empty-reply focus
handling, member and anonymous draft privacy, member vote/reply/reply edit,
post publish/edit, moderator hide/resolve, and the existing release smoke
cases. The temporary containers were removed on exit.

A standalone HTTP probe also reproduced both stale RSC shapes that triggered
the language-switch race. Neither a normal localized request nor a
locale-prefixed Community bridge request with the standalone adapter's retained
`next-url` header emits `NEXT_LOCALE`; a direct `/zh/community` document request
redirects to `/community` and persists `NEXT_LOCALE=zh`.

The immutable runner smoke now also proves the locally built final runner image
keeps the forum closed when no `COMMUNITY_ENABLED=1` opt-in is present:
`/community` and filtered variants return 404, navigation has no Community link, a
locale-prefixed `/zh/community` request returns the canonical English URL while
setting `NEXT_LOCALE=zh`, and the early personal-feed addresses return their
permanent canonical redirects. It also verifies the legacy post and editor
aliases, including an encoded ID. The runner mounts the same bounded 256 MiB
Next.js cache tmpfs used by production, verifies the application user can write
to it, and rejects cache-write failures in both runs. It then starts the same
immutable image with an explicit opt-in and verifies the feed and navigation
become available. Both checks use an isolated PostgreSQL/Redis pair; no external
environment is enabled.

The generated `artifacts/community-database/query-plans.json` is ignored and is
evidence for the local PostgreSQL version and fixture statistics, not a
production latency commitment.

## Remaining rollout work

Run the normal migration process on a backup-verified staging target, inspect
plans using its production-like statistics, measure authenticated route TTFB,
and then use the existing `COMMUNITY_ENABLED=1` staff canary. No production
migration, feature enablement, or deployment was performed in this phase.
