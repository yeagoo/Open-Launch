import { describe, expect, it } from "vitest"

import { publicSkillPublicationError } from "./skill-status"

describe("publicSkillPublicationError", () => {
  it("does not expose internal receiver or environment details on public status views", () => {
    expect(
      publicSkillPublicationError(
        "scheduled",
        "No API key for bigkr (set SKILL_PUBLISH_BIGKR_API_KEY)",
      ),
    ).toBe("Publication is temporarily deferred.")

    expect(
      publicSkillPublicationError("failed", "HTTP 500: receiver stack trace with config names"),
    ).toBe("Publication attempt failed.")

    expect(publicSkillPublicationError("sent", null)).toBeNull()
  })
})
