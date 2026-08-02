# aat.ee production deployment runbook

Last verified: 2026-08-03 (Asia/Shanghai)

This is the canonical operator handoff for the current aat.ee production
deployment. It records connection facts and commands, but never credential
values or private-key contents.

## Hosting authority

- aat.ee is **not deployed on Zeabur**.
- The retired Zeabur `open-launch` application is suspended. Its retained
  `openlaunch` database and Redis service are not production authorities; all
  21 rows in that database's `cron_schedule` table were disabled on 2026-07-28
  to isolate the legacy scheduler. See
  [Retired Zeabur scheduler isolation](#retired-zeabur-scheduler-isolation).
- Production host: `8.210.175.190`
- SSH user: `ecs-user`
- Remote hostname: `iZj6c7t3zvc5p481sn85jtZ`
- Deployment controller repository: `/home/ivmm/tools/deploy-tools`
- Managed service ID: `aat-ee`
- Deployment method: Docker Compose through `opsctl`
- Production root:
  `/home/ecs-user/aat-ee-production-2a23d6b7202557d1b`
- Application project:
  `/home/ecs-user/aat-ee-production-2a23d6b7202557d1b/app/project`
- Server registry: `/srv/server-registry`
- `opsctl` state: `/var/lib/opsctl`
- `opsctl` binary: `/usr/bin/opsctl`
- Backup repository ID: `restic-idrive-e2`

Pushing `main` does not itself prove or perform a production deployment. CI,
artifact construction, the `opsctl` gates, backup, snapshot, approval, execution,
and post-deploy checks are separate steps.

## SSH connection

The existing client key must be reused. Do not create or install a new key just
because a connection attempt used the wrong user, IP, key, or known-hosts file.

| Fact                                  | Value                                                              |
| ------------------------------------- | ------------------------------------------------------------------ |
| Private key path                      | `/home/ivmm/.ssh/deployops_server`                                 |
| Dedicated known-hosts path            | `/home/ivmm/.ssh/known_hosts_deployops`                            |
| Required SSH options                  | `BatchMode=yes`, `IdentitiesOnly=yes`, `StrictHostKeyChecking=yes` |
| Verified ED25519 host-key fingerprint | `SHA256:Bfy3cj0Znt7Ahs5H2ziRAMXks0N9TxGjAIEHb+62PQQ`               |

Connect with:

```bash
AAT_SSH_KEY=/home/ivmm/.ssh/deployops_server
AAT_KNOWN_HOSTS=/home/ivmm/.ssh/known_hosts_deployops
AAT_SSH_TARGET=ecs-user@8.210.175.190

ssh \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$AAT_KNOWN_HOSTS" \
  -i "$AAT_SSH_KEY" \
  "$AAT_SSH_TARGET"
```

Minimal read-only identity check:

```bash
ssh \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/home/ivmm/.ssh/known_hosts_deployops \
  -i /home/ivmm/.ssh/deployops_server \
  ecs-user@8.210.175.190 \
  'hostname; id -un'
```

Expected output:

```text
iZj6c7t3zvc5p481sn85jtZ
ecs-user
```

### If the public IP changes

1. Search existing local records before changing SSH state:

   ```bash
   rg -n \
     'deployops_server|known_hosts_deployops|ecs-user@|aat-ee-production' \
     /home/ivmm/.ssh/config \
     /home/ivmm/.bash_history \
     /home/ivmm/tools/deploy-tools \
     2>/dev/null
   ```

2. Keep `/home/ivmm/.ssh/deployops_server`; an IP change does not invalidate the
   client key.
3. Confirm the new IP through a trusted channel.
4. Obtain the server's ED25519 host-key fingerprint from its console with
   `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
5. Compare it with the recorded fingerprint above before updating the dedicated
   known-hosts file. Do not trust an unverified `ssh-keyscan` result by itself.
6. Retry with all four required SSH options and the explicit `ecs-user`.

## Read-only production checks

Use `opsctl` as the source of truth instead of inferring state from arbitrary
Docker commands:

```bash
ssh \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=/home/ivmm/.ssh/known_hosts_deployops \
  -i /home/ivmm/.ssh/deployops_server \
  ecs-user@8.210.175.190 \
  'sudo -n /usr/bin/opsctl \
    --registry /srv/server-registry \
    --state-dir /var/lib/opsctl \
    status --json'
```

Replace `status --json` with one of these reviewed read-only commands when
needed:

```text
services --json
deploy-gates --json
deploy-journals --json
deploy-journal-inspect <journal-id> --json
snapshot-coverage --json
backup readiness --json
backup history --json
backup check restic-idrive-e2 --json
```

At the last verification, `status --json` reported:

- `doctor_errors=0`
- `doctor_warnings=0`
- backup readiness and backup history `ready`
- no stale backup targets
- deployment gates `ready`
- snapshot coverage `ready`

The current post-deploy backup is
`backup-aat-ee-restic-20260802160845`; the independent repository check is
`check-restic-idrive-e2-20260802161026`. Both completed successfully without
limitations.

## Current application state

The application artifact currently serving public traffic was built from:

```text
4a7746890e899e9b22145d51ff846d45496f1050
```

Current runtime facts:

- application container: `aat-ee-app`
- container status after deployment: running and healthy
- Compose contract:
  `compose.phase11b-shadow-audit-r25.yml`
- deployment marker:
  `20260802-phase11b-shadow-audit-r25`
- runtime: Node `v24.18.0`, Linux `x64`, `sharp 0.35.3`, libvips `8.18.3`
- root filesystem remains read-only
- `/app/.next/cache` is a bounded 256 MiB `tmpfs`, UID/GID `1001`, mode `0750`

The current r25 release applies additive migration 0059 and keeps production in
Shadow mode with an empty Canary path and all Ledger workers disabled. Its
canonical plan, snapshot and journal completed 6/6 operations successfully;
the post-deploy Shadow preflight is ready, while Canary remains blocked until
the new atomic materialization audit covers a complete 48-hour window. See
[Phase 11B Shadow audit deployment](./deployments/2026-08-02-phase11b-shadow-audit.md).

Phase 9 first deployed the persistent Cron ledger and migration 0058 as r22;
Phase 10 enabled Shadow materialization as r23; Phase 11A deployed Canary
readiness without enabling Canary as r24. Their exact evidence remains in the
deployment records under `docs/deployments/`.

The audit-remediation release first deployed commit
`1fc846d79882420b7b78cabfb66f378397969ee2` through the `r10` plan, including
migrations 0048–0057. Production sitemap verification then found a cached-Date
serialization bug; commit `805c25efb2188bb23d3b998eb29affd60f081118`
fixed it and was deployed as the application-only `r12` hotfix. Commit
`176b6d37ac32d80fca66a0ab8010a8becb03b59a`, deployed as `r13`, then split
projects/users into bounded sitemap shards and moved the expanded hreflang
objects out of the Next Data Cache. Commit
`45758f2cd62e619c45ebf162a291d8cc4f0dd925` (`r14`) fixed the x64 `sharp`
artifact, added tags sharding, trusted the non-www HTTPS origin, and reduced
project-detail mobile LCP work. Final commit
`5704b6a60a178ed11bf7f169e04c6b58cad4af0e` (`r15`) corrected legacy sitemap
redirects to the public canonical origin. Commit
`7db3e9abff0ff6c45f5f479948662d08c0fe306a` (`r16`) then restored the minimal
locale context required by route navigation primitives without expanding the
scoped client message payloads. Commit
`ea606e9cf65099272615b14ea595cd5daed14bc8` (`r17`) separates explicit
no-alternative results from transient provider, crawl, parse, and database
failures: definitive results retain the 30-day cooldown, while failures become
eligible for retry after one hour and surface as failed cron runs when nothing
was generated. A separately approved, exact-row, rollback-on-mismatch one-shot
plan cleared the stale Hero Widget attempt timestamp created by the pre-r17
behavior. Commit `8c771ae8da0d5ba022409aa375a8ef298bb885b6` (`r18`) explicitly
disables DeepSeek V4's default thinking mode for the application's bounded JSON,
translation, and short-prose requests, preventing reasoning tokens from
exhausting `max_tokens` before any content is returned. It also blocks embedded
Cron startup during `phase-production-build`. Commit
`93f7349fa8efee4bd144a48f0b31ca6b548f7d90` (`r19`) moves Cron and webhook
health email onto a dedicated operational-alert template, escapes dynamic HTML,
hardens the Discord fallback, and corrects the two-minute schedule-window
boundary without shortening the real-time grace period. The exact plans,
snapshots, journals, migration evidence, performance measurements, and backup
records are in `docs/deployments/2026-07-27-audit-remediation.md`.

The r19 standalone artifact was built locally for Linux/amd64 and verified on
the production host before image assembly. Two earlier direct production-host
Next.js/Turbopack build attempts exhausted most RAM and swap and briefly caused
SSH/public request timeouts; the serving r18 container stayed healthy with zero
restarts throughout. Do not run a full application build on this 3.4 GiB host
while production is serving traffic. Build off-host, bind the source and public
build-input hashes, and use production only for artifact verification and the
lightweight runner-image assembly.

A build diagnostic process listing exposed a build-time encryption credential
to internal tool output. The value is not recorded in this repository. Rotate
that credential only as a separately approved environment change, then rebuild,
redeploy, and verify any runtime that consumes it.

The r19 controller run has one state-path exception. Preflight, snapshot, and
deploy were invoked from the project without the canonical `--state-dir`, so
their local state resolved to the project's `.opsctl` directory; the
post-deploy backup invocation resolved local state under
`/home/ecs-user/.opsctl`. Registry approvals and backup history are intact, and
the r19 snapshot and successful journal remain verifiable through the explicit
alternate project state path, but `/var/lib/opsctl` does not list them. Do not
manually copy or merge these state directories. Any audit reconciliation needs
a separately approved, reviewed procedure. Every future production invocation
must explicitly include both:

```text
--registry /srv/server-registry --state-dir /var/lib/opsctl
```

One handled r19 runtime log remains: an Ogtv logo larger than the 512 KiB OG
fetch limit correctly falls back to a letter tile but is logged as
`[og] logo fetch failed` because the body-limit exception in r19 is an untyped
`Error`. The reviewed main-branch follow-up classifies body-size and read-deadline
failures as `SafeFetchError`; deploy that change as a separate exact release
before expecting this log line to disappear.

Cloudflare Rocket Loader was disabled and verified on 2026-07-28. Public English
and Spanish Ogtv HTML now contain zero `rocket-loader` scripts, zero
`data-cf-settings` attributes, and zero rewritten Next.js streaming script
types. Before the change, the Spanish page had 1 / 1 / 82 respectively.

After the change, three standard mobile traces observed LCP at 0.97s, 1.78s,
and 3.63s (median 1.78s). A provided-network comparison measured public LCP at
1.99s versus 1.41s at the same production origin, with TBT 0 in both runs.
Simulated throttling remains volatile and Search Console group LCP must be
evaluated over its rolling field-data window.

## Required deployment sequence

All production mutations require explicit user authority. Work in
`/home/ivmm/tools/deploy-tools` and follow its `AGENTS.md`; do not bypass
`opsctl` with an ad hoc `docker compose up`, direct registry edit, or manual
replacement of production files.

1. Resolve and record the exact source commit.
2. Run the repository's Bun lint, typecheck, tests, production build, dependency
   audit, and available secret/supply-chain checks.
3. Construct a Linux/amd64 standalone artifact from that exact commit. Supply
   `DEPLOYMENT_VERSION` during the build.
4. Check `opsctl status`, `deploy-gates`, backup history, and snapshot coverage.
5. Run the registered before-deploy backup for `aat-ee` and verify its systemd
   result. Check `restic-idrive-e2`.
6. Create a new, uniquely named typed deploy plan and run `preflight`.
7. Create and verify the required snapshot, then run
   `deploy <plan> --dry-run --snapshot <snapshot-id> --json`.
8. Request human approval for the exact ready plan and snapshot. Destructive
   operations require their own typed approval scope.
9. Execute only the approved plan, snapshot, and approval token. Preserve the
   resulting journal ID.
10. Verify container health, public HTTP routes, structured data, sitemap XML,
    authorization boundaries, cron state, and error logs.
11. Run and verify the post-deploy backup and repository check.

The registered backup unit used before and after this deployment was:

```bash
sudo -n systemctl start opsctl-backup-run@aat-ee.service
sudo -n systemctl show \
  --property=Result \
  --property=ExecMainStatus \
  opsctl-backup-run@aat-ee.service
```

Both `Result=success` and `ExecMainStatus=0` are required. Then run the reviewed
`opsctl backup check restic-idrive-e2 --json` command and confirm success.

The exact supported CLI syntax must be queried from the installed binary before
use:

```bash
sudo -n /usr/bin/opsctl \
  --registry /srv/server-registry \
  --state-dir /var/lib/opsctl \
  <command> --help
```

Do not copy an approval token, secret value, raw environment file, or private
artifact into this repository or a chat transcript.

## Post-deploy verification baseline

Verify at least:

```text
https://aat.ee/
https://www.aat.ee/
https://www.aat.ee/zh
https://www.aat.ee/es
https://www.aat.ee/et
https://www.aat.ee/sitemap.xml
https://www.aat.ee/sitemaps/static.xml
https://www.aat.ee/sitemaps/projects-1.xml
https://www.aat.ee/sitemaps/users-1.xml
https://www.aat.ee/sitemaps/tags-1.xml
https://www.aat.ee/sitemaps/editorial.xml
https://www.aat.ee/et/projects/serena
```

The legacy `/sitemaps/projects.xml`, `/sitemaps/users.xml`, and
`/sitemaps/tags.xml` routes must return `308` to the exact public canonical URL
`https://www.aat.ee/sitemap.xml`; an internal `0.0.0.0:8080` Location is a
regression. Sharded routes use one-based suffixes; zero, suffixes above the
bounded parser limit, and suffixes on unsharded kinds must return `404`.

For the Serena page, confirm one server-rendered `BreadcrumbList` with exactly
three ordered items (`Avaleht`, `Projektid`, `Serena`), each containing `name`
and `position`, and confirm there is no duplicate breadcrumb Microdata.

Unauthenticated requests must continue to return `401` for:

```text
GET /api/cron/translate-projects
GET /api/cron/enrich-projects
GET /api/cron/dispatch
POST /api/upload
```

For cron incidents, inspect the database's run/attempt records without calling
an authenticated cron-health endpoint unless sending its alert email is
intentional.

## Retired Zeabur scheduler isolation

On 2026-07-28, a nine-task stale alert was traced to the retained Zeabur
`openlaunch` database, not the ECS production database:

- the Zeabur database received `cron_run_log` rows at second `:56`, while ECS
  production received them at second `:40`;
- recalculating last-success ages immediately before the legacy 12:00 UTC
  health run reproduced all nine values in the alert;
- ECS production had successful health runs and did not emit that alert.

With explicit approval, the old database's 21 schedule rows were copied to
`ops_cron_schedule_backup_20260728_approved` and then all set to
`enabled=false` in one transaction. No Zeabur service was deleted, the
suspended application was not restarted, and no ECS production row or resource
was changed.

Verification crossed two former dispatch cycles: the old database remained at
`2026-07-28 13:00:56.965 UTC` with zero later run rows, while ECS production
advanced through `2026-07-28 13:04:40.423 UTC`; `aat-ee-app` remained healthy
with restart count 0.

If rollback is explicitly approved, first confirm the backup still contains
exactly 21 rows and all are enabled, then restore by ID in a transaction:

```sql
BEGIN;
LOCK TABLE cron_schedule IN SHARE ROW EXCLUSIVE MODE;

UPDATE cron_schedule AS current
SET enabled = backup.enabled,
    updated_at = backup.updated_at
FROM ops_cron_schedule_backup_20260728_approved AS backup
WHERE current.id = backup.id;

COMMIT;
```

Do not re-enable the retired schedules while ECS embedded Cron is authoritative:
doing so restores duplicate task execution and legacy health emails.

## Related records

- [2026-07-26 cron, SEO, upload, and production hardening](./deployments/2026-07-26-cron-seo-hardening.md)
- [Production runtime checklist](./production-runtime.md)
- [Database backup design](../BACKUP.md)
- `opsctl` contributor and safety rules:
  `/home/ivmm/tools/deploy-tools/AGENTS.md`
