import { addDays, addHours } from "date-fns"

export type CrawlFailureKind = "provider" | "permanent" | "degraded" | "transient" | "unknown"

export type CrawlFailurePolicy =
  | { kind: "provider"; shouldSuspendProject: false }
  | {
      kind: Exclude<CrawlFailureKind, "provider">
      shouldSuspendProject: true
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

  // Credentials, provider quotas and missing crawler configuration affect all
  // URLs. Persisting them against individual projects would quarantine the
  // whole catalogue even after the operational issue has been fixed.
  if (
    normalized.includes("api key") ||
    normalized.includes("rate limit") ||
    normalized.includes("environment variable is not set") ||
    normalized.includes("http 401") ||
    normalized.includes("http 429")
  ) {
    return { kind: "provider", shouldSuspendProject: false }
  }

  if (
    normalized.includes("page_not_found") ||
    normalized.includes("invalid_url") ||
    normalized.includes("enotfound") ||
    normalized.includes("domain_not_found")
  ) {
    return {
      kind: "permanent",
      shouldSuspendProject: true,
      suspendedUntil: addDays(now, 30),
    }
  }

  if (
    normalized.includes("target_http_error") ||
    normalized.includes("empty_content") ||
    normalized.includes("no text content")
  ) {
    return {
      kind: "degraded",
      shouldSuspendProject: true,
      suspendedUntil: addDays(now, 7),
    }
  }

  if (
    normalized.includes("proxy_error") ||
    normalized.includes("target_unreachable") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("econnreset") ||
    normalized.includes("econnrefused")
  ) {
    return {
      kind: "transient",
      shouldSuspendProject: true,
      suspendedUntil: addHours(now, 1),
    }
  }

  return {
    kind: "unknown",
    shouldSuspendProject: true,
    suspendedUntil: addHours(now, 6),
  }
}
