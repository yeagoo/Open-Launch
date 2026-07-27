export default function ReviewsLoading() {
  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 space-y-3 text-center">
          <div className="bg-muted mx-auto h-8 w-48 animate-pulse rounded-md" />
          <div className="bg-muted mx-auto h-5 w-96 max-w-full animate-pulse rounded-md" />
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="bg-muted aspect-[16/9] animate-pulse rounded-lg" />
              <div className="bg-muted h-5 w-3/4 animate-pulse rounded-md" />
              <div className="bg-muted h-4 w-full animate-pulse rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
