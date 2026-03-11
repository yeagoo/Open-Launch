/**
 * ProductHunt API Client
 * 用于获取每日 Top 5 产品
 */

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

  // 获取 ProductHunt 的"今日"（基于太平洋时间 PST/PDT，UTC-8/-7）
  // ProductHunt 的一天从太平洋时间 00:00 开始
  const now = new Date()

  // 转换为太平洋时间（简化处理：UTC-8）
  const pacificOffset = -8 * 60 // PST offset in minutes
  const pacificNow = new Date(now.getTime() + pacificOffset * 60 * 1000)

  // 太平洋时间的今日开始和结束
  const todayStart = new Date(pacificNow)
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayEnd = new Date(pacificNow)
  todayEnd.setUTCHours(23, 59, 59, 999)

  const postedAfter = todayStart.toISOString()
  const postedBefore = todayEnd.toISOString()

  console.log(`📅 Fetching ProductHunt posts (Pacific Time)`)
  console.log(`   From: ${postedAfter}`)
  console.log(`   To:   ${postedBefore}`)

  const query = `
    query {
      posts(
        order: VOTES
        first: 5
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

/**
 * 获取真实网站地址
 * ProductHunt API 返回的 website 字段是重定向链接，需要跟随重定向获取真实 URL
 * @param websiteUrl ProductHunt 返回的 website URL
 * @param fallbackUrl 失败时的回退 URL（通常是 ProductHunt 页面）
 */
export async function getRealWebsiteUrl(websiteUrl: string, fallbackUrl: string): Promise<string> {
  // 如果不是 ProductHunt 重定向链接，直接返回（但也清理参数）
  if (!websiteUrl.includes("producthunt.com/r/")) {
    return cleanTrackingParams(websiteUrl)
  }

  try {
    console.log(`🔗 Following redirect: ${websiteUrl}`)

    // 使用 HEAD 请求跟随重定向
    const response = await fetch(websiteUrl, {
      method: "HEAD",
      redirect: "manual", // 不自动跟随重定向
      headers: {
        "User-Agent": "aat.ee/1.0",
      },
      signal: AbortSignal.timeout(5000), // 5 秒超时
    })

    // 检查是否有重定向
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (location) {
        const cleanedUrl = cleanTrackingParams(location)
        console.log(`✅ Real website: ${cleanedUrl}`)
        return cleanedUrl
      }
    }

    // 如果没有重定向，返回原始 URL
    return cleanTrackingParams(websiteUrl)
  } catch (error) {
    console.error(`⚠️  Failed to get real website URL:`, error)
    // 失败时使用 fallback URL（ProductHunt 页面）
    return fallbackUrl
  }
}
