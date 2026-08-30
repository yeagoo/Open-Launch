# 2026-08-30 review remediation r30

## Outcome

Production now serves Open Launch commit
`5469a0b99f6a64ffca5ce38b0c57537f1994723b`. This release completes the
review-remediation and P2 hardening work, including the database migrations
that add the category lookup index and CSP report storage.

The deployment also closes a release-provenance gap found during the final
review. The previous Dockerfile only exposed a migration target pinned to the
historical `0058` migration. Commit `5469a0b99f6a64ffca5ce38b0c57537f1994723b`
adds a generic, non-root migrator target carrying the same revision and build
input labels as the application artifact. The exact reviewed migrator was used
for this release.

## Source and artifact evidence

- review-remediation commit: `ab2782098bc2db59cecfca8ba4c9a0f8290b19eb`
- final provenance fix and deployed commit:
  `5469a0b99f6a64ffca5ce38b0c57537f1994723b`
- final source CI run: `33319809266`, successful
- immutable runner validation run: `33319833676`, successful
- source state: clean, on `main`, and releasable
- platform: `linux/amd64`
- build-input SHA-256:
  `97f333896bc45103e3d947c208cf3eb7ce6aebf8746fa4ae7b7427e197922d94`
- application image digest:
  `sha256:faa89a1bd8ffdd02f88ae5e0bfa07c479af6c98799e5eec278d00ef9a46e2ad0`
- application OCI archive SHA-256:
  `ffc43e62a9617d16b27907b0344d463af798ac2ab76e92fec61c3409bd128c53`
- migrator OCI archive SHA-256:
  `fddf5e8fa6d768340677e931f59cad5d987d082176effb49e58b450c397a709b`
- build metadata, OCI archives, provenance, release manifest, and SPDX SBOM
  passed local and production-host SHA-256 verification
- the migrator image was verified as user `nextjs`, entrypoint
  `bun run db:migrate`, with the exact deployed revision and build-input labels

Before production use, the exact migrator artifact was tested twice against a
disposable PostgreSQL 18.4 instance: all 62 handwritten migrations applied
from an empty database, and the second run reported no pending migration. The
test also verified the `hicyou_campaign_sync` table and a valid, ready
`project_to_category_category_id_idx` index.

## Deployment evidence

- before-deploy backup: `backup-aat-ee-restic-20260830153849`, successful
- before-deploy repository check:
  `check-restic-idrive-e2-20260830154043`, successful
- Compose contract: `compose.review-remediation-r30.yml`
- plan: `deploy_aat-ee-review-remediation-r30-20260830`
- snapshot:
  `snap_aat-ee-review-remediation-r30-20260830_1788104838864701012`
- snapshot verification: 7/7 artifacts verified, no limitations
- registry archive inspection: 115 safe members, no unsupported entries or
  findings
- execution approval:
  `appr_aat-ee-review-remediation-r30-20260830_1788104936073676381`
- journal:
  `deploy-deploy_aat-ee-review-remediation-r30-20260830-20260830154916`
- journal plan SHA-256:
  `c86de9ca57283ee440e480213d4c30c1bf9b0ebf62f35229fe807655b6c19194`
- execution: 6/6 operations successful, with no failures, skips, or
  limitations
- post-deploy backup: `backup-aat-ee-restic-20260830155212`, successful
- post-deploy repository check:
  `check-restic-idrive-e2-20260830155402`, successful

The release retained existing orphan containers for separate lifecycle review;
the deployment did not use Compose's destructive `--remove-orphans` option.

## Post-deploy verification

- `aat-ee-app`: running, healthy, restart count 0
- serving application image and OCI revision match
  `5469a0b99f6a64ffca5ce38b0c57537f1994723b`
- migration container: exited successfully with code 0 and the exact release
  revision
- production migration ledger: 62 migrations; `0060` and `0061` are present
- `hicyou_campaign_sync` exists
- `project_to_category_category_id_idx` is valid and ready
- recent application logs contained no error-like entries
- `opsctl status`: 0 doctor errors and 0 doctor warnings; deployment, backup,
  and snapshot gates all ready
- homepage, all checked locale pages, sitemap indexes and shards, and the
  Serena project page returned HTTP 200
- legacy sitemap routes returned HTTP 308 to
  `https://www.aat.ee/sitemap.xml`
- unauthenticated Cron and upload requests returned HTTP 401
- Serena SSR output contains one three-level `BreadcrumbList` with the expected
  Estonian labels and positions
- HSTS, `X-Content-Type-Options`, and `X-Frame-Options` are present
- CSP is deliberately emitted as `Content-Security-Policy-Report-Only` with
  reports sent to `/api/csp-report`; both the origin and public Cloudflare path
  preserve the header
