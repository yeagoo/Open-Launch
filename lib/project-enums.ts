/**
 * Pure-data enums used both by the DB schema (as column defaults /
 * literal types) and by client-side forms (as picker options). Lives
 * in its own module so client components can `import { platformType }`
 * without webpack dragging `drizzle-orm/pg-core` and the schema
 * graph into the browser bundle.
 *
 * `schema.ts` re-imports these and references them in column
 * definitions; same source of truth, no duplication.
 */

export const pricingType = {
  FREE: "free",
  FREEMIUM: "freemium",
  PAID: "paid",
} as const

export const platformType = {
  WEB: "web",
  MOBILE: "mobile",
  DESKTOP: "desktop",
  API: "api",
  OTHER: "other",
} as const

// Launch status — strings persisted in the project.launch_status
// column. Mirrors the same set defined in `drizzle/db/schema.ts`
// (re-exported there so server code that does
// `import { launchStatus } from "@/drizzle/db/schema"` keeps working).
export const launchStatus = {
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_FAILED: "payment_failed",
  SCHEDULED: "scheduled",
  ONGOING: "ongoing",
  LAUNCHED: "launched",
} as const
