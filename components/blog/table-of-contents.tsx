"use client"

import { useEffect, useState } from "react"

import { ChevronDown, List } from "lucide-react"

interface TocItem {
  id: string
  text: string
  level: number
}

export default function TableOfContents() {
  const [toc, setToc] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string>("")

  useEffect(() => {
    const headers = document.querySelectorAll("article h2, article h3, article h4")
    const tocItems: TocItem[] = []

    headers.forEach((header, index) => {
      const level = parseInt(header.tagName.charAt(1))
      const text = header.textContent || ""
      const id = header.id || `heading-${index}`

      if (!header.id) {
        header.id = id
      }

      tocItems.push({ id, text, level })
    })

    setToc(tocItems)

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: "-20% 0% -80% 0%" },
    )

    headers.forEach((header) => observer.observe(header))

    return () => observer.disconnect()
  }, [])

  if (toc.length === 0) return null

  return (
    <details className="group bg-card rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4 font-medium">
        <div className="text-card-foreground flex items-center gap-2 text-sm">
          <List className="h-4 w-4" />
          Table of Contents
        </div>
        <ChevronDown className="text-muted-foreground h-4 w-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t p-4 pt-0">
        <nav className="mt-4 space-y-1">
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`hover:text-primary block text-sm transition-colors ${
                item.level === 2 ? "pl-2" : item.level === 3 ? "pl-4" : "pl-6"
              } ${activeId === item.id ? "text-primary font-medium" : "text-muted-foreground"}`}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(item.id)?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }}
            >
              {item.text}
            </a>
          ))}
        </nav>
      </div>
    </details>
  )
}
