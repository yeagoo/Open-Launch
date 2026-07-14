/**
 * Crawler entry point.
 *
 * Routes `crawlUrl` to one of two backends based on the CRAWLER env var:
 *   - "tinyfish" (default) — hosted Tinyfish Fetch API, real-browser
 *                            rendering, 25 URLs/min free tier. Passes
 *                            Cloudflare managed challenges that raw
 *                            HTTP clients now bounce off.
 *   - "crawl4ai"            — self-hosted Crawl4AI service (legacy).
 *                             Kept for ops escape hatch; will be
 *                             removed once we're sure no one needs it.
 *
 * Default flipped tinyfish-first after Cloudflare started challenging
 * our Zeabur IP range — crawl4ai's self-hosted scraper started failing
 * on the same protected targets (PH /r/, etc.). Tinyfish was validated
 * end-to-end on PH /r/ (the hardest CF managed challenge we encounter)
 * before the flip; everything else is easier.
 *
 * The cache layer (`getCachedOrCrawl` + `crawled_data` table) is
 * unchanged and works with either backend. Filename kept as
 * `crawl4ai.ts` so existing callers don't need touching.
 */

import { db } from "@/drizzle/db"
import { crawledData, project as projectTable } from "@/drizzle/db/schema"
import { addDays } from "date-fns"
import { and, eq, gt, sql } from "drizzle-orm"

import { crawlFailurePolicy } from "./crawl-health"
import {
  CrawlError,
  CrawlSuspendedError,
  type CrawlOptions,
  type CrawlResult,
} from "./crawler-types"
import { fetchWithTimeout, withTimeout } from "./fetch-timeout"
import { tinyfishCrawl } from "./tinyfish"

export { CrawlError, type CrawlOptions, type CrawlResult }

type Backend = "tinyfish" | "crawl4ai"

function activeBackend(): Backend {
  // Default tinyfish — see file header for rationale.
  const value = (process.env.CRAWLER ?? "tinyfish").toLowerCase()
  return value === "crawl4ai" ? "crawl4ai" : "tinyfish"
}

export async function crawlUrl(url: string, options?: CrawlOptions): Promise<CrawlResult> {
  if (activeBackend() === "tinyfish") return tinyfishCrawl(url, options)
  return crawl4aiCrawl(url, options)
}

/**
 * Get cached crawl data or crawl fresh. Upserts result into crawled_data table.
 * Backend-agnostic — the cache key is just the URL.
 */
export async function getCachedOrCrawl(
  projectId: string | null,
  url: string,
  ttlDays = 7,
  options?: CrawlOptions,
): Promise<CrawlResult> {
  const now = new Date()

  const cached = await db
    .select()
    .from(crawledData)
    .where(and(eq(crawledData.url, url), gt(crawledData.expiresAt, now)))
    .limit(1)

  if (cached.length > 0) {
    return {
      url: cached[0].url,
      markdown: cached[0].content,
      crawledAt: cached[0].crawledAt,
    }
  }

  const health = projectId
    ? await db
        .select({
          failureCount: projectTable.crawlFailureCount,
          suspendedUntil: projectTable.crawlSuspendedUntil,
        })
        .from(projectTable)
        .where(eq(projectTable.id, projectId))
        .limit(1)
        .then((rows) => rows[0])
    : undefined

  if (health?.suspendedUntil && health.suspendedUntil > now) {
    throw new CrawlSuspendedError(url, health.suspendedUntil)
  }

  let result: CrawlResult
  try {
    result = await crawlUrl(url, options)
  } catch (error) {
    if (projectId && !(error instanceof CrawlSuspendedError)) {
      await recordProjectCrawlFailure(projectId, error, now)
    }
    throw error
  }

  if (projectId && health && (health.failureCount > 0 || health.suspendedUntil)) {
    await db
      .update(projectTable)
      .set({
        crawlFailureCount: 0,
        crawlLastFailedAt: null,
        crawlSuspendedUntil: null,
        crawlLastError: null,
      })
      .where(eq(projectTable.id, projectId))
  }

  const id = crypto.randomUUID()
  const expiresAt = addDays(now, ttlDays)
  const contentHash = await hashContent(result.markdown)

  await db
    .insert(crawledData)
    .values({
      id,
      url,
      projectId,
      content: result.markdown,
      contentHash,
      crawledAt: result.crawledAt,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: crawledData.url,
      set: {
        content: result.markdown,
        contentHash,
        crawledAt: result.crawledAt,
        expiresAt,
        projectId,
        updatedAt: now,
      },
    })

  return result
}

async function recordProjectCrawlFailure(
  projectId: string,
  error: unknown,
  now: Date,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const policy = crawlFailurePolicy(message, now)

  try {
    await db
      .update(projectTable)
      .set({
        crawlFailureCount: sql`${projectTable.crawlFailureCount} + 1`,
        crawlLastFailedAt: now,
        crawlSuspendedUntil: policy.suspendedUntil,
        crawlLastError: message.slice(0, 500),
      })
      .where(eq(projectTable.id, projectId))
    console.warn(
      `[crawl-circuit] project=${projectId} kind=${policy.kind} suspendedUntil=${policy.suspendedUntil.toISOString()}`,
    )
  } catch (recordError) {
    // Crawl failure remains authoritative. Observability writes must never
    // replace it with a secondary database error.
    console.error("[crawl-circuit] failed to persist project crawl failure:", recordError)
  }
}

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ─── Crawl4AI legacy backend ─────────────────────────────────────────────────
// Kept inline for the rollout window. After Tinyfish is validated in prod we
// can delete this block plus the CRAWL4AI_URL / CRAWL4AI_API_TOKEN env vars.

export async function crawl4aiCrawl(url: string, options?: CrawlOptions): Promise<CrawlResult> {
  // Read env at call time so ops can flip keys without a redeploy and tests
  // can swap with vi.stubEnv.
  const baseUrl = process.env.CRAWL4AI_URL
  const apiToken = process.env.CRAWL4AI_API_TOKEN

  if (!baseUrl) {
    throw new CrawlError(url, "CRAWL4AI_URL environment variable is not set")
  }

  const timeout = options?.timeout ?? 60_000
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiToken) headers["Authorization"] = `Bearer ${apiToken}`

  try {
    // Non-aborting timeout — see lib/fetch-timeout.ts for why abort corrupts.
    const submitResponse = await fetchWithTimeout(
      `${baseUrl}/crawl`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ urls: [url], word_count_threshold: 10, bypass_cache: false }),
      },
      timeout,
      `crawl4ai submit ${url}`,
    )

    if (!submitResponse.ok) {
      const errorBody = await withTimeout(
        submitResponse.text(),
        timeout,
        `crawl4ai submit ${url}`,
      ).catch(() => "")
      throw new CrawlError(url, `API returned ${submitResponse.status}: ${errorBody}`)
    }

    const submitData = await withTimeout(submitResponse.json(), timeout, `crawl4ai submit ${url}`)
    const taskId = submitData.task_id

    if (!taskId) {
      const result = submitData.results?.[0] || submitData
      if (result.markdown || result.extracted_content) {
        const md = result.markdown
        const markdownStr =
          typeof md === "string"
            ? md
            : md?.raw_markdown || md?.fit_markdown || result.extracted_content || ""
        return { url, markdown: markdownStr, title: result.metadata?.title, crawledAt: new Date() }
      }
      throw new CrawlError(url, "No task_id or result in response")
    }

    const startTime = Date.now()
    const pollInterval = 2_000
    while (Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval))
      const statusResponse = await fetchWithTimeout(
        `${baseUrl}/task/${taskId}`,
        { headers },
        10_000,
        `crawl4ai status ${taskId}`,
      )
      if (!statusResponse.ok) {
        // Drain the body before the next poll. Abandoning it leaves undici
        // streams dangling across up to ~30 iterations; cancelling corrupts
        // the process-wide stream pool (see safe-fetch.ts). Consuming is the
        // clean path that lets undici recycle the connection.
        await withTimeout(statusResponse.text(), 10_000, `crawl4ai status ${taskId}`).catch(
          () => {},
        )
        continue
      }
      const statusData = await withTimeout(
        statusResponse.json(),
        10_000,
        `crawl4ai status ${taskId}`,
      )
      if (statusData.status === "completed") {
        const result = statusData.results?.[0] || statusData.result || statusData
        const md = result.markdown
        const markdownStr =
          typeof md === "string"
            ? md
            : md?.raw_markdown || md?.fit_markdown || result.extracted_content || ""
        return { url, markdown: markdownStr, title: result.metadata?.title, crawledAt: new Date() }
      }
      if (statusData.status === "failed") {
        throw new CrawlError(url, `Task failed: ${statusData.error || "unknown error"}`)
      }
    }
    throw new CrawlError(url, `Timeout after ${timeout}ms`)
  } catch (error) {
    if (error instanceof CrawlError) throw error
    throw new CrawlError(url, error instanceof Error ? error.message : String(error))
  }
}
