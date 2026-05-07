/* eslint-disable @next/next/no-img-element */
import { Metadata, ResolvingMetadata } from "next"
import { headers } from "next/headers"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  RiGithubFill,
  RiGlobalLine,
  RiHashtag,
  RiTwitterFill,
  RiVipCrownLine,
} from "@remixicon/react"
import { format } from "date-fns"
import { getTranslations, setRequestLocale } from "next-intl/server"

import { auth } from "@/lib/auth"
import { getRelatedProjects } from "@/lib/get-project-related"
import {
  getLocalizedLongDescription,
  getLocalizedProjectDescription,
} from "@/lib/get-project-translation"
import { getProjectWebsiteRelAttribute } from "@/lib/link-utils"
import { Button } from "@/components/ui/button"
import { RichTextDisplay } from "@/components/ui/rich-text-editor"
import { Breadcrumb } from "@/components/layout/breadcrumb"
import { EditButton } from "@/components/project/edit-button"
import { LongDescription } from "@/components/project/long-description"
import { ProjectImageWithLoader } from "@/components/project/project-image-with-loader"
import { RelatedProducts } from "@/components/project/related-products"
import { ShareButton } from "@/components/project/share-button"
import { TranslatedComments } from "@/components/project/translated-comments"
import { UpvoteButton } from "@/components/project/upvote-button"
import { BreadcrumbSchema, ProductSchema } from "@/components/seo/structured-data"
import { getProjectBySlug, hasUserUpvoted } from "@/app/actions/project-details"

// Types
interface ProjectPageProps {
  params: Promise<{
    slug: string
    locale: string
  }>
}

export async function generateMetadata(
  { params }: ProjectPageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug, locale } = await params
  const projectData = await getProjectBySlug(slug)

  if (!projectData) {
    return {
      title: "Project Not Found",
    }
  }

  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "").trim()
  }

  const localizedDescription = await getLocalizedProjectDescription(
    projectData.id,
    locale,
    projectData.description,
  )

  const previousImages = (await parent).openGraph?.images || []
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"
  const canonicalPath = locale === "en" ? `/projects/${slug}` : `/${locale}/projects/${slug}`

  return {
    title: `${projectData.name} | aat.ee`,
    description: stripHtml(localizedDescription),
    alternates: {
      canonical: `${baseUrl}${canonicalPath}`,
    },
    openGraph: {
      title: `${projectData.name} on aat.ee`,
      description: stripHtml(localizedDescription),
      url: `${baseUrl}${canonicalPath}`,
      siteName: "aat.ee",
      type: "website",
      images: [
        projectData.productImage || projectData.coverImageUrl || projectData.logoUrl,
        ...previousImages,
      ],
      ...(projectData.scheduledLaunchDate && {
        publishedTime: projectData.scheduledLaunchDate.toISOString(),
      }),
      ...(projectData.updatedAt && {
        modifiedTime: projectData.updatedAt.toISOString(),
      }),
    },
    twitter: {
      card: "summary_large_image",
      site: "@aat_ee",
      creator: "@aat_ee",
      title: `${projectData.name} on aat.ee`,
      description: stripHtml(localizedDescription),
      images: [projectData.productImage || projectData.logoUrl],
    },
  }
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug, locale } = await params
  setRequestLocale(locale)
  const tSidebar = await getTranslations("project.sidebar")
  const tComments = await getTranslations("project.comments")
  const projectData = await getProjectBySlug(slug)

  if (!projectData) {
    notFound()
  }

  const localizedDescription = await getLocalizedProjectDescription(
    projectData.id,
    locale,
    projectData.description,
  )

  const tDetail = await getTranslations("project.detail")
  const [longDescriptionMarkdown, relatedProjects] = await Promise.all([
    getLocalizedLongDescription(projectData.id, locale),
    getRelatedProjects(projectData.id, locale, 4),
  ])

  const session = await auth.api.getSession({
    headers: await headers(),
  })

  const hasUpvoted = session?.user ? await hasUserUpvoted(projectData.id) : false

  const scheduledDate = projectData.scheduledLaunchDate
    ? new Date(projectData.scheduledLaunchDate)
    : null

  const isActiveLaunch = projectData.launchStatus === "ongoing"

  const isScheduled = projectData.launchStatus === "scheduled"

  const isOwner = session?.user?.id === projectData.createdBy

  const websiteRelAttribute = getProjectWebsiteRelAttribute(
    {
      launchStatus: projectData.launchStatus,
      launchType: projectData.launchType,
      dailyRanking: projectData.dailyRanking,
      hasBadgeVerified: projectData.hasBadgeVerified ?? false,
    },
    { isDetailPage: true },
  )

  // Function to strip HTML for Schema
  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "").trim()
  }

  return (
    <div className="bg-background min-h-screen">
      {/* Structured Data - Product Schema */}
      <ProductSchema
        name={projectData.name}
        description={stripHtml(localizedDescription)}
        websiteUrl={projectData.websiteUrl}
        imageUrl={projectData.productImage || projectData.logoUrl}
        platforms={projectData.platforms || []}
        pricing={projectData.pricing}
        upvoteCount={projectData.upvoteCount}
        scheduledLaunchDate={projectData.scheduledLaunchDate}
      />

      {/* Breadcrumb Schema */}
      <BreadcrumbSchema
        items={[
          { name: "Home", url: `${process.env.NEXT_PUBLIC_URL}` },
          { name: "Projects", url: `${process.env.NEXT_PUBLIC_URL}/projects` },
          { name: projectData.name },
        ]}
      />

      <div className="mx-auto max-w-6xl px-6">
        {/* Breadcrumb Navigation */}
        <div className="pt-6">
          <Breadcrumb
            items={[{ name: "Projects", href: "/projects" }, { name: projectData.name }]}
          />
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main Content - 2 colonnes */}
          <div className="lg:col-span-2">
            {/* Modern Clean Header */}
            <div className="py-6">
              {/* Version Desktop */}
              <div className="hidden items-center justify-between md:flex">
                {/* Left side: Logo + Title + Categories */}
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  {/* Logo */}
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-transparent">
                    <Image
                      src={projectData.logoUrl}
                      alt={`${projectData.name} Logo`}
                      width={64}
                      height={64}
                      quality={95}
                      className="h-full w-full object-cover"
                      priority
                    />
                  </div>

                  {/* Title and info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h1 className="text-foreground truncate text-xl font-bold">
                        {projectData.name}
                      </h1>
                    </div>

                    {/* Categories */}
                    <div className="flex flex-wrap gap-1">
                      {projectData.categories.map((category) => (
                        <Link
                          key={category.id}
                          href={`/categories?category=${category.id}`}
                          className="bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
                        >
                          <RiHashtag className="h-3 w-3" />
                          {category.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right side: Actions */}
                <div className="ml-6 flex items-center gap-3">
                  {projectData.websiteUrl && (
                    <Button variant="outline" size="sm" asChild className="h-9 px-3">
                      <a
                        href={projectData.websiteUrl}
                        target="_blank"
                        rel={websiteRelAttribute}
                        className="flex items-center gap-2"
                      >
                        <RiGlobalLine className="h-4 w-4" />
                        Visit
                      </a>
                    </Button>
                  )}

                  {isActiveLaunch ? (
                    <UpvoteButton
                      projectId={projectData.id}
                      upvoteCount={projectData.upvoteCount}
                      initialUpvoted={hasUpvoted}
                      isAuthenticated={Boolean(session?.user)}
                    />
                  ) : (
                    <div className="border-muted bg-muted flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium">
                      <span className="text-foreground">{projectData.upvoteCount} upvotes</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Version Mobile */}
              <div className="space-y-4 md:hidden">
                {/* Logo + Titre */}
                <div className="flex flex-col items-start gap-2">
                  <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-transparent">
                    <Image
                      src={projectData.logoUrl}
                      alt={`${projectData.name} Logo`}
                      width={64}
                      height={64}
                      quality={95}
                      className="h-full w-full object-cover"
                      priority
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h1 className="text-foreground text-xl font-bold">{projectData.name}</h1>
                    <div className="flex flex-wrap gap-1">
                      {projectData.categories.map((category) => (
                        <Link
                          key={category.id}
                          href={`/categories?category=${category.id}`}
                          className="bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
                        >
                          <RiHashtag className="h-3 w-3" />
                          {category.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions - Same width buttons side by side */}
                <div className="flex gap-3">
                  {projectData.websiteUrl && (
                    <Button variant="outline" size="sm" asChild className="h-9 px-3">
                      <a
                        href={projectData.websiteUrl}
                        target="_blank"
                        rel={websiteRelAttribute}
                        className="flex items-center justify-center gap-2"
                      >
                        <RiGlobalLine className="h-4 w-4" />
                        Visit
                      </a>
                    </Button>
                  )}

                  {isActiveLaunch ? (
                    <UpvoteButton
                      projectId={projectData.id}
                      upvoteCount={projectData.upvoteCount}
                      initialUpvoted={hasUpvoted}
                      isAuthenticated={Boolean(session?.user)}
                    />
                  ) : (
                    <div className="border-muted bg-muted flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium">
                      <span className="text-foreground">{projectData.upvoteCount} upvotes</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="space-y-6 pb-12">
              {/* Badge SVG pour les gagnants top 3 uniquement */}
              {isOwner &&
                projectData.launchStatus === "launched" &&
                projectData.dailyRanking &&
                projectData.dailyRanking <= 3 && (
                  <div className="border-primary/30 bg-primary/10 text-primary flex flex-col items-center justify-between gap-2 rounded-lg border p-2 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-center text-sm font-medium">
                      Congratulations! You earned a badge for your ranking.
                    </span>
                    <Button asChild variant="default" size="sm" className="flex items-center gap-2">
                      <Link href={`/projects/${projectData.slug}/badges`}>
                        <RiVipCrownLine className="h-4 w-4" />
                        View Badges
                      </Link>
                    </Button>
                  </div>
                )}

              {/* Scheduled Launch Info */}
              {isScheduled && scheduledDate && (
                <div className="flex flex-col items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800 sm:flex-row sm:items-center sm:gap-3 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200">
                  <div className="text-center sm:text-left">
                    <p className="font-medium">This project is scheduled for launch</p>
                    <p className="text-sm opacity-90">
                      Launch date: {format(scheduledDate, "EEEE, MMMM d, yyyy")} at 08:00 AM UTC
                    </p>
                  </div>
                  <div className="rounded-md bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    Scheduled
                  </div>
                </div>
              )}

              {/* Product Image / Banner */}
              {(projectData.productImage || projectData.coverImageUrl) && (
                <ProjectImageWithLoader
                  src={(projectData.productImage || projectData.coverImageUrl)!}
                  alt={`${projectData.name} - Product Image`}
                />
              )}
              {/* Description */}
              <div className="w-full">
                <RichTextDisplay content={localizedDescription} />
              </div>

              {/* AI-generated long-form overview */}
              {longDescriptionMarkdown && (
                <LongDescription
                  heading={tDetail("aboutHeading", { name: projectData.name })}
                  markdown={longDescriptionMarkdown}
                />
              )}

              {/* Related products */}
              {relatedProjects.length > 0 && (
                <RelatedProducts
                  heading={tDetail("relatedHeading")}
                  subtitle={tDetail("relatedSubtitle")}
                  items={relatedProjects}
                />
              )}

              {/* Edit button pour owners */}
              {isOwner && (
                <div>
                  <EditButton
                    projectId={projectData.id}
                    initialDescription={projectData.description}
                    initialCategories={projectData.categories}
                    isOwner={isOwner}
                    isScheduled={isScheduled}
                    sourceLocale={projectData.sourceLocale}
                  />
                </div>
              )}

              {/* Comments */}
              <div>
                <h2 className="mb-4 text-lg font-semibold" id="comments">
                  {tComments("heading")}
                </h2>
                {projectData.launchStatus === "ongoing" ||
                projectData.launchStatus === "launched" ? (
                  <TranslatedComments
                    projectId={projectData.id}
                    placeholder={tComments("placeholder")}
                    currentUserId={session?.user?.id ?? null}
                  />
                ) : (
                  <div className="py-6 text-center">
                    <p className="text-muted-foreground">{tComments("notLaunchedYet")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar - 1 colonne sur toute la hauteur */}
          <div className="lg:sticky lg:top-14 lg:h-fit">
            <div className="space-y-6 py-6">
              {/* Achievement Badge */}
              {projectData.launchStatus === "launched" &&
                projectData.dailyRanking &&
                projectData.dailyRanking <= 3 && (
                  <div className="space-y-3">
                    <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      {tSidebar("achievement")}
                    </h3>
                    <div className="flex">
                      <img
                        src={`/images/badges/top${projectData.dailyRanking}-light.svg`}
                        alt={`aat.ee Top ${projectData.dailyRanking} Daily Winner`}
                        className="h-12 w-auto dark:hidden"
                      />
                      <img
                        src={`/images/badges/top${projectData.dailyRanking}-dark.svg`}
                        alt={`aat.ee Top ${projectData.dailyRanking} Daily Winner`}
                        className="hidden h-12 w-auto dark:block"
                      />
                    </div>
                  </div>
                )}

              {/* Publisher */}
              <div className="space-y-3">
                <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                  {tSidebar("publisher")}
                </h3>
                <div className="flex items-center gap-3">
                  {projectData.creator ? (
                    <>
                      {projectData.creator.image ? (
                        <img
                          src={projectData.creator.image}
                          alt={projectData.creator.name || "Creator avatar"}
                          className="h-10 w-10 rounded-full"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-600">
                          {projectData.creator.name?.charAt(0) || "U"}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground text-sm font-medium">
                          {projectData.creator.name}
                        </p>
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {tSidebar("unknownCreator")}
                    </span>
                  )}
                </div>
              </div>

              {/* Launch Date */}
              {scheduledDate && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      {tSidebar("launchDate")}
                    </span>
                    <div className="border-muted-foreground/30 mx-3 flex-1 border-b border-dotted"></div>
                    <span className="text-foreground text-sm font-medium">
                      {format(scheduledDate, "yyyy-MM-dd")}
                    </span>
                  </div>
                </div>
              )}

              {/* Platform */}
              {projectData.platforms && projectData.platforms.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      {tSidebar("platform")}
                    </span>
                    <div className="border-muted-foreground/30 mx-3 flex-1 border-b border-dotted"></div>
                    <span className="text-foreground text-sm font-medium capitalize">
                      {projectData.platforms[0]}
                    </span>
                  </div>
                </div>
              )}

              {/* Pricing */}
              {projectData.pricing && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      {tSidebar("pricing")}
                    </span>
                    <div className="border-muted-foreground/30 mx-3 flex-1 border-b border-dotted"></div>
                    <span className="text-foreground text-sm font-medium capitalize">
                      {projectData.pricing}
                    </span>
                  </div>
                </div>
              )}

              {/* Social Links */}
              {(projectData.githubUrl || projectData.twitterUrl) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                      {tSidebar("socials")}
                    </span>
                    <div className="border-muted-foreground/30 mx-3 flex-1 border-b border-dotted"></div>
                    <div className="flex items-center gap-2">
                      {projectData.githubUrl && (
                        <a
                          href={projectData.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="GitHub"
                        >
                          <RiGithubFill className="h-4 w-4" />
                        </a>
                      )}
                      {projectData.twitterUrl && (
                        <a
                          href={projectData.twitterUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Twitter"
                        >
                          <RiTwitterFill className="h-4 w-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Product Keywords */}
              {projectData.techStack && projectData.techStack.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                    {tSidebar("productKeywords")}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {projectData.techStack.slice(0, 6).map((tech) => (
                      <span
                        key={tech}
                        className="bg-muted text-muted-foreground inline-flex items-center rounded-md px-2 py-1 text-xs"
                      >
                        #{tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Share */}
              <div className="border-border border-t pt-4">
                <ShareButton name={projectData.name} slug={projectData.slug} variant="fullWidth" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
