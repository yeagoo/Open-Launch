# Pages r35 deployment — visual unification of the last five pages

Deployed 2026-09-11. Application-only update, second release prepared against
the corrected [deployment runbook](../production-deployment-runbook.md), and the
second to complete on the initial execution.

## What shipped

Commit `c4c478e8c8dedb62acbf44b24560f0a9ca9dfd8c`.

`/winners`, `/blog` (listing and article), `/search`, `/friends` and `/badge`
moved from Inter headings and the legacy `bg-card border-border rounded-xl`
surfaces onto the design system's atoms and the `--home-*` token layer. The
sidebar section labels on those pages and on `/categories` and `/tags` now use
the same eyebrow-scale `SerifHeading` as the home page's right rail.

`/winners` also lost the last literal colours in the application —
`bg-white`, `border-zinc-100`, `dark:bg-secondary/10` and a hand-written
box-shadow across three surfaces — which meant those surfaces did not respond to
dark mode or to the palette switch at all.

## Source and artifact evidence

- release commit: `c4c478e8c8dedb62acbf44b24560f0a9ca9dfd8c`
- CI run: `34588791755` — success (checks, release gates, runner smoke)
- release manifest: `releasable: true`, `sourceDirty: false`, `sourceOnMain: true`,
  `validationOnly: false`, platform `linux/amd64`
- application image: `open-launch:c4c478e8c8dedb62acbf44b24560f0a9ca9dfd8c`
- image digest:
  `sha256:bc33d982e375cb33a7ee4faa5c38227cfb8c92e74010e866248d7ea23d988e27`
- build-input SHA-256:
  `de40a75eb64342bea96d95ec6d233787951bfede2befefededb9c2a13ce59b99`
- OCI archive SHA-256:
  `28beabf3483f20f2011d7498888284d37253c64fe9ac7bf49a9a4908f568f179`
- artifact smoke, before delivery: passed
- host `sha256sum --check SHA256SUMS`: 5/5 OK; `docker load` reported the same
  ID as the manifest digest, and the tag's revision label matched the commit

## Deployment evidence

- plan: `deploy_aat-ee-pages-r35-20260911`
- Compose contract: `compose.site-r35.yml`, derived mechanically from
  `compose.site-r34.yml`; the diff is the image reference and nothing else
- contract validation: `docker compose config --quiet` exit 0 for both the new
  contract and the rollback contract
- approval: `appr_aat-ee-pages-r35-20260911_1789124229518953621`, scope
  `deploy_execution`, approved by `ivmm-via-chat`
- snapshot: `snap_aat-ee-pages-r35-20260911_1789124209962637967` (verify `ok`)
- journal: `deploy-deploy_aat-ee-pages-r35-20260911-20260911105813`
- execution: **6/6 operations successful, no failures, `registry_updated: true`,
  no resume required**
- before-deploy backup: `Result=success`, `ExecMainStatus=0`
- after-deploy backup: `Result=success`, `ExecMainStatus=0`
- repository check: `restic-idrive-e2` → `ok: true`, status `success`
- doctor after deploy: 0 errors, 0 warnings

## Verification

- container: `open-launch:c4c478e…`, `running`/`healthy`, restart count 0
- the five pages and the previously shipped routes all return 200
- `font-editorial` is present in the served HTML for all five pages, confirming
  the serif conversion is live
- accessibility remained 100 on all five pages plus the blog article

## Known gap, fixed immediately after

`/winners` renders its cards through `components/winners/winner-card.tsx`, which
this release did not convert — so the page shipped with its main content still on
the legacy palette. Measured on production after the deploy: the live cards
carried `border-zinc-100` six times and `bg-white` three times, with no dark
variant on the latter.

It was not visible in review because the local fixture's `scheduled_launch_date`
values sit eight hours later than production's for the same launch day, which
placed them outside the winners window: `/winners` rendered its empty state
locally and the card never appeared. Fixed in `b91f8c8` and released as r36;
verification afterwards used `open_launch_prodsample`, which carries production's
timestamps.

## Rollback

Recreate `aat-ee-app` from `compose.site-r34.yml`, still on the host and
validated alongside this contract.
