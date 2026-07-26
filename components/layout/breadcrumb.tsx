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
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
        {/* Home */}
        <li className="flex items-center gap-1">
          <Link
            href="/"
            className="hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <RiHome5Line className="h-4 w-4" />
            <span>Home</span>
          </Link>
          {items.length > 0 && <RiArrowRightSLine className="h-4 w-4" />}
        </li>

        {/* Dynamic items */}
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-1">
            {item.href ? (
              <Link href={item.href} className="hover:text-foreground transition-colors">
                <span>{item.name}</span>
              </Link>
            ) : (
              <span className="text-foreground font-medium">{item.name}</span>
            )}
            {index < items.length - 1 && <RiArrowRightSLine className="h-4 w-4" />}
          </li>
        ))}
      </ol>
    </nav>
  )
}
