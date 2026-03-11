/**
 * Crawl4AI HTTP Client
 * Communicates with an independent Crawl4AI API service to crawl website content.
 */

import { db } from "@/drizzle/db"
import { crawledData } from "@/drizzle/db/schema"
import { addDays } from "date-fns"
import { and, eq, gt } from "drizzle-orm"

const CRAWL4AI_BASE_URL = process.env.CRAWL4AI_URL
const CRAWL4AI_API_TOKEN = process.env.CRAWL4AI_API_TOKEN

export class CrawlError extends Error {
  constructor(
    public url: string,
    message: string,
  ) {
    super(`CrawlError [${url}]: ${message}`)
    this.name = "CrawlError"
  }
}

export interface CrawlResult {
  url: string
  markdown: string
  title?: string
  crawledAt: Date
}

interface CrawlOptions {
  timeout?: number // ms, default 60000
}

/**
 * Crawl a single URL via Crawl4AI API and return markdown content.
 */
export async function crawlUrl(url: string, options?: CrawlOptions): Promise<CrawlResult> {
  if (!CRAWL4AI_BASE_URL) {
    throw new CrawlError(url, "CRAWL4AI_URL environment variable is not set")
  }

  const timeout = options?.timeout ?? 60000

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (CRAWL4AI_API_TOKEN) {
    headers["Authorization"] = `Bearer ${CRAWL4AI_API_TOKEN}`
  }

  try {
    // Submit crawl task
    const submitResponse = await fetch(`${CRAWL4AI_BASE_URL}/crawl`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        urls: [url],
        word_count_threshold: 10,
        bypass_cache: false,
      }),
      signal: AbortSignal.timeout(timeout),
    })

    if (!submitResponse.ok) {
      const errorBody = await submitResponse.text().catch(() => "")
      throw new CrawlError(url, `API returned ${submitResponse.status}: ${errorBody}`)
    }

    const submitData = await submitResponse.json()
    const taskId = submitData.task_id

    if (!taskId) {
      // Synchronous response — some Crawl4AI versions return result directly
      const result = submitData.results?.[0] || submitData
      if (result.markdown || result.extracted_content) {
        return {
          url,
          markdown: result.markdown || result.extracted_content || "",
          title: result.metadata?.title,
          crawledAt: new Date(),
        }
      }
      throw new CrawlError(url, "No task_id or result in response")
    }

    // Poll for async task completion
    const startTime = Date.now()
    const pollInterval = 2000
    while (Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval))

      const statusResponse = await fetch(`${CRAWL4AI_BASE_URL}/task/${taskId}`, {
        headers,
        signal: AbortSignal.timeout(10000),
      })

      if (!statusResponse.ok) continue

      const statusData = await statusResponse.json()

      if (statusData.status === "completed") {
        const result = statusData.results?.[0] || statusData.result || statusData
        return {
          url,
          markdown: result.markdown || result.extracted_content || "",
          title: result.metadata?.title,
          crawledAt: new Date(),
        }
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

/**
 * Get cached crawl data or crawl fresh. Upserts result into crawled_data table.
 */
export async function getCachedOrCrawl(
  projectId: string | null,
  url: string,
  ttlDays = 7,
): Promise<CrawlResult> {
  const now = new Date()

  // Check cache
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

  // Crawl fresh
  const result = await crawlUrl(url)
  const id = crypto.randomUUID()
  const expiresAt = addDays(now, ttlDays)

  // Upsert
  await db
    .insert(crawledData)
    .values({
      id,
      url,
      projectId,
      content: result.markdown,
      contentHash: await hashContent(result.markdown),
      crawledAt: result.crawledAt,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: crawledData.url,
      set: {
        content: result.markdown,
        contentHash: await hashContent(result.markdown),
        crawledAt: result.crawledAt,
        expiresAt,
        projectId,
        updatedAt: now,
      },
    })

  return result
}

/**
 * Simple content hash for change detection.
 */
async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}
