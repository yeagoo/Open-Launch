import { describe, expect, it } from "vitest"

import { canStartCronOperation, CRON_SUBTASK_TIMEOUT_MS } from "./cron-task-budget"

describe("cron task time budget", () => {
  const base = {
    startedAtMs: 1_000,
    taskTimeoutMs: CRON_SUBTASK_TIMEOUT_MS,
    operationTimeoutMs: 60_000,
    completionReserveMs: 20_000,
  }

  it("allows work that fits before the outer timeout", () => {
    expect(canStartCronOperation({ ...base, nowMs: 161_000 })).toBe(true)
  })

  it("defers work that would consume the completion reserve", () => {
    expect(canStartCronOperation({ ...base, nowMs: 161_001 })).toBe(false)
  })

  it("treats a clock moving backwards as zero elapsed time", () => {
    expect(canStartCronOperation({ ...base, nowMs: 0 })).toBe(true)
  })
})
