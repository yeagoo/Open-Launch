import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  findMissingTrackedMigrations,
  orderHandWrittenMigrations,
} from "../scripts/lib/migration-order"

describe("hand-written migration order", () => {
  it("replays legacy named migrations at their historical positions", () => {
    expect(
      orderHandWrittenMigrations([
        "0058_cron_job_ledger.sql",
        "add_bot_pool_upvote_targets.sql",
        "0007_add_website_url_unique.sql",
        "0026_launch_syndication.sql",
        "add_bot_and_producthunt.sql",
        "0025_upvote_unique_and_engagement.sql",
        "add_user_is_premium.sql",
      ]),
    ).toEqual([
      "add_user_is_premium.sql",
      "add_bot_and_producthunt.sql",
      "0007_add_website_url_unique.sql",
      "0025_upvote_unique_and_engagement.sql",
      "add_bot_pool_upvote_targets.sql",
      "0026_launch_syndication.sql",
      "0058_cron_job_ledger.sql",
    ])
  })

  it("fails closed for a new non-numbered migration without an explicit position", () => {
    expect(() => orderHandWrittenMigrations(["future_change.sql"])).toThrow(
      /explicit historical ordering/,
    )
  })

  it("detects an applied migration that was removed from the reviewed files", () => {
    expect(
      findMissingTrackedMigrations(
        ["0010_present.sql", "0009_deleted.sql"],
        ["0010_present.sql", "0011_pending.sql"],
      ),
    ).toEqual(["0009_deleted.sql"])
  })

  it("blocks every migration mode before writing when applied content drifts", async () => {
    const source = await readFile(
      resolve(import.meta.dirname, "../scripts/apply-pending-sql.ts"),
      "utf8",
    )
    const driftGuard = source.indexOf("if (drifted.length > 0) {")
    const firstWriteMode = source.indexOf("if (MARK_ALL || MARK_THROUGH) {")

    expect(driftGuard).toBeGreaterThan(-1)
    expect(firstWriteMode).toBeGreaterThan(driftGuard)
    expect(source).toContain("Applied migration file missing")
    expect(source).toContain("Applied migration hash drift")
    expect(source).not.toContain("content changed since application (hash drift)")
  })
})
