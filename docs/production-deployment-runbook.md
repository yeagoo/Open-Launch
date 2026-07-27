# aat.ee production deployment runbook

Last verified: 2026-07-26 (Asia/Shanghai)

This is the canonical operator handoff for the current aat.ee production
deployment. It records connection facts and commands, but never credential
values or private-key contents.

## Hosting authority

- aat.ee is **not deployed on Zeabur**.
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

## Current application state

The application artifact currently serving public traffic was built from:

```text
065fe148e34c2540a441025a7f47b0d1ec527d05
```

Current runtime facts:

- application container: `aat-ee-app`
- container status after deployment: running and healthy
- Compose contract:
  `compose.prebuilt.security-cron-seo-r8.yml`
- deployment marker:
  `065fe148e34c2540a441025a7f47b0d1ec527d05-security-cron-seo-r7`
- root filesystem remains read-only
- `/app/.next/cache` is a bounded 256 MiB `tmpfs`, UID/GID `1001`, mode `0750`

The repository's later commit
`cc7162a3b3255f736094e6ec992a2b5a44e0a945` only changed the bounded,
one-shot avatar migration script. That exact script was deployed and completed
through the `r9` operations artifact; it did not require restarting the public
application.

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
6. Create a new, uniquely named typed deploy plan. Run `preflight`, then
   `deploy <plan> --dry-run --json`.
7. Create and verify the required snapshot.
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
https://www.aat.ee/sitemap.xml
https://www.aat.ee/sitemaps/static.xml
https://www.aat.ee/sitemaps/projects.xml
https://www.aat.ee/sitemaps/tags.xml
https://www.aat.ee/sitemaps/editorial.xml
https://www.aat.ee/et/projects/serena
```

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

## Related records

- [2026-07-26 cron, SEO, upload, and production hardening](./deployments/2026-07-26-cron-seo-hardening.md)
- [Production runtime checklist](./production-runtime.md)
- [Database backup design](../BACKUP.md)
- `opsctl` contributor and safety rules:
  `/home/ivmm/tools/deploy-tools/AGENTS.md`
