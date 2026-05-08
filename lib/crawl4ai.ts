/**
 * Crawler entry point.
 *
 * Routes `crawlUrl` to one of two backends based on the CRAWLER env var:
 *   - "crawl4ai" (default) — self-hosted Crawl4AI service (legacy)
 *   - "tinyfish"            — hosted Tinyfish Fetch API, free tier, 25 URLs/min
 *
 * Default stays on crawl4ai during the rollout window so deployment is a
 * pure no-op until ops flips CRAWLER=tinyfish in Zeabur. After Tinyfish is
 * validated in prod we swap the default and delete the crawl4ai branch.
 *
 * The cache layer (`getCachedOrCrawl` + `crawled_data` table) is unchanged
 * and works with either backend. Filename kept as `crawl4ai.ts` so the four
 * existing callers don't need touching during the rollout.
 */

import { db } from "@/drizzle/db"
import { crawledData } from "@/drizzle/db/schema"
import { addDays } from "date-fns"
import { and, eq, gt } from "drizzle-orm"

import { CrawlError, type CrawlOptions, type CrawlResult } from "./crawler-types"
import { tinyfishCrawl } from "./tinyfish"

export { CrawlError, type CrawlOptions, type CrawlResult }

type Backend = "tinyfish" | "crawl4ai"

function activeBackend(): Backend {
  const value = (process.env.CRAWLER ?? "crawl4ai").toLowerCase()
  return value === "tinyfish" ? "tinyfish" : "crawl4ai"
}

export async function crawlUrl(url: string, options?: CrawlOptions): Promise<CrawlResult> {
  if (activeBackend() === "crawl4ai") return crawl4aiCrawl(url, options)
  return tinyfishCrawl(url, options)
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

  const result = await crawlUrl(url, options)
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
    const submitResponse = await fetch(`${baseUrl}/crawl`, {
      method: "POST",
      headers,
      body: JSON.stringify({ urls: [url], word_count_threshold: 10, bypass_cache: false }),
      signal: AbortSignal.timeout(timeout),
    })

    if (!submitResponse.ok) {
      const errorBody = await submitResponse.text().catch(() => "")
      throw new CrawlError(url, `API returned ${submitResponse.status}: ${errorBody}`)
    }

    const submitData = await submitResponse.json()
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
      const statusResponse = await fetch(`${baseUrl}/task/${taskId}`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
      if (!statusResponse.ok) continue
      const statusData = await statusResponse.json()
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
