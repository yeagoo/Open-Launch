# Site tools r34 deployment — leaderboards, free tools, accessibility

Deployed 2026-09-11. Application-only update; the first release prepared against
the corrected [deployment runbook](../production-deployment-runbook.md), and the
first to complete on the initial execution since r30.

## What shipped

Commit `6e58365d330ac3cafafa8b5290946871e6605811`.

- **`/leaderboard`** with weekly, monthly and yearly periods. The yearly board
  had no entry point anywhere on the site before this release.
- **`/tools`** — a hub plus a launch-day checklist and a social meta tag
  generator, both running entirely in the browser. English-only by design, like
  `/compare` and `/alternatives`.
- **Accessibility** — eleven audited pages brought to a score of 100: the home
  page and blog from 93 and 96, search, badge and reviews from 98, plus fixes
  that applied site-wide (the footer's four `<h3>` column labels became `<h2>`,
  which every page with an `<h1>` and no `<h2>` needed).
- **Environment cleanup** — the three `PLAUSIBLE_*` variables were removed from
  the registered production environment file. Plausible was replaced in
  `446d3b1` and no code has read those variables since; they only leave a
  container when it is recreated, which this release did.
- **Documentation** — the deployment runbook's sequence was made executable, and
  the missing r31/r32 records were reconstructed from their journals.

## Source and artifact evidence

- release commit: `6e58365d330ac3cafafa8b5290946871e6605811`
- CI run: `34583184712` — success (checks, release gates, runner smoke)
- release manifest: `releasable: true`, `sourceDirty: false`, `sourceOnMain: true`,
  `validationOnly: false`, platform `linux/amd64`
- application image: `open-launch:6e58365d330ac3cafafa8b5290946871e6605811`
- image digest:
  `sha256:ed886a2374a545383544e1ea44dbefaf4c2a3b161f465cbb30fe35bad2774ec5`
- build-input SHA-256:
  `835e72077e963c92b274b76747312b2a45d508216067db468e45050dfe2212e8`
- OCI archive SHA-256:
  `6899d106a9ef9fbf3d95ef370f3d65f9f1dcc92de259e2772176ab755c9d1156`
- SBOM: SPDX-2.3
- artifact smoke, before delivery: passed (health, pages, sitemap, auth
  boundary, static asset)
- host `sha256sum --check SHA256SUMS`: 5/5 OK, and `docker load` reported the
  same ID as the manifest digest

## Deployment evidence

- plan: `deploy_aat-ee-site-r34-20260911`
- Compose contract: `compose.site-r34.yml` — differs from
  `compose.home-v2-r33b.yml` by the image reference and nothing else; all 12
  environment entries identical, `HOME_V2` still `1`
- contract validation: `docker compose config --quiet` exit 0 for both the new
  contract and the rollback contract
- approval: `appr_aat-ee-site-r34-20260911_1789120427382760215`, scope
  `deploy_execution`, approved by `ivmm-via-chat`
- snapshot: `snap_aat-ee-site-r34-20260911_1789120379477495521` (verify `ok`)
- journal: `deploy-deploy_aat-ee-site-r34-20260911-20260911100311`
- execution: **6/6 operations successful, no failures, `registry_updated: true`,
  no resume required**
- before-deploy backup: `opsctl-backup-run@aat-ee.service` →
  `Result=success`, `ExecMainStatus=0`
- after-deploy backup: same unit → `Result=success`, `ExecMainStatus=0`
- repository check: `restic-idrive-e2` → `ok: true`, status `success`
- snapshot coverage: `ready`
- doctor after deploy: 0 errors, 0 warnings

## Verification

- container: `open-launch:6e58365…`, `running`/`healthy`, restart count 0,
  `HOME_V2=1`
- `printenv | grep -c '^PLAUSIBLE_'` inside the container: **0** (was 3)
- public routes 200: `/`, `/leaderboard` (all three periods), `/tools`,
  `/tools/launch-checklist`, `/tools/meta-tags`, `/trending`, `/winners`, `/zh`
- `/tools` is English-only as intended; `/leaderboard` is localised, so
  `/zh/leaderboard` serves the translated board while `/zh/tools` 404s — the
  same split as `/compare`
- `/leaderboard?period=year` renders `Best of the Year` with an `ItemList`
  schema block and exactly one `<main>`
- hreflang alternates and canonical present, identical in shape to `/trending`
- Accept-Language negotiation intact: `/leaderboard` redirects `307` to
  `/zh/leaderboard` for a Chinese-language client, matching `/trending`
- sitemap contains `/leaderboard` for every locale
- structured smoke against production: 144/144 checks passed across en, zh, ja
- application logs since the deploy: zero error or exception lines

## Rollback

Recreate `aat-ee-app` from `compose.home-v2-r33b.yml`. That contract is still on
the host and was validated alongside the new one. It restores the previous image
and, because the environment file change is not part of the contract, the
container it produces will not carry the `PLAUSIBLE_*` variables either — the
removal is not something a rollback undoes, and does not need to be.
