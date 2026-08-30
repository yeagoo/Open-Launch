import { describe, expect, it } from "vitest"

import { LAUNCH_SETTINGS, LAUNCH_TYPES } from "@/lib/constants"
import {
  checkoutTierForSubmitLaunch,
  getSubmitLaunchDateWindow,
  isFreeSubmitLaunch,
  transitionSubmitLaunchType,
} from "@/lib/submit-launch-plan"

describe("submit launch plan", () => {
  const today = new Date("2026-08-30T12:00:00.000Z")

  it("maps every launch type to its scheduling window", () => {
    const free = getSubmitLaunchDateWindow(LAUNCH_TYPES.FREE, today)
    const badge = getSubmitLaunchDateWindow(LAUNCH_TYPES.FREE_WITH_BADGE, today)
    const premium = getSubmitLaunchDateWindow(LAUNCH_TYPES.PREMIUM, today)

    expect(free.start.toISOString()).toBe("2026-09-20T12:00:00.000Z")
    expect(free.end.getTime() - today.getTime()).toBe(
      LAUNCH_SETTINGS.MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000,
    )
    expect(badge.start.toISOString()).toBe("2026-09-01T12:00:00.000Z")
    expect(premium.start.toISOString()).toBe("2026-08-31T12:00:00.000Z")
    expect(premium.end.toISOString()).toBe("2026-09-29T12:00:00.000Z")
  })

  it("clears dates on every type change and tiers on free changes", () => {
    const selection = {
      launchType: LAUNCH_TYPES.PREMIUM,
      directoryTier: "pro" as const,
      scheduledDate: "2026-09-01",
      untouched: "value",
    }

    expect(transitionSubmitLaunchType(selection, LAUNCH_TYPES.FREE)).toEqual({
      ...selection,
      launchType: LAUNCH_TYPES.FREE,
      directoryTier: null,
      scheduledDate: null,
    })
    expect(transitionSubmitLaunchType(selection, LAUNCH_TYPES.PREMIUM)).toEqual({
      ...selection,
      scheduledDate: null,
    })
  })

  it("routes only premium submissions to a checkout tier", () => {
    expect(isFreeSubmitLaunch(LAUNCH_TYPES.FREE)).toBe(true)
    expect(isFreeSubmitLaunch(LAUNCH_TYPES.FREE_WITH_BADGE)).toBe(true)
    expect(isFreeSubmitLaunch(LAUNCH_TYPES.PREMIUM)).toBe(false)
    expect(checkoutTierForSubmitLaunch(LAUNCH_TYPES.PREMIUM, "ultra")).toBe("ultra")
    expect(checkoutTierForSubmitLaunch(LAUNCH_TYPES.PREMIUM, null)).toBe("basic")
    expect(checkoutTierForSubmitLaunch(LAUNCH_TYPES.FREE, "ultra")).toBeNull()
  })
})
