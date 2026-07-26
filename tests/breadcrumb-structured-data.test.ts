import { createElement } from "react"

import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Breadcrumb } from "@/components/layout/breadcrumb"
import { BreadcrumbSchema } from "@/components/seo/structured-data"

describe("breadcrumb structured data", () => {
  it("renders visual navigation without duplicating JSON-LD as streaming microdata", () => {
    const html = renderToStaticMarkup(
      createElement(Breadcrumb, {
        items: [{ name: "Projects", href: "/projects" }, { name: "Serena" }],
      }),
    )

    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('href="/projects"')
    expect(html).toContain("Projects")
    expect(html).toContain("Serena")
    expect(html).not.toContain("itemListElement")
    expect(html).not.toContain("https://schema.org/ListItem")
    expect(html).not.toContain('itemprop="position"')
  })

  it("emits a name and position for every itemListElement entry", () => {
    const element = BreadcrumbSchema({
      items: [
        { name: "Avaleht", url: "https://www.aat.ee" },
        { name: "Projektid", url: "https://www.aat.ee/projects" },
        { name: "Serena" },
      ],
    })
    const serialized = element.props.dangerouslySetInnerHTML.__html
    const schema = JSON.parse(serialized)

    expect(schema.itemListElement).toEqual([
      {
        "@type": "ListItem",
        position: 1,
        name: "Avaleht",
        item: "https://www.aat.ee",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Projektid",
        item: "https://www.aat.ee/projects",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: "Serena",
      },
    ])
  })
})
