import "server-only"

import { headers } from "next/headers"

import { getClientIp } from "@/lib/client-ip"
import { checkRateLimit } from "@/lib/rate-limit"

import { CommunityError } from "./contracts"

const SEARCH_LIMIT = { requests: 15, windowMs: 60 * 1000 } as const
const PAGE_LIMIT = { requests: 120, windowMs: 10 * 60 * 1000 } as const
const SEARCH_LIMIT_MESSAGE = "Too many community searches. Please wait before trying again"

async function isWithinCommunityReadLimit(scope: "search" | "page"): Promise<boolean> {
  const requestHeaders = await headers()
  const ip = getClientIp(requestHeaders)
  const limit = scope === "search" ? SEARCH_LIMIT : PAGE_LIMIT
  const result = await checkRateLimit(`community:${scope}:${ip}`, limit.requests, limit.windowMs, {
    // Public browsing should remain available during a Redis incident, while
    // the bounded fallback prevents one instance from becoming unmetered.
    onRedisError: "memory-fallback",
  })
  return result.success
}

/** Page loads only meter expensive text search; ordinary keyset feed reads stay fast. */
export async function isCommunitySearchAllowed(search: unknown): Promise<boolean> {
  return typeof search !== "string" || !search.trim() || isWithinCommunityReadLimit("search")
}

/** Cursor actions must not bypass the expensive-search budget used by the initial RSC page. */
export async function assertCommunitySearchAllowed(search: unknown): Promise<void> {
  if (!(await isCommunitySearchAllowed(search)))
    throw new CommunityError("retryable", SEARCH_LIMIT_MESSAGE)
}

/** Server actions expose cursor pages, so meter them separately from the initial RSC response. */
export async function assertCommunityPageReadAllowed(): Promise<void> {
  if (!(await isWithinCommunityReadLimit("page")))
    throw new CommunityError(
      "retryable",
      "Too many community requests. Please wait before trying again",
    )
}
