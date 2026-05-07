/**
 * Defensive cleanup for AI-produced markdown stored in `project_translation.long_description`.
 *
 * The renderer (react-markdown without rehype-raw) already escapes HTML, so this
 * is belt-and-suspenders: we strip outer code-fence wrappers the model sometimes
 * adds around the whole document and remove any raw HTML tags so search-engine
 * crawlers don't see broken/unsafe markup either.
 */
export function sanitizeMarkdown(input: string): string {
  let out = input.trim()

  // Strip a single outer ```markdown fenced wrapper if the model added one.
  const fenceMatch = out.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i)
  if (fenceMatch) out = fenceMatch[1].trim()

  // Drop any HTML tags entirely. We never want raw HTML inside long descriptions —
  // markdown is the only allowed markup.
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, "")

  // Strip script/style content blocks just in case the regex above got tricked.
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")

  return out.trim()
}
