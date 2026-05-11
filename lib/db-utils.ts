import { sql, type SQL } from "drizzle-orm"

/**
 * Postgres-safe `count(*)` that returns a real JS number.
 *
 * Plain ``sql<number>`count(*)` `` is a trap: pg/Drizzle serialises
 * the BIGINT result to a JS *string* (because JS Number can't hold
 * arbitrary BIGINT values precisely). The `sql<number>` type hint is
 * just a TypeScript fiction — runtime still gets a string and any
 * subsequent arithmetic silently becomes string concatenation:
 *
 *     `10 - ("0" + "5" + "0") === -40`  →  `max(0, -40) === 0`
 *
 * That exact landmine took down the date picker (PR #X). Cast to
 * int4 in SQL so the value comes back as a JS number, matching the
 * `<number>` type contract.
 *
 * Limits: int4 maxes out at ~2.1B. If you ever count > 2 billion
 * rows in a single query, switch to `mapWith(Number)` over BIGINT.
 *
 * @example
 *   countInt()
 *     → SQL fragment: `count(*)::int`
 *   countInt(sql`${project.launchType} = 'premium'`)
 *     → SQL fragment: `count(*) filter (where project.launch_type = 'premium')::int`
 */
export function countInt(filter?: SQL): SQL<number> {
  if (filter !== undefined) {
    return sql<number>`count(*) filter (where ${filter})::int`
  }
  return sql<number>`count(*)::int`
}
