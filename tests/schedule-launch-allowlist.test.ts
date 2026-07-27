import { describe, expect, it, vi } from "vitest"

import { scheduleLaunch } from "@/app/actions/launch"

// scheduleLaunch is a server action; its launch-type allowlist runs before
// any DB I/O, so we can exercise it with the infrastructure mocked away.

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/drizzle/db", () => ({
  db: {},
}))

const getSessionMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}))

describe("scheduleLaunch launch-type allowlist", () => {
  it("rejects an unknown launch type before touching the database", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } })

    await expect(
      scheduleLaunch("project-1", "2026-08-20", "premium_plus" as never),
    ).rejects.toThrow(/Invalid launch type/)
  })

  it("rejects arbitrary strings", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user-1" } })

    await expect(scheduleLaunch("project-1", "2026-08-20", "ultra" as never)).rejects.toThrow(
      /Invalid launch type/,
    )
  })

  it("rejects unauthenticated calls before validating the type", async () => {
    getSessionMock.mockResolvedValue(null)

    await expect(
      scheduleLaunch("project-1", "2026-08-20", "premium_plus" as never),
    ).rejects.toThrow(/Authentication required/)
  })
})
