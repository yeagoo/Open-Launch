import { describe, expect, it } from "vitest"

import { projectSubmissionSchema } from "@/lib/validations/project"

const validProject = {
  name: "Example",
  description: "<p>Example</p>",
  websiteUrl: "https://example.com",
  logoUrl: "https://example.com/logo.png",
  productImage: null,
  categories: ["developer-tools"],
  techStack: ["TypeScript"],
  platforms: ["Web"],
  pricing: "FREE",
}

describe("projectSubmissionSchema", () => {
  it("rejects executable and non-web URL schemes", () => {
    expect(
      projectSubmissionSchema.safeParse({ ...validProject, websiteUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false)
    expect(
      projectSubmissionSchema.safeParse({ ...validProject, websiteUrl: "file:///etc/passwd" })
        .success,
    ).toBe(false)
  })

  it("bounds project names and arrays", () => {
    expect(
      projectSubmissionSchema.safeParse({ ...validProject, name: "x".repeat(101) }).success,
    ).toBe(false)
    expect(
      projectSubmissionSchema.safeParse({
        ...validProject,
        techStack: Array.from({ length: 11 }, (_, index) => `tag-${index}`),
      }).success,
    ).toBe(false)
  })
})
