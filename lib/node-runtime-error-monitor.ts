import { buildNodeRuntimeErrorLog } from "@/lib/request-error-log"

export function registerNodeRuntimeErrorMonitor() {
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    console.error("[node-runtime-error]", JSON.stringify(buildNodeRuntimeErrorLog(error, origin)))
  })
}
