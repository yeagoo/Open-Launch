/** Phase 1 React preview: an isolated static server, no Next.js, database or credentials. */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { chromium, expect } from "@playwright/test"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = resolve(root, "artifacts/community-preview/screenshots")
const server = spawn(
  "python3",
  [
    "-u",
    "-m",
    "http.server",
    "0",
    "--bind",
    "127.0.0.1",
    "--directory",
    resolve(root, "artifacts/community-preview"),
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
)
let browser
try {
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error("Static preview server did not start")), 10000)
    let output = ""
    server.once("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    server.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`Preview server exited: ${code}`))
    })
    server.stdout.on("data", (data) => {
      output += data.toString()
      const match = output.match(/port (\d+)/)
      if (match) {
        clearTimeout(timer)
        resolvePort(Number(match[1]))
      }
    })
  })
  const base = `http://127.0.0.1:${port}`
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  })
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("dialog", (dialog) => {
    if (dialog.type() === "beforeunload") void dialog.accept()
    else {
      errors.push(`Unexpected dialog: ${dialog.message()}`)
      void dialog.dismiss()
    }
  })
  // Verify the preview works without network fonts or any other external service.
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
  )
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource"))
      errors.push(message.text())
  })
  const open = async (hash = "") => {
    await page.goto(base + "/" + hash)
    await ready()
    await expect(page.locator(".c-post").first()).toBeVisible()
  }
  const main = page.locator("#community-content")
  const tools = page.locator(".c-tools")
  const ready = async () => {
    await expect(main.getByRole("heading", { name: "Loading posts…", exact: true })).toHaveCount(0)
  }
  await open()
  await expect(page.locator(".c-post")).toHaveCount(3)
  await tools.locator("summary").click()
  await tools.getByRole("button", { name: "Fail next request" }).click()
  await page.getByRole("button", { name: "Load more", exact: true }).click()
  await expect(page.getByRole("button", { name: "Retry loading more", exact: true })).toBeVisible()
  await expect(page.locator(".c-post")).toHaveCount(3)
  await page.getByRole("button", { name: "Retry loading more", exact: true }).click()
  await tools.locator("summary").click()
  await expect(page.locator(".c-post")).toHaveCount(5)
  await page.getByRole("button", { name: "Question", exact: true }).click()
  await ready()
  await expect(page.locator(".c-post")).toHaveCount(1)
  await main.getByLabel("Search posts or products", { exact: true }).fill("No matching question")
  await main.getByRole("button", { name: "Search", exact: true }).click()
  await expect(main.getByRole("heading", { name: "No matching posts" })).toBeVisible()
  await main.getByRole("button", { name: "Clear search", exact: true }).click()
  await expect(main.locator(".c-post")).toHaveCount(1)
  await page.getByRole("button", { name: "All posts", exact: true }).click()
  await ready()
  await tools.locator("summary").click()
  await tools.getByRole("button", { name: "Fail next request" }).click()
  const firstVote = page
    .locator(".c-post")
    .first()
    .getByRole("button", { name: /Upvote/ })
  const oldCount = await firstVote.innerText()
  await firstVote.click()
  await expect(main.getByRole("alert").first()).toContainText("demo request failed")
  await expect(firstVote).toHaveAttribute("aria-pressed", "false")
  await expect(firstVote).toHaveText(oldCount)
  await firstVote.click()
  await expect(firstVote).toHaveAttribute("aria-pressed", "true")
  await expect(firstVote).toBeEnabled()
  await tools.getByRole("button", { name: "Fail next request" }).click()
  await tools.getByRole("button", { name: "Reload current view" }).click()
  await expect(main.getByRole("heading", { name: "Could not load posts" })).toBeVisible()
  await main.getByRole("button", { name: "Try again" }).click()
  await ready()
  await expect(page.locator(".c-post")).toHaveCount(3)
  await tools.getByRole("button", { name: "Empty feed", exact: true }).click()
  await expect(main.getByRole("heading", { name: "No posts here yet" })).toBeVisible()
  await tools.getByRole("button", { name: "Restore feed" }).click()
  await ready()
  for (const [role, message] of [
    ["anonymous", "Sign in to join"],
    ["unverified", "Verify your email"],
    ["banned", "Your account cannot participate"],
  ]) {
    await tools.getByLabel("Viewer role").selectOption(role)
    await expect(main.getByText(message, { exact: false })).toBeVisible()
    await expect(main.locator(".c-composer")).toHaveCount(0)
  }
  await tools.getByLabel("Viewer role").selectOption("member")
  await ready()
  await main
    .getByLabel("Your update", { exact: true })
    .fill("A new product update with specific context for the community.")
  await main.getByLabel("Related product").selectOption("fieldnotes")
  await main.getByRole("button", { name: "Save draft", exact: true }).click()
  await expect(main.getByText("Draft saved for this preview session.")).toBeVisible()
  await main.getByRole("button", { name: "Discard draft", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(main.getByRole("button", { name: "Discard draft", exact: true })).toBeFocused()
  await tools.getByRole("button", { name: "Fail next request" }).click()
  await main.getByRole("button", { name: "Post update ↗", exact: true }).click()
  await expect(main.getByRole("alert").first()).toContainText("demo request failed")
  await expect(main.getByLabel("Your update", { exact: true })).toHaveValue(/specific context/)
  await main.getByRole("button", { name: "Post update ↗", exact: true }).click()
  await page.waitForURL(/#post\/local-/)
  await expect(main.getByRole("heading", { name: "Shipped update", exact: true })).toBeVisible()
  await expect(main.locator(".c-product")).toContainText("Fieldnotes")
  const createdURL = page.url()
  await main
    .getByLabel("Your reply", { exact: true })
    .fill('A helpful reply with <img src=x onerror="alert(1)"> as plain text.')
  await main.getByRole("button", { name: "Post reply", exact: true }).click()
  await expect(main.locator(".c-reply")).toHaveCount(1)
  await expect(main.locator(".c-reply img")).toHaveCount(0)
  await main.getByRole("button", { name: "Edit post", exact: true }).click()
  await expect(main.getByRole("heading", { name: "Edit your post", exact: true })).toBeVisible()
  await main.getByLabel("Title (optional)").fill("An edit that will conflict")
  await tools.getByRole("button", { name: "Simulate edit conflict" }).click()
  await main.getByRole("button", { name: "Save changes", exact: true }).click()
  await expect(
    main.getByRole("button", { name: "Discard edit draft and reload latest" }),
  ).toBeVisible()
  await expect(main.getByLabel("Title (optional)")).toHaveValue("An edit that will conflict")
  await main.getByRole("button", { name: "Discard edit draft and reload latest" }).click()
  await expect(main.getByLabel("Title (optional)")).toHaveValue("")
  await main.getByLabel("Title (optional)").fill("A clearer launch update")
  await main.getByRole("button", { name: "Save changes", exact: true }).click()
  await page.waitForURL(createdURL)
  await expect(
    main.getByRole("heading", { name: "A clearer launch update", exact: true }),
  ).toBeVisible()
  await main.getByRole("button", { name: "Save", exact: true }).click()
  await expect(main.getByRole("button", { name: "Saved", exact: true })).toBeEnabled()
  await page.locator(".c-sidebar").getByRole("button", { name: "Saved", exact: true }).click()
  await ready()
  await expect(main.locator(".c-post")).toHaveCount(1)
  await main.locator(".c-post").getByRole("button", { name: "Saved", exact: true }).click()
  await expect(main.locator(".c-post")).toHaveCount(0)
  await expect(main.getByRole("heading", { name: "No saved posts yet" })).toBeVisible()
  await page.evaluate((url) => {
    location.hash = new URL(url).hash
  }, createdURL)
  await expect(main.getByRole("button", { name: "Delete post", exact: true })).toBeVisible()
  await main.getByRole("button", { name: "Delete post", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Delete post", exact: true }).click()
  await expect(main.getByRole("heading", { name: "Post deleted", exact: true })).toBeVisible()
  await page.locator(".c-sidebar").getByRole("button", { name: "My posts", exact: true }).click()
  await ready()
  await expect(main.getByRole("button", { name: "View post status", exact: true })).toHaveCount(1)
  await tools.getByLabel("Post state").selectOption("locked")
  await expect(main.getByText("Replies are closed for this post.")).toBeVisible()
  await expect(main.locator(".c-reply-form")).toHaveCount(0)
  for (const [state, title] of [
    ["hidden", "Post hidden"],
    ["deleted", "Post deleted"],
    ["pending", "Post pending review"],
    ["missing", "Post unavailable"],
  ]) {
    await tools.getByLabel("Post state").selectOption(state)
    await expect(main.getByRole("heading", { name: title, exact: true })).toBeVisible()
    await expect(main.locator(".c-body")).toHaveCount(0)
  }
  await tools.getByLabel("Post state").selectOption("public")
  await expect(main.getByRole("heading", { name: "Shipped update", exact: true })).toBeVisible()
  await tools.getByLabel("Viewer role").selectOption("moderator")
  await page.locator(".c-sidebar").getByRole("button", { name: "Moderation", exact: true }).click()
  await expect(main.getByRole("heading", { name: "Pending report", exact: true })).toBeVisible()
  await main.getByRole("button", { name: "Hide", exact: true }).click()
  await expect(main.getByRole("button", { name: "Restore", exact: true })).toBeEnabled()
  await main.getByRole("button", { name: "Restore", exact: true }).click()
  await expect(main.getByRole("button", { name: "Resolve report", exact: true })).toBeEnabled()
  await main.getByRole("button", { name: "Resolve report", exact: true }).click()
  await expect(main.getByRole("heading", { name: "Resolved report", exact: true })).toBeVisible()
  await tools.getByLabel("Viewer role").selectOption("member")
  await expect(
    main.getByRole("heading", { name: "Moderator access required", exact: true }),
  ).toBeVisible()
  // A fresh page clears all fixture mutations and unsaved input.
  await open()
  await tools.locator("summary").click()
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, "desktop.png"), fullPage: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Overflow at ${width}`,
    )
    await expect(page.locator(".c-header").getByText("Post update ↗")).toBeVisible()
    if (width === 390)
      await page.screenshot({ path: resolve(output, "mobile.png"), fullPage: true })
  }
  await page.goto(base + "/")
  await page.keyboard.press("Tab")
  await expect(page.getByRole("link", { name: "Skip to community" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect(main).toBeFocused()
  assert.deepEqual(errors, [])
  console.log(
    "PASS: React hydration, pagination, filters, load/error/empty states, auth restrictions, optimistic rollback, drafts, accessible dialog, publish/edit/reply/save, hidden/locked/pending/missing details, moderation, and responsive layouts.",
  )
} finally {
  await browser?.close()
  server.kill("SIGTERM")
}
