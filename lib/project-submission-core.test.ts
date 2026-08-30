import { describe, expect, it } from "vitest"

import {
  classifyProjectInsertError,
  decideProjectUrlCollision,
  normalizeProjectTags,
  normalizeProjectWebsiteUrl,
  resolveProjectLocale,
} from "@/lib/project-submission-core"

describe("project submission core decisions", () => {
  it("normalizes website URLs without changing their path or query", () => {
    expect(normalizeProjectWebsiteUrl(" HTTPS://Example.COM/Path?A=One/ ")).toBe(
      "https://example.com/path?a=one",
    )
    expect(normalizeProjectWebsiteUrl("https://example.com/path/?a=1")).toBe(
      "https://example.com/path/?a=1",
    )
  })

  it("accepts supported locales and falls back to English", () => {
    expect(resolveProjectLocale("zh")).toBe("zh")
    expect(resolveProjectLocale("de")).toBe("en")
    expect(resolveProjectLocale(undefined)).toBe("en")
  })

  it("normalizes, bounds, filters and deduplicates tags in input order", () => {
    expect(
      normalizeProjectTags([
        "  Type Script  ",
        "type-script",
        "中 文",
        "x",
        "a".repeat(31),
        "React.js",
      ]),
    ).toEqual([
      { id: "type-script", name: "type-script", slug: "type-script" },
      { id: "中-文", name: "中 文", slug: "中-文" },
      { id: "react-js", name: "React.js", slug: "react-js" },
    ])
  })

  it("classifies URL collisions without broadening draft deletion", () => {
    const existing = { id: "project-1", createdBy: "user-1", launchStatus: "payment_failed" }
    expect(decideProjectUrlCollision(undefined, "user-1")).toEqual({ kind: "none" })
    expect(decideProjectUrlCollision(existing, "user-1")).toEqual({
      kind: "delete_failed_draft",
      projectId: "project-1",
    })
    expect(
      decideProjectUrlCollision({ ...existing, launchStatus: "payment_pending" }, "user-1"),
    ).toEqual({ kind: "reject_pending_payment", projectId: "project-1" })
    expect(decideProjectUrlCollision(existing, "user-2")).toEqual({ kind: "reject_duplicate" })
    expect(decideProjectUrlCollision({ ...existing, launchStatus: "scheduled" }, "user-1")).toEqual(
      { kind: "reject_duplicate" },
    )
  })

  it("maps only the two known insertion constraints", () => {
    expect(
      classifyProjectInsertError({ cause: { constraint: "project_website_url_unique" } }),
    ).toBe("website_url_duplicate")
    expect(classifyProjectInsertError(new Error("project_slug_unique"))).toBe("slug_conflict")
    expect(classifyProjectInsertError({ cause: { constraint: "other_constraint" } })).toBe(
      "unknown",
    )
  })
})
