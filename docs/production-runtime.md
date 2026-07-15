# Production runtime checklist

## Required Zeabur variables

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

Zeabur supplies `ZEABUR_GIT_COMMIT_SHA` during the image build. Next.js uses it
as `deploymentId` so an old browser tab hard-refreshes when it reaches a newer
deployment instead of posting a stale Server Action ID.

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

`update-launches` is deliberately scheduled every ten minutes and is
idempotent. Missing the 08:00 UTC boundary therefore self-heals on the next
tick rather than hiding the daily feed until an operator intervenes.

## Container image

Zeabur detects the root `Dockerfile`. It builds Next.js `standalone` output in
a Node 24 builder and copies only the traced runtime, static assets, and
`public/` into the final non-root image. Build-time `NEXT_PUBLIC_*`, deployment
ID, and Server Action key variables are declared as Docker `ARG`s so Zeabur can
inject them into the multi-stage build.
