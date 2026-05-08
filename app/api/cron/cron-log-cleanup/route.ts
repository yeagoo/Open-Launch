import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { cronRunLog } from "@/drizzle/db/schema"
import { lt } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"

export const dynamic = "force-dynamic"

const RETENTION_DAYS = 90

/**
 * Delete cron_run_log rows older than RETENTION_DAYS. The dispatcher
 * writes ~12 rows per minute, so 90 days = ~1.5M rows; trimming keeps
 * the admin queries fast and the table size predictable.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const result = await db.delete(cronRunLog).where(lt(cronRunLog.dispatchedAt, cutoff))

  const deleted = (result as unknown as { rowCount?: number }).rowCount ?? 0

  return NextResponse.json({
    cutoff: cutoff.toISOString(),
    deleted,
  })
}
