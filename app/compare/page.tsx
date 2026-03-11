import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { SidebarSponsors } from "@/components/layout/sidebar-sponsors"
import { getAllComparisons } from "@/app/actions/comparisons"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

export const metadata: Metadata = {
  title: "Product Comparisons - aat.ee",
  description:
    "Compare tech products side by side. Detailed comparisons of features, pricing, pros and cons.",
  alternates: {
    canonical: `${baseUrl}/compare`,
  },
  openGraph: {
    title: "Product Comparisons - aat.ee",
    description:
      "Compare tech products side by side. Detailed comparisons of features, pricing, pros and cons.",
    url: `${baseUrl}/compare`,
  },
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page || "1", 10) || 1)
  const { comparisons, totalCount } = await getAllComparisons(page, 12)
  const totalPages = Math.ceil(totalCount / 12)

  return (
    <main className="bg-secondary/20">
      <div className="container mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Product Comparisons</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Detailed side-by-side comparisons to help you choose the right tool
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2">
            {comparisons.length === 0 ? (
              <div className="text-muted-foreground border-border bg-card rounded-lg border border-dashed py-12 text-center text-sm">
                No comparisons yet. Check back soon!
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {comparisons.map((comp) => (
                  <Link
                    key={comp.id}
                    href={`/compare/${comp.slug}`}
                    className="bg-card border-border hover:border-foreground/20 group rounded-lg border p-4 transition-colors"
                  >
                    <div className="mb-3 flex items-center justify-center gap-3">
                      <div className="flex flex-col items-center gap-1">
                        <Image
                          src={comp.projectA.logoUrl}
                          alt={comp.projectA.name}
                          width={40}
                          height={40}
                          className="rounded-md"
                        />
                        <span className="max-w-[80px] truncate text-xs font-medium">
                          {comp.projectA.name}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-sm font-bold">VS</span>
                      <div className="flex flex-col items-center gap-1">
                        <Image
                          src={comp.projectB.logoUrl}
                          alt={comp.projectB.name}
                          width={40}
                          height={40}
                          className="rounded-md"
                        />
                        <span className="max-w-[80px] truncate text-xs font-medium">
                          {comp.projectB.name}
                        </span>
                      </div>
                    </div>
                    <h2 className="text-sm font-medium group-hover:underline">{comp.title}</h2>
                  </Link>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center space-x-4 border-t pt-4">
                <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                  <Link
                    href={`/compare?page=${page - 1}`}
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
                    href={`/compare?page=${page + 1}`}
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
                  href="/alternatives"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Product Alternatives
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
