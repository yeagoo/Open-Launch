import { describe, expect, it } from "vitest"

import { shouldReleaseBadgeFastTrack } from "@/lib/project-edit-guards"

describe("project edit guards", () => {
  const scheduledDate = new Date("2026-10-01T08:00:00.000Z")

  it("releases a scheduled badge reservation when its website changes", () => {
    expect(
      shouldReleaseBadgeFastTrack({
        websiteUrlChanged: true,
        launchType: "free_with_badge",
        launchStatus: "scheduled",
        scheduledLaunchDate: scheduledDate,
      }),
    ).toBe(true)
  })

  it("keeps ordinary, unscheduled, and unchanged projects out of the release path", () => {
    expect(
      shouldReleaseBadgeFastTrack({
        websiteUrlChanged: false,
        launchType: "free_with_badge",
        launchStatus: "scheduled",
        scheduledLaunchDate: scheduledDate,
      }),
    ).toBe(false)
    expect(
      shouldReleaseBadgeFastTrack({
        websiteUrlChanged: true,
        launchType: "free",
        launchStatus: "scheduled",
        scheduledLaunchDate: scheduledDate,
      }),
    ).toBe(false)
    expect(
      shouldReleaseBadgeFastTrack({
        websiteUrlChanged: true,
        launchType: "free_with_badge",
        launchStatus: "scheduled",
        scheduledLaunchDate: null,
      }),
    ).toBe(false)
  })
})
