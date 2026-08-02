import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { cronJob, cronMaterializationRun, cronRunLog } from "@/drizzle/db/schema"
import { and, inArray, lt } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import { parseCronSchedulerMode } from "@/lib/cron-ledger-core"

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
  const deletedMaterializationRuns = await db
    .delete(cronMaterializationRun)
    .where(lt(cronMaterializationRun.createdAt, cutoff))
    .returning({ id: cronMaterializationRun.id })
  const schedulerMode = parseCronSchedulerMode(process.env.CRON_SCHEDULER_MODE)
  let deletedLedgerJobs = 0
  if (schedulerMode !== "legacy") {
    // Only ordinary terminal history is retention-trimmed. Dead letters and
    // uncertain external-side-effect outcomes require explicit human review;
    // pending/running/retry rows are never eligible.
    const ledgerRows = await db
      .delete(cronJob)
      .where(
        and(inArray(cronJob.status, ["succeeded", "cancelled"]), lt(cronJob.finishedAt, cutoff)),
      )
      .returning({ id: cronJob.id })
    deletedLedgerJobs = ledgerRows.length
  }

  return NextResponse.json({
    cutoff: cutoff.toISOString(),
    deleted,
    deletedMaterializationRuns: deletedMaterializationRuns.length,
    deletedLedgerJobs,
  })
}
