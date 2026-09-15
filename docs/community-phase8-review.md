# Community Phase 8 client transition race review

Date: 2026-09-15. Scope: prevent duplicate Community client actions in the
synchronous interval before React commits a transition's `pending` state. This
is local code hardening only; no remote environment, migration or feature flag
was changed.

## Delivered

- Added `useCommunityActionLock` to the existing Community client utilities.
  It acquires a ref-backed lock at event time and exposes an explicit release
  function for each caller's `finally` block.
- Applied the lock to every live Community write surface: publish, edit, save
  and discard; vote/bookmark, reply, edit/delete reply, report and delete post;
  and moderator actions. The design-preview moderation surface uses the same
  utility.
- Added independent locks for public-feed and thread-reply cursor loading. A
  duplicate click no longer starts duplicate bounded reads while React is still
  scheduling the disabled button state.
- Preserved the reply request key on a failed response. A retry uses the same
  idempotency key, while a successful response clears it as before.

## Review findings and corrections

| Finding                                                                                                                          | Resolution                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `useTransition` exposes `pending` only after React schedules a render; two immediate submit events could both enter a callback.  | Acquire the lock synchronously in the event handler before starting the transition.                                |
| Reusing a reply idempotency key prevented duplicate rows, but each successful client callback still incremented the local count. | Serialize reply submission so exactly one callback can update local replies and `replyCount`.                      |
| Publish, draft, moderation and cursor paths used the same delayed disabled-state pattern.                                        | Audit all live Community clients and apply a shared mutation lock plus separate cursor locks.                      |
| A lock that survives a failed action would make a transient failure unrecoverable.                                               | Release every acquired lock in `finally`; the reply retry test verifies retryability and stable request-key reuse. |
| The preview moderation component also relied only on state for its immediate event guard.                                        | Reuse the shared hook there, keeping preview behavior consistent without changing its isolated data adapter.       |

The lock is a client workload and state-consistency guard. Server-side checks
remain authoritative: authentication and rate limits run in the Community
service, reply creation remains idempotent, report uniqueness remains in the
database, and edit/delete version checks still detect concurrent actors.

## Validation

Focused browser-level tests pass 5 assertions: two immediate reply submits make
one request and one count update; a failed reply unlocks and retries with the
same key; two immediate publish submits, cursor-load clicks and moderator
commands each make one request. The existing preview service contract also
passes its 7 assertions.

The full repository suite passed 534 tests across 121 files, with 27 existing
conditional skips across 3 files. The isolated PostgreSQL Community gate passed
all 18 tests and removed its loopback cluster. Both TypeScript checks, ESLint,
Prettier and the whitespace diff check passed locally.
`NEXT_PUBLIC_URL=http://localhost:44363 bun run build:next` completed and
produced the standalone server artifact.

No staging or production action was performed. The remaining rollout sequence
is unchanged: run the normal backup-verified migration process on an approved
staging target, then use the Phase 5 canary, Phase 6 telemetry and the manual
authenticated staff flow.
