# Home v2 (r33) release preparation

**Status: PREPARED — NOT DEPLOYED.** This is a release handoff, not a deployment
record. Nothing in production was mutated while producing it; every production
command run was read-only.

## What this release does, and what it does not

Ships the redesigned home page **with `HOME_V2` unset**, which is the default
and means `process.env.HOME_V2 === "1"` is false. The user-visible behaviour is
therefore **identical to today**; the release proves that the new code — the
three-column home, the shared `RankedRow`, Next 16.3.4, the new message
namespaces — builds and runs cleanly in production.

Turning the redesign on is a **separate, later release (r33b)**: add
`HOME_V2: "1"` to the compose contract's `environment:` block and recreate the
container. Rollback is the same edit in reverse — no snapshot restore, because
the flag is read per request (`app/[locale]/page.tsx`), not baked in at build
time.

This mirrors how canary readiness was previously shipped: the runbook records
"Phase 11A deployed Canary readiness without enabling Canary as r24".

## Source identity

- release commit: `9c97329e2421d2def7fa0bde7162fae962353ce7`
- CI run: `34510887889`, all three jobs successful (Bun checks, release gates,
  immutable runner HTTP smoke)
- immutable runner validation run: `34551097803`, successful — linux/amd64 image
  built, migrations applied to a disposable PostgreSQL, image smoke passed
  (health, pages, sitemap, auth boundary, static asset)
- current production commit: `99e02882eb299df661526672c14242e7bf6cad75` — the
  direct parent of this release's first commit, so the source change is a clean
  fast-forward with no divergence

## Production state at preparation time (read-only)

- identity check: `iZj6c7t3zvc5p481sn85jtZ`, user `ecs-user`
- `deploy-gates --json`: `status=ready`, no blocked gates; backup history,
  backup readiness, snapshot coverage (2 snapshots) and timer health all ready
- backup history: 92 records, 44 repository checks, 9 restore drills; latest
  `backup-aat-ee-restic-20260910174937`, status success
- running container: `aat-ee-app`, image
  `open-launch:99e02882eb299df661526672c14242e7bf6cad75`, status `running`,
  health `healthy`, restart count 0
- compose contract currently in use: `compose.log-remediation-r32.yml`
- `HOME_V2` is **not present** in the running container's environment (verified
  by name only)

Note: `docs/production-deployment-runbook.md` records r30 and commit `5469a0b`
as current. Production is actually at r32 / `99e0288`. The runbook has drifted
and should be updated as part of this release.

## Blocking action: build the releasable artifact

The CI artifact is built with `--validation-only` and a throwaway
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and its release manifest is
`releasable=false` (confirmed in the run log). The production artifact must be
built with the production-stable key:

```bash
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=<production key> \
scripts/build-immutable-runner.sh \
  --commit 9c97329e2421d2def7fa0bde7162fae962353ce7 \
  --output-dir <empty-dir> \
  --tag open-launch:9c97329
```

Do **not** pass `--validation-only`; that would mark the manifest
`releasable=false`. The script refuses a dirty worktree and a commit that is not
an ancestor of `origin/main`, and verifies the built image's revision and
build-input labels against the reviewed source identity.

This could not be produced from the workstation used for the rest of this
release: Docker is unreachable there (`Immediate connect fail for
/run/docker.sock: Permission denied`) and the container runs with
`no_new_privs`, so `sudo` cannot be used either. No remote buildx builder is
configured. That isolation appears intentional and is not worth weakening.

## Remaining sequence

Follow `docs/production-deployment-runbook.md` §"Required deployment sequence"
from step 4, substituting this release's identity:

1. `opsctl status`, `deploy-gates`, backup history and snapshot coverage —
   already verified ready above.
2. Registered before-deploy backup for `aat-ee`, then
   `opsctl backup check restic-idrive-e2 --json`.
3. New typed deploy plan + `preflight`.
4. Snapshot + verification, then `deploy <plan> --dry-run --snapshot <id> --json`.
5. Human approval for the exact plan and snapshot.
6. Execute the approved plan; preserve the journal ID.
7. Post-deploy verification: container health, the public routes in the runbook's
   baseline list, structured data, sitemap XML, authorization boundaries, cron
   state, error logs.
8. Post-deploy backup and repository check.

## Expected post-deploy result

The home page should be **byte-comparable to the current one** in its visible
content, because the flag is off. The release is successful if the container is
healthy on the new image and every existing route still behaves as before. Any
visible change to the home page indicates `HOME_V2` reached the container and
should be investigated before proceeding.

## Verification available for the shipped code

- `bun audit`: no vulnerabilities (1195 packages)
- `tsc`, `eslint`, 439 unit tests, production build, all four route budgets
- home smoke: 144/144 across `en`, `zh`, `ja`, covering `/`, both period tabs,
  `/trending`, `/categories`, `/projects`
- accessibility: home 93, trending 100, categories 100, project detail 100
- Lighthouse against the CI methodology: route JS within budget; LCP is over the
  3000 ms observe-mode budget on both the new and the legacy home (medians
  3802 ms vs 3730 ms, with ±380 ms within-arm spread), so it is not a regression
  from this change
