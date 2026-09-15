# Community Phase 12 canonical-thread 404 review

Date: 2026-09-15. Scope: correct Community thread URL handling found during the
local review. No migration, feature flag, remote target or deployment changed.

## Delivered

- Added one lightweight Community UUID format shared by the Proxy and the
  server-side Zod schema.
- The Proxy now returns a real 404 before rendering for `/community/t`, malformed
  canonical detail IDs and malformed canonical editor IDs, including malformed
  percent-encoded path segments. It rewrites internally to the existing
  not-found page, preserving the visitor's requested URL and Community's English
  document-language contract.
- Detail and editor pages also map an ID validation failure to their existing
  not-found UI as a defense for render paths that do not rely on the document
  Proxy response.
- Added direct Proxy, service-format and isolated production-browser regression
  coverage. Valid UUID paths remain available to the page service; absent valid
  UUIDs render noindex not-found content.

## Review findings and corrections

1. `/community/t` called `notFound()` after a streamable root layout had
   started, so a direct document request returned HTTP 200. The Proxy now
   rewrites this known namespace to its existing not-found page with HTTP 404,
   while preserving the requested URL.
2. A malformed canonical post ID reached `idSchema`, raised a
   `CommunityError("validation")`, and then entered the temporary Community
   error boundary because detail and editor routes only handled `missing`.
   Both loaders now treat `validation` as not-found, and the Proxy rejects the
   same malformed syntax before rendering.
3. A separate Proxy UUID expression could drift from the schema and block an
   otherwise valid stored ID. `communityIdPattern`, `idSchema`, `isCommunityId`
   and their regression test now use the same pattern, including nil, uppercase
   and UUIDv7-shaped IDs.
4. The Proxy rewrite initially did not forward the trusted Community route
   marker, so a visitor with a non-English site preference could receive an
   English 404 body in a document labeled with their chrome locale. The rewrite
   now forwards the generated request ID and trusted marker; the production
   browser test sets a Chinese locale cookie and requires `html[lang="en"]`.
5. A valid but absent UUID initially returned HTTP 200 under streamed rendering.
   An attempted metadata-time `notFound()` still produced 200 in the production
   standalone browser run because headers had already been sent by the
   surrounding layout. The normal noindex not-found UI remains for
   database-dependent absence. The change does not add a database lookup to the
   Proxy or remove the Community loading boundary merely to alter this framework
   streaming status. Next documents this behavior in its
   [not-found reference](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)
   and [streaming guide](https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming).

## Validation

- The focused identifier and Community Proxy suites passed: 15 tests.
- `bun run test`: 540 passed, with 27 existing conditional skips.
- `bun run community:test-db`: 18 isolated PostgreSQL integration tests passed;
  its temporary cluster was removed.
- `bun run community:test-browser`: 12 Playwright tests passed against fresh
  PostgreSQL and Redis containers, the complete 65-migration history and a
  production standalone build. It verifies real HTTP 404 responses for
  syntactically unusable canonical URLs, their visible not-found page and
  unchanged browser URL, plus noindex not-found content for absent valid UUIDs.
  Its temporary containers were removed after completion.
- TypeScript, strict-index type checking, ESLint, Prettier and whitespace checks
  passed.

No staging or production service was used.
