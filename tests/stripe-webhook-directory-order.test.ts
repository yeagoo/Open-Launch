import { beforeEach, describe, expect, it, vi } from "vitest"

import type { PremiumLaunchConfirmationResult } from "@/lib/premium-launch-confirmation"
import { POST } from "@/app/api/auth/stripe/webhook/route"

// Tests for the directory-order branch of the Stripe webhook, focused on
// the project-deleted (SET NULL) end-state introduced in migration 0048:
//   pending  + null projectId  -> orphan refund
//   paid     + null projectId  + same session      -> idempotent no-op
//   paid     + null projectId  + different session -> duplicate refund
// plus the signature gate.

// ─── Chainable drizzle mock ────────────────────────────────────────────────
// The route composes long drizzle chains (db.select().from().where().limit(),
// db.update().set().where().returning()). This proxy absorbs any method call
// and resolves — in call order — from a programmed result queue.
const dbResults: unknown[] = []

function makeChain(): unknown {
  const fn = function () {
    return makeChain()
  }
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          const next = dbResults.length > 1 ? dbResults.shift() : dbResults[0]
          return Promise.resolve(next).then(resolve, reject)
        }
      }
      if (prop === "transaction") {
        return async (cb: (tx: unknown) => unknown) => cb(makeChain())
      }
      return () => makeChain()
    },
    apply() {
      return makeChain()
    },
  })
}

vi.mock("@/drizzle/db", () => ({
  db: new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "transaction") return async (cb: (tx: unknown) => unknown) => cb(makeChain())
        return makeChain()
      },
    },
  ),
}))

// ─── Stripe mock ────────────────────────────────────────────────────────────
const constructEventMock = vi.hoisted(() => vi.fn())
const refundsCreateMock = vi.hoisted(() =>
  vi.fn(async (): Promise<{ id: string; amount?: number; currency?: string }> => ({
    id: "re_123",
  })),
)

vi.mock("@/lib/stripe", () => ({
  createStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
    refunds: { create: refundsCreateMock },
    subscriptions: { cancel: vi.fn() },
  }),
}))

// ─── Side-effect mocks ─────────────────────────────────────────────────────
const adminNotifyMock = vi.hoisted(() => vi.fn(async () => ({ success: true })))
const buyerNotifyMock = vi.hoisted(() => vi.fn(async () => ({ success: true })))
const enqueueEmailMock = vi.hoisted(() => vi.fn(async () => undefined))
const confirmPaidPremiumLaunchMock = vi.hoisted(() =>
  vi.fn<() => Promise<PremiumLaunchConfirmationResult>>(async () => ({
    status: "scheduled",
    projectId: "project-1",
    slug: "example",
  })),
)
const enqueueLaunchSyndicationMock = vi.hoisted(() => vi.fn(async () => undefined))
const notifyDiscordForScheduledProjectMock = vi.hoisted(() => vi.fn(async () => undefined))
const revalidatePathMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/transactional-emails", () => ({
  sendAdminPaymentNotification: adminNotifyMock,
  sendBuyerDirectoryOrderConfirmation: buyerNotifyMock,
  sendListingLiveEmail: vi.fn(async () => ({})),
}))

vi.mock("@/lib/rate-limit", () => ({
  dedupeOnce: vi.fn(async () => true),
}))

vi.mock("@/lib/email-outbox", () => ({
  enqueueEmail: enqueueEmailMock,
}))

vi.mock("@/lib/premium-launch-confirmation", () => ({
  confirmPaidPremiumLaunch: confirmPaidPremiumLaunchMock,
}))

vi.mock("@/lib/project-launch-notification", () => ({
  notifyDiscordForScheduledProject: notifyDiscordForScheduledProjectMock,
}))

vi.mock("@/lib/launch-syndication", () => ({
  enqueueLaunchSyndication: enqueueLaunchSyndicationMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: vi.fn(),
}))

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"

function webhookRequest(options: { signature?: string | null; body?: string } = {}): Request {
  const headers = new Headers()
  if (options.signature !== null) {
    headers.set("stripe-signature", options.signature ?? "sig_test")
  }
  return new Request("https://aat.ee/api/auth/stripe/webhook", {
    method: "POST",
    headers,
    body: options.body ?? JSON.stringify({ id: "evt_1" }),
  })
}

const ORDER_ID = "00000000-0000-0000-0000-000000000042"

function paidSession(id: string) {
  return {
    id,
    object: "checkout.session",
    client_reference_id: `dir_${ORDER_ID}`,
    payment_status: "paid",
    mode: "payment",
    payment_intent: "pi_123",
    amount_total: 4900,
    currency: "usd",
    customer_details: { email: "buyer@example.com", name: "Buyer" },
    subscription: null,
    total_details: { amount_discount: 0 },
  }
}

function orderRow(overrides: Record<string, unknown>) {
  return {
    id: ORDER_ID,
    projectId: null, // project deleted after order creation (SET NULL)
    tier: "plus",
    url: "https://example.com",
    locale: "en",
    buyerEmail: "buyer@example.com",
    buyerName: "Buyer",
    status: "pending",
    amountCents: 4900,
    currency: "usd",
    stripeSessionId: "cs_first",
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    paidAt: null,
    amountVerified: true,
    ...overrides,
  }
}

function premiumProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "project-1",
    name: "Example",
    websiteUrl: "https://example.com",
    launchType: "premium",
    launchStatus: "payment_pending",
    scheduledLaunchDate: new Date("2026-08-01T00:00:00.000Z"),
    premiumPriceCents: 4900,
    ...overrides,
  }
}

function fireCompleted(session: ReturnType<typeof paidSession>) {
  constructEventMock.mockReturnValue({
    id: "evt_1",
    type: "checkout.session.completed",
    data: { object: session },
  })
  return POST(webhookRequest())
}

beforeEach(() => {
  dbResults.length = 0
  constructEventMock.mockReset()
  refundsCreateMock.mockClear()
  adminNotifyMock.mockClear()
  buyerNotifyMock.mockClear()
  enqueueEmailMock.mockReset()
  enqueueEmailMock.mockResolvedValue(undefined)
  confirmPaidPremiumLaunchMock.mockReset()
  confirmPaidPremiumLaunchMock.mockResolvedValue({
    status: "scheduled",
    projectId: "project-1",
    slug: "example",
  })
  enqueueLaunchSyndicationMock.mockClear()
  notifyDiscordForScheduledProjectMock.mockClear()
  revalidatePathMock.mockClear()
  process.env.PAYMENT_EMAIL_OUTBOX_ENABLED = "true"
})

describe("stripe webhook signature gate", () => {
  it("rejects a missing signature without invoking Stripe verification", async () => {
    const res = await POST(webhookRequest({ signature: null }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: "No signature header" })
    expect(constructEventMock).not.toHaveBeenCalled()
  })

  it("rejects an invalid signature with 400", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("bad signature")
    })
    const res = await POST(webhookRequest())
    expect(res.status).toBe(400)
    expect(refundsCreateMock).not.toHaveBeenCalled()
  })

  it("rejects a body larger than the bounded webhook limit", async () => {
    const res = await POST(webhookRequest({ body: "x".repeat(1024 * 1024 + 1) }))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: "Payload too large" })
    expect(constructEventMock).not.toHaveBeenCalled()
  })
})

describe("stripe webhook event routing", () => {
  it("acknowledges unhandled events without payment side effects", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_unhandled",
      type: "customer.created",
      data: { object: { id: "cus_123" } },
    })
    const res = await POST(webhookRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true })
    expect(refundsCreateMock).not.toHaveBeenCalled()
    expect(adminNotifyMock).not.toHaveBeenCalled()
  })

  it("does not cancel a healthy legacy subscription", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_subscription",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_123", status: "active" } },
    })
    const res = await POST(webhookRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, noop: true })
    expect(refundsCreateMock).not.toHaveBeenCalled()
  })

  it("refunds a paid session whose referenced project no longer exists exactly once", async () => {
    dbResults.push([])
    const session = {
      ...paidSession("cs_missing_project"),
      client_reference_id: "project-missing",
    }
    constructEventMock.mockReturnValue({
      id: "evt_missing_project",
      type: "checkout.session.completed",
      data: { object: session },
    })
    const res = await POST(webhookRequest())
    expect(res.status).toBe(200)
    expect(refundsCreateMock).toHaveBeenCalledTimes(1)
    expect(adminNotifyMock).toHaveBeenCalledTimes(1)
  })

  it("uses the actual refund amount when Stripe omits session.amount_total", async () => {
    dbResults.push([])
    refundsCreateMock.mockResolvedValueOnce({
      id: "re_actual_amount",
      amount: 4900,
      currency: "usd",
    })
    constructEventMock.mockReturnValue({
      id: "evt_missing_amount",
      type: "checkout.session.completed",
      data: {
        object: {
          ...paidSession("cs_missing_amount"),
          client_reference_id: "project-missing",
          amount_total: null,
        },
      },
    })

    const res = await POST(webhookRequest())

    expect(res.status).toBe(200)
    expect(adminNotifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 49, currency: "usd" }),
    )
  })

  it("refunds a malformed directory reference without querying the UUID column", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_empty_directory_ref",
      type: "checkout.session.completed",
      data: {
        object: {
          ...paidSession("cs_empty_directory_ref"),
          client_reference_id: "dir_",
        },
      },
    })

    const res = await POST(webhookRequest())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      received: true,
      warning: "Invalid directory order reference",
    })
    expect(refundsCreateMock).toHaveBeenCalledTimes(1)
    expect(adminNotifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: expect.stringContaining("invalid directory_order reference"),
      }),
    )
  })
})

describe("premium payment durable completion", () => {
  it("uses the shared completion path for an immediate paid session", async () => {
    dbResults.push([premiumProjectRow()])
    const session = {
      ...paidSession("cs_premium_immediate"),
      client_reference_id: "project-1",
    }
    constructEventMock.mockReturnValue({
      id: "evt_premium_immediate",
      type: "checkout.session.completed",
      data: { object: session },
    })

    const res = await POST(webhookRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(confirmPaidPremiumLaunchMock).toHaveBeenCalledWith("project-1")
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      "payment_admin",
      "stripe:premium:cs_premium_immediate:admin",
      expect.objectContaining({
        amount: 49,
        projectName: "Example",
      }),
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/sitemap.xml")
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects/example")
    expect(adminNotifyMock).not.toHaveBeenCalled()
  })

  it("runs delayed-payment success through the same notification and revalidation path", async () => {
    dbResults.push([premiumProjectRow()])
    const session = {
      ...paidSession("cs_premium_delayed"),
      client_reference_id: "project-1",
    }
    constructEventMock.mockReturnValue({
      id: "evt_premium_delayed",
      type: "checkout.session.async_payment_succeeded",
      data: { object: session },
    })

    const res = await POST(webhookRequest())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, confirmation: "scheduled" })
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      "payment_admin",
      "stripe:premium:cs_premium_delayed:admin",
      expect.any(Object),
    )
    expect(notifyDiscordForScheduledProjectMock).toHaveBeenCalledWith("project-1")
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects/example")
  })

  it("repairs a missed enqueue on an already-processed replay with the same event key", async () => {
    dbResults.push([premiumProjectRow({ launchStatus: "scheduled" })])
    confirmPaidPremiumLaunchMock.mockResolvedValueOnce({
      status: "already_processed",
      projectId: "project-1",
      slug: "example",
      launchStatus: "scheduled",
    })
    const session = {
      ...paidSession("cs_premium_replay"),
      client_reference_id: "project-1",
    }
    constructEventMock.mockReturnValue({
      id: "evt_premium_replay",
      type: "checkout.session.completed",
      data: { object: session },
    })

    const res = await POST(webhookRequest())

    expect(res.status).toBe(200)
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      "payment_admin",
      "stripe:premium:cs_premium_replay:admin",
      expect.any(Object),
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects/example")
    expect(notifyDiscordForScheduledProjectMock).not.toHaveBeenCalled()
    expect(adminNotifyMock).not.toHaveBeenCalled()
  })

  it("returns 500 when the durable enqueue fails so Stripe can retry", async () => {
    dbResults.push([premiumProjectRow()])
    enqueueEmailMock.mockRejectedValueOnce(new Error("database unavailable"))
    const session = {
      ...paidSession("cs_premium_enqueue_failure"),
      client_reference_id: "project-1",
    }
    constructEventMock.mockReturnValue({
      id: "evt_premium_enqueue_failure",
      type: "checkout.session.completed",
      data: { object: session },
    })

    const res = await POST(webhookRequest())

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "Webhook handler failed" })
  })

  it("keeps the pre-Phase-8 inline sender while the rollout flag is disabled", async () => {
    process.env.PAYMENT_EMAIL_OUTBOX_ENABLED = "false"
    dbResults.push([premiumProjectRow()])
    const session = {
      ...paidSession("cs_premium_consumer_only"),
      client_reference_id: "project-1",
    }
    constructEventMock.mockReturnValue({
      id: "evt_premium_consumer_only",
      type: "checkout.session.completed",
      data: { object: session },
    })

    const res = await POST(webhookRequest())

    expect(res.status).toBe(200)
    expect(adminNotifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: "buyer@example.com",
        projectName: "Example",
      }),
    )
    expect(enqueueEmailMock).not.toHaveBeenCalled()
  })
})

describe("directory payment durable completion", () => {
  it("persists admin and buyer emails after the guarded paid transition", async () => {
    const session = {
      ...paidSession("cs_directory_paid"),
      amount_total: 699,
    }
    dbResults.push(
      [
        orderRow({
          projectId: "project-1",
          status: "pending",
          stripeSessionId: null,
          amountCents: 699,
        }),
      ],
      { rowCount: 1 },
      [{ name: "Example", websiteUrl: "https://example.com" }],
    )

    const res = await fireCompleted(session)

    expect(res.status).toBe(200)
    expect(enqueueLaunchSyndicationMock).toHaveBeenCalledWith(ORDER_ID, "project-1", "plus")
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      "payment_admin",
      "stripe:directory:cs_directory_paid:admin",
      expect.any(Object),
    )
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      "directory_order_confirmation",
      "stripe:directory:cs_directory_paid:buyer",
      expect.objectContaining({
        buyerEmail: "buyer@example.com",
        tier: "plus",
        amount: 6.99,
      }),
    )
  })

  it("repairs scheduling, syndication, revalidation and outbox on same-session replay", async () => {
    const session = {
      ...paidSession("cs_directory_replay"),
      amount_total: 699,
    }
    dbResults.push(
      [
        orderRow({
          projectId: "project-1",
          status: "paid",
          stripeSessionId: "cs_directory_replay",
          amountCents: 699,
        }),
      ],
      { rowCount: 0 },
      [
        {
          status: "paid",
          stripeSessionId: "cs_directory_replay",
          amountVerified: true,
        },
      ],
      [{ name: "Example", websiteUrl: "https://example.com" }],
    )
    confirmPaidPremiumLaunchMock.mockResolvedValueOnce({
      status: "already_processed",
      projectId: "project-1",
      slug: "example",
      launchStatus: "scheduled",
    })

    const res = await fireCompleted(session)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, idempotent: true })
    expect(enqueueLaunchSyndicationMock).toHaveBeenCalledWith(ORDER_ID, "project-1", "plus")
    expect(revalidatePathMock).toHaveBeenCalledWith("/projects/example")
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      "payment_admin",
      "stripe:directory:cs_directory_replay:admin",
      expect.any(Object),
    )
    expect(enqueueEmailMock).toHaveBeenCalledWith(
      "directory_order_confirmation",
      "stripe:directory:cs_directory_replay:buyer",
      expect.any(Object),
    )
    expect(notifyDiscordForScheduledProjectMock).not.toHaveBeenCalled()
  })
})

describe("directory order with deleted project (null projectId)", () => {
  it("refunds a pending order — money has nowhere to go", async () => {
    dbResults.push([orderRow({ status: "pending" })])
    const res = await fireCompleted(paidSession("cs_second"))
    expect(res.status).toBe(200)
    expect(refundsCreateMock).toHaveBeenCalledTimes(1)
    expect(refundsCreateMock).toHaveBeenCalledWith(
      { payment_intent: "pi_123" },
      { idempotencyKey: "orphan-refund-cs_second" },
    )
    expect(adminNotifyMock).toHaveBeenCalled()
  })

  it("refunds a canceled order paid after cancellation", async () => {
    dbResults.push([orderRow({ status: "canceled" })])
    const res = await fireCompleted(paidSession("cs_second"))
    expect(res.status).toBe(200)
    expect(refundsCreateMock).toHaveBeenCalledTimes(1)
  })

  it("no-ops a paid order retried with the SAME session", async () => {
    dbResults.push([orderRow({ status: "paid", stripeSessionId: "cs_first" })])
    const res = await fireCompleted(paidSession("cs_first"))
    expect(res.status).toBe(200)
    expect(refundsCreateMock).not.toHaveBeenCalled()
    expect(adminNotifyMock).not.toHaveBeenCalled()
  })

  it("refunds a paid order hit by a DIFFERENT (duplicate) session", async () => {
    dbResults.push([orderRow({ status: "paid", stripeSessionId: "cs_first" })])
    const res = await fireCompleted(paidSession("cs_duplicate"))
    expect(res.status).toBe(200)
    expect(refundsCreateMock).toHaveBeenCalledTimes(1)
    expect(refundsCreateMock).toHaveBeenCalledWith(
      { payment_intent: "pi_123" },
      { idempotencyKey: "orphan-refund-cs_duplicate" },
    )
  })
})
