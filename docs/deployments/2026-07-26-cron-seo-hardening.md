# 2026-07-26 cron, SEO, upload, and production hardening

Status: completed and verified in production  
Production host: `8.210.175.190`  
Managed service: `aat-ee`

This record covers the investigation that began with stale cron alerts for
`/api/cron/translate-projects` and `/api/cron/enrich-projects`, plus Google
Search Console breadcrumb errors on
`https://www.aat.ee/et/projects/serena`.

## Development delivered

The completed source sequence is:

| Commit                                     | Purpose                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `d53057fe130f7cdd44366cea95e11f5978fd288d` | Remove streamed breadcrumb Microdata and add regression coverage                                                    |
| `80bcc82877cb4f583b5056c75400f477ab1d0d14` | Server-render the JSON-LD script so crawlers receive it in HTML                                                     |
| `5335c245ac9032399ff53536e346dac8e762a8b4` | Harden cron handling, SEO payloads, uploads, email output, query bounds, sitemaps, and standalone production builds |
| `065fe148e34c2540a441025a7f47b0d1ec527d05` | Defer database-backed sitemap generation until runtime and fix cache invalidation                                   |
| `cc7162a3b3255f736094e6ec992a2b5a44e0a945` | Permit the two remaining legacy avatars under a bounded 25-megapixel migration limit                                |

The main changes were:

- Cron authentication and failure classification were made consistent, with
  stale/failure alert deduplication.
- Public project/tag queries received explicit payload and row bounds.
- Sensitive fields and Base64 image data were removed from public page
  payloads.
- Profile and upload inputs were validated and image processing was bounded.
- Dynamic sitemap XML routes replaced the database-dependent build-time
  sitemap.
- Breadcrumb JSON-LD is now present in server-rendered HTML with valid `name`
  and `position` fields.
- Transactional email interpolation is escaped.
- The Next.js standalone artifact includes the required Sharp/libvips runtime.
- A bounded one-shot migration converts legacy Base64 avatars into stored AVIF
  objects.

## Development verification

Before production deployment:

- lint and TypeScript checks passed
- Vitest passed: 211 tests passed, 6 skipped
- the production standalone build passed
- dependency audit reported no known vulnerabilities
- Semgrep CI checks passed
- Linux/amd64 standalone Sharp/libvips behavior was verified
- Serena's rendered payload and JSON-LD were inspected
- the final GitHub Actions run passed:
  `https://github.com/yeagoo/Open-Launch/actions/runs/30206623237`

At completion, local `HEAD` and `origin/main` both pointed to:

```text
cc7162a3b3255f736094e6ec992a2b5a44e0a945
```

## Production deployments

All production actions used the typed `opsctl` workflow in
`/home/ivmm/tools/deploy-tools`, including readiness gates, backup evidence,
snapshots, approvals where required, and execution journals.

| Stage                        | Plan                                          | Snapshot                                                        | Journal                                                             | Result        |
| ---------------------------- | --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| Breadcrumb schema            | `deploy_aat-ee-breadcrumb-schema-r5-20260726` | `snap_aat-ee-breadcrumb-schema-r5-20260726_1785059817717448312` | `deploy-deploy_aat-ee-breadcrumb-schema-r5-20260726-20260726095719` | 7/7 succeeded |
| Server-rendered JSON-LD      | `deploy_aat-ee-jsonld-ssr-r6-20260726`        | `snap_aat-ee-jsonld-ssr-r6-20260726_1785060748067467847`        | `deploy-deploy_aat-ee-jsonld-ssr-r6-20260726-20260726101232`        | 7/7 succeeded |
| Security, cron, SEO artifact | `deploy_aat-ee-security-cron-seo-r7-20260726` | `snap_aat-ee-security-cron-seo-r7-20260726_1785075799097926072` | `deploy-deploy_aat-ee-security-cron-seo-r7-20260726-20260726142323` | 7/7 succeeded |
| Runtime cache correction     | `deploy_aat-ee-security-cron-seo-r8-20260726` | `snap_aat-ee-security-cron-seo-r8-20260726_1785076487510547802` | `deploy-deploy_aat-ee-security-cron-seo-r8-20260726-20260726143454` | 7/7 succeeded |
| Remaining avatar migration   | `deploy_aat-ee-avatar-migration-r9-20260726`  | `snap_aat-ee-avatar-migration-r9-20260726_1785077158974736722`  | `deploy-deploy_aat-ee-avatar-migration-r9-20260726-20260726144805`  | 5/5 succeeded |

Before the main deployment, the registered `aat-ee` backup service completed
successfully and the `restic-idrive-e2` repository check passed. The same
backup and repository checks passed again after the migration.

### Runtime correction found after r7

The application remained intentionally read-only, but Next.js attempted to
create `/app/.next/cache`. Logs contained 351 cache-update failures. The r8
Compose correction added only this bounded writable mount:

```text
/app/.next/cache:size=256m,uid=1001,gid=1001,mode=0750
```

After r8, the application was healthy, cache-update failures were zero, and
fatal/panic/unhandled errors were zero.

### Avatar migration

The first dry run found 32 legacy Base64 avatars. The first execution migrated
30; two valid images exceeded the original 16-megapixel input bound:

- JPEG: `4284 × 5712` (`24,470,208` pixels)
- PNG: `4096 × 4096` (`16,777,216` pixels)

The cap was reviewed and raised to 25 megapixels while retaining the 20 MiB
encoded-input bound, sequential processing, 512-pixel AVIF output bound, and
768 MiB operations-container memory limit. The r9 operation migrated both
remaining rows:

```text
migrated=2 skipped_concurrent=0 failed=0
base64_remaining=0
recent_r2_avatar_updates=32
```

The destructive migration scope and deploy execution each received a separate
human approval. Approval tokens are intentionally not recorded here.

## Production verification

The following checks passed after r8/r9:

- `https://aat.ee/` returned `200`
- `https://www.aat.ee/` returned `200`
- sitemap index returned valid XML with four child sitemaps
- static sitemap returned valid XML with 93 locations
- project sitemap returned valid XML with 14,592 locations
- tags and editorial sitemaps returned `200`
- Serena returned `200`
- Serena contained one valid three-item `BreadcrumbList`
- Serena contained no duplicate breadcrumb Microdata
- Serena's public page contained no Base64 image data
- unauthenticated cron dispatcher/task calls returned `401`
- unauthenticated upload returned `401`
- `aat-ee-app` was running and healthy

Read-only cron database verification showed, over the preceding two hours:

| Task               | Attempts | Successes | Failures | Latest HTTP status |
| ------------------ | -------: | --------: | -------: | -----------------: |
| Enrich projects    |       24 |        24 |        0 |                200 |
| Translate projects |       24 |        24 |        0 |                200 |

The dispatcher also had a current run. This resolved the original stale-alert
condition at the data layer without intentionally triggering another health
email.

Final `opsctl` state:

```text
doctor errors: 0
doctor warnings: 0
backup readiness: ready
backup history: ready
stale backup targets: 0
deploy gates: ready
snapshot coverage: ready
```

## Follow-up items

No development or deployment blocker remained at handoff. Optional operational
follow-ups are:

1. Start Google Search Console's validation for the Serena breadcrumb issue and
   wait for recrawl.
2. Observe cron history, backup timers, and application logs for 24 hours.
3. Run OAuth, verification-email, Stripe-webhook, and real upload checks only
   when their external side effects are explicitly approved.
4. Inventory old diagnostic containers/artifacts and former Zeabur resources.
   Do not delete any of them without separate, exact-scope approval.

Connection details and the safe future deployment sequence are in the
[production deployment runbook](../production-deployment-runbook.md).
