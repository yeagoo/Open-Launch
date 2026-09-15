# Community Phase 21 navigation-write response review

Date: 2026-09-15. Scope: remove unused full-post hydration from production
Community publish and edit Server Actions. No migration, feature flag, remote
target or deployment changed.

## Finding

The production composer navigates to `/community/t/[id]` after a successful
publish, where it needs only the created thread ID. Its edit branch already knows
the thread ID and redirects to a newly rendered thread page after saving. Neither
branch consumes the full `CommunityPost` response.

The shared backend `publish` and `edit` methods nevertheless loaded the complete
post projection and first reply page after every write. That projection includes
the author, optional product context and current viewer's vote/bookmark state.
The design preview uses those generic methods to update its in-place fixture, so
shrinking their contract globally would break a valid caller.

## Correction

- Added backend-only `publishForNavigation`, which returns the created thread ID,
  and `editForNavigation`, which returns `void`.
- Both methods reuse the existing input validation, actor/participant checks,
  rate limit, transaction, idempotency, row locks and mutation functions.
- Production Server Actions use the compact methods. Publishing and editing keep
  their targeted Community and sitemap invalidation because the redirected page
  must read current content and metadata.
- The composer now constructs its post route directly from the compact publish
  ID. The generic `CommunityService` contract remains unchanged for the preview.

## Review result

The Server Action regression test was added before the implementation and failed
against the prior full-result action. It now verifies the compact successful
responses, exact backend method calls, absence of generic-method calls, and the
existing content invalidation.

The isolated PostgreSQL trace publishes and edits a product-linked post through
the navigation methods. Each operation performs its required actor lookup and
product validation only once, and the trace rejects reply, vote, bookmark,
author-display and post-product projection queries. The client regression test
also confirms that the compact ID becomes the canonical replacement route after
two synchronous submit attempts produce one publish request.

## Validation

- Focused Community action/client suites: 10 passed.
- Isolated PostgreSQL Community suite: 22 passed.
- `bunx tsc --noEmit`, strict-index checking, ESLint and Prettier checks passed.
- Full test suite: 543 passed, 31 conditional skips.
- `bun run community:test-browser` passed against isolated loopback PostgreSQL,
  Redis and a production standalone build; its cleanup left no named test
  containers.

No staging or production service was used.
