import sanitizeHtml from "sanitize-html"

/**
 * Sanitize untrusted HTML produced by a rich-text editor (e.g. project descriptions).
 * Always runs on the server before persistence. Strips scripts, event handlers,
 * javascript: URLs, and any tag/attribute outside the allowlist.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "code",
      "pre",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "a",
      "img",
      "hr",
      "span",
      // Tables (Tiptap editor produces these for project descriptions)
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title"],
      th: ["scope", "colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      "*": ["class"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          // Force safe link behavior on all anchors
          rel: "noopener noreferrer",
          target: attribs.target === "_blank" ? "_blank" : (attribs.target ?? "_self"),
        },
      }),
    },
  })
}
