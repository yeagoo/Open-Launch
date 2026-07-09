import type { Instrumentation } from "next"

import { buildNextRequestErrorLog } from "@/lib/request-error-log"

const globalForInstrumentation = globalThis as typeof globalThis & {
  __aatRequestErrorMonitorRegistered?: boolean
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if (globalForInstrumentation.__aatRequestErrorMonitorRegistered) return

  globalForInstrumentation.__aatRequestErrorMonitorRegistered = true
  const { registerNodeRuntimeErrorMonitor } = await import("./lib/node-runtime-error-monitor")
  registerNodeRuntimeErrorMonitor()
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  console.error(
    "[next-request-error]",
    JSON.stringify(buildNextRequestErrorLog(error, request, context)),
  )
}
