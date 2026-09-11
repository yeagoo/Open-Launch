# Winner fix r36 deployment — completing the r35 token migration

Deployed 2026-09-11, four hours after r35, to close a gap r35 shipped. Third
release prepared against the corrected
[deployment runbook](../production-deployment-runbook.md) and the third to
complete on the initial execution.

## Why this release exists

r35 converted `/winners`' own markup to the design tokens but not
`components/winners/winner-card.tsx`, the component that renders the page's main
content. Measured on production after r35:

|                            | after r35 | after r36 |
| -------------------------- | --------- | --------- |
| `border-zinc-100`          | 6         | **0**     |
| `bg-white`                 | 3         | **0**     |
| `bg-home-surface` (tokens) | 4         | **7**     |

The `bg-white` had no dark variant, so the winner cards were unreadable in dark
mode — not merely off-palette.

The gap survived r35's review because the local fixture's
`scheduled_launch_date` values sit eight hours later than production's for the
same launch day. That places them outside the winners window, so `/winners`
rendered its empty state locally and the card never appeared. Every
verification of that page had been vacuous.

## What shipped

Commit `8410435de8cc3b74725fa4653d4ef9ee06fb22c5`.

- `components/winners/winner-card.tsx` — the card and its footer rule now use
  the `--home-*` tokens.
- `app/[locale]/trending/page.tsx` — a skeleton surface and an aside panel
  carrying the same literals.

Deliberately still literal, after checking each: the two badge preview swatches
on `/badge` (`bg-white` for "Light Mode", `bg-slate-900` for "Dark Mode"), and
the paired `bg-white dark:bg-zinc-800` logo tiles in the dashboard, which do
respond to dark mode.

## Source and artifact evidence

- release commit: `8410435de8cc3b74725fa4653d4ef9ee06fb22c5`
- CI runs: `b91f8c85` and `8410435d` — both success
- release manifest: `releasable: true`, `sourceDirty: false`, `sourceOnMain: true`,
  platform `linux/amd64`
- application image: `open-launch:8410435de8cc3b74725fa4653d4ef9ee06fb22c5`
- image digest:
  `sha256:1957ef459f84b7ed1b815f7e0b7b191fd859725bd3945ecbaceb0a16d9f55907`
- build-input SHA-256:
  `837801679441484d7d7202f0562b83077d6a5929e527f92bdc5064ede9156ce6`
- OCI archive SHA-256:
  `82b1322615bc2179e3b3013292e2e3f8488740a8c899e382f5998d02dfee75a4`
- artifact smoke, before delivery: passed
- host `sha256sum --check SHA256SUMS`: 5/5 OK; loaded ID matches the manifest
  digest and the tag's revision label

## Deployment evidence

- plan: `deploy_aat-ee-winner-fix-r36-20260911`
- Compose contract: `compose.winner-fix-r36.yml`, derived mechanically from
  `compose.site-r35.yml`; the diff is the image reference and nothing else
- contract validation: `docker compose config --quiet` exit 0 for both contracts
- approval: `appr_aat-ee-winner-fix-r36-20260911_1789140193016821656`, scope
  `deploy_execution`, approved by `ivmm-via-chat`
- snapshot: `snap_aat-ee-winner-fix-r36-20260911_1789140178400177412` (verify `ok`)
- journal: `deploy-deploy_aat-ee-winner-fix-r36-20260911-20260911152435`
- execution: **6/6 operations successful, no failures, `registry_updated: true`,
  no resume required**
- before- and after-deploy backups: `Result=success`, `ExecMainStatus=0`
- repository check: `restic-idrive-e2` → `success`
- doctor after deploy: 0 errors, 0 warnings

## Verification

- container: `open-launch:8410435…`, `running`/`healthy`, restart count 0
- `/`, `/winners`, `/blog`, `/search`, `/friends`, `/badge`, `/trending`,
  `/leaderboard`, `/tools` all return 200
- the winner cards render three real winners and carry zero literal colours
- structured smoke against production: 122/122 checks passed (en, zh)
- application logs since the deploy: zero error or exception lines

## Rollback

Recreate `aat-ee-app` from `compose.site-r35.yml`, validated alongside this
contract. Doing so restores the unreadable-in-dark-mode cards, so it is a
rollback of last resort rather than a preference.
