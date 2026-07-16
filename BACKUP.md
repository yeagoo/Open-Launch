# Database backups

A logical PostgreSQL backup runs **every 3 days** as an in-app cron job and is
stored, gzipped + encrypted, in a **private S3-compatible bucket**. Public
assets remain separate, so only the database uses this backup destination.

## How it works

- **Schedule** — `cron_schedule` row `'/api/cron/db-backup'`, expression
  `0 2 */3 * *` (02:00 UTC every 3rd day). Registered by
  `drizzle/migrations/0032_register_db_backup_cron.sql`; visible and toggleable
  at `/admin/cron-runs`.
- **Dump** — `lib/db-backup.ts` opens one `REPEATABLE READ` snapshot and
  `COPY … TO STDOUT`s every `public` base table (PostgreSQL native COPY format)
  plus sequence values and a manifest. No `pg_dump` binary needed. The
  `drizzle.__drizzle_migrations` table is intentionally excluded — `db:migrate`
  re-establishes the schema on restore.
- **Switch** — runs only when `BACKUP_ENABLED` is `true`. Off/unset is a clean
  no-op (HTTP 200, no alert), so it stays dormant until configured.
- **Encrypt** — gzip, then AES-256-GCM with a key scrypt-derived from
  `BACKUP_PASSPHRASE` (per-backup random salt). The same passphrase decrypts.
- **Store** — one object per run at
  `db/openlaunch/YYYY/MM/openlaunch-<utc-timestamp>.olbk.enc` in
  `BACKUP_S3_BUCKET`.
- **Retain** — after a successful upload, objects older than **30 days** are
  pruned. A failed run never prunes.
- **Alerting** — the route returns HTTP 500 on failure, so a bad run shows up
  as a failure in `/admin/cron-runs` and trips the cron-job.org alert.

## One-time setup

1. **Private bucket + key** — create a private bucket (e.g.
   `openlaunch-backups`, _not_ the public assets bucket) and an Access Key
   scoped to it. Set `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`,
   `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_S3_ENDPOINT`, and
   `BACKUP_S3_REGION`. The endpoint may be a hostname or an HTTPS origin; HTTP,
   embedded credentials, paths, queries, and fragments are rejected. IDrive E2
   credentials are region-specific, so the key, endpoint, and region must refer
   to the same enabled region.
2. **Passphrase** — generate a strong one and store it safely (password
   manager). The same passphrase encrypts and restores — **lose it and every
   backup is unrecoverable.**
   ```sh
   openssl rand -base64 32
   ```
   Set it as `BACKUP_PASSPHRASE`.
3. **Migrate** — `bun run db:migrate` applies `0032` and registers the cron.
4. **Enable** — set `BACKUP_ENABLED=true` once the bucket + passphrase are in
   place. Until then the cron is a no-op.

## Restore

The schema lives in git; a backup carries only data. To restore:

```sh
# 1. provision a fresh Postgres and point a URL at it, then load the schema:
DATABASE_URL="postgres://…/restore_db" bun run db:migrate

# 2. list backups, then restore the chosen one INTO that DB:
bun scripts/restore-db-backup.ts --list
bun scripts/restore-db-backup.ts \
  --source db/openlaunch/2026/06/openlaunch-2026-06-22_02-00-00.olbk.enc \
  --target "postgres://…/restore_db" \
  --passphrase "$BACKUP_PASSPHRASE" \
  --yes
```

For an automated first boot, set the exact object key in
`RESTORE_BACKUP_SOURCE` and add `--once`. The script takes a PostgreSQL
advisory lock and writes a marker in `opsctl_internal.restore_marker` inside
the same transaction as the restored data. Re-running the same source is a
no-op; presenting a different source fails closed and requires a newly
provisioned empty target. This prevents a later Compose restart from silently
overwriting live data.

The script loads with `session_replication_role = replica` (FK order doesn't
matter), resets sequences, and verifies every table's row count against the
manifest. It **refuses** to run against `DATABASE_URL` (prod) without
`--force-prod`, and requires `--yes`.

Restoring a very old backup? Check out the git commit whose migrations match the
manifest's `migrationTag` before `db:migrate`, so the schema matches the data.

Existing deployments that still use `BACKUP_R2_BUCKET`,
`BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, and `R2_ACCOUNT_ID`
continue to work as a compatibility fallback. If any `BACKUP_S3_*` variable is
set, however, the complete provider-neutral set is required and takes
precedence; this prevents a partially migrated configuration from silently
writing to the old bucket.

## Verify it works

Backups are only real if they restore. After setup, do a dry restore into a
throwaway DB and confirm the row-count check passes — then you know the
passphrase, the dump, and the restore path all line up.
