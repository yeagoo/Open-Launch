import { describe, expect, it } from "vitest"

import {
  ALTERNATIVE_RETRYABLE_DELAY_MS,
  getAlternativeAttemptTimestamp,
  getAlternativeReattemptCutoff,
} from "@/lib/alternative-attempt"

describe("alternative attempt cooldowns", () => {
  const now = new Date("2026-07-28T05:35:32.000Z")

  it("keeps definitive no-match outcomes on the normal cooldown", () => {
    expect(getAlternativeAttemptTimestamp("definitive", now)).toEqual(now)
  })

  it("makes retryable failures eligible after one hour, not immediately", () => {
    const attemptedAt = getAlternativeAttemptTimestamp("retryable", now)
    const justBeforeRetry = new Date(now.getTime() + ALTERNATIVE_RETRYABLE_DELAY_MS - 1)
    const justAfterRetry = new Date(now.getTime() + ALTERNATIVE_RETRYABLE_DELAY_MS + 1)

    expect(attemptedAt < getAlternativeReattemptCutoff(justBeforeRetry)).toBe(false)
    expect(attemptedAt < getAlternativeReattemptCutoff(justAfterRetry)).toBe(true)
  })
})
