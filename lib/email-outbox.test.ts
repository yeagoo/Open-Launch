import { beforeEach, describe, expect, it, vi } from "vitest"

import { sendEmailOutboxItem } from "@/lib/email-outbox"

const emailMocks = vi.hoisted(() => ({
  adminPayment: vi.fn(async () => ({ success: true })),
  directoryConfirmation: vi.fn(async () => ({ success: true })),
  launchReminder: vi.fn(async () => ({ success: true })),
  winnerBadge: vi.fn(async () => ({ success: true })),
}))

vi.mock("@/lib/transactional-emails", () => ({
  sendAdminPaymentNotification: emailMocks.adminPayment,
  sendBuyerDirectoryOrderConfirmation: emailMocks.directoryConfirmation,
  sendLaunchReminderEmail: emailMocks.launchReminder,
  sendWinnerBadgeEmail: emailMocks.winnerBadge,
}))

vi.mock("@/drizzle/db", () => ({ db: {} }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("email outbox payment dispatch", () => {
  it("passes the stable event key to the admin payment email provider", async () => {
    await sendEmailOutboxItem(
      "payment_admin",
      {
        userEmail: "buyer@example.com",
        amount: 49,
        currency: "usd",
        projectName: "Example",
        websiteUrl: "https://example.com",
      },
      "stripe:premium:cs_123:admin",
    )

    expect(emailMocks.adminPayment).toHaveBeenCalledWith({
      userEmail: "buyer@example.com",
      amount: 49,
      currency: "usd",
      projectName: "Example",
      websiteUrl: "https://example.com",
      idempotencyKey: "stripe:premium:cs_123:admin",
    })
  })

  it("passes the stable event key to the buyer confirmation provider", async () => {
    await sendEmailOutboxItem(
      "directory_order_confirmation",
      {
        buyerEmail: "buyer@example.com",
        buyerName: "Buyer",
        tier: "plus",
        projectName: "Example",
        websiteUrl: "https://example.com",
        amount: 6.99,
        currency: "usd",
        locale: "en",
      },
      "stripe:directory:cs_123:buyer",
    )

    expect(emailMocks.directoryConfirmation).toHaveBeenCalledWith({
      buyerEmail: "buyer@example.com",
      buyerName: "Buyer",
      tier: "plus",
      projectName: "Example",
      websiteUrl: "https://example.com",
      amount: 6.99,
      currency: "usd",
      locale: "en",
      idempotencyKey: "stripe:directory:cs_123:buyer",
    })
  })

  it("fails closed for an unknown persisted kind", async () => {
    await expect(
      sendEmailOutboxItem(
        "unknown_kind" as never,
        {
          email: "buyer@example.com",
          name: null,
          projectName: "Example",
          projectSlug: "example",
        } as never,
        "unknown:key",
      ),
    ).rejects.toThrow("Unsupported email outbox kind: unknown_kind")
    expect(emailMocks.launchReminder).not.toHaveBeenCalled()
  })
})
