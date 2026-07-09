import type { Instrumentation } from "next"

type ErrorRequest = Parameters<Instrumentation.onRequestError>[1]
type ErrorContext = Parameters<Instrumentation.onRequestError>[2]
type HeaderDict = ErrorRequest["headers"]

const MAX_FIELD_LENGTH = 300
const MAX_STACK_LINES = 8

export interface NextRequestErrorLog {
  source: "next_request_error"
  at: string
  request: {
    method: string
    path: string
    userAgent: string | null
    referer: string | null
    zeaburRequestId: string | null
    cfRay: string | null
    aatRequestId: string | null
  }
  context: {
    routerKind: ErrorContext["routerKind"]
    routePath: string
    routeType: ErrorContext["routeType"]
    renderSource: ErrorContext["renderSource"] | null
    revalidateReason: ErrorContext["revalidateReason"] | null
  }
  error: SerializedError
}

export interface NodeRuntimeErrorLog {
  source: "node_runtime_error"
  at: string
  origin: string
  error: SerializedError
}

interface SerializedError {
  name: string
  message: string
  digest: string | null
  stack: string[] | null
}

export function buildNextRequestErrorLog(
  error: unknown,
  request: ErrorRequest,
  context: ErrorContext,
  now = new Date(),
): NextRequestErrorLog {
  return {
    source: "next_request_error",
    at: now.toISOString(),
    request: {
      method: sanitizeField(request.method) || "UNKNOWN",
      path: sanitizePath(request.path),
      userAgent: headerValue(request.headers, "user-agent"),
      referer: sanitizeReferer(headerValue(request.headers, "referer")),
      zeaburRequestId: headerValue(request.headers, "x-zeabur-request-id"),
      cfRay: headerValue(request.headers, "cf-ray"),
      aatRequestId: headerValue(request.headers, "x-aat-request-id"),
    },
    context: {
      routerKind: context.routerKind,
      routePath: sanitizeField(context.routePath) || "unknown",
      routeType: context.routeType,
      renderSource: context.renderSource ?? null,
      revalidateReason: context.revalidateReason ?? null,
    },
    error: serializeError(error),
  }
}

export function buildNodeRuntimeErrorLog(
  error: unknown,
  origin: string,
  now = new Date(),
): NodeRuntimeErrorLog {
  return {
    source: "node_runtime_error",
    at: now.toISOString(),
    origin: sanitizeField(origin) || "unknown",
    error: serializeError(error),
  }
}

function headerValue(headers: HeaderDict, name: string): string | null {
  const needle = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== needle) continue
    const first = Array.isArray(value) ? value[0] : value
    return sanitizeField(first)
  }
  return null
}

function sanitizePath(path: string): string {
  try {
    const url = new URL(path, "https://aat.invalid")
    const keys = Array.from(new Set(url.searchParams.keys()))
    const redactedQuery =
      keys.length > 0 ? `?${keys.map((key) => `${key}=[redacted]`).join("&")}` : ""
    return sanitizeField(`${url.pathname}${redactedQuery}`) || "/"
  } catch {
    return sanitizeField(path) || "unknown"
  }
}

function sanitizeReferer(referer: string | null): string | null {
  if (!referer) return null
  try {
    const url = new URL(referer)
    return sanitizeField(`${url.origin}${sanitizePath(`${url.pathname}${url.search}`)}`)
  } catch {
    return sanitizeField(referer)
  }
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: sanitizeField(error.name) || "Error",
      message: sanitizeField(error.message) || "",
      digest: digestOf(error),
      stack: stackLines(error.stack),
    }
  }

  return {
    name: "NonError",
    message: sanitizeField(String(error)) || "",
    digest: digestOf(error),
    stack: null,
  }
}

function digestOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null
  const digest = (error as { digest?: unknown }).digest
  return typeof digest === "string" || typeof digest === "number"
    ? sanitizeField(String(digest))
    : null
}

function stackLines(stack: string | undefined): string[] | null {
  if (!stack) return null
  const lines = stack
    .split("\n")
    .slice(0, MAX_STACK_LINES)
    .map((line) => sanitizeField(line))
    .filter((line): line is string => Boolean(line))
  return lines.length > 0 ? lines : null
}

function sanitizeField(value: string | undefined | null): string | null {
  if (!value) return null
  const cleaned = value.replace(/[\r\n\t]+/g, " ").trim()
  if (!cleaned) return null
  return cleaned.length > MAX_FIELD_LENGTH ? `${cleaned.slice(0, MAX_FIELD_LENGTH)}...` : cleaned
}
