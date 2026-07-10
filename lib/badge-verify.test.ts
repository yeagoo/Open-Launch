import { describe, expect, it } from "vitest"

import { containsAatBadgeLink } from "@/lib/badge-verify"

describe("containsAatBadgeLink", () => {
  it("accepts real HTML and Markdown links", () => {
    expect(containsAatBadgeLink('<a href="https://www.aat.ee/?ref=badge">Featured</a>')).toBe(true)
    expect(containsAatBadgeLink("[Featured](https://aat.ee/?ref=badge)")).toBe(true)
  })

  it("rejects bare mentions and attacker lookalike domains", () => {
    expect(containsAatBadgeLink("We mentioned www.aat.ee in plain text")).toBe(false)
    expect(containsAatBadgeLink('<a href="https://aat.ee.attacker.test">Featured</a>')).toBe(false)
  })

  it("rejects non-web schemes", () => {
    expect(containsAatBadgeLink('<a href="javascript:alert(1)">aat.ee</a>')).toBe(false)
  })

  it("rejects fake anchors hidden in comments or scripts", () => {
    expect(containsAatBadgeLink('<!-- <a href="https://aat.ee">fake</a> -->')).toBe(false)
    expect(
      containsAatBadgeLink('<script>const badge = `<a href="https://aat.ee">fake</a>`</script>'),
    ).toBe(false)
  })
})
