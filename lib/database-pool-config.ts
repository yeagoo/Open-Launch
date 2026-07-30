export interface DatabasePoolRuntimeConfig {
  max: number
  connectionTimeoutMillis: number
  idleTimeoutMillis: number
  statementTimeoutMillis: number
  applicationName: string
}

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>

export function databasePoolRuntimeConfig(
  env: RuntimeEnvironment = process.env,
): DatabasePoolRuntimeConfig {
  const worker = env.SERVICE_ROLE?.trim() === "cron-worker"
  return {
    max: boundedInteger(env.DATABASE_POOL_MAX, worker ? 3 : 10, 1, 50, "DATABASE_POOL_MAX"),
    connectionTimeoutMillis: boundedInteger(
      env.DATABASE_CONNECTION_TIMEOUT_MS,
      5_000,
      1_000,
      30_000,
      "DATABASE_CONNECTION_TIMEOUT_MS",
    ),
    idleTimeoutMillis: boundedInteger(
      env.DATABASE_IDLE_TIMEOUT_MS,
      30_000,
      1_000,
      300_000,
      "DATABASE_IDLE_TIMEOUT_MS",
    ),
    statementTimeoutMillis: boundedInteger(
      env.DATABASE_STATEMENT_TIMEOUT_MS,
      worker ? 120_000 : 0,
      0,
      300_000,
      "DATABASE_STATEMENT_TIMEOUT_MS",
    ),
    applicationName: worker ? "open-launch-cron-worker" : "open-launch-web",
  }
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`)
  }
  return parsed
}
