import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import Markdown from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { Badge } from "@/components/ui/badge"
import { SidebarSponsors } from "@/components/layout/sidebar-sponsors"
import { BreadcrumbSchema } from "@/components/seo/structured-data"
import { getAlternativePageBySlug } from "@/app/actions/alternatives"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = await getAlternativePageBySlug(slug)

  if (!page) {
    return { title: "Alternatives Not Found - aat.ee" }
  }

  const title = page.metaTitle || page.title
  const description =
    page.metaDescription ||
    `Discover the best alternatives to ${page.subjectProject.name}. Compare ${page.alternativeCount} alternatives.`

  return {
    title: `${title} - aat.ee`,
    description,
    alternates: {
      canonical: `${baseUrl}/alternatives/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/alternatives/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function AlternativeDetailPage({ params }: Props) {
  const { slug } = await params
  const page = await getAlternativePageBySlug(slug)

  if (!page) return notFound()

  return (
    <main className="bg-secondary/20">
      <BreadcrumbSchema
        items={[
          { name: "Alternatives", url: `${baseUrl}/alternatives` },
          { name: page.title, url: `${baseUrl}/alternatives/${slug}` },
        ]}
      />

      <div className="container mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-12">
        {/* Breadcrumb */}
        <nav className="text-muted-foreground mb-4 flex items-center gap-1 text-sm">
          <Link href="/alternatives" className="hover:underline">
            Alternatives
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{page.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-10">
          {/* Main content */}
          <div className="lg:col-span-7">
            {/* Header */}
            <div className="bg-card border-border mb-6 rounded-lg border p-6">
              <div className="flex items-center gap-4">
                <Image
                  src={page.subjectProject.logoUrl}
                  alt={page.subjectProject.name}
                  width={56}
                  height={56}
                  className="rounded-lg"
                />
                <div>
                  <h1 className="text-2xl font-bold">{page.title}</h1>
                  <p className="text-muted-foreground text-sm">
                    {page.alternativeCount} alternatives found
                  </p>
                </div>
              </div>
            </div>

            {/* Markdown overview content */}
            <article className="prose prose-zinc dark:prose-invert mb-8 max-w-none">
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                {page.content}
              </Markdown>
            </article>

            {/* Alternative cards */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Alternatives</h2>
              {page.alternatives.map((alt, index) => (
                <div key={alt.id} className="bg-card border-border rounded-lg border p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <Image
                        src={alt.logoUrl}
                        alt={alt.name}
                        width={48}
                        height={48}
                        className="rounded-lg"
                      />
                    </div>
                    <div className="min-w-0 flex-grow">
                      <div className="mb-1 flex items-center gap-2">
                        <Link
                          href={`/projects/${alt.slug}`}
                          className="font-semibold hover:underline"
                        >
                          {index + 1}. {alt.name}
                        </Link>
                        {alt.aiScore && alt.aiScore >= 80 && (
                          <Badge variant="secondary" className="text-xs">
                            Top Match
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mb-3 line-clamp-2 text-sm">
                        {alt.description}
                      </p>

                      {alt.prosConsJson && (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {alt.prosConsJson.pros && alt.prosConsJson.pros.length > 0 && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-green-600 dark:text-green-400">
                                Pros
                              </p>
                              <ul className="space-y-0.5">
                                {alt.prosConsJson.pros.map((pro, i) => (
                                  <li key={i} className="text-muted-foreground text-xs">
                                    + {pro}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {alt.prosConsJson.cons && alt.prosConsJson.cons.length > 0 && (
                            <div>
                              <p className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">
                                Cons
                              </p>
                              <ul className="space-y-0.5">
                                {alt.prosConsJson.cons.map((con, i) => (
                                  <li key={i} className="text-muted-foreground text-xs">
                                    - {con}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {alt.useCases && (
                        <p className="text-muted-foreground mt-2 text-xs italic">{alt.useCases}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-3">
            <div className="sticky top-24 space-y-6">
              <SidebarSponsors />

              <div className="bg-card border-border rounded-lg border p-4">
                <h3 className="mb-3 font-semibold">About {page.subjectProject.name}</h3>
                <Link
                  href={`/projects/${page.subjectProject.slug}`}
                  className="bg-secondary/50 hover:bg-secondary flex items-center gap-2 rounded-md p-2 text-sm transition-colors"
                >
                  <Image
                    src={page.subjectProject.logoUrl}
                    alt={page.subjectProject.name}
                    width={24}
                    height={24}
                    className="rounded"
                  />
                  View {page.subjectProject.name}
                </Link>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Explore More</h3>
                <div className="space-y-2">
                  <Link
                    href="/alternatives"
                    className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                  >
                    All Alternatives
                  </Link>
                  <Link
                    href="/compare"
                    className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                  >
                    Product Comparisons
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
