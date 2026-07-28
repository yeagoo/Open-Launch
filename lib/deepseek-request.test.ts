import { describe, expect, it } from "vitest"

import { getDeepSeekThinkingOptions } from "./deepseek-request"

describe("DeepSeek request options", () => {
  it("disables default thinking for v4 models", () => {
    expect(getDeepSeekThinkingOptions("deepseek-v4-flash")).toEqual({
      thinking: { type: "disabled" },
    })
    expect(getDeepSeekThinkingOptions("deepseek-v4-pro")).toEqual({
      thinking: { type: "disabled" },
    })
  })

  it("does not send an unsupported option to other models", () => {
    expect(getDeepSeekThinkingOptions("deepseek-chat")).toEqual({})
  })
})
