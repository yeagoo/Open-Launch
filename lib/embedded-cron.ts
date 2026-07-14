import { fetchWithTimeout, withTimeout } from "@/lib/fetch-timeout"

const INITIAL_DELAY_MS = 10_000
const TICK_MS = 60_000
const REQUEST_TIMEOUT_MS = 290_000

type NodeTimer = ReturnType<typeof setTimeout>

interface EmbeddedCronState {
  timeout?: NodeTimer
  interval?: ReturnType<typeof setInterval>
  consecutiveFailures: number
}

const globalForCron = globalThis as typeof globalThis & {
  __aatEmbeddedCronState?: EmbeddedCronState
}

/**
 * Redundant in-process trigger for self-hosted Next.js.
 *
 * The external cron-job.org trigger remains useful, but it is no longer a
 * single point of failure: every running Zeabur pod also calls the existing
 * authenticated dispatcher once per minute. The dispatcher's Redis lease
 * deduplicates overlapping pods and external calls.
 */
export function startEmbeddedCron(): void {
  if (process.env.NODE_ENV !== "production") return
  if (process.env.EMBEDDED_CRON_DISABLED === "true") return
  if (globalForCron.__aatEmbeddedCronState) return

  const apiKey = process.env.CRON_API_KEY
  if (!apiKey) {
    console.error("[embedded-cron] CRON_API_KEY missing; redundant scheduler disabled")
    return
  }

  if (!process.env.CRON_HEARTBEAT_URL) {
    console.warn(
      "[embedded-cron] CRON_HEARTBEAT_URL missing; dispatch is redundant but external dead-man alerts are disabled",
    )
  }

  const state: EmbeddedCronState = { consecutiveFailures: 0 }
  globalForCron.__aatEmbeddedCronState = state

  const tick = async () => {
    try {
      const baseUrl = `http://127.0.0.1:${process.env.PORT ?? "3000"}`
      const response = await fetchWithTimeout(
        `${baseUrl}/api/cron/dispatch`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
        REQUEST_TIMEOUT_MS,
        "embedded cron dispatch",
      )
      const body = await withTimeout(
        response.text(),
        REQUEST_TIMEOUT_MS,
        "embedded cron response",
      ).catch(() => "")

      if (!response.ok) {
        throw new Error(`dispatcher returned ${response.status}: ${body.slice(0, 300)}`)
      }
      state.consecutiveFailures = 0
    } catch (error) {
      state.consecutiveFailures++
      // Log the first failure immediately, then every tenth failure. A pod can
      // take a few seconds to accept loopback traffic during startup.
      if (state.consecutiveFailures === 1 || state.consecutiveFailures % 10 === 0) {
        console.error(
          `[embedded-cron] dispatch failed (${state.consecutiveFailures} consecutive):`,
          error,
        )
      }
    }
  }

  state.timeout = setTimeout(() => {
    void tick()
    state.interval = setInterval(() => void tick(), TICK_MS)
    state.interval.unref?.()
  }, INITIAL_DELAY_MS)
  state.timeout.unref?.()
  console.log("[embedded-cron] redundant one-minute dispatcher armed")
}
