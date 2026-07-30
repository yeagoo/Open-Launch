import "server-only"

import {
  buildStructuredLog,
  type StructuredLogFields,
  type StructuredLogLevel,
} from "@/lib/observability/structured-log-core"

export function logStructured(
  level: StructuredLogLevel,
  event: string,
  fields: StructuredLogFields = {},
): void {
  const record = buildStructuredLog(level, event, fields)
  const output = redactEnvironmentSecrets(
    process.env.STRUCTURED_LOG_FORMAT === "text"
      ? `[${record.timestamp}] ${record.level.toUpperCase()} ${record.event} ${JSON.stringify({
          ...record,
          timestamp: undefined,
          level: undefined,
          event: undefined,
        })}`
      : JSON.stringify(record),
  )

  if (level === "error") console.error(output)
  else if (level === "warn") console.warn(output)
  else if (level === "debug") console.debug(output)
  else console.info(output)
}

function redactEnvironmentSecrets(output: string): string {
  const environmentSecrets = Object.entries(process.env)
    .filter(
      ([key, value]) =>
        Boolean(value) &&
        value!.length >= 8 &&
        /(secret|token|password|passphrase|api[_-]?key|access[_-]?key|private[_-]?key)/i.test(key),
    )
    .map(([, value]) => value!)
    .sort((left, right) => right.length - left.length)

  let sanitized = output
  for (const secret of environmentSecrets) {
    const escaped = JSON.stringify(secret).slice(1, -1)
    sanitized = sanitized.replaceAll(escaped, "[redacted-env]")
  }
  return sanitized
}

export const logger = {
  debug(event: string, fields?: StructuredLogFields): void {
    logStructured("debug", event, fields)
  },
  info(event: string, fields?: StructuredLogFields): void {
    logStructured("info", event, fields)
  },
  warn(event: string, fields?: StructuredLogFields): void {
    logStructured("warn", event, fields)
  },
  error(event: string, fields?: StructuredLogFields): void {
    logStructured("error", event, fields)
  },
}
