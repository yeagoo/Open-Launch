import { createServer, type Server } from "node:http"

import { closeDatabasePool } from "@/drizzle/db"

import { resolveCronRuntimeAuthority, schedulerModeUsesLedgerWorker } from "@/lib/cron-cutover"
import { pingCronHeartbeat, type CronHeartbeatState } from "@/lib/cron-heartbeat"
import { CronLedgerConfigurationError, resolveInternalCronBaseUrl } from "@/lib/cron-ledger-core"
import { cronLedgerBacklogSummary, runCronLedgerBatch } from "@/lib/cron-ledger-db"
import { logger } from "@/lib/observability/structured-logger"

interface WorkerState {
  running: boolean
  startedAt: number
  tickStartedAt: number | null
  lastSuccessfulTickAt: number | null
  lastErrorAt: number | null
  lastError: string | null
}

const CHECK_ARGUMENT = "--check"
const args = process.argv.slice(2)
if (args.some((argument) => argument !== CHECK_ARGUMENT) || args.length > 1) {
  throw new CronLedgerConfigurationError("cron worker accepts only the optional --check argument")
}

if (args[0] === CHECK_ARGUMENT) {
  logger.info("cron_worker_check", {
    status: "ok",
    provider: "cron",
    context: {
      status: "ok",
      entrypoint: "cron-ledger-worker",
      node: process.versions.node,
      revision: process.env.GIT_COMMIT_SHA || "unbound",
    },
  })
  process.exit(0)
}

const apiKey = requiredEnv("CRON_API_KEY")
const databaseUrl = requiredEnv("DATABASE_URL")
void databaseUrl
if (process.env.SERVICE_ROLE !== "cron-worker") {
  throw new CronLedgerConfigurationError("SERVICE_ROLE must be cron-worker")
}
const authority = resolveCronRuntimeAuthority(process.env)
if (!schedulerModeUsesLedgerWorker(authority.mode)) {
  throw new CronLedgerConfigurationError(
    "cron worker requires CRON_SCHEDULER_MODE=canary or ledger",
  )
}
const ledgerTaskPaths = requiredTaskAllowlist(authority.ledgerTaskPaths)

const baseUrl = resolveWorkerBaseUrl(requiredEnv("INTERNAL_BASE_URL"))
const pollMs = boundedIntegerEnv(
  process.env.CRON_LEDGER_WORKER_POLL_MS,
  10_000,
  1_000,
  60_000,
  "CRON_LEDGER_WORKER_POLL_MS",
)
const healthPort = boundedIntegerEnv(
  process.env.CRON_WORKER_HEALTH_PORT,
  8_081,
  1_024,
  65_535,
  "CRON_WORKER_HEALTH_PORT",
)
const unhealthyAfterMs = boundedIntegerEnv(
  process.env.CRON_WORKER_UNHEALTHY_AFTER_MS,
  300_000,
  30_000,
  900_000,
  "CRON_WORKER_UNHEALTHY_AFTER_MS",
)
const heartbeatEveryMs = boundedIntegerEnv(
  process.env.CRON_WORKER_HEARTBEAT_INTERVAL_MS,
  60_000,
  30_000,
  900_000,
  "CRON_WORKER_HEARTBEAT_INTERVAL_MS",
)
const heartbeatUrl = process.env.CRON_WORKER_HEARTBEAT_URL?.trim()
const heartbeatState: CronHeartbeatState = { consecutiveFailures: 0, nextAttemptAt: 0 }
const state: WorkerState = {
  running: false,
  startedAt: Date.now(),
  tickStartedAt: null,
  lastSuccessfulTickAt: null,
  lastErrorAt: null,
  lastError: null,
}

let stopping = false
let activeTick: Promise<void> = Promise.resolve()
let timer: NodeJS.Timeout | undefined
let nextHeartbeatAt = 0

async function tick(): Promise<void> {
  const tickStartedAt = Date.now()
  state.running = true
  state.tickStartedAt = tickStartedAt
  try {
    const results = await runCronLedgerBatch({
      apiKey,
      baseUrl,
      allowedTaskPaths: ledgerTaskPaths,
    })
    const backlog = await cronLedgerBacklogSummary()
    state.lastSuccessfulTickAt = Date.now()
    state.lastError = null
    logger.info("cron_worker_tick", {
      status: "ok",
      durationMs: Date.now() - tickStartedAt,
      provider: "cron",
      context: {
        completedJobs: results.length,
        schedulerMode: authority.mode,
        canaryTaskPath: authority.canaryTaskPath,
        backlog,
      },
    })
    if (heartbeatUrl && Date.now() >= nextHeartbeatAt) {
      const heartbeat = await pingCronHeartbeat(heartbeatUrl, heartbeatState)
      nextHeartbeatAt = Date.now() + heartbeatEveryMs
      if (heartbeat.status === "failed") {
        logger.warn("cron_worker_heartbeat", {
          status: "failed",
          provider: "cron",
          context: {
            retryAt: heartbeat.retryAt,
          },
        })
      }
    }
  } catch (error) {
    state.lastErrorAt = Date.now()
    state.lastError = safeErrorName(error)
    logger.error("cron_worker_tick", {
      status: "failed",
      durationMs: Date.now() - tickStartedAt,
      provider: "cron",
      context: { errorName: state.lastError },
      error,
    })
  } finally {
    state.running = false
    state.tickStartedAt = null
  }
}

function scheduleNextTick(): void {
  if (stopping) return
  timer = setTimeout(() => {
    activeTick = tick().finally(scheduleNextTick)
  }, pollMs)
  timer.unref?.()
}

function healthStatus(now = Date.now()): { healthy: boolean; body: Record<string, unknown> } {
  const reference = state.lastSuccessfulTickAt ?? state.startedAt
  const activeWithinBudget =
    state.running && state.tickStartedAt !== null && now - state.tickStartedAt <= unhealthyAfterMs
  const healthy = activeWithinBudget || now - reference <= unhealthyAfterMs
  return {
    healthy,
    body: {
      status: healthy ? "ok" : "degraded",
      schedulerMode: authority.mode,
      canaryTaskPath: authority.canaryTaskPath,
      running: state.running,
      startedAt: new Date(state.startedAt).toISOString(),
      lastSuccessfulTickAt: state.lastSuccessfulTickAt
        ? new Date(state.lastSuccessfulTickAt).toISOString()
        : null,
      lastErrorAt: state.lastErrorAt ? new Date(state.lastErrorAt).toISOString() : null,
      lastError: state.lastError,
    },
  }
}

function startHealthServer(): Server {
  return createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404, { "content-type": "application/json" })
      response.end('{"error":"not found"}')
      return
    }
    const result = healthStatus()
    response.writeHead(result.healthy ? 200 : 503, {
      "cache-control": "no-store",
      "content-type": "application/json",
    })
    response.end(JSON.stringify(result.body))
  }).listen(healthPort, "127.0.0.1")
}

const healthServer = startHealthServer()

async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true
  if (timer) clearTimeout(timer)
  logger.info("cron_worker_shutdown", {
    status: signal,
    provider: "cron",
  })
  healthServer?.close()
  await activeTick
  await closeDatabasePool()
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch(() => process.exit(1))
  })
}

activeTick = tick().finally(scheduleNextTick)

function resolveWorkerBaseUrl(value: string): string {
  const baseUrl = resolveInternalCronBaseUrl(value)
  const hostname = new URL(baseUrl).hostname.toLowerCase()
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]") {
    throw new CronLedgerConfigurationError(
      "cron worker INTERNAL_BASE_URL must name the separate Web service",
    )
  }
  return baseUrl
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new CronLedgerConfigurationError(`${name} is required`)
  return value
}

function requiredTaskAllowlist(taskPaths: readonly string[] | undefined): readonly string[] {
  if (!taskPaths) {
    throw new CronLedgerConfigurationError("cron worker authority has no approved task allowlist")
  }
  return taskPaths
}

function boundedIntegerEnv(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CronLedgerConfigurationError(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    )
  }
  return parsed
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError"
  const code = (error as NodeJS.ErrnoException).code
  return code ? `${error.name}:${code}` : error.name
}
