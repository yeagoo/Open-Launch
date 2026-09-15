import {
  CommunityError,
  participationMessage,
  validateDraft,
  type CommunityPost,
  type CommunityReport,
  type CommunityService,
  type MemberRole,
  type ModerationAction,
  type PostDraft,
  type PostState,
} from "@/lib/community/contracts"

import { createDemoPosts, demoProducts } from "./fixtures"

/** Instance-scoped fixture service. Never used by a public community route. */
export function createCommunityDemoAdapter(latency = 300) {
  let posts = createDemoPosts()
  let role: MemberRole = "member"
  let failNext = false
  let empty = false
  let sequence = 0
  let storedDraft: PostDraft | null = null
  const receipts = new Map<string, CommunityPost>()
  const snapshots = new Map<string, { key: string; ids: string[] }>()
  const reports: CommunityReport[] = [
    {
      id: "report-1",
      postId: posts[0].id,
      reason: "Repeated promotional content",
      snapshot: posts[0].body,
      resolved: false,
    },
  ]
  const clone = <T>(value: T): T => structuredClone(value)
  const writeAccess = () => {
    const message = participationMessage(role)
    if (message)
      throw new CommunityError(role === "anonymous" ? "unauthorized" : "forbidden", message)
  }
  const adminAccess = () => {
    if (role !== "moderator") throw new CommunityError("forbidden", "Moderator access required.")
  }
  const wait = async () => {
    const shouldFail = failNext
    failNext = false
    await new Promise((resolve) => setTimeout(resolve, latency))
    if (shouldFail)
      throw new CommunityError(
        "retryable",
        "The demo request failed. Your input is safe; please retry.",
      )
  }
  const find = (id: string) => {
    const post = posts.find((post) => post.id === id)
    if (!post)
      throw new CommunityError(
        "missing",
        "Post not found. It may have been cleared by a preview reset.",
      )
    return post
  }
  const canRead = (post: CommunityPost) =>
    post.state === "public" ||
    role === "moderator" ||
    (post.state === "pending" && post.authorId === "you" && role !== "anonymous")
  const editable = (id: string, version: number) => {
    writeAccess()
    const post = find(id)
    if (post.authorId !== "you")
      throw new CommunityError("forbidden", "Only the author can edit this post.")
    if (!canRead(post) || post.state === "deleted" || post.state === "hidden" || post.locked)
      throw new CommunityError("forbidden", "This post is not open for editing.")
    if (post.version !== version)
      throw new CommunityError(
        "conflict",
        "This post changed. Reload the current version before editing.",
      )
    return post
  }
  const assertDraft = (draft: PostDraft) => {
    if (
      Object.keys(validateDraft(draft)).length ||
      (draft.productId && !demoProducts.some((product) => product.id === draft.productId))
    )
      throw new CommunityError("validation", "Check the post fields and product selection.")
  }
  const remember = (key: string, post: CommunityPost) => {
    receipts.set(key, clone(post))
    if (receipts.size > 200) receipts.delete(receipts.keys().next().value!)
    return clone(post)
  }
  const projectForViewer = (post: CommunityPost): CommunityPost => {
    if (!canRead(post) || post.state === "deleted")
      return {
        ...clone(post),
        title: "",
        body: "",
        author: post.authorId === "you" && role !== "anonymous" ? "You · Demo member" : "",
        authorId: post.authorId === "you" && role !== "anonymous" ? "you" : "",
        product: undefined,
        votes: 0,
        voted: false,
        saved: false,
        replies: [],
      }
    return clone(post)
  }
  const service: CommunityService = {
    async list(query) {
      await wait()
      if (query.view !== "all") writeAccess()
      const key = JSON.stringify({ ...query, cursor: undefined, role })
      let ids: string[],
        offset = 0,
        snapshotId: string
      if (query.cursor) {
        const [id, rawOffset] = query.cursor.split(":")
        const snapshot = snapshots.get(id)
        offset = Number(rawOffset)
        if (!snapshot || snapshot.key !== key || !Number.isInteger(offset) || offset < 0)
          throw new CommunityError("conflict", "This feed changed. Refresh to start again.")
        ids = snapshot.ids
        snapshotId = id
      } else {
        const filtered = (empty ? [] : posts).filter(
          (post) =>
            (query.view === "mine" ? post.authorId === "you" : post.state === "public") &&
            (query.view !== "saved" || post.saved) &&
            (query.type === "All" || post.type === query.type) &&
            `${post.title} ${post.body} ${post.product?.name ?? ""}`
              .toLowerCase()
              .includes(query.search.toLowerCase()),
        )
        filtered.sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            (query.sort === "Hot" ? b.votes - a.votes : b.createdAt - a.createdAt) ||
            a.id.localeCompare(b.id),
        )
        ids = filtered.map((post) => post.id)
        snapshotId = `snapshot-${++sequence}`
        snapshots.set(snapshotId, { key, ids })
        if (snapshots.size > 20) snapshots.delete(snapshots.keys().next().value!)
      }
      const pageIds = ids.slice(offset, offset + 3)
      return {
        posts: clone(
          pageIds
            .map(find)
            .filter((post) =>
              query.view === "mine" ? post.authorId === "you" : post.state === "public",
            )
            .map(projectForViewer),
        ),
        nextCursor: offset + 3 < ids.length ? `${snapshotId}:${offset + 3}` : undefined,
      }
    },
    async get(id) {
      await wait()
      return projectForViewer(find(id))
    },
    async saveDraft(draft) {
      await wait()
      writeAccess()
      if (draft.body.length > 10000 || draft.title.length > 160)
        throw new CommunityError("validation", "Draft exceeds the supported text limits.")
      storedDraft = draft.body.trim() || draft.title.trim() ? clone(draft) : null
    },
    async getDraft() {
      await wait()
      writeAccess()
      return clone(storedDraft)
    },
    async publish(draft, requestId) {
      await wait()
      writeAccess()
      assertDraft(draft)
      const key = `publish:${requestId}`
      if (receipts.has(key)) return clone(receipts.get(key)!)
      const post: CommunityPost = {
        id: `local-${++sequence}`,
        authorId: "you",
        author: "You · Demo member",
        type: draft.type,
        title: draft.title.trim(),
        body: draft.body.trim(),
        product: demoProducts.find((product) => product.id === draft.productId),
        votes: 0,
        voted: false,
        saved: false,
        replies: [],
        state: "public",
        locked: false,
        pinned: false,
        version: 1,
        createdAt: Math.max(Date.now(), ...posts.map((post) => post.createdAt)) + 1,
      }
      posts.unshift(post)
      storedDraft = null
      return remember(key, post)
    },
    async edit(id, draft, version) {
      await wait()
      assertDraft(draft)
      const post = editable(id, version)
      Object.assign(post, {
        title: draft.title.trim(),
        body: draft.body.trim(),
        type: draft.type,
        product: demoProducts.find((product) => product.id === draft.productId),
        version: post.version + 1,
      })
      return clone(post)
    },
    async delete(id, version) {
      await wait()
      const post = editable(id, version)
      post.state = "deleted"
      post.version++
    },
    async reply(id, body, requestId) {
      await wait()
      writeAccess()
      const post = find(id)
      if (post.state !== "public" || post.locked)
        throw new CommunityError("forbidden", "Replies are closed for this post.")
      if (!body.trim() || body.length > 4000)
        throw new CommunityError("validation", "Write a reply of 1–4,000 characters.")
      const key = `reply:${id}:${requestId}`
      if (receipts.has(key)) return clone(receipts.get(key)!)
      post.replies.push({
        id: `reply-${++sequence}`,
        author: "You · Demo member",
        body: body.trim(),
        createdAt: Date.now(),
      })
      return remember(key, post)
    },
    async setVote(id, desired) {
      await wait()
      writeAccess()
      const post = find(id)
      if (post.state !== "public")
        throw new CommunityError("forbidden", "This post is unavailable.")
      if (post.voted !== desired) {
        post.votes += desired ? 1 : -1
        post.voted = desired
      }
      return { id: post.id, kind: "vote", votes: post.votes, voted: post.voted }
    },
    async setBookmark(id, desired) {
      await wait()
      writeAccess()
      const post = find(id)
      if (post.state !== "public")
        throw new CommunityError("forbidden", "This post is unavailable.")
      post.saved = desired
      return { id: post.id, kind: "bookmark", saved: post.saved }
    },
    async report(id, reason) {
      await wait()
      writeAccess()
      const post = find(id)
      if (post.state !== "public")
        throw new CommunityError("forbidden", "This post is unavailable.")
      if (reason.trim().length < 10 || reason.length > 1000)
        throw new CommunityError("validation", "Give 10–1,000 characters of context.")
      if (!reports.some((report) => report.postId === id && !report.resolved))
        reports.push({
          id: `report-${++sequence}`,
          postId: id,
          reason: reason.trim(),
          snapshot: post.body,
          resolved: false,
        })
    },
    async reports() {
      await wait()
      adminAccess()
      return clone(reports)
    },
    async moderate(id, action: ModerationAction) {
      await wait()
      adminAccess()
      const post = find(id)
      if (action === "hide") post.state = "hidden"
      if (action === "restore") post.state = "public"
      if (action === "lock" || action === "unlock") post.locked = action === "lock"
      if (action === "pin" || action === "unpin") post.pinned = action === "pin"
      post.version++
    },
    async resolveReport(id) {
      await wait()
      adminAccess()
      const report = reports.find((report) => report.id === id)
      if (!report) throw new CommunityError("missing", "Report not found.")
      report.resolved = true
    },
  }
  return {
    service,
    setRole(value: MemberRole) {
      role = value
    },
    failNext() {
      failNext = true
    },
    setEmpty(value: boolean) {
      empty = value
    },
    setPostState(id: string, state: PostState | "locked") {
      const post = find(id)
      post.state = state === "locked" ? "public" : state
      post.locked = state === "locked"
      post.version++
    },
    reset() {
      posts = createDemoPosts()
      storedDraft = null
      receipts.clear()
      snapshots.clear()
      empty = false
      failNext = false
    },
  }
}
