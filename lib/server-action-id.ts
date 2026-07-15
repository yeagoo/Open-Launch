// Server Action IDs are opaque implementation details. Next.js 15 builds in
// the production logs used 40 hex characters, while the current Next.js 16
// build emits a two-character prefix followed by a 40-character hash. Keep
// this guard deliberately permissive so it filters obvious probes without
// turning a framework format change into a site-wide Server Action outage.
const PLAUSIBLE_SERVER_ACTION_ID = /^[a-f0-9]{40,64}$/i

export function isPlausibleServerActionId(value: string): boolean {
  return PLAUSIBLE_SERVER_ACTION_ID.test(value)
}
