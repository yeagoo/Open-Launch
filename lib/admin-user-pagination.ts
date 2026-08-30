import { project, user } from "@/drizzle/db/schema"
import { and, asc, desc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { z } from "zod"

import { countInt } from "@/lib/db-utils"

const PAGE_SIZES = [5, 10, 20, 50] as const
type AdminDatabase = NodePgDatabase<typeof import("@/drizzle/db/schema")>

const adminUserPageInputSchema = z
  .object({
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(50)]).default(10),
    search: z.string().trim().max(100).default(""),
    role: z.string().trim().min(1).max(50).default("all"),
    status: z.enum(["all", "active", "banned"]).default("all"),
  })
  .strict()

export type AdminUserPageInput = z.input<typeof adminUserPageInputSchema>
export type AdminUserPageParams = z.output<typeof adminUserPageInputSchema>

export function parseAdminUserPageInput(input: unknown): AdminUserPageParams {
  return adminUserPageInputSchema.parse(input)
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&")
}

function userFilters(params: AdminUserPageParams): SQL[] {
  const filters: SQL[] = []

  if (params.search) {
    const pattern = `%${escapeLikePattern(params.search)}%`
    const searchFilter = or(ilike(user.name, pattern), ilike(user.email, pattern))
    if (searchFilter) filters.push(searchFilter)
  }

  if (params.role !== "all") {
    const roleFilter =
      params.role === "user"
        ? or(eq(user.role, "user"), isNull(user.role))
        : eq(user.role, params.role)
    if (roleFilter) filters.push(roleFilter)
  }

  if (params.status === "banned") {
    filters.push(eq(user.banned, true))
  } else if (params.status === "active") {
    const activeFilter = or(eq(user.banned, false), isNull(user.banned))
    if (activeFilter) filters.push(activeFilter)
  }

  return filters
}

export async function queryAdminUsersPage(database: AdminDatabase, input: unknown) {
  const params = parseAdminUserPageInput(input)
  const filters = userFilters(params)
  const where = filters.length > 0 ? and(...filters) : undefined
  const offset = (params.page - 1) * params.pageSize
  const [rows, [{ total = 0 } = { total: 0 }]] = await Promise.all([
    database
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        banned: user.banned,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt), asc(user.id))
      .limit(params.pageSize)
      .offset(offset),
    database.select({ total: countInt() }).from(user).where(where),
  ])

  const pageProjectCounts =
    rows.length === 0
      ? []
      : await database
          .select({
            userId: project.createdBy,
            projectCount: countInt(),
          })
          .from(project)
          .where(
            inArray(
              project.createdBy,
              rows.map(({ id }) => id),
            ),
          )
          .groupBy(project.createdBy)
  const projectCountByUser = new Map(
    pageProjectCounts.map(({ userId, projectCount }) => [userId, projectCount]),
  )

  return {
    users: rows.map((row) => ({
      ...row,
      projectCount: projectCountByUser.get(row.id) ?? 0,
      hasLaunched: (projectCountByUser.get(row.id) ?? 0) > 0,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
  }
}

export const ADMIN_USER_PAGE_SIZES = PAGE_SIZES
