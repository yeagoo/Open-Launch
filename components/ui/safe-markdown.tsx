import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Shared safe-by-default markdown renderer for any AI-generated content.
 *
 * Guarantees:
 *  - No raw HTML (we don't pass rehype-raw, so embedded HTML is escaped to text).
 *  - No <img>: AI markdown can't pull third-party resources or leak visitor IPs.
 *  - No javascript:/data:/vbscript: URLs in anchor hrefs.
 *  - All anchors carry rel="noopener noreferrer nofollow" target="_blank".
 *  - Headings are downgraded one level so the section's wrapper heading stays
 *    the dominant H2; AI's intended H2 sections render as H3.
 *
 * Use this component anywhere DeepSeek output is rendered as markdown
 * (project long descriptions, comparison pages, alternatives pages, etc.).
 */

const ALLOWED_ELEMENTS = [
  "p",
  "strong",
  "em",
  "del",
  "blockquote",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "code",
  "pre",
  "hr",
  "br",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
] as const

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined
  const trimmed = href.trim()
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return undefined
  return trimmed
}

// Strip react-markdown's internal `node` prop so it never spreads onto a real
// DOM element as an attribute.
function dropNode<T extends { node?: unknown }>(props: T): Omit<T, "node"> {
  const { node: _node, ...rest } = props
  void _node
  return rest
}

const linkComponent: Components["a"] = (props) => {
  const { href, children, ...rest } = dropNode(props)
  const safe = safeHref(href)
  if (!safe) return <span {...rest}>{children}</span>
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer nofollow" {...rest}>
      {children}
    </a>
  )
}

// Default components — preserves heading levels so full-article pages
// (compare/alternatives) keep their semantic outline.
const baseComponents: Components = { a: linkComponent }

// Components that downgrade headings one level. Use this when the caller
// already provides a wrapping H2 (e.g. LongDescription's "About …" heading)
// so the AI's H2 sections nest under it as H3.
const downgradedComponents: Components = {
  ...baseComponents,
  h1: (props) => {
    const { children, ...rest } = dropNode(props)
    return <h3 {...rest}>{children}</h3>
  },
  h2: (props) => {
    const { children, ...rest } = dropNode(props)
    return <h3 {...rest}>{children}</h3>
  },
  h3: (props) => {
    const { children, ...rest } = dropNode(props)
    return <h4 {...rest}>{children}</h4>
  },
  h4: (props) => {
    const { children, ...rest } = dropNode(props)
    return <h5 {...rest}>{children}</h5>
  },
}

interface SafeMarkdownProps {
  children: string
  /**
   * If true, AI-generated H1/H2/H3/H4 are mapped to one level lower so they
   * nest under a wrapper heading the caller already provides. Default false:
   * preserves the original heading levels (use for full-article pages).
   */
  downgradeHeadings?: boolean
}

export function SafeMarkdown({ children, downgradeHeadings = false }: SafeMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      allowedElements={[...ALLOWED_ELEMENTS]}
      unwrapDisallowed
      components={downgradeHeadings ? downgradedComponents : baseComponents}
    >
      {children}
    </ReactMarkdown>
  )
}
