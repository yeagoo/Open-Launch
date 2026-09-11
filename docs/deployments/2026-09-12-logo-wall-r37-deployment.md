# Logo wall r37 deployment — choosing hero logos by measured quality

Deployed 2026-09-12. Application-only update. Fourth release prepared against the
corrected [deployment runbook](../production-deployment-runbook.md) and the
fourth to complete on the initial execution.

## What shipped

Commit `8297c35851dbba3bbed1b4c011f59f9fa6e5381a`.

The home hero's launch wall now chooses its logos by measured quality instead of
by recency alone.

The wall only reads as deliberate texture if the marks in it behave the same
way. Two kinds of asset break that, and both were present in production:

- a logo exported as a **full-bleed coloured square** paints its own tile, so a
  wall of them is a patchwork of pastel blocks rather than a wall of products;
- a **wordmark** letterboxes in a square cell and turns to noise at 40px.

Neither is knowable from `logo_url`, and `project` has no metadata columns, so
`scripts/audit-logo-wall.ts` measures the assets themselves — alpha channel,
corner transparency, the ink bounding box (a wordmark's ink is a wide bar even
on a square canvas), canvas ratio and raster size — and writes
`lib/logo-wall-quality.json`. `bun run logos:audit` regenerates it.

Measured across the catalogue: **9 of 50 production logos qualify**. The wall now
draws from the whole catalogue rather than this month's launches, because the
recent set alone held only five of them and the wall repeated five marks across
twenty-four tiles. A new cached query, `getWallLogoCandidates`, returns `id` and
`logoUrl` for committed launches, capped at 400 rows, and the page ranks them
from the manifest.

Unrated logos are not preferred but do not vanish: when fewer than eight
qualify, the wall falls back to the recent set, which keeps a fresh local
fixture — whose logos are generated, and therefore unrated — from rendering an
empty hero.

## Source and artifact evidence

- release commit: `8297c35851dbba3bbed1b4c011f59f9fa6e5381a`
- CI run on it: success (checks, release gates, runner smoke)
- release manifest: `releasable: true`, `sourceDirty: false`, `sourceOnMain: true`,
  platform `linux/amd64`
- application image: `open-launch:8297c35851dbba3bbed1b4c011f59f9fa6e5381a`
- image digest:
  `sha256:ad62ba349852a36295a9808b1f8acf1bee566eaf3a5e5926e7c5fb5066e857c6`
- build-input SHA-256:
  `95aba1cf1e12143a6dde1e8211651e03a19f8b17922b6cc81b427285c3c6bd2b`
- OCI archive SHA-256:
  `1b5d3c86ced18f74140758d86847f93554361e8f8abf03c4eddfbf70c05e244f`
- artifact smoke, before delivery: passed
- host `sha256sum --check SHA256SUMS`: 5/5 OK; loaded ID matches the manifest
  digest and the tag's revision label

## Deployment evidence

- plan: `deploy_aat-ee-logo-wall-r37-20260912`
- Compose contract: `compose.logo-wall-r37.yml`, derived mechanically from
  `compose.winner-fix-r36.yml`; the diff is the image reference and nothing else
- contract validation: `docker compose config --quiet` exit 0 for both contracts
- approval: `appr_aat-ee-logo-wall-r37-20260912_1789146108011548397`, scope
  `deploy_execution`, approved by `ivmm-via-chat`
- snapshot: `snap_aat-ee-logo-wall-r37-20260912_1789146094294487436` (verify `ok`)
- journal: `deploy-deploy_aat-ee-logo-wall-r37-20260912-20260911170542`
- execution: **6/6 operations successful, no failures, `registry_updated: true`,
  no resume required**
- before- and after-deploy backups: `Result=success`, `ExecMainStatus=0`
- repository check: `restic-idrive-e2` → `success`; snapshot coverage `ready`
- doctor after deploy: 0 errors, 0 warnings

## Verification

- container: `open-launch:8297c358…`, `running`/`healthy`, restart count 0
- the hero wall renders **9 unique logos, all 9 rated as floating marks** —
  checked against the deployed HTML, not inferred from the source
- `/`, `/winners`, `/trending`, `/leaderboard`, `/tools` and `/zh` return 200
- structured smoke against production: 122/122 checks passed (en, zh)
- application logs since the deploy: zero error or exception lines

Before and after captures of the hero are in
[`docs/assets/`](../assets/) — `logo-wall-before.png` shows the pastel patchwork
this replaces.

## Known limits, and they are in the filter rather than hidden

- Corner transparency does **not** exclude a rounded-square logo that nearly
  fills its canvas; such a mark still paints a coloured tile.
- A _stacked_ wordmark has a square ink bounding box, so the ink test does not
  catch it and it still reaches the wall.

Tightening the threshold to exclude both leaves five qualifying marks, which
makes the wall more repetitive, not better. **The durable fix is the source
assets, not the filter** — a submission guideline asking for square, transparent,
icon-style logos. That is a product decision and is not part of this release.

## Rollback

Recreate `aat-ee-app` from `compose.winner-fix-r36.yml`, validated alongside this
contract.
