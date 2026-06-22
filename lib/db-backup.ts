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
 * R2 bucket.
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
// Envelope framing: MAGIC | headerLen(u32) | headerJSON | ciphertext
const ENVELOPE_MAGIC = Buffer.from("OLENC1\n")

export const BACKUP_PREFIX = "db/openlaunch/"
export const DEFAULT_RETENTION_DAYS = 30

export interface BackupManifest {
  version: 1
  createdAt: string
  pgVersion: string
  migrationTag: string | null
  tables: { name: string; rows: number }[]
  sequences: { name: string; value: string }[]
}

// ─── R2 (separate PRIVATE bucket + scoped creds; endpoint reuses the account) ──
export function getBackupR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.BACKUP_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.BACKUP_R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Backup R2 not configured: need R2_ACCOUNT_ID + BACKUP_R2_ACCESS_KEY_ID + BACKUP_R2_SECRET_ACCESS_KEY",
    )
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export function backupBucket(): string {
  const b = process.env.BACKUP_R2_BUCKET
  if (!b) throw new Error("BACKUP_R2_BUCKET not configured")
  return b
}

// ─── Envelope encryption: random AES-256-GCM data key, RSA-OAEP-wrapped with
//     the public key. The private key (offline) is required to restore. ──
export function envelopeEncrypt(plaintext: Buffer, publicKeyPem: string): Buffer {
  const aesKey = crypto.randomBytes(32)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  const wrappedKey = crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    aesKey,
  )
  const header = Buffer.from(
    JSON.stringify({
      v: 1,
      cipher: "aes-256-gcm",
      keyWrap: "rsa-oaep-sha256",
      wrappedKey: wrappedKey.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    }),
    "utf8",
  )
  const headerLen = Buffer.alloc(4)
  headerLen.writeUInt32BE(header.length, 0)
  return Buffer.concat([ENVELOPE_MAGIC, headerLen, header, ciphertext])
}

export function envelopeDecrypt(blob: Buffer, privateKeyPem: string): Buffer {
  if (!blob.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)) {
    throw new Error("Not an OLENC1 backup envelope")
  }
  let off = ENVELOPE_MAGIC.length
  const headerLen = blob.readUInt32BE(off)
  off += 4
  const header = JSON.parse(blob.subarray(off, off + headerLen).toString("utf8"))
  off += headerLen
  const ciphertext = blob.subarray(off)
  const aesKey = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(header.wrappedKey, "base64"),
  )
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, Buffer.from(header.iv, "base64"))
  decipher.setAuthTag(Buffer.from(header.authTag, "base64"))
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

// ─── Build the encrypted backup blob from a live snapshot ──
export async function createDatabaseBackup(publicKeyPem: string): Promise<{
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

    const tables: { name: string; rows: number }[] = []
    for (const name of tableNames) {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.${quoteIdent(name)}`,
      )
      tables.push({ name, rows: Number(rows[0].n) })
    }

    const { rows: seqRows } = await client.query<{ name: string; value: string }>(
      `SELECT sequencename AS name, last_value::text AS value
         FROM pg_sequences WHERE schemaname = 'public' AND last_value IS NOT NULL`,
    )

    let migrationTag: string | null = null
    try {
      const { rows } = await client.query<{ hash: string }>(
        `SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1`,
      )
      migrationTag = rows[0]?.hash ?? null
    } catch {
      // drizzle schema may not exist in some envs — best-effort metadata only.
    }

    const { rows: verRows } = await client.query<{ v: string }>(`SELECT version() AS v`)

    const manifest: BackupManifest = {
      version: 1,
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

    for (const { name } of tables) {
      const copyStream = client.query(copyTo(`COPY public.${quoteIdent(name)} TO STDOUT`))
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
    const body = envelopeEncrypt(gzipped, publicKeyPem)
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
  await getBackupR2Client().send(
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
  const client = getBackupR2Client()
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
