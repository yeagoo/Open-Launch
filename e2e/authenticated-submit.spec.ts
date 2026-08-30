import { expect, test } from "@playwright/test"

import { blockExternalBrowserRequests } from "./helpers/network"
import { releaseFixture } from "./helpers/release-fixture"

test.use({ storageState: "test-results/.auth/release-user.json" })

test("authenticated submit exposes all visible client validation errors", async ({ page }) => {
  await blockExternalBrowserRequests(page)
  await page.goto("/projects/submit")
  await page.getByRole("button", { name: "Next" }).click()
  await expect(page.locator("form").getByRole("alert")).toHaveCount(4)
})

test("authenticated user can toggle a real database-backed upvote", async ({ page }) => {
  await blockExternalBrowserRequests(page)
  await page.goto(`/projects/${releaseFixture.projectSlug}`)

  const button = page.getByRole("button", { name: "Upvote (0 upvotes)" })
  await expect(button).toHaveAttribute("aria-pressed", "false")
  await button.click()
  await expect(page.getByRole("button", { name: "Remove upvote (1 upvotes)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
})

test("directory checkout creates a test reference and never contacts Stripe", async ({ page }) => {
  await blockExternalBrowserRequests(page)
  const checkout = { url: null as URL | null }

  await page.route("https://checkout.stripe.test/**", async (route) => {
    checkout.url = new URL(route.request().url())
    await route.fulfill({ status: 200, contentType: "text/html", body: "fixture checkout" })
  })
  await page.route(/https:\/\/(?:api\.)?stripe\.com\/.*/, async (route) => {
    throw new Error(`real Stripe request attempted: ${route.request().url()}`)
  })

  await page.goto("/dashboard")
  await page.getByRole("button", { name: "Boost listing" }).click()
  await page.getByRole("menuitem", { name: /^Basic/ }).click()
  await expect.poll(() => checkout.url?.hostname ?? null).toBe("checkout.stripe.test")
  expect(checkout.url?.pathname).toBe("/basic")
  expect(checkout.url?.searchParams.get("client_reference_id")).toMatch(
    /^dir_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
})
