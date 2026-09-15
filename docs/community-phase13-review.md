# Community Phase 13 canonical-namespace review

Date: 2026-09-15. Scope: close the remaining known-invalid Community thread
URL shapes before streamed rendering. No migration, feature flag, remote target
or deployment changed.

## Delivered

- Defined the current canonical thread namespace as exactly the detail route
  `/community/t/[uuid]` and its editor `/community/t/[uuid]/edit`.
- Made the Proxy return the existing English not-found UI with a real HTTP 404
  for every unsupported descendant, while preserving the visitor's original
  URL, request ID and trusted Community document marker.
- Kept valid detail and editor UUID paths on the normal permission-aware page
  service path. The fix does not add a database lookup to the Proxy.
- Added direct Proxy and isolated production-browser regression coverage for
  valid UUID paths with unsupported trailing segments.

## Review findings and correction

1. Phase 12 rejected malformed identifiers and the bare thread namespace, but
   its matcher returned `NextResponse.next()` for a URL such as
   `/community/t/<valid-uuid>/history`. No Community page owns that shape, so
   the root layout could begin streaming before the framework's not-found
   result, producing HTTP 200 for an impossible route.
2. The matcher now treats `/community/t/` as a finite namespace. It allows only
   the two implemented route shapes and returns the pre-render 404 rewrite for
   all other descendants. This is deliberately documented beside the matcher:
   a future canonical child route must be added explicitly rather than becoming
   silently reachable under an ambiguous catch-all rule.
3. The existing rewrite continues to forward the Proxy-only Community marker
   and request ID. A visitor with a localized site preference therefore still
   receives `html[lang="en"]` for the English forum's not-found document.

## Validation

- The focused Community Proxy suite passed: 15 tests, including the previously
  failing valid-UUID descendant case.
- `bun run test` passed: 541 tests, with 27 existing conditional skips.
- `bunx tsc --noEmit`, `bun run typecheck:strict-indexes`, and `bun run lint`
  passed.
- `bun run community:test-browser` passed all 12 Playwright tests against a
  fresh PostgreSQL/Redis loopback fixture, the complete 65-migration history
  and a production standalone build. It verifies real HTTP 404 responses,
  visible not-found content, original URL preservation and English document
  language for malformed and unsupported canonical thread paths.
- The temporary browser-gate containers were removed after the run.

No staging or production service was used.
