# Blog covers r39 deployment — editorial image library and publication safeguards

Deployed 2026-09-13. This release adds the blog's first consistent editorial
image library, publishes the associated bilingual content updates, and includes
the operational safeguards used to synchronize and verify that data.

## What shipped

Commit `b2b552fec97cb09bd0fb5dab6aa267a31652f240` delivers:

- 30 generated 1600 × 900 WebP editorial covers in
  `public/images/blog-covers/`
- cover assignments for all 13 published blog articles
- five updated English guides and their five Chinese translations: Product Hunt
  alternatives, post-launch recovery, directory submission tracking, GEO with
  Search Console, and AI crawler controls
- production-only sync and verification scripts that update image fields without
  changing publication timestamps and fail when a published article lacks a
  cover or a Chinese translation is older than its English source
- the reviewed documentation, dependency, logging, and repository-contract
  cleanup included in the release commit

The production data sequence completed before the container switch. Its final
verification found 13 published rows with covers and no stale Chinese
translations.

## Source and artifact evidence

- release commit: `b2b552fec97cb09bd0fb5dab6aa267a31652f240`
- CI: [run 34711636338](https://github.com/yeagoo/Open-Launch/actions/runs/34711636338)
  passed Bun checks, browser/database/performance release gates, and the
  immutable-runner HTTP smoke
- local release checks: frozen install, audit, repository contracts, lint,
  TypeScript, strict-index typecheck, 97 test files (440 tests passed; 9 skipped),
  and production build all passed
- release manifest: `releasable: true`, `sourceDirty: false`, `sourceOnMain: true`,
  platform `linux/amd64`
- application image: `open-launch:b2b552fec97cb09bd0fb5dab6aa267a31652f240`
- image digest:
  `sha256:105fc6941a643ce479bf3dc9a4cb462daeec936845109039134e89fbc56cd4df`
- build-input SHA-256:
  `3f5d17e97e339c2c3e418a25428be49b37836274bdbcf2be2b9f1549203667de`
- OCI archive SHA-256:
  `4c888cda7329149c955c28567562cd1c8235b306763f741510e73cd5e8b0d7b4`
- local immutable-runner smoke passed; on the host, `SHA256SUMS` verified 5/5
  artifacts and the loaded image ID and labels matched the manifest

## Deployment evidence

- plan: `deploy_aat-ee-blog-covers-r39-20260913`
- Compose contract: `compose.blog-covers-r39.yml`, mechanically derived from
  `compose.hero-r38.yml`; the contract diff changes only the immutable image
  reference
- both new and rollback contracts passed `docker compose config --quiet`
- before-deploy repository check:
  `check-restic-idrive-e2-20260912184916`, successful
- approval: `appr_aat-ee-blog-covers-r39-20260913_1789239115005140960`, scope
  `deploy_execution`, approved by `ivmm-via-chat`
- snapshot: `snap_aat-ee-blog-covers-r39-20260913_1789239042907101265`; its
  verification passed 7/7 artifacts with no limitations
- journal:
  `deploy-deploy_aat-ee-blog-covers-r39-20260913-20260912185455`
- execution: **6/6 operations successful**, with no failures, skips, or
  limitations; no resume was required. The registry write had no application
  registry delta (`registry updated=false`).
- before- and after-deploy backups: `opsctl-backup-run@aat-ee.service` returned
  `Result=success` and `ExecMainStatus=0`
- after-deploy backup record:
  `backup-aat-ee-restic-20260912185825`, successful
- after-deploy repository check:
  `check-restic-idrive-e2-20260912190022`, successful

## Verification

- serving container image and ID match the release manifest; `aat-ee-app` is
  `running` and `healthy` with restart count 0
- `opsctl status` reports 0 doctor errors and 0 doctor warnings; deployment,
  backup, and snapshot gates are all ready
- `/`, `/blog`, the English and Chinese Product Hunt alternatives articles, and
  `/sitemap.xml` each returned HTTP 200 from production
- all 13 assigned cover paths returned HTTP 200 with `image/webp`; the public
  blog listing contains the expected cover markup
- unauthenticated production requests to the cron endpoint and upload endpoint
  each returned HTTP 401
- the post-deploy production data verifier again confirmed every published
  article has a cover and no Chinese translation is older than its English
  source

## Rollback

The application image can be returned to `compose.hero-r38.yml`, which remains
on the host. A complete r39 rollback also needs the pre-deploy snapshot above:
the database now references the generated cover paths and includes the five
content revisions, while the r38 image does not contain those static assets.
Use the reviewed snapshot restore workflow in the production runbook before
switching the old application contract; do not perform an image-only rollback
against the updated database.
