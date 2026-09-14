/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from "next"
import Link from "next/link"

import { RiCalendarLine, RiHistoryLine, RiTrophyFill } from "@remixicon/react"
import { format, subDays } from "date-fns"
import { getLocale, getTranslations } from "next-intl/server"

import { localizeProjectDescriptions } from "@/lib/get-project-translation"
import { buildLocaleAlternates, buildLocaleOpenGraph } from "@/lib/i18n-metadata"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/date-picker"
import { SerifHeading } from "@/components/ds/serif-heading"
import { ItemListSchema } from "@/components/seo/structured-data"
import { WinnerCard } from "@/components/winners/winner-card"
import { getWinnersByDate } from "@/app/actions/home"
import { getTopCategories } from "@/app/actions/projects"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "metadata.winners" })
  const path = "/winners"
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

// Composant pour afficher le message quand il n'y a pas de gagnants
function NoWinnersFound() {
  return (
    <div className="bg-home-surface border-home-hairline rounded-home-card shadow-home-card mx-3 border p-8 text-center sm:mx-4">
      <div className="bg-muted/30 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
        <RiTrophyFill className="text-muted-foreground h-6 w-6" />
      </div>
      <SerifHeading as="h2" size="card" className="mb-2 text-lg">
        No winners found
      </SerifHeading>
      <p className="text-muted-foreground mb-4 text-sm">
        There are no winners for this date or the competition hasn't ended yet.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/winners">Back to today's winners</Link>
      </Button>
    </div>
  )
}

export default async function WinnersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  // Par défaut, utiliser la date d'hier (car ce sont les gagnants du jour précédent)
  const yesterday = subDays(new Date(), 1)
  const twoDaysAgo = subDays(new Date(), 2)
  const threeDaysAgo = subDays(new Date(), 3)

  // Récupérer la date des paramètres d'URL ou utiliser hier par défaut
  let selectedDate: Date
  const params = await searchParams
  if (params.date) {
    selectedDate = new Date(params.date)
    // Vérifier si la date est valide
    if (isNaN(selectedDate.getTime())) {
      selectedDate = yesterday
    }
  } else {
    selectedDate = yesterday
  }

  // These reads are independent. The localized display copy waits only on the
  // winner rows themselves, while the cache-backed sidebar and locale lookup
  // start at the same time.
  const [winnersRaw, locale, topCategories] = await Promise.all([
    getWinnersByDate(selectedDate),
    getLocale(),
    getTopCategories(5),
  ])
  const winners = await localizeProjectDescriptions(winnersRaw, locale)

  // Date formatée pour l'affichage
  const formattedDate = format(selectedDate, "MMMM d, yyyy")

  // Formatage pour les liens rapides
  const yesterdayFormatted = format(yesterday, "yyyy-MM-dd")
  const twoDaysAgoFormatted = format(twoDaysAgo, "yyyy-MM-dd")
  const threeDaysAgoFormatted = format(threeDaysAgo, "yyyy-MM-dd")

  return (
    <div className="bg-secondary/20 min-h-screen">
      <div className="container mx-auto max-w-6xl px-4 pt-8 pb-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:items-start">
          {/* Contenu principal */}
          <div className="md:col-span-2">
            <div className="mb-6">
              <div className="mb-6 flex items-center justify-between">
                <SerifHeading as="h1" size="section" className="px-3 sm:px-4">
                  Daily Winners
                </SerifHeading>
              </div>

              <div className="bg-home-surface border-home-hairline rounded-home-card shadow-home-card mx-3 border p-4 sm:mx-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <SerifHeading as="h2" size="card" className="mb-1">
                      Winners for {formattedDate}
                    </SerifHeading>
                    <p className="text-muted-foreground text-sm">
                      These projects were selected as the top performers of the day.
                    </p>
                  </div>
                  <div className="self-start sm:self-center">
                    <DatePicker date={selectedDate} />
                  </div>
                </div>
              </div>
            </div>

            {winners.length > 0 && (
              <ItemListSchema
                name={`Daily Winners — ${formattedDate}`}
                description={`Top projects of ${formattedDate} on aat.ee`}
                items={winners.map((w) => ({
                  name: w.name,
                  slug: w.slug,
                  logoUrl: w.logoUrl ?? "",
                }))}
                listType="project"
              />
            )}
            {winners.length === 0 ? (
              <NoWinnersFound />
            ) : (
              <div className="space-y-4">
                {winners.map((winner, index) => (
                  <div key={winner.id} className="mx-3 sm:mx-4">
                    <WinnerCard
                      name={winner.name}
                      slug={winner.slug}
                      description={winner.description}
                      thumbnail={winner.logoUrl}
                      dailyRanking={winner.dailyRanking || index + 1}
                      upvoteCount={winner.upvoteCount}
                      commentCount={winner.commentCount || 0}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-3">
            {/* About Daily Winners */}
            <div className="space-y-3 p-5 pt-0">
              <SerifHeading as="h2" size="eyebrow" className="flex items-center gap-2">
                About Daily Winners
              </SerifHeading>
              <div className="bg-home-surface border-home-hairline rounded-home-card shadow-home-card border p-4">
                <p className="text-muted-foreground text-sm">
                  Each day, aat.ee automatically ranks the top 3 most upvoted projects that were
                  launched.
                </p>
              </div>
            </div>

            {/* Quick Date Access */}
            <div className="space-y-3 p-5">
              <SerifHeading as="h2" size="eyebrow" className="flex items-center gap-2">
                <RiHistoryLine className="h-4 w-4" />
                Recent Winners
              </SerifHeading>
              <div className="space-y-2">
                <Link
                  href={`/winners?date=${yesterdayFormatted}`}
                  className={`flex items-center gap-2 rounded-md p-2 text-sm transition-colors ${
                    format(selectedDate, "yyyy-MM-dd") === yesterdayFormatted
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <RiCalendarLine className="text-muted-foreground h-4 w-4" />
                  Yesterday
                </Link>
                <Link
                  href={`/winners?date=${twoDaysAgoFormatted}`}
                  className={`flex items-center gap-2 rounded-md p-2 text-sm transition-colors ${
                    format(selectedDate, "yyyy-MM-dd") === twoDaysAgoFormatted
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <RiCalendarLine className="text-muted-foreground h-4 w-4" />
                  {format(twoDaysAgo, "MMMM d")}
                </Link>
                <Link
                  href={`/winners?date=${threeDaysAgoFormatted}`}
                  className={`flex items-center gap-2 rounded-md p-2 text-sm transition-colors ${
                    format(selectedDate, "yyyy-MM-dd") === threeDaysAgoFormatted
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <RiCalendarLine className="text-muted-foreground h-4 w-4" />
                  {format(threeDaysAgo, "MMMM d")}
                </Link>
              </div>
            </div>

            {/* Categories */}
            <div className="space-y-3 p-5">
              <div className="flex items-center justify-between">
                <SerifHeading as="h2" size="eyebrow" className="flex items-center gap-2">
                  Top Categories
                </SerifHeading>
                <Button variant="ghost" size="sm" className="text-sm" asChild>
                  <Link href="/categories" className="flex items-center gap-1">
                    View all
                  </Link>
                </Button>
              </div>
              <div className="space-y-2">
                {topCategories.map((category) => (
                  <Link
                    key={category.id}
                    href={`/categories?category=${category.id}`}
                    className="hover:bg-muted/40 flex items-center justify-between rounded-md p-2"
                  >
                    <span className="text-sm hover:underline">{category.name}</span>
                    <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-xs">
                      {category.count} projects
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Quick Links */}
            <div className="space-y-3 p-5">
              <SerifHeading as="h2" size="eyebrow" className="flex items-center gap-2">
                Quick Access
              </SerifHeading>
              <div className="space-y-2">
                <Link
                  href="/trending"
                  className="flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Trending Now
                </Link>
                <Link
                  href="/trending?filter=month"
                  className="flex items-center gap-2 rounded-md p-2 text-sm transition-colors hover:underline"
                >
                  Best of Month
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
