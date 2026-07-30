# Production runtime checklist

For the authoritative server connection, `opsctl` paths, deployment sequence,
current Compose contract, and IP-change recovery procedure, see the
[production deployment runbook](./production-deployment-runbook.md).

## Required production variables

- `CRON_API_KEY`: one strong bearer token shared by the dispatcher and tasks.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: a stable base64-encoded 32-byte value.
  Generate it once with `openssl rand -base64 32`; do not rotate it on every
  deployment.
- `CRON_HEARTBEAT_URL`: an external dead-man check URL from healthchecks.io,
  Better Stack, or an equivalent service. It must be a publicly reachable
  third-party URL, not an `aat.ee` route or a private/internal address. Failed
  pings retry with exponential backoff up to 30 minutes and never fail cron
  dispatch itself.
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_URL`: both `https://www.aat.ee` in
  production.

`WEB_VITALS_SAMPLE_RATE` is a server-only fraction from `0` to `1` and defaults
to `0` (disabled). After privacy review, start with a small explicit sample such
as `0.05`. The Matomo payload contains only a route family, locale, viewport
device class, metric/value/rating and numeric LCP timing segments. It excludes
full URLs, slugs, search terms, user identifiers, email addresses and DOM
targets. Invalid values fail the build/runtime render instead of silently
enabling collection.

Explicit Google Analytics and ordinary Matomo pageviews also remove every
query parameter and fragment, retaining only the origin and pathname.

Server logs default to one JSON object per line. `STRUCTURED_LOG_FORMAT=text`
is an emergency compatibility mode for a legacy collector; it changes framing
only and never disables redaction.

`PAYMENT_EMAIL_OUTBOX_ENABLED` defaults to `false`. Do not enable it in the
first Phase 8 deployment: deploy and verify the consumer-capable digest first,
then approve a separate change to exact lowercase `true`. Once enabled, the
minimum direct rollback digest is one that understands the `payment_admin` and
`directory_order_confirmation` outbox kinds. See
[development-phase8-payment-webhook-outbox.md](./development-phase8-payment-webhook-outbox.md)
for the active-row preflight and rollback procedure.

The deployment at `8.210.175.190` is managed through
`/home/ivmm/tools/deploy-tools`. Supply `DEPLOYMENT_VERSION` (normally the Git
commit SHA) during the build so an old browser tab hard-refreshes when it
reaches a newer deployment instead of posting a stale Server Action ID.

aat.ee is not deployed on Zeabur, and pushing `main` does not by itself deploy
production. Do not bypass the backup, snapshot, approval, and `opsctl` gates
described in the runbook.

## Scheduler

The application starts a redundant one-minute dispatcher from
`instrumentation.ts`. Redis `SET NX` leases deduplicate it across rolling pods
and an optional external trigger. Keep the cron-job.org trigger as an
independent backup:

```text
GET https://www.aat.ee/api/cron/dispatch
Schedule: * * * * *
Authorization: Bearer <CRON_API_KEY>
```

`CRON_SCHEDULER_MODE` defaults to `legacy`. Migration 0058 adds a persistent
job ledger:

- `legacy`: existing dispatcher remains authoritative.
- `shadow`: legacy still executes; theoretical ledger jobs are written as
  `cancelled` audit rows and can never be claimed.
- `canary`: exactly one code-approved, strictly idempotent task with an
  exclusive concurrency group uses the ledger; all other tasks remain legacy.
- `ledger`: persistent jobs are authoritative, but the application fails closed
  until every Phase 0 task policy is explicitly approved.

Do not enable `shadow` before migration 0058 is applied. Do not enable `canary`
or `ledger` without the read-only preflight, documented observation window,
immutable worker artifact, canonical opsctl readiness and explicit production
approval. The complete order and rollback procedure are in
[development-phase7-cron-cutover.md](./development-phase7-cron-cutover.md).
`INTERNAL_BASE_URL` for every scheduler mode must be a credential-free HTTP
loopback or single-label Compose service origin; a public URL is rejected
before the dispatcher constructs an authenticated task request.

The same immutable runner image contains `cron-ledger-worker.mjs`. A separate
worker service uses:

```text
command: node cron-ledger-worker.mjs
SERVICE_ROLE=cron-worker
CRON_SCHEDULER_MODE=canary # or ledger; must match Web
CRON_LEDGER_CANARY_TASK_PATH=/api/cron/<reviewed-task> # canary only
INTERNAL_BASE_URL=http://web:8080
```

The Worker requires a non-loopback, single-label Web service origin. It exposes
loopback-only `/health` on port 8081 for the image HEALTHCHECK and uses a
separate `CRON_WORKER_HEARTBEAT_URL` for dead-man monitoring. Only after this
service is healthy may Web set `CRON_LEDGER_EMBEDDED_WORKER=false`.

The node-postgres pool is explicit and bounded. Defaults are 10 connections for
Web and 3 for the Cron Worker, with a 5-second connection timeout. Before
canary, calculate the total across all Web replicas, Worker replicas, backup and
operator connections; override `DATABASE_POOL_MAX` only from that budget.

`update-launches` is deliberately scheduled every ten minutes and is
idempotent. Missing the 08:00 UTC boundary therefore self-heals on the next
tick rather than hiding the daily feed until an operator intervenes.

## Production artifact

`bun run build` produces a self-contained `.next/standalone` directory, copies
`public/` and `.next/static` into it, and removes dotenv files. `bun run start`
starts that artifact with Node 24.15+; it must not use `next start` while
`output: "standalone"` is enabled.

The root `Dockerfile` uses the same artifact and runs it as a non-root user.
Build-time public identifiers and deployment metadata use Docker `ARG`.
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is required through a BuildKit secret
mount and must never be supplied as `--build-arg`. Runtime secrets are injected
separately.

The public Turnstile site identifier uses the Docker build argument
`NEXT_PUBLIC_TURNSTILE_SITE_IDENTIFIER`; the Dockerfile maps it to the
application's `NEXT_PUBLIC_TURNSTILE_SITE_KEY` only for the build process. The
renamed argument keeps Docker's secret detector active globally instead of
suppressing `SecretsUsedInArgOrEnv`.

`scripts/build-immutable-runner.sh` forwards only the Dockerfile's explicit
`NEXT_PUBLIC_*` inputs when they are present in the protected build
environment. In particular, it maps `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the
public `NEXT_PUBLIC_TURNSTILE_SITE_IDENTIFIER` build argument. Runtime
credentials are never promoted to build arguments.

The `cron_ledger_migrator` target is a bounded Phase 9 one-shot image. It runs
as UID/GID 1001 and defaults only to
`scripts/apply-pending-sql.ts --apply 0058_cron_job_ledger.sql`. Production has
two older, intentionally unactivated Skill migrations (0044 and 0045), so the
Phase 9 deployment must use this exact target instead of the broad
`bun run db:migrate` adapter. Enabling those Skill migrations is a separate
business change.

The manual `Immutable runner validation` workflow packages one exact commit
from `main` as linux/amd64 using a one-time validation key. It performs one
BuildKit build with Docker/OCI/local exporters, produces a validation-only OCI
archive, checksum manifest, SPDX SBOM and max provenance, then starts the final
read-only runner and checks health, homepage, locale, sitemap, Cron
authorization and a static asset. Its manifest is explicitly
`releasable=false`. It does not use the production Server Actions key, push to a
registry or deploy production because the private production registry has not
yet been verified.

A deployable build must use the stable production key only while pushing
directly to the confirmed private registry. Do not upload that OCI archive as a
public/general CI artifact.

Use `scripts/opsctl-canonical.sh` for production controller calls. It always
fixes `/usr/bin/opsctl`, `/srv/server-registry` and `/var/lib/opsctl`; it does
not create approvals or bypass any deploy gate.
