import { expect, test } from "@playwright/test"

import { routing } from "../i18n/routing"
import { blockExternalBrowserRequests } from "./helpers/network"
import {
  communityFixture,
  communityModeratorAuthFile,
  communityThreadModeration,
  releaseUserAuthFile,
} from "./helpers/release-fixture"

test.beforeEach(async ({ page }) => {
  await blockExternalBrowserRequests(page)
})

test("locale-prefixed community URLs reach the English forum and retain the chrome locale", async ({
  page,
}) => {
  for (const locale of routing.locales) {
    await test.step(`${locale} site chrome`, async () => {
      await page.goto(`/${locale}/community?type=shipped&sort=hot`)

      await expect(page).toHaveURL(/\/community\?type=shipped&sort=hot$/)
      await expect(page.locator("html")).toHaveAttribute("lang", "en")
      await expect(
        page.getByRole("button", { name: communityFixture.threadTitle, exact: true }),
      ).toBeVisible()

      const localeCookie = (await page.context().cookies()).find(
        (cookie) => cookie.name === "NEXT_LOCALE",
      )
      expect(localeCookie?.value).toBe(locale)
    })
  }
})

test("returns real 404 responses for syntactically unusable canonical thread URLs", async ({
  baseURL,
  page,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required")
  await page.context().addCookies([{ name: "NEXT_LOCALE", value: "zh", url: baseURL }])
  const validId = "550e8400-e29b-41d4-a716-446655440000"
  for (const path of [
    "/community/t",
    "/community/t/not-a-uuid",
    "/community/t/not-a-uuid/edit",
    `/community/t/${validId}/history`,
    `/community/t/${validId}/edit/history`,
  ]) {
    await test.step(path, async () => {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
      expect(new URL(page.url()).pathname).toBe(path)
      await expect(page.locator("html")).toHaveAttribute("lang", "en")
      await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible()
    })
  }
})

test("renders absent canonical thread URLs as noindex not-found content", async ({ page }) => {
  const unknownThreadId = "ffffffff-ffff-ffff-ffff-ffffffffffff"
  for (const path of [`/community/t/${unknownThreadId}`, `/community/t/${unknownThreadId}/edit`]) {
    await test.step(path, async () => {
      await page.goto(path)
      await expect(page.getByRole("heading", { name: "Page Not Found" })).toBeVisible()
      expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBeGreaterThan(
        0,
      )
    })
  }
})

test("signed-out visitors see the community participation boundary", async ({ page }) => {
  await page.goto("/community/new")

  await expect(page.getByText("Sign in to join the conversation.", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Sign in to participate" })).toHaveAttribute(
    "href",
    "/sign-in",
  )
  await expect(page.getByRole("heading", { name: "What are you building?" })).toHaveCount(0)
})

test.describe("mobile forum layout", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("keeps the feed inside the viewport and opens a thread from the keyboard", async ({
    page,
  }) => {
    await page.goto("/community")

    const title = page.getByRole("button", { name: communityFixture.threadTitle, exact: true })
    await expect(title).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true)

    await title.focus()
    await expect(title).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(new RegExp(`/community/t/${communityFixture.threadId}$`))
  })
})

test.describe("member forum flow", () => {
  test.use({ storageState: releaseUserAuthFile })

  test("keeps empty-reply validation visible and focuses the invalid field", async ({ page }) => {
    await page.goto(`/community/t/${communityFixture.threadId}`)
    await page.getByRole("button", { name: "Post reply" }).click()

    await expect(page.getByText("Write a reply before posting.", { exact: true })).toBeVisible()
    await expect(page.getByLabel("Your reply")).toBeFocused()
  })

  test("sends one Server Action and count update for two synchronous reply submits", async ({
    page,
  }, testInfo) => {
    const marker = `Browser reply race gate ${Date.now()}-${testInfo.retry}`
    await page.goto(`/community/t/${communityFixture.threadId}`)
    const replyCount = page.getByRole("heading", { name: /^Replies · \d+$/ })
    const initialCount = Number((await replyCount.textContent())?.match(/\d+$/)?.[0])
    expect(initialCount).toBeGreaterThanOrEqual(0)
    let actionRequestCount = 0
    const recordActionRequest = (request: import("@playwright/test").Request) => {
      if (
        request.method() === "POST" &&
        request.headers()["next-action"] &&
        new URL(request.url()).pathname === `/community/t/${communityFixture.threadId}`
      )
        actionRequestCount += 1
    }

    page.on("request", recordActionRequest)
    try {
      await page.getByLabel("Your reply").fill(marker)
      await page.locator("form.c-reply-form").evaluate((form) => {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      })

      await expect(page.getByText("Reply posted.", { exact: true })).toBeVisible()
      await expect(page.locator("article.c-reply").filter({ hasText: marker })).toHaveCount(1)
      await expect(replyCount).toHaveText(`Replies · ${initialCount + 1}`)
      await expect.poll(() => actionRequestCount).toBe(1)
    } finally {
      page.off("request", recordActionRequest)
    }
  })

  test("keeps a saved draft out of both member and anonymous public feeds", async ({
    baseURL,
    browser,
    page,
  }, testInfo) => {
    if (!baseURL) throw new Error("Playwright baseURL is required")
    const marker = `Private browser draft ${Date.now()}-${testInfo.retry}`
    const body = `${marker}. This saved draft must never appear in a public community feed.`

    try {
      await page.goto("/community/new")
      await page.getByLabel("Your update").fill(body)
      await page.getByLabel("Title (optional)").fill(marker)
      await page.getByRole("button", { name: "Save draft" }).click()
      await expect(
        page.getByText("Draft saved. It is visible only to you.", { exact: true }),
      ).toBeVisible()

      const search = encodeURIComponent(marker)
      await page.goto(`/community?q=${search}`)
      await expect(page.locator("article.c-post").filter({ hasText: marker })).toHaveCount(0)
      await expect(page.getByRole("heading", { name: "No matching posts" })).toBeVisible()

      const anonymousContext = await browser.newContext()
      try {
        const anonymousPage = await anonymousContext.newPage()
        await blockExternalBrowserRequests(anonymousPage)
        await anonymousPage.goto(new URL(`/community?q=${search}`, baseURL).toString())
        await expect(
          anonymousPage.locator("article.c-post").filter({ hasText: marker }),
        ).toHaveCount(0)
        await expect(
          anonymousPage.getByRole("heading", { name: "No matching posts" }),
        ).toBeVisible()
      } finally {
        await anonymousContext.close()
      }
    } finally {
      await page.goto("/community/new")
      const discard = page.getByRole("button", { name: "Discard draft", exact: true })
      if (await discard.isVisible().catch(() => false)) {
        await discard.click()
        const dialog = page.getByRole("dialog")
        await expect(dialog).toBeVisible()
        await dialog.getByRole("button", { name: "Discard draft", exact: true }).click()
        await expect(page.getByText("Draft discarded.", { exact: true })).toBeVisible()
      }
    }
  })

  test("opens a real thread, reacts and manages a reply", async ({ page }, testInfo) => {
    // A retry runs after the original browser context has made its writes, so
    // use retry-specific content and assert a state transition rather than a
    // fixture-only initial vote value.
    const run = `${Date.now()}-${testInfo.retry}`
    const reply = `The browser release gate can now exercise a real community reply ${run}.`
    const editedReply = `The browser release gate edited this real community reply ${run}.`

    await page.goto("/community")
    await page.getByRole("button", { name: communityFixture.threadTitle, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/community/t/${communityFixture.threadId}$`))

    const upvote = page.getByLabel(`Upvote ${communityFixture.threadTitle}`)
    const initiallyVoted = await upvote.getAttribute("aria-pressed")
    expect(initiallyVoted).toMatch(/^(true|false)$/)
    await upvote.click()
    await expect(upvote).toHaveAttribute(
      "aria-pressed",
      initiallyVoted === "true" ? "false" : "true",
    )

    await page.getByLabel("Your reply").fill(reply)
    await page.getByRole("button", { name: "Post reply" }).click()
    await expect(page.getByText("Reply posted.", { exact: true })).toBeVisible()

    const replyArticle = page.locator("article.c-reply").filter({ hasText: reply })
    await expect(replyArticle).toBeVisible()
    await replyArticle.getByRole("button", { name: "Edit" }).click()
    await page.getByLabel("Edit reply from Release Gate User").fill(editedReply)
    await page.getByRole("button", { name: "Save reply" }).click()
    await expect(page.getByText("Reply updated.", { exact: true })).toBeVisible()
    const editedReplyArticle = page.locator("article.c-reply").filter({ hasText: editedReply })
    await expect(editedReplyArticle).toBeVisible()
    await editedReplyArticle.getByRole("button", { name: "Delete" }).click()
    await expect(
      page.locator("article.c-reply").filter({ hasText: "This reply was deleted." }),
    ).toBeVisible()
  })

  test("publishes and edits a post through the real Server Action boundary", async ({ page }) => {
    const title = `Browser community post ${Date.now()}`
    const body = "This community post is created through the isolated Playwright release fixture."
    const editedBody =
      "This community post was edited through the isolated Playwright release fixture."

    await page.goto("/community/new")
    await expect(page.getByRole("heading", { name: "What are you building?" })).toBeVisible()
    await page.getByLabel("Your update").fill(body)
    await page.getByLabel("Title (optional)").fill(title)
    await page.getByLabel("Post type").selectOption("Learning")
    await page.getByRole("button", { name: /post update/i }).click()

    await expect(page).toHaveURL(/\/community\/t\/[0-9a-f-]+$/)
    const postUrl = page.url()
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
    await page.getByRole("link", { name: "Edit post" }).click()
    await expect(page.getByRole("heading", { name: "Edit your post" })).toBeVisible()
    await page.getByLabel("Your update").fill(editedBody)
    await page.getByRole("button", { name: "Save changes" }).click()

    await expect(page).toHaveURL(postUrl)
    await expect(page.getByText(editedBody, { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Delete post", exact: true }).click()
    const deleteDialog = page.getByRole("dialog")
    await expect(deleteDialog).toBeVisible()
    await deleteDialog.getByRole("button", { name: "Delete post", exact: true }).click()

    await expect(page).toHaveURL(/\/community$/)
    await expect(page.getByRole("button", { name: title, exact: true })).toHaveCount(0)
  })
})

test.describe("moderator forum flow", () => {
  test.use({ storageState: communityModeratorAuthFile })

  test("hides a reported thread and resolves its review queue item", async ({ page }) => {
    const databaseUrl = process.env.E2E_DATABASE_URL
    if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required")
    await page.goto("/community/moderation")
    const report = page
      .locator("article.c-report")
      .filter({ hasText: communityFixture.reportReason })
    await expect(report).toBeVisible()

    const hideResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        Boolean(response.request().headers()["next-action"]) &&
        new URL(response.url()).pathname === "/community/moderation",
    )
    await report.getByRole("button", { name: "Hide" }).click()
    const hideActionResponse = await hideResponse
    expect(hideActionResponse.ok()).toBe(true)
    await expect
      .poll(() => communityThreadModeration(databaseUrl, communityFixture.moderationThreadId))
      .toBe("hidden")
    await expect(report).toBeVisible()

    await page.goto(`/community/t/${communityFixture.moderationThreadId}`)
    await expect(page.getByRole("heading", { name: "Post hidden" })).toBeVisible()
    await expect(page.getByText(communityFixture.moderationBody, { exact: true })).toBeVisible()

    await page.goto("/community/moderation")
    const refreshedReport = page.locator("article.c-report").filter({
      hasText: communityFixture.reportReason,
    })
    const resolveResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        Boolean(response.request().headers()["next-action"]) &&
        new URL(response.url()).pathname === "/community/moderation",
    )
    await refreshedReport.getByRole("button", { name: "Resolve" }).click()
    const resolveActionResponse = await resolveResponse
    expect(resolveActionResponse.ok()).toBe(true)
    await expect(page.getByRole("heading", { name: "No reports to review" })).toBeVisible()
  })
})
