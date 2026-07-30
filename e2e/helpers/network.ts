import type { Page } from "@playwright/test"

export async function blockExternalBrowserRequests(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url())
    if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      await route.continue()
      return
    }
    await route.abort("blockedbyclient")
  })
}
