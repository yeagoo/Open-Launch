/**
 * AI quality classifier for projects.
 *
 * Output: {isLowQuality, score, reason}. Low-quality projects are excluded
 * from every AI feature on the site (bot upvotes, bot comments, long
 * descriptions, related products, comparison/alternative pages,
 * translations) and their outbound URL is rewritten through /go/[...url]
 * with noindex headers so we don't pass SEO juice to spam.
 *
 * The threshold lives here so admin code and the cron stay in sync.
 */

import { INPUT_SAFETY_BLOCK, stripHtml, wrapInput } from "@/lib/ai-input"
import { logAiUsage } from "@/lib/ai-usage"

export const LOW_QUALITY_THRESHOLD = 30

export interface QualityVerdict {
  isLowQuality: boolean
  score: number
  reason: string
}

const SYSTEM_PROMPT = `You are a strict quality reviewer for a Product Hunt-style launch directory focused on tech products, SaaS, AI tools, and developer/creator software.

Your job: read a single product submission and decide if it's low-quality content that doesn't deserve the same SEO and engagement boost as legitimate tech products.

Output a JSON object exactly:
{
  "score": 0-100 integer (higher = better quality),
  "reason": "one short sentence explaining the score, in English"
}

Score guidance — calibrate carefully, don't be trigger-happy:
- 80-100: Clear product with specific features, real value proposition, identifiable target user. Genuine tech/SaaS/AI/creator tool.
- 50-79: Adequate description, recognisable category. Maybe a bit thin but legit.
- 30-49: Borderline. Vague generic copy, unclear what the product does, or off-topic for the audience.
- 0-29: Low quality. Examples:
  • Generic spam phrasing with no specifics ("revolutionary platform", "best in class", lots of buzzwords)
  • Off-topic for tech audience: physical-goods manufacturers, dropshipping stores, real-estate listings, MLM, gambling, supplements
  • Consumer-goods aggregators / discovery sites for non-software items (watches, sneakers, art, antiques, classifieds) — even if they have a website, they're not a tech/SaaS/AI/creator product
  • Affiliate / lead-gen / link-farm patterns
  • One-sentence stub with no detail
  • Machine-translated word salad
  • Adult content, scam patterns, regulated-industry promotion outside tech context

Hard rules:
- Output ONLY the JSON object, no markdown fences, no preamble, no commentary.
- Be strict but not punitive: a small indie tool with a brief description still scores 50+ if it's clearly a real product.
- Niche-but-legit (e.g. a tool for veterinarians) is NOT low quality. Off-topic-for-this-site (e.g. a marketplace for raw cotton) IS.
- Reason must be specific to this submission, not generic.

${INPUT_SAFETY_BLOCK}`

export async function classifyProjectQuality(input: {
  name: string
  description: string
  websiteUrl?: string | null
}): Promise<QualityVerdict> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set")

  const userPrompt = `${wrapInput("name", input.name)}
${wrapInput("description", stripHtml(input.description, 1500))}
${wrapInput("website_url", input.websiteUrl ?? "")}`

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`DeepSeek API error ${response.status}: ${text}`)
  }

  const data = await response.json()
  await logAiUsage("classify-project-quality", model, data?.usage)
  const raw = data?.choices?.[0]?.message?.content?.trim()
  if (typeof raw !== "string") throw new Error("Empty quality classification response")

  // Strip optional code-fence wrapper the model sometimes adds.
  const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const jsonText = jsonMatch ? jsonMatch[1].trim() : raw

  const parsed = JSON.parse(jsonText) as { score?: unknown; reason?: unknown }
  const score = typeof parsed.score === "number" ? Math.max(0, Math.min(100, parsed.score)) : 50
  const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 500) : "no reason"

  return {
    score,
    reason,
    isLowQuality: score < LOW_QUALITY_THRESHOLD,
  }
}
