# Community r41 deployment

Deployed 2026-09-15. This release delivers the reviewed Community forum schema
and application code while keeping the public forum closed until a separate
enablement release.

## What shipped

Commit `c7b46ad73d45efa1985a306386a998af2f706f00` delivers the English-only
Community implementation, including:

- Community threads, replies, moderation controls, rate limits, and search
  support behind the `COMMUNITY_ENABLED` feature gate
- database migrations `0063_community_core.sql` and
  `0064_community_search_indexes.sql`
- the established default-closed behavior: this deployment does not set
  `COMMUNITY_ENABLED`, so `/community` remains unavailable to public traffic

## Source and artifact evidence

- release commit: `c7b46ad73d45efa1985a306386a998af2f706f00`
- CI: [run 34955754413](https://github.com/yeagoo/Open-Launch/actions/runs/34955754413)
  passed on the exact commit, including quality, browser/database/performance,
  and immutable-runner checks
- application and migration manifests: `releasable: true`, `sourceDirty: false`,
  `sourceOnMain: true`, platform `linux/amd64`
- application image: `open-launch:c7b46ad73d45efa1985a306386a998af2f706f00`
  with digest
  `sha256:3f38e7a7737754e06839adab3e9eaa785969d6d4d349b49353afbb5097a5cd2d`
- migration image:
  `open-launch-migrator:c7b46ad73d45efa1985a306386a998af2f706f00` with digest
  `sha256:a5cc18f105d9d243a0b7c7ad418b89d5a1eabdb380011f897dacafe31ff59ae0`
- shared build-input SHA-256:
  `87fea1e471bb34b278e3be5ae19d2de5f9750cab2b886b73cc543a4b189c6421`
- remote checksum manifests verified all five application and all five migration
  release artifacts before the images were tagged and used

## Deployment evidence

- plan: `deploy_aat-ee-community-r41-20260915`
- Compose contract: `compose.community-r41.yml`, mechanically derived from
  `compose.performance-comment-r40.yml`; the only changes were the application
  and migration image tags and the migration container name
- both r40 and r41 contracts passed `docker compose config --quiet`
- plan preflight passed with no warnings or blockers
- before-deploy backup: `backup-aat-ee-restic-20260915135602`, successful
- before-deploy repository check:
  `check-restic-idrive-e2-20260915135808`, successful
- approval: `appr_aat-ee-community-r41-20260915_1789482802082400165`, scope
  `deploy_execution`, approved through the deployment conversation record
- snapshot: `snap_aat-ee-community-r41-20260915_1789482738067864139`;
  verification passed 7/7 artifacts with no limitations, and registry archive
  inspection reported `safe`
- dry run was ready with six typed operations before execution
- journal:
  `deploy-deploy_aat-ee-community-r41-20260915-20260915143348`
- execution: **6/6 operations successful**, no failures, and registry state was
  updated
- Compose reported prior orphan-container advisories; no `--remove-orphans` or
  automatic cleanup was used during this release
- post-deploy backup: `backup-aat-ee-restic-20260915143610`, successful, with
  `opsctl-backup-run@aat-ee.service` returning `Result=success` /
  `ExecMainStatus=0`
- post-deploy repository check:
  `check-restic-idrive-e2-20260915143753`, successful without limitations

## Verification

- `aat-ee-app` is running and healthy from the r41 application image; the
  internal health endpoint returned HTTP 200
- `aat-ee-community-migration-r41` exited with code 0 from the matching r41
  migration image; its log reported both Community migrations
- controller status, deployment gates, backup history, and snapshot coverage are
  ready with zero doctor errors or warnings
- public `/`, `www`, `/zh`, `/es`, `/et`, and `/sitemap.xml` returned HTTP 200
- public `/community` returned HTTP 404 and the guest home page had no Community
  navigation, confirming the feature gate remains closed
- application logs since deployment contained zero `error`, `exception`, or
  `fatal` keyword matches

## Rollback

Do not perform an image-only rollback. The Community schema migrations are
persistent, so restore the reviewed `opsctl` snapshot
`snap_aat-ee-community-r41-20260915_1789482738067864139` before returning to
the r40 application contract.
