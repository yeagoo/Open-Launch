#!/usr/bin/env bun
/**
 * Local test environment for the app: a throwaway PostgreSQL cluster plus a
 * seeded home-page dataset.
 *
 * Why this exists: the redesigned home page could not be verified against the
 * real database (production is not an acceptable target, and tunnelling the
 * production Postgres through SSH turned out to be a bad idea — see
 * docs/frontend-redesign-uneed-style.md §14). This gives the same verification
 * with none of that blast radius.
 *
 * Everything lives under `artifacts/local-pg/` (gitignored) and listens on
 * 127.0.0.1:55432 only, so it cannot collide with a real deployment.
 *
 * Usage:
 *   bun scripts/local-db.ts start     # initdb (first run) + start the server
 *   bun scripts/local-db.ts status
 *   bun scripts/local-db.ts seed      # (re)apply schema + fixture data
 *   bun scripts/local-db.ts reset     # drop the database, migrate, seed
 *   bun scripts/local-db.ts stop
 *
 * Then, in another terminal:
 *   HOME_V2=1 bun run dev
 *
 * `.env.local` already points DATABASE_URL at this cluster.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const PG_BIN = process.env.LOCAL_PG_BIN ?? "/usr/lib/postgresql/18/bin"
const ROOT = resolve(import.meta.dirname, "..")
const PG_ROOT = resolve(ROOT, "artifacts/local-pg")
const DATA_DIR = resolve(PG_ROOT, "data")
const LOG_FILE = resolve(PG_ROOT, "server.log")
const PORT = process.env.LOCAL_PG_PORT ?? "55432"
const DB_NAME = "open_launch_local"
const DATABASE_URL = `postgresql://postgres@127.0.0.1:${PORT}/${DB_NAME}`

function bin(name: string): string {
  const path = resolve(PG_BIN, name)
  if (!existsSync(path)) {
    throw new Error(`missing ${name} at ${path} — set LOCAL_PG_BIN to a PostgreSQL bin dir`)
  }
  return path
}

function run(command: string, args: string[], env: Record<string, string> = {}): void {
  const result = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env } })
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed`)
}

function capture(command: string, args: string[]): { status: number; stdout: string } {
  try {
    const stdout = execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { status: 0, stdout }
  } catch (error) {
    const failure = error as { status?: number; stdout?: string }
    return { status: failure.status ?? 1, stdout: failure.stdout ?? "" }
  }
}

function isRunning(): boolean {
  const { status } = capture(bin("pg_ctl"), ["-D", DATA_DIR, "status"])
  return status === 0
}

/** `pg_ctl` needs the server to be reachable before any psql call. */
function waitForReady(timeoutMs = 15_000): boolean {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { status } = capture(bin("psql"), [
      "-h",
      "127.0.0.1",
      "-p",
      PORT,
      "-U",
      "postgres",
      "-tAc",
      "select 1",
    ])
    if (status === 0) return true
    execFileSync("sleep", ["1"])
  }
  return false
}

function start(): void {
  if (isRunning()) {
    console.log(`[local-db] already running on 127.0.0.1:${PORT}`)
    return
  }
  mkdirSync(PG_ROOT, { recursive: true })

  if (!existsSync(resolve(DATA_DIR, "PG_VERSION"))) {
    console.log(`[local-db] initdb → ${DATA_DIR}`)
    run(bin("initdb"), [
      "-D",
      DATA_DIR,
      "-U",
      "postgres",
      "--auth=trust",
      "--encoding=UTF8",
      "--locale=C",
    ])
  }

  console.log(`[local-db] starting on 127.0.0.1:${PORT}`)
  run(bin("pg_ctl"), [
    "-D",
    DATA_DIR,
    "-l",
    LOG_FILE,
    "-o",
    `-p ${PORT} -k ${PG_ROOT} -c listen_addresses=127.0.0.1`,
    "-w",
    "start",
  ])

  if (!waitForReady()) throw new Error(`server did not become ready — see ${LOG_FILE}`)
  console.log(`[local-db] ready · DATABASE_URL=${DATABASE_URL}`)
}

function stop(): void {
  if (!isRunning()) {
    console.log("[local-db] not running")
    return
  }
  run(bin("pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "stop"])
  console.log("[local-db] stopped")
}

function status(): void {
  const running = isRunning()
  console.log(`[local-db] ${running ? "running" : "stopped"} · data=${DATA_DIR} · port=${PORT}`)
  if (!running) return
  const { stdout } = capture(bin("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    PORT,
    "-U",
    "postgres",
    "-d",
    DB_NAME,
    "-tAc",
    `select 'projects=' || (select count(*) from project)
         || ' users=' || (select count(*) from "user")
         || ' comments=' || (select count(*) from fuma_comments)
         || ' posts=' || (select count(*) from blog_article)`,
  ])
  console.log(`[local-db] ${stdout.trim()}`)
}

function ensureDatabase(): void {
  const { stdout } = capture(bin("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    PORT,
    "-U",
    "postgres",
    "-tAc",
    `select 1 from pg_database where datname = '${DB_NAME}'`,
  ])
  if (stdout.trim() === "1") return
  console.log(`[local-db] creating database ${DB_NAME}`)
  run(bin("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    PORT,
    "-U",
    "postgres",
    "-c",
    `CREATE DATABASE ${DB_NAME}`,
  ])
}

function migrate(): void {
  console.log("[local-db] applying migrations")
  run("bun", ["run", "db:migrate"], { DATABASE_URL })
}

function seed(): void {
  console.log("[local-db] seeding home fixture")
  run("bun", ["scripts/seed-local-home-fixture.ts"], { DATABASE_URL })
}

function reset(): void {
  run(bin("psql"), [
    "-h",
    "127.0.0.1",
    "-p",
    PORT,
    "-U",
    "postgres",
    "-c",
    `DROP DATABASE IF EXISTS ${DB_NAME}`,
  ])
  ensureDatabase()
  migrate()
  seed()
}

const action = process.argv[2] ?? "status"

switch (action) {
  case "start":
    start()
    ensureDatabase()
    break
  case "stop":
    stop()
    break
  case "status":
  case "psql":
    status()
    break
  case "migrate":
    ensureDatabase()
    migrate()
    break
  case "seed":
    ensureDatabase()
    seed()
    break
  case "reset":
    ensureDatabase()
    reset()
    break
  case "url":
    console.log(DATABASE_URL)
    break
  default:
    console.error(
      `unknown action: ${action}\n\nusage: bun scripts/local-db.ts <start|stop|status|migrate|seed|reset|url>`,
    )
    process.exit(1)
}
