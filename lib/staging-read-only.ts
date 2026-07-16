export interface StagingReadOnlyDecision {
  status: 404 | 405
  reason: "sensitive_path" | "write_method"
}

const SENSITIVE_PREFIXES = ["/api/auth", "/api/cron", "/admin"]

export function stagingReadOnlyDecision(
  enabled: boolean,
  method: string,
  pathname: string,
): StagingReadOnlyDecision | null {
  if (!enabled) return null

  if (
    SENSITIVE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    return { status: 404, reason: "sensitive_path" }
  }

  if (method !== "GET" && method !== "HEAD") {
    return { status: 405, reason: "write_method" }
  }

  return null
}
