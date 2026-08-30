export type ProjectLocale = "en" | "zh" | "es" | "pt" | "fr" | "ja" | "ko" | "et"

const SUPPORTED_PROJECT_LOCALES: ReadonlySet<ProjectLocale> = new Set([
  "en",
  "zh",
  "es",
  "pt",
  "fr",
  "ja",
  "ko",
  "et",
])

export interface NormalizedProjectTag {
  id: string
  name: string
  slug: string
}

interface ExistingProjectByUrl {
  id: string
  createdBy: string | null
  launchStatus: string
}

export type ProjectUrlCollisionDecision =
  | { kind: "none" }
  | { kind: "delete_failed_draft"; projectId: string }
  | { kind: "reject_pending_payment"; projectId: string }
  | { kind: "reject_duplicate" }

export type ProjectInsertErrorKind = "website_url_duplicate" | "slug_conflict" | "unknown"

export function resolveProjectLocale(value: string | undefined): ProjectLocale {
  return value && SUPPORTED_PROJECT_LOCALES.has(value as ProjectLocale)
    ? (value as ProjectLocale)
    : "en"
}

export function normalizeProjectWebsiteUrl(value: string): string {
  return value.trim().toLowerCase().replace(/\/$/, "")
}

export function normalizeProjectTags(tags: readonly string[] | undefined): NormalizedProjectTag[] {
  if (!tags?.length) return []

  const normalized = tags.slice(0, 10).map((raw) => {
    const name = raw.trim()
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]+/g, "-")
      .replace(/^-+|-+$/g, "")
    return { id: slug, name, slug }
  })

  return [
    ...new Map(
      normalized
        .filter((tag) => tag.slug.length >= 2 && tag.slug.length <= 30)
        .map((tag) => [tag.id, tag]),
    ).values(),
  ]
}

export function decideProjectUrlCollision(
  existing: ExistingProjectByUrl | undefined,
  userId: string,
): ProjectUrlCollisionDecision {
  if (!existing) return { kind: "none" }
  if (existing.createdBy !== userId) return { kind: "reject_duplicate" }
  if (existing.launchStatus === "payment_failed") {
    return { kind: "delete_failed_draft", projectId: existing.id }
  }
  if (existing.launchStatus === "payment_pending") {
    return { kind: "reject_pending_payment", projectId: existing.id }
  }
  return { kind: "reject_duplicate" }
}

export function classifyProjectInsertError(error: unknown): ProjectInsertErrorKind {
  const cause = (error as { cause?: { constraint?: unknown } } | null)?.cause
  const constraint =
    typeof cause?.constraint === "string"
      ? cause.constraint
      : error instanceof Error
        ? error.message
        : ""

  if (constraint.includes("project_website_url_unique")) return "website_url_duplicate"
  if (constraint.includes("project_slug_unique")) return "slug_conflict"
  return "unknown"
}
