import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  sendAdminPaymentNotification,
  sendBuyerDirectoryOrderConfirmation,
} from "@/lib/transactional-emails"

const sendEmailMock = vi.hoisted(() => vi.fn(async () => ({ success: true })))

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
}))

beforeEach(() => {
  sendEmailMock.mockClear()
})

describe("payment email provider idempotency", () => {
  it("forwards the outbox key to the admin payment send", async () => {
    await sendAdminPaymentNotification({
      userEmail: "buyer@example.com",
      amount: 49,
      currency: "usd",
      projectName: "Example",
      websiteUrl: "https://example.com",
      idempotencyKey: "stripe:premium:cs_123:admin",
    })

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "stripe:premium:cs_123:admin",
      }),
    )
  })

  it("forwards the outbox key to the directory buyer send", async () => {
    await sendBuyerDirectoryOrderConfirmation({
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

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "stripe:directory:cs_123:buyer",
        replyTo: "contact@aat.ee",
      }),
    )
  })
})
