import { describe, expect, it } from "vitest"

import {
  getPremiumCapacityRejection,
  isCompletedLaunchForConfirmation,
} from "@/lib/premium-launch-confirmation"

describe("getPremiumCapacityRejection", () => {
  it("rejects a full date before checking the user limit", () => {
    expect(getPremiumCapacityRejection({ totalCount: 10, userCount: 5 })).toBe("capacity_full")
  })

  it("rejects a user who already reached the daily limit", () => {
    expect(getPremiumCapacityRejection({ totalCount: 5, userCount: 5 })).toBe("user_limit")
  })

  it("allows a paid launch when both limits have capacity", () => {
    expect(getPremiumCapacityRejection({ totalCount: 9, userCount: 4 })).toBeNull()
  })

  it("does not treat failed or non-premium legacy projects as paid confirmations", () => {
    expect(isCompletedLaunchForConfirmation({ status: "payment_failed", type: "premium" })).toBe(
      false,
    )
    expect(isCompletedLaunchForConfirmation({ status: "scheduled", type: "free" })).toBe(false)
    expect(
      isCompletedLaunchForConfirmation({
        status: "scheduled",
        type: "free",
        allowNonPremiumProcessed: true,
      }),
    ).toBe(true)
  })
})
