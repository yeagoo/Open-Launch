import { describe, expect, it } from "vitest"

import { serializeJsonLd } from "@/lib/safe-json-ld"

describe("serializeJsonLd", () => {
  it("cannot terminate an inline script with untrusted text", () => {
    const serialized = serializeJsonLd({ name: "</script><script>alert(1)</script>" })

    expect(serialized).not.toContain("<")
    expect(serialized).not.toContain("></script>")
    expect(JSON.parse(serialized)).toEqual({ name: "</script><script>alert(1)</script>" })
  })

  it("escapes ampersands and unicode line separators", () => {
    const serialized = serializeJsonLd({ text: "a&b\u2028c\u2029d" })

    expect(serialized).toContain("\\u0026")
    expect(serialized).toContain("\\u2028")
    expect(serialized).toContain("\\u2029")
  })
})
