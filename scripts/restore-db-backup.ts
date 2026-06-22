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
//       --key ./backup-private.pem --yes
//       Decrypt the backup and load it into --target. --source may also be a
//       local file path. The private key may come from --key <file> or the
//       BACKUP_PRIVATE_KEY env (escaped "\n" accepted).
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
  envelopeDecrypt,
  getBackupR2Client,
  parseContainer,
} from "../lib/db-backup"

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const has = (name: string) => process.argv.includes(name)

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
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
  if (target === process.env.DATABASE_URL && !has("--force-prod")) {
    throw new Error(
      "--target equals DATABASE_URL (prod). Refusing. Pass --force-prod ONLY if you really mean to overwrite it.",
    )
  }

  const keyFile = arg("--key")
  const privateKey = (
    keyFile ? await readFile(keyFile, "utf8") : (process.env.BACKUP_PRIVATE_KEY ?? "")
  )
    .replace(/\\n/g, "\n")
    .trim()
  if (!privateKey) throw new Error("Private key required: --key <file> or BACKUP_PRIVATE_KEY")

  console.log(`Source : ${source}`)
  console.log(`Target : ${target.replace(/\/\/[^@]*@/, "//***@")}`)
  if (!has("--yes")) {
    throw new Error("This TRUNCATEs and reloads every table in --target. Re-run with --yes.")
  }

  console.log("Downloading + decrypting…")
  const blob = await fetchSource(source)
  const gzipped = envelopeDecrypt(blob, privateKey)
  const { manifest, tableData } = parseContainer(gzipped)
  console.log(
    `Backup from ${manifest.createdAt} · ${manifest.tables.length} tables · ${manifest.sequences.length} sequences`,
  )
  console.log(`Migration tag at dump time: ${manifest.migrationTag ?? "(unknown)"}`)

  const client = new Client({ connectionString: target })
  await client.connect()
  try {
    await client.query("SET session_replication_role = replica")

    // Resolve which manifest tables exist in the target.
    const present: { name: string; expected: number }[] = []
    for (const t of manifest.tables) {
      const exists = await client.query(`SELECT to_regclass($1) AS oid`, [`public.${t.name}`])
      if (exists.rows[0].oid) present.push({ name: t.name, expected: t.rows })
      else console.warn(`  ⚠ skip ${t.name}: not present in target (run db:migrate first?)`)
    }

    // Truncate ALL of them in ONE statement, up front. Doing it per-table with
    // CASCADE would let a later table's truncate wipe an already-loaded table
    // that references it; emptying everything together satisfies the FK checks
    // and leaves only inserts in the load phase below.
    if (present.length > 0) {
      const list = present.map((t) => `public.${quoteIdent(t.name)}`).join(", ")
      await client.query(`TRUNCATE ${list} CASCADE`)
    }

    // Load. session_replication_role=replica means insert order/FKs don't matter.
    for (const t of present) {
      const data = tableData.get(t.name)
      if (!data) {
        console.warn(`  ⚠ skip ${t.name}: no data section in backup`)
        continue
      }
      await new Promise<void>((resolve, reject) => {
        const stream = client.query(copyFrom(`COPY public.${quoteIdent(t.name)} FROM STDIN`))
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

    await client.query("SET session_replication_role = DEFAULT")

    // Verify AFTER every load + truncate is done — counting earlier would miss
    // a later cascade.
    const restored: { name: string; rows: number; expected: number }[] = []
    for (const t of present) {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.${quoteIdent(t.name)}`,
      )
      const got = Number(rows[0].n)
      restored.push({ name: t.name, rows: got, expected: t.expected })
      console.log(
        `  ${got === t.expected ? "✓" : "✗"} ${t.name}: ${got} rows (expected ${t.expected})`,
      )
    }

    const mismatches = restored.filter((r) => r.rows !== r.expected)
    if (mismatches.length) {
      console.error("✗ Row-count mismatches:")
      for (const m of mismatches)
        console.error(`    ${m.name}: got ${m.rows}, expected ${m.expected}`)
      process.exitCode = 1
    } else {
      console.log(`✓ Restore complete — all ${restored.length} tables match expected row counts.`)
    }
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
