"use client"

import { useEffect } from "react"
import Link from "next/link"

// Locale-scoped error boundary: covers every page under /[locale] so a
// failing server component shows a branded recovery instead of bubbling
// to the root boundary (or, previously, the Next.js default page).
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[locale-error]", error)
  }, [error])

  return (
    <div className="bg-secondary/20 flex min-h-[80vh] items-center justify-center">
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="bg-background rounded-xl border p-8 shadow-sm dark:border-zinc-800">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-200 bg-amber-50">
              <span className="text-2xl font-bold text-amber-500">!</span>
            </div>
          </div>
          <h1 className="font-heading mb-3 text-3xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground mb-8">
            An unexpected error occurred while loading this page. Please try again.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => reset()}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Try again
            </button>
            <Link
              href="/"
              className="border-border hover:bg-muted inline-flex items-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
