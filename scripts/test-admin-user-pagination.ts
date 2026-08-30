import { project, user } from "@/drizzle/db/schema"
import * as schema from "@/drizzle/db/schema"
import { inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { queryAdminUsersPage } from "@/lib/admin-user-pagination"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is required")

const target = new URL(connectionString)
const databaseName = target.pathname.replace(/^\//, "")
if (
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(target.hostname) ||
  !databaseName.startsWith("open_launch_release_test")
) {
  throw new Error(
    "Refusing admin pagination test: target must be loopback and named open_launch_release_test*",
  )
}

const fixturePrefix = `admin-page-${process.pid}-${crypto.randomUUID()}`
const pool = new Pool({ connectionString })
const db = drizzle({ client: pool, schema })
const users = Array.from({ length: 55 }, (_, index) => ({
  id: `${fixturePrefix}-user-${index.toString().padStart(2, "0")}`,
  name: index === 0 ? "Percent % User" : `Pagination User ${index.toString().padStart(2, "0")}`,
  email:
    index === 0
      ? `literal-percent-${fixturePrefix}@example.test`
      : `pagination-${index}-${fixturePrefix}@example.test`,
  emailVerified: false,
  role:
    index % 10 === 0 ? "admin" : index % 10 === 1 ? "moderator" : index % 3 === 0 ? "user" : null,
  banned: index % 7 === 0 ? true : index % 7 === 1 ? false : null,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
  updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
}))
const projects = [
  {
    id: `${fixturePrefix}-project-0`,
    name: "Pagination Project 0",
    slug: `${fixturePrefix}-project-0`,
    description: "Admin pagination integration fixture",
    websiteUrl: `https://${fixturePrefix}-0.example.test`,
    logoUrl: "https://static.example.test/logo.png",
    createdBy: users[0].id,
  },
  {
    id: `${fixturePrefix}-project-1`,
    name: "Pagination Project 1",
    slug: `${fixturePrefix}-project-1`,
    description: "Admin pagination integration fixture",
    websiteUrl: `https://${fixturePrefix}-1.example.test`,
    logoUrl: "https://static.example.test/logo.png",
    createdBy: users[0].id,
  },
  {
    id: `${fixturePrefix}-project-2`,
    name: "Pagination Project 2",
    slug: `${fixturePrefix}-project-2`,
    description: "Admin pagination integration fixture",
    websiteUrl: `https://${fixturePrefix}-2.example.test`,
    logoUrl: "https://static.example.test/logo.png",
    createdBy: users[1].id,
  },
]

try {
  await db.insert(user).values(users)
  await db.insert(project).values(projects)

  const firstPage = await queryAdminUsersPage(db, {
    page: 1,
    pageSize: 20,
    search: fixturePrefix,
    role: "all",
    status: "all",
  })
  assert(firstPage.total === 55, `expected 55 users, got ${firstPage.total}`)
  assert(
    firstPage.users.length === 20,
    `expected first page size 20, got ${firstPage.users.length}`,
  )

  const thirdPage = await queryAdminUsersPage(db, {
    page: 3,
    pageSize: 20,
    search: fixturePrefix,
    role: "all",
    status: "all",
  })
  assert(
    thirdPage.users.length === 15,
    `expected final page size 15, got ${thirdPage.users.length}`,
  )

  const literalPercent = await queryAdminUsersPage(db, {
    page: 1,
    pageSize: 10,
    search: "%",
    role: "all",
    status: "all",
  })
  assert(
    literalPercent.total === 1 && literalPercent.users[0]?.id === users[0].id,
    "literal percent search behaved as a wildcard",
  )

  const expectedDefaultUsers = users.filter((entry) => !entry.role || entry.role === "user").length
  const defaultRole = await queryAdminUsersPage(db, {
    page: 1,
    pageSize: 50,
    search: fixturePrefix,
    role: "user",
    status: "all",
  })
  assert(
    defaultRole.total === expectedDefaultUsers,
    `default role mismatch: expected ${expectedDefaultUsers}, got ${defaultRole.total}`,
  )

  const expectedBannedUsers = users.filter((entry) => entry.banned === true).length
  const banned = await queryAdminUsersPage(db, {
    page: 1,
    pageSize: 50,
    search: fixturePrefix,
    role: "all",
    status: "banned",
  })
  assert(
    banned.total === expectedBannedUsers,
    `banned filter mismatch: expected ${expectedBannedUsers}, got ${banned.total}`,
  )

  const launched = await queryAdminUsersPage(db, {
    page: 1,
    pageSize: 10,
    search: "Percent % User",
    role: "all",
    status: "all",
  })
  assert(launched.users[0]?.projectCount === 2, "project count aggregation was not preserved")
  assert(launched.users[0]?.hasLaunched === true, "hasLaunched did not reflect project count")

  console.log(
    JSON.stringify({
      status: "passed",
      totalUsers: firstPage.total,
      pageSizes: [firstPage.users.length, thirdPage.users.length],
      defaultRoleUsers: defaultRole.total,
      bannedUsers: banned.total,
    }),
  )
} finally {
  await db.delete(project).where(
    inArray(
      project.id,
      projects.map(({ id }) => id),
    ),
  )
  await db.delete(user).where(
    inArray(
      user.id,
      users.map(({ id }) => id),
    ),
  )
  await pool.end()
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
