import { Suspense } from "react"
import { headers } from "next/headers"
import Link from "next/link"

import { RiArrowDownSLine, RiFilterLine } from "@remixicon/react"

import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MobileCategorySelector } from "@/components/categories/mobile-category-selector"
import { ProjectCard } from "@/components/home/project-card"
import {
  getAllCategories,
  getCategoryById,
  getProjectsByCategory,
  getTopCategories,
} from "@/app/actions/projects"

export const metadata = {
  title: "Categories - Open-Launch",
  description: "Browse tech products by category on Open-Launch",
}

// Composant Skeleton pour le chargement des chaînes
function ProjectCardSkeleton() {
  return (
    <div className="mx-3 animate-pulse rounded-xl border border-zinc-100 bg-white/70 p-3 shadow-sm dark:border-zinc-800/50 dark:bg-zinc-900/30 sm:mx-4 sm:p-4">
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex-shrink-0">
          <div className="bg-muted h-12 w-12 rounded-md sm:h-14 sm:w-14"></div>
        </div>
        <div className="min-w-0 flex-grow">
          <div className="flex flex-col">
            <div className="bg-muted h-5 w-1/3 rounded mb-2"></div>
            <div className="bg-muted h-4 w-2/3 rounded"></div>
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-2 sm:flex-row sm:items-start">
          <div className="bg-muted h-10 w-10 rounded-xl border-2 border-dashed"></div>
          <div className="hidden sm:block bg-muted h-10 w-10 rounded-xl border-2 border-dashed"></div>
        </div>
      </div>
    </div>
  )
}

// Composant Skeleton pour l'en-tête de catégorie
function CategoryHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div className="bg-muted h-8 w-48 animate-pulse rounded"></div>
      <div className="bg-muted h-8 w-24 animate-pulse rounded"></div>
    </div>
  )
}

// Composant Skeleton pour l'ensemble de la section
function CategoryDataSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-4">
      <CategoryHeaderSkeleton />
      <div className="-mx-3 flex flex-col sm:-mx-4">
        {Array(5)
          .fill(0)
          .map((_, index) => (
            <ProjectCardSkeleton key={index} />
          ))}
      </div>
    </div>
  )
}

// Composant pour charger les données de la catégorie et afficher les projets
async function CategoryData({
  categoryId,
  sort = "recent",
}: {
  categoryId: string
  sort?: string
}) {
  // Récupérer les projets ET la session utilisateur en parallèle
  const [projects, category, session] = await Promise.all([
    getProjectsByCategory(categoryId),
    getCategoryById(categoryId),
    auth.api.getSession({ headers: await headers() }), // Obtenir la session
  ])

  // Déterminer si l'utilisateur est authentifié
  const isAuthenticated = Boolean(session?.user)

  if (!category) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground">Category not found.</p>
      </div>
    )
  }

  // Trier les projets
  const sortedProjects = [...projects].sort((a, b) => {
    switch (sort) {
      case "upvotes":
        // Assurer que upvoteCount est un nombre
        return (b.upvoteCount ?? 0) - (a.upvoteCount ?? 0)
      case "alphabetical":
        return a.name.localeCompare(b.name)
      case "recent":
      default:
        // Assurer que createdAt est une Date valide
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
    }
  })

  // Obtenir le label à afficher pour le tri actuel
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
        <h2 className="text-xl font-bold sm:text-2xl">{category.name}</h2>
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
                href={`/categories?category=${categoryId}&sort=recent`}
                className={sort === "recent" || !sort ? "bg-muted/50 font-medium" : ""}
              >
                Most Recent
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/categories?category=${categoryId}&sort=upvotes`}
                className={sort === "upvotes" ? "bg-muted/50 font-medium" : ""}
              >
                Most Upvotes
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/categories?category=${categoryId}&sort=alphabetical`}
                className={sort === "alphabetical" ? "bg-muted/50 font-medium" : ""}
              >
                Alphabetical
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {sortedProjects.length === 0 ? (
        <div className="text-muted-foreground border-border bg-card rounded-lg border border-dashed py-8 text-center text-sm">
          No projects in this category yet.
          <p className="mt-2">Check other categories or come back later.</p>
        </div>
      ) : (
        <div className="-mx-3 flex flex-col sm:-mx-4">
          {sortedProjects.map((project, index) => (
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
    </div>
  )
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string }>
}) {
  // Récupérer toutes les catégories avec leur nombre de projets
  const categoriesWithCount = await getTopCategories(100) // On demande un grand nombre pour avoir toutes les catégories
  const categories = await getAllCategories()

  // Utiliser la première catégorie par défaut si aucune n'est spécifiée
  const params = await searchParams
  const selectedCategoryId = params.category || (categories.length > 0 ? categories[0].id : "")
  const sortParam = params.sort || "recent"

  // Créer un mapping pour accéder facilement au nombre de projets par catégorie
  const countMap = new Map()
  categoriesWithCount.forEach((cat) => {
    countMap.set(cat.id, cat.count)
  })

  return (
    <main className="bg-secondary/20">
      <div className="container mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-12">
        <div className="mb-6 flex flex-col">
          <h1 className="text-2xl font-bold">Categories</h1>

          {/* Sélecteur de catégorie pour mobile */}
          <MobileCategorySelector
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            sortParam={sortParam}
          />
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:items-start">
          {/* Contenu principal - Projets de la catégorie sélectionnée */}
          <div className="space-y-6 sm:space-y-8 lg:col-span-2">
            <Suspense fallback={<CategoryDataSkeleton />}>
              {selectedCategoryId && (
                <CategoryData categoryId={selectedCategoryId} sort={sortParam} />
              )}
            </Suspense>
          </div>

          {/* Sidebar - Sélecteur de catégories (visible uniquement sur desktop) */}
          <div className="hidden top-24 lg:block">
            {/* Categories Box */}
            <div className="space-y-3 py-5 pt-0">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">Browse Categories</h3>
              </div>
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-2 -mx-2">
                {categories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/categories?category=${category.id}${
                      sortParam ? `&sort=${sortParam}` : ""
                    }`}
                    className={` flex items-center justify-between rounded-md p-2 ${
                      category.id === selectedCategoryId
                        ? "bg-muted font-medium"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <span className="text-sm">{category.name}</span>
                    <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-xs">
                      {countMap.get(category.id) || 0} projects
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Quick Links Box */}
            <div className="space-y-3 py-5">
              <h3 className="flex items-center gap-2 font-semibold">Quick Access</h3>
              <div className="space-y-2">
                <Link
                  href="/trending"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Trending Now
                </Link>
                <Link
                  href="/trending?filter=month"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Best of Month
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
