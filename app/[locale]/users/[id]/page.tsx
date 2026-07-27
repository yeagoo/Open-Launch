import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RiAppsLine, RiCalendarLine, RiTrophyLine } from "@remixicon/react"
import { getTranslations } from "next-intl/server"

import { buildLocaleAlternates } from "@/lib/i18n-metadata"
import { serializeJsonLd } from "@/lib/safe-json-ld"
import { getPublicUserProfile } from "@/lib/user-profile-query"
import { Badge } from "@/components/ui/badge"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ locale: string; id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, id } = await params
  const data = await getPublicUserProfile(id)
  if (!data) return { title: "User not found | aat.ee" }

  const name = data.profile.name ?? "Maker"
  return {
    title: `${name} | aat.ee`,
    description: `${name}'s launches on aat.ee`,
    alternates: buildLocaleAlternates(`/users/${id}`, locale),
  }
}

export default async function UserProfilePage({ params }: PageProps) {
  const { locale, id } = await params
  const t = await getTranslations("userProfile")
  const data = await getPublicUserProfile(id)
  if (!data) notFound()

  const { profile, projects } = data
  const name = profile.name ?? "Maker"
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

  const profileSchema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name,
      url: `${baseUrl}/users/${profile.id}`,
      ...(profile.image ? { image: profile.image } : {}),
    },
  }

  return (
    <main className="bg-secondary/20 min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(profileSchema) }}
      />
      <div className="container mx-auto max-w-4xl px-4 pt-8 pb-12">
        {/* Header */}
        <div className="bg-card border-border mb-8 flex items-center gap-4 rounded-xl border p-6">
          {profile.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.image}
              alt={name}
              className="border-border h-16 w-16 rounded-full border object-cover"
            />
          ) : (
            <div className="bg-primary/10 text-primary flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold sm:text-2xl">{name}</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
              <RiCalendarLine className="h-4 w-4" />
              {t("memberSince", {
                date: new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
                  profile.createdAt,
                ),
              })}
            </p>
          </div>
        </div>

        {/* Launches */}
        <h2 className="mb-4 text-lg font-semibold">
          {t("launches")} ({projects.length})
        </h2>
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.slug}`}
              className="bg-card border-border hover:border-primary/50 flex items-center gap-4 rounded-xl border p-4 transition-colors"
            >
              {p.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.logoUrl}
                  alt={p.name}
                  className="border-border h-12 w-12 flex-shrink-0 rounded-full border object-cover"
                />
              ) : (
                <div className="bg-primary/10 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full">
                  <RiAppsLine className="text-primary h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-muted-foreground text-xs capitalize">
                  {p.launchStatus}
                  {p.scheduledLaunchDate &&
                    ` · ${new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(p.scheduledLaunchDate)}`}
                </div>
              </div>
              {p.dailyRanking != null && p.dailyRanking <= 3 && (
                <Badge variant="secondary" className="flex-shrink-0 gap-1">
                  <RiTrophyLine className="h-3.5 w-3.5" />#{p.dailyRanking}
                </Badge>
              )}
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
