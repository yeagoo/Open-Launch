import { describe, expect, it, vi } from "vitest"

import {
  heartbeatRetryDelay,
  pingCronHeartbeat,
  summarizeHeartbeatError,
  type CronHeartbeatState,
} from "./cron-heartbeat"

function response(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: new Headers(),
    arrayBuffer: async () => new ArrayBuffer(0),
    text: async () => "",
    json: async () => null,
  }
}

describe("cron heartbeat", () => {
  it("backs off repeated failures up to thirty minutes", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(heartbeatRetryDelay)).toEqual([
      60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000,
    ])
  })

  it("expands AggregateError into actionable network details", () => {
    const refused = Object.assign(new Error("connect refused"), { code: "ECONNREFUSED" })
    const unreachable = Object.assign(new Error("network unreachable"), { code: "ENETUNREACH" })
    const summary = summarizeHeartbeatError(
      new AggregateError([refused, unreachable], "multiple connection attempts failed"),
    )
    expect(summary).toContain("ECONNREFUSED")
    expect(summary).toContain("ENETUNREACH")
  })

  it("skips attempts during backoff and resets after success", async () => {
    let now = Date.parse("2026-07-15T10:00:00Z")
    const state: CronHeartbeatState = { consecutiveFailures: 0, nextAttemptAt: 0 }
    const request = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200))
    const warn = vi.fn()

    const failed = await pingCronHeartbeat("https://health.example/ping", state, {
      now: () => now,
      request,
      warn,
    })
    expect(failed.status).toBe("failed")
    expect(warn).toHaveBeenCalledOnce()

    expect(
      await pingCronHeartbeat("https://health.example/ping", state, {
        now: () => now,
        request,
        warn,
      }),
    ).toMatchObject({ status: "skipped" })
    expect(request).toHaveBeenCalledOnce()

    now += 60_000
    expect(
      await pingCronHeartbeat("https://health.example/ping", state, {
        now: () => now,
        request,
        warn,
      }),
    ).toEqual({ status: "ok" })
    expect(state).toEqual({ consecutiveFailures: 0, nextAttemptAt: 0 })
  })
})
