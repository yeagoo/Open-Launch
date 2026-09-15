import { mkdir, readFile, writeFile } from "node:fs/promises"

import * as schema from "@/drizzle/db/schema"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { CommunityError, emptyDraft, type FeedQuery } from "@/lib/community/contracts"
import { createCommunityBackend } from "@/lib/community/service-core"

const connection = process.env.COMMUNITY_TEST_DATABASE_URL
const suite = connection ? describe : describe.skip
suite("community PostgreSQL integration", () => {
  let pool: Pool
  let database: ReturnType<typeof drizzle<typeof schema>>
  const query: FeedQuery = { view: "all", type: "All", sort: "Latest", search: "" }
  const draft = {
    ...emptyDraft(),
    body: "A real PostgreSQL release fixture with specific context.",
  }
  const service = (id: string | null) =>
    createCommunityBackend(database, {
      getActorId: async () => id,
      checkWriteLimit: async () => {},
      onError: (_, error) => console.error(error),
    })
  const key = () => crypto.randomUUID()
  let owner: ReturnType<typeof service>,
    reader: ReturnType<typeof service>,
    admin: ReturnType<typeof service>,
    anonymous: ReturnType<typeof service>

  async function applyMigration(filename: string) {
    const source = await readFile(
      new URL(`../drizzle/migrations/${filename}`, import.meta.url),
      "utf8",
    )
    for (const statement of source
      .split(/-->\s*statement-breakpoint/)
      .map((value) => value.trim())
      .filter(Boolean))
      await pool.query(statement)
  }

  beforeAll(async () => {
    const target = new URL(connection!)
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/community_phase2_test")
      throw new Error("Integration target must be the isolated community database")
    pool = new Pool({ connectionString: connection, max: 10, statement_timeout: 10000 })
    database = drizzle({ client: pool, schema })
    // Existing-table fixture mirrors all user columns and the project fields read by this service.
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;
   CREATE TABLE "user"(id text PRIMARY KEY,name text NOT NULL,email text NOT NULL UNIQUE,email_verified boolean NOT NULL,image text,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now(),stripe_customer_id text,role text,banned boolean,ban_reason text,ban_expires timestamp,is_bot boolean DEFAULT false);
   CREATE TABLE project(id text PRIMARY KEY,name text NOT NULL,description text NOT NULL,launch_status text NOT NULL,updated_at timestamp NOT NULL DEFAULT now());
   CREATE TABLE project_translation(project_id text NOT NULL,tagline text,is_source boolean NOT NULL DEFAULT false);
   INSERT INTO "user"(id,name,email,email_verified,role) VALUES ('owner','Owner','owner@example.test',true,'user'),('reader','Reader','reader@example.test',true,'user'),('admin','Admin','admin@example.test',true,'admin'),('unverified','Unverified','unverified@example.test',false,'user'),('banned','Banned','banned@example.test',true,'user'),('bot','Bot','bot@example.test',true,'user');
   UPDATE "user" SET banned=true WHERE id='banned';UPDATE "user" SET is_bot=true WHERE id='bot';
   INSERT INTO project(id,name,description,launch_status) VALUES ('public-product','Public Product','Context','launched'),('private-product','Private Product','Private context','scheduled');`)
    // Community product-name search depends on the already-applied directory
    // search index from 0053; use its reviewed migration rather than a copy.
    await applyMigration("0053_search_indexes.sql")
    await applyMigration("0063_community_core.sql")
    await applyMigration("0064_community_search_indexes.sql")
    owner = service("owner")
    reader = service("reader")
    admin = service("admin")
    anonymous = service(null)
  }, 30000)
  afterAll(async () => {
    await pool?.end()
  })
  it("applies migration checks and matches the ORM column names", async () => {
    const { rows } = await pool.query(
      "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'community_%'",
    )
    for (const table of [
      schema.communityThread,
      schema.communityReply,
      schema.communityThreadVote,
      schema.communityBookmark,
      schema.communityReport,
      schema.communityModerationEvent,
      schema.communityFeedSnapshot,
    ]) {
      const { getTableName, getTableColumns } = await import("drizzle-orm")
      expect(
        rows
          .filter((row) => row.table_name === getTableName(table))
          .map((row) => row.column_name)
          .sort(),
      ).toEqual(
        Object.values(getTableColumns(table))
          .map((column) => column.name)
          .sort(),
      )
    }
    await expect(
      pool.query("INSERT INTO community_thread(type,body) VALUES ('Invalid','')"),
    ).rejects.toMatchObject({ code: "23514" })
    const { rows: indexes } = await pool.query<{ name: string }>(
      `SELECT indexname AS name FROM pg_indexes
       WHERE schemaname='public' AND indexname IN ('community_thread_public_text_trgm_idx','project_name_trgm_idx','project_public_status_updated_idx')`,
    )
    expect(indexes.map((index) => index.name).sort()).toEqual([
      "community_thread_public_text_trgm_idx",
      "project_name_trgm_idx",
      "project_public_status_updated_idx",
    ])
  })
  it("checks fresh account permissions and keeps drafts private", async () => {
    await owner.saveDraft(draft)
    expect(await owner.getDraft()).toEqual(draft)
    expect(await reader.getDraft()).toBe(null)
    await expect(anonymous.getDraft()).rejects.toMatchObject({ code: "unauthorized" })
    for (const id of ["unverified", "banned", "bot"])
      await expect(service(id).publish(draft, key())).rejects.toMatchObject({ code: "forbidden" })
    await pool.query("UPDATE \"user\" SET banned=true WHERE id='owner'")
    await expect(owner.publish(draft, key())).rejects.toMatchObject({ code: "forbidden" })
    await pool.query("UPDATE \"user\" SET banned=false WHERE id='owner'")
    await expect(reader.reports()).rejects.toMatchObject({ code: "forbidden" })
  })
  it("deduplicates concurrent publish retries and rejects mismatched reuse", async () => {
    const request = key()
    const results = await Promise.all(
      Array.from({ length: 4 }, () => owner.publish(draft, request)),
    )
    expect(new Set(results.map((post) => post.id)).size).toBe(1)
    expect(await owner.getDraft()).toBe(null)
    await expect(
      owner.publish({ ...draft, body: draft.body + "different" }, request),
    ).rejects.toMatchObject({ code: "conflict" })
    await expect(
      owner.publish({ ...draft, productId: "private-product" }, key()),
    ).rejects.toMatchObject({ code: "validation" })
  })
  it("hides moderation/drafts from direct reads and product-name search", async () => {
    const post = await owner.publish(
      { ...draft, body: "PRIVATE_MARKER " + draft.body, productId: "public-product" },
      key(),
    )
    await admin.moderate(post.id, "hide")
    expect((await anonymous.get(post.id)).body).toBe("")
    expect(
      (await anonymous.list({ ...query, search: "Public Product" })).posts.some(
        (row) => row.id === post.id,
      ),
    ).toBe(false)
    expect((await anonymous.list({ ...query, search: "PRIVATE_MARKER" })).posts).toHaveLength(0)
    await pool.query("UPDATE community_thread SET moderation='pending' WHERE id=$1", [post.id])
    await expect(anonymous.get(post.id)).rejects.toMatchObject({ code: "missing" })
    expect((await owner.get(post.id)).body).toContain("PRIVATE_MARKER")
    await admin.moderate(post.id, "restore")
    expect((await anonymous.get(post.id)).product?.name).toBe("Public Product")
    await pool.query("UPDATE project SET launch_status='scheduled' WHERE id='public-product'")
    expect((await anonymous.get(post.id)).product).toBeUndefined()
    await pool.query("UPDATE project SET launch_status='launched' WHERE id='public-product'")
  })
  it("keeps search punctuation literal instead of treating it as a LIKE wildcard", async () => {
    const exact = await owner.publish(
      { ...draft, title: "Literal 100%_match", body: draft.body + " exact punctuation" },
      key(),
    )
    const wildcardOnly = await owner.publish(
      { ...draft, title: "Literal 100AXmatch", body: draft.body + " wildcard candidate" },
      key(),
    )
    const result = await anonymous.list({ ...query, search: "100%_match" })
    expect(result.posts.map((post) => post.id)).toContain(exact.id)
    expect(result.posts.map((post) => post.id)).not.toContain(wildcardOnly.id)
  })
  it("paginates typed public product-name search without duplicate posts", async () => {
    await pool.query(
      `INSERT INTO project(id,name,description,launch_status)
       VALUES ('pagination-product','Pagination Product Search Fixture','Context','launched')`,
    )
    const expected = [] as string[]
    for (let index = 0; index < 23; index++) {
      const post = await owner.publish(
        {
          ...draft,
          title: `Product search pagination ${index}`,
          type: "Question",
          productId: "pagination-product",
        },
        key(),
      )
      expected.push(post.id)
    }
    const first = await anonymous.list({
      ...query,
      type: "Question",
      search: "Pagination Product Search Fixture",
    })
    expect(first.posts).toHaveLength(20)
    expect(first.posts.every((post) => post.type === "Question")).toBe(true)
    expect(first.nextCursor).toBeTruthy()
    const second = await anonymous.list({
      ...query,
      type: "Question",
      search: "Pagination Product Search Fixture",
      cursor: first.nextCursor,
    })
    expect(second.posts).toHaveLength(3)
    expect(new Set([...first.posts, ...second.posts].map((post) => post.id))).toEqual(
      new Set(expected),
    )
  })
  it("serializes desired votes and preserves counters on account removal", async () => {
    const post = await owner.publish(draft, key())
    const votes = await Promise.all(Array.from({ length: 8 }, () => reader.setVote(post.id, true)))
    expect(votes.every((result) => result.voted)).toBe(true)
    expect(votes.every((result) => result.votes === 1)).toBe(true)
    expect((await reader.setBookmark(post.id, true)).saved).toBe(true)
    expect((await anonymous.get(post.id)).votes).toBe(1)
    await Promise.all([reader.setVote(post.id, false), reader.setVote(post.id, false)])
    expect((await anonymous.get(post.id)).votes).toBe(0)
    await pool.query(
      "INSERT INTO \"user\"(id,name,email,email_verified) VALUES ('temporary','Temporary','temporary@example.test',true)",
    )
    await service("temporary").setVote(post.id, true)
    await service("temporary").saveDraft(draft)
    const retained = await service("temporary").publish(
      { ...draft, body: draft.body + "public" },
      key(),
    )
    await pool.query("DELETE FROM \"user\" WHERE id='temporary'")
    expect((await anonymous.get(post.id)).votes).toBe(0)
    expect((await anonymous.get(retained.id)).author).toBe("Former member")
    expect(
      (
        await pool.query(
          "SELECT count(*)::int n FROM community_thread WHERE lifecycle='draft' AND author_id IS NULL",
        )
      ).rows[0].n,
    ).toBe(0)
  })
  it("returns compact reaction state without rehydrating a full post", async () => {
    const post = await owner.publish(
      {
        ...draft,
        title: "A compact vote response fixture",
        body: "A linked post that makes unnecessary detail hydration observable in the query trace.",
        productId: "public-product",
      },
      key(),
    )
    const queries: string[] = []
    const tracedReader = createCommunityBackend(
      drizzle({
        client: pool,
        schema,
        logger: { logQuery: (statement) => queries.push(statement) },
      }),
      {
        getActorId: async () => "reader",
        checkWriteLimit: async () => {},
      },
    )
    const expectNoPostHydration = () => {
      expect(queries.filter((statement) => statement.includes('from "user"'))).toHaveLength(1)
      expect(queries.some((statement) => statement.includes('from "project"'))).toBe(false)
      expect(queries.some((statement) => statement.includes('from "community_reply"'))).toBe(false)
      expect(queries.some((statement) => statement.includes('from "community_thread_vote"'))).toBe(
        false,
      )
      expect(queries.some((statement) => statement.includes('from "community_bookmark"'))).toBe(
        false,
      )
    }

    await expect(tracedReader.setVote(post.id, true)).resolves.toEqual({
      id: post.id,
      kind: "vote",
      votes: 1,
      voted: true,
    })
    expectNoPostHydration()

    queries.length = 0
    await expect(tracedReader.setBookmark(post.id, true)).resolves.toEqual({
      id: post.id,
      kind: "bookmark",
      saved: true,
    })
    expectNoPostHydration()
  })
  it("returns only navigation data after post writes without hydrating post detail", async () => {
    const queries: string[] = []
    const tracedOwner = createCommunityBackend(
      drizzle({
        client: pool,
        schema,
        logger: { logQuery: (statement) => queries.push(statement) },
      }),
      {
        getActorId: async () => "owner",
        checkWriteLimit: async () => {},
      },
    )
    const navigationDraft = {
      ...draft,
      title: "A navigation-only post write fixture",
      body: "A linked post makes redundant detail projection visible in the query trace.",
      productId: "public-product",
    }
    const expectNoPostDetailHydration = () => {
      expect(queries.filter((statement) => statement.includes('from "user"'))).toHaveLength(1)
      expect(queries.filter((statement) => statement.includes('from "project"'))).toHaveLength(1)
      expect(queries.some((statement) => statement.includes('from "community_reply"'))).toBe(false)
      expect(queries.some((statement) => statement.includes('from "community_thread_vote"'))).toBe(
        false,
      )
      expect(queries.some((statement) => statement.includes('from "community_bookmark"'))).toBe(
        false,
      )
    }

    const postId = await tracedOwner.publishForNavigation(navigationDraft, key())
    expect(postId).toEqual(expect.any(String))
    expectNoPostDetailHydration()

    queries.length = 0
    await expect(
      tracedOwner.editForNavigation(
        postId,
        { ...navigationDraft, title: "The navigation write was edited" },
        1,
      ),
    ).resolves.toBeUndefined()
    expectNoPostDetailHydration()
  })
  it("checks reply nesting, retries, moderation counts and bounded pagination", async () => {
    const post = await owner.publish(draft, key()),
      other = await owner.publish(draft, key())
    const request = key()
    const roots = await Promise.all([
      reader.replyTo(post.id, "A useful first reply", request),
      reader.replyTo(post.id, "A useful first reply", request),
    ])
    expect(roots[0].id).toBe(roots[1].id)
    expect(Number.isFinite(roots[0].createdAt)).toBe(true)
    await expect(
      reader.editReply(
        roots[0].id,
        "An edited first reply with useful context.",
        roots[0].version!,
      ),
    ).resolves.toBeUndefined()
    const child = await owner.replyTo(post.id, "One level below the root", key(), roots[0].id)
    await expect(
      owner.replyTo(other.id, "Wrong thread parent", key(), roots[0].id),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      owner.replyTo(post.id, "Too deeply nested", key(), child.id),
    ).rejects.toMatchObject({ code: "validation" })
    await admin.moderateReply(roots[0].id, "hide", "Reported content was not appropriate")
    expect((await owner.get(post.id)).replyCount).toBe(1)
    await admin.moderateReply(roots[0].id, "restore", "Review complete and content is acceptable")
    expect((await owner.get(post.id)).replyCount).toBe(2)
    for (let index = 0; index < 22; index++)
      await reader.replyTo(post.id, `Reply ${index} with context`, key())
    const details = await anonymous.get(post.id)
    expect(details.replyCount).toBe(24)
    expect(details.replies).toHaveLength(20)
    const next = await anonymous.listReplies(post.id, details.replyCursor)
    expect(next.replies).toHaveLength(4)
    const pagedReplies = [...details.replies, ...next.replies]
    expect(new Set(pagedReplies.map((row) => row.id)).size).toBe(24)
    expect(pagedReplies).toEqual(
      [...pagedReplies].sort((left, right) => {
        const createdAtDifference = left.createdAt - right.createdAt
        if (createdAtDifference !== 0) return createdAtDifference
        if (left.id === right.id) return 0
        return left.id < right.id ? -1 : 1
      }),
    )
    await admin.moderate(post.id, "lock")
    await expect(reader.reply(post.id, "A reply after locking", key())).rejects.toMatchObject({
      code: "forbidden",
    })
    await expect(
      owner.editReply(child.id, "An edit after locking must be rejected", child.version!),
    ).rejects.toMatchObject({ code: "forbidden" })
    await expect(owner.deleteReply(child.id, child.version!)).resolves.toBeUndefined()
    expect((await anonymous.get(post.id)).replyCount).toBe(23)
  })
  it("does not duplicate moderation state changes or audit events after a retry", async () => {
    const post = await owner.publish(draft, key())
    const reply = await reader.replyTo(
      post.id,
      "A reply used to exercise moderation retries.",
      key(),
    )
    const reason = "The duplicate moderation command should be a no-op."

    // Desired-state commands are safe to retry even when the original request
    // completed but its response was lost.
    await expect(admin.moderateWithOutcome(post.id, "restore")).resolves.toBe(false)
    await expect(admin.moderateWithOutcome(post.id, "unlock")).resolves.toBe(false)
    await expect(admin.moderateWithOutcome(post.id, "unpin")).resolves.toBe(false)
    for (const action of ["hide", "restore", "lock", "unlock", "pin", "unpin"] as const) {
      const outcomes = await Promise.all([
        admin.moderateWithOutcome(post.id, action),
        admin.moderateWithOutcome(post.id, action),
      ])
      expect(outcomes.sort()).toEqual([false, true])
    }

    const postAfterRetries = await owner.get(post.id)
    expect(postAfterRetries).toMatchObject({
      state: "public",
      locked: false,
      pinned: false,
      version: 7,
    })
    const { rows: postAudit } = await pool.query<{ action: string; count: number }>(
      `SELECT action,count(*)::int AS count FROM community_moderation_event
       WHERE thread_id=$1 GROUP BY action ORDER BY action`,
      [post.id],
    )
    expect(postAudit).toEqual([
      { action: "hide", count: 1 },
      { action: "lock", count: 1 },
      { action: "pin", count: 1 },
      { action: "restore", count: 1 },
      { action: "unlock", count: 1 },
      { action: "unpin", count: 1 },
    ])

    await expect(admin.moderateReply(reply.id, "restore", reason)).resolves.toEqual({
      threadId: post.id,
      changed: false,
    })
    const hideOutcomes = await Promise.all([
      admin.moderateReply(reply.id, "hide", reason),
      admin.moderateReply(reply.id, "hide", reason),
    ])
    expect(hideOutcomes.map((outcome) => outcome.changed).sort()).toEqual([false, true])
    const restoreOutcomes = await Promise.all([
      admin.moderateReply(reply.id, "restore", reason),
      admin.moderateReply(reply.id, "restore", reason),
    ])
    expect(restoreOutcomes.map((outcome) => outcome.changed).sort()).toEqual([false, true])
    const { rows: replyRows } = await pool.query<{ moderation: string; version: number }>(
      "SELECT moderation,version FROM community_reply WHERE id=$1",
      [reply.id],
    )
    expect(replyRows).toEqual([{ moderation: "public", version: 3 }])
    const { rows: replyAudit } = await pool.query<{ action: string; count: number }>(
      `SELECT action,count(*)::int AS count FROM community_moderation_event
       WHERE reply_id=$1 GROUP BY action ORDER BY action`,
      [reply.id],
    )
    expect(replyAudit).toEqual([
      { action: "hide", count: 1 },
      { action: "restore", count: 1 },
    ])
  })
  it("rejects stale edits and prevents deleted posts from being restored", async () => {
    const post = await owner.publish(draft, key())
    await reader.report(post.id, "This fixture should be reviewed for context")
    const reports = await admin.reports()
    const report = reports.find((row) => row.postId === post.id)!
    await Promise.all([admin.resolveReport(report.id), admin.resolveReport(report.id)])
    await admin.moderate(post.id, "lock")
    await expect(owner.edit(post.id, draft, post.version)).rejects.toMatchObject({
      code: "forbidden",
    })
    await admin.moderate(post.id, "unlock")
    await expect(owner.edit(post.id, draft, post.version)).rejects.toMatchObject({
      code: "conflict",
    })
    const latest = await owner.get(post.id)
    await owner.delete(post.id, latest.version)
    await expect(admin.moderate(post.id, "restore")).rejects.toMatchObject({ code: "conflict" })
    expect(
      (await owner.list({ ...query, view: "mine" })).posts.some(
        (row) => row.id === post.id && row.state === "deleted",
      ),
    ).toBe(true)
    await expect(
      pool.query("UPDATE community_moderation_event SET reason='tampered'"),
    ).rejects.toMatchObject({ code: "23514" })
  })
  it("preserves Latest and Hot page boundaries while new content and votes arrive", async () => {
    for (let index = 0; index < 25; index++)
      await owner.publish({ ...draft, title: `Pagination ${index}` }, key())
    const first = await anonymous.list(query)
    const inserted = await owner.publish({ ...draft, title: "Inserted after first page" }, key())
    const second = await anonymous.list({ ...query, cursor: first.nextCursor })
    expect(second.posts.some((row) => row.id === inserted.id)).toBe(false)
    expect(new Set([...first.posts, ...second.posts].map((row) => row.id)).size).toBe(
      first.posts.length + second.posts.length,
    )
    const hot = await anonymous.list({ ...query, sort: "Hot" })
    await reader.setVote(inserted.id, true)
    const next = await anonymous.list({ ...query, sort: "Hot", cursor: hot.nextCursor })
    expect(new Set([...hot.posts, ...next.posts].map((row) => row.id)).size).toBe(
      hot.posts.length + next.posts.length,
    )
    await expect(
      anonymous.list({ ...query, type: "Question", cursor: first.nextCursor }),
    ).rejects.toMatchObject({ code: "validation" })
    await pool.query("UPDATE community_feed_snapshot SET expires_at=now()-interval '1 second'")
    await expect(
      anonymous.list({ ...query, sort: "Hot", cursor: hot.nextCursor }),
    ).rejects.toMatchObject({ code: "conflict" })
  })
  it("guards the reply parent constraint even when the service is bypassed", async () => {
    const a = await owner.publish(draft, key()),
      b = await owner.publish(draft, key())
    const parent = await owner.replyTo(a.id, "Root reply for FK check", key())
    await expect(
      pool.query(
        "INSERT INTO community_reply(thread_id,parent_id,author_id,body,request_key,request_hash) VALUES ($1,$2,'owner','Bad parent','foreign-key-test','hash')",
        [b.id, parent.id],
      ),
    ).rejects.toMatchObject({ code: "23503" })
  })
  it("lets the author delete a hidden post without exposing its content", async () => {
    const post = await owner.publish(draft, key())
    await admin.moderate(post.id, "hide")
    const hidden = await owner.get(post.id)
    expect(hidden).toMatchObject({ authorId: "owner", body: "", state: "hidden" })
    await expect(admin.get(post.id)).resolves.toMatchObject({
      body: draft.body,
      state: "hidden",
    })
    await owner.delete(post.id, hidden.version)
    expect(await anonymous.get(post.id)).toMatchObject({ state: "deleted", body: "" })
  })
  it("keeps author deletion available after a moderator locks the thread", async () => {
    const post = await owner.publish(draft, key())
    await admin.moderate(post.id, "lock")
    const locked = await owner.get(post.id)
    expect(locked.locked).toBe(true)

    await expect(owner.delete(post.id, locked.version)).resolves.toBeUndefined()
    await expect(anonymous.get(post.id)).resolves.toMatchObject({ state: "deleted", body: "" })
  })
  it("preserves a newer draft when an older composition is published", async () => {
    const newer = { ...draft, body: draft.body + " A newer unsent draft." }
    await owner.saveDraft(newer)
    await owner.publish(draft, key())
    expect(await owner.getDraft()).toEqual(newer)
  })
  it("supplies bounded, UI-safe page data without loading composer products into feeds", async () => {
    const post = await owner.publish(
      {
        ...draft,
        title: "A long update for the page loader",
        body: "A".repeat(700),
        productId: "public-product",
      },
      key(),
    )
    const anonymousFeed = await anonymous.loadFeedPage(query)
    expect(anonymousFeed.viewer).toEqual({ id: null, role: "anonymous", canParticipate: false })
    const listed = anonymousFeed.feed.posts.find((item) => item.id === post.id)!
    expect(listed.body).toHaveLength(480)
    expect(listed.bodyTruncated).toBe(true)
    await expect(anonymous.loadFeedPage({ ...query, view: "mine" })).resolves.toMatchObject({
      feed: { posts: [] },
      viewer: { role: "anonymous" },
    })

    const composer = await owner.loadComposerPage()
    expect(composer.viewer).toMatchObject({ id: "owner", role: "member", canParticipate: true })
    expect(composer.products).toContainEqual({
      id: "public-product",
      name: "Public Product",
      description: "Context",
    })
    expect(composer.products.some((product) => product.id === "private-product")).toBe(false)

    const editor = await owner.loadPostEditorPage(post.id)
    expect(editor.post.body).toHaveLength(700)
    expect(editor.products.some((product) => product.id === "public-product")).toBe(true)
    await expect(reader.loadPostEditorPage(post.id)).rejects.toMatchObject({ code: "missing" })
    await expect(admin.loadPostEditorPage(post.id)).rejects.toMatchObject({ code: "missing" })
    await expect(admin.loadModerationPage()).resolves.toMatchObject({
      viewer: { role: "moderator" },
    })
  })
  it("authorizes editor loads before reply and viewer-specific post projections", async () => {
    const post = await owner.publish(
      {
        ...draft,
        title: "An editor authorization fixture",
        body: "A post used to verify the editor does not load unrelated page data.",
      },
      key(),
    )
    const readerQueries: string[] = []
    const tracedReader = createCommunityBackend(
      drizzle({
        client: pool,
        schema,
        logger: { logQuery: (statement) => readerQueries.push(statement) },
      }),
      {
        getActorId: async () => "reader",
        checkWriteLimit: async () => {},
      },
    )

    await expect(tracedReader.loadPostEditorPage(post.id)).rejects.toMatchObject({
      code: "missing",
    })
    expect(readerQueries.some((statement) => statement.includes("community_reply"))).toBe(false)
    expect(readerQueries.some((statement) => statement.includes("community_thread_vote"))).toBe(
      false,
    )
    expect(readerQueries.some((statement) => statement.includes("community_bookmark"))).toBe(false)

    const ownerQueries: string[] = []
    const tracedOwner = createCommunityBackend(
      drizzle({
        client: pool,
        schema,
        logger: { logQuery: (statement) => ownerQueries.push(statement) },
      }),
      {
        getActorId: async () => "owner",
        checkWriteLimit: async () => {},
      },
    )
    const editor = await tracedOwner.loadPostEditorPage(post.id)
    expect(editor.post.authorId).toBe("owner")
    expect(editor.post.replies).toEqual([])
    expect(editor.post.replyCursor).toBeUndefined()
    expect(ownerQueries.filter((statement) => statement.includes('from "user"'))).toHaveLength(1)
    expect(ownerQueries.some((statement) => statement.includes("community_reply"))).toBe(false)
    expect(ownerQueries.some((statement) => statement.includes("community_thread_vote"))).toBe(
      false,
    )
    expect(ownerQueries.some((statement) => statement.includes("community_bookmark"))).toBe(false)
    expect((await reader.get(post.id)).author).toBe("Owner")
  })
  it("serializes reply versus lock and edit versus hide races", async () => {
    const post = await owner.publish(draft, key())
    const [replyResult, lockResult] = await Promise.allSettled([
      reader.replyTo(post.id, "A reply racing with moderator lock", key()),
      admin.moderate(post.id, "lock"),
    ])
    expect(lockResult.status).toBe("fulfilled")
    const locked = await owner.get(post.id)
    expect(locked.locked).toBe(true)
    expect(locked.replyCount).toBe(replyResult.status === "fulfilled" ? 1 : 0)
    if (replyResult.status === "rejected") expect(replyResult.reason.code).toBe("forbidden")
    await expect(reader.replyTo(post.id, "After the lock", key())).rejects.toMatchObject({
      code: "forbidden",
    })
    const other = await owner.publish(draft, key())
    const [editResult, hideResult] = await Promise.allSettled([
      owner.edit(other.id, { ...draft, title: "Concurrent edit" }, other.version),
      admin.moderate(other.id, "hide"),
    ])
    expect(hideResult.status).toBe("fulfilled")
    if (editResult.status === "rejected")
      expect(["missing", "forbidden", "conflict"]).toContain(editResult.reason.code)
    expect(await anonymous.get(other.id)).toMatchObject({ state: "hidden", body: "", title: "" })
  })
  it("fails closed before writes and maps infrastructure errors without exposing details", async () => {
    const failure = new Error("private infrastructure detail")
    const log = vi.fn()
    const transaction = vi.spyOn(database, "transaction")
    const blocked = createCommunityBackend(database, {
      getActorId: async () => "owner",
      checkWriteLimit: async () => {
        throw new CommunityError("retryable", "Please wait")
      },
    })
    transaction.mockClear()
    await expect(blocked.publish(draft, key())).rejects.toMatchObject({ code: "retryable" })
    expect(transaction).not.toHaveBeenCalled()
    const brokenAuth = createCommunityBackend(database, {
      getActorId: async () => {
        throw failure
      },
      checkWriteLimit: async () => {},
      onError: log,
    })
    await expect(brokenAuth.list(query)).rejects.toMatchObject({
      code: "retryable",
      message: "Community data is temporarily unavailable. Please retry",
    })
    expect(log).toHaveBeenCalledWith(
      "list",
      failure,
      expect.objectContaining({
        operation: "list",
        write: false,
        admin: false,
        outcome: "failed",
        durationMs: expect.any(Number),
      }),
    )
    transaction.mockRestore()
  })
  it("rejects manual audit anonymization while permitting deleted-account anonymization", async () => {
    await pool.query(
      `INSERT INTO "user"(id,name,email,email_verified,role) VALUES ('temporary-admin','Temporary admin','temporary-admin@example.test',true,'admin')`,
    )
    const post = await owner.publish(draft, key())
    await service("temporary-admin").moderate(post.id, "lock")
    await expect(
      pool.query(
        "UPDATE community_moderation_event SET actor_id=NULL WHERE actor_id='temporary-admin'",
      ),
    ).rejects.toMatchObject({ code: "23514" })
    await expect(
      pool.query("UPDATE community_moderation_event SET thread_id=NULL WHERE thread_id=$1", [
        post.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" })
    await pool.query(`DELETE FROM "user" WHERE id='temporary-admin'`)
    const { rows } = await pool.query(
      "SELECT actor_id,action FROM community_moderation_event WHERE thread_id=$1",
      [post.id],
    )
    expect(rows).toEqual([{ actor_id: null, action: "lock" }])
  })
  it("uses feed and merged search indexes at realistic community scale", async () => {
    await pool.query(`INSERT INTO community_thread(author_id,type,title,body,lifecycle,published_at)
      SELECT 'owner',CASE WHEN n%5=0 THEN 'Question' ELSE 'Shipped' END,'Query fixture '||n,repeat('Realistic maker experience and launch context. ',20),'published',now()-n*interval '1 minute'
      FROM generate_series(1,10000) AS n`)
    await pool.query("ANALYZE community_thread")
    const evidence: Record<string, unknown> = { fixtureCount: 10000 }
    for (const filter of ["", " AND type='Question'"]) {
      const { rows } = await pool.query(
        `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM community_thread WHERE lifecycle='published' AND moderation='public'${filter} ORDER BY published_at DESC,id DESC LIMIT 21`,
      )
      const plan = rows[0]["QUERY PLAN"][0]
      evidence[filter ? "typeFeed" : "latestFeed"] = plan
      expect(JSON.stringify(plan)).toMatch(/community_thread_public_(type_)?date_idx/)
      console.info(
        `community feed${filter ? " by type" : ""}: ${plan["Execution Time"]} ms on 10000 fixtures`,
      )
    }
    const page = await anonymous.list(query)
    expect(page.posts).toHaveLength(20)
    expect(
      page.posts.every(
        (post) =>
          post.replies.length === 0 &&
          typeof post.replyCount === "number" &&
          post.body.length <= 480,
      ),
    ).toBe(true)
    const { rows: searchPlanRows } = await pool.query(
      `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
       SELECT id FROM community_thread
       WHERE lifecycle='published' AND moderation='public'
         AND lower(coalesce(title,'') || ' ' || body) LIKE '%query fixture 9999%'
       LIMIT 21`,
    )
    const searchPlan = searchPlanRows[0]["QUERY PLAN"][0]
    evidence.trigramSearch = searchPlan
    expect(JSON.stringify(searchPlan)).toMatch(/community_thread_public_text_trgm_idx/)
    const start = performance.now()
    const search = await anonymous.list({ ...query, search: "Query fixture 9999" })
    expect(search.posts).toHaveLength(1)
    evidence.substringSearchMs = Number((performance.now() - start).toFixed(2))
    const productSearchFixtureCount = 100000
    await pool.query(`INSERT INTO project(id,name,description,launch_status)
      SELECT 'community-search-product-'||n,
        CASE WHEN n=${productSearchFixtureCount} THEN 'Community Product Search Sentinel' ELSE 'Community product catalogue '||n END,
        'Search fixture context','launched'
      FROM generate_series(1,${productSearchFixtureCount}) AS n`)
    // Put the only matching linked product at the oldest end of the feed. A
    // date-ordered filter would walk every public thread; this mirrors the
    // worst useful case for a product-name-only search. The realistic fixture
    // has several GIN and btree indexes, so insert it in bounded batches: a
    // single 100,000-row statement can exceed the suite's per-statement
    // timeout on an otherwise healthy loaded development machine.
    const productSearchBatchSize = 10_000
    for (let start = 1; start <= productSearchFixtureCount; start += productSearchBatchSize) {
      const end = Math.min(start + productSearchBatchSize - 1, productSearchFixtureCount)
      await pool.query(
        `INSERT INTO community_thread(author_id,type,project_id,title,body,lifecycle,published_at)
         SELECT 'owner','Shipped','community-search-product-'||n,'Linked product fixture '||n,
           'General maker update without the search marker.','published',now()-(10000+n)*interval '1 minute'
         FROM generate_series($1::integer,$2::integer) AS n`,
        [start, end],
      )
    }
    await pool.query("ANALYZE project; ANALYZE community_thread")
    const productSearchTerm = "%community product search sentinel%"
    const { rows: productSearchPlanRows } = await pool.query(
      `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
       SELECT feed_thread.id FROM community_thread AS feed_thread
       WHERE feed_thread.lifecycle='published' AND feed_thread.moderation='public'
         AND feed_thread.id IN (
           (
             SELECT text_thread.id FROM community_thread AS text_thread
             WHERE text_thread.lifecycle='published' AND text_thread.moderation='public'
               AND lower(coalesce(text_thread.title,'') || ' ' || text_thread.body) LIKE $1 ESCAPE '\\'
             ORDER BY text_thread.published_at DESC,text_thread.id DESC
             LIMIT 21
           )
           UNION
           (
             SELECT product_thread.id FROM community_thread AS product_thread
             INNER JOIN project AS search_product ON search_product.id=product_thread.project_id
             WHERE product_thread.lifecycle='published' AND product_thread.moderation='public'
               AND search_product.launch_status IN ('ongoing','launched')
               AND search_product.name ILIKE $1 ESCAPE '\\'
             ORDER BY product_thread.published_at DESC,product_thread.id DESC
             LIMIT 21
           )
         )
       ORDER BY feed_thread.published_at DESC,feed_thread.id DESC
       LIMIT 21`,
      [productSearchTerm],
    )
    const productSearchPlan = productSearchPlanRows[0]["QUERY PLAN"][0]
    evidence.productSearchFixtureCount = productSearchFixtureCount
    evidence.productSearchCandidates = productSearchPlan
    const productSearchPlanJson = JSON.stringify(productSearchPlan)
    expect(productSearchPlanJson).toMatch(/community_thread_public_text_trgm_idx/)
    expect(productSearchPlanJson).toMatch(/project_name_trgm_idx/)
    expect(productSearchPlanJson).toMatch(/community_thread_project_idx/)
    const broadSearchTerm = "%realistic maker experience%"
    const { rows: broadSearchPlanRows } = await pool.query(
      `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
       SELECT feed_thread.id FROM community_thread AS feed_thread
       INNER JOIN (
         SELECT recent_thread.id FROM community_thread AS recent_thread
         WHERE recent_thread.lifecycle='published' AND recent_thread.moderation='public'
         ORDER BY recent_thread.published_at DESC,recent_thread.id DESC
         LIMIT 500
       ) AS recent ON recent.id=feed_thread.id
       WHERE (
         lower(coalesce(feed_thread.title,'') || ' ' || feed_thread.body) LIKE $1 ESCAPE '\\'
         OR EXISTS (
           SELECT 1 FROM project AS search_product
           WHERE search_product.id=feed_thread.project_id
             AND search_product.launch_status IN ('ongoing','launched')
             AND search_product.name ILIKE $1 ESCAPE '\\'
         )
       )
       ORDER BY feed_thread.published_at DESC,feed_thread.id DESC
       LIMIT 21`,
      [broadSearchTerm],
    )
    const broadSearchPlan = broadSearchPlanRows[0]["QUERY PLAN"][0]
    evidence.broadSearchProbe = broadSearchPlan
    const broadSearchPlanJson = JSON.stringify(broadSearchPlan)
    expect(broadSearchPlanJson).toMatch(/community_thread_public_date_idx/)
    expect(broadSearchPlanJson).not.toMatch(/community_thread_public_text_trgm_idx/)
    const productStart = performance.now()
    const productSearch = await anonymous.list({
      ...query,
      search: "Community Product Search Sentinel",
    })
    expect(productSearch.posts).toHaveLength(1)
    expect(productSearch.posts[0]?.product?.id).toBe(
      `community-search-product-${productSearchFixtureCount}`,
    )
    evidence.productSearchMs = Number((performance.now() - productStart).toFixed(2))
    const broadStart = performance.now()
    const broadFirst = await anonymous.list({ ...query, search: "Realistic maker experience" })
    expect(broadFirst.posts).toHaveLength(20)
    expect(broadFirst.nextCursor).toBeTruthy()
    const broadSecond = await anonymous.list({
      ...query,
      search: "Realistic maker experience",
      cursor: broadFirst.nextCursor,
    })
    expect(broadSecond.posts).toHaveLength(20)
    expect(new Set([...broadFirst.posts, ...broadSecond.posts].map((post) => post.id)).size).toBe(
      40,
    )
    evidence.broadSearchTwoPagesMs = Number((performance.now() - broadStart).toFixed(2))
    const artifact = new URL("../artifacts/community-database/", import.meta.url)
    await mkdir(artifact, { recursive: true })
    await writeFile(new URL("query-plans.json", artifact), JSON.stringify(evidence, null, 2))
  }, 20_000)
})
