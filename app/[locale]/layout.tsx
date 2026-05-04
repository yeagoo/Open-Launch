import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { routing } from "@/i18n/routing"
import { hasLocale } from "next-intl"
import { setRequestLocale } from "next-intl/server"

const baseUrl = process.env.NEXT_PUBLIC_URL || "https://www.aat.ee"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params

  const languages: Record<string, string> = {}
  for (const loc of routing.locales) {
    languages[loc] = loc === routing.defaultLocale ? `${baseUrl}/` : `${baseUrl}/${loc}`
  }
  languages["x-default"] = `${baseUrl}/`

  return {
    alternates: {
      canonical: locale === routing.defaultLocale ? `${baseUrl}/` : `${baseUrl}/${locale}`,
      languages,
    },
  }
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  return children
}
