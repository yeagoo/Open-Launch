// Shared circuit breaker for the DeepSeek API.
//
// When the prepaid balance runs out, DeepSeek returns HTTP 402 ("Insufficient
// Balance") for every request. Without a breaker each per-item cron loop
// (alternatives pre-screen, comparison generation, blog translate/recap/roundup,
// comments, quality, enrich) keeps calling the API once per item — dozens of
// doomed calls per run, every minute, flooding logs and (for the crawl-then-AI
// flows) burning Tinyfish quota on work that cannot complete.
//
// The breaker trips on the first hard billing failure and makes subsequent
// calls fail fast (no network) for a short cooldown, so the system degrades
// gracefully until the balance is topped up. Transient errors (429, 5xx) do
// NOT trip it — those are worth retrying.

const COOLDOWN_MS = 5 * 60_000 // 5 min; cron cadence is per-minute

let trippedUntil = 0
let lastReason = ""

export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(`AI temporarily unavailable: ${reason}`)
    this.name = "AiUnavailableError"
  }
}

/** True while the breaker is open (billing outage in the cooldown window). */
export function aiCircuitOpen(): boolean {
  return Date.now() < trippedUntil
}

/** Throw fast (no network call) while the breaker is open. */
export function assertAiAvailable(): void {
  if (aiCircuitOpen()) {
    throw new AiUnavailableError(lastReason || "circuit open")
  }
}

/**
 * Inspect a failed DeepSeek response. Trips the breaker on a hard billing
 * failure (402, or a body that says "insufficient balance") so following calls
 * short-circuit for COOLDOWN_MS. Safe to call from every `!response.ok` branch.
 */
export function noteAiResponse(status: number, body: string): void {
  if (status === 402 || /insufficient balance/i.test(body)) {
    trippedUntil = Date.now() + COOLDOWN_MS
    lastReason = `DeepSeek ${status}: insufficient balance`
  }
}
