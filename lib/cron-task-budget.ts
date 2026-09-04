interface CronTaskBudgetInput {
  startedAtMs: number
  nowMs: number
  taskTimeoutMs: number
  operationTimeoutMs: number
  completionReserveMs: number
}

export const CRON_SUBTASK_TIMEOUT_MS = 240_000

/**
 * Start another bounded operation only when it can finish before the outer
 * dispatcher timeout with enough time left for database writes and response
 * serialization.
 */
export function canStartCronOperation(input: CronTaskBudgetInput): boolean {
  const elapsedMs = Math.max(0, input.nowMs - input.startedAtMs)
  return elapsedMs + input.operationTimeoutMs + input.completionReserveMs <= input.taskTimeoutMs
}
