# aat.ee production deployment runbook

Last verified: 2026-08-30 (Asia/Shanghai)

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
`backup-aat-ee-restic-20260830155212`; the independent repository check is
`check-restic-idrive-e2-20260830155402`. Both completed successfully without
limitations.

## Current application state

The application artifact currently serving public traffic was built from:

```text
fffbfae7a72281318fe29ad42546cfa23240a237
```

Current runtime facts:

- application container: `aat-ee-app`
- container status after deployment: running and healthy, restart count 0
- Compose contract:
  `compose.hero-r38.yml`
- deployment marker:
  `20260912-hero-r38`
- runtime: Node `v24.18.0`, Linux `x64`, `sharp 0.35.4`
- `HOME_V2=1` — the redesigned home page is **enabled**
- root filesystem remains read-only
- `/app/.next/cache` is a bounded 256 MiB `tmpfs`, UID/GID `1001`, mode `0750`
- last post-deploy backup: `opsctl-backup-run@aat-ee.service` returned
  `Result=success` / `ExecMainStatus=0`, writing
  `/var/lib/opsctl/backup-dumps/aat-ee-data/postgres.sql.zst`
  (51,279,366 bytes, 2026-09-11T10:05:20Z)

### The `HOME_V2` switch

`HOME_V2` selects the home page layout and is read per request
(`app/[locale]/page.tsx`), so it needs no rebuild to change:

- `HOME_V2=1` — redesigned three-column home (`components/home/v2`)
- unset or anything else — the legacy two-column home

It also drives the app-wide action colour: `app/layout.tsx` stamps
`data-app-palette` on `<html>` and `app/globals.css` remaps `--primary`, so
turning it off reverts button colours on every route, not only the home page.

**Rollback of the redesign is this one variable**, not a snapshot restore:
recreate `aat-ee-app` from a contract without the entry (for example
`compose.home-v2-r33.yml`) and the previous home page is served again.

### Releases with no deployment record

`docs/deployments/` has no record for **r31** (AIEO badge) or **r32** (log
remediation), both deployed on 2026-09-04; their journals exist in
`/var/lib/opsctl/deploy-journals`. This section drifted for three releases
because the sequence below did not require updating it. Update it as part of
every release.

The r38 release rewrites the hero copy in eight locales, states the all-time
launch count instead of today's, and replaces the wall with four rows of thirty
vendored brand marks; it also removes the makers row and the partners block.
The r37 release chose the wall's logos by measured quality from the catalogue's
own uploads, which r38 supersedes. The r36
release completed the token migration r35 began: r35 converted the
`/winners` page but not the card component it renders, leaving the winner cards
unreadable in dark mode for four hours. The r35 release brought the last five
pages — winners, blog, search, friends and badge — into the redesigned visual
language. r34 added the leaderboard and free tools pages and
dropped the three dead `PLAUSIBLE_*` variables. `sharp` remains `0.35.4`. CSP is in an intentional
Report-Only observation phase with reports sent to `/api/csp-report`.
Production remains in Shadow mode with an empty Canary path, embedded Ledger
workers disabled, and the payment email outbox disabled. Its canonical plan,
snapshot, and journal completed 6/6 operations successfully. See
[Review remediation r30 deployment](./deployments/2026-08-30-review-remediation-r30.md).

The preceding r28 release deployed the payment-reconciliation hardening, and
r29 performed the separately approved UseWok order reconciliation. See
[Payment reconciliation r28/r29](./deployments/2026-08-09-payment-reconciliation-r28-r29.md).

The earlier r27 app-only release refreshed the canonical directory snapshot,
added the required visible Ahrefs attribution, hardened the snapshot-sync
contract, and resolved its reviewed dependency audit findings. See
[Directory DR refresh deployment](./deployments/2026-08-04-directory-dr-refresh.md).

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
   audit, and available secret/supply-chain checks. CI does all of this on a
   push to `main`; a green run is the evidence, not a substitute for step 3.
3. Build the Linux/amd64 artifact from that exact commit — see
   [Building the release artifact](#building-the-release-artifact).
4. Check `opsctl status`, `deploy-gates`, backup history, and snapshot coverage.
5. Run the registered before-deploy backup for `aat-ee` and verify its systemd
   result. Check `restic-idrive-e2`.
6. Create the Compose contract for this release and validate it — see
   [The Compose contract](#the-compose-contract). Author a new, uniquely named
   typed deploy plan referencing it, then:

   ```bash
   sudo -n /usr/bin/opsctl --registry /srv/server-registry \
     --state-dir /var/lib/opsctl preflight <plan> --json
   ```

   `preflight` is its own subcommand. `deploy --preflight` does not exist and
   fails with `unexpected argument '--preflight' found`. Read the findings: the
   ready-state ones (`backup_history_ready`, `backup_plan_ready`,
   `snapshot_coverage_ready`) are informational; anything at warning or error
   severity blocks the plan.

7. Create and verify the required snapshot, then run
   `deploy <plan> --dry-run --snapshot <snapshot-id> --json`. **The dry run is
   where the approval token comes from** — it is not obtainable any other way.
8. Request human approval for the exact ready plan and snapshot. **The snapshot
   is a required argument**, and the reason is recorded in the audit trail:

   ```bash
   sudo -n /usr/bin/opsctl --registry /srv/server-registry \
     --state-dir /var/lib/opsctl --actor <actor> \
     request-deploy-execution <plan> --snapshot <snapshot-id> \
     --reason '<what this release ships and why>' --json
   ```

   The response carries an `approval.id` (`appr_<plan>_<ts>`), the
   `execution_approval_token`, and the path of the approval file under
   `/srv/server-registry/approvals/`. Without `--snapshot` the request is
   refused with "deploy execution approval can only be requested after deploy
   dry-run is ready", which reads as though the dry run had not been done even
   when it had. The human decision is recorded with
   `opsctl approve <approval-id>`. Destructive operations require their own
   typed approval scope.

9. Execute only the approved plan, snapshot, and approval token. Preserve the
   resulting journal ID. Pass the token from step 7:

   ```bash
   sudo -n /usr/bin/opsctl --registry /srv/server-registry \
     --state-dir /var/lib/opsctl --actor <actor> \
     deploy <plan> --execute --snapshot <snapshot-id> \
     --approval-token 'deploy:<plan-id>:<snapshot-id>' --json
   ```

   Without `--approval-token` the command fails with
   `deploy --execute requires --approval-token from deploy --dry-run`.

10. Verify container health, public HTTP routes, structured data, sitemap XML,
    authorization boundaries, cron state, and error logs.
11. Run and verify the post-deploy backup and repository check.
12. **Update this file's "Current application state" section and add a record
    under `docs/deployments/`.** Both were skipped for r31 and r32; the section
    is only accurate if this step is part of the release.

If an execution fails partway, the remaining operations are recoverable without
redoing the successful ones — see
[Recovering a failed execution](#recovering-a-failed-execution).

## Building the release artifact

The artifact is built by `scripts/build-immutable-runner.sh`, which requires a
working Docker daemon (via the current user or passwordless `sudo`), a clean
worktree, and `HEAD` equal to `--commit`:

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<production key> \
scripts/build-immutable-runner.sh \
  --commit <full 40-hex commit> \
  --output-dir <empty directory> \
  --tag open-launch:<short commit>
```

- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is **required**; the script exits 1
  without it. The value must match production's, or server actions break after
  the deploy. It is available in the operator's `.env.local`. **Do not pass
  `--validation-only`** for a releasable artifact — that flag marks the release
  manifest `releasable=false`, which is what the CI
  `Immutable runner validation` workflow produces.
- There is no `DEPLOYMENT_VERSION` argument; the script derives it from
  `--commit` itself.
- Output is an OCI archive plus `build-metadata.json`, `provenance.json`,
  `release-manifest.json`, `sbom.spdx.json` and `SHA256SUMS`.

Then deliver it to the host and load it:

```bash
ssh <host> 'mkdir -p <release-dir>'
scp open-launch-runner.oci.tar SHA256SUMS release-manifest.json \
    build-metadata.json provenance.json sbom.spdx.json <host>:<release-dir>/
ssh <host> "cd <release-dir> && sha256sum --check SHA256SUMS"
ssh <host> "cd <release-dir> && sudo -n docker load -i open-launch-runner.oci.tar"
```

Verify the digest matches `release-manifest.json`'s `imageDigest`, tag it with
the full commit, and confirm the labels before going further:

```bash
sudo -n docker tag <digest> open-launch:<full commit>
sudo -n docker image inspect open-launch:<full commit> --format \
  'revision={{ index .Config.Labels "org.opencontainers.image.revision" }}
build-input={{ index .Config.Labels "ee.aat.open-launch.build-input-sha256" }}
platform={{.Os}}/{{.Architecture}} user={{.Config.User}}'
```

`revision` must equal the release commit, `build-input` must equal
`buildMetadata.buildInputSha256`, and `platform` must be `linux/amd64`.

## The Compose contract

Each release gets its own `compose.<name>.yml` in the project root
(`/home/ecs-user/aat-ee-production-…/app/project`); the deploy plan references
it by filename, and nothing generates it automatically. It is not tracked by
git — the project directory is a delivered checkout, not a repository.

Derive it mechanically from the contract currently in use, changing only what
the release needs:

```bash
sudo -n sed 's|image: open-launch:<old>|image: open-launch:<new>|' \
  compose.<current>.yml | sudo -n tee compose.<new>.yml >/dev/null
sudo -n chown ecs-user:ecs-user compose.<new>.yml
sudo -n chmod 640 compose.<new>.yml
```

**Validate it before it reaches a plan.** A hand-edited contract that is one
indentation level off is invalid YAML, and Compose rejects it at parse time
with `controlled command exited non-zero` — which reads like a runtime failure
even though nothing was deployed:

```bash
cd <project root>
sudo -n docker compose --file compose.<new>.yml --project-name aat-ee config --quiet
```

Exit 0 means the file parses. Run the same check against the contract you would
roll back to, so the rollback path is known-good too.

## Recovering a failed execution

A failed execution leaves a journal. Inspect it, then resume rather than
re-running the plan — the resume repeats only the operations that did not
succeed:

```bash
opsctl deploy-journal-inspect <journal-id> --json
opsctl deploy-resume <plan> --journal <journal-id> --dry-run --json   # shows can_resume + next_operations
opsctl request-deploy-resume <plan> --journal <journal-id> --reason '<why>'
opsctl approve <approval-id>
opsctl deploy-resume <plan> --journal <journal-id> --execute \
  --approval-token 'deploy-resume:<plan-id>:<journal-id>' --json
```

The resume approval is a **separate scope**
(`deploy_resume.<journal-id>`) from the execution approval, and its token comes
from `deploy-resume --dry-run`'s `resume_approval_token`.

Two failure modes seen in practice, both benign if handled this way:

- **Health check ran too early.** `PostDeployHealthCheck` samples the container
  immediately; if the Docker healthcheck is still in its start period it
  reports `health=starting` and fails the journal, then stops before
  `WriteRegistry`. The service is fine. Raise
  `changes.health.stabilization_seconds` in the plan (30 is enough for the
  current image) and resume.
- **Contract rejected by Compose.** Nothing was deployed; the container was
  never recreated. Fix and re-validate the contract, then resume.

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

- [2026-09-12 hero r38 — new copy, history, brand marquee](./deployments/2026-09-12-hero-r38-deployment.md)
- [2026-09-12 logo wall r37 — hero logos by measured quality](./deployments/2026-09-12-logo-wall-r37-deployment.md)
- [2026-09-11 winner fix r36 — completing the token migration](./deployments/2026-09-11-winner-fix-r36-deployment.md)
- [2026-09-11 pages r35 — visual unification](./deployments/2026-09-11-pages-r35-deployment.md)
- [2026-09-11 site r34 — leaderboards, free tools, accessibility](./deployments/2026-09-11-site-r34-deployment.md)
- [2026-09-11 home v2 r33b — enabling the redesigned home](./deployments/2026-09-11-home-v2-r33b-deployment.md)
- [2026-09-11 home v2 r33 — app-only deploy](./deployments/2026-09-11-home-v2-r33-deployment.md)
- [2026-09-04 log remediation r32](./deployments/2026-09-04-log-remediation-r32.md) (reconstructed)
- [2026-09-04 AIEO badge r31](./deployments/2026-09-04-aieo-badge-r31.md) (reconstructed)
- [Frontend redesign decision record](./frontend-redesign-uneed-style.md)
- [Dependency override register](./dependency-overrides.md)
- [2026-08-30 review remediation r30](./deployments/2026-08-30-review-remediation-r30.md)
- [2026-08-09 payment reconciliation r28/r29](./deployments/2026-08-09-payment-reconciliation-r28-r29.md)
- [2026-08-04 directory DR refresh](./deployments/2026-08-04-directory-dr-refresh.md)
- [2026-07-26 cron, SEO, upload, and production hardening](./deployments/2026-07-26-cron-seo-hardening.md)
- [Production runtime checklist](./production-runtime.md)
- [Database backup design](../BACKUP.md)
- `opsctl` contributor and safety rules:
  `/home/ivmm/tools/deploy-tools/AGENTS.md`

r31 and r32 were deployed on 2026-09-04 without records being written. They
were reconstructed on 2026-09-11 from their journals plus the image labels still
on the host; the reconstruction is marked as such, and the fields the journals
do not carry (CI run, OCI archive digest, SBOM, backups, post-deploy checks) are
listed as unavailable rather than inferred.
