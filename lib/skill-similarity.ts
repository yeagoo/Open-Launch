export const SKILL_SIMILARITY_THRESHOLD = 0.9

export interface SkillSimilarityVariant {
  site: string
  bodyMd: string
}

export interface SkillSimilarityViolation {
  leftSite: string
  rightSite: string
  similarity: number
}

export interface SkillSimilarityResult {
  ok: boolean
  maxSimilarity: number
  violation?: SkillSimilarityViolation
}

export function checkSkillVariantSimilarity(
  variants: readonly SkillSimilarityVariant[],
  threshold = SKILL_SIMILARITY_THRESHOLD,
): SkillSimilarityResult {
  let maxSimilarity = 0
  let violation: SkillSimilarityViolation | undefined
  const fingerprints = variants.map((variant) => ({
    site: variant.site,
    grams: textTrigrams(variant.bodyMd),
  }))

  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      const similarity = jaccard(fingerprints[i].grams, fingerprints[j].grams)
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity
      }
      if (similarity > threshold) {
        violation = {
          leftSite: fingerprints[i].site,
          rightSite: fingerprints[j].site,
          similarity,
        }
        return { ok: false, maxSimilarity, violation }
      }
    }
  }

  return { ok: true, maxSimilarity }
}

function textTrigrams(input: string): Set<string> {
  const normalized = normalizeText(input)
  if (!normalized) return new Set()
  if (normalized.length <= 3) return new Set([normalized])

  const grams = new Set<string>()
  for (let i = 0; i <= normalized.length - 3; i++) {
    grams.add(normalized.slice(i, i + 3))
  }
  return grams
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[`*_#[\](){}<>|~!"':;,./?\\+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0

  let intersection = 0
  for (const gram of a) {
    if (b.has(gram)) intersection++
  }

  return intersection / (a.size + b.size - intersection)
}
