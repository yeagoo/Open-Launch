import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SafeMarkdown } from "@/components/ui/safe-markdown"
import { SidebarSponsors } from "@/components/layout/sidebar-sponsors"
import { BreadcrumbSchema, ComparisonSchema } from "@/components/seo/structured-data"
import { getComparisonBySlug } from "@/app/actions/comparisons"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const comparison = await getComparisonBySlug(slug)

  if (!comparison) {
    return { title: "Comparison Not Found - aat.ee" }
  }

  const title = comparison.metaTitle || comparison.title
  const description =
    comparison.metaDescription ||
    `Compare ${comparison.projectA.name} vs ${comparison.projectB.name}. See features, pricing, pros and cons.`

  return {
    title: `${title} - aat.ee`,
    description,
    alternates: {
      canonical: `${baseUrl}/compare/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/compare/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  }
}

export default async function ComparisonDetailPage({ params }: Props) {
  const { slug } = await params
  const comparison = await getComparisonBySlug(slug)

  if (!comparison) return notFound()

  return (
    <main className="bg-secondary/20">
      <BreadcrumbSchema
        items={[
          { name: "Compare", url: `${baseUrl}/compare` },
          { name: comparison.title, url: `${baseUrl}/compare/${slug}` },
        ]}
      />
      <ComparisonSchema
        projectAName={comparison.projectA.name}
        projectAUrl={`${baseUrl}/projects/${comparison.projectA.slug}`}
        projectBName={comparison.projectB.name}
        projectBUrl={`${baseUrl}/projects/${comparison.projectB.slug}`}
        slug={slug}
        description={
          comparison.metaDescription ||
          `Compare ${comparison.projectA.name} vs ${comparison.projectB.name}`
        }
      />

      <div className="container mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-12">
        {/* Breadcrumb */}
        <nav className="text-muted-foreground mb-4 flex items-center gap-1 text-sm">
          <Link href="/compare" className="hover:underline">
            Compare
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{comparison.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-10">
          {/* Main content */}
          <div className="lg:col-span-7">
            {/* Header with logos */}
            <div className="bg-card border-border mb-6 rounded-lg border p-6">
              <div className="flex items-center justify-center gap-6">
                <div className="flex flex-col items-center gap-2">
                  <Image
                    src={comparison.projectA.logoUrl}
                    alt={comparison.projectA.name}
                    width={64}
                    height={64}
                    className="rounded-lg"
                  />
                  <Link
                    href={`/projects/${comparison.projectA.slug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {comparison.projectA.name}
                  </Link>
                </div>
                <span className="text-muted-foreground text-2xl font-bold">VS</span>
                <div className="flex flex-col items-center gap-2">
                  <Image
                    src={comparison.projectB.logoUrl}
                    alt={comparison.projectB.name}
                    width={64}
                    height={64}
                    className="rounded-lg"
                  />
                  <Link
                    href={`/projects/${comparison.projectB.slug}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {comparison.projectB.name}
                  </Link>
                </div>
              </div>
              <h1 className="mt-4 text-center text-2xl font-bold">{comparison.title}</h1>
            </div>

            {/* Markdown content */}
            <article className="prose prose-zinc dark:prose-invert max-w-none">
              <SafeMarkdown>{comparison.content}</SafeMarkdown>
            </article>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-3">
            <div className="sticky top-24 space-y-6">
              <SidebarSponsors />

              <div className="bg-card border-border rounded-lg border p-4">
                <h3 className="mb-3 font-semibold">View Products</h3>
                <div className="space-y-2">
                  <Link
                    href={`/projects/${comparison.projectA.slug}`}
                    className="bg-secondary/50 hover:bg-secondary flex items-center gap-2 rounded-md p-2 text-sm transition-colors"
                  >
                    <Image
                      src={comparison.projectA.logoUrl}
                      alt={comparison.projectA.name}
                      width={24}
                      height={24}
                      className="rounded"
                    />
                    {comparison.projectA.name}
                  </Link>
                  <Link
                    href={`/projects/${comparison.projectB.slug}`}
                    className="bg-secondary/50 hover:bg-secondary flex items-center gap-2 rounded-md p-2 text-sm transition-colors"
                  >
                    <Image
                      src={comparison.projectB.logoUrl}
                      alt={comparison.projectB.name}
                      width={24}
                      height={24}
                      className="rounded"
                    />
                    {comparison.projectB.name}
                  </Link>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold">Explore More</h3>
                <div className="space-y-2">
                  <Link
                    href="/compare"
                    className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                  >
                    All Comparisons
                  </Link>
                  <Link
                    href="/alternatives"
                    className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                  >
                    Product Alternatives
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
