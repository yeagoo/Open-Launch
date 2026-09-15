# Community Phase 29 locked-reply controls review

Date: 2026-09-15. Scope: align reply controls on a locked Community thread
with existing server authorization. No migration, feature flag, remote target
or deployment changed.

## Finding

The service treats a locked thread as closed for new replies and reply edits.
It deliberately still permits an authenticated reply author to delete their
reply, preserving the tombstone and discussion structure. The detail UI closed
only the root composer: each existing reply still displayed `Reply` and `Edit`,
so users could open an editor or nested composer that the Server Action would
reject.

## Correction

- Derived one `repliesOpen` condition from the authoritative public and locked
  thread state, and passed it to every root and nested reply item.
- Hide Reply and Edit whenever that condition is false, including a defensive
  fallback that renders the reply body instead of a stale edit form.
- Preserve Delete for the reply author and Report for other participating
  members, matching their separate server authorization paths.
- Added a UI regression for a locked thread and extended the isolated database
  contract to verify that creation and editing fail while author deletion still
  succeeds.

## Review result

The new jsdom test failed before the correction because a locked thread still
rendered a `Reply` button. After the change it has no Reply or Edit control,
retains Delete for the reply author, and shows the existing closed-replies
notice. The PostgreSQL suite verifies the corresponding write policy.

## Validation

- Focused Community UI and Server Action suites: 25 passed.
- TypeScript, strict-index checking, ESLint and Prettier checks passed.
- Isolated PostgreSQL Community suite: 23 passed.
- Full repository suite: 555 passed, with 32 conditional skips.
- `bun run community:test-browser` passed all 12 Playwright cases against an
  isolated loopback PostgreSQL/Redis fixture and production standalone build.

No staging or production service was used.
