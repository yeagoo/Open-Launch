/**
 * AI Content Generation using DeepSeek API
 * Generates structured content for tag moderation, comparisons, and alternatives.
 * Follows the same DeepSeek API pattern as lib/ai-comment.ts
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TagModerationResult {
  verdict: "approved" | "flagged" | "deleted"
  reason?: string
}

export interface ComparisonContent {
  title: string
  metaTitle: string
  metaDescription: string
  rawMarkdown: string
  structuredData: {
    features: Array<{ feature: string; projectA: string; projectB: string }>
    pricingA: string
    pricingB: string
    prosA: string[]
    consA: string[]
    prosB: string[]
    consB: string[]
    verdict: string
  }
}

export interface AlternativeAnalysis {
  isAlternative: boolean
  confidenceScore: number
  pros: string[]
  cons: string[]
  useCases: string
}

export interface AlternativesPageContent {
  title: string
  metaTitle: string
  metaDescription: string
  rawMarkdown: string
}

// ─── Core DeepSeek call ──────────────────────────────────────────────────────

async function callDeepSeek(
  systemPrompt: string,
  userPrompt: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL || "deepseek-chat"

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY environment variable is not set")
  }

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 2000,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`DeepSeek API error: ${response.status} ${JSON.stringify(errorData)}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error("No content generated from DeepSeek API")
  }

  return content
}

/**
 * Extract JSON from a response that may contain markdown code blocks.
 */
function extractJson(text: string): string {
  const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim()
  }
  return text.trim()
}

/**
 * Truncate content to a max character length, keeping the beginning.
 */
function truncateContent(content: string, maxChars = 8000): string {
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + "\n\n[Content truncated...]"
}

// ─── Tag Moderation ──────────────────────────────────────────────────────────

export async function moderateTags(tagNames: string[]): Promise<TagModerationResult[]> {
  if (tagNames.length === 0) return []

  const systemPrompt = `You are a content moderation system. Review the following tags for harmful content.

Flag or delete tags that contain:
- Political content (political parties, politicians, political movements)
- Geopolitical content (territorial disputes, sanctions, political conflicts between nations)
- War-related content (military operations, war propaganda, glorification of violence)
- Religious content that is hateful, divisive, or inflammatory
- Hate speech, slurs, or discriminatory language
- Explicit/sexual content
- Spam or clearly meaningless tags

Rules:
- "deleted": Clearly harmful, malicious, hateful, or spam content
- "flagged": Uncertain — could be borderline, needs human review
- "approved": Normal tech/product/topic tags

Return a JSON array with one object per tag: { "tag": "tag-name", "verdict": "approved|flagged|deleted", "reason": "brief reason if flagged or deleted" }
Return ONLY the JSON array, no other text.`

  const userPrompt = `Review these tags:\n${tagNames.map((t) => `- ${t}`).join("\n")}`

  try {
    const raw = await callDeepSeek(systemPrompt, userPrompt, {
      temperature: 0.1,
      maxTokens: tagNames.length * 80,
    })

    const parsed = JSON.parse(extractJson(raw)) as Array<{
      tag: string
      verdict: string
      reason?: string
    }>

    // Map results back by tag name order
    return tagNames.map((name) => {
      const found = parsed.find((r) => r.tag.toLowerCase() === name.toLowerCase())
      if (!found)
        return {
          verdict: "flagged" as const,
          reason: "Not matched in AI response — flagged for manual review",
        }
      return {
        verdict: (["approved", "flagged", "deleted"].includes(found.verdict)
          ? found.verdict
          : "approved") as "approved" | "flagged" | "deleted",
        reason: found.reason,
      }
    })
  } catch (error) {
    console.error("Tag moderation error:", error)
    // On failure, flag all for human review — safer than auto-approving
    return tagNames.map(() => ({
      verdict: "flagged" as const,
      reason: "AI moderation unavailable — flagged for manual review",
    }))
  }
}

// ─── Comparison Content Generation ───────────────────────────────────────────

export async function generateComparisonContent(
  projectA: { name: string; description: string; crawledMarkdown: string },
  projectB: { name: string; description: string; crawledMarkdown: string },
): Promise<ComparisonContent> {
  const systemPrompt = `You are a tech product analyst. Generate a detailed comparison between two products.

Return a JSON object with this exact structure:
{
  "title": "Product A vs Product B: Detailed Comparison",
  "metaTitle": "Product A vs Product B - Which Is Better? [Current Year]",
  "metaDescription": "Compare Product A and Product B. See features, pricing, pros and cons to find the best fit for your needs.",
  "features": [
    { "feature": "Feature Name", "projectA": "How A handles it", "projectB": "How B handles it" }
  ],
  "pricingA": "Brief pricing description for A",
  "pricingB": "Brief pricing description for B",
  "prosA": ["pro1", "pro2", "pro3"],
  "consA": ["con1", "con2"],
  "prosB": ["pro1", "pro2", "pro3"],
  "consB": ["con1", "con2"],
  "verdict": "A balanced 2-3 sentence conclusion about when to use each product.",
  "rawMarkdown": "Full article as markdown. Include: ## Overview, ## Feature Comparison, ## Pricing, ## Pros and Cons, ## Verdict sections. Use tables where appropriate. 800-1500 words."
}

Return ONLY the JSON object, no other text.`

  const userPrompt = `Compare these two products:

## Product A: ${projectA.name}
Description: ${projectA.description}
Website Content:
${truncateContent(projectA.crawledMarkdown)}

## Product B: ${projectB.name}
Description: ${projectB.description}
Website Content:
${truncateContent(projectB.crawledMarkdown)}`

  const raw = await callDeepSeek(systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens: 4000,
  })

  const parsed = JSON.parse(extractJson(raw))

  return {
    title: parsed.title,
    metaTitle: parsed.metaTitle,
    metaDescription: parsed.metaDescription,
    rawMarkdown: parsed.rawMarkdown,
    structuredData: {
      features: parsed.features || [],
      pricingA: parsed.pricingA || "",
      pricingB: parsed.pricingB || "",
      prosA: parsed.prosA || [],
      consA: parsed.consA || [],
      prosB: parsed.prosB || [],
      consB: parsed.consB || [],
      verdict: parsed.verdict || "",
    },
  }
}

// ─── Alternative Analysis ────────────────────────────────────────────────────

export async function analyzeAlternative(
  subjectProject: {
    name: string
    description: string
    crawledMarkdown: string
  },
  candidateProject: {
    name: string
    description: string
    crawledMarkdown: string
  },
): Promise<AlternativeAnalysis> {
  const systemPrompt = `You are a tech product analyst. Determine if the candidate product is a genuine alternative to the subject product.

Two products are alternatives if they serve the same primary use case and a user could reasonably switch from one to the other.

Return a JSON object:
{
  "isAlternative": true/false,
  "confidenceScore": 0-100,
  "pros": ["advantage of candidate over subject", ...],
  "cons": ["disadvantage of candidate compared to subject", ...],
  "useCases": "Brief description of when someone would choose the candidate instead."
}

Return ONLY the JSON object, no other text.`

  const userPrompt = `Subject Product: ${subjectProject.name}
Description: ${subjectProject.description}
Website: ${truncateContent(subjectProject.crawledMarkdown, 4000)}

Candidate Alternative: ${candidateProject.name}
Description: ${candidateProject.description}
Website: ${truncateContent(candidateProject.crawledMarkdown, 4000)}`

  try {
    const raw = await callDeepSeek(systemPrompt, userPrompt, {
      temperature: 0.2,
      maxTokens: 500,
    })

    const parsed = JSON.parse(extractJson(raw))

    return {
      isAlternative: !!parsed.isAlternative,
      confidenceScore: Math.min(100, Math.max(0, parsed.confidenceScore || 0)),
      pros: parsed.pros || [],
      cons: parsed.cons || [],
      useCases: parsed.useCases || "",
    }
  } catch (error) {
    console.error(`Alternative analysis error for ${candidateProject.name}:`, error)
    return {
      isAlternative: false,
      confidenceScore: 0,
      pros: [],
      cons: [],
      useCases: "",
    }
  }
}

// ─── Alternatives Page Content ───────────────────────────────────────────────

export async function generateAlternativesPageContent(
  subjectProject: { name: string; description: string },
  alternatives: Array<{
    name: string
    score: number
    pros: string[]
    cons: string[]
    useCases: string
  }>,
): Promise<AlternativesPageContent> {
  const systemPrompt = `You are a tech product analyst. Generate an overview page for alternatives to a product.

Return a JSON object:
{
  "title": "Best [Product Name] Alternatives in [Current Year]",
  "metaTitle": "Top X [Product Name] Alternatives & Competitors [Current Year]",
  "metaDescription": "Looking for [Product Name] alternatives? Compare the top X competitors...",
  "rawMarkdown": "Full markdown article. Include: ## Overview of [Product], ## Why Look for Alternatives, ## Top Alternatives (numbered list with brief descriptions), ## How to Choose. 600-1000 words."
}

Return ONLY the JSON object, no other text.`

  const altList = alternatives
    .map(
      (a) =>
        `- ${a.name} (score: ${a.score}/100): Pros: ${a.pros.join(", ")}. Cons: ${a.cons.join(", ")}. Use cases: ${a.useCases}`,
    )
    .join("\n")

  const userPrompt = `Product: ${subjectProject.name}
Description: ${subjectProject.description}

Alternatives found:
${altList}`

  const raw = await callDeepSeek(systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens: 3000,
  })

  const parsed = JSON.parse(extractJson(raw))

  return {
    title: parsed.title,
    metaTitle: parsed.metaTitle,
    metaDescription: parsed.metaDescription,
    rawMarkdown: parsed.rawMarkdown,
  }
}
