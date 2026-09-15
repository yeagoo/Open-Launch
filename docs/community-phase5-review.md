# Community Phase 5 canary delivery and review

Date: 2026-09-14. Scope: add a repeatable, read-only rollout gate for the
English-only community before any staging or production enablement. This work
does not contact a non-loopback environment, migrate a shared database, or
change `COMMUNITY_ENABLED` outside temporary local processes.

## Delivered

- `bun run community:canary -- --base-url <origin> --mode disabled` verifies
  the default-off contract: no Community navigation, a real `/community` 404,
  and the locale bridge's canonical redirect and locale cookie.
- `--mode enabled` verifies the filtered public feed, English document language,
  Community navigation, canonical route, locale bridge and stale Client Router
  redirect. The stale RSC-shaped request must not emit `NEXT_LOCALE`.
- The enabled check measures one initial feed response and 1–10 later warm
  responses. Optional `--max-initial-ttfb-ms` and `--max-warm-ttfb-ms` limits
  make the same check fail when an explicit staging budget is exceeded.
- The command accepts only an origin-only HTTP(S) URL, has a 15-second request
  deadline and a 1 MB response-body limit. It opens no direct database
  connection and sends no session credential or mutation request.

## Review findings fixed

| Finding                                                                                                        | Resolution                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| An operator could accidentally point a read-only checker at a credential-bearing URL or a non-origin endpoint. | Reject credentials, paths, query strings and hashes; reject redirect targets outside the selected origin.    |
| A canary result could leak raw `Set-Cookie` values into CI or terminal logs.                                   | Report only whether `NEXT_LOCALE` was emitted; keep raw headers internal to the assertion.                   |
| Calling the first response a cold measurement is inaccurate unless the target is controlled.                   | Report it as an initial sample and document the restart/cache-clear requirement for a true cold measurement. |
| A timing limit supplied to disabled mode would appear configured but could never be evaluated.                 | Reject TTFB limit arguments unless the enabled-mode feed is measured.                                        |
| A large or stalled HTML response could make a release check consume unbounded resources.                       | Bound reads to 1 MB and abort each request after 15 seconds.                                                 |

## Validation

The pure argument, redirect, cookie and timing-budget contract has 13 focused
Vitest assertions. The command was run against one fresh loopback PostgreSQL and
Redis pair after the normal migration command, then against the real standalone
server with `COMMUNITY_ENABLED=0` and `COMMUNITY_ENABLED=1` in separate local
processes. It passed both modes. The local enabled observation was recorded only
as a machine-local reference: 141 ms initial TTFB and 11.5 ms warm median TTFB
in the final two-sample run. These are not staging or production budgets.

Final repository verification passed: 510 Vitest tests across 117 files (with
27 existing conditional skips), both TypeScript checks, ESLint, Prettier and the
diff check. The production build also passed with the loopback canary origin
supplied as `NEXT_PUBLIC_URL`.

## Remaining rollout work

Run the ordinary migration process against a backup-verified staging target.
First execute the disabled canary, then enable the flag only for staff and run
the enabled canary with staging-derived TTFB budgets. A staff member must still
manually test verified writes, moderation and the flag-off rollback before public
enablement. No production action was performed in this phase.
