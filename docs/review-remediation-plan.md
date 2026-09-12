# Review remediation plan

## Scope and evidence

This plan is based on the current working tree, which contains uncommitted
work. It distinguishes defects in that work from defects in the committed
baseline. It does not delete ignored local files, write to production, or
deploy.

The verified baseline is:

- `bun run lint` passes.
- `bun run test` passes: 97 test files passed, 2 skipped; 440 tests passed,
  9 skipped.
- `bun run typecheck:strict-indexes` passes.
- `bun run build:next` passes, including the project-local TypeScript gate
  and the Next.js production build.

## Implementation status — 2026-09-13

Completed:

- Added `@types/bun` as a development dependency and regenerated `bun.lock`.
  The Node-run TypeScript compiler now resolves the Bun preload module without
  weakening compiler settings.
- Updated the README's Next.js badge, English documentation signposting, and
  public deployment wording.
- Made `.env.example` canonical. `env.example.txt` is now a compatibility
  symlink, and active documentation points at the canonical file.
- Added `bun run repo:contracts` to CI. It guards the Next.js badge,
  environment-example references, Bun type declaration, and obsolete Stripe
  publishable-key assignments in configuration guides.
- Updated contributor commands to the repository's Bun workflow and removed
  the unused `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` assignments from setup
  documentation.
- Replaced the three reviewed `console.error` calls with the existing
  redacting structured logger, and replaced the paid-tier SQL expression with
  Drizzle's `inArray`.

Deferred:

- CSP enforcement needs production violation telemetry and an owner-approved
  rollout.
- Host-specific deployment details still exist in operational runbooks and a
  deployment script. Redacting or relocating them requires the infrastructure
  owner's confirmation that the private replacement is ready.
- Repository-wide documentation moves and ignored-local-file cleanup remain
  subject to the ownership audit below.

## P0 — Restore the release gate

### Problem

`scripts/build-next-with-font-cache.ts` runs
`node node_modules/typescript/bin/tsc --noEmit`. The new
`scripts/preload/server-only-shim.ts` imports `plugin` from `bun`, but the
project originally had no Bun type declarations. The build therefore stopped
with `TS2307: Cannot find module 'bun'` and an inferred-`any` error for the
plugin callback.

### Recommended fix

1. Add `@types/bun` as a development dependency using the repository's Bun
   workflow, updating `bun.lock` in the same change.
2. Configure the TypeScript surface deliberately:
   - first validate whether installing the declarations lets the existing
     compiler resolve `bun` without narrowing global type discovery;
   - if an explicit `compilerOptions.types` list is needed, include both
     `bun` and the existing Node/Next requirements rather than accidentally
     hiding them.
3. Keep the preload script typed. Once the `bun` module resolves, the plugin
   callback should receive its declared type; do not silence the error with
   `any` or `skipLibCheck` changes.

### Acceptance criteria

```bash
bun run lint
bun run test
bun run typecheck:strict-indexes
bun run build:next
```

All four commands must pass. The build command is the decisive check because
it exercises the exact compiler command used in the release path.

## P1 — Correct verified documentation drift

### README version badge

The hand-written Next.js badge now matches the declared Next version. Keep it
in the release checklist when updating framework dependencies. The CI
`repo:contracts` step also verifies the badge against both package manifest
entries.

### Environment examples

Make `.env.example` the canonical example. Before removing or redirecting
`env.example.txt`, compare every variable and find every documentation or
script reference. Preserve a compatibility pointer if external setup guides
refer to the old filename.

The CI `repo:contracts` step verifies the compatibility pointer and the
active documentation references. It accepts Git's text-pointer checkout when
Windows has symlinks disabled.

### Production-origin disclosure

Treat the public origin address as an operations decision, not an automatic
security fix. First confirm that the origin cannot bypass the CDN/WAF and is
firewall-restricted to intended proxy traffic. If that control is absent,
remove the address from public documentation and fix the network boundary;
if it is present, the address alone is a low-priority documentation concern.

The general README no longer names the host or a local deployment-controller
path. The remaining operational references are intentionally deferred until
their owner can provide an approved private location.

## P2 — Repository hygiene, only after an ownership audit

The ignored local files (`mitm_mcp_traffic.db`, `.env.qianyi`, and the agent
working notes) are not tracked in the current tree, and no reachable history
was found for the two named sensitive paths. Do not run `git rm --cached` or
delete them as part of this plan.

Before reorganizing root-level Markdown files or directories:

1. inventory inbound links, CI references, and release-runbook consumers;
2. classify each file as public documentation, active operations runbook,
   generated artefact, or local-only working state;
3. move one class at a time and update every link in the same change;
4. verify the documentation links after each move.

`skills/` and `workers/` are tracked source directories, so they are excluded
from generic cleanup. Ignored `.claude/`, `artifacts/`, and `target/` require
an owner decision before changing ignore rules.

## P3 — Targeted improvements, not release blockers

### CSP

The project already has a tested Report-Only CSP and report parser. Collect
real violation telemetry for an agreed observation period, narrow legitimate
sources, then enable enforcement in a staged release. Do not switch headers
to enforcing mode solely because the configuration exists.

### Structured logging

The three reviewed sites now emit `admin_category_create_failed`,
`admin_project_delete_failed`, and `upload_failed` through the existing
redacting structured logger. A blanket replacement across the project remains
out of scope because it would need endpoint-specific event names and fields.

### Drizzle expression style

Replace the hard-coded paid-tier `IN` expression with `inArray` in a small
isolated change if readability is preferred. It is a style/readability change,
not an SQL-injection fix.

### Defer unless triggered by a measured need

- Splitting `app/actions/projects.ts` is optional; its current size alone is
  not a defect.
- The slug race preserves data integrity and returns a retryable error; only
  redesign it if seamless collision retries become a product requirement.
- The upload path has a bounded 1 MiB input. Profile it before replacing the
  multipart parser merely to remove a copy.

## Review of this plan

The implemented sequence fixed the demonstrated release blocker first,
separated committed-state findings from local worktree state, and avoided
destructive cleanup based on unverified ownership. Production deployment,
database writes, and large documentation moves remain outside this change
until their respective owners authorize them.
