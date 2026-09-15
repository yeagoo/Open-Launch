# Community Phase 23 reply-refresh review

Date: 2026-09-15. Scope: remove redundant Community route invalidation after
reply lifecycle writes and shrink their backend result. No migration, feature
flag, remote target or deployment changed.

## Finding

Creating a reply returns the authoritative reply data that the detail client
merges into its sorted reply list. Editing locally applies the server's trimming
rule and next version; deleting renders the deleted placeholder and decrements
the local reply count. Despite these complete local updates, each Server Action
invalidated the Community feed and detail path.

Reply edits and deletes also returned the parent thread ID solely so their Server
Actions could choose the invalidated detail path. The mutation still needs that
ID internally to lock the correct parent thread, but no caller needs it after a
successful local update.

## Correction

- Reply create, edit and delete actions no longer call `revalidatePath`.
- The detail client retains its authoritative reply merge and local edit/delete
  state updates.
- Backend edit/delete reply methods and their mutation now return `void`; parent
  thread resolution remains inside the transaction for locking and authorization.
- Reply moderation retains its parent-thread result and targeted invalidation,
  since a moderator changes visibility beyond the local author's projection.

## Review result

The Server Action regression test was added before the implementation and failed
because the prior create/edit/delete sequence invalidated Community paths. The
isolated PostgreSQL contract test also failed before the change because deleting
a reply returned its parent thread ID. Both now assert compact successful
results, exact service calls and no path or sitemap invalidation.

The real-browser member flow now creates, edits and deletes one reply against a
production standalone build, then verifies the deleted reply placeholder.

## Validation

- Focused Community action/client suites: 11 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 545 passed, with 31 conditional skips.
- Isolated PostgreSQL Community suite: 22 passed.
- `bun run community:test-browser` passed all 12 Playwright cases against
  isolated loopback PostgreSQL, Redis and a production standalone build.

No staging or production service was used.
