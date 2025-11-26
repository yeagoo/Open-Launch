/**
 * AI Comment Generation using DeepSeek API
 * Generates brief, contextual comments for product launches
 */

/**
 * Generate a comment using DeepSeek API
 * @param projectTitle - The project name
 * @param projectTagline - The project tagline
 * @param projectDescription - The project description
 * @returns A brief English comment (3-20 words)
 */
export async function generateComment(
  projectTitle: string,
  projectTagline: string,
  projectDescription: string,
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat"

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY environment variable is not set")
  }

  try {
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: "system",
            content:
              "You are a tech enthusiast reviewing product launches. Write a brief, authentic comment based on the product information. Use 3-20 words only. Be positive and natural. No hashtags or emojis.",
          },
          {
            role: "user",
            content: `Product: ${projectTitle}\nTagline: ${projectTagline}\nDescription: ${projectDescription}\n\nWrite a brief comment (3-20 words):`,
          },
        ],
        temperature: 0.8,
        max_tokens: 40,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`DeepSeek API error: ${response.status} ${JSON.stringify(errorData)}`)
    }

    const data = await response.json()
    const comment = data.choices?.[0]?.message?.content?.trim()

    if (!comment) {
      throw new Error("No comment generated from DeepSeek API")
    }

    return comment
  } catch (error) {
    console.error("Error generating comment:", error)
    throw error
  }
}

/**
 * Format comment text into Fuma Comments JSON structure
 * @param text - The comment text
 * @returns JSON object compatible with Fuma Comments
 */
export function formatCommentContent(text: string): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: text,
          },
        ],
      },
    ],
  }
}
