"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { ContentRenderer } from "@fuma-comment/react/atom"
import { RiDeleteBinLine, RiReplyLine, RiThumbDownLine, RiThumbUpLine } from "@remixicon/react"
import type { JSONContent } from "@tiptap/react"
import { useFormatter, useNow, useTranslations } from "next-intl"
import { toast } from "sonner"

import { poolAvatarUrl } from "@/lib/avatar-pool"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface AuthorInfo {
  id: string
  name: string
  image?: string
}

interface CommentRow {
  id: string
  author: AuthorInfo
  content: JSONContent
  likes: number
  dislikes: number
  replies: number
  timestamp: string
  page: string
  threadId?: string
  liked?: boolean
}

interface AuthInfo {
  id: string
  permissions?: { delete?: boolean }
}

interface TranslatedCommentsProps {
  projectId: string
  placeholder: string
  className?: string
  currentUserId?: string | null
}

const API_BASE = "/api/comments"

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `${res.status} ${res.statusText}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function TranslatedComments({
  projectId,
  placeholder,
  className,
  currentUserId,
}: TranslatedCommentsProps) {
  const router = useRouter()
  const t = useTranslations("project.comments")
  const [comments, setComments] = useState<CommentRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [auth, setAuth] = useState<AuthInfo | null>(null)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const signIn = useCallback(() => router.push("/sign-in"), [router])

  // Load comments + auth
  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([
      fetchJson<CommentRow[]>(`${API_BASE}/${projectId}?sort=newest`),
      fetchJson<AuthInfo | null>(`${API_BASE}/${projectId}/auth`).catch(() => null),
    ])
      .then(([list, authInfo]) => {
        if (cancelled) return
        setComments(list)
        setAuth(authInfo ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : t("loadFailed"))
      })
    return () => {
      cancelled = true
    }
  }, [projectId, refreshKey, t])

  // Group replies under their parent for flat-with-thread display
  const { topLevel, repliesByThread } = useMemo(() => {
    const top: CommentRow[] = []
    const byThread: Record<string, CommentRow[]> = {}
    if (comments) {
      for (const c of comments) {
        if (c.threadId) {
          ;(byThread[c.threadId] ||= []).push(c)
        } else {
          top.push(c)
        }
      }
      // Replies oldest first within thread
      for (const k of Object.keys(byThread)) {
        byThread[k].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp))
      }
    }
    return { topLevel: top, repliesByThread: byThread }
  }, [comments])

  const handleRate = useCallback(
    async (id: string, like: boolean, currentLiked: boolean | undefined) => {
      try {
        // If user already chose this side, remove rating; otherwise set it
        if (currentLiked === like) {
          await fetchJson(`${API_BASE}/${projectId}/${id}/rate`, { method: "DELETE" })
        } else {
          await fetchJson(`${API_BASE}/${projectId}/${id}/rate`, {
            method: "POST",
            body: JSON.stringify({ like }),
          })
        }
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("rateError"))
      }
    },
    [projectId, refresh, t],
  )

  const handleDelete = useCallback(
    async (id: string) => {
      if (typeof window !== "undefined" && !window.confirm(t("deleteConfirm"))) return
      try {
        await fetchJson(`${API_BASE}/${projectId}/${id}`, { method: "DELETE" })
        toast.success(t("deleteSuccess"))
        refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("deleteError"))
      }
    },
    [projectId, refresh, t],
  )

  if (error) {
    return (
      <div
        className={cn(
          "border-border/40 text-muted-foreground rounded-lg border p-6 text-center text-sm",
          className,
        )}
      >
        {error}
      </div>
    )
  }

  if (comments === null) {
    return (
      <div className={cn("mt-8 animate-pulse", className)}>
        <div className="mb-4 h-6 w-32 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div className="mb-2.5 h-24 rounded bg-gray-200 dark:bg-gray-700"></div>
        <div className="h-10 w-20 rounded bg-gray-200 dark:bg-gray-700"></div>
      </div>
    )
  }

  return (
    <div
      className={cn("relative z-10 mt-8 space-y-4", className)}
      data-fuma-comment-container="true"
    >
      {/* New comment form */}
      {currentUserId ? (
        <PostForm projectId={projectId} placeholder={placeholder} onPosted={refresh} />
      ) : (
        <Button variant="outline" size="sm" onClick={signIn}>
          {t("signInPrompt")}
        </Button>
      )}

      {/* List */}
      {topLevel.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">{t("noComments")}</p>
      ) : (
        <div className="space-y-3">
          {topLevel.map((c) => (
            <CommentRowView
              key={c.id}
              comment={c}
              replies={repliesByThread[c.id] ?? []}
              isOwner={auth?.id === c.author.id}
              isAuth={!!auth}
              isEditing={editingId === c.id}
              isReplying={replyTo === c.id}
              onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
              onCancelReply={() => setReplyTo(null)}
              onReplied={() => {
                setReplyTo(null)
                refresh()
              }}
              onRate={handleRate}
              onDelete={handleDelete}
              onEdit={() => setEditingId(editingId === c.id ? null : c.id)}
              onCancelEdit={() => setEditingId(null)}
              onEdited={() => {
                setEditingId(null)
                refresh()
              }}
              projectId={projectId}
              placeholder={placeholder}
              authUserId={auth?.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PostForm({
  projectId,
  placeholder,
  onPosted,
}: {
  projectId: string
  placeholder: string
  onPosted: () => void
}) {
  const t = useTranslations("project.comments")
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const content: JSONContent = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: trimmed }] }],
      }
      const res = await fetch(`${API_BASE}/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error(await res.text())
      setText("")
      onPosted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("rateError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        className="border-border/40 bg-background focus:ring-primary/20 min-h-[88px] w-full rounded-md border p-3 text-sm focus:ring-2 focus:outline-none"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={submitting}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={submitting || !text.trim()}>
          {t("send")}
        </Button>
      </div>
    </div>
  )
}

interface CommentRowViewProps {
  comment: CommentRow
  replies: CommentRow[]
  isOwner: boolean
  isAuth: boolean
  isEditing: boolean
  isReplying: boolean
  onReply: () => void
  onCancelReply: () => void
  onReplied: () => void
  onRate: (id: string, like: boolean, currentLiked: boolean | undefined) => void
  onDelete: (id: string) => void
  onEdit: () => void
  onCancelEdit: () => void
  onEdited: () => void
  projectId: string
  placeholder: string
  authUserId?: string
}

function CommentRowView({
  comment,
  replies,
  isOwner,
  isAuth,
  isReplying,
  onReply,
  onCancelReply,
  onReplied,
  onRate,
  onDelete,
  projectId,
  placeholder,
  authUserId,
}: CommentRowViewProps) {
  const t = useTranslations("project.comments")
  const formatter = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const timestamp = useMemo(() => new Date(comment.timestamp), [comment.timestamp])
  const liked = comment.liked === true
  const disliked = comment.liked === false

  return (
    <div className="border-border/40 bg-background rounded-lg border p-4">
      <div className="flex items-start gap-3">
        {/* Avatar — falls back to a pre-generated boring-avatar from the
            shared pool when the user has no stored image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={comment.author.image ?? poolAvatarUrl(comment.author.id)}
          alt={comment.author.name}
          className="h-8 w-8 shrink-0 rounded-full"
        />

        <div className="min-w-0 flex-1">
          {/* Header: name + time */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground truncate text-sm font-medium">
              {comment.author.name}
            </span>
            <span className="text-muted-foreground text-xs">
              {formatter.relativeTime(timestamp, now)}
            </span>
          </div>

          {/* Content */}
          <div className="text-foreground/90 mt-2 text-sm">
            <ContentRenderer content={comment.content} />
          </div>

          {/* Actions */}
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-xs", liked && "text-primary")}
              disabled={!isAuth}
              onClick={() => onRate(comment.id, true, comment.liked)}
              aria-label={t("like")}
            >
              <RiThumbUpLine className="h-3.5 w-3.5" />
              <span>{comment.likes}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("h-7 gap-1 px-2 text-xs", disliked && "text-destructive")}
              disabled={!isAuth}
              onClick={() => onRate(comment.id, false, comment.liked)}
              aria-label={t("dislike")}
            >
              <RiThumbDownLine className="h-3.5 w-3.5" />
              <span>{comment.dislikes}</span>
            </Button>
            {isAuth && !comment.threadId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={onReply}
              >
                <RiReplyLine className="h-3.5 w-3.5" />
                <span>{t("reply")}</span>
              </Button>
            )}
            {isOwner && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-7 gap-1 px-2 text-xs"
                onClick={() => onDelete(comment.id)}
              >
                <RiDeleteBinLine className="h-3.5 w-3.5" />
                <span>{t("delete")}</span>
              </Button>
            )}
          </div>

          {/* Reply form */}
          {isReplying && (
            <div className="mt-3">
              <ReplyForm
                projectId={projectId}
                threadId={comment.id}
                placeholder={t("replyingTo", { name: comment.author.name })}
                onCancel={onCancelReply}
                onPosted={onReplied}
              />
            </div>
          )}

          {/* Replies (flat) */}
          {replies.length > 0 && (
            <div className="border-border/40 mt-3 space-y-3 border-l pl-4">
              {replies.map((r) => (
                <ReplyView
                  key={r.id}
                  comment={r}
                  isOwner={authUserId === r.author.id}
                  isAuth={isAuth}
                  onRate={onRate}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}

          {/* Avoid unused variable warnings for handlers we may wire to edit later */}
          {placeholder ? null : null}
        </div>
      </div>
    </div>
  )
}

function ReplyView({
  comment,
  isOwner,
  isAuth,
  onRate,
  onDelete,
}: {
  comment: CommentRow
  isOwner: boolean
  isAuth: boolean
  onRate: (id: string, like: boolean, currentLiked: boolean | undefined) => void
  onDelete: (id: string) => void
}) {
  const t = useTranslations("project.comments")
  const formatter = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const timestamp = useMemo(() => new Date(comment.timestamp), [comment.timestamp])
  const liked = comment.liked === true
  const disliked = comment.liked === false
  return (
    <div className="flex items-start gap-2">
      {comment.author.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={comment.author.image}
          alt={comment.author.name}
          className="h-6 w-6 shrink-0 rounded-full"
        />
      ) : (
        <div className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium">
          {comment.author.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-foreground truncate text-xs font-medium">
            {comment.author.name}
          </span>
          <span className="text-muted-foreground text-[11px]">
            {formatter.relativeTime(timestamp, now)}
          </span>
        </div>
        <div className="text-foreground/90 mt-1 text-sm">
          <ContentRenderer content={comment.content} />
        </div>
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 gap-1 px-2 text-[11px]", liked && "text-primary")}
            disabled={!isAuth}
            onClick={() => onRate(comment.id, true, comment.liked)}
            aria-label={t("like")}
          >
            <RiThumbUpLine className="h-3 w-3" />
            <span>{comment.likes}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 gap-1 px-2 text-[11px]", disliked && "text-destructive")}
            disabled={!isAuth}
            onClick={() => onRate(comment.id, false, comment.liked)}
            aria-label={t("dislike")}
          >
            <RiThumbDownLine className="h-3 w-3" />
            <span>{comment.dislikes}</span>
          </Button>
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive h-6 gap-1 px-2 text-[11px]"
              onClick={() => onDelete(comment.id)}
            >
              <RiDeleteBinLine className="h-3 w-3" />
              <span>{t("delete")}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function ReplyForm({
  projectId,
  threadId,
  placeholder,
  onCancel,
  onPosted,
}: {
  projectId: string
  threadId: string
  placeholder: string
  onCancel: () => void
  onPosted: () => void
}) {
  const t = useTranslations("project.comments")
  const [text, setText] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setSubmitting(true)
    try {
      const content: JSONContent = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: trimmed }] }],
      }
      const res = await fetch(`${API_BASE}/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, thread: threadId }),
      })
      if (!res.ok) throw new Error(await res.text())
      setText("")
      onPosted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("rateError"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        className="border-border/40 bg-background focus:ring-primary/20 min-h-[80px] w-full rounded-md border p-2 text-sm focus:ring-2 focus:outline-none"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={submitting}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          {t("cancel")}
        </Button>
        <Button size="sm" onClick={submit} disabled={submitting || !text.trim()}>
          {t("send")}
        </Button>
      </div>
    </div>
  )
}
