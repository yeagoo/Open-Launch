import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

describe("project edit transaction contract", () => {
  it("locks and re-checks the project before the edit update", async () => {
    const source = await readFile(
      resolve(import.meta.dirname, "../app/actions/project-details.ts"),
      "utf8",
    )
    const lock = source.indexOf('.for("update")')
    const write = source.indexOf(".update(project)\n        .set(updates)")

    expect(lock).toBeGreaterThan(-1)
    expect(write).toBeGreaterThan(lock)
    expect(source).toContain("inArray(project.launchStatus, EDITABLE_STATUS_VALUES)")
    expect(source).toContain("shouldReleaseBadgeFastTrack")
  })
})
