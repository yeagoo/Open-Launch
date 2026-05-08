/**
 * Unit tests for cronMatches and isValidCronExpression.
 *
 * Run with: bun run test (or `vitest run lib/cron-match.test.ts`)
 *
 * These cover the cron expressions actually used in the seeded schedule
 * plus edge cases: invalid expressions, non-UTC interpretations, the
 * minute boundary.
 */

import { describe, expect, it } from "vitest"

import { cronMatches, isValidCronExpression } from "./cron-match"

// Helper: build a UTC Date at the given parts. Avoids local-tz drift in tests.
function utc(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0))
}

describe("cronMatches", () => {
  describe("every-N-minutes expressions", () => {
    it("'*/5 * * * *' matches at minute 0, 5, 10, ...", () => {
      expect(cronMatches("*/5 * * * *", utc(2026, 5, 8, 12, 0))).toBe(true)
      expect(cronMatches("*/5 * * * *", utc(2026, 5, 8, 12, 5))).toBe(true)
      expect(cronMatches("*/5 * * * *", utc(2026, 5, 8, 12, 25))).toBe(true)
    })

    it("'*/5 * * * *' does NOT match at minute 1, 2, 3, 4, 6, 7", () => {
      expect(cronMatches("*/5 * * * *", utc(2026, 5, 8, 12, 1))).toBe(false)
      expect(cronMatches("*/5 * * * *", utc(2026, 5, 8, 12, 2))).toBe(false)
      expect(cronMatches("*/5 * * * *", utc(2026, 5, 8, 12, 4))).toBe(false)
      expect(cronMatches("*/5 * * * *", utc(2026, 5, 8, 12, 6))).toBe(false)
    })

    it("matches every minute for '* * * * *'", () => {
      for (let m = 0; m < 60; m++) {
        expect(cronMatches("* * * * *", utc(2026, 5, 8, 14, m))).toBe(true)
      }
    })
  })

  describe("hourly expressions", () => {
    it("'0 */2 * * *' matches at even hours, minute 0", () => {
      expect(cronMatches("0 */2 * * *", utc(2026, 5, 8, 0, 0))).toBe(true)
      expect(cronMatches("0 */2 * * *", utc(2026, 5, 8, 2, 0))).toBe(true)
      expect(cronMatches("0 */2 * * *", utc(2026, 5, 8, 14, 0))).toBe(true)
    })

    it("'0 */2 * * *' does NOT match at odd hours or non-zero minutes", () => {
      expect(cronMatches("0 */2 * * *", utc(2026, 5, 8, 1, 0))).toBe(false)
      expect(cronMatches("0 */2 * * *", utc(2026, 5, 8, 2, 1))).toBe(false)
      expect(cronMatches("0 */2 * * *", utc(2026, 5, 8, 2, 30))).toBe(false)
    })
  })

  describe("daily expressions", () => {
    it("'0 8 * * *' matches at 08:00 UTC every day", () => {
      expect(cronMatches("0 8 * * *", utc(2026, 5, 8, 8, 0))).toBe(true)
      expect(cronMatches("0 8 * * *", utc(2026, 5, 9, 8, 0))).toBe(true)
      expect(cronMatches("0 8 * * *", utc(2026, 12, 31, 8, 0))).toBe(true)
    })

    it("'0 8 * * *' does NOT match at any other time", () => {
      expect(cronMatches("0 8 * * *", utc(2026, 5, 8, 7, 59))).toBe(false)
      expect(cronMatches("0 8 * * *", utc(2026, 5, 8, 8, 1))).toBe(false)
      expect(cronMatches("0 8 * * *", utc(2026, 5, 8, 9, 0))).toBe(false)
    })
  })

  describe("list expressions", () => {
    it("'15,45 * * * *' matches at minute 15 and 45 of every hour", () => {
      expect(cronMatches("15,45 * * * *", utc(2026, 5, 8, 12, 15))).toBe(true)
      expect(cronMatches("15,45 * * * *", utc(2026, 5, 8, 12, 45))).toBe(true)
      expect(cronMatches("15,45 * * * *", utc(2026, 5, 8, 0, 15))).toBe(true)
      expect(cronMatches("15,45 * * * *", utc(2026, 5, 8, 0, 45))).toBe(true)
    })

    it("'15,45 * * * *' does NOT match at other minutes", () => {
      expect(cronMatches("15,45 * * * *", utc(2026, 5, 8, 12, 0))).toBe(false)
      expect(cronMatches("15,45 * * * *", utc(2026, 5, 8, 12, 30))).toBe(false)
      expect(cronMatches("15,45 * * * *", utc(2026, 5, 8, 12, 16))).toBe(false)
    })
  })

  describe("invalid expressions", () => {
    it("returns false for nonsense input rather than throwing", () => {
      expect(cronMatches("not a cron", utc(2026, 5, 8, 12, 0))).toBe(false)
      expect(cronMatches("", utc(2026, 5, 8, 12, 0))).toBe(false)
      expect(cronMatches("99 99 99 99 99", utc(2026, 5, 8, 12, 0))).toBe(false)
    })
  })

  describe("minute granularity (current minute window)", () => {
    it("matches at the start of the minute", () => {
      const start = utc(2026, 5, 8, 12, 5)
      expect(cronMatches("*/5 * * * *", start)).toBe(true)
    })

    it("matches at the end of the minute (12:05:59)", () => {
      const lateInMinute = new Date(Date.UTC(2026, 4, 8, 12, 5, 59, 999))
      expect(cronMatches("*/5 * * * *", lateInMinute)).toBe(true)
    })

    it("does not match a minute later (12:06:00)", () => {
      // Cleanly outside the window.
      const after = utc(2026, 5, 8, 12, 6)
      expect(cronMatches("*/5 * * * *", after)).toBe(false)
    })
  })
})

describe("isValidCronExpression", () => {
  it("accepts standard 5-field expressions", () => {
    expect(isValidCronExpression("* * * * *")).toBe(true)
    expect(isValidCronExpression("*/5 * * * *")).toBe(true)
    expect(isValidCronExpression("0 8 * * *")).toBe(true)
    expect(isValidCronExpression("15,45 * * * *")).toBe(true)
    expect(isValidCronExpression("0 */2 * * *")).toBe(true)
    expect(isValidCronExpression("0 0 1 * *")).toBe(true) // first of month
    expect(isValidCronExpression("0 9 * * 1-5")).toBe(true) // weekdays
  })

  it("rejects garbage input", () => {
    expect(isValidCronExpression("hello")).toBe(false)
    expect(isValidCronExpression("")).toBe(false)
    expect(isValidCronExpression("* * *")).toBe(false) // 3 fields
    expect(isValidCronExpression("99 * * * *")).toBe(false)
  })
})
