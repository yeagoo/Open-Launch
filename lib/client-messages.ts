import type { AbstractIntlMessages } from "next-intl"

/**
 * Keep the Server Component payload bounded by sending Client Components only
 * the top-level message namespaces they actually consume.
 */
export function pickClientMessages(
  messages: AbstractIntlMessages,
  namespaces: readonly string[],
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {}
  for (const namespace of namespaces) {
    const value = messages[namespace]
    if (value !== undefined) picked[namespace] = value
  }
  return picked
}
