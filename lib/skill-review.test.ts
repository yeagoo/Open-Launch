import { describe, expect, it } from "vitest"

import { isSkillReviewRejected, parseSkillReviewResponse } from "./skill-review"

describe("parseSkillReviewResponse", () => {
  it("parses score and reasons from plain JSON", () => {
    const verdict = parseSkillReviewResponse(
      '{"score":82,"reasons":["Clear SaaS product","Specific target user"]}',
    )

    expect(verdict).toEqual({
      score: 82,
      reasons: ["Clear SaaS product", "Specific target user"],
    })
    expect(isSkillReviewRejected(verdict)).toBe(false)
  })

  it("parses fenced JSON and flags high-risk scores", () => {
    const verdict = parseSkillReviewResponse('```json\n{"score":12,"reason":"Gambling spam"}\n```')

    expect(verdict).toEqual({ score: 12, reasons: ["Gambling spam"] })
    expect(isSkillReviewRejected(verdict)).toBe(true)
  })
})
