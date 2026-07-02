# Skill Production Smoke Test

Run this after deployment and receiver configuration changes. It intentionally
touches live receiver APIs, so stop at the first failed preflight.

## Preconditions

- Latest `main` is deployed on aat.ee.
- Database migrations through `0045_skill_submission_domain_unique.sql` are
  applied.
- `CRON_API_KEY`, Redis, database, DeepSeek/Tinyfish, email, and app URL env
  vars are configured in production.
- All 12 navigation receiver sites have deployed:
  - `POST /api/external/launch`
  - `POST /api/external/unpublish`
  - `rel: "nofollow"` support
  - idempotency-key persistence
- aat.ee has receiver env vars for all 12 sites:
  - `SKILL_PUBLISH_<SITE>_URL`
  - `SKILL_PUBLISH_<SITE>_UNPUBLISH_URL` unless launch URL ends in `/launch`
  - `SKILL_PUBLISH_<SITE>_API_KEY`, or shared `SKILL_PUBLISH_API_KEY`, or
    `EXTERNAL_LAUNCH_API_KEY`
- Use a real owned smoke domain that has not used the free skill channel before.
  Do not use a customer domain.

## 1. Receiver Preflight

From the aat.ee production shell:

```bash
bun run skill:receivers:check
```

Expected: all 12 receiver configurations are ready. If any endpoint or key is
missing, stop.

The receiver envs must target the navigation sites, not the authority/document
sites from `directories-links`:

```bash
SKILL_PUBLISH_MF8_URL=https://mf8.biz/api/external/launch
SKILL_PUBLISH_BIGKR_URL=https://bigkr.com/api/external/launch
SKILL_PUBLISH_HICYOU_URL=https://hicyou.com/api/external/launch
SKILL_PUBLISH_MIFAR_URL=https://mifar.net/api/external/launch
SKILL_PUBLISH_QOO_URL=https://qoo.im/api/external/launch
SKILL_PUBLISH_FASTD_URL=https://fastd.top/api/external/launch
SKILL_PUBLISH_XLAYERS_URL=https://xlayers.dev/api/external/launch
SKILL_PUBLISH_UPPERSTORY_URL=https://upperstory.io/api/external/launch
SKILL_PUBLISH_XEMVIP_URL=https://xemvip.com/api/external/launch
SKILL_PUBLISH_SKACHAT_URL=https://skachat.xyz/api/external/launch
SKILL_PUBLISH_NEXABLOCKS_URL=https://nexablocks.com/api/external/launch
SKILL_PUBLISH_BLACKHAWKEGAMES_URL=https://blackhawkegames.com/api/external/launch
```

If the launch URL ends in `/launch`, the unpublish URL is derived as the same
path with `/unpublish`; explicit `SKILL_PUBLISH_<SITE>_UNPUBLISH_URL` values
are optional. Use `SKILL_PUBLISH_API_KEY` for a shared receiver secret or
`SKILL_PUBLISH_<SITE>_API_KEY` for per-site secrets.

Preview the live receiver smoke:

```bash
bun run skill:receivers:smoke
```

This is a dry run. It validates config and prints the redacted launch/unpublish
endpoints.

Run the live receiver contract smoke:

```bash
SKILL_SMOKE_WEBSITE_URL="https://smoke.example.com" \
  bun run skill:receivers:smoke -- --confirm-live-posts
```

Expected: every site reports `post=ok unpublish=ok` and returns a concrete
external URL for the temporary launch post. This verifies receiver auth,
idempotency-key storage, external URL extraction, and unpublish rollback before
the aat.ee queue touches real submissions.

`SKILL_SMOKE_WEBSITE_URL` is required for live mode and must be a dedicated
unused smoke domain. Do not point it at aat.ee or a customer site.

Use `--site <site-id>` to smoke one receiver, or `--keep-published` only when
you need to inspect a receiver page manually.

## 2. End-to-End Submission Smoke

Set local shell variables:

```bash
export BASE_URL="https://www.aat.ee"
export SKILL_API_KEY="aat_skill_..."
export CRON_API_KEY="..."
export SMOKE_DOMAIN="smoke.example.com"
export SMOKE_WEBSITE_URL="https://smoke.example.com"
```

Create a dedicated Skill API key in the dashboard for the smoke account. Revoke
it after the test.

Register the domain:

```bash
curl -sS -X POST "$BASE_URL/api/skill/domains" \
  -H "Authorization: Bearer $SKILL_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"domain\":\"$SMOKE_DOMAIN\",\"method\":\"dns\"}" \
  | tee /tmp/skill-domain.json
```

Add the returned DNS TXT proof to `_aat-verify.$SMOKE_DOMAIN`, then verify:

```bash
DOMAIN_ID="$(bun -e 'const fs = require("node:fs"); console.log(JSON.parse(fs.readFileSync("/tmp/skill-domain.json", "utf8")).domain.id)')"

curl -sS -X POST "$BASE_URL/api/skill/domains/$DOMAIN_ID/verify" \
  -H "Authorization: Bearer $SKILL_API_KEY" \
  | tee /tmp/skill-domain-verify.json
```

Expected: `verified: true`.

Generate the real 12-variant payload with
`skills/free-directory-submission/SKILL.md` against the smoke domain. The
payload must be realistic enough for the review classifier and similarity guard;
do not submit placeholder repeated text.

Submit:

```bash
curl -sS -X POST "$BASE_URL/api/skill/submit" \
  -H "Authorization: Bearer $SKILL_API_KEY" \
  -H "Content-Type: application/json" \
  --data @/tmp/skill-submit.json \
  | tee /tmp/skill-submit-response.json
```

Expected:

- HTTP 201
- `status: "publishing"`
- a `uuid`
- a public `statusUrl`
- review score/reasons are present

Check the public status API:

```bash
UUID="$(bun -e 'const fs = require("node:fs"); console.log(JSON.parse(fs.readFileSync("/tmp/skill-submit-response.json", "utf8")).uuid)')"

curl -sS "$BASE_URL/api/skill/status/$UUID" \
  | tee /tmp/skill-status.json
```

Expected: no internal receiver endpoint names, env names, stack traces, or raw
config errors are exposed.

Drive one worker tick:

```bash
curl -sS "$BASE_URL/api/cron/skill-publish" \
  -H "Authorization: Bearer $CRON_API_KEY" \
  | tee /tmp/skill-publish.json
```

Expected for a fresh day with receiver config ready:

- `sent: 2` for the canary batch, unless the global daily budget was already
  used
- `deferred: 0` for config errors
- `failed: 0`
- the two canary `skill_publication` rows have `status='sent'`,
  `external_url` set, and `rel='nofollow'`

## 3. Cleanup

After the canary smoke passes, take down the smoke submission from the admin UI
or admin takedown endpoint while authenticated as an admin:

```bash
curl -sS -X POST "$BASE_URL/api/admin/skill/$UUID/takedown" \
  -H "Cookie: <admin session cookie>"
```

Expected:

- already-published receiver rows are unpublished idempotently
- `skill_submission.status` becomes `taken_down`
- public status does not expose internal receiver errors

Revoke the smoke Skill API key.

## Stop Conditions

Stop and fix before continuing if any of these occur:

- `skill:receivers:check` reports missing or invalid receiver config
- direct receiver smoke cannot post and unpublish all target sites
- submit returns `site_config_error`, `review_unavailable`, or an unexpected
  5xx
- worker response has receiver config `deferred` rows
- receiver success lacks a concrete public `externalUrl`
- public status exposes raw internal errors
