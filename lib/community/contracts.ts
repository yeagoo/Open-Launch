/** UI-facing contract; no database, server runtime, or fixture imports. */
export const postTypes = ["Shipped", "Learning", "Question", "Milestone", "Todo"] as const
export type PostType = (typeof postTypes)[number]
export type MemberRole = "anonymous" | "unverified" | "member" | "banned" | "moderator"
export type PostState = "public" | "pending" | "hidden" | "deleted"
export type FeedView = "all" | "saved" | "mine"
/** A small, serializable projection used by the interactive community UI. */
export interface CommunityViewer {
  id: string | null
  role: MemberRole
  canParticipate: boolean
}
export interface ProductContext {
  id: string
  name: string
  description: string
}
export interface CommunityReply {
  authorId?: string
  parentId?: string
  version?: number
  state?: "public" | "hidden" | "deleted"
  id: string
  author: string
  body: string
  /** Stable reply order is required when a new reply lands between cursor pages. */
  createdAt: number
}
export interface CommunityPost {
  id: string
  authorId: string
  author: string
  type: PostType
  title: string
  body: string
  /** Feed projections deliberately send only an excerpt; detail pages send the full body. */
  bodyTruncated?: boolean
  product?: ProductContext
  votes: number
  voted: boolean
  saved: boolean
  replies: CommunityReply[]
  /** Total visible replies, independent of the bounded reply page. */
  replyCount?: number
  replyCursor?: string
  state: PostState
  locked: boolean
  pinned: boolean
  version: number
  createdAt: number
}
/** Minimal server response for a vote write; it deliberately excludes post content. */
export interface CommunityVoteState {
  id: string
  kind: "vote"
  votes: number
  voted: boolean
}
/** Minimal server response for a bookmark write; it deliberately excludes post content. */
export interface CommunityBookmarkState {
  id: string
  kind: "bookmark"
  saved: boolean
}
export type CommunityPostReaction = CommunityVoteState | CommunityBookmarkState

/** Apply an authoritative reaction result without replacing an existing post projection. */
export function applyCommunityPostReaction(
  post: CommunityPost,
  reaction: CommunityPostReaction,
): CommunityPost {
  if (post.id !== reaction.id) return post
  if (reaction.kind === "vote") return { ...post, votes: reaction.votes, voted: reaction.voted }
  return { ...post, saved: reaction.saved }
}
export interface PostDraft {
  title: string
  body: string
  type: PostType
  productId: string
}
export interface FeedQuery {
  view: FeedView
  type: PostType | "All"
  sort: "Latest" | "Hot"
  search: string
  cursor?: string
}
export interface FeedPage {
  posts: CommunityPost[]
  nextCursor?: string
}
export interface CommunityReport {
  id: string
  postId: string
  replyId?: string | null
  reason: string
  snapshot: string
  resolved: boolean
}
export type ModerationAction = "hide" | "restore" | "lock" | "unlock" | "pin" | "unpin"
export type CommunityErrorCode =
  "validation" | "unauthorized" | "forbidden" | "missing" | "conflict" | "retryable"
export class CommunityError extends Error {
  constructor(
    public code: CommunityErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "CommunityError"
  }
}
export interface CommunityService {
  list(query: FeedQuery): Promise<FeedPage>
  get(id: string): Promise<CommunityPost>
  saveDraft(draft: PostDraft): Promise<void>
  getDraft(): Promise<PostDraft | null>
  publish(draft: PostDraft, requestId: string): Promise<CommunityPost>
  edit(id: string, draft: PostDraft, version: number): Promise<CommunityPost>
  delete(id: string, version: number): Promise<void>
  reply(id: string, body: string, requestId: string): Promise<CommunityPost>
  setVote(id: string, desired: boolean): Promise<CommunityVoteState>
  setBookmark(id: string, desired: boolean): Promise<CommunityBookmarkState>
  report(id: string, reason: string): Promise<void>
  reports(): Promise<CommunityReport[]>
  moderate(id: string, action: ModerationAction): Promise<void>
  resolveReport(id: string): Promise<void>
}
export const emptyDraft = (): PostDraft => ({ title: "", body: "", type: "Shipped", productId: "" })
export function validateDraft(draft: PostDraft): Partial<Record<keyof PostDraft, string>> {
  const errors: Partial<Record<keyof PostDraft, string>> = {}
  if (draft.body.trim().length < 20 || draft.body.length > 10000)
    errors.body = "Write 20–10,000 characters of context."
  if (draft.title.length > 160) errors.title = "Keep the title to 160 characters or fewer."
  if (!postTypes.includes(draft.type)) errors.type = "Choose a post type."
  return errors
}
export function participationMessage(role: MemberRole): string | null {
  if (role === "anonymous") return "Sign in to join the conversation."
  if (role === "unverified") return "Verify your email before posting or reacting."
  if (role === "banned")
    return "Your account cannot participate. Contact support if you think this is a mistake."
  return null
}
