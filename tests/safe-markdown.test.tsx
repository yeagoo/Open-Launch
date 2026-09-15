import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { SafeMarkdown } from "@/components/ui/safe-markdown"

describe("SafeMarkdown", () => {
  it("keeps community-style Markdown useful without rendering unsafe resources or links", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown downgradeHeadings>
        {
          "# Release note\n\n[Read more](https://example.test/update)\n\n![tracker](https://example.test/pixel.png)\n\n[bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>"
        }
      </SafeMarkdown>,
    )

    expect(html).toContain("<h3>Release note</h3>")
    expect(html).toContain('href="https://example.test/update"')
    expect(html).toContain('rel="ugc nofollow noopener noreferrer"')
    expect(html).not.toContain("<img")
    expect(html).not.toContain("javascript:")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
  })
})
