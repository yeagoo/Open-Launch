# Community Phase 14 moderation-idempotency review

Date: 2026-09-15. Scope: make Community moderation state commands safe to retry.
No migration, feature flag, remote target or deployment changed.

## Delivered

- Thread hide, restore, lock, unlock, pin and unpin now update a record only
  when the requested state differs from its current effective state.
- Reply hide and restore now use the same rule.
- A no-op retry leaves `version` and `updatedAt` unchanged and does not append
  another `community_moderation_event` row.
- Active pins are not extended by a duplicate pin command; once a pin expires,
  a new pin command can establish a new seven-day period.
- Added isolated PostgreSQL coverage for duplicate commands issued both before
  and concurrently with their matching state transition.

## Review findings and correction

1. The client prevents immediate duplicate clicks, but a completed Server
   Action can lose its response and be retried later or concurrently. The
   moderation service previously updated every command unconditionally. In the
   reproducing integration test, three already-satisfied commands plus two
   copies of six thread actions advanced a newly published post from version 1
   to version 16 and appended duplicate audit rows.
2. The existing `FOR UPDATE` row locks already serialize moderation with
   competing writes. The service now evaluates the requested state after
   acquiring that lock and returns without an update or audit insertion if the
   state is already reached. Concurrent duplicates therefore converge to one
   transition.
3. The behavior deliberately applies to effective pin state: an active pin is
   preserved on retry, while an expired pin can be renewed. This prevents a
   lost response from silently extending a seven-day pin.

## Validation

- The new isolated PostgreSQL test passed all 19 Community integration tests.
  It checks every thread action, both reply actions, versions, audit counts and
  concurrent duplicate commands against a freshly migrated loopback database.
- `bun run test` passed: 541 tests, with 28 existing conditional skips.
- `bunx tsc --noEmit`, `bun run typecheck:strict-indexes`, `bun run lint`,
  Prettier and whitespace checks passed.
- `bun run community:test-browser` passed all 12 Playwright tests against a
  fresh PostgreSQL/Redis fixture, the complete 65-migration history and a
  production standalone build. The existing moderator hide-and-resolve flow
  remains functional.
- Temporary test containers were removed after both isolated runners.

No staging or production service was used.
