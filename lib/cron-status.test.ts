import { describe, expect, it } from "vitest"

import { cronDispatcherStatusFromResult, cronStatusFromResult } from "@/lib/cron-status"

describe("cron status mapping", () => {
  it("keeps item-batch partial success compatible with existing cron routes", () => {
    expect(cronStatusFromResult({ errorCount: 1, successCount: 2 })).toBe(200)
    expect(cronStatusFromResult({ errorCount: 1, successCount: 0 })).toBe(500)
  })

  it("makes any dispatcher subtask failure retryable", () => {
    expect(cronDispatcherStatusFromResult({ errorCount: 1, successCount: 2 })).toBe(500)
    expect(cronDispatcherStatusFromResult({ errorCount: 0, successCount: 2 })).toBe(200)
    expect(cronDispatcherStatusFromResult({ errorCount: 0, successCount: 0 })).toBe(200)
  })
})
