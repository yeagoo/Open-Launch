import { describe, expect, it } from "vitest"

import { pickClientMessages } from "@/lib/client-messages"

describe("pickClientMessages", () => {
  it("returns only requested top-level namespaces without mutating the source", () => {
    const messages = {
      nav: { home: "Home" },
      project: { comments: { heading: "Comments" } },
      pricing: { title: "Pricing" },
    }

    expect(pickClientMessages(messages, ["nav", "project"])).toEqual({
      nav: messages.nav,
      project: messages.project,
    })
    expect(messages).toHaveProperty("pricing")
  })

  it("omits unknown namespaces instead of serializing undefined values", () => {
    expect(pickClientMessages({ nav: { home: "Home" } }, ["missing"])).toEqual({})
  })
})
