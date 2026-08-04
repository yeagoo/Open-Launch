# 2026-08-04 directory DR refresh deployment

## Outcome

Production now serves Open Launch commit
`0cdf4b1c8265253e568748e96bea97ebb282f653`. The homepage renders the canonical
`aat.ee` directory value as `DR 47` (checked on 2026-08-04), no longer renders
`DR 34`, and includes the visible linked attribution `Domain Rating by Ahrefs`.

This was an application-only deployment. No database migration ran. Cron stays
in Shadow mode with an empty Canary task path, the embedded Ledger worker stays
disabled, no independent worker was enabled, and the payment email outbox
stays disabled.

## Source and artifact evidence

- canonical directory source commit:
  `9abf28985a0db991a0c5f425e6a7e2ff733af6f2`
- deployed Open Launch commit:
  `0cdf4b1c8265253e568748e96bea97ebb282f653`
- clean CI run: `30899464479`, successful
- platform: `linux/amd64`
- image digest:
  `sha256:430ae1e5f62ec6a73bef6898ef0210ab50e8d0e7753df08ebc5443934ecc5f79`
- build-input SHA-256:
  `c8b25928eb0c4959b9a9c997890a26f6a19e4c364c196e88e078becf83896621`
- release manifest: `releasable=true`, clean source, ancestor of `origin/main`
- artifact checks: build metadata, OCI archive, provenance, release manifest,
  and SPDX SBOM all passed SHA-256 verification locally and on the production
  host
- image smoke: all 60 migrations applied to disposable PostgreSQL, followed by
  successful health, page, sitemap, authorization-boundary, and static-asset
  checks

The production Server Actions key was read through a mode-`0600` temporary
file, passed to BuildKit as a secret, and its temporary copy was deleted after
the build. No credential value was printed or stored in this repository.

## Deployment evidence

- before-deploy backup: `backup-aat-ee-restic-20260804105303`, successful
- before-deploy repository check:
  `check-restic-idrive-e2-20260804105435`, successful
- plan: `deploy_aat-ee-directory-dr-r27-20260804`
- snapshot:
  `snap_aat-ee-directory-dr-r27-20260804_1785841007595649070`
- snapshot verification: 7/7 artifacts verified, no limitations
- approval:
  `appr_aat-ee-directory-dr-r27-20260804_1785842025459338567`, approved after
  explicit user authorization of the exact plan and snapshot
- journal:
  `deploy-deploy_aat-ee-directory-dr-r27-20260804-20260804111400`
- execution: 6/6 operations successful; registry operation succeeded with
  `registry updated=false` because this app-only plan had no registry delta
- post-deploy backup: `backup-aat-ee-restic-20260804111743`, successful
- post-deploy repository check:
  `check-restic-idrive-e2-20260804111921`, successful

The serving contract is `compose.directory-dr-r27.yml`, and the deployment
marker is `20260804-directory-dr-r27`.

## Post-deploy verification

- `aat-ee-app`: running, healthy, restart count 0
- runtime: Node `v24.18.0`, Linux `x64`, Sharp `0.35.3`, libvips `8.18.3`
- image revision and `DEPLOYMENT_VERSION` both match the deployed commit
- root filesystem remains read-only; the bounded cache and `/tmp` tmpfs mounts
  remain active
- `/api/health`: HTTP 200 with `status=ok`
- homepage: HTTP 200, Cloudflare status `DYNAMIC`, visible `aat.ee` card is
  exactly `DR 47`, `DR 34` is absent, and the Ahrefs attribution link is present
- `/zh`, `/es`, and `/et`: HTTP 200
- sitemap index and all required shards: HTTP 200, valid XML content type
- legacy projects/users/tags sitemap routes: HTTP 308 to the public canonical
  `https://www.aat.ee/sitemap.xml`
- unauthenticated Cron dispatcher/task routes and `POST /api/upload`: HTTP 401
- Serena: one three-item Estonian `BreadcrumbList`, no duplicate breadcrumb
  Microdata; OG image returned HTTP 200 as PNG
- deployment-window application logs: zero structured errors, zero non-zero
  Cron failure counts, and zero unhandled/fatal events
- `opsctl status`: 0 doctor errors, 0 doctor warnings; deployment, backup, and
  snapshot gates all ready

The only runtime warning was Node's two-line `DecompressInterceptor`
experimental API notice. It is not an application error and did not affect the
successful Cron dispatches or public checks.
