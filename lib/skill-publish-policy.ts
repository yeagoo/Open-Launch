export const SKILL_PUBLISH_MAX_ATTEMPTS = 8
export const SKILL_PUBLISH_BATCH_SIZE = 25
export const SKILL_GLOBAL_DAILY_LIMIT = 10
export const SKILL_GLOBAL_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000

export function skillPublishBackoffMinutes(attempts: number): number {
  return Math.min(2 ** attempts, 120)
}
