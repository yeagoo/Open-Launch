import { sanitizeCronJobError } from "@/lib/cron-ledger-core"

const MAX_RESPONSE_BODY_LENGTH = 16_000

/**
 * Preserve a useful, bounded explanation when an internal cron route returns
 * a non-2xx response. Transport failures already carry an Error message; this
 * fills the observability gap for ordinary HTTP 4xx/5xx responses.
 */
export function cronTaskHttpError(statusCode: number, responseBody: string): string | undefined {
  if (statusCode >= 200 && statusCode < 300) return undefined

  const body = responseBody.trim().slice(0, MAX_RESPONSE_BODY_LENGTH)
  const detail = extractFailureDetail(body)
  return sanitizeCronJobError(
    detail
      ? `cron route returned HTTP ${statusCode}: ${detail}`
      : `cron route returned HTTP ${statusCode}`,
  )
}

function extractFailureDetail(body: string): string {
  if (!body) return ""

  try {
    const payload: unknown = JSON.parse(body)
    if (!isRecord(payload)) return body

    const details: string[] = []
    for (const key of ["error", "message"] as const) {
      const value = payload[key]
      if (typeof value === "string" && value.trim()) details.push(value.trim())
    }

    if (Array.isArray(payload.errors)) {
      details.push(
        ...payload.errors
          .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .slice(0, 3)
          .map((value) => value.trim()),
      )
    }

    return details.join("; ") || body
  } catch {
    return body
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
