# Codex Handoff — Skill-driven free directory submission

**Updated:** 2026-07-02
**Branch:** `main`
**Workflow:** no PRs; commit and push directly to `main`.

## Current State

The Skill-driven free directory submission implementation has completed the
planned in-repo phases:

- Phase 0: push-based Bun CI
- Phase 1: five-table schema and API-key authentication
- Phase 2: dashboard API-key management and domain endpoints
- Phase 3: domain verification via HTML file, DNS TXT, and meta tag
- Phase 4: submit endpoint with quota, domain dedupe, AI review, and similarity
  guard
- Phase 5: publication worker, canary review, public noindex status page, and
  takedown path
- Phase 6: targeted guardrail tests and distributable Skill artifact

The latest review hardening adds:

- database-enforced permanent `skill_submission.domain` dedupe
- short Redis pending lock for in-flight domain submits
- atomic Redis Lua rate-limit checks with non-consuming preflight support
- publication config preflight before spending global daily budget
- stricter canary review threshold
- receiver publish success requiring a concrete external URL
- public status error sanitization so UUID pages do not expose env/config
  internals

## Required Context

Primary spec:

- `docs/skill-directory-submission.md`

Approved plan:

- `/home/ivmm/.claude/plans/goofy-meandering-thunder.md`

Project memories:

- `/home/ivmm/.claude/projects/-home-ivmm-Open-Launch/memory/transform-algorithm-webstreams.md`
- `/home/ivmm/.claude/projects/-home-ivmm-Open-Launch/memory/no-pr-just-push.md`

## Hard Constraints

- Use Bun, not npm or pnpm, for project commands.
- Server-side outbound HTTP must use `undici.request`, `safeFetch`, or DNS.
  Do not add global `fetch` with `AbortSignal` in server code.
- The free skill pipeline must stay separate from paid syndication tables and
  queue state.
- `skill_publication` worker behavior should mirror
  `app/api/cron/syndicate-launches/route.ts` and `lib/launch-syndication.ts`:
  status machine, idempotent rows, and `2 ** attempts` retry backoff capped at
  120 minutes.
- Before running `codex review`, move
  `~/.agents/skills/code-review` aside and restore it afterwards. The key is
  `CRS_OAI_KEY` in `~/.env`; do not print it.

## Verification Flow

Use:

```bash
export PATH="$HOME/.nvm/versions/node/v24.11.1/bin:$HOME/.bun/bin:$PATH"
bunx tsc --noEmit
bun run lint
bun run test
```

Then run `codex review --uncommitted` with the local `code-review` skill moved
aside and a timeout so it cannot hang indefinitely.

## Remaining Work

In this repo, the planned feature phases are complete and pushed.

Cross-repo receiver work completed for the three currently wired partner repos:

- `~/bigkr` — `b3b94ee fix(external): harden receiver idempotency`
- `~/mf8` — `50c7018 fix(external): harden receiver idempotency`
- `~/hicyou-receiver-work` — `05926b0 feat: add external launch receiver`
  (clean clone; original `~/hicyou` was not touched)

If more receiver repos are added later, repeat the same receiver contract:
`POST /api/external/launch` must honor `rel: "nofollow"` and persist the
idempotency key, and `POST /api/external/unpublish` must be idempotent by that
key.
