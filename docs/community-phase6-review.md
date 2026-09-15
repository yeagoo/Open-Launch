# Community Phase 6 telemetry delivery and review

Date: 2026-09-15. Scope: make a future authenticated Community staff canary
observable without changing a public feature flag, contacting staging or
production, or adding forum content to telemetry metadata.

## Delivered

- The Community Proxy forwards its generated `x-aat-request-id` to the
  renderer through Next's request-header override mechanism while returning the
  same ID in the response. This gives a staff canary one correlation value for
  browser evidence and server logs.
- The central Community service boundary measures every operation that reaches
  it. A completed, rejected or failed operation that takes at least one second emits
  `community_operation_slow`.
- Unexpected service failures retain the existing typed retryable response and
  now log `community_service_error` with its duration and correlation ID.
- Fixed event context carries only operation name, read/write mode, moderator
  requirement, outcome and duration. It excludes actor, thread, reply, product,
  search and body fields. The existing structured logger redacts the error
  value.

## Review findings fixed

| Finding                                                                                                                           | Resolution                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Proxy wrote an ID only to the outgoing response, so server-rendered Community work could not correlate its logs with the request. | Forward the generated ID through `NextResponse.next({ request: { headers } })`, the documented Proxy-to-renderer channel. |
| The service reported only unexpected errors; slow but successful or rejected database work had no operational signal.             | Measure the single `execute` boundary and warn only at a one-second threshold.                                            |
| A telemetry callback exception could supersede the intended typed Community response.                                             | Treat both error and slow observers as best-effort and swallow observer failures.                                         |
| Timing could be inflated by the observer itself.                                                                                  | Capture the duration before invoking either observer; it covers auth, limiting and transaction work only.                 |
| Log context could grow into a second copy of user content or identifiers.                                                         | Define a fixed telemetry shape and test its exact keys.                                                                   |

## Validation

Completed locally:

```sh
bunx vitest run lib/community/service-core.test.ts \
  tests/community-server-gate.test.ts tests/community-preview-routing.test.ts
bun run community:test-db
bun run test
bunx tsc --noEmit
bun run typecheck:strict-indexes
bun run lint
bunx prettier --check lib/community/server-types.ts lib/community/service-core.ts \
  lib/community/server.ts lib/community/service-core.test.ts proxy.ts \
  tests/community-preview-routing.test.ts tests/community-server-gate.test.ts \
  tests/community-database.integration.test.ts
git diff --check
NEXT_PUBLIC_URL=http://localhost:44363 bun run build:next
```

The focused suites verify generated request-ID forwarding, logger field shape and
per-request ID memoization. The service unit suite verifies the no-content
telemetry shape, successful behavior when a slow observer fails, and preservation
of the retryable error mapping when an error observer fails. They passed 18
assertions. The isolated PostgreSQL gate passed all 18 integration tests after
creating and then removing its loopback cluster.

The full repository suite passed 514 tests across 118 files, with 27 existing
conditional skips. Both TypeScript checks, ESLint, Prettier, the diff check and
the Next production build passed. No staging/prod action is part of this phase.

## Remaining rollout work

Run the backup-verified migration process on staging, inspect the Community
operation events alongside the Phase 5 route-TTFB canary, and then perform the
manual authenticated staff flow for verified write, moderation and flag-off
rollback. Establish alert thresholds from staging observations before a public
enablement. No deployment, migration or flag change was performed here.
