import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RiArrowDownSLine, RiFilterLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ProjectCard } from "@/components/home/project-card"
import { SidebarSponsors } from "@/components/layout/sidebar-sponsors"
import { BreadcrumbSchema } from "@/components/seo/structured-data"
import { getProjectsByTag, getTagBySlug } from "@/app/actions/tags"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ sort?: string; page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const tag = await getTagBySlug(slug)

  if (!tag) {
    return { title: "Tag Not Found - aat.ee" }
  }

  return {
    title: `#${tag.name} Projects - aat.ee`,
    description: `Discover ${tag.projectCount} projects tagged with #${tag.name} on aat.ee.`,
    alternates: {
      canonical: `${baseUrl}/tags/${tag.slug}`,
    },
    openGraph: {
      title: `#${tag.name} Projects - aat.ee`,
      description: `Discover ${tag.projectCount} projects tagged with #${tag.name} on aat.ee.`,
      url: `${baseUrl}/tags/${tag.slug}`,
    },
  }
}

function ProjectCardSkeleton() {
  return (
    <div className="mx-3 animate-pulse rounded-xl border border-zinc-100 bg-white/70 p-3 shadow-sm sm:mx-4 sm:p-4 dark:border-zinc-800/50 dark:bg-zinc-900/30">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex-shrink-0">
          <div className="bg-muted h-12 w-12 rounded-md sm:h-14 sm:w-14"></div>
        </div>
        <div className="min-w-0 flex-grow">
          <div className="flex flex-col">
            <div className="bg-muted mb-2 h-5 w-1/3 rounded"></div>
            <div className="bg-muted h-4 w-2/3 rounded"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

async function TagData({
  slug,
  sort = "recent",
  page = 1,
}: {
  slug: string
  sort?: string
  page?: number
}) {
  const ITEMS_PER_PAGE = 10
  const currentPage = Math.max(1, page)

  const tag = await getTagBySlug(slug)
  if (!tag) return notFound()

  const { projects: paginatedProjects, totalCount } = await getProjectsByTag(
    slug,
    currentPage,
    ITEMS_PER_PAGE,
    sort,
  )

  const isAuthenticated =
    paginatedProjects.length > 0 ? typeof paginatedProjects[0].userHasUpvoted === "boolean" : false

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

  const getSortLabel = () => {
    switch (sort) {
      case "upvotes":
        return "Most Upvotes"
      case "alphabetical":
        return "A-Z"
      case "recent":
      default:
        return "Most Recent"
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold sm:text-2xl">#{tag.name}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <RiFilterLine className="h-3.5 w-3.5" />
              <span className="hidden md:block">{getSortLabel()}</span>
              <RiArrowDownSLine className="text-muted-foreground ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem asChild>
              <Link
                href={`/tags/${slug}?sort=recent&page=1`}
                className={sort === "recent" || !sort ? "bg-muted/50 font-medium" : ""}
              >
                Most Recent
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/tags/${slug}?sort=upvotes&page=1`}
                className={sort === "upvotes" ? "bg-muted/50 font-medium" : ""}
              >
                Most Upvotes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/tags/${slug}?sort=alphabetical&page=1`}
                className={sort === "alphabetical" ? "bg-muted/50 font-medium" : ""}
              >
                Alphabetical
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {totalCount === 0 ? (
        <div className="text-muted-foreground border-border bg-card rounded-lg border border-dashed py-8 text-center text-sm">
          No projects with this tag yet.
          <p className="mt-2">Check other tags or come back later.</p>
        </div>
      ) : (
        <div className="-mx-3 flex flex-col sm:-mx-4">
          {paginatedProjects.map((project, index) => (
            <ProjectCard
              key={project.id}
              id={project.id}
              slug={project.slug}
              name={project.name}
              description={project.description || ""}
              logoUrl={project.logoUrl || ""}
              websiteUrl={project.websiteUrl ?? undefined}
              upvoteCount={project.upvoteCount ?? 0}
              commentCount={project.commentCount ?? 0}
              launchStatus={project.launchStatus}
              launchType={project.launchType}
              dailyRanking={project.dailyRanking}
              index={index}
              isAuthenticated={isAuthenticated}
              userHasUpvoted={project.userHasUpvoted ?? false}
              categories={project.categories ?? []}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center space-x-4 border-t pt-4">
          <Button asChild variant="outline" size="sm" disabled={currentPage <= 1}>
            <Link
              href={`/tags/${slug}${sort ? `?sort=${sort}` : ""}${sort ? "&" : "?"}page=${currentPage - 1}`}
              aria-disabled={currentPage <= 1}
              className={`${
                currentPage <= 1
                  ? "text-muted-foreground hover:text-muted-foreground pointer-events-none cursor-not-allowed opacity-50"
                  : ""
              }`}
            >
              Previous
            </Link>
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {currentPage} of {totalPages}
          </span>
          <Button asChild variant="outline" size="sm" disabled={currentPage >= totalPages}>
            <Link
              href={`/tags/${slug}?sort=${sort || "recent"}&page=${currentPage + 1}`}
              aria-disabled={currentPage >= totalPages}
              className={`${
                currentPage >= totalPages
                  ? "text-muted-foreground hover:text-muted-foreground pointer-events-none cursor-not-allowed opacity-50"
                  : ""
              }`}
            >
              Next
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

export default async function TagPage({ params, searchParams }: Props) {
  const { slug } = await params
  const resolvedSearchParams = await searchParams
  const sortParam = resolvedSearchParams.sort || "recent"
  const pageParam = Math.max(1, parseInt(resolvedSearchParams.page || "1", 10) || 1)

  const tag = await getTagBySlug(slug)
  if (!tag) return notFound()

  return (
    <main className="bg-secondary/20">
      <BreadcrumbSchema
        items={[
          { name: "Tags", url: `${baseUrl}/tags` },
          { name: `#${tag.name}`, url: `${baseUrl}/tags/${tag.slug}` },
        ]}
      />
      <div className="container mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-12">
        <div className="mb-4">
          <nav className="text-muted-foreground mb-2 flex items-center gap-1 text-sm">
            <Link href="/tags" className="hover:underline">
              Tags
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">#{tag.name}</span>
          </nav>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:items-start">
          <div className="space-y-6 sm:space-y-8 lg:col-span-2">
            <Suspense
              fallback={
                <div className="space-y-3">
                  {Array(5)
                    .fill(0)
                    .map((_, i) => (
                      <ProjectCardSkeleton key={i} />
                    ))}
                </div>
              }
            >
              <TagData slug={slug} sort={sortParam} page={pageParam} />
            </Suspense>
          </div>

          <div className="top-24 hidden lg:block">
            <SidebarSponsors />

            <div className="space-y-3 py-5">
              <h3 className="flex items-center gap-2 font-semibold">Quick Access</h3>
              <div className="space-y-2">
                <Link
                  href="/tags"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  All Tags
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
