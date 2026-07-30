import { logger } from "@/lib/observability/structured-logger"

export function registerNodeRuntimeErrorMonitor() {
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    logger.error("node_runtime_error", {
      status: origin,
      provider: "node",
      error,
    })
  })
}
