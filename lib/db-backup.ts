import crypto from "node:crypto"
import { Writable } from "node:stream"
import { createGzip, gunzipSync } from "node:zlib"

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { Client } from "pg"
import { to as copyTo } from "pg-copy-streams"

/**
 * Logical PostgreSQL backup, pure-Node (no pg_dump binary).
 *
 * The Zeabur runtime image has no `pg_dump`, so we build a logical dump with
 * the `pg` driver instead: inside one REPEATABLE READ snapshot we `COPY … TO
 * STDOUT` every public table (PostgreSQL's native COPY text format — the same
 * bytes pg_dump's data sections use) and record each sequence's value. The
 * result is gzipped, envelope-encrypted, and stored as ONE object in a private
 * S3-compatible bucket.
 *
 * Restore model (see scripts/restore-db-backup.ts): provision a DB → run
 * `bun run db:migrate` (schema lives in git) → load this dump's data with
 * `session_replication_role = replica` so FK order doesn't matter. Schema and
 * data are deliberately separated: git owns the schema, this owns the data.
 *
 * NOTE: the `drizzle` schema (drizzle.__drizzle_migrations) is excluded because
 * we only dump `public` BASE TABLEs — `db:migrate` re-establishes it on restore.
 */

// Container framing (plaintext, before gzip): MAGIC | metaLen(u32) | metaJSON |
// then per table: nameLen(u16) | name | dataLen(u64) | copyBytes …
const CONTAINER_MAGIC = Buffer.from("OLBK1\n")
// Encryption framing: MAGIC | headerLen(u32) | headerJSON | ciphertext
const ENC_MAGIC = Buffer.from("OLPW1\n")
// scrypt KDF params, stored in each header so restore re-derives the same key.
// maxmem must exceed 128*N*r (~32MB at N=2^15) — give it headroom.
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 32, maxmem: 64 * 1024 * 1024 }

export const BACKUP_PREFIX = "db/openlaunch/"
export const DEFAULT_RETENTION_DAYS = 30

export interface BackupManifest {
  version: 1 | 2
  createdAt: string
  pgVersion: string
  migrationTag: string | null
  tables: { name: string; rows: number; columns?: string[] }[]
  sequences: { name: string; value: string }[]
}

// ─── Private S3-compatible backup storage ───
// BACKUP_S3_* is the provider-neutral contract used by IDrive E2 and similar
// services. The old BACKUP_R2_* variables remain a fallback so an existing R2
// deployment does not break during a rolling configuration migration.
const BACKUP_S3_REQUIRED = [
  "BACKUP_S3_ACCESS_KEY_ID",
  "BACKUP_S3_SECRET_ACCESS_KEY",
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_ENDPOINT",
  "BACKUP_S3_REGION",
] as const

function configured(value: string | undefined): value is string {
  return Boolean(value?.trim())
}

function normalizedHttpsEndpoint(raw: string): string {
  const candidate = raw.includes("://") ? raw : `https://${raw}`
  let endpoint: URL
  try {
    endpoint = new URL(candidate)
  } catch {
    throw new Error("BACKUP_S3_ENDPOINT must be a valid HTTPS endpoint")
  }
  if (
    endpoint.protocol !== "https:" ||
    !endpoint.hostname ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    (endpoint.pathname !== "" && endpoint.pathname !== "/")
  ) {
    throw new Error(
      "BACKUP_S3_ENDPOINT must be an HTTPS origin without credentials, path, query, or fragment",
    )
  }
  return endpoint.origin
}

function genericS3Configured(): boolean {
  return BACKUP_S3_REQUIRED.some((name) => configured(process.env[name]))
}

export function getBackupStorageClient(): S3Client {
  if (genericS3Configured()) {
    const missing = BACKUP_S3_REQUIRED.filter((name) => !configured(process.env[name]))
    if (missing.length > 0) {
      throw new Error(`Backup S3 not configured: missing ${missing.join(", ")}`)
    }

    return new S3Client({
      region: process.env.BACKUP_S3_REGION!.trim(),
      endpoint: normalizedHttpsEndpoint(process.env.BACKUP_S3_ENDPOINT!.trim()),
      credentials: {
        accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID!.trim(),
        secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY!.trim(),
      },
      forcePathStyle: true,
    })
  }

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.BACKUP_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.BACKUP_R2_SECRET_ACCESS_KEY
  if (!configured(accountId) || !configured(accessKeyId) || !configured(secretAccessKey)) {
    throw new Error(
      "Backup storage not configured: set all BACKUP_S3_* variables or the legacy R2_ACCOUNT_ID + BACKUP_R2_ACCESS_KEY_ID + BACKUP_R2_SECRET_ACCESS_KEY variables",
    )
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId.trim()}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKeyId.trim(), secretAccessKey: secretAccessKey.trim() },
  })
}

// Backward-compatible name for the existing restore script and any operator
// tooling. It now resolves either generic S3 or the legacy R2 configuration.
export const getBackupR2Client = getBackupStorageClient

export function backupBucket(): string {
  if (genericS3Configured()) {
    const bucket = process.env.BACKUP_S3_BUCKET
    if (!configured(bucket)) throw new Error("BACKUP_S3_BUCKET not configured")
    return bucket.trim()
  }
  const bucket = process.env.BACKUP_R2_BUCKET
  if (!configured(bucket)) throw new Error("BACKUP_R2_BUCKET not configured")
  return bucket.trim()
}

// ─── Password encryption: key = scrypt(passphrase, random salt) → AES-256-GCM.
//     The same passphrase (BACKUP_PASSPHRASE) encrypts and restores. The salt +
//     KDF params live in the header so restore re-derives the identical key. ──
export function passphraseEncrypt(plaintext: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = crypto.scryptSync(passphrase, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem,
  })
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const header = Buffer.from(
    JSON.stringify({
      v: 1,
      cipher: "aes-256-gcm",
      kdf: "scrypt",
      N: SCRYPT.N,
      r: SCRYPT.r,
      p: SCRYPT.p,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    }),
    "utf8",
  )
  const headerLen = Buffer.alloc(4)
  headerLen.writeUInt32BE(header.length, 0)
  return Buffer.concat([ENC_MAGIC, headerLen, header, ciphertext])
}

export function passphraseDecrypt(blob: Buffer, passphrase: string): Buffer {
  if (!blob.subarray(0, ENC_MAGIC.length).equals(ENC_MAGIC)) {
    throw new Error("Not an OLPW1 backup")
  }
  let off = ENC_MAGIC.length
  const headerLen = blob.readUInt32BE(off)
  off += 4
  const header = JSON.parse(blob.subarray(off, off + headerLen).toString("utf8"))
  off += headerLen
  const ciphertext = blob.subarray(off)
  const key = crypto.scryptSync(passphrase, Buffer.from(header.salt, "base64"), SCRYPT.keylen, {
    N: header.N,
    r: header.r,
    p: header.p,
    maxmem: SCRYPT.maxmem,
  })
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64"))
  decipher.setAuthTag(Buffer.from(header.authTag, "base64"))
  // Wrong passphrase → GCM auth fails here with a clear error.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// ─── Container parse (restore side): gunzip → {manifest, table → COPY bytes} ──
export function parseContainer(gzipped: Buffer): {
  manifest: BackupManifest
  tableData: Map<string, Buffer>
} {
  const buf = gunzipSync(gzipped)
  if (!buf.subarray(0, CONTAINER_MAGIC.length).equals(CONTAINER_MAGIC)) {
    throw new Error("Not an OLBK1 container")
  }
  let off = CONTAINER_MAGIC.length
  const metaLen = buf.readUInt32BE(off)
  off += 4
  const manifest = JSON.parse(buf.subarray(off, off + metaLen).toString("utf8")) as BackupManifest
  off += metaLen
  const tableData = new Map<string, Buffer>()
  while (off < buf.length) {
    const nameLen = buf.readUInt16BE(off)
    off += 2
    const name = buf.subarray(off, off + nameLen).toString("utf8")
    off += nameLen
    const dataLen = Number(buf.readBigUInt64BE(off))
    off += 8
    tableData.set(name, buf.subarray(off, off + dataLen))
    off += dataLen
  }
  return { manifest, tableData }
}

// ─── Helpers ──
function writeChunk(stream: Writable, buf: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(buf, (err) => (err ? reject(err) : undefined))
    // Respect backpressure so gzip's internal buffer can't balloon.
    if (stream.writableNeedDrain) stream.once("drain", resolve)
    else resolve()
  })
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on("data", (c: Buffer) => chunks.push(c))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
  })
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function copyTableExpression(name: string, columns?: string[]): string {
  const table = `public.${quoteIdent(name)}`
  if (!columns) return table
  if (columns.length === 0) throw new Error(`table ${name} has no backup columns`)
  return `${table} (${columns.map(quoteIdent).join(", ")})`
}

// ─── Build the encrypted backup blob from a live snapshot ──
export async function createDatabaseBackup(passphrase: string): Promise<{
  body: Buffer
  manifest: BackupManifest
}> {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    // One consistent snapshot for counts + every COPY + sequence values.
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")

    const { rows: tableRows } = await client.query<{ name: string }>(
      `SELECT c.relname AS name
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname`,
    )
    const tableNames = tableRows.map((r) => r.name)

    const tables: { name: string; rows: number; columns: string[] }[] = []
    for (const name of tableNames) {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.${quoteIdent(name)}`,
      )
      const columnResult = await client.query<{ name: string }>(
        `SELECT a.attname AS name
           FROM pg_attribute a
          WHERE a.attrelid = $1::regclass
            AND a.attnum > 0
            AND NOT a.attisdropped
          ORDER BY a.attnum`,
        [`public.${quoteIdent(name)}`],
      )
      const columns = columnResult.rows.map((column) => column.name)
      if (columns.length === 0) throw new Error(`table ${name} has no visible columns`)
      tables.push({ name, rows: Number(rows[0].n), columns })
    }

    const { rows: seqRows } = await client.query<{ name: string; value: string }>(
      `SELECT sequencename AS name, last_value::text AS value
         FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL`,
    )

    // Schema-version tag for the manifest. Most migrations are applied via
    // scripts/apply-pending-sql.ts into public.manual_migrations_applied, so
    // that tracker is the real "latest schema" signal; drizzle.__drizzle_migrations
    // only covers the generated journal (0000–0006) and never advances past it.
    // Prefer the manual tracker, fall back to the drizzle hash. Probe with
    // to_regclass first: catching an undefined-table error inside PostgreSQL
    // would still abort this transaction and poison every later query.
    let migrationTag: string | null = null
    const manualTracker = await client.query<{ relation: string | null }>(
      "SELECT to_regclass('public.manual_migrations_applied')::text AS relation",
    )
    if (manualTracker.rows[0]?.relation) {
      const { rows } = await client.query<{ filename: string }>(
        `SELECT filename FROM public.manual_migrations_applied
          ORDER BY applied_at DESC, filename DESC LIMIT 1`,
      )
      migrationTag = rows[0]?.filename ?? null
    }
    if (!migrationTag) {
      const drizzleTracker = await client.query<{ relation: string | null }>(
        "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS relation",
      )
      if (drizzleTracker.rows[0]?.relation) {
        const { rows } = await client.query<{ hash: string }>(
          `SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1`,
        )
        migrationTag = rows[0]?.hash ?? null
      }
    }

    const { rows: verRows } = await client.query<{ v: string }>(`SELECT version() AS v`)

    const manifest: BackupManifest = {
      version: 2,
      createdAt: new Date().toISOString(),
      pgVersion: verRows[0].v,
      migrationTag,
      tables,
      sequences: seqRows,
    }

    // Stream container → gzip, buffering ONE table at a time (peak memory =
    // largest table's COPY output, not the whole DB).
    const gzip = createGzip({ level: 6 })
    const out: Buffer[] = []
    gzip.on("data", (c: Buffer) => out.push(c))
    const gzDone = new Promise<void>((resolve, reject) => {
      gzip.on("end", resolve)
      gzip.on("error", reject)
    })

    const metaJson = Buffer.from(JSON.stringify(manifest), "utf8")
    const metaLen = Buffer.alloc(4)
    metaLen.writeUInt32BE(metaJson.length, 0)
    await writeChunk(gzip, Buffer.concat([CONTAINER_MAGIC, metaLen, metaJson]))

    for (const { name, columns } of tables) {
      const copyStream = client.query(
        copyTo(`COPY ${copyTableExpression(name, columns)} TO STDOUT`),
      )
      const data = await streamToBuffer(copyStream as unknown as NodeJS.ReadableStream)
      const nameBuf = Buffer.from(name, "utf8")
      const header = Buffer.alloc(2 + nameBuf.length + 8)
      header.writeUInt16BE(nameBuf.length, 0)
      nameBuf.copy(header, 2)
      header.writeBigUInt64BE(BigInt(data.length), 2 + nameBuf.length)
      await writeChunk(gzip, header)
      await writeChunk(gzip, data)
    }

    await client.query("COMMIT")
    gzip.end()
    await gzDone

    const gzipped = Buffer.concat(out)
    const body = passphraseEncrypt(gzipped, passphrase)
    return { body, manifest }
  } finally {
    await client.end()
  }
}

export function buildObjectKey(date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const stamp = date.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19)
  return `${BACKUP_PREFIX}${y}/${m}/openlaunch-${stamp}.olbk.enc`
}

export async function uploadBackup(body: Buffer, key: string): Promise<void> {
  await getBackupStorageClient().send(
    new PutObjectCommand({
      Bucket: backupBucket(),
      Key: key,
      Body: body,
      ContentType: "application/octet-stream",
    }),
  )
}

/**
 * Delete backups older than the retention window. Call ONLY after a successful
 * upload so a failed run never prunes the good history.
 */
export async function pruneOldBackups(retentionDays = DEFAULT_RETENTION_DAYS): Promise<number> {
  const client = getBackupStorageClient()
  const bucket = backupBucket()
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  let deleted = 0
  let token: string | undefined
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: BACKUP_PREFIX, ContinuationToken: token }),
    )
    const stale = (page.Contents ?? []).filter(
      (o) => o.Key && o.LastModified && o.LastModified.getTime() < cutoff,
    )
    for (let i = 0; i < stale.length; i += 1000) {
      const batch = stale.slice(i, i + 1000)
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((o) => ({ Key: o.Key! })), Quiet: true },
        }),
      )
      deleted += batch.length
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return deleted
}
