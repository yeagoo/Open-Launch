import "server-only"

import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { NodePgDatabase, NodePgTransaction } from "drizzle-orm/node-postgres"

import type {
  CommunityPost,
  CommunityReply,
  CommunityReport,
  CommunityService,
  CommunityViewer,
  FeedPage,
  FeedQuery,
  ModerationAction,
  PostDraft,
  ProductContext,
} from "./contracts"

export type CommunityDatabase = NodePgDatabase<typeof import("@/drizzle/db/schema")>
export type CommunityTransaction = NodePgTransaction<
  typeof import("@/drizzle/db/schema"),
  ExtractTablesWithRelations<typeof import("@/drizzle/db/schema")>
>
export interface CommunityActor {
  id: string
  admin: boolean
  verified: boolean
  blocked: boolean
  bot: boolean
}
/**
 * Metadata for a service operation. It intentionally excludes actor IDs,
 * thread IDs and user-provided text so it is safe to send to the structured
 * logging boundary.
 */
export interface CommunityOperationTelemetry {
  operation: string
  write: boolean
  admin: boolean
  outcome: "completed" | "rejected" | "failed"
  durationMs: number
}
export interface CommunityFeedPageData {
  feed: FeedPage
  viewer: CommunityViewer
  /** Search limiting is presented as a normal, recoverable feed state. */
  rateLimited?: boolean
}
export interface CommunityPostPageData {
  post: CommunityPost
  viewer: CommunityViewer
  products: ProductContext[]
}
export interface CommunityComposerPageData {
  draft: PostDraft | null
  viewer: CommunityViewer
  products: ProductContext[]
}
export interface CommunityModerationPageData {
  reports: CommunityReport[]
  viewer: CommunityViewer
}
export interface CommunityDependencies {
  /** Trusted session resolver, never an ID supplied by a browser form. */
  getActorId(): Promise<string | null>
  checkWriteLimit(actorId: string, operation: string): Promise<void>
  /**
   * Best-effort operational reporting. Observer failures never change a
   * community result or expose their own error to a visitor.
   */
  onError?(
    operation: string,
    error: unknown,
    telemetry: CommunityOperationTelemetry,
  ): void | Promise<void>
  /** Called only when a completed service operation exceeds the configured threshold. */
  onSlowOperation?(telemetry: CommunityOperationTelemetry): void | Promise<void>
  /** Defaults to 1,000 ms; a non-negative override supports isolated tests. */
  slowOperationMs?: number
}
export interface ReplyPage {
  replies: CommunityReply[]
  nextCursor?: string
}
export interface CommunityReplyModerationOutcome {
  threadId: string
  changed: boolean
}
export interface CommunityBackendService extends CommunityService {
  loadViewer(): Promise<CommunityViewer>
  loadFeedPage(query: FeedQuery): Promise<CommunityFeedPageData>
  loadPostPage(threadId: string): Promise<CommunityPostPageData>
  loadPostEditorPage(threadId: string): Promise<CommunityPostPageData>
  loadComposerPage(): Promise<CommunityComposerPageData>
  loadModerationPage(): Promise<CommunityModerationPageData>
  listReplies(threadId: string, cursor?: string): Promise<ReplyPage>
  /**
   * Composer actions redirect immediately after publishing, so they only need
   * the newly created thread ID instead of a hydrated post page.
   */
  publishForNavigation(draft: PostDraft, requestId: string): Promise<string>
  /** The editor already has the thread ID and redirects to its fresh page after saving. */
  editForNavigation(threadId: string, draft: PostDraft, version: number): Promise<void>
  /** Server Actions only invalidate public projections after a real state change. */
  moderateWithOutcome(threadId: string, action: ModerationAction): Promise<boolean>
  replyTo(
    threadId: string,
    body: string,
    requestId: string,
    parentId?: string,
  ): Promise<CommunityReply>
  /** Detail clients merge reply lifecycle changes into their existing projection. */
  editReply(replyId: string, body: string, version: number): Promise<void>
  deleteReply(replyId: string, version: number): Promise<void>
  reportReply(replyId: string, reason: string): Promise<void>
  moderateReply(
    replyId: string,
    action: "hide" | "restore",
    reason: string,
  ): Promise<CommunityReplyModerationOutcome>
}
