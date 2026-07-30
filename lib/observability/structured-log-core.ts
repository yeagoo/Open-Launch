import { redactLogText } from "@/lib/log-redaction"

export type StructuredLogLevel = "debug" | "info" | "warn" | "error"

export interface StructuredLogFields {
  requestId?: string | null
  jobId?: string | null
  route?: string | null
  status?: string | number | null
  durationMs?: number | null
  provider?: string | null
  context?: unknown
  error?: unknown
}

export interface StructuredLogRecord {
  timestamp: string
  level: StructuredLogLevel
  event: string
  request_id?: string
  job_id?: string
  route?: string
  status?: string | number
  duration_ms?: number
  provider?: string
  context?: unknown
  error?: {
    name: string
    message: string
    code?: string
    stack?: string[]
  }
}

const MAX_TEXT_LENGTH = 500
const MAX_STACK_LINES = 8
const MAX_CONTEXT_DEPTH = 3
const MAX_CONTEXT_KEYS = 24
const MAX_ARRAY_ITEMS = 12
const SAFE_EVENT = /^[a-z0-9][a-z0-9_.-]{0,79}$/
const SAFE_PROVIDER = /^[a-z0-9][a-z0-9_.-]{0,49}$/
const SENSITIVE_KEY =
  /^(authorization|cookie|set[_-]?cookie|stripe[_-]?signature|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|secret|signature|token|email|user[_-]?id|query|search|search[_-]?params)$/i
const PRIVATE_LOCATION_KEY = /^(url|uri|href|referer|referrer|pathname|request[_-]?url)$/i

export function buildStructuredLog(
  level: StructuredLogLevel,
  event: string,
  fields: StructuredLogFields = {},
  now = new Date(),
): StructuredLogRecord {
  const record: StructuredLogRecord = {
    timestamp: now.toISOString(),
    level,
    event: SAFE_EVENT.test(event) ? event : "invalid_event",
  }

  const requestId = sanitizeIdentifier(fields.requestId)
  if (requestId) record.request_id = requestId
  const jobId = sanitizeIdentifier(fields.jobId)
  if (jobId) record.job_id = jobId
  const route = sanitizeRoute(fields.route)
  if (route) record.route = route
  const status = sanitizeStatus(fields.status)
  if (status !== undefined) record.status = status
  const durationMs = sanitizeDuration(fields.durationMs)
  if (durationMs !== undefined) record.duration_ms = durationMs
  const provider = sanitizeProvider(fields.provider)
  if (provider) record.provider = provider
  const context = sanitizeContext(fields.context, 0)
  if (context !== undefined) record.context = context
  const error = serializeError(fields.error)
  if (error) record.error = error

  return record
}

export function sanitizeLogContext(value: unknown): unknown {
  return sanitizeContext(value, 0)
}

function sanitizeRoute(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, "https://aat.invalid")
    const pathname = url.pathname.replace(/\/{2,}/g, "/")
    if (pathname.startsWith("/api/cron/")) {
      const task = pathname.slice("/api/cron/".length)
      return /^[a-z0-9-]+$/.test(task) ? `/api/cron/${task}` : "/api/cron/[task]"
    }
    if (pathname === "/api/auth/stripe/webhook") return pathname
    if (pathname.startsWith("/api/")) return "/api/[route]"
    return publicRouteFamily(pathname)
  } catch {
    return undefined
  }
}

function publicRouteFamily(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean)
  if (segments[0] && /^(en|zh|es|pt|fr|ja|ko|et)$/.test(segments[0])) segments.shift()
  if (segments.length === 0) return "/"

  const [root] = segments
  if (["projects", "blog", "tags", "reviews", "users", "compare", "alternatives"].includes(root)) {
    if (segments.length >= 2) return `/${root}/[param]`
    return `/${root}`
  }
  if (root === "s") return "/s/[param]"
  if (["dashboard", "settings", "notifications", "admin"].includes(root)) return `/${root}`
  return `/${root}`
}

function sanitizeStatus(value: string | number | null | undefined): string | number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : undefined
  }
  return sanitizeText(value)
}

function sanitizeDuration(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.round(value))
}

function sanitizeProvider(value: string | null | undefined): string | undefined {
  const sanitized = value?.trim().toLowerCase()
  return sanitized && SAFE_PROVIDER.test(sanitized) ? sanitized : undefined
}

function sanitizeIdentifier(value: string | null | undefined): string | undefined {
  const sanitized = value?.replace(/[\r\n\t]+/g, " ").trim()
  if (!sanitized || !/^[A-Za-z0-9:._ -]{1,128}$/.test(sanitized)) return undefined
  return sanitized
}

function sanitizeText(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const sanitized = redactLogText(value)
    .replace(/[\r\n\t]+/g, " ")
    .trim()
  if (!sanitized) return undefined
  return sanitized.length > MAX_TEXT_LENGTH
    ? `${sanitized.slice(0, MAX_TEXT_LENGTH)}...`
    : sanitized
}

function sanitizeContext(value: unknown, depth: number): unknown {
  if (value === undefined) return undefined
  if (value === null || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") return sanitizeText(value)
  if (value instanceof Error) return serializeError(value)
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
  if (depth >= MAX_CONTEXT_DEPTH) return "[truncated]"
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeContext(item, depth + 1))
      .filter((item) => item !== undefined)
  }
  if (typeof value !== "object") return sanitizeText(String(value))

  const output: Record<string, unknown> = {}
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_CONTEXT_KEYS)
  for (const [key, item] of entries) {
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64)
    if (!sanitizedKey) continue
    if (SENSITIVE_KEY.test(sanitizedKey)) {
      output[sanitizedKey] = "[redacted]"
      continue
    }
    if (PRIVATE_LOCATION_KEY.test(sanitizedKey)) {
      output[sanitizedKey] = "[redacted-url]"
      continue
    }
    const sanitized = sanitizeContext(item, depth + 1)
    if (sanitized !== undefined) output[sanitizedKey] = sanitized
  }
  return output
}

function serializeError(error: unknown): StructuredLogRecord["error"] | undefined {
  if (error === undefined || error === null) return undefined
  if (!(error instanceof Error)) {
    return {
      name: "NonError",
      message: sanitizeText(String(error)) ?? "",
    }
  }

  const code =
    "code" in error && (typeof error.code === "string" || typeof error.code === "number")
      ? sanitizeText(String(error.code))
      : undefined
  const stack = error.stack
    ?.split("\n")
    .slice(1, MAX_STACK_LINES + 1)
    .map((line) => sanitizeText(line))
    .filter((line): line is string => Boolean(line))

  return {
    name: sanitizeText(error.name) ?? "Error",
    message: sanitizeText(error.message) ?? "",
    ...(code ? { code } : {}),
    ...(stack?.length ? { stack } : {}),
  }
}
