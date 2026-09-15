# Community Phase 10 reproducible local browser gate

Date: 2026-09-15. Scope: make the reviewed Phase 9 standalone Community browser
exercise repeatable without using a developer, staging or production data
service. No Community behavior, migration, feature flag or remote target was
changed.

## Delivered

- Added `bun run community:test-browser`, backed by
  `scripts/test-community-browser-gate.sh`.
- The command checks the repository's Node runtime, then starts the exact
  PostgreSQL 16 and Redis 7.4 image digests used by the CI release gate. Both
  services bind to randomly assigned `127.0.0.1` ports.
- It creates a fresh `open_launch_e2e_*` database, applies Drizzle and all
  hand-written migrations, builds with a matching randomized
  `NEXT_PUBLIC_URL`, prepares the standalone artifact, and runs the focused
  Community Playwright spec with `CI=1`.
- It owns no external connection string or target argument. A shell exit trap
  removes its named PostgreSQL and Redis containers on success and failure.

## Review findings and corrections

| Finding                                                                                                                                                                                   | Resolution                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Phase 9 local proof required several manual commands, making it easy to reuse a developer database or build with an origin that differed from the standalone server.                  | Encapsulate the whole lifecycle in one command with generated loopback ports and a freshly created E2E database.                                                 |
| `localhost` resolves to `::1` first on this host, while Docker intentionally exposes the temporary services only on IPv4 loopback. The first real run therefore failed before migrations. | Use `127.0.0.1` for PostgreSQL and Redis, matching the CI service URLs; retain `localhost` only for the standalone HTTP origin required by the routing contract. |
| A failed migration, build or browser test could otherwise leave test containers running.                                                                                                  | Register cleanup immediately after container names are created and remove both containers through the same Docker command selected at startup.                   |
| A standalone build embeds public values, so selecting a random runtime port after building can test a different origin than the app was compiled for.                                     | Allocate the HTTP loopback port before the build and pass the same URL to both the build and Playwright.                                                         |
| A user's default Node executable can be below the supported standalone runtime.                                                                                                           | Validate with the repository's existing `check-node-runtime.mjs`, then put that exact executable first on `PATH` for both build and Playwright's web server.     |

## Validation

- `bash -n scripts/test-community-browser-gate.sh`
- `shellcheck scripts/test-community-browser-gate.sh`
- `bun run community:test-browser`

The real command applied all 65 hand-written migrations to fresh temporary
PostgreSQL storage, built and prepared the standalone app, and passed all 10
Community Playwright tests in 8.7 seconds. The temporary PostgreSQL and Redis
containers were absent after completion. No staging or production connection,
migration, feature enablement or deployment was performed.
