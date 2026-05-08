/**
 * Log a single DeepSeek call into ai_usage_log.
 *
 * Called by every callDeepSeek wrapper after a successful API response.
 * Failures aren't logged here — the caller's error handling already
 * surfaces them; we only count tokens that actually got billed.
 */

import { db } from "@/drizzle/db"
import { aiUsageLog } from "@/drizzle/db/schema"

export interface DeepSeekUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

/**
 * Insert one usage row. `usage` is the JSON object returned by the
 * OpenAI-compatible `usage` field on a DeepSeek response. Numbers default
 * to 0 if any field is missing.
 *
 * Errors are swallowed and logged — a failed insert here must NEVER take
 * down the AI feature itself.
 */
export async function logAiUsage(
  functionName: string,
  model: string,
  usage: DeepSeekUsage | undefined,
): Promise<void> {
  try {
    await db.insert(aiUsageLog).values({
      functionName,
      model,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    })
  } catch (err) {
    console.error("logAiUsage insert failed:", err)
  }
}

/**
 * DeepSeek price table (USD per 1M tokens). Update when the provider
 * changes pricing — used only for cost estimates in the admin dashboard.
 */
export const PRICE_PER_M_TOKENS = {
  prompt: 0.14,
  completion: 0.28,
}

/**
 * Estimate USD cost for a token bundle. Returned as a plain number (not a
 * cents int) since the dashboard formats it for display.
 */
export function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  return (
    (promptTokens * PRICE_PER_M_TOKENS.prompt) / 1_000_000 +
    (completionTokens * PRICE_PER_M_TOKENS.completion) / 1_000_000
  )
}
