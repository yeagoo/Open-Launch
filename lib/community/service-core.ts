import "server-only"

import { communityThread as thread, user } from "@/drizzle/db/schema"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  CommunityError,
  type CommunityPost,
  type CommunityReply,
  type PostDraft,
} from "./contracts"
import * as moderation from "./moderation"
import * as mutations from "./mutations"
import { getEditablePost, getPost, listComposerProducts, listPosts, listReplyPage } from "./queries"
import { readActor, requireModerator, requireParticipant, viewerFor } from "./server-context"
import type {
  CommunityActor,
  CommunityBackendService,
  CommunityDatabase,
  CommunityDependencies,
  CommunityOperationTelemetry,
  CommunityTransaction,
} from "./server-types"
import {
  draftSchema,
  idSchema,
  parseInput,
  publishSchema,
  querySchema,
  reasonSchema,
  replySchema,
  requestKeySchema,
  versionSchema,
} from "./validation"

const DEFAULT_SLOW_OPERATION_MS = 1_000

async function notifyObserver(observer: (() => void | Promise<void>) | undefined): Promise<void> {
  try {
    await observer?.()
  } catch {
    // Observability must not affect an authorization, validation or data result.
  }
}

/** Constructed only on the server; actor IDs come from a trusted session resolver. */
export function createCommunityBackend(
  database: CommunityDatabase,
  deps: CommunityDependencies,
): CommunityBackendService {
  const slowOperationMs =
    typeof deps.slowOperationMs === "number" &&
    Number.isFinite(deps.slowOperationMs) &&
    deps.slowOperationMs >= 0
      ? deps.slowOperationMs
      : DEFAULT_SLOW_OPERATION_MS

  async function execute<T>(
    operation: string,
    write: boolean,
    admin: boolean,
    work: (tx: CommunityTransaction, actor: CommunityActor | null) => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now()
    let telemetry: CommunityOperationTelemetry | undefined
    const observe = (outcome: CommunityOperationTelemetry["outcome"]) =>
      (telemetry ??= {
        operation,
        write,
        admin,
        outcome,
        // Wall-clock adjustments cannot turn a duration into a negative log value.
        durationMs: Math.max(0, Date.now() - startedAt),
      })

    try {
      const actorId = await deps.getActorId()
      // Reject anonymous writes before opening a transaction or invoking the limiter.
      if (write && !actorId) throw new CommunityError("unauthorized", "Sign in to participate")
      if (write) await deps.checkWriteLimit(actorId!, operation)
      return await database.transaction(async (tx) => {
        const actor = await readActor(tx, actorId, write)
        if (write) requireParticipant(actor)
        if (admin) requireModerator(actor)
        return work(tx, actor)
      })
    } catch (error) {
      if (error instanceof CommunityError) {
        observe("rejected")
        throw error
      }
      const code =
        (error as { code?: string; cause?: { code?: string } })?.cause?.code ??
        (error as { code?: string })?.code
      if (code === "23514" || code === "22001") {
        observe("rejected")
        throw new CommunityError("validation", "Content does not meet the community constraints")
      }
      if (code === "23503" || code === "23505") {
        observe("rejected")
        throw new CommunityError("conflict", "A related record changed. Refresh and retry")
      }
      const failure = observe("failed")
      await notifyObserver(() => deps.onError?.(operation, error, failure))
      throw new CommunityError(
        "retryable",
        "Community data is temporarily unavailable. Please retry",
      )
    } finally {
      const completed = telemetry ?? observe("completed")
      if (completed.durationMs >= slowOperationMs)
        await notifyObserver(() => deps.onSlowOperation?.(completed))
    }
  }
  const read = <T>(
    operation: string,
    work: (tx: CommunityTransaction, actor: CommunityActor | null) => Promise<T>,
    admin = false,
  ) => execute(operation, false, admin, work)
  const write = <T>(
    operation: string,
    work: (tx: CommunityTransaction, actor: CommunityActor) => Promise<T>,
    admin = false,
  ) => execute(operation, true, admin, (tx, actor) => work(tx, actor!))
  async function details(
    tx: CommunityTransaction,
    id: string,
    actor: CommunityActor | null,
  ): Promise<CommunityPost> {
    const post = await getPost(tx, id, actor)
    const page = await listReplyPage(tx, id, actor, undefined, post)
    return { ...post, replies: page.replies, replyCursor: page.nextCursor }
  }
  async function replyResult(
    tx: CommunityTransaction,
    actor: CommunityActor,
    row: Awaited<ReturnType<typeof mutations.createReply>>,
  ): Promise<CommunityReply> {
    const [author] = await tx
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, actor.id))
      .limit(1)
    return {
      id: row.id,
      authorId: actor.id,
      author: author?.name ?? "Former member",
      body: row.body,
      createdAt: row.createdAt.getTime(),
      version: row.version,
      parentId: row.parentId ?? undefined,
      state: "public",
    }
  }
  async function getDraftInTransaction(
    tx: CommunityTransaction,
    actor: CommunityActor | null,
  ): Promise<PostDraft | null> {
    if (!actor) return null
    const [row] = await tx
      .select()
      .from(thread)
      .where(and(eq(thread.authorId, actor.id), eq(thread.lifecycle, "draft")))
      .limit(1)
    return row
      ? {
          title: row.title ?? "",
          body: row.body,
          type: parseInput(draftSchema, { title: "", body: "", type: row.type, productId: "" })
            .type,
          productId: row.projectId ?? "",
        }
      : null
  }
  async function contextFor(
    tx: CommunityTransaction,
    actor: CommunityActor | null,
    includeProducts = false,
  ) {
    const viewer = viewerFor(actor)
    return {
      viewer,
      products: includeProducts && viewer.canParticipate ? await listComposerProducts(tx) : [],
    }
  }
  function moderatePostWithOutcome(input: unknown, actionInput: unknown) {
    const id = parseInput(idSchema, input),
      action = parseInput(
        z.enum(["hide", "restore", "lock", "unlock", "pin", "unpin"]),
        actionInput,
      )
    return write(
      "moderate",
      (tx, actor) =>
        moderation.moderatePost(
          tx,
          actor,
          id,
          action,
          "Moderator action from the community review queue",
        ),
      true,
    )
  }
  return {
    list(input) {
      const query = parseInput(querySchema, input)
      return read("list", (tx, actor) => listPosts(tx, query, actor))
    },
    get(input) {
      const id = parseInput(idSchema, input)
      return read("get", (tx, actor) => details(tx, id, actor))
    },
    getDraft() {
      return read("draft", async (tx, actor) => {
        if (!actor) throw new CommunityError("unauthorized", "Sign in to read drafts")
        return getDraftInTransaction(tx, actor)
      })
    },
    loadViewer() {
      return read("viewer", async (_tx, actor) => viewerFor(actor))
    },
    loadFeedPage(input) {
      const query = parseInput(querySchema, input)
      return read("feed-page", async (tx, actor) => {
        const context = await contextFor(tx, actor)
        // Personal feeds are an optional convenience. The direct low-level
        // list API keeps its unauthorized error, while the page can render a
        // sign-in prompt without turning an exploratory click into a 500.
        if (query.view !== "all" && !actor) return { feed: { posts: [] }, viewer: context.viewer }
        return { feed: await listPosts(tx, query, actor), viewer: context.viewer }
      })
    },
    loadPostPage(input) {
      const id = parseInput(idSchema, input)
      return read("post-page", async (tx, actor) => {
        const post = await details(tx, id, actor)
        const context = await contextFor(tx, actor)
        return { post, ...context }
      })
    },
    loadPostEditorPage(input) {
      const id = parseInput(idSchema, input)
      return read("post-editor-page", async (tx, actor) => {
        // The editor has no reply UI. Its owner/state gate is part of the
        // initial lookup, before unrelated detail and viewer projections run.
        const post = await getEditablePost(tx, id, actor)
        const context = await contextFor(tx, actor, true)
        const products =
          post.product && !context.products.some((product) => product.id === post.product?.id)
            ? [post.product, ...context.products]
            : context.products
        return { post, ...context, products }
      })
    },
    loadComposerPage() {
      return read("composer-page", async (tx, actor) => {
        const context = await contextFor(tx, actor, true)
        return { draft: await getDraftInTransaction(tx, actor), ...context }
      })
    },
    saveDraft(input) {
      const draft = parseInput(draftSchema, input)
      return write("draft", (tx, actor) => mutations.saveDraft(tx, actor, draft))
    },
    publish(input, keyInput) {
      const draft = parseInput(publishSchema, input),
        key = parseInput(requestKeySchema, keyInput)
      return write("publish", async (tx, actor) =>
        details(tx, await mutations.publish(tx, actor, draft, key), actor),
      )
    },
    publishForNavigation(input, keyInput) {
      const draft = parseInput(publishSchema, input),
        key = parseInput(requestKeySchema, keyInput)
      return write("publish", (tx, actor) => mutations.publish(tx, actor, draft, key))
    },
    edit(input, draftInput, versionInput) {
      const id = parseInput(idSchema, input),
        draft = parseInput(publishSchema, draftInput),
        version = parseInput(versionSchema, versionInput)
      return write("edit", async (tx, actor) => {
        await mutations.editPost(tx, actor, id, draft, version)
        return details(tx, id, actor)
      })
    },
    editForNavigation(input, draftInput, versionInput) {
      const id = parseInput(idSchema, input),
        draft = parseInput(publishSchema, draftInput),
        version = parseInput(versionSchema, versionInput)
      return write("edit", async (tx, actor) => {
        await mutations.editPost(tx, actor, id, draft, version)
      })
    },
    delete(input, versionInput) {
      const id = parseInput(idSchema, input),
        version = parseInput(versionSchema, versionInput)
      return write("delete", (tx, actor) => mutations.deletePost(tx, actor, id, version))
    },
    setVote(input, value) {
      const id = parseInput(idSchema, input),
        desired = parseInput(z.boolean(), value)
      return write("vote", (tx, actor) => mutations.react(tx, actor, id, desired, "vote"))
    },
    setBookmark(input, value) {
      const id = parseInput(idSchema, input),
        desired = parseInput(z.boolean(), value)
      return write("bookmark", (tx, actor) => mutations.react(tx, actor, id, desired, "bookmark"))
    },
    reply(input, bodyInput, keyInput) {
      const id = parseInput(idSchema, input),
        body = parseInput(replySchema, bodyInput),
        key = parseInput(requestKeySchema, keyInput)
      return write("reply", async (tx, actor) => {
        await mutations.createReply(tx, actor, id, body, key)
        return details(tx, id, actor)
      })
    },
    replyTo(input, bodyInput, keyInput, parentInput) {
      const id = parseInput(idSchema, input),
        body = parseInput(replySchema, bodyInput),
        key = parseInput(requestKeySchema, keyInput),
        parent = parentInput ? parseInput(idSchema, parentInput) : undefined
      return write("reply", async (tx, actor) =>
        replyResult(tx, actor, await mutations.createReply(tx, actor, id, body, key, parent)),
      )
    },
    listReplies(input, cursor) {
      const id = parseInput(idSchema, input)
      return read("replies", (tx, actor) => listReplyPage(tx, id, actor, cursor))
    },
    editReply(input, bodyInput, versionInput) {
      const id = parseInput(idSchema, input),
        body = parseInput(replySchema, bodyInput),
        version = parseInput(versionSchema, versionInput)
      return write("edit-reply", async (tx, actor) => {
        await mutations.editReply(tx, actor, id, version, body)
      })
    },
    deleteReply(input, versionInput) {
      const id = parseInput(idSchema, input),
        version = parseInput(versionSchema, versionInput)
      return write("delete-reply", async (tx, actor) => {
        await mutations.editReply(tx, actor, id, version)
      })
    },
    report(input, reasonInput) {
      const id = parseInput(idSchema, input),
        reason = parseInput(reasonSchema, reasonInput)
      return write("report", async (tx, actor) => {
        await moderation.submitReport(tx, actor, id, reason)
      })
    },
    reportReply(input, reasonInput) {
      const id = parseInput(idSchema, input),
        reason = parseInput(reasonSchema, reasonInput)
      return write("report", async (tx, actor) => {
        await moderation.submitReport(tx, actor, id, reason, true)
      })
    },
    reports() {
      return read("reports", (tx) => moderation.reportsPage(tx), true)
    },
    loadModerationPage() {
      return read(
        "moderation-page",
        async (tx, actor) => ({
          reports: await moderation.reportsPage(tx),
          viewer: viewerFor(actor),
        }),
        true,
      )
    },
    moderate(input, actionInput) {
      return moderatePostWithOutcome(input, actionInput).then(() => undefined)
    },
    moderateWithOutcome(input, actionInput) {
      return moderatePostWithOutcome(input, actionInput)
    },
    moderateReply(input, actionInput, reasonInput) {
      const id = parseInput(idSchema, input),
        action = parseInput(z.enum(["hide", "restore"]), actionInput),
        reason = parseInput(reasonSchema, reasonInput)
      return write(
        "moderate",
        (tx, actor) => moderation.moderateReply(tx, actor, id, action, reason),
        true,
      )
    },
    resolveReport(input) {
      const id = parseInput(idSchema, input)
      return write("moderate", (tx, actor) => moderation.resolveReport(tx, actor, id), true)
    },
  }
}
