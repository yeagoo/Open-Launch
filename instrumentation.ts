import type { Instrumentation } from "next"

import { logger } from "@/lib/observability/structured-logger"

const globalForInstrumentation = globalThis as typeof globalThis & {
  __aatRequestErrorMonitorRegistered?: boolean
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (globalForInstrumentation.__aatRequestErrorMonitorRegistered) return

  globalForInstrumentation.__aatRequestErrorMonitorRegistered = true

  // Fail fast on missing critical env in production — but never during the
  // build: the Docker builder intentionally has no runtime secrets, and
  // register() is also evaluated while building.
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const { validateRuntimeEnv } = await import("./lib/env")
    validateRuntimeEnv()
  }

  const [{ registerNodeRuntimeErrorMonitor }, { startEmbeddedCron }] = await Promise.all([
    import("./lib/node-runtime-error-monitor"),
    import("./lib/embedded-cron"),
  ])
  registerNodeRuntimeErrorMonitor()
  startEmbeddedCron()
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  logger.error("next_request_error", {
    requestId: requestHeader(request.headers, "x-aat-request-id"),
    route: context.routePath,
    status: "failed",
    provider: "next",
    context: {
      method: request.method,
      routerKind: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    },
    error,
  })
}

function requestHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  const value = entry?.[1]
  return Array.isArray(value) ? value[0] : value
}
