import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

describe("comment storage query contract", () => {
  it("uses separate aggregate scans and batched reply counts", async () => {
    const source = await readFile(resolve(import.meta.dirname, "comment-storage.ts"), "utf8")

    expect(source).toContain("countInt(sql`${fumaRates.like}`)")
    expect(source).toContain("countInt(sql`not ${fumaRates.like}`)")
    expect(source).toContain(".groupBy(fumaRates.commentId)")
    expect(source).toContain("inArray(fumaComments.thread, commentIds)")
    expect(source).not.toContain(".leftJoin(")
  })

  it("keeps tombstone checks in each final write path", async () => {
    const source = await readFile(resolve(import.meta.dirname, "comment-storage.ts"), "utf8")

    expect(source.match(/isNull\(fumaComments\.hiddenAt\)/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).toContain('.for("update")')
    expect(source).toContain("onConflictDoUpdate")
  })
})
