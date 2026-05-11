/**
 * Unit tests for `countInt` — the BIGINT-as-string trap that took
 * down the date picker in /projects/submit. Asserts the SQL
 * fragment contains the `::int` cast so a future refactor can't
 * silently remove it.
 *
 * Run with: bun run test (or `vitest run lib/db-utils.test.ts`)
 */

import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { countInt } from "./db-utils"

// Drizzle's `sql` template returns an SQL object; calling
// `toQuery()` requires a dialect. For these tests we just inspect
// the internal `queryChunks` array — it's an implementation detail
// but stable enough to catch the regression we care about.
function sqlString(s: ReturnType<typeof countInt>): string {
  // `sql.raw(...).queryChunks` is the public-ish surface.
  // Joining the chunks gives us a "loose" string form — good
  // enough to grep for `count(*)` and `::int`.
  return (s as unknown as { queryChunks: unknown[] }).queryChunks
    .map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
    .join("")
}

describe("countInt", () => {
  it("renders `count(*)::int` when no filter is supplied", () => {
    const out = sqlString(countInt())
    expect(out).toContain("count(*)")
    expect(out).toContain("::int")
    expect(out).not.toContain("filter")
  })

  it("renders `count(*) filter (where ...) ::int` when a filter is supplied", () => {
    const out = sqlString(countInt(sql`x = 1`))
    expect(out).toContain("count(*)")
    expect(out).toContain("filter (where")
    expect(out).toContain("::int")
  })

  it("keeps the `::int` cast outside the FILTER clause", () => {
    // Critical: the cast must apply to the count result, not be
    // inside the filter predicate. The fix relies on the cast
    // happening at the column level so the JS value is a number,
    // not a string.
    const out = sqlString(countInt(sql`x = 1`))
    // The `::int` should appear AFTER the closing paren of
    // `filter (where ...)`, not inside the where clause.
    const filterIdx = out.indexOf("filter (where")
    const castIdx = out.lastIndexOf("::int")
    expect(filterIdx).toBeGreaterThanOrEqual(0)
    expect(castIdx).toBeGreaterThan(filterIdx)
  })
})
