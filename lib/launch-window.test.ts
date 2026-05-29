import { describe, expect, it } from "vitest"

import { getLaunchWindowForDate } from "./launch-window"

describe("getLaunchWindowForDate", () => {
  it("uses the configured 08:00 UTC launch boundary", () => {
    const input = new Date("2026-05-29T13:30:00.000Z")
    const { start, end } = getLaunchWindowForDate(input)

    expect(start.toISOString()).toBe("2026-05-29T08:00:00.000Z")
    expect(end.toISOString()).toBe("2026-05-30T08:00:00.000Z")
  })

  it("keeps the exact boundary in the new launch window", () => {
    const input = new Date("2026-05-29T08:00:00.000Z")
    const { start, end } = getLaunchWindowForDate(input)

    expect(start.getTime()).toBe(input.getTime())
    expect(end.toISOString()).toBe("2026-05-30T08:00:00.000Z")
  })

  it("assigns times before 08:00 UTC to the previous launch window", () => {
    const { start, end } = getLaunchWindowForDate(new Date("2026-05-29T07:59:59.999Z"))

    expect(start.toISOString()).toBe("2026-05-28T08:00:00.000Z")
    expect(end.toISOString()).toBe("2026-05-29T08:00:00.000Z")
  })
})
