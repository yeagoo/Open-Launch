# Community Phase 22 navigation-refresh review

Date: 2026-09-15. Scope: remove redundant client refreshes after Community
post navigation. No migration, feature flag, remote target or deployment changed.

## Finding

After successful publishing and editing, the composer called `router.replace()`
for the canonical thread route and immediately called `router.refresh()`. The
thread deletion flow did the same for `/community`. Next.js documents that
`replace` performs a client-side navigation, while `refresh` makes a new server
request and re-renders the current route. The duplicate call therefore added a
second route-data request after a target navigation.

Community page loaders call `connection()` before reading their service data, so
their target projections are runtime-dynamic. The corresponding Server Actions
also retain targeted `revalidatePath` and sitemap invalidation. A normal
replacement navigation therefore reads current content without the additional
client refresh.

## Correction

- Removed `router.refresh()` after publish, edit and delete replacements.
- Kept `router.replace()` and all Server Action route/sitemap invalidation.
- Kept draft save/discard refreshes because those writes remain on the composer
  route rather than navigating to a fresh destination.

## Review result

Three client regression tests were added before the implementation and failed
against the prior code, each recording one refresh after a successful publish,
edit or delete. They now require the canonical replacement and no client
refresh. The existing production browser flow now also deletes the real post it
creates and verifies that `/community` no longer renders that deleted post.

This change is limited to navigation completions. It does not alter write
authorization, idempotency, mutation results, cache invalidation or the draft
refresh contract.

## Validation

- Focused Community client suites: 8 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 545 passed, 31 conditional skips.
- Isolated PostgreSQL Community suite: 22 passed.
- `bun run community:test-browser` passed all 12 Playwright cases against
  isolated loopback PostgreSQL, Redis and a production standalone build.

No staging or production service was used.
