import { describe, expect, it, vi } from "vitest"

import type { CommunityDatabase, CommunityDependencies, CommunityTransaction } from "./server-types"
import { createCommunityBackend } from "./service-core"

const database = {
  transaction: async <T>(work: (tx: CommunityTransaction) => Promise<T>) =>
    work({} as CommunityTransaction),
} as unknown as CommunityDatabase

function backend(overrides: Partial<CommunityDependencies> = {}) {
  return createCommunityBackend(database, {
    getActorId: async () => null,
    checkWriteLimit: async () => {},
    ...overrides,
  })
}

describe("community service operation telemetry", () => {
  it("does not invoke the slow observer below its threshold", async () => {
    const onSlowOperation = vi.fn()
    await backend({ slowOperationMs: Number.MAX_SAFE_INTEGER, onSlowOperation }).loadViewer()
    expect(onSlowOperation).not.toHaveBeenCalled()
  })

  it("reports a slow completed operation without actor or content fields", async () => {
    const onSlowOperation = vi.fn()
    await expect(backend({ slowOperationMs: 0, onSlowOperation }).loadViewer()).resolves.toEqual({
      id: null,
      role: "anonymous",
      canParticipate: false,
    })

    expect(onSlowOperation).toHaveBeenCalledOnce()
    const [telemetry] = onSlowOperation.mock.calls[0]!
    expect(telemetry).toMatchObject({
      operation: "viewer",
      write: false,
      admin: false,
      outcome: "completed",
    })
    expect(telemetry.durationMs).toEqual(expect.any(Number))
    expect(telemetry.durationMs).toBeGreaterThanOrEqual(0)
    expect(Object.keys(telemetry).sort()).toEqual([
      "admin",
      "durationMs",
      "operation",
      "outcome",
      "write",
    ])
  })

  it("keeps completed results intact when the slow-operation observer fails", async () => {
    await expect(
      backend({
        slowOperationMs: 0,
        onSlowOperation: () => {
          throw new Error("telemetry collector unavailable")
        },
      }).loadViewer(),
    ).resolves.toEqual({ id: null, role: "anonymous", canParticipate: false })
  })

  it("maps infrastructure failures even when the error observer fails", async () => {
    const infrastructureFailure = new Error("private database detail")
    const onError = vi.fn(() => {
      throw new Error("logger unavailable")
    })
    const onSlowOperation = vi.fn()
    const service = backend({
      getActorId: async () => {
        throw infrastructureFailure
      },
      onError,
      onSlowOperation,
      slowOperationMs: 0,
    })

    await expect(service.loadViewer()).rejects.toMatchObject({
      code: "retryable",
      message: "Community data is temporarily unavailable. Please retry",
    })
    expect(onError).toHaveBeenCalledWith(
      "viewer",
      infrastructureFailure,
      expect.objectContaining({ outcome: "failed", durationMs: expect.any(Number) }),
    )
    expect(onSlowOperation).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "viewer", outcome: "failed" }),
    )
  })
})
