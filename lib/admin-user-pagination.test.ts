import { describe, expect, it } from "vitest"

import { ADMIN_USER_PAGE_SIZES, parseAdminUserPageInput } from "./admin-user-pagination"

describe("admin user pagination input", () => {
  it("applies bounded defaults", () => {
    expect(parseAdminUserPageInput({})).toEqual({
      page: 1,
      pageSize: 10,
      search: "",
      role: "all",
      status: "all",
    })
    expect(ADMIN_USER_PAGE_SIZES).toEqual([5, 10, 20, 50])
  })

  it("trims accepted filters", () => {
    expect(
      parseAdminUserPageInput({
        page: 2,
        pageSize: 20,
        search: "  alice@example.com  ",
        role: " admin ",
        status: "banned",
      }),
    ).toEqual({
      page: 2,
      pageSize: 20,
      search: "alice@example.com",
      role: "admin",
      status: "banned",
    })
  })

  it.each([
    { page: 0 },
    { page: 1.5 },
    { page: 100_001 },
    { pageSize: 100 },
    { search: "x".repeat(101) },
    { role: "" },
    { status: "disabled" },
    { page: 1, unexpected: true },
  ])("rejects invalid public action input %#", (input) => {
    expect(() => parseAdminUserPageInput(input)).toThrow()
  })
})
