import { expect, test } from "@playwright/test"

import { blockExternalBrowserRequests } from "./helpers/network"
import { releaseFixture } from "./helpers/release-fixture"

test.beforeEach(async ({ page }) => {
  await blockExternalBrowserRequests(page)
})

test("locale route preserves locale during navigation", async ({ page }) => {
  await page.goto("/es")
  await page.getByRole("button", { name: /explorar/i }).click()
  const trending = page.locator('a[href="/es/trending"]').first()
  await expect(trending).toBeVisible()
  await trending.click()
  await expect(page).toHaveURL(/\/es\/trending$/)
})

test("anonymous search returns the database-backed release fixture", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: /search projects/i }).click()
  await page.getByPlaceholder("Search projects...").fill(releaseFixture.projectName)
  await expect(page.getByText(releaseFixture.projectName, { exact: true })).toBeVisible()
})

test("anonymous submit is redirected to sign-in with its return path", async ({ page }) => {
  await page.goto("/projects/submit")
  const url = new URL(page.url())
  expect(url.pathname).toBe("/sign-in")
  expect(url.searchParams.get("redirect")).toBe("/projects/submit")
})

test("project metadata, structured data and lazy comments are release-safe", async ({
  baseURL,
  page,
  request,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required")
  const path = `/es/projects/${releaseFixture.projectSlug}`
  const response = await request.get(path)
  expect(response.status()).toBe(200)
  const serverHtml = await response.text()
  expect(serverHtml).not.toContain('data-fuma-comment-container="true"')

  await page.goto(path)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${baseURL}${path}`)
  const productSchema = page.locator("#schema-product")
  await expect(productSchema).toHaveCount(1)
  const schema = JSON.parse((await productSchema.textContent()) ?? "{}")
  expect(schema).toMatchObject({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: releaseFixture.projectName,
  })
  await expect(page.locator('[data-fuma-comment-container="true"]')).toBeVisible()
})

test("sitemap index and project shard expose the public fixture", async ({ request }) => {
  const index = await request.get("/sitemap.xml")
  expect(index.status()).toBe(200)
  expect(index.headers()["content-type"]).toContain("application/xml")
  expect(await index.text()).toContain("/sitemaps/projects-1.xml")

  const shard = await request.get("/sitemaps/projects-1.xml")
  expect(shard.status()).toBe(200)
  expect(await shard.text()).toContain(`/projects/${releaseFixture.projectSlug}`)
})

test("payment success renders only from an intercepted test fixture", async ({ page }) => {
  let verificationRequests = 0
  await page.route("**/api/payment/verify?*", async (route) => {
    verificationRequests += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "complete",
        projectSlug: releaseFixture.projectSlug,
      }),
    })
  })
  await page.route(/https:\/\/(?:api\.)?stripe\.com\/.*/, async (route) => {
    throw new Error(`real Stripe request attempted: ${route.request().url()}`)
  })

  await page.goto("/payment/success?session_id=e2e_fixture_only")
  await expect(page.getByRole("heading", { name: "Payment Successful" })).toBeVisible()
  expect(verificationRequests).toBe(1)
})
