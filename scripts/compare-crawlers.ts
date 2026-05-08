/**
 * Side-by-side compare Tinyfish vs Crawl4AI on real project URLs.
 *
 * Picks N URLs from `crawled_data` (most recently crawled first), hits both
 * backends fresh (bypasses the cache), writes outputs to /tmp/crawl-compare/
 * and prints a summary table.
 *
 * Usage:
 *   bun run scripts/compare-crawlers.ts            # 10 URLs
 *   bun run scripts/compare-crawlers.ts 5          # 5 URLs
 *   bun run scripts/compare-crawlers.ts 10 https://example.com  # plus a specific URL
 *
 * Reads CRAWL4AI_URL / CRAWL4AI_API_TOKEN / TINYFISH_API_KEY from env.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { db } from "@/drizzle/db"
import { crawledData } from "@/drizzle/db/schema"
import { desc } from "drizzle-orm"

import { crawl4aiCrawl, CrawlError, type CrawlResult } from "@/lib/crawl4ai"
import { tinyfishCrawl } from "@/lib/tinyfish"

const OUT_DIR = "/tmp/crawl-compare"

interface BackendOutcome {
  ok: boolean
  durationMs: number
  length: number
  title?: string
  error?: string
}

async function timed(fn: () => Promise<CrawlResult>): Promise<BackendOutcome> {
  const start = Date.now()
  try {
    const r = await fn()
    return {
      ok: true,
      durationMs: Date.now() - start,
      length: r.markdown.length,
      title: r.title,
    }
  } catch (err) {
    return {
      ok: false,
      durationMs: Date.now() - start,
      length: 0,
      error: err instanceof CrawlError ? err.message : String(err),
    }
  }
}

function slugify(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9-]+/gi, "_")
    .slice(0, 80)
}

async function writeOutput(slug: string, backend: string, content: string) {
  const path = join(OUT_DIR, `${slug}.${backend}.md`)
  await writeFile(path, content, "utf8")
  return path
}

async function main() {
  const limit = Number(process.argv[2] ?? "10")
  const extra = process.argv[3]

  await mkdir(OUT_DIR, { recursive: true })

  const rows = await db
    .select({ url: crawledData.url })
    .from(crawledData)
    .orderBy(desc(crawledData.crawledAt))
    .limit(limit)

  const urls = rows.map((r) => r.url)
  if (extra) urls.push(extra)

  console.log(`Comparing ${urls.length} URLs. Output: ${OUT_DIR}\n`)

  type Row = { url: string; tf: BackendOutcome; c4: BackendOutcome }
  const results: Row[] = []

  for (const url of urls) {
    const slug = slugify(url)
    process.stdout.write(`  ${url} ... `)

    const [tf, c4] = await Promise.all([
      timed(async () => {
        const r = await tinyfishCrawl(url)
        await writeOutput(slug, "tinyfish", r.markdown)
        return r
      }),
      timed(async () => {
        const r = await crawl4aiCrawl(url)
        await writeOutput(slug, "crawl4ai", r.markdown)
        return r
      }),
    ])

    process.stdout.write(
      `tf=${tf.ok ? `${tf.length}B/${tf.durationMs}ms` : "ERR"}  c4=${
        c4.ok ? `${c4.length}B/${c4.durationMs}ms` : "ERR"
      }\n`,
    )
    results.push({ url, tf, c4 })
  }

  console.log("\n─── Summary ────────────────────────────────────────────────")
  console.log(
    "URL                                                tf bytes  c4 bytes   ratio   tf ms   c4 ms",
  )
  for (const r of results) {
    const ratio = r.tf.ok && r.c4.ok ? (r.tf.length / r.c4.length).toFixed(2) : "—"
    const url = r.url.slice(0, 50).padEnd(50)
    const tfBytes = r.tf.ok ? String(r.tf.length).padStart(8) : "    ERR "
    const c4Bytes = r.c4.ok ? String(r.c4.length).padStart(8) : "    ERR "
    console.log(
      `${url}  ${tfBytes}  ${c4Bytes}  ${ratio.padStart(5)}  ${String(r.tf.durationMs).padStart(5)}  ${String(r.c4.durationMs).padStart(5)}`,
    )
  }

  const tfErrors = results.filter((r) => !r.tf.ok)
  const c4Errors = results.filter((r) => !r.c4.ok)
  if (tfErrors.length || c4Errors.length) {
    console.log("\n─── Errors ────────────────────────────────────────────────")
    for (const r of tfErrors) console.log(`  tinyfish  ${r.url}: ${r.tf.error}`)
    for (const r of c4Errors) console.log(`  crawl4ai  ${r.url}: ${r.c4.error}`)
  }

  console.log(`\nMarkdown files written to ${OUT_DIR}. Diff a few side-by-side:`)
  if (results.length > 0) {
    const exampleSlug = slugify(results[0].url)
    console.log(
      `  diff ${OUT_DIR}/${exampleSlug}.tinyfish.md ${OUT_DIR}/${exampleSlug}.crawl4ai.md`,
    )
  }

  process.exit(0)
}

main().catch((err) => {
  console.error("compare-crawlers failed:", err)
  process.exit(1)
})
