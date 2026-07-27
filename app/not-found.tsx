import Link from "next/link"

// Root not-found page — covers non-locale routes (/admin/*, /compare/*,
// /api 404s rendered as pages) that app/[locale]/not-found.tsx never sees.
// Kept locale-neutral (English) since no locale context exists here.
export default function RootNotFound() {
  return (
    <div className="bg-secondary/20 flex min-h-[80vh] items-center justify-center">
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <div className="bg-background rounded-xl border p-8 shadow-sm dark:border-zinc-800">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-blue-200 bg-blue-50">
              <span className="text-2xl font-bold text-blue-500">404</span>
            </div>
          </div>
          <h1 className="font-heading mb-3 text-3xl font-bold">Page Not Found</h1>
          <p className="text-muted-foreground mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Link
            href="/"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
