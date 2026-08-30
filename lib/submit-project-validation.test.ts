import { describe, expect, it } from "vitest"

import {
  validateSubmitProjectStep,
  type SubmitProjectValidationData,
  type SubmitProjectValidationMessages,
} from "./submit-project-validation"

const messages = new Proxy(
  {},
  { get: (_target, key) => String(key) },
) as SubmitProjectValidationMessages

const validData: SubmitProjectValidationData = {
  name: "Launch",
  websiteUrl: "https://example.test",
  tagline: "A short tagline",
  description: "Description",
  categories: ["category"],
  techStack: ["TypeScript"],
  platforms: ["web"],
  pricing: "free",
  scheduledDate: "2026-09-01",
}

const validContext = {
  uploadedLogoUrl: "https://static.example.test/logo.png",
  requireLogo: true,
  isLaunchDateOverLimit: false,
  launchDateLimitError: null,
}

describe("validateSubmitProjectStep", () => {
  it("collects every visible step-one error in field order", () => {
    expect(
      validateSubmitProjectStep(
        1,
        { ...validData, name: "", websiteUrl: "invalid", tagline: "x".repeat(61), description: "" },
        { ...validContext, uploadedLogoUrl: null },
        messages,
      ),
    ).toEqual({
      name: "nameRequired",
      websiteUrl: "websiteUrlInvalid",
      tagline: "taglineTooLong",
      description: "descriptionRequired",
      logoUrl: "logoRequired",
    })
  })

  it("enforces collection bounds on step two", () => {
    expect(
      validateSubmitProjectStep(
        2,
        {
          ...validData,
          categories: ["1", "2", "3", "4"],
          techStack: [],
          platforms: [],
          pricing: "",
        },
        validContext,
        messages,
      ),
    ).toEqual({
      categories: "categoriesMax",
      techStack: "techStackMin",
      platforms: "platformsMin",
      pricing: "pricingRequired",
    })
  })

  it("preserves a detailed launch-limit error on step three", () => {
    expect(
      validateSubmitProjectStep(
        3,
        validData,
        { ...validContext, isLaunchDateOverLimit: true, launchDateLimitError: "2/2 slots used" },
        messages,
      ),
    ).toEqual({ scheduledDate: "2/2 slots used" })
  })

  it("returns no errors for valid steps", () => {
    for (const step of [1, 2, 3]) {
      expect(validateSubmitProjectStep(step, validData, validContext, messages)).toEqual({})
    }
  })
})
