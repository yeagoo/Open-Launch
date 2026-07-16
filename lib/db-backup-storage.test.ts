import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { backupBucket, getBackupStorageClient } from "./db-backup"

const ENV_NAMES = [
  "BACKUP_S3_ACCESS_KEY_ID",
  "BACKUP_S3_SECRET_ACCESS_KEY",
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_ENDPOINT",
  "BACKUP_S3_REGION",
  "BACKUP_R2_ACCESS_KEY_ID",
  "BACKUP_R2_SECRET_ACCESS_KEY",
  "BACKUP_R2_BUCKET",
  "R2_ACCOUNT_ID",
] as const

const originalEnvironment = new Map(ENV_NAMES.map((name) => [name, process.env[name]]))

function setGenericS3(overrides: Partial<Record<(typeof ENV_NAMES)[number], string>> = {}) {
  Object.assign(process.env, {
    BACKUP_S3_ACCESS_KEY_ID: "synthetic-access-key",
    BACKUP_S3_SECRET_ACCESS_KEY: "synthetic-secret-key",
    BACKUP_S3_BUCKET: "synthetic-backup-bucket",
    BACKUP_S3_ENDPOINT: "s3.us-west-2.idrivee2.com",
    BACKUP_S3_REGION: "us-west-2",
    ...overrides,
  })
}

beforeEach(() => {
  for (const name of ENV_NAMES) delete process.env[name]
})

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnvironment.get(name)
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe("backup S3 storage configuration", () => {
  it("uses a validated HTTPS path-style endpoint for generic S3 storage", async () => {
    setGenericS3()

    const client = getBackupStorageClient()
    const endpointProvider = client.config.endpoint
    expect(endpointProvider).toBeDefined()
    const endpoint = await endpointProvider!()

    expect(await client.config.region()).toBe("us-west-2")
    expect(endpoint).toMatchObject({
      protocol: "https:",
      hostname: "s3.us-west-2.idrivee2.com",
      path: "/",
    })
    expect(client.config.forcePathStyle).toBe(true)
    expect(backupBucket()).toBe("synthetic-backup-bucket")
  })

  it("fails closed when any generic S3 variable is set but the set is incomplete", () => {
    process.env.BACKUP_S3_ENDPOINT = "s3.us-west-2.idrivee2.com"
    process.env.R2_ACCOUNT_ID = "legacy-account"
    process.env.BACKUP_R2_ACCESS_KEY_ID = "legacy-access"
    process.env.BACKUP_R2_SECRET_ACCESS_KEY = "legacy-secret"

    expect(() => getBackupStorageClient()).toThrow(
      /BACKUP_S3_ACCESS_KEY_ID.*BACKUP_S3_SECRET_ACCESS_KEY.*BACKUP_S3_BUCKET.*BACKUP_S3_REGION/,
    )
  })

  it.each([
    "http://s3.example.invalid",
    "https://user:pass@s3.example.invalid",
    "https://s3.example.invalid/a/path",
    "https://s3.example.invalid?query=yes",
    "https://s3.example.invalid#fragment",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    setGenericS3({ BACKUP_S3_ENDPOINT: endpoint })

    expect(() => getBackupStorageClient()).toThrow(/BACKUP_S3_ENDPOINT must be/)
  })

  it("preserves the legacy Cloudflare R2 configuration as a fallback", async () => {
    Object.assign(process.env, {
      R2_ACCOUNT_ID: "synthetic-account",
      BACKUP_R2_ACCESS_KEY_ID: "synthetic-access-key",
      BACKUP_R2_SECRET_ACCESS_KEY: "synthetic-secret-key",
      BACKUP_R2_BUCKET: "synthetic-r2-bucket",
    })

    const client = getBackupStorageClient()
    const endpointProvider = client.config.endpoint
    expect(endpointProvider).toBeDefined()
    const endpoint = await endpointProvider!()

    expect(await client.config.region()).toBe("auto")
    expect(endpoint.hostname).toBe("synthetic-account.r2.cloudflarestorage.com")
    expect(backupBucket()).toBe("synthetic-r2-bucket")
  })
})
