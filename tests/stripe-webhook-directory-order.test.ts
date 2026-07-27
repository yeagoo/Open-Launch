import { beforeEach, describe, expect, it, vi } from "vitest"

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
const refundsCreateMock = vi.hoisted(() => vi.fn(async () => ({ id: "re_123" })))

vi.mock("@/lib/stripe", () => ({
  createStripeClient: () => ({
    webhooks: { constructEvent: constructEventMock },
    refunds: { create: refundsCreateMock },
    subscriptions: { cancel: vi.fn() },
  }),
}))

// ─── Side-effect mocks ─────────────────────────────────────────────────────
const adminNotifyMock = vi.hoisted(() => vi.fn(async () => ({ success: true })))

vi.mock("@/lib/transactional-emails", () => ({
  sendAdminPaymentNotification: adminNotifyMock,
  sendBuyerDirectoryOrderConfirmation: vi.fn(async () => ({})),
  sendListingLiveEmail: vi.fn(async () => ({})),
}))

vi.mock("@/lib/rate-limit", () => ({
  dedupeOnce: vi.fn(async () => true),
}))

vi.mock("@/lib/premium-launch-confirmation", () => ({
  confirmPaidPremiumLaunch: vi.fn(async () => ({ status: "confirmed" })),
}))

vi.mock("@/lib/project-launch-notification", () => ({
  notifyDiscordForScheduledProject: vi.fn(async () => ({})),
}))

vi.mock("@/lib/launch-syndication", () => ({
  enqueueLaunchSyndication: vi.fn(async () => ({})),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

process.env.STRIPE_WEBHOOK_SECRET = "whsec_test"

function webhookRequest(): Request {
  return new Request("https://aat.ee/api/auth/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: JSON.stringify({ id: "evt_1" }),
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
})

describe("stripe webhook signature gate", () => {
  it("rejects an invalid signature with 400", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("bad signature")
    })
    const res = await POST(webhookRequest())
    expect(res.status).toBe(400)
    expect(refundsCreateMock).not.toHaveBeenCalled()
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
