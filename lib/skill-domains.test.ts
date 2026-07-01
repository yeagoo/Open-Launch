import { describe, expect, it } from "vitest"

import { buildSkillDomainMethods, normalizeSkillDomain } from "./skill-domains"

describe("normalizeSkillDomain", () => {
  it("normalizes bare domains and strips scheme/path", () => {
    expect(normalizeSkillDomain("Example.COM")).toBe("example.com")
    expect(normalizeSkillDomain("https://www.example.com/docs?ref=aat")).toBe("www.example.com")
  })

  it("rejects private and single-label hosts", () => {
    expect(normalizeSkillDomain("localhost")).toBeNull()
    expect(normalizeSkillDomain("127.0.0.1")).toBeNull()
    expect(normalizeSkillDomain("internal")).toBeNull()
  })

  it("accepts public DNS names that start like IPv6 private ranges", () => {
    expect(normalizeSkillDomain("fcbarcelona.com")).toBe("fcbarcelona.com")
    expect(normalizeSkillDomain("fdroid.org")).toBe("fdroid.org")
  })
})

describe("buildSkillDomainMethods", () => {
  it("builds all supported verification instructions from one token", () => {
    const methods = buildSkillDomainMethods("example.com", "token")

    expect(methods.html).toEqual({
      path: "/.well-known/aat-verify-token.txt",
      content: "token",
    })
    expect(methods.dns).toEqual({
      name: "_aat-verify.example.com",
      value: "token",
    })
    expect(methods.meta).toEqual({
      name: "aat-verify",
      content: "token",
    })
  })
})
