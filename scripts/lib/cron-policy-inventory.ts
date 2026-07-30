import { readdir, readFile } from "node:fs/promises"
import { dirname, join, relative, resolve, sep } from "node:path"

import { orderHandWrittenMigrations } from "./migration-order"

export interface CronScheduleInventory {
  migrationSchedules: Map<string, string>
  routePaths: Set<string>
}

export interface CronPolicyBackfill {
  misfirePolicy: string
  maxCatchUpMinutes: number
  retryPolicy: string
  maxAttempts: number
  concurrencyGroup: string
  idempotencyClass: string
  requiresScheduledFor: boolean
}

const INSERT_STATEMENT =
  /INSERT\s+INTO\s+"cron_schedule"\s*\([\s\S]+?\)\s*VALUES\s+([\s\S]*?)(?:\s+ON\s+CONFLICT[\s\S]*)?$/i
const INSERT_SCHEDULE =
  /\(\s*'(\/api\/cron\/[^']+)'\s*,\s*'(?:(?:'')|[^'])*'\s*,\s*'([^']+)'\s*,\s*(?:true|false)/g
const UPDATE_SCHEDULE =
  /UPDATE\s+"cron_schedule"\s+SET\s+([\s\S]*?)WHERE\s+"path"\s*=\s*'(\/api\/cron\/[^']+)'\s*;/gi
const DELETE_SCHEDULE =
  /DELETE\s+FROM\s+"cron_schedule"\s+WHERE\s+"path"\s*=\s*'(\/api\/cron\/[^']+)'\s*;/gi
const UPDATED_CRON_EXPRESSION = /"cron_expression"\s*=\s*'([^']+)'/i
const POLICY_BACKFILL_TUPLE =
  /\(\s*'(\/api\/cron\/[^']+)'\s*,\s*'(skip|latest|bounded-all)'\s*,\s*(\d+)\s*,\s*'(none|next-schedule|transient-bounded|handler-managed)'\s*,\s*(\d+)\s*,\s*'([^']+)'\s*,\s*'(strict|guarded|convergent|non-idempotent)'\s*,\s*(true|false)\s*\)/g

export function deriveCronSchedulesFromSqlFiles(
  files: readonly { name: string; sql: string }[],
): Map<string, string> {
  const schedules = new Map<string, string>()

  // Callers must provide the same order used by the real migration runners.
  // Lexical order is incorrect for legacy/interleaved non-numbered files.
  for (const file of files) {
    const sql = stripSqlComments(file.sql)
    for (const statement of splitSqlStatements(sql)) {
      const values = statement.match(INSERT_STATEMENT)?.[1]
      if (!values) continue
      for (const match of values.matchAll(INSERT_SCHEDULE)) {
        schedules.set(match[1], match[2])
      }
    }
    for (const match of sql.matchAll(UPDATE_SCHEDULE)) {
      const expression = match[1].match(UPDATED_CRON_EXPRESSION)?.[1]
      if (expression) schedules.set(match[2], expression)
    }
    for (const match of sql.matchAll(DELETE_SCHEDULE)) {
      schedules.delete(match[1])
    }
  }

  return schedules
}

export function deriveCronPolicyBackfill(sql: string): Map<string, CronPolicyBackfill> {
  const policies = new Map<string, CronPolicyBackfill>()
  for (const match of stripSqlComments(sql).matchAll(POLICY_BACKFILL_TUPLE)) {
    policies.set(match[1], {
      misfirePolicy: match[2],
      maxCatchUpMinutes: Number(match[3]),
      retryPolicy: match[4],
      maxAttempts: Number(match[5]),
      concurrencyGroup: match[6],
      idempotencyClass: match[7],
      requiresScheduledFor: match[8] === "true",
    })
  }
  return policies
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let start = 0
  let inString = false

  for (let index = 0; index < sql.length; index += 1) {
    if (sql[index] === "'") {
      if (inString && sql[index + 1] === "'") {
        index += 1
        continue
      }
      inString = !inString
      continue
    }
    if (!inString && sql[index] === ";") {
      const statement = sql.slice(start, index).trim()
      if (statement) statements.push(statement)
      start = index + 1
    }
  }

  const trailing = sql.slice(start).trim()
  if (trailing) statements.push(trailing)
  return statements
}

function stripSqlComments(sql: string): string {
  let output = ""
  let inString = false
  let index = 0

  while (index < sql.length) {
    const current = sql[index]
    const next = sql[index + 1]

    if (current === "'") {
      output += current
      if (inString && next === "'") {
        output += next
        index += 2
        continue
      }
      inString = !inString
      index += 1
      continue
    }

    if (!inString && current === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index += 1
      output += "\n"
      index += 1
      continue
    }

    if (!inString && current === "/" && next === "*") {
      index += 2
      while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) {
        if (sql[index] === "\n") output += "\n"
        index += 1
      }
      index += 2
      continue
    }

    output += current
    index += 1
  }

  return output
}

export async function readCronScheduleInventory(
  repositoryRoot: string,
): Promise<CronScheduleInventory> {
  const migrationsDirectory = resolve(repositoryRoot, "drizzle/migrations")
  const allMigrationNames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort()
  const journal = JSON.parse(
    await readFile(join(migrationsDirectory, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> }
  const journalNames = journal.entries.map((entry) => `${entry.tag}.sql`)
  const journalNameSet = new Set(journalNames)
  const missingJournalFiles = journalNames.filter((name) => !allMigrationNames.includes(name))
  if (missingJournalFiles.length > 0) {
    throw new Error(
      `Drizzle journal migration files are missing: ${missingJournalFiles.join(", ")}`,
    )
  }
  const migrationNames = [
    ...journalNames,
    ...orderHandWrittenMigrations(allMigrationNames.filter((name) => !journalNameSet.has(name))),
  ]
  const sqlFiles = await Promise.all(
    migrationNames.map(async (name) => ({
      name,
      sql: await readFile(join(migrationsDirectory, name), "utf8"),
    })),
  )

  const routeRoot = resolve(repositoryRoot, "app/api/cron")
  const routeFiles = await findRouteFiles(routeRoot)
  const routePaths = new Set(
    routeFiles
      .map((file) => {
        const directory = relative(routeRoot, dirname(file))
        return `/api/cron/${directory.split(sep).join("/")}`
      })
      .filter((path) => path !== "/api/cron/dispatch"),
  )

  return {
    migrationSchedules: deriveCronSchedulesFromSqlFiles(sqlFiles),
    routePaths,
  }
}

async function findRouteFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return findRouteFiles(path)
      return entry.isFile() && entry.name === "route.ts" ? [path] : []
    }),
  )

  return nested.flat()
}
