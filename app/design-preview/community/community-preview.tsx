"use client"

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

import {
  applyCommunityPostReaction,
  CommunityError,
  emptyDraft,
  participationMessage,
  postTypes,
  type CommunityPost,
  type CommunityPostReaction,
  type FeedPage,
  type FeedQuery,
  type MemberRole,
  type PostDraft,
} from "@/lib/community/contracts"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CommunityShell,
  CommunityState,
  ParticipationNotice,
  PostActions,
  PostCard,
  PostMeta,
  PostTypeNav,
  ProductContextCard,
} from "@/components/community/community-ui"
import { PostComposer, ReplyComposer } from "@/components/community/post-composer"

import { createCommunityDemoAdapter } from "./demo-adapter"
import { createDemoPosts, demoProducts } from "./fixtures"

const ModerationPanel = lazy(() => import("@/components/community/moderation-panel"))
const subscribe = (callback: () => void) => {
  window.addEventListener("hashchange", callback)
  return () => window.removeEventListener("hashchange", callback)
}
const snapshot = () => location.hash.slice(1)
const serverSnapshot = () => ""
function parseQuery(route: string): FeedQuery {
  const params = new URLSearchParams(route.startsWith("?") ? route.slice(1) : "")
  return {
    type: postTypes.find((type) => type.toLowerCase() === params.get("type")) ?? "All",
    view: params.get("view") === "mine" ? "mine" : params.get("view") === "saved" ? "saved" : "all",
    sort: params.get("sort") === "hot" ? "Hot" : "Latest",
    search: (params.get("q") ?? "").slice(0, 200),
  }
}
function queryHash(query: FeedQuery) {
  const params = new URLSearchParams()
  if (query.type !== "All") params.set("type", query.type.toLowerCase())
  if (query.view !== "all") params.set("view", query.view)
  if (query.sort !== "Latest") params.set("sort", query.sort.toLowerCase())
  if (query.search) params.set("q", query.search)
  return params.size ? "?" + params.toString() : ""
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again."

export function CommunityPreview({ showHeader = true }: { showHeader?: boolean }) {
  const [adapter] = useState(() => createCommunityDemoAdapter())
  const service = adapter.service
  const route = useSyncExternalStore(subscribe, snapshot, serverSnapshot)
  const isFeed = !route || route.startsWith("?")
  const [role, setRole] = useState<MemberRole>("member")
  const [revision, setRevision] = useState(0)
  const [lastFeed, setLastFeed] = useState<FeedQuery>(() => parseQuery(""))
  const query = isFeed ? parseQuery(route) : lastFeed
  const queryKey = JSON.stringify(query)
  const postId = route.startsWith("post/") || route.startsWith("edit/") ? route.split("/")[1] : ""
  const [page, setPage] = useState<FeedPage>(() => ({ posts: createDemoPosts().slice(0, 3) }))
  const [post, setPost] = useState<CommunityPost | null>(null)
  const resourceKey = `${isFeed ? queryKey : postId}:${role}:${revision}`
  // The fixture page is only a visual placeholder. Mark the first request as
  // pending too, so controls never operate on a partial page before its cursor
  // snapshot has arrived.
  const [loadedKey, setLoadedKey] = useState("")
  const loading = resourceKey !== loadedKey
  const [paging, setPaging] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [actionError, setActionError] = useState("")
  const [actionCode, setActionCode] = useState("")
  const [pagingError, setPagingError] = useState("")
  const [notice, setNotice] = useState("")
  const [pending, setPending] = useState(false)
  const [draft, setDraft] = useState<PostDraft>(emptyDraft)
  const [editDrafts, setEditDrafts] = useState<Record<string, PostDraft>>({})
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<"discard" | "delete" | null>(null)
  const [reporting, setReporting] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const lock = useRef(false)
  const pagingLock = useRef(false)
  const generation = useRef(0)
  const currentRoute = useRef(route)
  const focusAfterNavigation = useRef(false)
  const ids = useRef(0)
  const requestId = useRef<string | null>(null)
  const mounted = useRef(true)
  const confirmTrigger = useRef<HTMLElement | null>(null)
  const editVersions = useRef<Record<string, number>>({})
  const replyKeys = useRef<Record<string, string>>({})
  const openConfirm = (value: "discard" | "delete") => {
    confirmTrigger.current = document.activeElement as HTMLElement | null
    setConfirm(value)
  }
  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const changeFeed = (next: FeedQuery) => {
    setLastFeed(next)
    window.location.assign("#" + queryHash(next))
  }
  const go = (next: string) => {
    window.location.assign("#" + next)
  }
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    const onRoute = () => {
      currentRoute.current = snapshot()
      focusAfterNavigation.current = true
      if (!snapshot() || snapshot().startsWith("?")) setLastFeed(parseQuery(snapshot()))
      setActionError("")
      setActionCode("")
      setPagingError("")
      setNotice("")
      setReporting(false)
      setReportReason("")
      setConfirm(null)
    }
    window.addEventListener("hashchange", onRoute)
    return () => window.removeEventListener("hashchange", onRoute)
  }, [])
  useEffect(() => {
    if (!loading && focusAfterNavigation.current) {
      document.querySelector<HTMLElement>("#community-content h1")?.focus({ preventScroll: true })
      focusAfterNavigation.current = false
    }
  }, [route, loading])
  useEffect(() => {
    const request = ++generation.current
    let cancelled = false
    const read = isFeed
      ? service.list(JSON.parse(queryKey))
      : postId
        ? service.get(postId)
        : Promise.resolve(null)
    void read
      .then((value) => {
        if (cancelled) return
        setLoadError("")
        if (value && "posts" in value) setPage(value)
        else setPost(value)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(resourceKey)
      })
    return () => {
      cancelled = true
      generation.current = request + 1
    }
  }, [isFeed, postId, queryKey, resourceKey, service])
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (
        draft.body ||
        draft.title ||
        Object.keys(editDrafts).length ||
        Object.values(replyDrafts).some(Boolean)
      )
        event.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [draft, editDrafts, replyDrafts])
  async function run(operation: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setPending(true)
    setActionError("")
    setActionCode("")
    const actionRoute = currentRoute.current
    try {
      await operation()
    } catch (error) {
      if (mounted.current && currentRoute.current === actionRoute) {
        setActionError(errorMessage(error))
        setActionCode(error instanceof CommunityError ? error.code : "retryable")
      }
    } finally {
      lock.current = false
      if (mounted.current) setPending(false)
    }
  }
  async function nextPage() {
    if (paging || !page.nextCursor || pagingLock.current) return
    pagingLock.current = true
    const request = generation.current
    setPaging(true)
    setPagingError("")
    try {
      const next = await service.list({ ...query, cursor: page.nextCursor })
      if (generation.current === request)
        setPage((previous) => ({
          posts: [
            ...previous.posts,
            ...next.posts.filter((post) => !previous.posts.some((old) => old.id === post.id)),
          ],
          nextCursor: next.nextCursor,
        }))
    } catch (error) {
      if (generation.current === request) setPagingError(errorMessage(error))
    } finally {
      pagingLock.current = false
      setPaging(false)
    }
  }
  function replacePost(updated: CommunityPost) {
    setPage((previous) => ({
      ...previous,
      posts: previous.posts
        .map((post) => (post.id === updated.id ? updated : post))
        .filter((post) => query.view !== "saved" || post.saved),
    }))
    setPost((previous) => (previous?.id === updated.id ? updated : previous))
  }
  function replaceReaction(reaction: CommunityPostReaction) {
    setPage((previous) => ({
      ...previous,
      posts: previous.posts
        .map((post) => applyCommunityPostReaction(post, reaction))
        .filter((post) => query.view !== "saved" || post.saved),
    }))
    setPost((previous) => (previous ? applyCommunityPostReaction(previous, reaction) : previous))
  }
  function reactToPost(item: CommunityPost, kind: "vote" | "save") {
    const message = participationMessage(role)
    if (message) {
      setActionError(message)
      return
    }
    void run(async () => {
      const actionGeneration = generation.current
      const optimistic =
        kind === "vote"
          ? { ...item, voted: !item.voted, votes: item.votes + (item.voted ? -1 : 1) }
          : { ...item, saved: !item.saved }
      // Keep saved rows until confirmation so a failed removal can roll back in place.
      setPage((previous) => ({
        ...previous,
        posts: previous.posts.map((post) => (post.id === item.id ? optimistic : post)),
      }))
      setPost((previous) => (previous?.id === item.id ? optimistic : previous))
      try {
        const updated = await (kind === "vote"
          ? service.setVote(item.id, optimistic.voted)
          : service.setBookmark(item.id, optimistic.saved))
        if (generation.current === actionGeneration) replaceReaction(updated)
        else refresh()
      } catch (error) {
        if (generation.current === actionGeneration) replacePost(item)
        throw error
      }
    })
  }
  function publish() {
    requestId.current ??= `publish-${++ids.current}`
    const key = requestId.current
    const origin = currentRoute.current
    void run(async () => {
      const created = await service.publish(draft, key)
      setDraft(emptyDraft())
      requestId.current = null
      if (currentRoute.current === origin) go(`post/${created.id}`)
      else {
        setNotice("Your update was published. Find it in My posts.")
        refresh()
      }
    })
  }
  const composer = (
    <>
      <ParticipationNotice role={role} />
      {!participationMessage(role) && (
        <>
          <PostComposer
            draft={draft}
            onChange={(value) => {
              setDraft(value)
              requestId.current = null
            }}
            products={demoProducts}
            pending={pending}
            error={actionError}
            onSubmit={publish}
            onSave={() =>
              void run(async () => {
                await service.saveDraft(draft)
                setNotice("Draft saved for this preview session.")
              })
            }
          />
          {(draft.body || draft.title) && (
            <Button variant="ghost" disabled={pending} onClick={() => openConfirm("discard")}>
              Discard draft
            </Button>
          )}
        </>
      )}
    </>
  )
  const back = (
    <button className="c-text-button" onClick={() => changeFeed(lastFeed)}>
      ← Back to feed
    </button>
  )
  const actions = (item: CommunityPost) => (
    <PostActions
      post={item}
      pending={pending}
      onVote={() => reactToPost(item, "vote")}
      onSave={() => reactToPost(item, "save")}
      onOpen={isFeed ? () => go(`post/${item.id}`) : undefined}
    />
  )
  function tools() {
    return (
      <details className="c-tools">
        <summary>Preview controls · role, loading, failure and moderation states</summary>
        <div className="c-tools-grid">
          <label>
            Viewer role
            <select
              aria-label="Viewer role"
              value={role}
              disabled={pending}
              onChange={(event) => {
                const value = event.target.value as MemberRole
                adapter.setRole(value)
                setRole(value)
                setActionError("")
              }}
            >
              {(["anonymous", "unverified", "member", "banned", "moderator"] as const).map(
                (role) => (
                  <option key={role}>{role}</option>
                ),
              )}
            </select>
          </label>
          <Button
            variant="outline"
            onClick={() => {
              adapter.failNext()
              setNotice("The next request will fail once. Retry will succeed.")
            }}
          >
            Fail next request
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              adapter.setEmpty(true)
              refresh()
            }}
          >
            Empty feed
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              adapter.setEmpty(false)
              refresh()
            }}
          >
            Restore feed
          </Button>
          <Button variant="outline" onClick={refresh}>
            Reload current view
          </Button>
          {route.startsWith("edit/") && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                adapter.setPostState(postId, "public")
                setNotice("The demo post version changed. Saving now will show conflict recovery.")
              }}
            >
              Simulate edit conflict
            </Button>
          )}
          <label>
            Post state
            <select
              aria-label="Post state"
              defaultValue=""
              disabled={pending}
              onChange={(event) => {
                const value = event.target.value
                if (!value) return
                const id = "small-release"
                if (value !== "missing")
                  adapter.setPostState(
                    id,
                    value as "public" | "pending" | "hidden" | "deleted" | "locked",
                  )
                go(`post/${value === "missing" ? "missing" : id}`)
                refresh()
                event.target.value = ""
              }}
            >
              <option value="">Choose a detail state</option>
              {["public", "pending", "hidden", "deleted", "locked", "missing"].map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
        </div>
        <small>
          All requests use an isolated in-memory adapter. No login, moderation or publishing reaches
          production.
        </small>
      </details>
    )
  }
  let content
  if (isFeed)
    content = (
      <>
        <h1 tabIndex={-1}>
          {query.view === "mine"
            ? "My posts"
            : query.view === "saved"
              ? "Saved posts"
              : "Build. Share. Keep going."}
        </h1>
        <p>Small releases, honest lessons, and what comes next.</p>
        {composer}
        {query.view === "mine" && !participationMessage(role) && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              void run(async () => {
                const saved = await service.getDraft()
                if (saved) {
                  setDraft(saved)
                  go("new")
                } else setNotice("No saved draft in this preview session.")
              })
            }
          >
            Open saved draft
          </Button>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            changeFeed({
              ...query,
              search: String(new FormData(event.currentTarget).get("search") ?? "").trim(),
              cursor: undefined,
            })
          }}
          className="c-field-pair"
        >
          <label className="c-field">
            Search posts or products
            <input
              key={query.search}
              name="search"
              defaultValue={query.search}
              maxLength={200}
              type="search"
            />
          </label>
          <Button variant="outline" style={{ alignSelf: "end", marginBottom: 12 }}>
            Search
          </Button>
        </form>
        <div className="c-toolbar">
          {(["Latest", "Hot"] as const).map((sort) => (
            <button
              key={sort}
              aria-pressed={query.sort === sort}
              onClick={() => changeFeed({ ...query, sort, cursor: undefined })}
            >
              {sort}
            </button>
          ))}
          <small>{loading ? "Loading…" : `${page.posts.length} posts shown`}</small>
        </div>
        {loading ? (
          <CommunityState title="Loading posts…" busy />
        ) : (
          <>
            {loadError && (
              <CommunityState title="Could not load posts" retry={refresh}>
                {loadError}
              </CommunityState>
            )}
            {!loadError && page.posts.length === 0 && (
              <CommunityState
                title={
                  query.search
                    ? "No matching posts"
                    : query.view === "saved"
                      ? "No saved posts yet"
                      : "No posts here yet"
                }
              >
                {query.search ? (
                  <button
                    className="c-text-button"
                    onClick={() => changeFeed({ ...query, search: "" })}
                  >
                    Clear search
                  </button>
                ) : (
                  "Share your next step, or save a useful conversation."
                )}
              </CommunityState>
            )}
            {!loadError &&
              page.posts.map((item) => (
                <PostCard post={item} key={item.id} onOpen={() => go(`post/${item.id}`)}>
                  {item.state === "public" ? (
                    actions(item)
                  ) : (
                    <Button variant="outline" onClick={() => go(`post/${item.id}`)}>
                      View post status
                    </Button>
                  )}
                </PostCard>
              ))}
            {pagingError && (
              <p className="c-error" role="alert">
                {pagingError}
              </p>
            )}
            {page.nextCursor && !loadError && (
              <Button className="c-button" disabled={paging} onClick={() => void nextPage()}>
                {paging ? "Loading more…" : pagingError ? "Retry loading more" : "Load more"}
              </Button>
            )}
          </>
        )}
      </>
    )
  else if (route === "new")
    content = (
      <>
        {back}
        <h1 tabIndex={-1}>Share your next step.</h1>
        {composer}
      </>
    )
  else if (route === "admin")
    content = (
      <>
        {back}
        {role === "moderator" ? (
          <Suspense fallback={<CommunityState title="Loading moderation tools…" busy />}>
            <ModerationPanel
              service={service}
              onChanged={() => setNotice("Demo moderation applied.")}
            />
          </Suspense>
        ) : (
          <CommunityState title="Moderator access required">
            Switch the preview role to moderator to review the tools.
          </CommunityState>
        )}
      </>
    )
  else if (postId) {
    if (loading)
      content = (
        <>
          {back}
          <CommunityState title="Loading post…" busy />
        </>
      )
    else if (loadError || !post)
      content = (
        <>
          {back}
          <CommunityState title="Post unavailable" retry={refresh}>
            {loadError || "Post not found."}
          </CommunityState>
        </>
      )
    else if (
      post.state === "deleted" ||
      post.state === "hidden" ||
      (post.state === "pending" && !post.body)
    )
      content = (
        <>
          {back}
          <h1 tabIndex={-1}>
            {post.state === "deleted"
              ? "Post deleted"
              : post.state === "hidden"
                ? "Post hidden"
                : "Post pending review"}
          </h1>
          <p>This content is not publicly available.</p>
        </>
      )
    else if (route.startsWith("edit/")) {
      const value = editDrafts[post.id] ?? {
        title: post.title,
        body: post.body,
        type: post.type,
        productId: post.product?.id ?? "",
      }
      content = (
        <>
          {back}
          <h1 tabIndex={-1}>Edit your update</h1>
          {post.authorId !== "you" || post.locked || participationMessage(role) ? (
            <CommunityState title="Editing unavailable">
              Only the author of an open post can edit it.
            </CommunityState>
          ) : (
            <PostComposer
              draft={value}
              products={demoProducts}
              pending={pending}
              error={actionError}
              editing
              onChange={(value) => {
                editVersions.current[post.id] ??= post.version
                setEditDrafts((previous) => ({ ...previous, [post.id]: value }))
              }}
              onSubmit={() =>
                void run(async () => {
                  const updated = await service.edit(
                    post.id,
                    value,
                    editVersions.current[post.id] ?? post.version,
                  )
                  delete editVersions.current[post.id]
                  setEditDrafts((previous) => {
                    const next = { ...previous }
                    delete next[post.id]
                    return next
                  })
                  setPost(updated)
                  go(`post/${post.id}`)
                })
              }
            />
          )}
          <Button variant="ghost" onClick={() => go(`post/${post.id}`)}>
            Back to post · keep edit draft
          </Button>
        </>
      )
    } else
      content = (
        <>
          {back}
          <PostMeta post={post} />
          <h1 tabIndex={-1}>{post.title || `${post.type} update`}</h1>
          <p className="c-body">{post.body}</p>
          <ProductContextCard post={post} />
          {post.state === "public" && actions(post)}
          {post.state === "pending" && (
            <div className="c-notice">Only you and moderators can see this pending post.</div>
          )}
          <div className="c-actions">
            {post.authorId === "you" && !participationMessage(role) && !post.locked && (
              <>
                <Button variant="outline" onClick={() => go(`edit/${post.id}`)}>
                  Edit post
                </Button>
                <Button variant="outline" onClick={() => openConfirm("delete")}>
                  Delete post
                </Button>
              </>
            )}
            {post.state === "public" && (
              <Button
                variant="ghost"
                onClick={() => {
                  const message = participationMessage(role)
                  if (message) setActionError(message)
                  else setReporting(true)
                }}
              >
                Report post
              </Button>
            )}
          </div>
          {reporting && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void run(async () => {
                  await service.report(post.id, reportReason)
                  setReporting(false)
                  setReportReason("")
                  setNotice("Report submitted for demo review.")
                })
              }}
            >
              <label className="c-field">
                Report reason
                <textarea
                  value={reportReason}
                  maxLength={1000}
                  onChange={(event) => setReportReason(event.target.value)}
                />
              </label>
              <Button className="c-button" disabled={pending}>
                Submit report
              </Button>
              <Button type="button" variant="ghost" onClick={() => setReporting(false)}>
                Cancel report
              </Button>
            </form>
          )}
          <h2>Replies · {post.replies.length}</h2>
          {post.replies.map((reply) => (
            <article className="c-reply" key={reply.id}>
              <strong>{reply.author}</strong>
              <p>{reply.body}</p>
            </article>
          ))}
          <ParticipationNotice role={role} />
          {post.locked || post.state !== "public" ? (
            <div className="c-notice">Replies are closed for this post.</div>
          ) : (
            !participationMessage(role) && (
              <ReplyComposer
                value={replyDrafts[post.id] ?? ""}
                onChange={(value) => {
                  delete replyKeys.current[post.id]
                  setReplyDrafts((previous) => ({ ...previous, [post.id]: value }))
                }}
                pending={pending}
                error={actionError}
                onSubmit={() =>
                  void run(async () => {
                    replyKeys.current[post.id] ??= `reply-${++ids.current}`
                    const updated = await service.reply(
                      post.id,
                      replyDrafts[post.id] ?? "",
                      replyKeys.current[post.id],
                    )
                    delete replyKeys.current[post.id]
                    replacePost(updated)
                    setReplyDrafts((previous) => ({ ...previous, [post.id]: "" }))
                    setNotice("Reply posted.")
                  })
                }
              />
            )
          )}
        </>
      )
  } else
    content = (
      <>
        {back}
        <h1 tabIndex={-1}>Page not found</h1>
        <p>Return to the community feed to continue.</p>
      </>
    )
  return (
    <CommunityShell
      showHeader={showHeader}
      tools={tools()}
      sidebar={
        <PostTypeNav query={query} role={role} onChange={changeFeed} onAdmin={() => go("admin")} />
      }
    >
      <div role="status" aria-live="polite">
        {notice && <p className="c-notice">{notice}</p>}
      </div>
      {actionError && (
        <p className="c-error" role="alert">
          {actionError}
        </p>
      )}
      {actionCode === "conflict" && route.startsWith("edit/") && (
        <Button
          variant="outline"
          onClick={() => {
            delete editVersions.current[postId]
            setEditDrafts((previous) => {
              const next = { ...previous }
              delete next[postId]
              return next
            })
            setActionError("")
            setActionCode("")
            refresh()
          }}
        >
          Discard edit draft and reload latest
        </Button>
      )}
      {content}
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirm(null)
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (confirmTrigger.current?.isConnected) confirmTrigger.current.focus()
            else document.querySelector<HTMLElement>("#community-content h1")?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {confirm === "delete" ? "Delete this demo post?" : "Discard your draft?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "delete"
                ? "The post will become a deleted placeholder in this preview."
                : "This clears the composer and its saved demo draft. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirm(null)}>
              Keep it
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  if (confirm === "delete" && post) {
                    await service.delete(post.id, post.version)
                    setConfirm(null)
                    refresh()
                  } else {
                    await service.saveDraft(emptyDraft())
                    setDraft(emptyDraft())
                    setConfirm(null)
                  }
                })
              }
            >
              {pending ? "Saving…" : confirm === "delete" ? "Delete post" : "Discard draft"}
            </Button>
          </DialogFooter>
          {actionError && <p role="alert">{actionError}</p>}
        </DialogContent>
      </Dialog>
    </CommunityShell>
  )
}
