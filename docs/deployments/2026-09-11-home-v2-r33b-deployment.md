# Home v2 r33b deployment — enabling the redesigned home

## Outcome

The redesigned home page is **live on aat.ee**. Verified against production
after the deploy: the page carries the `data-home-v2` marker, renders "Where new
products get their first push" as its `<h1>`, and shows real data — `7 launched
today · 8 queued`, `Join 1,740 makers`, and `66 launches this month` on the left
rail.

This release changes no code, no image and no data. It runs the same
`open-launch:936ec44…` image that r33 deployed, and the only difference between
`compose.home-v2-r33.yml` and `compose.home-v2-r33b.yml` is one added line in
the service environment block:

```yaml
environment:
  HOME_V2: "1"
```

`HOME_V2` is read per request (`app/[locale]/page.tsx`), so nothing about the
build changes and nothing needs rebuilding.

## Rollback

Recreate the container from `compose.home-v2-r33.yml`, which has no `HOME_V2`
entry and therefore serves the previous home page. No snapshot restore is
involved. The r33b snapshot (`snap_aat-ee-home-v2-r33b-20260911_1789095479291191237`)
remains available if a data rollback is ever needed as well.

## Deployment evidence

- plan: `deploy_aat-ee-home-v2-r33b-20260911`
- preflight: `passed`, 0 blocked / 0 warnings
- before-deploy backup: successful (`Result=success`, `ExecMainStatus=0`)
- before-deploy repository check: `check-restic-idrive-e2-20260911025746`
- snapshot: `snap_aat-ee-home-v2-r33b-20260911_1789095479291191237`, verified 7/7
- execution approval: `appr_aat-ee-home-v2-r33b-20260911_1789095501912870498`
  (scope `deploy_execution`, approved by `ivmm-via-chat`)
- failed journal: `deploy-deploy_aat-ee-home-v2-r33b-20260911-20260911033151`
- resume approval: `appr_aat-ee-home-v2-r33b-20260911_1789097589652788189`
  (scope `deploy_resume.deploy-…-20260911033151`)
- resume journal: `deploy-deploy_aat-ee-home-v2-r33b-20260911-20260911034515`,
  `status: success`, 3/3 operations, `registry_updated: true`
- post-deploy backup: `backup-aat-ee-restic-20260911034623`, successful
- post-deploy repository check: `check-restic-idrive-e2-20260911034814`
- `doctor`: 0 errors, 0 warnings

## The failed first execution, and why

The first attempt failed at `ComposeUp` (`controlled command exited non-zero`).
The cause was a YAML indentation error in the new contract, introduced by hand:

```yaml
    environment:
        HOME_V2: "1"      # 8 spaces — wrong, and invalid here
      HOSTNAME: 0.0.0.0    # 6 spaces — the correct depth for sibling keys
```

The service's remaining keys sit six spaces deep; the added line was written
eight. Compose rejected the file while parsing, so the container was **never
recreated** and production kept serving the previous environment throughout —
confirmed afterwards: the container was still `running`/`healthy` on the same
image with `HOME_V2` unset, and the public site answered 200.

The contract was corrected, and this time validated with the tool that actually
consumes it before any deploy step:

```bash
docker compose --file compose.home-v2-r33b.yml --project-name aat-ee config --quiet   # exit 0
docker compose --file compose.home-v2-r33.yml  --project-name aat-ee config --quiet   # exit 0 (rollback path)
```

The earlier r33 contract had been derived by `sed` from a known-good file, which
is why it could not be malformed; r33b was derived by hand-editing, which is
where the error entered. A generated contract should be validated with
`docker compose config` before it reaches a plan.

## Post-deploy verification

- container `aat-ee-app`: `running`, health `healthy`, restart count 0
- container environment: `HOME_V2=1`
- container error logs since the deploy: none
- public routes: `https://aat.ee/`, `https://www.aat.ee/`, `/zh`, `/es`, `/et`,
  `/sitemap.xml`, `/trending`, `/categories` all return 200
- rendered home (desktop and mobile, 1440 px and 390 px):
  - `data-home-v2` present, `<h1>` = "Where new products get their first push"
  - structural slots present: hero wall, countdown, 2 stat pills, 4 soft cards,
    5 pill buttons, 35 tag pills, 7 ranked rows, 11 serif headings
  - no untranslated message key paths in visible text
  - `7 launched today · 8 queued`, `Join 1,740 makers`, `66 launches this month`
  - no horizontal overflow at either width

## Notes for the next release

`changes.health.stabilization_seconds` was raised from 5 to 30 for this plan
after r33's post-deploy health check sampled the container while its healthcheck
was still starting. The check passed first time here.
