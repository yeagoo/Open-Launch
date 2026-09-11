# Home v2 r33 deployment (app-only)

## Outcome

Deployed. The aat.ee application now runs commit
`936ec44f7fa2f4caf53e91ad39ee19a64d3919ce`, which carries the redesigned home
page, the unified list rows, the accessibility fixes and the dependency
advisory remediation.

**The redesign is not yet visible.** `HOME_V2` is deliberately absent from the
environment, so `process.env.HOME_V2 === "1"` is false and the legacy home is
served — verified after the deploy: the public home page contains no
`data-home-v2` marker. Turning it on is a separate change (r33b): add
`HOME_V2: "1"` to the compose contract's `environment:` block and recreate the
container. Rollback is the same edit in reverse, with no snapshot restore,
because the flag is read per request.

## Source and artifact evidence

- release commit: `936ec44f7fa2f4caf53e91ad39ee19a64d3919ce`
- CI run: `34510887889`, all three jobs successful
- immutable runner validation run: `34551097803`, successful
- platform: `linux/amd64`
- build-input SHA-256:
  `4b30520c49c1a0347d3811171d6d59883d5b2a1d6a72dc57c76c5336c7572b34`
- application image digest:
  `sha256:700e8a8f64e3fc49160e6890022e04a487abc62984fe9453c04d488973595786`
- application OCI archive SHA-256:
  `f006ea3e86726eeb4377ef0275027d063cd8fa61d11733ab6c7990d567bd336f`
- release manifest: `releasable=true`, clean source, ancestor of `origin/main`
- build metadata, OCI archive, provenance, release manifest and SPDX SBOM
  passed SHA-256 verification locally and on the production host
- image labels on the host verified as revision `936ec44…`, build-input
  `4b30520c…`, `linux/amd64`, user `nextjs`

No migration artifact was required: the release changes no migration file, so
the plan declares `migrations.required: false`. The migrator image is therefore
not part of this release.

Before production use the exact artifact was smoke-tested locally against a
disposable PostgreSQL 18: all 62 handwritten migrations applied from an empty
database, and the image passed the health, pages, sitemap, authorization
boundary and static-asset smoke.

## Deployment evidence

- Compose contract: `compose.home-v2-r33.yml` — derived mechanically from
  `compose.log-remediation-r32.yml` with exactly one line changed, the image
  reference
- plan: `deploy_aat-ee-home-v2-r33-20260911`
- plan SHA-256:
  `4ad4d6ba0e71e6be95cd6daa31fb4ed016e223e062d2a88030560a4c90258228`
- preflight: `passed`, 0 blocked / 0 warnings (backup history, backup plan and
  snapshot coverage all ready)
- before-deploy backup: successful (`Result=success`, `ExecMainStatus=0`)
- before-deploy repository check: `check-restic-idrive-e2-20260911023928`,
  successful
- snapshot: `snap_aat-ee-home-v2-r33-20260911_1789094381863382372`
- snapshot verification: 7/7 artifacts verified, no limitations
- execution approval: `appr_aat-ee-home-v2-r33-20260911_1789094423276022565`
  (scope `deploy_execution`, approved by `ivmm-via-chat`)
- journal: `deploy-deploy_aat-ee-home-v2-r33-20260911-20260911024405`
- post-deploy backup: `backup-aat-ee-restic-20260911024451`, successful
- post-deploy repository check: `check-restic-idrive-e2-20260911024702`,
  successful

## Post-deploy health-check race, and the resume

The first execution reported `status: failed` with 4/6 operations successful.
`ComposeUp` succeeded and recreated the container on the new image, but the
`PostDeployHealthCheck` operation sampled the container while its Docker
healthcheck was still inside the start period:

```text
docker_container  state=running, health=starting  failed
port_listening    tcp connect succeeded           success
```

opsctl therefore stopped before `WriteRegistry` (`registry_updated: false`) and
recommended rollback. The container converged to `healthy` moments later, so
the failure was a timing artefact rather than a bad release; the running
service was never unhealthy.

Because the remaining work was only re-verifying health and completing the
registry write-back, the journal was resumed under a second approval
(`appr_aat-ee-home-v2-r33-20260911_1789094892808020261`, scope
`deploy_resume.deploy-…-20260911024405`):

- resume journal: `deploy-deploy_aat-ee-home-v2-r33-20260911-20260911025044`
- execution: 2/2 operations successful, no failures, skips or limitations
- `PostDeployHealthCheck`: 2/2 checks passed
- `registry_updated: true`

Note for future plans: `changes.health.stabilization_seconds` was 5, matching
the previous release's plan, and was not enough for this image's start period.
The deployment itself was unaffected, but a longer stabilization window would
avoid the extra resume round.

## Post-deploy verification

- container `aat-ee-app`: `running`, health `healthy`, restart count 0, image
  `open-launch:936ec44f7fa2f4caf53e91ad39ee19a64d3919ce`
- public routes: `https://aat.ee/`, `https://www.aat.ee/`,
  `/zh`, `/es`, `/et` and `/sitemap.xml` all return 200
- home page: no `data-home-v2` marker, unchanged title — the legacy home, as
  intended
- container error logs since the deploy: none
- `doctor`: 0 errors, 0 warnings, 0 findings
- `deploy-gates`: `ready`, 1/1 services ready, 0 blocked

## Still outstanding

- **r33b**: enable the redesign by adding `HOME_V2: "1"` to a new compose
  contract and recreating the container. The home smoke, accessibility and
  performance evidence for that change is recorded in
  `docs/frontend-redesign-uneed-style.md`.
- `docs/production-deployment-runbook.md` still records r30 / `5469a0b` as the
  current application state. Before this release production was actually at r32
  / `99e0288`; it is now r33 / `936ec44`. The runbook's state section should be
  brought forward.
