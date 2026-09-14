# Performance and comment integrity r40 deployment

Deployed 2026-09-14. This release improves the data paths used by discovery and
search pages, makes comment and project state transitions safe under concurrent
requests, and corrects the default-locale language switch.

## What shipped

Commit `2e3bafd6d5f72312541736bd5fe5f9c3693fe252` delivers:

- direct default-locale routing from the language selector instead of leaving a
  user on the current locale
- narrower discovery and search queries, with shared search-result caching and
  no unnecessary list relation expansion
- batched comment storage, cursor pagination, correct reaction aggregates, and
  guarded comment moderation and reaction transitions
- project edit-state guards and related admin cache invalidation
- database migration `0062_comment_tombstone_guard.sql`, which prevents a
  hidden comment from being modified after tombstoning

## Source and artifact evidence

- release commit: `2e3bafd6d5f72312541736bd5fe5f9c3693fe252`
- CI: [run 34800867938](https://github.com/yeagoo/Open-Launch/actions/runs/34800867938)
  passed on the exact commit
- local release checks: lint, TypeScript and strict-index checks, repository
  contracts, 105 test files (458 passed; 9 skipped), production build, release
  database migration validation, route-performance checks, and immutable-runner
  smoke all passed
- application and migration manifests: `releasable: true`, `sourceDirty: false`,
  `sourceOnMain: true`, platform `linux/amd64`
- application image: `open-launch:2e3bafd6d5f72312541736bd5fe5f9c3693fe252`
  with digest
  `sha256:21b84713e5f2ef6a4f343ec736169f05974c3c2f5f3aa8de4945f4c3d85a6512`
- migration image: `open-launch-migrator:2e3bafd6d5f72312541736bd5fe5f9c3693fe252`
  with digest
  `sha256:d74be0c9e6bc811b3b11024a8b59621cb0bd2986d324c6a967d6f4004ac56807`
- shared build-input SHA-256:
  `35150c60839a4107cebff8c6c1dd671c644c1b5efc0ef56b85ece8a36b85f129`
- application OCI archive SHA-256:
  `1b4a60accd8e7578f0cc7ac3b3073cbed50b42bf1a8c110f6e9723f48541b738`
- migration OCI archive SHA-256:
  `68e412f01d7d213b94b33b790c6a0b19606707464e8b6dc3e66f9d23a0650570`
- both remote checksum manifests verified 5/5 files; loaded image labels matched
  the release commit and shared build input

## Deployment evidence

- plan: `deploy_aat-ee-performance-comment-r40-20260914`
- Compose contract: `compose.performance-comment-r40.yml`, mechanically derived
  from `compose.blog-covers-r39.yml`; it changes the immutable application image
  and adds a non-root, read-only one-shot migration service. The application
  starts only after that service exits successfully.
- both the previous and candidate contracts passed `docker compose config --quiet`
- controller registry validation and doctor completed without errors; the typed
  plan preflight passed with no warnings or blockers
- before-deploy backup: `backup-aat-ee-restic-20260914033603`, successful
- before-deploy repository check:
  `check-restic-idrive-e2-20260914033749`, successful
- approval: `appr_aat-ee-performance-comment-r40-20260914_1789358134886934423`,
  scope `deploy_execution`, approved by `ivmm-via-chat`
- snapshot: `snap_aat-ee-performance-comment-r40-20260914_1789358041074578526`;
  verification passed 7/7 artifacts with no limitations, and its registry
  archive inspection reported `safe`
- dry run was ready with six typed operations before execution
- journal:
  `deploy-deploy_aat-ee-performance-comment-r40-20260914-20260914035644`
- execution: **6/6 operations successful**, no failures, and
  `registry_updated: true`; no resume was required
- post-deploy backup: `backup-aat-ee-restic-20260914040011`, successful;
  `opsctl-backup-run@aat-ee.service` returned `Result=success` /
  `ExecMainStatus=0`
- post-deploy repository check:
  `check-restic-idrive-e2-20260914040157`, successful without limitations

## Verification

- `aat-ee-app` serves the release commit, is `running` and `healthy`, has restart
  count 0, and retains a read-only root filesystem
- the migration container carries the same release commit and exited with code 0
- the deploy journal is successful; controller status and deployment gates are
  ready; the internal health endpoint returned HTTP 200
- public `/`, all four locale entry points, the primary sitemap and every
  expected sitemap shard returned HTTP 200
- legacy sitemap routes returned the exact HTTP 308 canonical redirect; invalid
  shard paths returned HTTP 404
- the Serena project page returned one server-rendered three-item
  `BreadcrumbList` (`Avaleht`, `Projektid`, `Serena`) without duplicate breadcrumb
  Microdata
- unauthenticated requests to the three cron endpoints and the upload endpoint
  returned HTTP 401
- application logs since the deployment contained zero error, exception, or
  fatal keyword lines

## Rollback

Do not perform an image-only rollback. This release installs the comment
tombstone trigger, so a rollback requires the reviewed `opsctl` snapshot restore
workflow for
`snap_aat-ee-performance-comment-r40-20260914_1789358041074578526` before
returning to the r39 application contract.
