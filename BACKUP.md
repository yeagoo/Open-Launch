# Database backups

A logical PostgreSQL backup runs **every 3 days** as an in-app cron job and is
stored, gzipped + encrypted, in a **private** Cloudflare R2 bucket. Assets are
already durable in R2, so only the database needs this.

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
- **Encrypt** — gzip, then envelope encryption: a random AES-256-GCM key per
  backup, wrapped with `BACKUP_PUBLIC_KEY` (RSA-OAEP). The private key (offline)
  is the only way to decrypt.
- **Store** — one object per run at
  `db/openlaunch/YYYY/MM/openlaunch-<utc-timestamp>.olbk.enc` in
  `BACKUP_R2_BUCKET`.
- **Retain** — after a successful upload, objects older than **30 days** are
  pruned. A failed run never prunes.
- **Alerting** — the route returns HTTP 500 on failure, so a bad run shows up
  as a failure in `/admin/cron-runs` and trips the cron-job.org alert.

## One-time setup

1. **Private bucket + key** — create a private R2 bucket (e.g.
   `openlaunch-backups`, _not_ the public assets bucket) and an Access Key
   scoped to it. Set `BACKUP_R2_BUCKET`, `BACKUP_R2_ACCESS_KEY_ID`,
   `BACKUP_R2_SECRET_ACCESS_KEY` (the endpoint reuses `R2_ACCOUNT_ID`).
2. **Encryption keypair** — generate once and keep the private key **offline**:
   ```sh
   openssl genpkey -algorithm RSA -pkcs8 -out backup-private.pem -pkeyopt rsa_keygen_bits:4096
   openssl pkey -in backup-private.pem -pubout -out backup-public.pem
   ```
   Put `backup-public.pem` in `BACKUP_PUBLIC_KEY`. Store `backup-private.pem`
   somewhere safe (password manager / offline vault). **Lose it and every
   backup is unrecoverable.**
3. **Migrate** — `bun run db:migrate` applies `0032` and registers the cron.

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
  --key ./backup-private.pem \
  --yes
```

The script loads with `session_replication_role = replica` (FK order doesn't
matter), resets sequences, and verifies every table's row count against the
manifest. It **refuses** to run against `DATABASE_URL` (prod) without
`--force-prod`, and requires `--yes`.

Restoring a very old backup? Check out the git commit whose migrations match the
manifest's `migrationTag` before `db:migrate`, so the schema matches the data.

## Verify it works

Backups are only real if they restore. After setup, do a dry restore into a
throwaway DB and confirm the row-count check passes — then you know the
encryption key, the dump, and the restore path all line up.
