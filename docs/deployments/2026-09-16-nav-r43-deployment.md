# Responsive navigation r43 deployment

Deployed 2026-09-16 (Asia/Shanghai). This application-only release corrects
the home header at intermediate desktop widths, where the previous layout let
the submit action wrap and pushed sign-up beyond the viewport.

## Change scope

- source commit: `14c72d2b265aed540196150f03c193543d924ef8`
- immutable Linux/amd64 runner image digest:
  `sha256:19eff5d97520f9b7ffc739f8f26ef881ed289ba530c4ccb10a43f0eb0d8a180f`
- build-input hash:
  `acadfc5d1e8193dabda1a45e76e561798de1ce2d36f640f54913e5c7355e5a7c`
- runner archive hash:
  `baeaa4a0d344d98751714225b2808ea8775c2eeea3820e710d9221282e909938`
- the release changes only the `aat-ee-app` image in
  `compose.nav-r43.yml`; the existing migration image, database schema,
  ports, Caddy routes, volumes, and destructive operations are unchanged
- `COMMUNITY_ENABLED=1` remains in the application contract
- the header now uses a wider desktop container, compact responsive search and
  action controls, a one-line submit CTA, and an outline sign-up action; the
  mobile drawer now exposes the language selector

## Deployment evidence

- CI: [GitHub Actions run 34992045196](https://github.com/yeagoo/Open-Launch/actions/runs/34992045196)
  passed its Bun, browser, database, performance, and immutable-runner gates
- all five release-delivery checksums verified on the production host before
  the image was imported; the running image revision and build-input label were
  then checked against the release manifest
- plan: `deploy_aat-ee-nav-r43-20260916`; preflight passed with zero warnings
  and blockers
- before-deploy backup: `backup-aat-ee-restic-20260915161321`, successful
- before-deploy repository check:
  `check-restic-idrive-e2-20260915161541`, successful
- approval: `appr_aat-ee-nav-r43-20260916_1789489015999960259`, approved for
  the exact deployment execution scope
- snapshot: `snap_aat-ee-nav-r43-20260916_1789488970606173685`; all 7
  artifacts verified and its registry archive inspection reported `safe`
- dry run was ready with six typed operations before execution
- journal: `deploy-deploy_aat-ee-nav-r43-20260916-20260915161939`;
  **6/6 operations successful**, no failures, and registry state updated
- existing orphan-container advisories were retained; no automatic orphan
  cleanup was run
- post-deploy backup: `backup-aat-ee-restic-20260915162630`, successful
- post-deploy repository check:
  `check-restic-idrive-e2-20260915162858`, successful without limitations

## Verification

- `aat-ee-app` is running and healthy as the exact r43 runner image; its
  one-shot Community migration companion exited with code 0 and the internal
  health endpoint returned HTTP 200
- production-browser checks found no header overflow at 1024px or 1142px.
  At 1024px, Submit Project ends at x=519 and Sign up ends at x=1008 within
  the viewport. At 1142px, both actions and Community are visible and fit.
- at 1023px the compact menu opens successfully and exposes the English
  language row
- `/`, `/community`, `/zh`, `/es`, `/et`, and `/sitemap.xml` each returned
  HTTP 200
- the enabled Community canary passed: public filtered and canonical feeds
  returned HTTP 200, locale bridges retained their expected redirects, and
  warm TTFB median was 340 ms across three samples
- application logs for the ten minutes after deployment contained zero
  `error`, `exception`, or `fatal` keyword matches

## Rollback

For an application-only rollback, redeploy the reviewed
`compose.community-enable-r42.yml` contract, which restores the r42 image
while preserving `COMMUNITY_ENABLED=1`. Use the r43 snapshot restore workflow
only when a full release-state rollback is required.
