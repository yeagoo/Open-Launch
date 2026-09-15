#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import { is } from "drizzle-orm"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import { Client } from "pg"

import * as schema from "../drizzle/db/schema"
import { orderHandWrittenMigrations } from "./lib/migration-order"

const repositoryRoot = resolve(import.meta.dirname, "..")
const migrationsDirectory = resolve(repositoryRoot, "drizzle/migrations")
const trackerTable = "manual_migrations_applied"

type ActualColumn = {
  table_name: string
  column_name: string
  formatted_type: string
  is_not_null: boolean
  is_primary: boolean
}

function assertReleaseDatabaseUrl(connectionString: string): URL {
  const url = new URL(connectionString)
  const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"])
  const databaseName = url.pathname.slice(1)
  if (!allowedHosts.has(url.hostname) || !databaseName.startsWith("open_launch_release_test")) {
    throw new Error(
      "RELEASE_TEST_DATABASE_URL must target a loopback database named open_launch_release_test*",
    )
  }
  return url
}

function expectedType(sqlType: string): string {
  if (sqlType === "serial") return "integer"
  if (sqlType === "timestamp") return "timestamp without time zone"
  // Drizzle represents fractional timestamp precision as `timestamp (3)`,
  // while PostgreSQL's catalog formatter emits the equivalent `timestamp(3)`.
  // Normalize that presentation-only difference before comparing the schema.
  if (/^timestamp \(\d+\) with time zone$/.test(sqlType)) {
    return sqlType.replace("timestamp (", "timestamp(")
  }
  const varchar = /^varchar\((\d+)\)$/.exec(sqlType)
  if (varchar) return `character varying(${varchar[1]})`
  return sqlType.replace(/,\s+/g, ",")
}

function difference(left: Iterable<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort()
}

async function assertInitiallyEmpty(client: Client) {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  )
  if (result.rows.length > 0) {
    throw new Error(
      `release migration test requires an empty public schema; found: ${result.rows
        .map((row) => row.table_name)
        .join(", ")}`,
    )
  }
}

async function expectedMigrationFiles() {
  const journal = JSON.parse(
    await readFile(join(migrationsDirectory, "meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> }
  const journalFiles = new Set(journal.entries.map((entry) => `${entry.tag}.sql`))
  const sqlFiles = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort()
  const manualFiles = orderHandWrittenMigrations(
    sqlFiles.filter((filename) => !journalFiles.has(filename)),
  )
  return { journal, manualFiles }
}

async function assertMigrationTrackers(client: Client) {
  const { journal, manualFiles } = await expectedMigrationFiles()
  const drizzleResult = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations`,
  )
  const drizzleCount = Number(drizzleResult.rows[0]?.count ?? 0)
  if (drizzleCount !== journal.entries.length) {
    throw new Error(
      `Drizzle migration tracker mismatch: expected ${journal.entries.length}, got ${drizzleCount}`,
    )
  }

  const trackerResult = await client.query<{ filename: string; content_hash: string }>(
    `SELECT filename, content_hash FROM ${trackerTable} ORDER BY filename`,
  )
  const tracked = new Map(trackerResult.rows.map((row) => [row.filename, row.content_hash]))
  const expectedSet = new Set(manualFiles)
  const missing = difference(manualFiles, new Set(tracked.keys()))
  const unexpected = difference(tracked.keys(), expectedSet)
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `manual migration tracker mismatch; missing=[${missing.join(", ")}], unexpected=[${unexpected.join(", ")}]`,
    )
  }

  for (const filename of manualFiles) {
    const content = await readFile(join(migrationsDirectory, filename), "utf8")
    const expectedHash = createHash("sha256").update(content).digest("hex")
    if (tracked.get(filename) !== expectedHash) {
      throw new Error(`manual migration hash drift: ${filename}`)
    }
  }
}

async function assertSchemaContract(client: Client) {
  const expectedTables = new Map<
    string,
    {
      columns: Map<string, { type: string; notNull: boolean; primary: boolean }>
      indexes: Set<string>
    }
  >()

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const config = getTableConfig(value)
    const primaryColumns = new Set([
      ...config.columns.filter((column) => column.primary).map((column) => column.name),
      ...config.primaryKeys.flatMap((primaryKey) =>
        primaryKey.columns.map((column) => column.name),
      ),
    ])
    expectedTables.set(config.name, {
      columns: new Map(
        config.columns.map((column) => [
          column.name,
          {
            type: expectedType(column.getSQLType()),
            notNull: column.notNull,
            primary: primaryColumns.has(column.name),
          },
        ]),
      ),
      indexes: new Set(
        config.indexes
          .map((index) => index.config.name)
          .filter((name): name is string => Boolean(name)),
      ),
    })
  }

  const actualTableResult = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
  )
  const ignoredTables = new Set([trackerTable])
  const actualTables = new Set(
    actualTableResult.rows
      .map((row) => row.table_name)
      .filter((tableName) => !ignoredTables.has(tableName)),
  )
  const expectedTableNames = new Set(expectedTables.keys())
  const missingTables = difference(expectedTableNames, actualTables)
  const unexpectedTables = difference(actualTables, expectedTableNames)
  if (missingTables.length > 0 || unexpectedTables.length > 0) {
    throw new Error(
      `runtime table drift; missing=[${missingTables.join(", ")}], unexpected=[${unexpectedTables.join(", ")}]`,
    )
  }

  const columnResult = await client.query<ActualColumn>(
    `SELECT
       c.relname AS table_name,
       a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
       a.attnotnull AS is_not_null,
       EXISTS (
         SELECT 1
           FROM pg_catalog.pg_index i
          WHERE i.indrelid = c.oid
            AND i.indisprimary
            AND a.attnum = ANY(i.indkey)
       ) AS is_primary
     FROM pg_catalog.pg_attribute a
     JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum`,
  )
  const columnsByTable = new Map<string, Map<string, ActualColumn>>()
  for (const column of columnResult.rows) {
    const columns = columnsByTable.get(column.table_name) ?? new Map<string, ActualColumn>()
    columns.set(column.column_name, column)
    columnsByTable.set(column.table_name, columns)
  }

  for (const [tableName, expected] of expectedTables) {
    const actual = columnsByTable.get(tableName) ?? new Map()
    const missingColumns = difference(expected.columns.keys(), new Set(actual.keys()))
    const unexpectedColumns = difference(actual.keys(), new Set(expected.columns.keys()))
    if (missingColumns.length > 0 || unexpectedColumns.length > 0) {
      throw new Error(
        `${tableName} column drift; missing=[${missingColumns.join(", ")}], unexpected=[${unexpectedColumns.join(", ")}]`,
      )
    }
    for (const [columnName, expectedColumn] of expected.columns) {
      const actualColumn = actual.get(columnName)
      if (
        !actualColumn ||
        actualColumn.formatted_type !== expectedColumn.type ||
        actualColumn.is_not_null !== expectedColumn.notNull ||
        actualColumn.is_primary !== expectedColumn.primary
      ) {
        throw new Error(
          `${tableName}.${columnName} drift; expected=${JSON.stringify(expectedColumn)}, actual=${JSON.stringify(actualColumn)}`,
        )
      }
    }
  }

  const indexResult = await client.query<{ tablename: string; indexname: string }>(
    `SELECT tablename, indexname
       FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'`,
  )
  const actualIndexes = new Map<string, Set<string>>()
  for (const row of indexResult.rows) {
    const indexes = actualIndexes.get(row.tablename) ?? new Set<string>()
    indexes.add(row.indexname)
    actualIndexes.set(row.tablename, indexes)
  }
  for (const [tableName, expected] of expectedTables) {
    const missingIndexes = difference(expected.indexes, actualIndexes.get(tableName) ?? new Set())
    if (missingIndexes.length > 0) {
      throw new Error(`${tableName} declared index drift; missing=[${missingIndexes.join(", ")}]`)
    }
  }
}

/** Verify the comment tombstone trigger can be created and enforces its invariant. */
async function assertCommentTombstoneGuard(client: Client) {
  const page = `release-comment-guard-${randomUUID()}`
  const content = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "original" }] }],
  })
  const replacement = JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "replacement" }] }],
  })

  const inserted = await client.query<{ id: number }>(
    `INSERT INTO fuma_comments (page, author, content)
     VALUES ($1, $2, $3::json)
     RETURNING id`,
    [page, "release-guard-author", content],
  )
  const id = inserted.rows[0]?.id
  if (!id) throw new Error("failed to create comment-tombstone migration fixture")

  try {
    await client.query(
      `UPDATE fuma_comments
          SET hidden_at = now(), hidden_by = $2
        WHERE id = $1`,
      [id, "release-guard-admin"],
    )

    try {
      await client.query(`UPDATE fuma_comments SET content = $2::json WHERE id = $1`, [
        id,
        replacement,
      ])
      throw new Error("comment tombstone trigger allowed a content restore")
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "comment tombstone trigger allowed a content restore"
      ) {
        throw error
      }
      const code = (error as { code?: unknown } | null)?.code
      if (code !== "23514") {
        throw new Error(`comment tombstone trigger returned unexpected error code: ${String(code)}`)
      }
    }
  } finally {
    await client.query(`DELETE FROM fuma_comments WHERE id = $1`, [id])
  }
}

async function main() {
  const connectionString = process.env.RELEASE_TEST_DATABASE_URL
  if (!connectionString) throw new Error("RELEASE_TEST_DATABASE_URL is not set")
  assertReleaseDatabaseUrl(connectionString)

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await assertInitiallyEmpty(client)
  } finally {
    await client.end()
  }

  const migration = spawnSync("bun", ["run", "db:migrate"], {
    cwd: repositoryRoot,
    env: { ...process.env, DATABASE_URL: connectionString },
    encoding: "utf8",
    stdio: "inherit",
  })
  if (migration.error) throw migration.error
  if (migration.status !== 0) {
    throw new Error(`full migration runner failed with exit code ${migration.status}`)
  }

  const verificationClient = new Client({ connectionString })
  await verificationClient.connect()
  try {
    await assertMigrationTrackers(verificationClient)
    await assertSchemaContract(verificationClient)
    await assertCommentTombstoneGuard(verificationClient)
  } finally {
    await verificationClient.end()
  }
  console.log("Release database gate passed: full migration history and runtime schema agree.")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
