import { redactLogText } from "@/lib/log-redaction"

const MAX_FIELD_LENGTH = 300
const MAX_STACK_LINES = 8

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
  const cleaned = redactLogText(value)
    .replace(/[\r\n\t]+/g, " ")
    .trim()
  return cleaned.length > MAX_FIELD_LENGTH ? `${cleaned.slice(0, MAX_FIELD_LENGTH)}...` : cleaned
}
