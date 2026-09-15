# Community Phase 0 review and acceptance

Date: 2026-09-14. Result: Phase 0 complete within the standalone prototype scope.
Review covered the plan, HTML/CSS/JavaScript prototype, local logo asset, frontend
contract and reusable verification script. It does not certify production APIs,
authentication, database behavior or moderation, which are not implemented here.

## Plan corrections

- Separate completed Phase 0 prototype work from Phase 1 Next.js components and
  state screens. Loading, retry, pagination, editing and moderation remain Phase 1.
- Add the missing Saved production route and document the prototype hash routes.
- Define optional title/body limits, product association, local draft lifetime,
  missing-post recovery and the difference between fixture Hot and production ranking.
- Specify that the prototype renders escaped plain text; production Markdown and
  sanitization are separate requirements. Fonts are optional external resources.
- Replace temporary verification as the acceptance mechanism with a repository
  script that owns a random-port static server and cleans up after completion.

## Implementation findings and fixes

| Finding                                                                | Impact within prototype                                          | Resolution                                                                                                                      |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Filters/search lived only in variables                                 | Links and browser history did not restore the view               | Validated hash parameters; search replaces current history entry; detail return link preserves feed context                     |
| Replies lost unsent text on navigation                                 | Draft work disappeared while exploring the prototype             | Per-post session reply drafts, cleared after successful submit                                                                  |
| `crypto.randomUUID()` required a secure context                        | Posting could fail when previewed over ordinary LAN HTTP         | Session-local sequential IDs, with no secure-context dependency                                                                 |
| Replacing vote button markup removed focus                             | Keyboard users lost their place                                  | Update the existing button in place; keep Hot ordering stable until reopening                                                   |
| Validation depended partly on native constraints and temporary notices | Missing persistent field feedback and explicit bounds            | Inline associated errors, trimmed body checks, upper bounds, type/product allowlists, duplicate-submit guard and focus recovery |
| Empty search and empty personal views shared generic wording           | No clear recovery path                                           | Distinct empty states and clear-search action                                                                                   |
| Unknown hash silently showed feed                                      | Invalid navigation appeared successful                           | Explicit missing-page and missing-post recovery                                                                                 |
| Browser tests existed only in ignored artifacts                        | Another developer could not reproduce acceptance from the change | `scripts/verify-community-demo.mjs` starts an isolated server and exercises the prototype                                       |

## Verification evidence

Executed successfully:

```sh
node scripts/verify-community-demo.mjs
node_modules/.bin/eslint scripts/verify-community-demo.mjs
node_modules/.bin/prettier --check docs/demos/community/index.html docs/community-development-plan.md docs/community-phase0-contract.md docs/community-phase0-review.md scripts/verify-community-demo.mjs
```

Browser verification covers:

- All five posting types; combined product search and filtering; Latest/Hot navigation.
- URL filter restoration after reload and browser back navigation from post details.
- Post draft retention between inline/expanded composer and filtered views.
- Reply draft retention, whitespace rejection and visible reply-count updates.
- Untitled publishing, optional product context, long-post detail entry and HTML escaping.
- Whitespace-only body, excessive body/title bounds and accessible field errors.
- Publishing when `randomUUID` is unavailable; direct-file search and publishing.
- Vote toggle with keyboard focus, bookmark removal, My posts and distinct empty states.
- Invalid filters, unknown routes, missing posts and session reset behavior.
- Keyboard skip link, English document language and sans-serif fallback without external fonts.
- 320px/390px page overflow checks and visible mobile publishing entry.
- No browser JavaScript errors or unexpected dialogs during these scenarios.

Desktop and mobile screenshots were generated and visually reviewed under
`artifacts/community-demo/phase0/`. These are ignored local evidence; rerun the
script to regenerate them. The browser run intentionally blocks external fonts
so these captures also demonstrate the supported system sans-serif fallback.
The existing interactive preview at `http://localhost:40893` returned HTTP 200.

## Remaining work

No blocking issue was identified for this Phase 0 delivery after corrections.
The test suite is a bounded prototype acceptance check, not an exhaustive
accessibility audit or production security review. Existing production pages and
routing were not modified. All displayed community content remains fictional and
all user interactions reset on reload.

Next: Phase 1 implements the reviewed contract in the Next.js frontend preview
workflow and completes loading/error/auth/edit/moderation states before backend
integration. Production remains planned at `https://www.aat.ee/community`.
