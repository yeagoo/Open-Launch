# Community Phase 1 delivery and review

Date: 2026-09-14. Scope: the Next.js frontend preview framework, shared components,
typed service contract, isolated fixture adapter and screen-state verification.
This phase does not implement production persistence, authentication, email,
notifications or moderation services. Production `/community` remains unopened.

## Delivered structure

| Location                                    | Responsibility                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `components/community/community-ui.tsx`     | Shell, type navigation, post cards, product context, actions and common state displays                         |
| `components/community/post-composer.tsx`    | Shared post/edit composer and reply composer, bounds and field feedback                                        |
| `components/community/moderation-panel.tsx` | Lazy-loaded report review and moderation controls                                                              |
| `components/community/community.css`        | Scoped aat.ee orange/green styling; site font variables and sans-serif fallbacks                               |
| `lib/community/contracts.ts`                | UI data types, validation, participation messages and async service contract; no database or fixtures          |
| `app/design-preview/community/`             | Gated Next.js route, preview coordinator, fictional fixtures, instance-scoped demo service and hydration entry |
| `scripts/render-community-preview.tsx`      | SSR and browser build of the same React components, actual Tailwind compilation, local logo and bundle check   |
| `scripts/verify-community-preview.mjs`      | Isolated random-port browser acceptance, including external-font failure                                       |

The existing Button, Input, Textarea and Radix-based Dialog components are reused.
Moderation loads in a separate chunk. The preview owns its state in each mounted
instance; no module-global mutable store is shared between SSR requests.
The fixture service uses desired-state votes/bookmarks, idempotent publish/reply
requests, edit versions and bounded snapshot pagination. These exercise the
frontend contract; they are not substitutes for server-side enforcement in Phase 2.

## Screens and states

| Surface           | Implemented preview behavior                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feed              | Five post types, search, Latest/Hot, three-row fixture pages, next page, skeleton, empty/no-results, initial failure and retry; next-page failures retain visible posts               |
| Detail            | Public, own pending review, unavailable pending, hidden, deleted, locked and missing states; product context and replies                                                              |
| Participation     | Anonymous, unverified, member, banned and moderator simulation; reading remains public while writes show the applicable restriction                                                   |
| Compose/edit      | Optional title, product association, validation, pending submission, failure with retained text, saved draft, discard confirmation, retained edit draft and version-conflict recovery |
| Replies/reactions | Reply draft retention, retryable failure, optimistic vote/save updates with rollback and duplicate-write protection                                                                   |
| Personal views    | My posts, saved posts, saved draft reopening, empty states and removed-post placeholders                                                                                              |
| Moderation        | Report reason, content snapshot, pending/resolved reports, hide/restore, lock/unlock, pin/unpin, failure/retry and non-moderator restriction                                          |
| Accessibility     | English section/document in the standalone export, keyboard skip link, route heading focus, field labels, modal focus return and narrow-screen navigation                             |

Hash navigation is intentionally local to the preview. The production path contract
remains `/community`, `/community/t/[id]` and related non-localized routes from the
plan. The preview uses `#post/{id}` and `#edit/{id}`, without publishing those paths.
In the integrated Next.js preview, the surrounding root layout retains the site's
normal navigation and locale providers; the community section declares English.
The production document-language and canonical routing integration remains a
Phase 3 requirement and is not claimed complete by this preview.

## Review findings and corrections

1. **Preview locale routing:** the existing proxy rewrote the internal preview
   through next-intl. Add `/design-preview` to its non-localized path boundary;
   verify a Chinese session bypasses rewriting and lookalike paths do not.
2. **Late async reads:** a slow response could replace a newer view. Resource keys
   and cancellation guards prevent stale reads and hide previous-role content
   while the newly selected role's view is loading.
3. **Late reaction writes:** a saved-view mutation could filter a different view
   after navigation. Apply its local projection only within the same request
   generation; otherwise refresh the current view. Failed writes restore counts.
4. **Edit conflicts:** retain the version associated with the edit draft. A conflict
   preserves input and provides an explicit discard-and-reload recovery action.
5. **Publish ordering:** fixed fixture dates could put a newly published post behind
   fixtures on a machine with an earlier clock. New local posts use a timestamp
   later than both the current clock and the existing fixture maximum.
6. **Modal focus:** external dialog open buttons were not Radix DialogTrigger nodes.
   Capture and restore the initiating element on close, with a heading fallback.
7. **Accessible labels:** controlled textarea content affected exact label lookup
   after retry. Use stable accessible names and field-associated error messages.
8. **320px fallback-font overflow:** shorten the header publishing label to preserve
   the approved layout when external fonts cannot load.
9. **Pagination failure:** retain the previously loaded cards and show a dedicated
   retry-more action, rather than replacing the whole feed with an error.
10. **Removed personal posts:** retain redacted deleted/hidden cards in My posts;
    public feeds exclude them. Empty saved drafts are treated as absent.

11. **Initial keyboard focus:** heading focus initially ran on hydration and could
    bypass the skip link. Request heading focus only after in-app navigation;
    keyboard acceptance verifies the skip link on a fresh page.

## Validation

Commands used:

```sh
bun run community:preview
bun run community:verify
node_modules/.bin/vitest run tests/community-demo.test.ts tests/community-preview-gate.test.ts tests/community-preview-routing.test.ts
node_modules/.bin/eslint components/community app/design-preview/community lib/community scripts/render-community-preview.tsx scripts/verify-community-preview.mjs tests/community-demo.test.ts tests/community-preview-gate.test.ts tests/community-preview-routing.test.ts proxy.ts
node_modules/.bin/tsc --noEmit --incremental false
bun run build:next
```

- Eleven service, production-gate and proxy-routing tests pass.
- Browser acceptance covers hydration, combined search/filtering, page failures,
  role restrictions, vote rollback, publish retry, modal focus, editing/conflict
  recovery, replies, bookmarks, deletion, removed-post views and moderation.
- 320px and 390px layouts pass overflow checks with external requests blocked.
- Lint has no errors or warnings for the changed code; project typecheck passes.
- Next.js production build succeeds and includes `/design-preview/community` as
  a dynamic route. The route returns notFound by default in production; the
  existing `ENABLE_DESIGN_PREVIEW=1` explicitly enables fixture viewing.
- The offline bundle is about 94 KiB gzip including the lazy moderation chunk,
  below the 180 KiB preview budget. This is not the deployed route's JS or TTFB.
- Desktop/mobile screenshots are generated under
  `artifacts/community-preview/screenshots/` and visually reviewed. Build output
  and bundle measurements also remain under ignored artifacts.

## Preview and next boundary

Current interactive Phase 1 preview: **http://localhost:40867**.
Phase 0 remains separately available at http://localhost:40893.
To regenerate and serve the React preview:

```sh
bun run community:preview
python3 -m http.server 0 --bind 0.0.0.0 --directory artifacts/community-preview
```

Use Python's printed free port. Verification starts its own loopback server and
shuts it down automatically. No production data or user messages are touched.
No blocking Phase 1 issue was found after the listed fixes. Review coverage is
bounded; production database/security/performance acceptance remains Phase 2–4.
Next work is Phase 2 persistence, permissions and read services, followed by
production frontend integration in Phase 3 and rollout gates in Phase 4.
