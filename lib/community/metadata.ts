import type { CommunityPost } from "./contracts"

function compact(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized
}

export function communityPostHeadline(post: CommunityPost): string {
  return compact(post.title || post.body, 110) || `${post.type} update`
}

export function communityPostDescription(post: CommunityPost): string {
  return compact(post.body, 180) || "A maker update from the aat.ee community."
}
