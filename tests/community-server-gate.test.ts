import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getCommunityServerService } from "@/lib/community/server"
import type {
  CommunityDependencies,
  CommunityOperationTelemetry,
} from "@/lib/community/server-types"

const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  session: vi.fn(),
  rate: vi.fn(),
  headers: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn() },
}))
vi.mock("@/drizzle/db", () => ({ db: {} }))
vi.mock("@/lib/community/service-core", () => ({ createCommunityBackend: mocks.build }))
vi.mock("@/lib/server-auth", () => ({ getCurrentUserId: mocks.session }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rate }))
vi.mock("@/lib/observability/structured-logger", () => ({ logger: mocks.logger }))
vi.mock("next/headers", () => ({ headers: mocks.headers }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.headers.mockResolvedValue(new Headers({ "x-aat-request-id": "community-trace-7" }))
})
afterEach(() => vi.unstubAllEnvs())
describe("community production service boundary", () => {
  it("stays disabled without the exact opt-in value", () => {
    for (const value of [undefined, "0", "true"]) {
      vi.stubEnv("COMMUNITY_ENABLED", value)
      expect(() => getCommunityServerService()).toThrow("Community is not available")
    }
    expect(mocks.build).not.toHaveBeenCalled()
  })
  it("uses the trusted session resolver and the existing fail-closed limiter", async () => {
    vi.stubEnv("COMMUNITY_ENABLED", "1")
    getCommunityServerService()
    const deps = mocks.build.mock.calls[0]![1] as CommunityDependencies
    expect(deps.getActorId).toBe(mocks.session)
    mocks.rate.mockResolvedValue({ success: false })
    await expect(deps.checkWriteLimit("member", "publish")).rejects.toMatchObject({
      code: "retryable",
    })
    expect(mocks.rate).toHaveBeenCalledWith("community:publish:member", 5, 600000, {
      onRedisError: "fail-closed",
    })
    mocks.rate.mockResolvedValue({ success: true })
    await deps.checkWriteLimit("member", "report")
    expect(mocks.rate).toHaveBeenLastCalledWith("community:report:member", 10, 600000, {
      onRedisError: "fail-closed",
    })

    const completed: CommunityOperationTelemetry = {
      operation: "feed-page",
      write: false,
      admin: false,
      outcome: "completed",
      durationMs: 1200,
    }
    await deps.onSlowOperation?.(completed)
    expect(mocks.logger.warn).toHaveBeenCalledWith("community_operation_slow", {
      requestId: "community-trace-7",
      route: "/community",
      status: "completed",
      durationMs: 1200,
      provider: "community",
      context: {
        operation: "feed-page",
        mode: "read",
        access: "standard",
        outcome: "completed",
      },
    })

    const failure = new Error("private connection detail")
    const failed: CommunityOperationTelemetry = {
      operation: "publish",
      write: true,
      admin: true,
      outcome: "failed",
      durationMs: 1300,
    }
    await deps.onError?.("publish", failure, failed)
    expect(mocks.logger.error).toHaveBeenCalledWith("community_service_error", {
      requestId: "community-trace-7",
      route: "/community",
      status: "failed",
      durationMs: 1300,
      provider: "community",
      context: {
        operation: "publish",
        mode: "write",
        access: "moderator",
        outcome: "failed",
      },
      error: failure,
    })
    expect(mocks.headers).toHaveBeenCalledOnce()
  })
})
