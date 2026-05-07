import { Suspense } from "react"
import { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"

import { format } from "date-fns"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"

import { auth } from "@/lib/auth"
import { localizeProjectDescriptions } from "@/lib/get-project-translation"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import { Button } from "@/components/ui/button"
import { ProjectCard } from "@/components/home/project-card"
import { Breadcrumb } from "@/components/layout/breadcrumb"
import { BreadcrumbSchema } from "@/components/seo/structured-data"
import { getMonthProjects } from "@/app/actions/projects-page"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "metadata.projects" })
  const path = "/projects"
  return {
    title: t("title"),
    description: t("description"),
    alternates: buildLocaleAlternates(path, locale),
    openGraph: {
      title: t("title"),
      description: t("description"),
      ...buildLocaleOpenGraph(path, locale),
      siteName: "aat.ee",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      site: "@aat_ee",
      creator: "@aat_ee",
      title: t("title"),
      description: t("description"),
    },
  }
}

interface ProjectsPageProps {
  searchParams: Promise<{
    page?: string
  }>
}

// Loading skeleton component
function ProjectsSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-4">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="bg-card animate-pulse rounded-xl border p-3 sm:p-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="bg-muted h-12 w-12 flex-shrink-0 rounded-md sm:h-14 sm:w-14" />
            <div className="min-w-0 flex-grow space-y-2">
              <div className="bg-muted h-4 w-1/3 rounded" />
              <div className="bg-muted h-3 w-full rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Projects content component
async function ProjectsContent({ page }: { page: number }) {
  const session = await auth.api.getSession({ headers: await headers() })
  const isAuthenticated = !!session?.user

  const { projects: projectsRaw, totalCount, totalPages } = await getMonthProjects(page, 10)

  const locale = await getLocale()
  const projects = await localizeProjectDescriptions(projectsRaw, locale)

  const currentMonth = format(new Date(), "MMMM yyyy")

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">This Month&apos;s Launches</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm sm:text-base">
            <Calendar className="h-4 w-4" />
            <span>
              {currentMonth} • {totalCount} {totalCount === 1 ? "project" : "projects"}
            </span>
          </p>
        </div>
      </div>

      {/* Projects list */}
      {projects.length === 0 ? (
        <div className="bg-card border-border rounded-2xl border border-dashed py-16 text-center">
          <div className="text-muted-foreground mb-4">
            <Calendar className="mx-auto h-12 w-12" />
          </div>
          <h3 className="text-foreground mb-2 text-lg font-semibold">No projects yet</h3>
          <p className="text-muted-foreground">
            No projects have been launched this month. Check back soon!
          </p>
        </div>
      ) : (
        <>
          <div className="-mx-3 flex flex-col sm:-mx-4">
            {projects.map((project, index) => (
              <ProjectCard
                key={project.id}
                {...project}
                description={project.description || ""}
                websiteUrl={project.websiteUrl ?? undefined}
                commentCount={project.commentCount ?? 0}
                index={(page - 1) * 10 + index}
                userHasUpvoted={project.userHasUpvoted ?? false}
                categories={project.categories || []}
                isAuthenticated={isAuthenticated}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
                {page > 1 ? (
                  <Link href={`/projects?page=${page - 1}`}>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Link>
                ) : (
                  <>
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </>
                )}
              </Button>

              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <span>
                  Page {page} of {totalPages}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                asChild={page < totalPages}
              >
                {page < totalPages ? (
                  <Link href={`/projects?page=${page + 1}`}>
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                ) : (
                  <>
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams
  const page = Number(params.page) || 1
  const tBreadcrumb = await getTranslations("breadcrumb")

  return (
    <div className="bg-background min-h-screen">
      {/* Breadcrumb Schema */}
      <BreadcrumbSchema
        items={[
          { name: tBreadcrumb("home"), url: `${process.env.NEXT_PUBLIC_URL}` },
          { name: tBreadcrumb("projects") },
        ]}
      />

      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* Breadcrumb Navigation */}
        <div className="mb-4">
          <Breadcrumb items={[{ name: tBreadcrumb("projects") }]} />
        </div>

        <Suspense fallback={<ProjectsSkeleton />}>
          <ProjectsContent page={page} />
        </Suspense>
      </div>
    </div>
  )
}
