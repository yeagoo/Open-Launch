#!/usr/bin/env bun
// Restore a db-backup produced by /api/cron/db-backup.
//
// Restore model: provision a fresh Postgres → `bun run db:migrate` (schema is
// owned by git) → run this script to load the DATA from a backup object.
// Loading runs with `session_replication_role = replica`, so FK ordering and
// triggers don't matter; sequences are reset afterwards.
//
// Usage:
//   bun scripts/restore-db-backup.ts --list
//       List available backups in the R2 backup bucket.
//
//   bun scripts/restore-db-backup.ts \
//       --source db/openlaunch/2026/06/openlaunch-....olbk.enc \
//       --target "postgres://user:pass@host:5432/restore_db" \
//       --passphrase "…" --yes
//       Decrypt the backup and load it into --target. --source may also be a
//       local file path. The passphrase comes from --passphrase or the
//       BACKUP_PASSPHRASE env (must match the one used to create the backup).
//
// SAFETY: this TRUNCATEs every restored table in --target. It refuses to run
// against the same URL as DATABASE_URL (prod) unless --force-prod is given,
// and requires --yes to proceed non-interactively.
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"

import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

import "dotenv/config"

import { Client } from "pg"
import { from as copyFrom } from "pg-copy-streams"

import {
  BACKUP_PREFIX,
  backupBucket,
  copyTableExpression,
  getBackupR2Client,
  manualMigrationCoverage,
  parseContainer,
  passphraseDecrypt,
} from "../lib/db-backup"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (name: string) => process.argv.includes(name)

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

// Same physical database? Compare host + port + db name (ignoring user/pass/
// query/scheme), so an equivalent-but-not-identical URL for prod still trips
// the safety guard.
function sameDatabase(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    const port = (u: URL) => u.port || "5432"
    const dbName = (u: URL) => u.pathname.replace(/^\//, "")
    return ua.hostname === ub.hostname && port(ua) === port(ub) && dbName(ua) === dbName(ub)
  } catch {
    return a === b
  }
}

async function listBackups() {
  const client = getBackupR2Client()
  const bucket = backupBucket()
  let token: string | undefined
  const all: { key: string; size: number; when?: Date }[] = []
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX, ContinuationToken: token }),
    )
    for (const o of page.Contents ?? []) {
      if (o.Key) all.push({ key: o.Key, size: o.Size ?? 0, when: o.LastModified })
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  all.sort((a, b) => (a.when && b.when ? b.when.getTime() - a.when.getTime() : 0))
  console.log(`${all.length} backup(s) in ${bucket}/${BACKUP_PREFIX}:`)
  for (const b of all) {
    console.log(`  ${b.when?.toISOString() ?? "?"}  ${(b.size / 1e6).toFixed(2)}MB  ${b.key}`)
  }
}

async function fetchSource(source: string): Promise<Buffer> {
  // A path that exists on disk is a local file; otherwise treat it as an R2
  // object key (the listed `db/openlaunch/...` form).
  if (existsSync(source)) {
    return readFile(source)
  }
  const res = await getBackupR2Client().send(
    new GetObjectCommand({ Bucket: backupBucket(), Key: source }),
  )
  const bytes = await res.Body!.transformToByteArray()
  return Buffer.from(bytes)
}

async function main() {
  if (has("--list")) {
    await listBackups()
    return
  }

  const source = arg("--source")
  const target = arg("--target") ?? process.env.RESTORE_DATABASE_URL
  if (!source || !target) {
    throw new Error("Required: --source <r2-key|file> and --target <postgres-url> (or --list)")
  }
  if (
    process.env.DATABASE_URL &&
    sameDatabase(target, process.env.DATABASE_URL) &&
    !has("--force-prod")
  ) {
    throw new Error(
      "--target resolves to the same database as DATABASE_URL (prod). Refusing. " +
        "Pass --force-prod ONLY if you really mean to overwrite it.",
    )
  }

  const passphrase = arg("--passphrase") ?? process.env.BACKUP_PASSPHRASE ?? ""
  if (!passphrase) {
    throw new Error("Passphrase required: --passphrase <pw> or BACKUP_PASSPHRASE")
  }

  console.log(`Source : ${source}`)
  console.log(`Target : ${target.replace(/\/\/[^@]*@/, "//***@")}`)
  if (!has("--yes")) {
    throw new Error("This TRUNCATEs and reloads every table in --target. Re-run with --yes.")
  }

  console.log("Downloading + decrypting…")
  const blob = await fetchSource(source)
  const gzipped = passphraseDecrypt(blob, passphrase)
  const { manifest, tableData } = parseContainer(gzipped)
  console.log(
    `Backup from ${manifest.createdAt} · ${manifest.tables.length} tables · ${manifest.sequences.length} sequences`,
  )
  console.log(`Migration tag at dump time: ${manifest.migrationTag ?? "(unknown)"}`)

  const client = new Client({ connectionString: target })
  await client.connect()
  try {
    if (manifest.version >= 3) {
      if (!manifest.manualMigrations) {
        throw new Error("Backup v3 manifest has no manual migration evidence")
      }
      const targetMigrations = await client.query<{
        filename: string
        content_hash: string
      }>("SELECT filename, content_hash FROM public.manual_migrations_applied")
      const coverage = manualMigrationCoverage(
        manifest.manualMigrations,
        targetMigrations.rows.map((row) => ({
          filename: row.filename,
          contentHash: row.content_hash,
        })),
      )
      if (coverage.missing.length > 0 || coverage.mismatched.length > 0) {
        throw new Error(
          "Target migration ledger does not cover the backup schema: " +
            `${coverage.missing.length} missing, ${coverage.mismatched.length} hash-mismatched`,
        )
      }
    }

    // Fail fast if the target is missing any backed-up table — restoring a
    // subset and reporting success would silently drop a whole table's data.
    // Provision the schema (bun run db:migrate at the manifest's migration)
    // before restoring.
    const missing: string[] = []
    const missingColumns: string[] = []
    for (const t of manifest.tables) {
      const exists = await client.query(`SELECT to_regclass($1) AS oid`, [`public.${t.name}`])
      if (!exists.rows[0].oid) {
        missing.push(t.name)
        continue
      }
      if (manifest.version >= 2) {
        if (!t.columns?.length) {
          throw new Error(`Backup v2 manifest has no columns for table ${t.name}`)
        }
        const targetColumns = await client.query<{ name: string }>(
          `SELECT a.attname AS name
             FROM pg_attribute a
            WHERE a.attrelid = $1::regclass
              AND a.attnum > 0
              AND NOT a.attisdropped`,
          [`public.${quoteIdent(t.name)}`],
        )
        const available = new Set(targetColumns.rows.map((column) => column.name))
        for (const column of t.columns) {
          if (!available.has(column)) missingColumns.push(`${t.name}.${column}`)
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `Target is missing ${missing.length} table(s) from the backup: ${missing.join(", ")}. ` +
          "Run `bun run db:migrate` (matching the manifest's migration) first.",
      )
    }
    if (missingColumns.length > 0) {
      throw new Error(
        `Target is missing ${missingColumns.length} column(s) from the backup: ${missingColumns.join(", ")}. ` +
          "Run `bun run db:migrate` at the backup manifest's migration first.",
      )
    }

    // One transaction for the whole restore: truncate → load → reset sequences
    // → verify. Any error OR a row-count mismatch rolls everything back, so a
    // failed restore can never leave the target truncated or half-loaded.
    // SET LOCAL session_replication_role=replica is transaction-scoped (FK
    // order/triggers ignored during load; reverts on COMMIT/ROLLBACK).
    await client.query("BEGIN")
    try {
      await client.query("SET LOCAL session_replication_role = replica")

      const list = manifest.tables.map((t) => `public.${quoteIdent(t.name)}`).join(", ")
      await client.query(`TRUNCATE ${list} CASCADE`)

      for (const t of manifest.tables) {
        const data = tableData.get(t.name)
        if (!data) throw new Error(`backup has no data section for table ${t.name}`)
        await new Promise<void>((resolve, reject) => {
          const stream = client.query(
            copyFrom(`COPY ${copyTableExpression(t.name, t.columns)} FROM STDIN`),
          )
          stream.on("finish", resolve)
          stream.on("error", reject)
          stream.end(data)
        })
      }

      for (const s of manifest.sequences) {
        await client.query(`SELECT setval($1::regclass, $2::bigint, true)`, [
          `public.${quoteIdent(s.name)}`,
          s.value,
        ])
      }

      // Verify BEFORE commit — a mismatch aborts the whole restore.
      const mismatches: string[] = []
      for (const t of manifest.tables) {
        const { rows } = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM public.${quoteIdent(t.name)}`,
        )
        const got = Number(rows[0].n)
        console.log(`  ${got === t.rows ? "✓" : "✗"} ${t.name}: ${got} rows (expected ${t.rows})`)
        if (got !== t.rows) mismatches.push(`${t.name}: got ${got}, expected ${t.rows}`)
      }
      if (mismatches.length > 0) {
        throw new Error(`Row-count mismatch — rolling back:\n  ${mismatches.join("\n  ")}`)
      }

      await client.query("COMMIT")
      console.log(
        `✓ Restore complete — all ${manifest.tables.length} tables match expected row counts.`,
      )
    } catch (err) {
      await client.query("ROLLBACK")
      throw err
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
