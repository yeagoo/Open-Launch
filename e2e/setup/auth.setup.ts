import { expect, test as setup } from "@playwright/test"

import { blockExternalBrowserRequests } from "../helpers/network"
import { releaseFixture, seedReleaseFixture, signedSessionCookie } from "../helpers/release-fixture"

const authFile = "test-results/.auth/release-user.json"

setup("seed isolated release fixture and authenticate", async ({ context, page, baseURL }) => {
  const databaseUrl = process.env.E2E_DATABASE_URL
  const secret = process.env.BETTER_AUTH_SECRET
  if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required")
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required")
  if (!baseURL) throw new Error("Playwright baseURL is required")

  const target = new URL(baseURL)
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
    throw new Error("Playwright release smoke may only target loopback")
  }

  await seedReleaseFixture(databaseUrl)
  await blockExternalBrowserRequests(page)
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: signedSessionCookie(releaseFixture.sessionToken, secret),
      domain: target.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ])
  await page.goto("/projects/submit")
  await expect(page).toHaveURL(/\/projects\/submit$/)
  await expect(page.getByRole("heading", { name: "Submit a Project" })).toBeVisible()
  await context.storageState({ path: authFile })
})
