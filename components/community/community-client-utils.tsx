"use client"

import { useCallback, useRef } from "react"
import Link from "next/link"

import type { CommunityActionResult } from "@/lib/community/action-result"
import { participationMessage, type CommunityViewer } from "@/lib/community/contracts"

export function actionMessage<T>(result: CommunityActionResult<T>): string | null {
  return result.ok ? null : result.error.message
}

/**
 * These clients initialize interactive state from a server projection. Thread
 * revisions do not cover independently loaded author, product, reply, or
 * viewer data, so use the complete serializable projection to replace local
 * state whenever a fresh route payload changes.
 */
export function communityProjectionKey(projection: object): string {
  return JSON.stringify(projection)
}

/** Keep the same UUID through a retry, and replace it only after content changes. */
export function newCommunityRequestKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID()
  // A UUID-capable browser is required by the supported app matrix. This fallback
  // preserves the server's conservative request-key format for older test UAs.
  return `community-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

/**
 * React commits transition state asynchronously. Use this for an immediate
 * event-time guard around a server action, then always call `release` in its
 * `finally` block so a failed operation remains retryable.
 */
export function useCommunityActionLock(): readonly [
  tryAcquire: () => boolean,
  release: () => void,
] {
  const locked = useRef(false)
  const tryAcquire = useCallback(() => {
    if (locked.current) return false
    locked.current = true
    return true
  }, [])
  const release = useCallback(() => {
    locked.current = false
  }, [])
  return [tryAcquire, release] as const
}

export function CommunityParticipationGate({ viewer }: { viewer: CommunityViewer }) {
  if (viewer.canParticipate) return null
  const message = participationMessage(viewer.role)
  return (
    <div className="c-notice" role="status">
      <p>{message ?? "Community participation is unavailable for this account."}</p>
      {viewer.role === "anonymous" && (
        <Link className="c-text-button" href="/sign-in">
          Sign in to participate
        </Link>
      )}
    </div>
  )
}
