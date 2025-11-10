import Link from "next/link"

import { RiArrowRightSLine, RiHome5Line } from "@remixicon/react"

export interface BreadcrumbItem {
  name: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol
        className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm"
        itemScope
        itemType="https://schema.org/BreadcrumbList"
      >
        {/* Home */}
        <li
          className="flex items-center gap-1"
          itemProp="itemListElement"
          itemScope
          itemType="https://schema.org/ListItem"
        >
          <Link
            href="/"
            className="hover:text-foreground flex items-center gap-1 transition-colors"
            itemProp="item"
          >
            <RiHome5Line className="h-4 w-4" />
            <span itemProp="name">Home</span>
          </Link>
          <meta itemProp="position" content="1" />
          {items.length > 0 && <RiArrowRightSLine className="h-4 w-4" />}
        </li>

        {/* Dynamic items */}
        {items.map((item, index) => (
          <li
            key={index}
            className="flex items-center gap-1"
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            {item.href ? (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors"
                itemProp="item"
              >
                <span itemProp="name">{item.name}</span>
              </Link>
            ) : (
              <span itemProp="name" className="text-foreground font-medium">
                {item.name}
              </span>
            )}
            <meta itemProp="position" content={(index + 2).toString()} />
            {index < items.length - 1 && <RiArrowRightSLine className="h-4 w-4" />}
          </li>
        ))}
      </ol>
    </nav>
  )
}
