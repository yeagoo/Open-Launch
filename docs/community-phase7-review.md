# Community Phase 7 telemetry export review

Date: 2026-09-15. Scope: make the privacy-safe Community telemetry from Phase 6
reviewable after a staging observation without guessing a deployment provider's
log API, contacting an environment, or changing the Community feature flag.

## Delivered

- `bun run community:telemetry -- --input <structured-log.ndjson>` reads one
  operator-supplied, local file of the default newline-delimited JSON output
  from the existing structured logger. It opens no network or database
  connection and does not accept a target URL or credentials. Legacy
  `STRUCTURED_LOG_FORMAT=text` output is deliberately unsupported; export the
  default JSON lines for this gate.
- The parser accepts the exact fixed shape of `community_operation_slow` and
  `community_service_error`: expected level, route, provider, outcome, duration
  and four allowed context fields. It rejects a malformed matching record, so
  a privacy or contract drift cannot be silently summarized.
- The JSON report includes aggregate slow/error counts, missing-correlation
  count, first/last matching event time, slow-event min/median/p95/max duration
  and fixed internal operation counts. It never includes source rows, request
  IDs or error values.
- Optional aggregate limits make the command exit nonzero:

  ```sh
  bun run community:telemetry -- --input ./community-staging.ndjson \
    --max-slow-events 3 --max-error-events 0 \
    --max-missing-request-id-events 0 --max-p95-slow-duration-ms 1800
  ```

  The limits have no defaults. Establish them for one documented staging time
  window, then pass the agreed values explicitly on later reviews. The reported
  p95 uses the nearest-rank value from the slow events only; it is not a full
  operation-latency percentile.

## Review findings fixed

| Finding                                                                                                                                                                      | Resolution                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A platform-specific log query would be invented because the repository exposes no log sink or query API.                                                                     | Consume only an explicitly supplied local export of the project's existing JSON log format.                                                                           |
| Printing a parse failure or sample row could expose error text, identifiers or Community content in CI output.                                                               | Errors identify only a line number and contract field; the report exposes aggregates and safe internal operation names.                                               |
| A failed operation over the slow threshold emits both a failure and a slow event, so a combined count would overstate affected operations.                                   | Report the event types separately and document that their counts are not unique-operation counts.                                                                     |
| A default alert threshold would be arbitrary before staging observation.                                                                                                     | Keep every limit optional and report observation data by default.                                                                                                     |
| An unexpectedly large, non-file or malformed export could make an offline reviewer unreliable.                                                                               | Require a readable regular UTF-8 file, cap it at 16 MiB and 100,000 non-empty records, and reject invalid JSON or matching event contracts.                           |
| A clean telemetry report could be mistaken for proof that a normal write worked.                                                                                             | Document that telemetry intentionally records only slow/error signals; retain the Phase 5 HTTP and manual authenticated canaries.                                     |
| The realistic database query-plan fixture inserted 100,000 indexed threads in one statement, which exceeded its intentional 10-second statement cap during final validation. | Preserve the 100,000-row worst-case fixture but write it in 10,000-row integer-typed batches, so fixture construction cannot be mistaken for a query-plan regression. |

## Validation

The focused parser and budget contract passed 15 assertions covering valid
aggregate output, unrelated-record filtering, fixed-context rejection without
echoing a private value, fixed source fields, slow-threshold validation, input
bounds, optional limits and invalid command arguments. The full repository
suite passed 529 tests across 119 files, with 27 existing conditional skips.

The isolated PostgreSQL Community gate passed all 18 tests after creating and
removing its loopback cluster. Both TypeScript checks, ESLint, Prettier and the
diff check passed. `NEXT_PUBLIC_URL=http://localhost:44363 bun run build:next`
completed locally and produced the standalone Next build artifact. No staging or
production action was part of validation.

## Remaining rollout work

Run the ordinary backup-verified migration process on a user-approved staging
target. Capture a bounded observation window in the default JSON structured-log
format, review it with this command, establish thresholds from that observation,
then run the Phase 5 read-only canary and manual authenticated staff flow. No
staging or production action was performed for this phase.
