/* eslint-disable @next/next/no-img-element */
import { Suspense } from "react"
import { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RiGlobalLine, RiHashtag, RiVipCrownLine } from "@remixicon/react"
import { format } from "date-fns"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server"

import { pickClientMessages } from "@/lib/client-messages"
import { getRelatedProjects } from "@/lib/get-project-related"
import { getProjectSidebarLinks } from "@/lib/get-project-sidebar-links"
import {
  getLocalizedLongDescription,
  getLocalizedProjectDescription,
  getLocalizedProjectTagline,
} from "@/lib/get-project-translation"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import { getProjectOutboundHref, getProjectWebsiteRelAttribute } from "@/lib/link-utils"
import { getProjectBySlug, hasUserUpvoted } from "@/lib/project-details-query"
import { getCurrentUserId } from "@/lib/server-auth"
import { hasPublicProfile } from "@/lib/user-profile-query"
import { Button } from "@/components/ui/button"
import { RichTextDisplay } from "@/components/ui/rich-text-display"
import { Breadcrumb } from "@/components/layout/breadcrumb"
import { BookmarkButton } from "@/components/project/bookmark-button"
import { CommentsLazy } from "@/components/project/comments-lazy"
import { EditButton } from "@/components/project/edit-button"
import { LongDescription } from "@/components/project/long-description"
import { ProjectImageWithLoader } from "@/components/project/project-image-with-loader"
import { RelatedProducts } from "@/components/project/related-products"
import { ShareButton } from "@/components/project/share-button"
import { MakerCard } from "@/components/project/sidebar/maker-card"
import { ProjectMetaCard } from "@/components/project/sidebar/project-meta-card"
import { RelatedPagesCard } from "@/components/project/sidebar/related-pages-card"
import { VisitWebsiteCard } from "@/components/project/sidebar/visit-website-card"
import { UpvoteButton } from "@/components/project/upvote-button"
import { BreadcrumbSchema, ProjectSchema } from "@/components/seo/structured-data"
import { hasUserBookmarked } from "@/app/actions/bookmarks"

// Types
interface ProjectPageProps {
  params: Promise<{
    slug: string
    locale: string
  }>
}

interface ProjectViewerState {
  userId: string | null
  hasUpvoted: boolean
  hasBookmarked: boolean
}

async function getProjectViewerState(projectId: string): Promise<ProjectViewerState> {
  const userId = await getCurrentUserId()
  if (!userId) {
    return { userId: null, hasUpvoted: false, hasBookmarked: false }
  }

  const [hasUpvoted, hasBookmarked] = await Promise.all([
    hasUserUpvoted(projectId),
    hasUserBookmarked(projectId),
  ])
  return { userId, hasUpvoted, hasBookmarked }
}

async function DeferredUpvoteButton({
  projectId,
  upvoteCount,
  viewerState,
  className,
}: {
  projectId: string
  upvoteCount: number
  viewerState: Promise<ProjectViewerState>
  className?: string
}) {
  const viewer = await viewerState
  return (
    <UpvoteButton
      projectId={projectId}
      upvoteCount={upvoteCount}
      initialUpvoted={viewer.hasUpvoted}
      isAuthenticated={Boolean(viewer.userId)}
      className={className}
    />
  )
}

async function DeferredBookmarkButton({
  projectId,
  viewerState,
}: {
  projectId: string
  viewerState: Promise<ProjectViewerState>
}) {
  const viewer = await viewerState
  return (
    <BookmarkButton
      projectId={projectId}
      initialBookmarked={viewer.hasBookmarked}
      isAuthenticated={Boolean(viewer.userId)}
    />
  )
}

async function DeferredOwnerBadge({
  createdBy,
  projectSlug,
  viewerState,
}: {
  createdBy: string | null
  projectSlug: string
  viewerState: Promise<ProjectViewerState>
}) {
  const viewer = await viewerState
  if (viewer.userId !== createdBy) return null

  return (
    <div className="border-primary/30 bg-primary/10 text-primary flex flex-col items-center justify-between gap-2 rounded-lg border p-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-center text-sm font-medium">
        Congratulations! You earned a badge for your ranking.
      </span>
      <Button asChild variant="default" size="sm" className="flex items-center gap-2">
        <Link href={`/projects/${projectSlug}/badges`}>
          <RiVipCrownLine className="h-4 w-4" />
          View Badges
        </Link>
      </Button>
    </div>
  )
}

async function DeferredOwnerEditButton({
  createdBy,
  projectId,
  sourceLocale,
  canEdit,
  viewerState,
}: {
  createdBy: string | null
  projectId: string
  sourceLocale?: string
  canEdit: boolean
  viewerState: Promise<ProjectViewerState>
}) {
  const viewer = await viewerState
  const isOwner = viewer.userId === createdBy
  if (!isOwner) return null

  return <EditButton projectId={projectId} isOwner canEdit={canEdit} sourceLocale={sourceLocale} />
}

async function DeferredComments({
  projectId,
  placeholder,
  viewerState,
}: {
  projectId: string
  placeholder: string
  viewerState: Promise<ProjectViewerState>
}) {
  const viewer = await viewerState
  return (
    <CommentsLazy projectId={projectId} placeholder={placeholder} currentUserId={viewer.userId} />
  )
}

async function DeferredLongDescription({
  heading,
  markdown,
}: {
  heading: string
  markdown: Promise<string | null>
}) {
  const resolvedMarkdown = await markdown
  if (!resolvedMarkdown) return null
  return <LongDescription heading={heading} markdown={resolvedMarkdown} />
}

async function DeferredRelatedProjects({
  heading,
  subtitle,
  projects,
}: {
  heading: string
  subtitle: string
  projects: ReturnType<typeof getRelatedProjects>
}) {
  const resolvedProjects = await projects
  if (resolvedProjects.length === 0) return null
  return <RelatedProducts heading={heading} subtitle={subtitle} items={resolvedProjects} />
}

async function DeferredMakerCard({
  creator,
  linkable,
}: {
  creator: NonNullable<Awaited<ReturnType<typeof getProjectBySlug>>>["creator"]
  linkable: Promise<boolean>
}) {
  return <MakerCard creator={creator ?? null} linkable={await linkable} />
}

async function DeferredRelatedPages({
  compareHeading,
  alternativesHeading,
  links,
}: {
  compareHeading: string
  alternativesHeading: string
  links: ReturnType<typeof getProjectSidebarLinks>
}) {
  const resolvedLinks = await links
  return (
    <>
      <RelatedPagesCard
        heading={compareHeading}
        pathPrefix="/compare/"
        links={resolvedLinks.comparisons}
      />
      <RelatedPagesCard
        heading={alternativesHeading}
        pathPrefix="/alternatives/"
        links={resolvedLinks.alternatives}
      />
    </>
  )
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
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

  const path = `/projects/${slug}`

  return {
    title: `${projectData.name} | aat.ee`,
    description: stripHtml(localizedDescription),
    alternates: buildLocaleAlternates(path, locale),
    openGraph: {
      title: `${projectData.name} on aat.ee`,
      description: stripHtml(localizedDescription),
      ...buildLocaleOpenGraph(path, locale),
      siteName: "aat.ee",
      type: "website",
      // No explicit images: the opengraph-image.tsx convention file in this
      // folder generates the dynamic card (explicit images would override it).
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
    },
  }
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug, locale } = await params
  setRequestLocale(locale)
  const [projectData, tSidebar, tComments, tDetail, tBreadcrumb, messages] = await Promise.all([
    getProjectBySlug(slug),
    getTranslations("project.sidebar"),
    getTranslations("project.comments"),
    getTranslations("project.detail"),
    getTranslations("breadcrumb"),
    getMessages(),
  ])

  if (!projectData) {
    notFound()
  }

  // Kick off independent below-the-fold and viewer-specific work without
  // blocking the description. Suspense boundaries consume these promises
  // later, allowing the LCP text to be included in the first useful stream.
  const viewerState = getProjectViewerState(projectData.id)
  const longDescriptionMarkdown = getLocalizedLongDescription(projectData.id, locale)
  const relatedProjects = getRelatedProjects(projectData.id, locale, 4)
  const sidebarLinks = getProjectSidebarLinks(projectData.id)
  const creatorLinkable = projectData.creator?.id
    ? hasPublicProfile(projectData.creator.id)
    : Promise.resolve(false)

  // Description and tagline share one request-cached translation query.
  const [localizedDescription, tagline] = await Promise.all([
    getLocalizedProjectDescription(projectData.id, locale, projectData.description),
    getLocalizedProjectTagline(projectData.id, locale),
  ])

  const scheduledDate = projectData.scheduledLaunchDate
    ? new Date(projectData.scheduledLaunchDate)
    : null

  const isActiveLaunch = projectData.launchStatus === "ongoing"
  // Mirror the server-side toggleBookmark guard: only publicly live
  // projects can be bookmarked, so don't offer the button otherwise.
  const canBookmark = isActiveLaunch || projectData.launchStatus === "launched"

  const isScheduled = projectData.launchStatus === "scheduled"

  const websiteRelAttribute = getProjectWebsiteRelAttribute(
    {
      launchStatus: projectData.launchStatus,
      launchType: projectData.launchType,
      dailyRanking: projectData.dailyRanking,
      hasBadgeVerified: projectData.hasBadgeVerified ?? false,
      isLowQuality: projectData.isLowQuality,
    },
    { isDetailPage: true },
  )

  // Low-quality projects route through /go/ so search engines see a
  // noindex,nofollow redirect instead of a direct backlink.
  const websiteHref = projectData.websiteUrl
    ? getProjectOutboundHref(projectData.websiteUrl, {
        isLowQuality: projectData.isLowQuality,
      })
    : null

  // Function to strip HTML for Schema
  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "").trim()
  }

  return (
    <NextIntlClientProvider messages={pickClientMessages(messages, ["bookmark", "project"])}>
      <div className="bg-background min-h-screen">
        {/* Structured Data - Product Schema */}
        <ProjectSchema
          name={projectData.name}
          slug={projectData.slug}
          description={stripHtml(localizedDescription)}
          websiteUrl={projectData.websiteUrl}
          imageUrl={projectData.productImage || projectData.logoUrl}
          upvoteCount={projectData.upvoteCount}
          commentCount={projectData.commentCount}
          scheduledLaunchDate={projectData.scheduledLaunchDate}
        />

        {/* Breadcrumb Schema */}
        <BreadcrumbSchema
          items={[
            { name: tBreadcrumb("home"), url: `${process.env.NEXT_PUBLIC_URL}` },
            { name: tBreadcrumb("projects"), url: `${process.env.NEXT_PUBLIC_URL}/projects` },
            { name: projectData.name },
          ]}
        />

        <div className="mx-auto max-w-6xl px-6">
          {/* Breadcrumb Navigation */}
          <div className="pt-6">
            <Breadcrumb
              items={[
                { name: tBreadcrumb("projects"), href: "/projects" },
                { name: projectData.name },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* Main Content - 2 colonnes */}
            <div className="lg:col-span-2">
              {/* Modern Clean Header */}
              <div className="py-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 flex-1 flex-col items-start gap-2 md:flex-row md:items-center md:gap-4">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-transparent">
                      <Image
                        src={projectData.logoUrl}
                        alt={`${projectData.name} Logo`}
                        width={64}
                        height={64}
                        quality={95}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <h1 className="text-foreground truncate text-xl font-bold">
                        {projectData.name}
                      </h1>
                      {tagline && (
                        <p className="font-editorial text-muted-foreground truncate text-sm italic">
                          {tagline}
                        </p>
                      )}
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

                  <div className="flex items-center gap-3 md:ml-6">
                    {projectData.websiteUrl && (
                      <Button variant="outline" size="sm" asChild className="h-9 px-3">
                        <a
                          href={websiteHref ?? "#"}
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
                      <Suspense
                        fallback={
                          <div
                            className="bg-muted h-9 min-w-28 flex-1 animate-pulse rounded-md md:flex-none"
                            aria-hidden="true"
                          />
                        }
                      >
                        <DeferredUpvoteButton
                          projectId={projectData.id}
                          upvoteCount={projectData.upvoteCount}
                          viewerState={viewerState}
                          className="flex-1 md:flex-none"
                        />
                      </Suspense>
                    ) : (
                      <div className="border-muted bg-muted flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium md:flex-none">
                        <span className="text-foreground">{projectData.upvoteCount} upvotes</span>
                      </div>
                    )}
                    {canBookmark && (
                      <Suspense
                        fallback={
                          <div
                            className="bg-muted h-9 w-9 animate-pulse rounded-md"
                            aria-hidden="true"
                          />
                        }
                      >
                        <DeferredBookmarkButton
                          projectId={projectData.id}
                          viewerState={viewerState}
                        />
                      </Suspense>
                    )}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-6 pb-12">
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

                {/* Owner-only achievement UI must come after the public
                  description. A slow session lookup must never hold the LCP
                  text behind this Suspense boundary. */}
                {projectData.launchStatus === "launched" &&
                  projectData.dailyRanking &&
                  projectData.dailyRanking <= 3 && (
                    <Suspense fallback={null}>
                      <DeferredOwnerBadge
                        createdBy={projectData.createdBy}
                        projectSlug={projectData.slug}
                        viewerState={viewerState}
                      />
                    </Suspense>
                  )}

                {/* AI-generated long-form overview */}
                <Suspense fallback={null}>
                  <DeferredLongDescription
                    heading={tDetail("aboutHeading", { name: projectData.name })}
                    markdown={longDescriptionMarkdown}
                  />
                </Suspense>

                {/* Related products */}
                <Suspense fallback={null}>
                  <DeferredRelatedProjects
                    heading={tDetail("relatedHeading")}
                    subtitle={tDetail("relatedSubtitle")}
                    projects={relatedProjects}
                  />
                </Suspense>

                {/* Edit button pour owners — visible only on the public
                  detail page when project is scheduled. Pre-launch
                  states (payment_pending / payment_failed) don't have
                  a public detail page; their edit entry lives in the
                  dashboard drafts section. */}
                <Suspense fallback={null}>
                  <DeferredOwnerEditButton
                    createdBy={projectData.createdBy}
                    projectId={projectData.id}
                    canEdit={isScheduled}
                    sourceLocale={projectData.sourceLocale}
                    viewerState={viewerState}
                  />
                </Suspense>

                {/* Comments */}
                <div>
                  <h2 className="mb-4 text-lg font-semibold" id="comments">
                    {tComments("heading")}
                  </h2>
                  {projectData.launchStatus === "ongoing" ||
                  projectData.launchStatus === "launched" ? (
                    <Suspense
                      fallback={
                        <div className="flex min-h-[240px] items-center justify-center">
                          <p className="text-muted-foreground text-sm">Loading comments…</p>
                        </div>
                      }
                    >
                      <DeferredComments
                        projectId={projectData.id}
                        placeholder={tComments("placeholder")}
                        viewerState={viewerState}
                      />
                    </Suspense>
                  ) : (
                    <div className="py-6 text-center">
                      <p className="text-muted-foreground">{tComments("notLaunchedYet")}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar — single sticky column.
              Order is intentional:
                1. Maker (who made it)
                2. Visit website (primary CTA)
                3. Project info (at-a-glance metadata)
                4. Compare with (AI-generated comparison pages)
                5. Alternatives (AI-generated alternatives pages)
                6. Achievement (top-3 badge if won)
                7. Share (utility, lowest priority) */}
            <div className="lg:sticky lg:top-14 lg:h-fit">
              <div className="space-y-4 py-6">
                <Suspense
                  fallback={
                    <div className="bg-muted h-28 animate-pulse rounded-lg" aria-hidden="true" />
                  }
                >
                  <DeferredMakerCard creator={projectData.creator} linkable={creatorLinkable} />
                </Suspense>

                <VisitWebsiteCard
                  websiteUrl={projectData.websiteUrl}
                  launchStatus={projectData.launchStatus}
                  launchType={projectData.launchType}
                  dailyRanking={projectData.dailyRanking}
                  hasBadgeVerified={projectData.hasBadgeVerified ?? false}
                  isLowQuality={projectData.isLowQuality ?? false}
                />

                <ProjectMetaCard
                  scheduledDate={scheduledDate}
                  platforms={projectData.platforms ?? []}
                  pricing={projectData.pricing ?? null}
                  techStack={projectData.techStack ?? []}
                  githubUrl={projectData.githubUrl}
                  twitterUrl={projectData.twitterUrl}
                />

                <Suspense fallback={null}>
                  <DeferredRelatedPages
                    compareHeading={tSidebar("compareWith")}
                    alternativesHeading={tSidebar("alternatives")}
                    links={sidebarLinks}
                  />
                </Suspense>

                {/* Achievement badge — placed last but kept around for
                  parity with the previous design. */}
                {projectData.launchStatus === "launched" &&
                  projectData.dailyRanking &&
                  projectData.dailyRanking <= 3 && (
                    <div className="bg-card rounded-lg border p-4">
                      <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wider uppercase">
                        {tSidebar("achievement")}
                      </p>
                      <div className="flex">
                        <img
                          src={`/images/badges/top${projectData.dailyRanking}-light.svg`}
                          alt={`aat.ee Top ${projectData.dailyRanking} Daily Winner`}
                          loading="lazy"
                          decoding="async"
                          className="h-12 w-auto dark:hidden"
                        />
                        <img
                          src={`/images/badges/top${projectData.dailyRanking}-dark.svg`}
                          alt={`aat.ee Top ${projectData.dailyRanking} Daily Winner`}
                          loading="lazy"
                          decoding="async"
                          className="hidden h-12 w-auto dark:block"
                        />
                      </div>
                    </div>
                  )}

                <ShareButton name={projectData.name} slug={projectData.slug} variant="fullWidth" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </NextIntlClientProvider>
  )
}
