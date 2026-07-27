export default function WinnersLoading() {
  return (
    <main className="bg-secondary/20 min-h-screen">
      <div className="container mx-auto max-w-6xl px-4 pt-8 pb-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:items-start">
          <div className="space-y-4 md:col-span-2">
            <div className="bg-muted mx-3 h-8 w-48 animate-pulse rounded-md sm:mx-4" />
            <div className="bg-muted mx-3 h-24 animate-pulse rounded-lg sm:mx-4" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-muted mx-3 h-28 animate-pulse rounded-lg sm:mx-4" />
            ))}
          </div>
          <div className="space-y-3">
            <div className="bg-muted h-6 w-32 animate-pulse rounded-md" />
            <div className="bg-muted h-40 animate-pulse rounded-lg" />
          </div>
        </div>
      </div>
    </main>
  )
}
