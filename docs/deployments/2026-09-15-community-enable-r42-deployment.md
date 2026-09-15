# Community enablement r42 deployment

Deployed 2026-09-15. This operational release opens the already-deployed,
English-only Community forum after r41 intentionally kept its feature gate
closed.

## Change scope

- release commit and both immutable images remain
  `c7b46ad73d45efa1985a306386a998af2f706f00`
- `compose.community-enable-r42.yml` was mechanically derived from
  `compose.community-r41.yml`
- its only functional difference is `COMMUNITY_ENABLED: "1"` in the
  `aat-ee-app` environment block
- the raw production environment file, database schema, image references,
  ports, Caddy routes, volumes, and destructive operations were unchanged

## Deployment evidence

- plan: `deploy_aat-ee-community-enable-r42-20260915`
- candidate and r41 rollback contracts both passed `docker compose config --quiet`
- disabled-state baseline canary passed against `https://www.aat.ee` before the
  change, proving the observed 404 was the intentional feature-gate behavior
- plan preflight passed with no warnings or blockers
- before-deploy backup: `backup-aat-ee-restic-20260915150933`, successful
- before-deploy repository check:
  `check-restic-idrive-e2-20260915151116`, successful
- approval: `appr_aat-ee-community-enable-r42-20260915_1789485142836539275`,
  scope `deploy_execution`, approved through the deployment conversation record
- snapshot: `snap_aat-ee-community-enable-r42-20260915_1789485098468046759`;
  verification passed 7/7 artifacts with no limitations, and registry archive
  inspection reported `safe`
- dry run was ready with six typed operations before execution
- journal:
  `deploy-deploy_aat-ee-community-enable-r42-20260915-20260915151248`
- execution: **6/6 operations successful**, no failures, and registry state was
  updated
- Compose reported prior orphan-container advisories; no `--remove-orphans` or
  automatic cleanup was used during this release
- post-deploy backup: `backup-aat-ee-restic-20260915151409`, successful, with
  `opsctl-backup-run@aat-ee.service` returning `Result=success` /
  `ExecMainStatus=0`
- post-deploy repository check:
  `check-restic-idrive-e2-20260915151554`, successful without limitations

## Verification

- `aat-ee-app` is running and healthy with `COMMUNITY_ENABLED=1`; the matching
  one-shot migration service exited with code 0 and the internal health endpoint
  returned HTTP 200
- enabled Community canary passed against `https://www.aat.ee`: canonical and
  filtered public feeds returned HTTP 200, the English document/navigation
  contract held, and locale bridge behavior was correct
- the enabled canary observed an initial TTFB of 1200 ms and a three-sample warm
  median TTFB of 367 ms; no unverified production timing limit was imposed
- direct public checks confirmed the home navigation and sitemap include
  Community, and `/community` returns HTTP 200
- controller status, deployment gates, backup history, and snapshot coverage are
  ready with zero doctor errors or warnings; application logs since deployment
  contained zero `error`, `exception`, or `fatal` keyword matches

## Follow-up and rollback

The release gate performs only anonymous, read-only browser requests. A staff
member should still exercise an authenticated verified write, moderation flow,
and flag-off rollback in the normal operational review.

For an immediate feature rollback, redeploy the reviewed
`compose.community-r41.yml` contract so `COMMUNITY_ENABLED` is absent again.
The Community schema remains intact. Use the r42 snapshot restore workflow only
when a full release-state rollback is required.
