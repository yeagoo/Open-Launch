import { request } from "undici"

import { assertAiAvailable, noteAiResponse } from "@/lib/ai-circuit"
import { INPUT_SAFETY_BLOCK, stripHtml, wrapInput } from "@/lib/ai-input"
import { logAiUsage, type DeepSeekUsage } from "@/lib/ai-usage"
import { FetchTimeoutError, withTimeout } from "@/lib/fetch-timeout"

export const SKILL_REVIEW_REJECT_THRESHOLD = 30

export interface SkillReviewVariant {
  site: string
  title: string
  tagline: string
  bodyMd: string
  lang: string
}

export interface SkillReviewInput {
  domain: string
  websiteUrl: string
  variants: readonly SkillReviewVariant[]
}

export interface SkillCanaryReviewPage {
  site: string
  url: string
  intendedTitle: string
  intendedTagline: string
  intendedBodyMd: string
  liveMarkdown: string
}

export interface SkillCanaryReviewInput {
  domain: string
  websiteUrl: string
  pages: readonly SkillCanaryReviewPage[]
}

export interface SkillReviewVerdict {
  score: number
  reasons: string[]
}

const SKILL_REVIEW_TIMEOUT_MS = 20_000
const MAX_VARIANT_REVIEW_CHARS = 900

const SYSTEM_PROMPT = `You are a strict automated safety reviewer for a free nofollow product-directory submission channel.

Review the submitted website and 14 user-generated directory variants. Decide whether this looks like a legitimate tech/SaaS/AI/developer/creator product or high-risk content that should not be automatically distributed.

Output a JSON object exactly:
{
  "score": 0-100 integer (higher = safer and more legitimate),
  "reasons": ["one to three short English reasons"]
}

Score guidance:
- 80-100: Clear legitimate product with specific features, target users, and coherent copy.
- 50-79: Probably legitimate, maybe thin or generic, but not abusive.
- 30-49: Suspicious or very low-quality; vague, off-topic, or thin.
- 0-29: Reject. Spam, scam, adult, gambling, illegal content, malware, impersonation, link-farm content, regulated-industry abuse, or incoherent machine-generated junk.

Hard rules:
- Output only the JSON object, no markdown fences or commentary.
- Do not punish harmless small indie tools.
- Reject high-risk content even if the copy is polished.
- Reasons must be specific to this submission.

${INPUT_SAFETY_BLOCK}`

const CANARY_SYSTEM_PROMPT = `You are a strict automated canary reviewer for a nofollow directory publication system.

You receive the intended submitted content and the live rendered markdown from canary directory pages. Decide whether the live pages render the intended, clean product listing and whether the content remains safe to continue distributing.

Output a JSON object exactly:
{
  "score": 0-100 integer (higher = safe to continue rollout),
  "reasons": ["one to three short English reasons"]
}

Score guidance:
- 80-100: Live pages clearly contain the intended product/listing and no high-risk content.
- 50-79: Mostly correct but minor rendering/content issues.
- 30-49: Significant mismatch or low-quality rendering; pause rather than continue.
- 0-29: Reject and takedown. Missing intended listing, spam/scam/adult/illegal content, malware, impersonation, or a materially different page.

Hard rules:
- Output only the JSON object, no markdown fences or commentary.
- Be strict on content mismatch: if the live page does not clearly contain the intended listing, score below 30.
- Do not require exact wording; directory templates can wrap or reorder content.

${INPUT_SAFETY_BLOCK}`

export function isSkillReviewRejected(verdict: SkillReviewVerdict): boolean {
  return verdict.score < SKILL_REVIEW_REJECT_THRESHOLD
}

export async function reviewSkillSubmission(input: SkillReviewInput): Promise<SkillReviewVerdict> {
  return callDeepSeekReview({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input),
    functionName: "skill-submission-review",
    maxTokens: 220,
  })
}

export async function reviewSkillCanaryPages(
  input: SkillCanaryReviewInput,
): Promise<SkillReviewVerdict> {
  return callDeepSeekReview({
    systemPrompt: CANARY_SYSTEM_PROMPT,
    userPrompt: buildCanaryUserPrompt(input),
    functionName: "skill-canary-review",
    maxTokens: 220,
  })
}

async function callDeepSeekReview({
  systemPrompt,
  userPrompt,
  functionName,
  maxTokens,
}: {
  systemPrompt: string
  userPrompt: string
  functionName: string
  maxTokens: number
}): Promise<SkillReviewVerdict> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not set")

  assertAiAvailable()

  const deadline = Date.now() + SKILL_REVIEW_TIMEOUT_MS
  const response = await request("https://api.deepseek.com/v1/chat/completions", {
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
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
    headersTimeout: SKILL_REVIEW_TIMEOUT_MS,
    bodyTimeout: SKILL_REVIEW_TIMEOUT_MS,
  })

  const statusCode = response.statusCode
  if (statusCode >= 300 && statusCode < 400) {
    response.body.destroy()
    throw new Error(`DeepSeek API redirected with HTTP ${statusCode}`)
  }

  let text = ""
  try {
    text = await withTimeout(
      response.body.text(),
      Math.max(1, deadline - Date.now()),
      "skill submission review",
    )
  } catch (error) {
    response.body.destroy()
    if (error instanceof FetchTimeoutError) throw error
    throw new Error(error instanceof Error ? error.message : "DeepSeek response read failed")
  }

  if (statusCode < 200 || statusCode >= 300) {
    noteAiResponse(statusCode, text)
    throw new Error(`DeepSeek API error ${statusCode}: ${text}`)
  }

  const data = JSON.parse(text) as {
    usage?: DeepSeekUsage
    choices?: Array<{ message?: { content?: unknown } }>
  }
  await logAiUsage(functionName, model, data?.usage)

  const raw = data?.choices?.[0]?.message?.content
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("Empty skill review response")
  }

  return parseSkillReviewResponse(raw)
}

export function parseSkillReviewResponse(raw: string): SkillReviewVerdict {
  const jsonText = stripOptionalJsonFence(raw)
  const parsed = JSON.parse(jsonText) as { score?: unknown; reasons?: unknown; reason?: unknown }
  const rawScore = typeof parsed.score === "number" ? parsed.score : 50
  const score = Math.max(0, Math.min(100, Math.round(rawScore)))
  const reasons = normalizeReasons(parsed.reasons, parsed.reason)

  return { score, reasons }
}

function buildUserPrompt(input: SkillReviewInput): string {
  const variants = input.variants
    .map((variant, index) => {
      const body = stripHtml(variant.bodyMd, MAX_VARIANT_REVIEW_CHARS)
      return [
        `Variant ${index + 1} (${variant.site}, ${variant.lang})`,
        wrapInput("title", variant.title),
        wrapInput("tagline", variant.tagline),
        wrapInput("body_md_excerpt", body),
      ].join("\n")
    })
    .join("\n\n")

  return `${wrapInput("domain", input.domain)}
${wrapInput("website_url", input.websiteUrl)}

${variants}`
}

function buildCanaryUserPrompt(input: SkillCanaryReviewInput): string {
  const pages = input.pages
    .map((page, index) => {
      return [
        `Canary page ${index + 1} (${page.site})`,
        wrapInput("live_url", page.url),
        wrapInput("intended_title", page.intendedTitle),
        wrapInput("intended_tagline", page.intendedTagline),
        wrapInput("intended_body_md_excerpt", stripHtml(page.intendedBodyMd, 800)),
        wrapInput("live_markdown_excerpt", stripHtml(page.liveMarkdown, 1600)),
      ].join("\n")
    })
    .join("\n\n")

  return `${wrapInput("domain", input.domain)}
${wrapInput("website_url", input.websiteUrl)}

${pages}`
}

function stripOptionalJsonFence(raw: string): string {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  return jsonMatch ? jsonMatch[1].trim() : trimmed
}

function normalizeReasons(reasons: unknown, fallback: unknown): string[] {
  if (Array.isArray(reasons)) {
    const out = reasons
      .filter((reason): reason is string => typeof reason === "string")
      .map((reason) => reason.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 3)
    if (out.length > 0) return out
  }

  if (typeof fallback === "string" && fallback.trim()) {
    return [fallback.trim().slice(0, 300)]
  }

  return ["No specific reason provided."]
}
