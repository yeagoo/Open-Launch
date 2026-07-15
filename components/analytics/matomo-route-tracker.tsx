"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

import { getMatomoPageUrl } from "@/lib/analytics/matomo"

type MatomoCommand = [method: string, ...parameters: unknown[]]

type MatomoWindow = Window & {
  _paq?: MatomoCommand[]
}

/**
 * Matomo's bootstrap snippet records the initial page load. This component
 * records subsequent App Router navigations, which do not reload that script.
 */
export function MatomoRouteTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const previousUrl = useRef<string | null>(null)

  useEffect(() => {
    const currentUrl = getMatomoPageUrl(window.location.href)

    // The inline Matomo snippet owns the initial page view. Skipping it here
    // prevents a duplicate event after React hydrates.
    if (previousUrl.current === null) {
      previousUrl.current = currentUrl
      return
    }

    if (previousUrl.current === currentUrl) {
      return
    }

    const matomoWindow = window as MatomoWindow
    const queue = (matomoWindow._paq = matomoWindow._paq || [])

    queue.push(["setReferrerUrl", previousUrl.current])
    queue.push(["setCustomUrl", currentUrl])
    queue.push(["setDocumentTitle", document.title])
    queue.push(["trackPageView"])

    previousUrl.current = currentUrl
  }, [pathname, searchParams])

  return null
}
