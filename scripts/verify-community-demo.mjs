/** Phase 0 only: an isolated static server, no Next.js, database or credentials. */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { chromium } from "playwright"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const output = resolve(root, "artifacts/community-demo/phase0")
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
    resolve(root, "docs/demos/community"),
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
    errors.push(`Unexpected dialog: ${dialog.message()}`)
    void dialog.dismiss()
  })
  // Verify the preview works without network fonts or any other external service.
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
  )
  const open = async (hash = "") => {
    await page.goto(base + "/" + hash)
    await page.locator("h1").waitFor()
  }
  const clickCategory = async (name) => {
    await page.locator(`[data-category="${name}"]`).click()
    await page.waitForFunction(
      (name) => document.querySelector("#categories button.active")?.textContent.includes(name),
      name,
    )
  }
  await open()
  assert.equal(await page.locator(".row").count(), 5)
  assert.equal(await page.locator("html").getAttribute("lang"), "en")
  for (const type of ["Shipped", "Learning", "Question", "Milestone", "Todo"]) {
    await clickCategory(type)
    assert.equal(await page.locator(".row").count(), 1)
    assert.match(page.url(), new RegExp(`type=${type.toLowerCase()}`))
  }
  await clickCategory("All posts")
  await page
    .locator('[name="body"]')
    .fill("A useful draft that survives navigation and feed filters.")
  await page.locator('[name="product"]').selectOption("fieldnotes")
  await clickCategory("Question")
  await page.locator('[data-sort="Hot"]').click()
  await page.waitForURL(/sort=hot/)
  await page.locator(".search").fill("Fieldnotes")
  assert.equal(await page.locator(".row").count(), 1)
  const filteredURL = page.url()
  await page.locator('.row a[href^="#thread/"]').first().click()
  await page.waitForURL(/#thread/)
  await page.locator('[name="reply"]').fill("A reply draft with a concrete suggestion.")
  await page.locator(".back").click()
  await page.waitForURL(filteredURL)
  assert.equal(
    await page.locator('[name="body"]').inputValue(),
    "A useful draft that survives navigation and feed filters.",
  )
  await page.goBack()
  await page.waitForURL(/#thread/)
  assert.equal(
    await page.locator('[name="reply"]').inputValue(),
    "A reply draft with a concrete suggestion.",
  )
  await page.locator('[name="reply"]').fill("   ")
  await page.locator("#reply-form .btn").click()
  assert.match(await page.locator("#reply-error").innerText(), /1–4,000/)
  await page.locator('[name="reply"]').fill("This is a useful reply with a specific next step.")
  await page.locator("#reply-form .btn").click()
  assert.equal(await page.locator(".reply").count(), 1)
  await page.locator("[data-vote]").focus()
  await page.keyboard.press("Enter")
  assert.equal(await page.locator("[data-vote]").getAttribute("aria-pressed"), "true")
  assert.equal(
    await page.locator("[data-vote]").evaluate((e) => e === document.activeElement),
    true,
  )
  await page.locator("[data-vote]").click()
  assert.equal(await page.locator("[data-vote]").getAttribute("aria-pressed"), "false")
  await page.locator("header .btn").click()
  await page.waitForURL(/#new/)
  assert.equal(await page.locator('[name="product"]').inputValue(), "fieldnotes")
  await page.locator('[name="body"]').fill("                    ")
  await page.locator("#compose .btn").click()
  assert.equal(new URL(page.url()).hash, "#new")
  assert.equal(await page.locator('[name="body"]').getAttribute("aria-invalid"), "true")
  await page
    .locator('[name="body"]')
    .fill(
      'I shipped a safe update. <img src=x onerror="alert(1)"> ' + "Useful context. ".repeat(40),
    )
  await page.locator('[name="title"]').evaluate((input) => {
    input.value = "x".repeat(161)
  })
  await page.locator("#compose .btn").click()
  assert.match(await page.locator("#compose-error").innerText(), /160/)
  assert(await page.locator('[name="title"]').isVisible())
  await page.locator('[name="title"]').fill("")
  const validBody = await page.locator('[name="body"]').inputValue()
  await page.locator('[name="body"]').evaluate((input) => {
    input.value = "x".repeat(10001)
  })
  await page.locator("#compose .btn").click()
  assert.match(await page.locator("#compose-error").innerText(), /10,000/)
  await page.locator('[name="body"]').fill(validBody)
  await page.locator('[name="category"]').selectOption("Todo")
  await page.locator("#draft").click()
  // Simulate ordinary HTTP environments where randomUUID is unavailable.
  await page.evaluate(() => Object.defineProperty(crypto, "randomUUID", { value: undefined }))
  await page.locator("#compose .btn").click()
  await page.waitForURL(/#thread\/demo-/)
  assert.equal(await page.locator(".detail h1").innerText(), "Todo update")
  assert.equal(await page.locator(".body img").count(), 0)
  assert.match(await page.locator(".product-card").innerText(), /Fieldnotes/)
  await page.locator("[data-save]").click()
  await clickCategory("My posts")
  // Search is deliberately retained across views: clear it before showing the post.
  await page.locator(".search").fill("")
  assert.equal(await page.locator(".row").count(), 1)
  assert.equal(await page.getByText("Read full post →").count(), 1)
  await clickCategory("Saved")
  assert.equal(await page.locator(".row").count(), 1)
  await page.locator("[data-save]").click()
  assert.equal(await page.locator(".row").count(), 0)
  assert.match(await page.locator(".empty h2").innerText(), /saved posts/)
  await page.locator(".search").fill("No matches at all")
  assert.match(await page.locator(".empty h2").innerText(), /No matching/)
  await page.getByRole("button", { name: "Clear search" }).click()
  await page.waitForURL(/#\?view=saved&sort=hot$/)
  await open("#?type=learning&sort=hot&q=prototype")
  await page.reload()
  await page.locator(".row").first().waitFor()
  assert.equal(await page.locator(".row").count(), 1)
  assert.equal(await page.locator(".search").inputValue(), "prototype")
  await open("#?type=invalid&sort=invalid")
  assert.equal(await page.locator(".row").count(), 5)
  await open("#thread/missing")
  assert.match(await page.locator("h1").innerText(), /Post not found/)
  await open("#unknown")
  assert.match(await page.locator("h1").innerText(), /Page not found/)
  await open()
  await page.keyboard.press("Tab")
  assert.equal(await page.locator(".skip-link").evaluate((e) => e === document.activeElement), true)
  await page.keyboard.press("Enter")
  assert.equal(await page.locator("main").evaluate((e) => e === document.activeElement), true)
  await page.locator(".preview").click()
  await page.evaluate(() => window.scrollTo(0, 0))
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: resolve(output, "desktop.png"), fullPage: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Horizontal overflow at ${width}px`,
    )
    assert(await page.locator("header .btn").isVisible())
    await clickCategory("My posts")
    await clickCategory("All posts")
    if (width === 390)
      await page.screenshot({ path: resolve(output, "mobile.png"), fullPage: true })
  }
  assert.match(
    await page.locator("h1").evaluate((e) => getComputedStyle(e).fontFamily),
    /sans-serif/,
  )
  // Reopening clears local mutations and drafts while known fixture URLs remain usable.
  await open()
  assert.equal(await page.locator(".row").count(), 5)
  assert.equal(await page.locator('[name="body"]').inputValue(), "")
  // The standalone artifact also supports opening directly from disk.
  await page.unrouteAll()
  await page.route("https://**/*", (route) => route.abort())
  await page.goto(pathToFileURL(resolve(root, "docs/demos/community/index.html")).href)
  await page.locator(".row").first().waitFor()
  await page.locator(".search").fill("CSV")
  assert.equal(await page.locator(".row").count(), 1)
  await page
    .locator('[name="body"]')
    .fill("A direct-file preview update with enough useful context.")
  await page.locator("#compose .btn").click()
  await page.waitForURL(/#thread\/demo-/)
  assert.equal(await page.locator(".detail h1").innerText(), "Shipped update")
  assert.deepEqual(errors, [])
  console.log(
    "PASS: Phase 0 navigation/history, five types, URL filters, drafts, optional-title publishing, product association, replies, vote focus, bookmarks, validation, escaped content, missing routes, offline fonts, reset and 320/390px layout.",
  )
  console.log(`Screenshots: ${output}`)
} finally {
  await browser?.close()
  server.kill("SIGTERM")
}
