"use client"

import { Button } from "@/components/ui/button"

export default function CommunityError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="community-preview community-live" lang="en">
      <div className="c-layout">
        <section id="community-content" tabIndex={-1}>
          <section className="c-state">
            <h1>Community is temporarily unavailable</h1>
            <p>Please try again in a moment.</p>
            <Button className="c-button" onClick={reset}>
              Try again
            </Button>
          </section>
        </section>
      </div>
    </div>
  )
}
