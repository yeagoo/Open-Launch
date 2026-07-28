const DAY_MS = 24 * 60 * 60 * 1000

export const ALTERNATIVE_DEFINITIVE_REATTEMPT_DAYS = 30
export const ALTERNATIVE_RETRYABLE_DELAY_MS = 60 * 60 * 1000

const DEFINITIVE_COOLDOWN_MS = ALTERNATIVE_DEFINITIVE_REATTEMPT_DAYS * DAY_MS

export type AlternativeAttemptOutcome = "definitive" | "retryable"

export function getAlternativeReattemptCutoff(now = new Date()): Date {
  return new Date(now.getTime() - DEFINITIVE_COOLDOWN_MS)
}

export function getAlternativeAttemptTimestamp(
  outcome: AlternativeAttemptOutcome,
  now = new Date(),
): Date {
  if (outcome === "definitive") return now

  // The selection query has one cutoff (`attempted_at < now - 30 days`).
  // Backdate retryable failures so they cross that cutoff after one hour,
  // while definitive no-match outcomes still receive the full 30-day cooldown.
  return new Date(now.getTime() - DEFINITIVE_COOLDOWN_MS + ALTERNATIVE_RETRYABLE_DELAY_MS)
}
