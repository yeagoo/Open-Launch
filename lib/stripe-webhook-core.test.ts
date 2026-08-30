import { describe, expect, it } from "vitest"

import {
  chargedAmountMatches,
  classifyDirectoryOrderReplay,
  directoryOrderIdFromReference,
  isDeadSubscriptionStatus,
} from "@/lib/stripe-webhook-core"

describe("Stripe webhook core decisions", () => {
  it("accepts a tax-exclusive catalogue price with buyer VAT added", () => {
    expect(
      chargedAmountMatches(
        {
          currency: "usd",
          amount_subtotal: 2_599,
          amount_total: 3_119,
          total_details: { amount_discount: 0, amount_tax: 520, amount_shipping: 0 },
        } as never,
        2_599,
      ),
    ).toBe(true)
  })

  it("accepts the captured USD amount with an applied discount", () => {
    expect(
      chargedAmountMatches(
        {
          currency: "usd",
          amount_total: 3_900,
          total_details: { amount_discount: 1_000 },
        } as never,
        4_900,
      ),
    ).toBe(true)
  })

  it("uses the tax-aware fallback when Stripe omits amount_subtotal", () => {
    expect(
      chargedAmountMatches(
        {
          currency: "usd",
          amount_total: 3_119,
          total_details: { amount_discount: 0, amount_tax: 520, amount_shipping: 0 },
        } as never,
        2_599,
      ),
    ).toBe(true)
  })

  it("still rejects a genuinely wrong catalogue price when tax is present", () => {
    expect(
      chargedAmountMatches(
        {
          currency: "usd",
          amount_subtotal: 2_999,
          amount_total: 3_599,
          total_details: { amount_discount: 0, amount_tax: 600, amount_shipping: 0 },
        } as never,
        2_599,
      ),
    ).toBe(false)
  })

  it("holds wrong currencies and malformed amounts", () => {
    expect(chargedAmountMatches({ currency: "eur", amount_total: 4_900 } as never, 4_900)).toBe(
      false,
    )
    expect(chargedAmountMatches({ currency: "usd", amount_total: null } as never, 4_900)).toBe(
      false,
    )
  })

  it("parses only canonical UUID directory references", () => {
    const orderId = "00000000-0000-0000-0000-000000000042"
    expect(directoryOrderIdFromReference(`dir_${orderId}`)).toBe(orderId)
    expect(directoryOrderIdFromReference("dir_order-123")).toBeNull()
    expect(directoryOrderIdFromReference("dir_")).toBeNull()
    expect(directoryOrderIdFromReference("project-123")).toBeNull()
    expect(directoryOrderIdFromReference(null)).toBeNull()
  })

  it("acts only on terminal subscription states", () => {
    expect(isDeadSubscriptionStatus("canceled")).toBe(true)
    expect(isDeadSubscriptionStatus("unpaid")).toBe(true)
    expect(isDeadSubscriptionStatus("incomplete_expired")).toBe(true)
    expect(isDeadSubscriptionStatus("active")).toBe(false)
    expect(isDeadSubscriptionStatus("past_due")).toBe(false)
    expect(isDeadSubscriptionStatus("paused")).toBe(false)
  })

  it("classifies directory payment replays in money-safe precedence", () => {
    const base = {
      status: "paid",
      storedSessionId: "cs_original",
      incomingSessionId: "cs_original",
      amountVerified: true,
      amountMismatch: false,
    }

    expect(classifyDirectoryOrderReplay(base)).toBe("replay")
    expect(classifyDirectoryOrderReplay({ ...base, amountVerified: false })).toBe("repair_hold")
    expect(
      classifyDirectoryOrderReplay({
        ...base,
        amountVerified: false,
        amountMismatch: true,
      }),
    ).toBe("held")
    expect(classifyDirectoryOrderReplay({ ...base, incomingSessionId: "cs_duplicate" })).toBe(
      "duplicate_payment",
    )
    expect(classifyDirectoryOrderReplay({ ...base, status: "failed" })).toBe("stale_order")
    expect(
      classifyDirectoryOrderReplay({
        ...base,
        status: "refunded",
        amountVerified: false,
      }),
    ).toBe("refunded_replay")
  })

  it("does not repair a legacy hold without the same stored Stripe session", () => {
    expect(
      classifyDirectoryOrderReplay({
        status: "paid",
        storedSessionId: null,
        incomingSessionId: "cs_incoming",
        amountVerified: false,
        amountMismatch: false,
      }),
    ).toBe("held")
  })
})
