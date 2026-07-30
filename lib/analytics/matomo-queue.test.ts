import { describe, expect, it } from "vitest"

import {
  MAX_PENDING_MATOMO_COMMANDS,
  pushBoundedMatomoCommand,
  type MatomoCommand,
  type MatomoWindow,
} from "./matomo-queue"

describe("bounded Matomo queue", () => {
  it("bounds commands while the delayed Matomo runtime is unavailable", () => {
    const target = { _paq: [] as MatomoCommand[] } as unknown as MatomoWindow

    for (let index = 0; index < MAX_PENDING_MATOMO_COMMANDS + 20; index += 1) {
      pushBoundedMatomoCommand(target, ["trackEvent", "test", index])
    }

    expect(target._paq).toHaveLength(MAX_PENDING_MATOMO_COMMANDS)
    expect(target._paq?.[0]).toEqual(["trackEvent", "test", 20])
  })

  it("lets the initialized Matomo runtime own queue draining", () => {
    const target = {
      Matomo: {},
      _paq: Array.from({ length: 3 }, () => ["trackEvent"] as MatomoCommand),
    } as unknown as MatomoWindow

    pushBoundedMatomoCommand(target, ["trackPageView"], 3)

    expect(target._paq).toHaveLength(4)
    expect(target._paq?.at(-1)).toEqual(["trackPageView"])
  })
})
