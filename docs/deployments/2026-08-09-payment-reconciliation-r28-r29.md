# 2026-08-09 payment reconciliation r28/r29

## Outcome

Production now serves Open Launch commit
`1259250ade10c7afffcfcb63fb99149259816c40`. The directory-payment flow now
validates Stripe's tax-exclusive subtotal when available, keeps genuine amount
mismatches held, handles full refunds, and closes the reviewed cancellation,
duplicate-payment, refund-ordering, and webhook-replay races.

The UseWok Ultra Plus payment was reconciled after the duplicate charge had
been fully refunded. Stripe charged a `2599` cent subtotal plus `520` cents of
tax, producing the correct `3119` cent total. The retained paid order was
relinked to the exact surviving UseWok project in a fail-closed transaction,
then its original `checkout.session.completed` event was replayed through the
deployed signed webhook. The replay returned `repairedHold=true`, changed
`amount_verified` to true, and promoted the project from `payment_pending` to
the live launch window.

All four syndication targets completed on their first attempt with no recorded
error. The three standalone targets returned one public URL each and the
Toolso gateway returned nine, which together with the aat.ee project page
delivers the purchased 13-directory placement. All 13 public pages returned
HTTP 200 during verification. The order correctly remains `paid`, not
`fulfilled`, because Ultra Plus also includes six manually written GEO/AIEO
articles; an administrator must complete those articles before marking the
order fulfilled.

## Source and artifact evidence

- initial payment fix: `60e9443`
- reviewed race-hardening fix:
  `1259250ade10c7afffcfcb63fb99149259816c40`
- clean CI run: `31306364215`, successful
- validation: TypeScript, ESLint, formatting, production build, and dependency
  audit all passed; Vitest passed 395 tests across 86 files with 9 tests skipped
- dependency audit: zero known vulnerabilities after pinning patched transitive
  `js-yaml` and `nanoid` versions
- platform: `linux/amd64`
- image digest:
  `sha256:520fc9960de39fb85a963a3db0265130767b4d90c54c940b1c7df061d6d6c87d`
- build-input SHA-256:
  `3c9e4cd0445c8a7d7dc486ef7f321a998c593170296abdc16a084a647b388295`
- OCI archive SHA-256:
  `414d75f5dd7a75f96fe959a0d55a72c24c9f124727a7531445d2d655ab59b36c`
- release manifest: `releasable=true`, clean source, ancestor of `origin/main`
- build metadata, OCI archive, provenance, release manifest, and SPDX SBOM all
  passed SHA-256 verification locally and on the production host

## r28 deployment evidence

- before-deploy backup: `backup-aat-ee-restic-20260809094935`, successful
- before-deploy repository check:
  `check-restic-idrive-e2-20260809095105`, successful
- plan: `deploy_aat-ee-payment-reconcile-r28-20260809`
- snapshot:
  `snap_aat-ee-payment-reconcile-r28-20260809_1786269478467282855`
- snapshot verification: 7/7 artifacts verified, no limitations
- approval:
  `appr_aat-ee-payment-reconcile-r28-20260809_1786269530030039511`, approved
  after explicit user authorization
- journal:
  `deploy-deploy_aat-ee-payment-reconcile-r28-20260809-20260809100205`
- execution: 6/6 operations successful, no failures, skips, or limitations
- Stripe endpoint now subscribes to `charge.refunded`; the endpoint is enabled
  with six enabled event types

## r29 reconciliation evidence

- plan: `deploy_aat-ee-usewok-order-relink-r29-20260809`
- snapshot:
  `snap_aat-ee-usewok-order-relink-r29-20260809_1786270485709187085`
- snapshot verification: 7/7 artifacts verified, no failures or missing
  checksums
- destructive-operation approval:
  `appr_aat-ee-usewok-order-relink-r29-20260809_1786270450093707936`
- execution approval:
  `appr_aat-ee-usewok-order-relink-r29-20260809_1786270576749425953`
- journal:
  `deploy-deploy_aat-ee-usewok-order-relink-r29-20260809-20260809101703`
- execution: 4/4 operations successful, no failures, skips, refusals, or
  limitations
- one-shot reconciliation container: exited with code 0; exactly one retained
  paid order was relinked
- signed Stripe replay: HTTP 200 with `repairedHold=true`
- final order state: `paid`, `amount_verified=true`, no fulfillment timestamp
- final project state: `ongoing`, premium launch, canonical slug `usewok`
- final syndication state: 4/4 queue rows `sent`, each on attempt 1, no errors;
  12 partner URLs plus the aat.ee page
- post-reconciliation backup:
  `backup-aat-ee-restic-20260809102248`, successful, no limitations
- post-reconciliation repository check:
  `check-restic-idrive-e2-20260809102418`, successful, no limitations

An earlier approval record used the descriptive scope `destructive_operation`,
which did not satisfy the policy engine's exact
`destructive_operation_requires_approval` scope. It had no execution effect;
the exact-scope approval listed above was requested and approved before the
snapshot-bound dry-run and execution.

## Post-deploy verification

- `aat-ee-app`: running, healthy, restart count 0
- serving image and OCI revision both match
  `1259250ade10c7afffcfcb63fb99149259816c40`
- `opsctl status`: 0 doctor errors, 0 doctor warnings; deployment, backup, and
  snapshot gates all ready
- scheduler recovered from one unrelated VoiceMoat alternatives-generation
  failure at 10:05 UTC; every observed dispatch from 10:06 through 10:25 UTC
  returned HTTP 200 with zero failed subtasks
- current-exit-IP check of `https://www.aat.ee/projects/usewok`: HTTP 200 with
  title `UseWok | aat.ee`

## Security follow-up

During a read-only post-deploy check, an incorrectly formatted Docker inspect
expression expanded runtime environment values into the restricted operator
tool output. No credential values are stored in this repository or this
record, and subsequent checks were changed to query only explicit state,
image, and revision fields. There is no observed evidence of misuse, but every
credential present in the application container at that time must be treated
as exposed and rotated through a separate, explicitly approved environment
change. The affected categories include payment/webhook, database, session and
encryption, object storage, OAuth, email, cron/partner webhooks, and AI-provider
credentials.
