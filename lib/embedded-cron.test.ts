import { describe, expect, it } from "vitest"

import { runSingleFlight } from "./embedded-cron"

describe("runSingleFlight", () => {
  it("does not overlap an operation that is still running", async () => {
    const state = { inFlight: false }
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const operation = async () => {
      calls++
      await blocked
    }

    const first = runSingleFlight(state, operation)
    expect(await runSingleFlight(state, operation)).toBe(false)
    expect(calls).toBe(1)

    release()
    expect(await first).toBe(true)
    expect(state.inFlight).toBe(false)
  })

  it("releases the single-flight guard after a failure", async () => {
    const state = { inFlight: false }
    await expect(
      runSingleFlight(state, async () => {
        throw new Error("failed")
      }),
    ).rejects.toThrow("failed")
    expect(state.inFlight).toBe(false)
  })
})
