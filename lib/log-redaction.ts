export function redactEmail(email: string): string {
  const separator = email.lastIndexOf("@")
  if (separator <= 0 || separator === email.length - 1) return "[redacted-email]"
  return "[redacted-email]"
}

const EMAIL_IN_TEXT_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const URL_IN_TEXT_REGEX = /\b(?:https?|postgres(?:ql)?|redis):\/\/[^\s,;)}\]]+/gi
const SENSITIVE_ASSIGNMENT_REGEX =
  /\b(authorization|cookie|set-cookie|stripe-signature|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|secret|signature|token|code|state)\b(\s*[=:]\s*)(?:"[^"]*"|'[^']*'|\[[^\]]*\]|[^\s,;)}\]]+)/gi
const BEARER_REGEX = /\bBearer\s+[^\s,;)}\]]+/gi
const REQUEST_PATH_REGEX = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\/[^\s,;)}\]]+/gi
const STRIPE_IDENTIFIER_REGEX =
  /\b(?:cs|sub|pi|ch|cus|evt|in|pm|re|whsec|sk|pk)_(?:test_|live_)?[A-Za-z0-9_-]+\b/g
const UUID_REGEX = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi

export function redactEmailsInText(value: string): string {
  return value.replace(EMAIL_IN_TEXT_REGEX, (email) => redactEmail(email))
}

export function redactLogText(value: string): string {
  return redactEmailsInText(value)
    .replace(URL_IN_TEXT_REGEX, "[redacted-url]")
    .replace(REQUEST_PATH_REGEX, (_match, method: string) => `${method} [redacted-url]`)
    .replace(BEARER_REGEX, "Bearer [redacted]")
    .replace(
      SENSITIVE_ASSIGNMENT_REGEX,
      (_match, key: string, separator: string) => `${key}${separator}[redacted]`,
    )
    .replace(STRIPE_IDENTIFIER_REGEX, "[redacted-stripe-id]")
    .replace(UUID_REGEX, "[redacted-id]")
}
