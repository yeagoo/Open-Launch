import { describe, expect, it } from "vitest"

import { submitStepProgress } from "./submit-step-progress"

describe("submitStepProgress", () => {
  it("maps the four wizard steps into a bounded zero-to-one range", () => {
    expect(submitStepProgress(1)).toBe(0)
    expect(submitStepProgress(2)).toBeCloseTo(1 / 3)
    expect(submitStepProgress(3)).toBeCloseTo(2 / 3)
    expect(submitStepProgress(4)).toBe(1)
    expect(submitStepProgress(99)).toBe(1)
  })
})
