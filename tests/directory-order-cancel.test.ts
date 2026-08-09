import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  cancelPendingDirectoryOrder,
  createDirectoryOrder,
  resumePendingDirectoryOrder,
} from "@/app/actions/directory-orders"

const dbState = vi.hoisted(() => ({
  results: [] as unknown[],
  methods: [] as string[],
}))

function makeChain(): unknown {
  const chain: unknown = new Proxy(() => chain, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(dbState.results.shift()).then(resolve, reject)
      }
      return () => {
        dbState.methods.push(String(prop))
        return chain
      }
    },
    apply() {
      return chain
    },
  })
  return chain
}

const transactionMock = vi.hoisted(() =>
  vi.fn(async (callback: (tx: unknown) => unknown) => {
    const tx = new Proxy(
      {},
      {
        get(_target, prop) {
          return () => {
            dbState.methods.push(String(prop))
            return makeChain()
          }
        },
      },
    )
    return callback(tx)
  }),
)

vi.mock("@/drizzle/db", () => ({
  db: new Proxy(
    { transaction: transactionMock },
    {
      get(target, prop) {
        if (prop === "transaction") return target.transaction
        return () => {
          dbState.methods.push(String(prop))
          return makeChain()
        }
      },
    },
  ),
}))

const getSessionMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: getSessionMock } },
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => "en"),
}))

beforeEach(() => {
  dbState.results.length = 0
  dbState.methods.length = 0
  transactionMock.mockClear()
  getSessionMock.mockResolvedValue({ user: { id: "user-1" } })
  process.env.NEXT_PUBLIC_DIRECTORY_PAYMENT_LINK_PLUS = "https://buy.stripe.com/test"
})

describe("legacy duplicate order protection", () => {
  const projectRow = {
    id: "project-1",
    websiteUrl: "https://example.com",
    launchStatus: "payment_pending",
  }
  const pendingOrder = {
    id: "order-pending",
    tier: "plus",
    status: "pending",
    amountVerified: true,
  }
  const paidOrder = {
    id: "order-paid",
    tier: "plus",
    status: "paid",
    amountVerified: false,
  }

  it("does not resume a newer pending row when an older payment was received", async () => {
    dbState.results.push([projectRow], [pendingOrder, paidOrder])

    await expect(resumePendingDirectoryOrder("project-1")).rejects.toThrow(
      /Payment was already received and is under review/,
    )
  })

  it("does not create or reuse a payable row when an older payment was received", async () => {
    dbState.results.push([projectRow], [pendingOrder, paidOrder])

    await expect(createDirectoryOrder({ projectId: "project-1", tier: "plus" })).rejects.toThrow(
      /Payment was already received and is under review/,
    )
    expect(dbState.methods).not.toContain("insert")
  })
})

describe("pending directory order cancellation", () => {
  it("blocks project deletion after Stripe has already delivered a payment", async () => {
    dbState.results.push(
      [{ id: "project-1", launchStatus: "payment_pending" }],
      [{ id: "order-1", status: "paid", amountVerified: false }],
    )

    await expect(cancelPendingDirectoryOrder("project-1")).rejects.toThrow(
      /Payment was already received and is under review/,
    )
    expect(dbState.methods).not.toContain("delete")
    expect(dbState.methods.filter((method) => method === "for")).toHaveLength(2)
  })

  it("cancels unpaid rows and deletes the abandoned project atomically", async () => {
    dbState.results.push(
      [{ id: "project-1", launchStatus: "payment_pending" }],
      [{ id: "order-1", status: "pending", amountVerified: true }],
      { rowCount: 1 },
      { rowCount: 1 },
    )

    await expect(cancelPendingDirectoryOrder("project-1")).resolves.toEqual({ canceled: true })
    expect(transactionMock).toHaveBeenCalledTimes(1)
    expect(dbState.methods).toContain("update")
    expect(dbState.methods).toContain("delete")
  })
})
