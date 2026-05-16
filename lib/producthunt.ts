/**
 * ProductHunt API Client
 * 用于获取每日 Top 5 产品
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"

// Hoisted out of curlHead so a 195-record backfill doesn't re-allocate
// the promisified wrapper on every call.
const execFileAsync = promisify(execFile)

/**
 * Returns the UTC instants for 00:00:00 and 23:59:59.999 on the current
 * calendar day in America/Los_Angeles, honoring DST automatically.
 *
 * Implementation: ask Intl.DateTimeFormat for the PT date components,
 * then ask the same formatter for the same instant's hour/minute to
 * derive the live UTC offset. Avoids hand-rolling DST rules.
 */
function ptDayBoundsUtc(now: Date): { todayStart: Date; todayEnd: Date } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value)
  const ptYear = get("year")
  const ptMonth = get("month") // 1-based
  const ptDay = get("day")
  const ptHour = get("hour") % 24 // Intl can emit 24 for midnight on some engines
  const ptMinute = get("minute")
  const ptSecond = get("second")

  // Reconstruct what UTC ms the formatter THINKS we have, then subtract
  // from the real UTC ms to get the live PT→UTC offset (in minutes,
  // positive for behind-UTC zones like PT).
  const ptAsUtcMs = Date.UTC(ptYear, ptMonth - 1, ptDay, ptHour, ptMinute, ptSecond)
  const offsetMinutes = Math.round((now.getTime() - ptAsUtcMs) / 60_000)

  const todayStart = new Date(Date.UTC(ptYear, ptMonth - 1, ptDay) + offsetMinutes * 60_000)
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1)
  return { todayStart, todayEnd }
}

export interface ProductHuntTopic {
  name: string
}

export interface ProductHuntPost {
  id: string
  name: string
  tagline: string
  description: string
  url: string
  votesCount: number
  website: string
  thumbnail?: {
    url: string
  }
  screenshotUrl?: string // 新增：产品截图
  topics: ProductHuntTopic[]
}

interface ProductHuntResponse {
  data: {
    posts: {
      edges: Array<{
        node: {
          id: string
          name: string
          tagline: string
          description: string
          url: string
          votesCount: number
          website: string
          thumbnail?: { url: string }
          media: Array<{
            url: string
            type: string
          }>
          topics: {
            edges: Array<{
              node: { name: string }
            }>
          }
        }
      }>
    }
  }
}

/**
 * 获取当日 Top 5 产品
 */
export async function getTop5Posts(): Promise<ProductHuntPost[]> {
  const apiKey = process.env.PRODUCTHUNT_API_KEY

  if (!apiKey) {
    throw new Error("PRODUCTHUNT_API_KEY is not configured")
  }

  // 获取 ProductHunt 的"今日"（基于太平洋时间)。
  // ProductHunt 的一天从太平洋时间 00:00 开始,实际帖子在 00:01 PT 上线。
  //
  // 之前用硬编码 8h (PST) 偏移忽略 DST,在 PDT (3–11 月) 期间窗口整体晚 1h,
  // 正好把 00:01 PDT (= 07:01 UTC) 上线的帖子全部漏掉 → 2026-03-08 美国切 PDT
  // 后每天 0 条。改用 ptDayBoundsUtc() 通过 Intl tzdata 计算真实 PT 日历日,
  // DST 自动处理。
  const now = new Date()
  const { todayStart, todayEnd } = ptDayBoundsUtc(now)

  const postedAfter = todayStart.toISOString()
  const postedBefore = todayEnd.toISOString()

  // Randomize the daily import count so the catalogue doesn't grow at a
  // suspiciously fixed cadence. 7-10 inclusive — small enough to stay
  // within PH API limits, large enough to keep the feed lively.
  const dailyImportCount = 7 + Math.floor(Math.random() * 4)

  console.log(`📅 Fetching ProductHunt posts (Pacific Time)`)
  console.log(`   From:  ${postedAfter}`)
  console.log(`   To:    ${postedBefore}`)
  console.log(`   Count: ${dailyImportCount}`)

  const query = `
    query {
      posts(
        order: VOTES
        first: ${dailyImportCount}
        postedAfter: "${postedAfter}"
        postedBefore: "${postedBefore}"
      ) {
        edges {
          node {
            id
            name
            tagline
            description
            url
            votesCount
            website
            thumbnail {
              url
            }
            media {
              url
              type
            }
            topics {
              edges {
                node {
                  name
                }
              }
            }
          }
        }
      }
    }
  `

  try {
    const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`ProductHunt API error: ${response.status} - ${errorText}`)
    }

    const data: ProductHuntResponse = await response.json()

    if (!data.data || !data.data.posts) {
      throw new Error("Invalid response from ProductHunt API")
    }

    return data.data.posts.edges.map((edge) => ({
      id: edge.node.id,
      name: edge.node.name,
      tagline: edge.node.tagline,
      description: edge.node.description,
      url: edge.node.url,
      votesCount: edge.node.votesCount,
      website: edge.node.website,
      thumbnail: edge.node.thumbnail,
      screenshotUrl: edge.node.media.find((m) => m.type === "image")?.url, // 提取第一张图片
      topics: edge.node.topics.edges.map((topicEdge) => ({
        name: topicEdge.node.name,
      })),
    }))
  } catch (error) {
    console.error("❌ Failed to fetch ProductHunt posts:", error)
    throw error
  }
}

/**
 * 生成项目 slug
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100) // 限制长度
}

/**
 * 清理描述并转换为 HTML 格式（用于 RichTextEditor）
 * - 移除图片、去除 HTML 标签
 * - 将段落换行转换为 <p> 标签
 * - 将 **bold** Markdown 转换为 <strong>
 */
export function cleanDescription(description: string): string {
  let cleaned = description

  // 1. 移除 Markdown 图片语法: ![alt](url)
  cleaned = cleaned.replace(/!\[([^\]]*)\]\([^\)]+\)/g, "")

  // 2. 移除 HTML 图片标签
  cleaned = cleaned.replace(/<img[^>]*>/gi, "")

  // 3. 移除所有 HTML 标签，保留文本内容
  cleaned = cleaned.replace(/<[^>]+>/g, "")

  // 4. 转换 **bold** → <strong>bold</strong>
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")

  // 5. 按段落分割，包裹 <p> 标签
  const paragraphs = cleaned
    .split(/\n{2,}/)
    .map((p) =>
      p
        .replace(/\n/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim(),
    )
    .filter((p) => p.length > 0)

  if (paragraphs.length === 0) return ""

  return paragraphs.map((p) => `<p>${p}</p>`).join("")
}

/**
 * 提取标签（从 topics 转换为 tags 数组）
 */
export function extractTags(topics: ProductHuntTopic[]): string[] {
  return topics.slice(0, 10).map((topic) => topic.name) // 最多取 10 个标签
}

/**
 * ProductHunt topic 名称 → 平台 category ID 映射表
 */
const TOPIC_TO_CATEGORY: Record<string, string> = {
  // AI & ML
  "Artificial Intelligence": "ai",
  "AI Assistant": "ai",
  "Generative AI": "ai",
  ChatGPT: "ai",
  "Machine Learning": "machine-learning",
  "Natural Language Processing": "nlp",
  "Computer Vision": "machine-learning",

  // Developer Tools
  "Developer Tools": "developer-tools",
  GitHub: "developer-tools",
  API: "api",
  APIs: "api",
  "Open Source": "open-source",
  "Web Development": "web-dev",
  "Web App": "web-dev",
  JavaScript: "web-dev",
  Mobile: "mobile-dev",
  iOS: "mobile-dev",
  Android: "mobile-dev",
  "React Native": "mobile-dev",
  DevOps: "devops",
  "Cloud Computing": "devops",
  Databases: "databases",
  Testing: "testing-qa",
  "No Code": "cms",
  "No-Code": "cms",
  WordPress: "cms",
  Serverless: "serverless",
  Security: "security",
  Cybersecurity: "security",

  // Design
  "Design Tools": "design-tools",
  Figma: "design-tools",
  UX: "ui-ux",
  UI: "ui-ux",
  Prototyping: "prototyping",
  Graphics: "graphics",

  // Business
  SaaS: "saas",
  Marketing: "marketing-tools",
  "Email Marketing": "marketing-tools",
  SEO: "marketing-tools",
  "Social Media": "marketing-tools",
  Sales: "sales-tools",
  CRM: "sales-tools",
  Productivity: "productivity",
  "Task Management": "productivity",
  "Project Management": "productivity",
  Finance: "finance-tech",
  Fintech: "finance-tech",
  Payments: "finance-tech",
  "E-Commerce": "ecommerce",
  Ecommerce: "ecommerce",
  Analytics: "analytics",
  "Business Intelligence": "analytics",
  "Data Visualization": "data-science",
  "Data Science": "data-science",

  // Niche
  Blockchain: "blockchain",
  Crypto: "blockchain",
  Web3: "blockchain",
  AR: "ar-vr",
  VR: "ar-vr",
  Gaming: "gaming",
  Education: "edtech",
  EdTech: "edtech",
  Health: "healthtech",
  HealthTech: "healthtech",
  Fitness: "healthtech",
  "Green Tech": "greentech",
  Sustainability: "greentech",
  IoT: "iot",
  Hardware: "hardware",
  Wearables: "wearables",
  Robotics: "robotics",
}

/**
 * 从 ProductHunt topics 中提取匹配的平台 category IDs
 */
export function extractCategoryIds(topics: ProductHuntTopic[]): string[] {
  const ids = new Set<string>()
  for (const topic of topics) {
    const categoryId = TOPIC_TO_CATEGORY[topic.name]
    if (categoryId) ids.add(categoryId)
  }
  return Array.from(ids).slice(0, 3) // 最多 3 个分类
}

/**
 * 清理 URL 中的跟踪参数
 */
function cleanTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url)

    // 要移除的参数列表
    const paramsToRemove = [
      "ref",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
    ]

    paramsToRemove.forEach((param) => {
      urlObj.searchParams.delete(param)
    })

    return urlObj.toString()
  } catch {
    return url
  }
}

// Browser UA — alone not enough to bypass PH's Cloudflare, but required
// to avoid the obvious-bot rejection.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const RESOLVE_TIMEOUT_MS = 15_000
const MAX_REDIRECT_HOPS = 3

// Probe curl on first use. If the container doesn't ship curl (e.g.
// alpine without it installed) we want a loud failure on the first
// import so ops sees it in container start logs, instead of every PH
// import silently being skipped via the catch in curlHead. Cached so
// subsequent calls don't re-probe.
let curlAvailable: boolean | null = null
async function ensureCurlAvailable(): Promise<boolean> {
  if (curlAvailable !== null) return curlAvailable
  try {
    await execFileAsync("curl", ["--version"], { timeout: 5_000 })
    curlAvailable = true
  } catch (err) {
    curlAvailable = false
    console.error(
      "❌ curl is not installed in this container. PH /r/ URL resolution will fail. " +
        "Install curl in the deploy image (apt-get install curl on Debian, apk add curl on Alpine). " +
        "Underlying error:",
      err instanceof Error ? err.message : String(err),
    )
  }
  return curlAvailable
}

/**
 * Resolve a ProductHunt /r/ outbound-tracker URL to its real destination.
 *
 * PH's /r/ endpoint is behind Cloudflare's managed challenge which
 * fingerprints HTTP/2 frame ordering and TLS handshake — not just UA.
 * Bun's fetch, Node's undici, and even Tinyfish's real-browser fetch
 * all get a 403 / bot_blocked. The one tool that consistently passes
 * is curl, which speaks HTTP/2 with a different fingerprint. So we
 * shell out to it.
 *
 * Returns the cleaned destination URL on success, or `null` if curl
 * fails, the response isn't a 3xx, or the chain ends back on
 * producthunt.com (broken /r/ link). Callers should treat null as
 * "skip this project" — storing the /r/ URL caused 195 broken records
 * that no downstream crawler could reach.
 *
 * Non-/r/ URLs are returned as-is (with tracking params stripped).
 */
export async function getRealWebsiteUrl(websiteUrl: string): Promise<string | null> {
  // Not a PH wrapper URL — strip tracking params and return.
  if (!websiteUrl.includes("producthunt.com/r/")) {
    return cleanTrackingParams(websiteUrl)
  }

  if (!(await ensureCurlAvailable())) return null

  let current = websiteUrl
  for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
    const result = await curlHead(current)
    if (!result) return null
    if (result.status < 300 || result.status >= 400) {
      console.warn(`🔗 PH resolve: ${current} → HTTP ${result.status}, giving up at hop ${hop}`)
      return null
    }
    if (!result.location) {
      console.warn(`🔗 PH resolve: ${current} → 3xx with no Location header`)
      return null
    }
    if (!result.location.includes("producthunt.com")) {
      return cleanTrackingParams(result.location)
    }
    current = result.location
  }
  console.warn(`🔗 PH resolve: ${websiteUrl} → too many redirects (max ${MAX_REDIRECT_HOPS})`)
  return null
}

/**
 * One HEAD request via the `curl` CLI. Bun's fetch and Node's undici
 * both get fingerprinted by Cloudflare on PH's /r/ endpoint, but curl
 * passes — its HTTP/2 frame patterns are recognised as a real browser.
 * We parse status + Location out of curl's `-I` output.
 */
async function curlHead(url: string): Promise<{ status: number; location: string | null } | null> {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      [
        "-s",
        "-I",
        "--max-time",
        String(Math.floor(RESOLVE_TIMEOUT_MS / 1000)),
        "-H",
        `User-Agent: ${BROWSER_UA}`,
        "-H",
        "Accept: text/html,application/xhtml+xml",
        "-H",
        "Accept-Language: en-US,en;q=0.9",
        url,
      ],
      { timeout: RESOLVE_TIMEOUT_MS + 2_000 },
    )
    const lines = stdout.split(/\r?\n/)
    let status = 0
    let location: string | null = null
    for (const line of lines) {
      const httpMatch = line.match(/^HTTP\/[\d.]+\s+(\d+)/)
      if (httpMatch) {
        status = Number(httpMatch[1])
        // Defensive: reset location on each new status line in case
        // curl ever prints multiple (it shouldn't here — we don't pass
        // -L).
        location = null
        continue
      }
      const locMatch = line.match(/^location:\s*(.+)$/i)
      if (locMatch) location = locMatch[1].trim()
    }
    return { status, location }
  } catch (err) {
    console.warn(
      `🔗 curl spawn failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}
