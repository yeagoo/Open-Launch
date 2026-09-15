"use client"

import { useRef, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { toast } from "sonner"

import {
  applyCommunityPostReaction,
  participationMessage,
  type CommunityPost,
  type CommunityReply,
  type CommunityViewer,
} from "@/lib/community/contracts"
import { communityPostHref } from "@/lib/community/urls"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SafeMarkdown } from "@/components/ui/safe-markdown"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteCommunityPost,
  deleteCommunityReply,
  editCommunityReply,
  loadMoreCommunityReplies,
  replyToCommunityPost,
  reportCommunityPost,
  reportCommunityReply,
  setCommunityBookmark,
  setCommunityVote,
} from "@/app/actions/community"

import {
  actionMessage,
  CommunityParticipationGate,
  communityProjectionKey,
  newCommunityRequestKey,
  useCommunityActionLock,
} from "./community-client-utils"
import { CommunityState, PostActions, PostMeta, ProductContextCard } from "./community-ui"
import { ReplyComposer } from "./post-composer"

const ROOT_REPLY = "root"
type ReplyTarget = typeof ROOT_REPLY | string

function compareReplies(left: CommunityReply, right: CommunityReply) {
  const createdAtDifference = left.createdAt - right.createdAt
  if (createdAtDifference !== 0) return createdAtDifference
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

function mergeReplies(current: CommunityReply[], added: CommunityReply[]) {
  const known = new Set(current.map((reply) => reply.id))
  return [...current, ...added.filter((reply) => !known.has(reply.id))].sort(compareReplies)
}

function ReplyItem({
  reply,
  children,
  viewer,
  repliesOpen,
  editing,
  editBody,
  pending,
  onEditBodyChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReply,
  onReport,
}: {
  reply: CommunityReply
  children?: ReactNode
  viewer: CommunityViewer
  repliesOpen: boolean
  editing: boolean
  editBody: string
  pending: boolean
  onEditBodyChange: (value: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onReply: () => void
  onReport: () => void
}) {
  const publicReply = reply.state === "public" || !reply.state
  const isOwner = viewer.id === reply.authorId
  const canReply = !reply.parentId && viewer.canParticipate && repliesOpen
  const canEditReply = isOwner && viewer.canParticipate && repliesOpen
  // Locking closes new replies and edits, but the service intentionally keeps
  // an author's tombstone deletion available after a lock.
  const canDeleteReply = isOwner && viewer.canParticipate
  const editingAllowed = editing && canEditReply
  return (
    <article className="c-reply" data-state={reply.state ?? "public"}>
      {publicReply ? (
        <>
          <strong>{reply.author}</strong>
          {editingAllowed ? (
            <>
              <Textarea
                aria-label={`Edit reply from ${reply.author}`}
                value={editBody}
                disabled={pending}
                maxLength={4000}
                onChange={(event) => onEditBodyChange(event.target.value)}
              />
              <div className="c-reply-actions">
                <Button
                  className="c-button"
                  disabled={pending || !editBody.trim()}
                  onClick={onSaveEdit}
                >
                  Save reply
                </Button>
                <Button variant="ghost" disabled={pending} onClick={onCancelEdit}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div className="c-reply-body c-markdown">
              <SafeMarkdown downgradeHeadings>{reply.body}</SafeMarkdown>
            </div>
          )}
          {!editingAllowed && (
            <div className="c-reply-actions">
              {canReply && (
                <Button variant="ghost" disabled={pending} onClick={onReply}>
                  Reply
                </Button>
              )}
              {(canEditReply || canDeleteReply) && (
                <>
                  {canEditReply && (
                    <Button variant="ghost" disabled={pending} onClick={onSaveEdit}>
                      Edit
                    </Button>
                  )}
                  {canDeleteReply && (
                    <Button variant="ghost" disabled={pending} onClick={onDelete}>
                      Delete
                    </Button>
                  )}
                </>
              )}
              {!isOwner && viewer.canParticipate && (
                <Button variant="ghost" disabled={pending} onClick={onReport}>
                  Report
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <p>
          {reply.state === "deleted" ? "This reply was deleted." : "This reply is unavailable."}
        </p>
      )}
      {children}
    </article>
  )
}

export function CommunityDetailClient({
  initialPost,
  viewer,
}: {
  initialPost: CommunityPost
  viewer: CommunityViewer
}) {
  const stateKey = communityProjectionKey({ initialPost, viewer })
  return <CommunityDetailClientState key={stateKey} initialPost={initialPost} viewer={viewer} />
}

function CommunityDetailClientState({
  initialPost,
  viewer,
}: {
  initialPost: CommunityPost
  viewer: CommunityViewer
}) {
  const router = useRouter()
  const [post, setPost] = useState(initialPost)
  const [replies, setReplies] = useState(initialPost.replies)
  const [replyCursor, setReplyCursor] = useState(initialPost.replyCursor)
  const [replyCount, setReplyCount] = useState(initialPost.replyCount ?? initialPost.replies.length)
  const [replyDrafts, setReplyDrafts] = useState<Record<ReplyTarget, string>>({})
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(ROOT_REPLY)
  const [editingReply, setEditingReply] = useState<string | null>(null)
  const [editingBody, setEditingBody] = useState("")
  const [reportTarget, setReportTarget] = useState<"post" | string | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [error, setError] = useState("")
  const [errorScope, setErrorScope] = useState("")
  const [pending, startTransition] = useTransition()
  const [loadingReplies, startLoadingReplies] = useTransition()
  const [tryAcquireMutation, releaseMutation] = useCommunityActionLock()
  const [tryAcquireReplyPageLoad, releaseReplyPageLoad] = useCommunityActionLock()
  const requestKeys = useRef<Record<string, string>>({})

  function setFailure(message: string, scope = "") {
    setError(message)
    setErrorScope(scope)
  }

  function requireParticipant(scope = ""): boolean {
    if (viewer.canParticipate) return true
    setFailure(
      participationMessage(viewer.role) ?? "Community participation is unavailable.",
      scope,
    )
    return false
  }

  function reactToPost(kind: "vote" | "bookmark") {
    if (!requireParticipant() || !tryAcquireMutation()) return
    const previous = post
    const optimistic =
      kind === "vote"
        ? { ...post, voted: !post.voted, votes: post.votes + (post.voted ? -1 : 1) }
        : { ...post, saved: !post.saved }
    setPost(optimistic)
    setError("")
    startTransition(async () => {
      try {
        const result =
          kind === "vote"
            ? await setCommunityVote(post.id, optimistic.voted)
            : await setCommunityBookmark(post.id, optimistic.saved)
        if (!result.ok) {
          setPost(previous)
          setFailure(actionMessage(result) ?? "Unable to update this post.")
          return
        }
        setPost((current) => applyCommunityPostReaction(current, result.value))
      } catch {
        setPost(previous)
        setFailure("Unable to update this post. Please retry.")
      } finally {
        releaseMutation()
      }
    })
  }

  function submitReply(target: ReplyTarget) {
    const body = replyDrafts[target] ?? ""
    if (!requireParticipant(`reply:${target}`) || !body.trim() || !tryAcquireMutation()) return
    requestKeys.current[target] ??= newCommunityRequestKey()
    setError("")
    startTransition(async () => {
      try {
        const result = await replyToCommunityPost(
          post.id,
          body,
          requestKeys.current[target]!,
          target === ROOT_REPLY ? undefined : target,
        )
        if (!result.ok) {
          setFailure(actionMessage(result) ?? "Unable to post this reply.", `reply:${target}`)
          return
        }
        delete requestKeys.current[target]
        setReplies((current) => mergeReplies(current, [result.value]))
        setReplyCount((count) => count + 1)
        setReplyDrafts((current) => ({ ...current, [target]: "" }))
        setReplyTarget(ROOT_REPLY)
        toast.success("Reply posted.")
      } catch {
        // Retain the idempotency key and text: retrying after a transport
        // failure cannot create a second reply.
        setFailure("Unable to post this reply. Please retry.", `reply:${target}`)
      } finally {
        releaseMutation()
      }
    })
  }

  function beginEdit(reply: CommunityReply) {
    setEditingReply(reply.id)
    setEditingBody(reply.body)
    setError("")
  }

  function saveReply(reply: CommunityReply) {
    if (!requireParticipant(`edit:${reply.id}`) || !editingBody.trim() || !tryAcquireMutation())
      return
    setError("")
    startTransition(async () => {
      try {
        const result = await editCommunityReply(reply.id, editingBody, reply.version ?? 1)
        if (!result.ok) {
          setFailure(actionMessage(result) ?? "Unable to edit this reply.", `edit:${reply.id}`)
          return
        }
        // The mutation canonicalizes whitespace and increments the version. A
        // later navigation remains authoritative if a moderator changes it again.
        setReplies((current) =>
          current.map((item) =>
            item.id === reply.id
              ? { ...item, body: editingBody.trim(), version: (item.version ?? 1) + 1 }
              : item,
          ),
        )
        setEditingReply(null)
        toast.success("Reply updated.")
      } catch {
        setFailure("Unable to edit this reply. Please retry.", `edit:${reply.id}`)
      } finally {
        releaseMutation()
      }
    })
  }

  function deleteReply(reply: CommunityReply) {
    if (!requireParticipant(`delete:${reply.id}`) || !tryAcquireMutation()) return
    setError("")
    startTransition(async () => {
      try {
        const result = await deleteCommunityReply(reply.id, reply.version ?? 1)
        if (!result.ok) {
          setFailure(actionMessage(result) ?? "Unable to delete this reply.", `delete:${reply.id}`)
          return
        }
        setReplies((current) =>
          current.map((item) =>
            item.id === reply.id
              ? {
                  ...item,
                  author: "",
                  authorId: "",
                  body: "",
                  state: "deleted",
                  version: (item.version ?? 1) + 1,
                }
              : item,
          ),
        )
        setReplyCount((count) => Math.max(0, count - 1))
        toast.success("Reply deleted.")
      } catch {
        setFailure("Unable to delete this reply. Please retry.", `delete:${reply.id}`)
      } finally {
        releaseMutation()
      }
    })
  }

  function submitReport() {
    if (!reportTarget || !requireParticipant(`report:${reportTarget}`) || !tryAcquireMutation())
      return
    setError("")
    startTransition(async () => {
      try {
        const result =
          reportTarget === "post"
            ? await reportCommunityPost(post.id, reportReason)
            : await reportCommunityReply(reportTarget, reportReason)
        if (!result.ok) {
          setFailure(
            actionMessage(result) ?? "Unable to submit this report.",
            `report:${reportTarget}`,
          )
          return
        }
        setReportTarget(null)
        setReportReason("")
        toast.success("Report submitted for moderator review.")
      } catch {
        setFailure("Unable to submit this report. Please retry.", `report:${reportTarget}`)
      } finally {
        releaseMutation()
      }
    })
  }

  function loadMoreReplies() {
    if (!replyCursor || loadingReplies || !tryAcquireReplyPageLoad()) return
    setError("")
    startLoadingReplies(async () => {
      try {
        const result = await loadMoreCommunityReplies(post.id, replyCursor)
        if (!result.ok) {
          setFailure(actionMessage(result) ?? "Unable to load more replies.", "more-replies")
          return
        }
        setReplies((current) => mergeReplies(current, result.value.replies))
        setReplyCursor(result.value.nextCursor)
      } catch {
        setFailure("Unable to load more replies. Please retry.", "more-replies")
      } finally {
        releaseReplyPageLoad()
      }
    })
  }

  function deletePost() {
    if (!tryAcquireMutation()) return
    setError("")
    startTransition(async () => {
      try {
        const result = await deleteCommunityPost(post.id, post.version)
        if (!result.ok) {
          setFailure(actionMessage(result) ?? "Unable to delete this post.")
          return
        }
        router.replace("/community")
      } catch {
        setFailure("Unable to delete this post. Please retry.")
      } finally {
        releaseMutation()
      }
    })
  }

  const childrenByParent = new Map<string, CommunityReply[]>()
  const roots: CommunityReply[] = []
  for (const reply of replies) {
    if (!reply.parentId) roots.push(reply)
    else
      childrenByParent.set(reply.parentId, [...(childrenByParent.get(reply.parentId) ?? []), reply])
  }
  const isPostAuthor = viewer.canParticipate && viewer.id === post.authorId
  // The server sends a hidden body only to an eligible moderator. Keep the
  // client presentation aligned with that authorization result so moderators
  // can review the context that led to a removal, while ordinary members keep
  // the existing redacted state.
  const moderatorCanReviewHiddenPost =
    post.state === "hidden" && viewer.role === "moderator" && viewer.canParticipate && !!post.body
  const canEditPost =
    isPostAuthor && post.state !== "hidden" && post.state !== "deleted" && !post.locked
  // A lock closes editing and replies; it does not revoke the author's
  // server-authorized ability to leave a tombstone by deleting their post.
  const canDeletePost = isPostAuthor && post.state !== "deleted"
  const repliesOpen = post.state === "public" && !post.locked
  const visiblePost =
    post.state === "public" ||
    (post.state === "pending" && !!post.body) ||
    moderatorCanReviewHiddenPost
  const deleteDialog = (
    <Dialog open={deleteOpen} onOpenChange={(open) => !pending && setDeleteOpen(open)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this post?</DialogTitle>
          <DialogDescription>
            The post will remain as a deleted placeholder so the conversation does not disappear.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setDeleteOpen(false)}>
            Keep it
          </Button>
          <Button disabled={pending} onClick={deletePost}>
            {pending ? "Deleting…" : "Delete post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (
    !visiblePost &&
    post.state === "hidden" &&
    viewer.canParticipate &&
    viewer.id === post.authorId
  )
    return (
      <>
        <Button asChild variant="ghost" className="c-text-button">
          <Link href="/community">← Back to community</Link>
        </Button>
        <CommunityState title="Post hidden">
          This post is not publicly available. You can still delete your own hidden post.
        </CommunityState>
        <Button variant="outline" disabled={pending} onClick={() => setDeleteOpen(true)}>
          Delete post
        </Button>
        {deleteDialog}
      </>
    )
  if (!visiblePost)
    return (
      <CommunityState title={post.state === "deleted" ? "Post deleted" : "Post hidden"}>
        This content is not publicly available.
      </CommunityState>
    )

  return (
    <>
      <Button asChild variant="ghost" className="c-text-button">
        <Link href="/community">← Back to community</Link>
      </Button>
      {error && (
        <p className="c-error" role="alert">
          {error}
        </p>
      )}
      <PostMeta post={post} />
      <h1 tabIndex={-1}>{post.title || `${post.type} update`}</h1>
      {moderatorCanReviewHiddenPost && (
        <section className="c-notice" role="status">
          <h2>Post hidden</h2>
          <p>
            This post is hidden from public view. You can review its retained context as a
            moderator.
          </p>
        </section>
      )}
      <div className="c-body c-markdown">
        <SafeMarkdown downgradeHeadings>{post.body}</SafeMarkdown>
      </div>
      <ProductContextCard post={post} />
      {post.state === "pending" && (
        <div className="c-notice">Only you and moderators can see this pending post.</div>
      )}
      {post.state === "public" && (
        <PostActions
          post={{ ...post, replies, replyCount }}
          pending={pending}
          onVote={() => reactToPost("vote")}
          onSave={() => reactToPost("bookmark")}
        />
      )}
      <div className="c-actions">
        {canEditPost && (
          <Button asChild variant="outline">
            <Link href={`${communityPostHref(post.id)}/edit`}>Edit post</Link>
          </Button>
        )}
        {canDeletePost && (
          <Button variant="outline" disabled={pending} onClick={() => setDeleteOpen(true)}>
            Delete post
          </Button>
        )}
        {post.state === "public" && viewer.canParticipate && viewer.id !== post.authorId && (
          <Button variant="ghost" disabled={pending} onClick={() => setReportTarget("post")}>
            Report post
          </Button>
        )}
      </div>

      {reportTarget === "post" && (
        <section className="c-report" aria-label="Report post">
          <label className="c-field">
            Report reason
            <Textarea
              value={reportReason}
              maxLength={1000}
              disabled={pending}
              onChange={(event) => setReportReason(event.target.value)}
            />
          </label>
          <div className="c-actions">
            <Button
              className="c-button"
              disabled={pending || reportReason.trim().length < 10}
              onClick={submitReport}
            >
              Submit report
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setReportTarget(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}

      <h2>Replies · {replyCount}</h2>
      {roots.map((reply) => (
        <ReplyItem
          key={reply.id}
          reply={reply}
          viewer={viewer}
          repliesOpen={repliesOpen}
          editing={editingReply === reply.id}
          editBody={editingBody}
          pending={pending}
          onEditBodyChange={setEditingBody}
          onSaveEdit={() => (editingReply === reply.id ? saveReply(reply) : beginEdit(reply))}
          onCancelEdit={() => setEditingReply(null)}
          onDelete={() => deleteReply(reply)}
          onReply={() => setReplyTarget(reply.id)}
          onReport={() => setReportTarget(reply.id)}
        >
          {reportTarget === reply.id && (
            <section
              className="c-report c-reply-report"
              aria-label={`Report reply from ${reply.author}`}
            >
              <label className="c-field">
                Report reason
                <Textarea
                  value={reportReason}
                  maxLength={1000}
                  disabled={pending}
                  onChange={(event) => setReportReason(event.target.value)}
                />
              </label>
              <div className="c-actions">
                <Button
                  className="c-button"
                  disabled={pending || reportReason.trim().length < 10}
                  onClick={submitReport}
                >
                  Submit report
                </Button>
                <Button variant="ghost" disabled={pending} onClick={() => setReportTarget(null)}>
                  Cancel
                </Button>
              </div>
            </section>
          )}
          {replyTarget === reply.id && repliesOpen && viewer.canParticipate && (
            <ReplyComposer
              value={replyDrafts[reply.id] ?? ""}
              onChange={(value) => {
                delete requestKeys.current[reply.id]
                setReplyDrafts((drafts) => ({ ...drafts, [reply.id]: value }))
              }}
              pending={pending}
              error={errorScope === `reply:${reply.id}` ? error : ""}
              onSubmit={() => submitReply(reply.id)}
            />
          )}
          {(childrenByParent.get(reply.id) ?? []).map((child) => (
            <div className="c-reply-children" key={child.id}>
              <ReplyItem
                reply={child}
                viewer={viewer}
                repliesOpen={repliesOpen}
                editing={editingReply === child.id}
                editBody={editingBody}
                pending={pending}
                onEditBodyChange={setEditingBody}
                onSaveEdit={() => (editingReply === child.id ? saveReply(child) : beginEdit(child))}
                onCancelEdit={() => setEditingReply(null)}
                onDelete={() => deleteReply(child)}
                onReply={() => undefined}
                onReport={() => setReportTarget(child.id)}
              >
                {reportTarget === child.id && (
                  <section
                    className="c-report c-reply-report"
                    aria-label={`Report reply from ${child.author}`}
                  >
                    <label className="c-field">
                      Report reason
                      <Textarea
                        value={reportReason}
                        maxLength={1000}
                        disabled={pending}
                        onChange={(event) => setReportReason(event.target.value)}
                      />
                    </label>
                    <div className="c-actions">
                      <Button
                        className="c-button"
                        disabled={pending || reportReason.trim().length < 10}
                        onClick={submitReport}
                      >
                        Submit report
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setReportTarget(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </section>
                )}
              </ReplyItem>
            </div>
          ))}
        </ReplyItem>
      ))}
      {replyCursor && (
        <Button className="c-button" disabled={loadingReplies} onClick={loadMoreReplies}>
          {loadingReplies ? "Loading replies…" : "Load more replies"}
        </Button>
      )}
      <CommunityParticipationGate viewer={viewer} />
      {!repliesOpen ? (
        <div className="c-notice">Replies are closed for this post.</div>
      ) : (
        viewer.canParticipate &&
        replyTarget === ROOT_REPLY && (
          <ReplyComposer
            value={replyDrafts[ROOT_REPLY] ?? ""}
            onChange={(value) => {
              delete requestKeys.current[ROOT_REPLY]
              setReplyDrafts((drafts) => ({ ...drafts, [ROOT_REPLY]: value }))
            }}
            pending={pending}
            error={errorScope === `reply:${ROOT_REPLY}` ? error : ""}
            onSubmit={() => submitReply(ROOT_REPLY)}
          />
        )
      )}
      {deleteDialog}
    </>
  )
}
