# Community Phase 28 client projection refresh review

Date: 2026-09-15. Scope: keep Community clients aligned with a fresh server
projection when related data changes outside a thread revision. No migration,
feature flag, remote target or deployment changed.

## Finding

The feed and detail clients initialize interactive state with `useState`. Their
previous React keys covered selected thread fields such as version, reaction
counts and lifecycle, but omitted independently queried author and product data.
For example, a user can rename their account or a linked product can leave the
public directory without changing `community_thread.version`; the server then
returns a fresh projection while the client keeps rendering the old local post.

The moderation client had the same state-initialization issue for its server
report queue: an incoming list with newly resolved or newly created reports did
not replace its existing local list.

## Correction

- Added a shared projection-key helper that serializes the complete
  server-to-client projection. The Community contracts are serializable and
  bounded, so this makes every rendered authoritative field part of the reset
  boundary without an incomplete hand-maintained field list or a collision-prone
  hash.
- The feed key includes its query and complete initial feed/viewer state; the
  detail key includes its complete post/reply/viewer state; the moderation key
  includes the complete report queue.
- The composer is intentionally not reset from a new projection because its
  state is an unsaved member draft. Its explicit save and discard flows retain
  their existing refresh behavior.

## Review result

Three regressions were written before the correction and failed against the
old implementation. They rerender the same route component with an unchanged
thread revision but changed post or reply author/product data for feed and
detail, then rerender a changed moderation queue. Each retained the old local
state before the change and now renders the new server projection.

The PostgreSQL suite already proves the independent product case: switching a
linked project from `launched` to `scheduled` removes its context from the
thread projection without editing that thread. The new UI coverage closes the
client-side half of that behavior.

## Validation

- Focused client suites: 14 passed.
- TypeScript, strict-index checking, ESLint and Prettier checks passed.
- Isolated PostgreSQL Community suite: 23 passed.
- Full repository suite: 554 passed, with 32 conditional skips.
- `bun run community:test-browser` passed all 12 Playwright cases against an
  isolated loopback PostgreSQL/Redis fixture and production standalone build.

No staging or production service was used.
