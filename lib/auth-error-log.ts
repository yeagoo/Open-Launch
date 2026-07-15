import { redactEmailsInText } from "@/lib/log-redaction"

const MAX_FIELD_LENGTH = 300
const MAX_STACK_LINES = 8
const SENSITIVE_VALUE =
  /\b(access_token|refresh_token|id_token|client_secret|code|state|token|secret|password)\b(\s*[=:]\s*)([^\s&,}\]]+)/gi

export interface BetterAuthApiErrorLog {
  source: "better_auth_api_error"
  at: string
  error: {
    name: string
    message: string
    stack: string[] | null
  }
}

export function buildBetterAuthApiErrorLog(
  error: unknown,
  now = new Date(),
): BetterAuthApiErrorLog {
  if (!(error instanceof Error)) {
    return {
      source: "better_auth_api_error",
      at: now.toISOString(),
      error: { name: "NonError", message: sanitize(String(error)), stack: null },
    }
  }

  const stack = error.stack
    ?.split("\n")
    .slice(1, MAX_STACK_LINES + 1)
    .map(sanitize)
    .filter(Boolean)

  return {
    source: "better_auth_api_error",
    at: now.toISOString(),
    error: {
      name: sanitize(error.name) || "Error",
      message: sanitize(error.message),
      stack: stack?.length ? stack : null,
    },
  }
}

function sanitize(value: string): string {
  const cleaned = redactEmailsInText(
    value
      .replace(/Bearer\s+[^\s,}\]]+/gi, "Bearer [redacted]")
      .replace(SENSITIVE_VALUE, (_match, key: string, separator: string) => {
        return `${key}${separator}[redacted]`
      })
      .replace(/[\r\n\t]+/g, " ")
      .trim(),
  )
  return cleaned.length > MAX_FIELD_LENGTH ? `${cleaned.slice(0, MAX_FIELD_LENGTH)}...` : cleaned
}
