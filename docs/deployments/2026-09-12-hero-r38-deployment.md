# Hero r38 deployment — new copy, history, and a brand marquee

Deployed 2026-09-12. Application-only update. Fifth release prepared against the
corrected [deployment runbook](../production-deployment-runbook.md) and the fifth
to complete on the initial execution.

## What shipped

Commit `fffbfae7a72281318fe29ad42546cfa23240a237`.

Four changes to the home hero, all from product review of the local preview, plus
the thirty brand marks the new wall renders.

**The copy was rewritten around what the site can honestly claim.** The previous
headline promised a product's "first push" and "first exposure". That overclaims:
a maker launching here has almost always launched somewhere else first, and a
site this size is not what introduces them to the world. Written per language
rather than translated — the Chinese wins on its idiom, since 酒香也怕巷子深
inverts the proverb everyone knows and lands the argument in six characters
English needs a sentence for.

**The kicker states history, not today.** It read "{n} launched today · {n}
queued", which changed hourly and said nothing on a quiet afternoon. It now reads
the all-time launch count — `2305 products launched` on the day of deploy.

**The wall is four rows of thirty third-party brand SVGs**, drifting in opposite
directions, sourced from [theSVG](https://thesvg.org) and vendored into
`public/brand` (148K, 30 files, verified present in the image) rather than
hot-linked, so the hero has no runtime dependency on a third party. Chosen for
being real SaaS products a maker recognises without being household names; the
biggest names in the industry were dropped, because their logos behind someone
else's launch would read as an endorsement they have not given.

**Two removals:** the hero's "Join N makers" avatar row, and the right rail's
partners block. The makers `COUNT` is gone from `getHomeStats` entirely, so this
release also runs one fewer count per home request.

## Source and artifact evidence

- release commit: `fffbfae7a72281318fe29ad42546cfa23240a237`
- CI: success (checks, release gates, runner smoke)
- release manifest: `releasable: true`, `sourceDirty: false`, `sourceOnMain: true`,
  platform `linux/amd64`
- application image: `open-launch:fffbfae7a72281318fe29ad42546cfa23240a237`
- image digest:
  `sha256:1fdad210651c7664385f713ee95edc25e24f437aa35b7820fd77415204f81d54`
- build-input SHA-256:
  `c7b328f2bfb6d4c0947ac977346fe5524126bff86a76e9f8419eb2086d58cc9f`
- OCI archive SHA-256:
  `ebaba8b75f34aa0632d57a5433ae060de778eea71d25f5808815e2ca685e9c74`
- artifact smoke, before delivery: passed
- host `sha256sum --check SHA256SUMS`: 5/5 OK; loaded ID matches the manifest
  digest and the tag's revision label
- `ls /app/public/brand | wc -l` inside the image: **30**, confirming the static
  assets are packaged rather than assumed

## Deployment evidence

- plan: `deploy_aat-ee-hero-r38-20260912`
- Compose contract: `compose.hero-r38.yml`, derived mechanically from
  `compose.logo-wall-r37.yml`; the diff is the image reference and nothing else
- contract validation: `docker compose config --quiet` exit 0 for both contracts
- approval: `appr_aat-ee-hero-r38-20260912_1789207025248272320`, scope
  `deploy_execution`, approved by `ivmm-via-chat`
- snapshot: `snap_aat-ee-hero-r38-20260912_1789207008699818642` (verify `ok`)
- journal: `deploy-deploy_aat-ee-hero-r38-20260912-20260912100209`
- execution: **6/6 operations successful, no failures, `registry_updated: true`,
  no resume required**
- before- and after-deploy backups: `Result=success`, `ExecMainStatus=0`
- repository check: `restic-idrive-e2` → `success`
- doctor after deploy: 0 errors, 0 warnings

## Verification

- container: `open-launch:fffbfae…`, `running`/`healthy`, restart count 0
- four marquee rows, 120 rendered images, **all 120 loaded**
- kicker reads `2305 products launched` (en) and `已上架 2305 个产品` (zh) — the
  real all-time count, not the local fixture's 25
- the Chinese headline breaks exactly at the comma, as intended
- no "Join … makers" text and no partners block on either locale
- `/brand/*.svg` served from production: 200
- `/`, `/zh`, `/winners`, `/trending`, `/leaderboard`, `/tools` all 200
- structured smoke against production: 144/144 checks passed (en, zh, ja)
- application logs since the deploy: zero error or exception lines

## Trademarks

theSVG's tooling is MIT, but every mark remains the property of its owner and is
offered there for nominative use. The wall is decoration, not a partnership
claim, and nothing on it should be read as one. Removing a slug from
`HERO_BRANDS` and `public/brand` removes it everywhere.

## Rollback

Recreate `aat-ee-app` from `compose.logo-wall-r37.yml`, validated alongside this
contract.
