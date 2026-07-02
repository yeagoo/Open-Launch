# Codex Handoff — Skill-driven free directory submission

**Updated:** 2026-07-03
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
- `safeFetch` moved to undici with connect-time DNS lookup pinned to
  prevalidated public records, closing the DNS rebinding follow-up.

## Required Context

Primary spec:

- `docs/skill-directory-submission.md`
- `docs/skill-production-smoke-test.md`

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
export NODE22_BIN="$(find "$HOME/.nvm/versions/node" -maxdepth 1 -type d -name 'v22.*' | sort -V | tail -1)/bin"
export PATH="$NODE22_BIN:$HOME/.bun/bin:$PATH"
node --version # must be Node 22.x; production target is 22.23.0
bunx tsc --noEmit
bun run lint
bun run test
```

Receiver rollout/config readiness:

```bash
bun run skill:receivers:check
```

This command intentionally exits non-zero until all 12
`SKILL_PUBLISH_<SITE>_URL` values resolve to valid http(s) launch endpoints,
each has either an explicit unpublish URL or a launch URL ending in `/launch`,
and an API key source is present. It does not print secret values.

Then run `codex review --uncommitted` with the local `code-review` skill moved
aside and a timeout so it cannot hang indefinitely.

Production smoke test:

```bash
bun run skill:receivers:smoke
# After receiver config is ready and live posts are intentional:
SKILL_SMOKE_WEBSITE_URL="https://smoke.example.com" \
  bun run skill:receivers:smoke -- --confirm-live-posts
```

Then follow `docs/skill-production-smoke-test.md` for domain verification,
submit, worker tick, status-page check, and takedown cleanup.

## Remaining Work

In this repo, the planned feature phases are complete and pushed.

Production smoke testing is documented but not yet executed in this environment:
`bun run skill:receivers:check` still fails until all 12 receiver URLs and API
keys are configured.

The receiver target set is the explicit navigation-site allowlist in
`lib/skill-sites.ts`, not the authority/documentation sites from
`lib/directories-links.json`. Configure these 12 site ids:

- `~/mf8` — `mf8` / `mf8.biz`
- `~/bigkr` — `bigkr` / `bigkr.com`
- `~/hicyou-pravite` — `hicyou` / `hicyou.com`
- `~/daohang/toolso-ai-open` — `mifar` / `mifar.net`, `qoo` / `qoo.im`,
  `fastd` / `fastd.top`, `xlayers` / `xlayers.dev`, `upperstory` /
  `upperstory.io`, `xemvip` / `xemvip.com`, `skachat` / `skachat.xyz`,
  `nexablocks` / `nexablocks.com`, `blackhawkegames` /
  `blackhawkegames.com`

If more receiver repos are added later, repeat the same receiver contract:
`POST /api/external/launch` must honor `rel: "nofollow"` and persist the
idempotency key, and `POST /api/external/unpublish` must be idempotent by that
key.
