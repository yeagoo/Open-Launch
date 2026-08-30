import { describe, expect, it } from "vitest"

import { assertAdminSession, assertAuthenticatedSession, type ServerSession } from "./server-auth"

function session(role: string | null = "user"): ServerSession {
  return {
    session: { id: "session-1" },
    user: { id: "user-1", role },
  } as unknown as ServerSession
}

describe("server authorization assertions", () => {
  it("fails closed when no authenticated user exists", () => {
    expect(() => assertAuthenticatedSession(null)).toThrow("Unauthorized")
    expect(() => assertAuthenticatedSession({ user: null } as unknown as ServerSession)).toThrow(
      "Unauthorized",
    )
  })

  it("returns the authenticated user", () => {
    expect(assertAuthenticatedSession(session()).id).toBe("user-1")
  })

  it("requires the exact admin role", () => {
    expect(() => assertAdminSession(session("user"))).toThrow("Unauthorized: Admin access required")
    expect(() => assertAdminSession(session(null))).toThrow("Unauthorized: Admin access required")
    expect(assertAdminSession(session("admin")).id).toBe("user-1")
  })

  it("preserves call-site error contracts", () => {
    expect(() => assertAdminSession(session("user"), "Forbidden")).toThrow("Forbidden")
  })
})
