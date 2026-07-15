/**
 * Keep production logs useful without storing a complete email address.
 * Deliberately preserves the domain so provider-specific delivery incidents
 * can still be diagnosed.
 */
export function redactEmail(email: string): string {
  const separator = email.lastIndexOf("@")
  if (separator <= 0 || separator === email.length - 1) return "[redacted-email]"

  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}***@${domain}`
}

const EMAIL_IN_TEXT_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi

export function redactEmailsInText(value: string): string {
  return value.replace(EMAIL_IN_TEXT_REGEX, (email) => redactEmail(email))
}
