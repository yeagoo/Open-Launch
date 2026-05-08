/**
 * Cheap-and-cheerful HTML-to-1-liner used by the editorial home feed.
 *
 * Project descriptions are stored as 3-5 sentence HTML (with <strong>,
 * <blockquote>, etc.). For the editorial hero card we want a single
 * sentence, plain text, no formatting. This helper strips tags and
 * clips at the first sentence boundary or at maxLen, whichever comes
 * first.
 *
 * Not perfect on edge cases (abbreviations like "U.S." would break the
 * sentence detection), but good enough for marketing-style copy.
 */
export function oneLineSummary(html: string | null | undefined, maxLen = 160): string {
  if (!html) return ""
  // 1. Strip HTML tags.
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
  if (!text) return ""

  // 2. Find the first sentence end. We accept ., !, ?, 。, !, ? (CJK
  //    punctuation) followed by a space or end-of-string.
  const sentenceEnd = text.search(/[.!?。！？](?=\s|$)/)
  let summary = sentenceEnd > 0 ? text.slice(0, sentenceEnd + 1) : text

  // 3. Hard clip if still too long.
  if (summary.length > maxLen) {
    summary = summary.slice(0, maxLen).replace(/\s+\S*$/, "") + "…"
  }
  return summary
}
