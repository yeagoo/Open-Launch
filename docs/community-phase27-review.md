# Community Phase 27 detail authorization review

Date: 2026-09-15. Scope: align the Community thread-detail UI with existing
server authorization and deletion semantics. No migration, feature flag, remote
target or deployment changed.

## Finding

The server-side post projection deliberately returns a hidden post's retained
body to an eligible moderator, while returning an empty body to its author and
ordinary readers. `CommunityDetailClient` treated every hidden state as an
unavailable placeholder, so a moderator lost the already-authorized context
needed to review a removal.

The same component used one `canEditPost` condition for both Edit and Delete.
Because that condition required an unlocked post, an author could not reach the
Delete control after a moderator locked their thread even though the server
authorizes that deletion and records a tombstone.

## Correction

- The detail client recognizes an eligible moderator's non-empty hidden-post
  projection and renders its body with a visible `Post hidden` review notice.
- Hidden content remains redacted for non-moderators, including a defensively
  supplied hidden-body prop.
- Edit and Delete now have separate authority checks. Locks still close editing
  and replies; authors can delete any of their non-deleted posts.
- The existing real-browser moderation flow now verifies the hidden body is
  available to the moderator after a successful hide action.

## Review result

The new jsdom regressions failed before the correction: an author of a locked
post had no Delete button, and a moderator's hidden-body projection was replaced
by the generic unavailable state. They pass after the UI separates the two
capabilities. The isolated PostgreSQL suite also verifies that the author is
redacted while the moderator receives the retained hidden body.

## Validation

- Focused detail-client suite: 7 passed.
- Isolated PostgreSQL Community suite: 23 passed.
- TypeScript, strict-index and ESLint checks passed; Prettier checks passed.
- Full repository suite: 551 passed, with 32 conditional skips.
- `bun run community:test-browser` passed all 12 Playwright cases against an
  isolated loopback PostgreSQL/Redis fixture and production standalone build.

No staging or production service was used.
