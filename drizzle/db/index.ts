import "dotenv/config"

import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { databasePoolRuntimeConfig } from "@/lib/database-pool-config"
import { logger } from "@/lib/observability/structured-logger"

import * as schema from "./schema"

const poolConfig = databasePoolRuntimeConfig()
const globalForDatabase = globalThis as typeof globalThis & {
  __aatPostgresPool?: Pool
  __aatPostgresPoolErrorHandlerRegistered?: boolean
}

export const databasePool =
  globalForDatabase.__aatPostgresPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolConfig.max,
    connectionTimeoutMillis: poolConfig.connectionTimeoutMillis,
    idleTimeoutMillis: poolConfig.idleTimeoutMillis,
    statement_timeout: poolConfig.statementTimeoutMillis,
    application_name: poolConfig.applicationName,
    keepAlive: true,
  })

if (!globalForDatabase.__aatPostgresPoolErrorHandlerRegistered) {
  databasePool.on("error", (error) => {
    logger.error("postgres_pool_idle_error", {
      status: "idle_client_error",
      provider: "postgres",
      error,
    })
  })
  globalForDatabase.__aatPostgresPoolErrorHandlerRegistered = true
}
globalForDatabase.__aatPostgresPool = databasePool

export const db = drizzle({
  client: databasePool,
  schema,
})

export async function closeDatabasePool(): Promise<void> {
  await databasePool.end()
}
