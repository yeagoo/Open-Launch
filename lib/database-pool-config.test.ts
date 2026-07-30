import { describe, expect, it } from "vitest"

import { databasePoolRuntimeConfig } from "./database-pool-config"

describe("database pool runtime config", () => {
  it("uses a smaller bounded pool and statement timeout for the cron worker", () => {
    expect(databasePoolRuntimeConfig({ SERVICE_ROLE: "cron-worker" })).toEqual({
      max: 3,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      statementTimeoutMillis: 120_000,
      applicationName: "open-launch-cron-worker",
    })
  })

  it("keeps the web default compatible while accepting explicit bounds", () => {
    expect(
      databasePoolRuntimeConfig({
        SERVICE_ROLE: "web",
        DATABASE_POOL_MAX: "7",
        DATABASE_CONNECTION_TIMEOUT_MS: "2000",
        DATABASE_IDLE_TIMEOUT_MS: "45000",
        DATABASE_STATEMENT_TIMEOUT_MS: "90000",
      }),
    ).toEqual({
      max: 7,
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 45_000,
      statementTimeoutMillis: 90_000,
      applicationName: "open-launch-web",
    })
  })

  it("fails closed on invalid or excessive values", () => {
    expect(() => databasePoolRuntimeConfig({ DATABASE_POOL_MAX: "0" })).toThrow(/DATABASE_POOL_MAX/)
    expect(() =>
      databasePoolRuntimeConfig({ DATABASE_CONNECTION_TIMEOUT_MS: "not-a-number" }),
    ).toThrow(/DATABASE_CONNECTION_TIMEOUT_MS/)
    expect(() => databasePoolRuntimeConfig({ DATABASE_STATEMENT_TIMEOUT_MS: "300001" })).toThrow(
      /DATABASE_STATEMENT_TIMEOUT_MS/,
    )
  })
})
