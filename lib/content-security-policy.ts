const CSP_REPORT_PATH = "/api/csp-report"

const REPORT_ONLY_DIRECTIVES = [
  "default-src 'self'",
  // Next's bootstrap and the current analytics bootstrap are inline. A strict
  // nonce policy is a later rendering/caching change, not a safe header-only
  // rollout.
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://analytics.hicyou.de https://challenges.cloudflare.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  // Product and profile images can still point at validated third-party HTTPS
  // URLs. Narrow this after report-only telemetry confirms the real inventory.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://analytics.hicyou.de https://challenges.cloudflare.com https://accounts.google.com",
  "frame-src https://challenges.cloudflare.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "media-src 'self' https:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  `report-uri ${CSP_REPORT_PATH}`,
] as const

export function buildReportOnlyContentSecurityPolicy(): string {
  return REPORT_ONLY_DIRECTIVES.join("; ")
}

export interface CspViolationSummary {
  documentPath: string
  blockedHost: string
  effectiveDirective: string
  violatedDirective: string
  disposition: string
  statusCode: number | null
}

export function parseCspViolationReport(payload: unknown): CspViolationSummary | null {
  if (!isRecord(payload) || !isRecord(payload["csp-report"])) return null
  const report = payload["csp-report"]

  const documentPath = documentPathFrom(readString(report, "document-uri"))
  const effectiveDirective = safeDirective(readString(report, "effective-directive"))
  const violatedDirective = safeDirective(readString(report, "violated-directive"))
  if (!documentPath || (!effectiveDirective && !violatedDirective)) return null

  return {
    documentPath,
    blockedHost: blockedHostFrom(readString(report, "blocked-uri")),
    effectiveDirective: effectiveDirective || "unknown",
    violatedDirective: violatedDirective || effectiveDirective || "unknown",
    disposition: safeToken(readString(report, "disposition")) || "report",
    statusCode: safeStatusCode(report["status-code"]),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === "string" ? value.trim() : ""
}

function documentPathFrom(value: string): string {
  if (!value) return ""
  try {
    const path = new URL(value).pathname.replace(/\/{2,}/g, "/")
    return path.startsWith("/") ? path.slice(0, 300) : ""
  } catch {
    return ""
  }
}

function blockedHostFrom(value: string): string {
  const token = safeToken(value)
  if (["inline", "eval", "data", "blob", "self", "none"].includes(token)) return token
  try {
    return new URL(value).hostname.toLowerCase().slice(0, 200)
  } catch {
    return "unknown"
  }
}

function safeDirective(value: string): string {
  const firstDirective = value.toLowerCase().split(/\s+/, 1)[0] ?? ""
  return /^[a-z][a-z-]{0,63}$/.test(firstDirective) ? firstDirective : ""
}

function safeToken(value: string): string {
  const normalized = value.toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : ""
}

function safeStatusCode(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : null
}
