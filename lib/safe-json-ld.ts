/**
 * Serialize JSON for an inline <script type="application/ld+json"> context.
 * JSON.stringify does not escape '<', so an untrusted string containing
 * </script> can otherwise terminate the element and inject executable HTML.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
