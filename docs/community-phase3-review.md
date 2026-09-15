# Community Phase 3 delivery and review

Date: 2026-09-14. Scope: connect the reviewed forum UI to the persisted service,
then close the production, performance and routing gaps found during review.
The feature is implemented but **not deployed or enabled**. `COMMUNITY_ENABLED=0`
remains the default.

## Delivered

- Real, English-only routes: `/community`, `/community/new`,
  `/community/moderation`, `/community/t/[id]` and `/community/t/[id]/edit`.
  The old pre-release detail shape redirects permanently to `/community/t/[id]`.
- Existing server-only community service and Server Actions now power the feed,
  compose/edit/delete, replies, reactions, reports and moderation UI. The browser
  never supplies an actor ID or role.
- `proxy.ts` bridges `/zh/community`-style language-switch URLs back to the
  canonical forum path with the query string intact. It records the chosen
  chrome locale and forwards a trusted marker so the forum document is English;
  localized nav/footer sections declare their own locale.
- Safe Markdown rendering reuses `components/ui/safe-markdown.tsx`: no raw HTML
  execution or images, and links use `ugc nofollow noopener noreferrer`.
- Public-only canonical metadata, discussion JSON-LD, robots exclusions and
  feature-gated sitemap shards. Public-thread mutations invalidate the sitemap
  tag as well as affected routes.

## Review findings fixed

| Finding                                                                            | Resolution                                                                                                                             |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Feed cards transferred full 10 kB bodies and product descriptions                  | Feed bodies are projected to 480 characters; product source text is bounded before a 180-character plain-text projection.              |
| Product picker could sort ambiguously at equal timestamps                          | The bounded 100-product query and partial index use `updated_at DESC, name ASC, id ASC`.                                               |
| Literal search used an unindexed scan path and could interpret wildcard characters | `0064` adds the partial trigram index; minimum three-character search escapes `%`, `_` and backslash, with isolated database coverage. |
| Search/cursor reads had no distinct public abuse budget                            | Search and cursor actions use existing rate limiting with bounded in-memory fallback; writes stay fail-closed.                         |
| Any reader could open an edit form before the mutation rejected it                 | The server page loader permits only the author and editable post state, returning a missing response for other readers.                |
| Plan URL and implementation URL differed                                           | Thread links, action invalidation, metadata, JSON-LD and sitemap use `/community/t/[id]`; old paths redirect.                          |
| Locale switching could generate `/zh/community` and fail to load the forum         | The proxy canonicalizes that path while preserving the site locale; forum content and document language stay English.                  |
| Transport failures could leave client interaction locks set                        | Vote/bookmark, reply, report, moderation and pagination paths handle rejected promises and release or retain state appropriately.      |
| State-reset effects caused avoidable client renders                                | Feed and detail state is keyed by the server projection instead of synchronously resetting state in an effect.                         |
| Generic state UI placed buttons inside a paragraph                                 | State content now uses a semantic container.                                                                                           |
| Next 16 rejected actions that returned promises without `async`                    | Every exported Server Action is explicitly `async`; the production build now validates that boundary.                                  |
| The standalone preview bundled `next/link` and failed hydration in a browser       | The shared shell accepts an injected live link; the standalone preview uses native anchors and has no Next runtime dependency.         |
| Seed posts appeared interactive before their cursor snapshot was available         | The first preview adapter read now reports loading, so pagination cannot act on a partial fixture page.                                |
| Reply mutations revalidated a client-supplied thread path                          | Reply/report/moderation transactions return their actual parent thread; actions invalidate that server-resolved path.                  |
| The document-language marker could arrive from an external request header          | Proxy clears the incoming marker and adds it only on a canonical community request.                                                    |
| Live community markup nested a `main` landmark inside the app layout               | Live pages use the existing application landmark; the standalone preview retains its own `main`.                                       |
| Robots covered only the legacy edit path                                           | The canonical `/community/t/*/edit` path is now disallowed as well as `noindex`.                                                       |

## Validation

Completed locally:

```sh
bun run community:test-db
bunx vitest run lib/community/urls.test.ts lib/community/read-limits.test.ts \
  lib/community/page-loader.test.ts tests/community-actions.test.ts \
  tests/community-preview-routing.test.ts tests/community-server-gate.test.ts \
  lib/sitemap-xml.test.ts tests/safe-markdown.test.tsx tests/community-robots.test.ts
bunx tsc --noEmit
bun run typecheck:strict-indexes
bun run lint
bun run test
bun run community:preview
bun run community:verify
bun run build:next
```

- The isolated PostgreSQL runner applied `0063` and `0064` to a fresh loopback
  cluster and passed 17 integration tests. It verifies constraints, permissions,
  retries, visibility, feed/reply bounds, search escaping, editor access and
  10,000-post index plans. The cluster is removed afterward.
- Nine focused unit/contract suites passed 27 tests, including the runtime
  feature gate, proxy locale bridge, sitemap visibility, Safe Markdown policy and
  action error shape.
- The full repository Vitest run passed 488 tests; 26 existing conditional tests
  remained skipped.
- Both TypeScript checks and the repository-wide ESLint pass after the review
  fixes.
- The preview bundle is 94.0 KiB gzip against a 180 KiB budget; the browser
  verifier and the final Next production build pass.

No production migration, feature enablement or deployment was performed. The
local database result is a baseline, not a claim about production traffic latency.

## Release checklist (not executed)

1. Take the normal database backup/snapshot and verify recovery procedures.
2. Run `bun run db:migrate` using the existing production migration process;
   confirm `0063_community_core.sql` and `0064_community_search_indexes.sql`
   are recorded and valid. Do not use the isolated test runner on a real target.
3. Keep `COMMUNITY_ENABLED=0` through deployment, then enable it first for a
   staff canary. Exercise locale switching, anonymous read, verified write,
   moderation and the disabled-flag rollback path.
4. Inspect PostgreSQL plans for the public feed and both text/product search
   branches, plus application error/rate-limit telemetry. Only then enable the
   public entry in navigation and sitemap by setting `COMMUNITY_ENABLED=1`.
