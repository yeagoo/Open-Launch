import { expect, test as setup } from "@playwright/test"

import { blockExternalBrowserRequests } from "../helpers/network"
import {
  communityFixture,
  communityModeratorAuthFile,
  releaseFixture,
  releaseUserAuthFile,
  seedReleaseFixture,
  signedSessionCookie,
} from "../helpers/release-fixture"

setup(
  "seed isolated release fixture and authenticate",
  async ({ browser, context, page, baseURL }) => {
    const databaseUrl = process.env.E2E_DATABASE_URL
    const secret = process.env.BETTER_AUTH_SECRET
    if (!databaseUrl) throw new Error("E2E_DATABASE_URL is required")
    if (!secret) throw new Error("BETTER_AUTH_SECRET is required")
    if (!baseURL) throw new Error("Playwright baseURL is required")

    const target = new URL(baseURL)
    if (target.protocol !== "http:" || target.hostname !== "localhost") {
      throw new Error("Playwright release smoke must use http://localhost")
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
    await context.storageState({ path: releaseUserAuthFile })

    const moderatorContext = await browser.newContext()
    try {
      await moderatorContext.addCookies([
        {
          name: "better-auth.session_token",
          value: signedSessionCookie(communityFixture.moderatorSessionToken, secret),
          domain: target.hostname,
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: false,
          expires: Math.floor(Date.now() / 1000) + 60 * 60,
        },
      ])
      await moderatorContext.storageState({ path: communityModeratorAuthFile })
    } finally {
      await moderatorContext.close()
    }
  },
)
