import Image from "next/image"

import { Link } from "@/i18n/navigation"

import type { RelatedProjectCard } from "@/lib/get-project-related"

interface RelatedProductsProps {
  heading: string
  subtitle: string
  items: RelatedProjectCard[]
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function RelatedProducts({ heading, subtitle, items }: RelatedProductsProps) {
  if (items.length === 0) return null
  return (
    <section className="border-border mt-8 border-t pt-8">
      <h2 className="mb-1 text-xl font-semibold sm:text-2xl">{heading}</h2>
      <p className="text-muted-foreground mb-4 text-sm">{subtitle}</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/projects/${item.slug}`}
              className="bg-card hover:bg-muted/40 border-border flex items-start gap-3 rounded-lg border p-3 transition-colors"
            >
              <Image
                src={item.logoUrl}
                alt={`${item.name} logo`}
                width={40}
                height={40}
                className="h-10 w-10 flex-shrink-0 rounded-md object-cover"
                unoptimized
              />
              <div className="min-w-0 flex-grow">
                <h3 className="truncate text-sm font-semibold">{item.name}</h3>
                <p className="text-muted-foreground line-clamp-2 text-xs">
                  {stripHtml(item.description)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
