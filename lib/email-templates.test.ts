import { describe, expect, it } from "vitest"

import {
  getPasswordResetTemplate,
  getVerificationEmailTemplate,
  getWelcomeEmailTemplate,
} from "@/lib/email-templates"

describe("authentication email templates", () => {
  const maliciousName = `<img src=x onerror="alert(1)"> O'Reilly & Co`

  it.each([
    [
      "verification",
      () => getVerificationEmailTemplate(maliciousName, "https://www.aat.ee/verify"),
    ],
    ["password reset", () => getPasswordResetTemplate(maliciousName, "https://www.aat.ee/reset")],
    ["welcome", () => getWelcomeEmailTemplate(maliciousName)],
  ])("escapes user names in the %s template", (_name, render) => {
    const html = render()
    expect(html).not.toContain("<img src=x")
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; O&#39;Reilly &amp; Co")
  })

  it("rejects non-HTTP action URLs", () => {
    expect(() => getVerificationEmailTemplate("User", "javascript:alert(1)")).toThrow(/HTTP URL/)
    expect(() => getPasswordResetTemplate("User", "https://user:pass@www.aat.ee/reset")).toThrow(
      /without credentials/,
    )
  })
})
