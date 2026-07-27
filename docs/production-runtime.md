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

`update-launches` is deliberately scheduled every ten minutes and is
idempotent. Missing the 08:00 UTC boundary therefore self-heals on the next
tick rather than hiding the daily feed until an operator intervenes.

## Production artifact

`bun run build` produces a self-contained `.next/standalone` directory, copies
`public/` and `.next/static` into it, and removes dotenv files. `bun run start`
starts that artifact with Node 24.15+; it must not use `next start` while
`output: "standalone"` is enabled.

The root `Dockerfile` uses the same artifact and runs it as a non-root user.
Build-time `NEXT_PUBLIC_*`, deployment ID, and Server Action key variables are
declared as Docker `ARG`s; runtime secrets are injected separately.
