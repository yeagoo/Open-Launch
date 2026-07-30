import { expect, test } from "@playwright/test"

import { blockExternalBrowserRequests } from "./helpers/network"

test.use({ storageState: "test-results/.auth/release-user.json" })

test("authenticated submit exposes all visible client validation errors", async ({ page }) => {
  await blockExternalBrowserRequests(page)
  await page.goto("/projects/submit")
  await page.getByRole("button", { name: "Next" }).click()
  await expect(page.locator("form").getByRole("alert")).toHaveCount(4)
})
