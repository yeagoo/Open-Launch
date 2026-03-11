import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { SidebarSponsors } from "@/components/layout/sidebar-sponsors"
import { getAllAlternativePages } from "@/app/actions/alternatives"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

export const metadata: Metadata = {
  title: "Product Alternatives - aat.ee",
  description:
    "Find the best alternatives to popular tools and products. Compare features, pros and cons.",
  alternates: {
    canonical: `${baseUrl}/alternatives`,
  },
  openGraph: {
    title: "Product Alternatives - aat.ee",
    description:
      "Find the best alternatives to popular tools and products. Compare features, pros and cons.",
    url: `${baseUrl}/alternatives`,
  },
}

export default async function AlternativesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1)
  const { pages, totalCount } = await getAllAlternativePages(page, 12)
  const totalPages = Math.ceil(totalCount / 12)

  return (
    <main className="bg-secondary/20">
      <div className="container mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Product Alternatives</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Discover the best alternatives to popular tools and products
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2">
            {pages.length === 0 ? (
              <div className="text-muted-foreground border-border bg-card rounded-lg border border-dashed py-12 text-center text-sm">
                No alternatives pages yet. Check back soon!
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {pages.map((pg) => (
                  <Link
                    key={pg.id}
                    href={`/alternatives/${pg.slug}`}
                    className="bg-card border-border hover:border-foreground/20 group rounded-lg border p-4 transition-colors"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <Image
                        src={pg.subjectProject.logoUrl}
                        alt={pg.subjectProject.name}
                        width={40}
                        height={40}
                        className="rounded-md"
                      />
                      <div>
                        <h2 className="text-sm font-medium group-hover:underline">{pg.title}</h2>
                        <p className="text-muted-foreground text-xs">
                          {pg.alternativeCount} alternatives found
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center space-x-4 border-t pt-4">
                <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                  <Link
                    href={`/alternatives?page=${page - 1}`}
                    className={page <= 1 ? "pointer-events-none cursor-not-allowed opacity-50" : ""}
                  >
                    Previous
                  </Link>
                </Button>
                <span className="text-muted-foreground text-sm">
                  Page {page} of {totalPages}
                </span>
                <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
                  <Link
                    href={`/alternatives?page=${page + 1}`}
                    className={
                      page >= totalPages ? "pointer-events-none cursor-not-allowed opacity-50" : ""
                    }
                  >
                    Next
                  </Link>
                </Button>
              </div>
            )}
          </div>

          <div className="top-24 hidden lg:block">
            <SidebarSponsors />

            <div className="space-y-3 py-5">
              <h3 className="flex items-center gap-2 font-semibold">Explore More</h3>
              <div className="space-y-2">
                <Link
                  href="/compare"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Product Comparisons
                </Link>
                <Link
                  href="/categories"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Browse Categories
                </Link>
                <Link
                  href="/trending"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Trending Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
