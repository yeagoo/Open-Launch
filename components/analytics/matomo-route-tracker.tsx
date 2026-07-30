"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"

import { getMatomoPageUrl } from "@/lib/analytics/matomo"
import { pushBoundedMatomoCommand, type MatomoWindow } from "@/lib/analytics/matomo-queue"

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
    pushBoundedMatomoCommand(matomoWindow, ["setReferrerUrl", previousUrl.current])
    pushBoundedMatomoCommand(matomoWindow, ["setCustomUrl", currentUrl])
    pushBoundedMatomoCommand(matomoWindow, ["setDocumentTitle", document.title])
    pushBoundedMatomoCommand(matomoWindow, ["trackPageView"])

    previousUrl.current = currentUrl
  }, [pathname, searchParams])

  return null
}
