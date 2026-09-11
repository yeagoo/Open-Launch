# Log remediation r32 deployment (reconstructed)

**Reconstructed on 2026-09-11** from the deploy journal and the state still on
the production host. See the [r31 record](./2026-09-04-aieo-badge-r31.md) for
why these were missing. Facts come from `/var/lib/opsctl/deploy-journals` and
`docker image inspect`; anything not recoverable is marked unavailable rather
than guessed.

## What shipped

Commit `99e02882eb299df661526672c14242e7bf6cad75` — "fix: improve cron
reliability and observability" (11 files, +227/-30). It was the last release
before the home page redesign and the commit the redesign's first release (r33)
was built on top of.

## Source and artifact evidence

- release commit: `99e02882eb299df661526672c14242e7bf6cad75`
- application image: `open-launch:99e02882eb299df661526672c14242e7bf6cad75`
- image digest:
  `sha256:1ec28d2e331e72a3fe0ecafee2ff4646063b5d16f57f15404b81ac7629bb4041`
- build-input SHA-256:
  `22ce71769a222361bd8c79b937f450ffd18b8f6beec4bccb6d5061c2a2cec87e`
- image built: 2026-09-04T18:09:56+08:00, `linux/amd64`, user `nextjs`
- CI run, OCI archive SHA-256, SBOM and provenance: **unavailable** — the
  journal records the deployment, not the build.

## Deployment evidence

- plan: `deploy_aat-ee-log-remediation-r32-20260904`
- Compose contract: `compose.log-remediation-r32.yml`
- snapshot: `snap_aat-ee-log-remediation-r32-20260904_1788517606495552715`
- journal: `deploy-deploy_aat-ee-log-remediation-r32-20260904-20260904104400`
- execution: 6/6 operations successful, no failures, `registry_updated: true`
- started 2026-09-04T10:44:00Z, completed 2026-09-04T10:44:16Z
- before/after backups and post-deploy verification: **unavailable** for the
  same reason.

`compose.log-remediation-r32.yml` was still the running contract when the home
page redesign shipped, and its container environment carried no `HOME_V2`
entry — which is what made r33's app-only deploy invisible to users, and r33b's
single added line the whole of the switch.

## Successor

[r33](./2026-09-11-home-v2-r33-deployment.md) deployed the redesign with the
flag off; [r33b](./2026-09-11-home-v2-r33b-deployment.md) enabled it.
