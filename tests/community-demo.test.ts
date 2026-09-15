import { describe, expect, it } from "vitest"

import { emptyDraft, type FeedQuery } from "@/lib/community/contracts"
import { createCommunityDemoAdapter } from "@/app/design-preview/community/demo-adapter"

const query: FeedQuery = { view: "all", type: "All", sort: "Latest", search: "" }
const draft = { ...emptyDraft(), body: "A concrete release update with context for other makers." }

describe("community fixture service contract", () => {
  it("isolates instances and deduplicates retried publishing", async () => {
    const first = createCommunityDemoAdapter(0),
      second = createCommunityDemoAdapter(0)
    const a = await first.service.publish(draft, "same-request")
    const b = await first.service.publish(draft, "same-request")
    expect(a.id).toBe(b.id)
    expect((await first.service.list(query)).posts[0].id).toBe(a.id)
    await expect(second.service.get(a.id)).rejects.toMatchObject({ code: "missing" })
  })
  it("preserves a pagination snapshot while votes change", async () => {
    const { service } = createCommunityDemoAdapter(0)
    const first = await service.list({ ...query, sort: "Hot" })
    await service.setVote("this-week", true)
    const second = await service.list({ ...query, sort: "Hot", cursor: first.nextCursor })
    expect(new Set([...first.posts, ...second.posts].map((post) => post.id)).size).toBe(5)
    await expect(service.list({ ...query, cursor: first.nextCursor })).rejects.toMatchObject({
      code: "conflict",
    })
  })
  it("prevents hidden content and private drafts leaking after role changes", async () => {
    const adapter = createCommunityDemoAdapter(0)
    await adapter.service.saveDraft(draft)
    adapter.setPostState("small-release", "hidden")
    adapter.setRole("anonymous")
    expect((await adapter.service.get("small-release")).body).toBe("")
    expect(
      (await adapter.service.list(query)).posts.some((post) => post.id === "small-release"),
    ).toBe(false)
    await expect(adapter.service.getDraft()).rejects.toMatchObject({ code: "unauthorized" })
    await expect(adapter.service.publish(draft, "blocked")).rejects.toMatchObject({
      code: "unauthorized",
    })
    await expect(adapter.service.reports()).rejects.toMatchObject({ code: "forbidden" })
  })
  it("checks the current permission and lock after delayed requests", async () => {
    const adapter = createCommunityDemoAdapter(5)
    const pending = adapter.service.reply("small-release", "A helpful concrete reply.", "one")
    adapter.setPostState("small-release", "locked")
    await expect(pending).rejects.toMatchObject({ code: "forbidden" })
    adapter.setRole("unverified")
    await expect(adapter.service.setVote("first-users", true)).rejects.toMatchObject({
      code: "forbidden",
    })
  })
  it("uses desired-state votes, rejects stale edits and tombstones deletions", async () => {
    const { service } = createCommunityDemoAdapter(0)
    const post = await service.publish(draft, "new")
    await service.setVote(post.id, true)
    expect((await service.setVote(post.id, true)).votes).toBe(1)
    await service.edit(post.id, { ...draft, title: "A clearer title" }, post.version)
    await expect(service.edit(post.id, draft, post.version)).rejects.toMatchObject({
      code: "conflict",
    })
    await service.delete(post.id, post.version + 1)
    const removed = await service.get(post.id)
    expect(removed.state).toBe("deleted")
    expect(removed.body).toBe("")
  })
  it("supports retry after a failed write without losing a saved draft", async () => {
    const adapter = createCommunityDemoAdapter(0)
    await adapter.service.saveDraft(draft)
    adapter.failNext()
    await expect(adapter.service.publish(draft, "retry")).rejects.toMatchObject({
      code: "retryable",
    })
    expect(await adapter.service.getDraft()).toEqual(draft)
    await adapter.service.publish(draft, "retry")
    expect(await adapter.service.getDraft()).toBe(null)
  })
  it("validates product association and supports moderation transitions", async () => {
    const adapter = createCommunityDemoAdapter(0)
    await expect(
      adapter.service.publish({ ...draft, productId: "not-a-product" }, "invalid"),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(adapter.service.edit("small-release", draft, 1)).rejects.toMatchObject({
      code: "forbidden",
    })
    adapter.setRole("moderator")
    await adapter.service.moderate("small-release", "hide")
    await adapter.service.moderate("small-release", "lock")
    await adapter.service.moderate("small-release", "pin")
    await adapter.service.moderate("small-release", "restore")
    const post = await adapter.service.get("small-release")
    expect(post).toMatchObject({ state: "public", locked: true, pinned: true })
    await adapter.service.resolveReport("report-1")
    expect((await adapter.service.reports())[0].resolved).toBe(true)
  })
})
