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

  const query = `
    query {
      posts(order: VOTES, first: 5) {
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
 * 清理和格式化描述
 */
export function cleanDescription(description: string): string {
  // 移除过多的换行符
  return description.replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * 提取标签（从 topics 转换为 tags 数组）
 */
export function extractTags(topics: ProductHuntTopic[]): string[] {
  return topics.slice(0, 5).map((topic) => topic.name) // 最多取 5 个标签
}
