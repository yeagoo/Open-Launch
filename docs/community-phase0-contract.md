# Community Phase 0 contract

Status: frontend prototype contract, 2026-09-14. Production APIs and storage are
not implemented by this document. The reviewed visual direction is aat.ee's white,
orange and green system with sans-serif fonts and English UI/content guidance.

## Information architecture

| Surface           | Standalone prototype               | Planned production address                  |
| ----------------- | ---------------------------------- | ------------------------------------------- |
| Public feed       | `#`                                | `/community`                                |
| Filtered feed     | `#?type=shipped&sort=hot&q=export` | `/community?type=shipped&sort=hot&q=export` |
| Saved posts       | `#?view=saved`                     | `/community?view=saved`                     |
| My posts          | `#?view=mine`                      | `/community?view=mine`                      |
| Expanded composer | `#new`                             | `/community/new`                            |
| Post detail       | `#thread/{id}`                     | `/community/t/{id}`                         |

Type values are shipped, learning, question, milestone and todo. Feed sorting
is latest or hot. Search is limited to 200 characters. Invalid filters fall back
to the default; unknown pages and missing posts show a recovery link. Demo filters
use hashes so the artifact also opens directly from disk without an application
server. Browser history restores type, sort and search. Search edits replace the
current history entry instead of creating an entry per keystroke.

The Community header opens the unfiltered feed. A detail/composer Back to feed
link retains the last feed context in that session. Directly opening a detail URL
uses the default feed as its return destination. Product names are searchable.
Saved and My posts keep the search term, with an explicit clear-search empty state.

## Frontend data semantics

| Item          | Phase 0 representation                                            | Phase 1/2 requirement                                                   |
| ------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Post identity | Unique incrementing session ID or stable fixture ID               | Server-assigned stable UUID                                             |
| Author        | Fictional fixture or clearly labeled demo member                  | Existing user identity; verified maker label only after ownership check |
| Type          | One of five fixed posting intents                                 | Shared validated union and server constraint                            |
| Title         | Optional text, maximum 160 UTF-16 code units                      | Nullable stored title; derive metadata for untitled posts               |
| Body          | Required plain text, 20–10,000 UTF-16 code units; trimmed minimum | Markdown with the same text bounds, no arbitrary HTML                   |
| Product       | Optional known fixture key                                        | Publicly visible existing project, server-validated                     |
| Replies       | Array of visible local replies; count derived from array          | Bounded reads and permission-aware visible counts                       |
| Vote/bookmark | One local boolean per post                                        | Explicit desired-state writes with authorization                        |
| Post draft    | One shared in-memory draft for both composers                     | Private draft lifecycle and explicit save/failure states                |
| Reply draft   | In-memory text per post                                           | Preserve unsent reply input during in-app navigation                    |

Input is escaped at every HTML display boundary. No automatic linking, URL fetching,
HTML rendering, real upload, authentication, notification or persistence is present.
Production sanitization and authorization are separate acceptance requirements.
All fixture cards are fictional, including product names. Product context is visually
reviewable but does not navigate to invented product pages.

Hot sorts the small recent fixture set by votes, preserving fixture order on ties.
Votes update in place to preserve keyboard focus; ordering refreshes when reopening
the view. Production needs the separately planned seven-day ranking window and
stable pagination snapshot. No performance claim about production follows from this.

## Required interactions and states

- All five types, Latest/Hot, combined type/search and personal views.
- Short post without a title, longer titled post and full-text detail entry.
- Inline and expanded composer with shared state and type-specific guidance.
- Field-associated validation, optional product, saved draft notice and local submit.
- Product context preserved in feed/detail; no misleading ownership claims.
- Replies with whitespace/size validation, retained draft and accurate visible count.
- Vote toggle preserving keyboard focus; bookmark removal updates Saved immediately.
- Distinct empty personal views, empty search with clear action, missing post/page.
- Keyboard skip link, visible focus, route heading focus and polite result counts.
- Responsive sidebar scrolling, visible mobile publishing button, no page overflow
  at 320px and 390px. All headings and body text use sans-serif fallbacks offline.
- Reload explicitly clears drafts, user posts, votes, saves and replies. Fixture
  deep links remain usable; cleared local post URLs show a missing-post state.

## Phase boundary

Phase 0 ends with this contract, reviewed standalone code, reusable browser
verification and desktop/mobile screenshots. It does not complete Phase 1.
Loading/error/retry and pagination of server-backed data, authentication states,
editing, moderation interfaces and Next.js component integration belong to Phase 1;
real services, permissions, persistence and ranking belong to Phase 2 onward.

## Reproduce acceptance

From the repository root, with installed project dependencies and Playwright Chromium:

```sh
node scripts/verify-community-demo.mjs
```

The runner starts its own loopback static server on an OS-assigned free port,
blocks external requests to verify font fallback, and stops the server/browser on
completion. It does not read production credentials or start Next.js. Screenshots
are written to ignored `artifacts/community-demo/phase0/`.

For interactive viewing, keep the current preview at `http://localhost:40893`, or run:

```sh
python3 -m http.server 0 --bind 0.0.0.0 --directory docs/demos/community
```

Use the assigned port printed by Python. Only the demo directory is served.
