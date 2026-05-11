import { cache } from "react"
import { headers } from "next/headers"

import { auth } from "@/lib/auth"

/**
 * Per-request memoized session lookup. Wrapped in React `cache()`
 * so that within a single server request, multiple call sites
 * share one `auth.api.getSession()` invocation — which in turn
 * means one cookie parse + one session-validation DB hit instead
 * of N.
 *
 * The home page is the canonical case: 3 list fetchers each used
 * to call this independently, costing 3x the auth round-trip per
 * render. `cache()` collapses it back to 1.
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
})
