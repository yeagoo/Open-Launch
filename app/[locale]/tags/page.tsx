import type { Metadata } from "next"
import Link from "next/link"

import { getTranslations } from "next-intl/server"

import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import { SidebarSponsors } from "@/components/layout/sidebar-sponsors"
import { getAllTags } from "@/app/actions/tags"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "metadata.tags" })
  const path = "/tags"
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
  }
}

export default async function TagsPage() {
  const tags = await getAllTags(500)

  return (
    <main className="bg-secondary/20">
      <div className="container mx-auto min-h-screen max-w-6xl px-4 pt-8 pb-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Tags</h1>
          <p className="text-muted-foreground mt-1 text-sm">Browse projects by topic</p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 lg:items-start">
          <div className="lg:col-span-2">
            {tags.length === 0 ? (
              <div className="text-muted-foreground border-border bg-card rounded-lg border border-dashed py-12 text-center text-sm">
                No tags yet. Tags will appear as projects are submitted.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/tags/${tag.slug}`}
                    className="bg-card hover:bg-muted border-border inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
                  >
                    <span className="font-medium">#{tag.name}</span>
                    <span className="text-muted-foreground text-xs">{tag.projectCount}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="top-24 hidden lg:block">
            <SidebarSponsors />

            <div className="space-y-3 py-5">
              <h3 className="flex items-center gap-2 font-semibold">Quick Access</h3>
              <div className="space-y-2">
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
                <Link
                  href="/projects/submit"
                  className="-mx-2 flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Submit a Project
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
