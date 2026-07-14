import { addDays, addHours } from "date-fns"

export type CrawlFailureKind = "permanent" | "degraded" | "transient" | "unknown"

export interface CrawlFailurePolicy {
  kind: CrawlFailureKind
  suspendedUntil: Date
}

/**
 * Convert provider/network wording into a bounded retry policy.
 *
 * Permanent URL failures get a long quarantine, HTTP/content failures get a
 * one-week recheck, and proxy/timeouts retry after an hour. Unknown crawler
 * failures use six hours so an outage cannot hot-loop yet recovers the same day.
 */
export function crawlFailurePolicy(message: string, now = new Date()): CrawlFailurePolicy {
  const normalized = message.toLowerCase()

  if (
    normalized.includes("page_not_found") ||
    normalized.includes("invalid_url") ||
    normalized.includes("enotfound") ||
    normalized.includes("domain_not_found")
  ) {
    return { kind: "permanent", suspendedUntil: addDays(now, 30) }
  }

  if (
    normalized.includes("target_http_error") ||
    normalized.includes("empty_content") ||
    normalized.includes("no text content")
  ) {
    return { kind: "degraded", suspendedUntil: addDays(now, 7) }
  }

  if (
    normalized.includes("proxy_error") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("econnreset") ||
    normalized.includes("econnrefused")
  ) {
    return { kind: "transient", suspendedUntil: addHours(now, 1) }
  }

  return { kind: "unknown", suspendedUntil: addHours(now, 6) }
}
