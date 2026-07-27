import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { launchStatus, project, user } from "@/drizzle/db/schema"
import { format, startOfDay, subDays } from "date-fns"
import { and, eq, gte, inArray, lt } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { drainEmailOutbox, enqueueEmail } from "@/lib/email-outbox"

// Compensation window: scan the last 3 days of winners, not just
// yesterday. Enqueue is idempotent on event_key, so a day whose cron run
// failed entirely is caught by the next run instead of being lost.
const COMPENSATION_WINDOW_DAYS = 3

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    const windowStart = startOfDay(subDays(now, COMPENSATION_WINDOW_DAYS))
    const windowEnd = startOfDay(now)

    console.log(`[${now.toISOString()}] Starting cron: Send Winner Notifications`)

    // Join the creator up front (one query, not per winner) so bot users
    // and missing emails are filtered before enqueueing.
    const winners = await db
      .select({
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        projectRanking: project.dailyRanking,
        projectLaunchType: project.launchType,
        scheduledLaunchDate: project.scheduledLaunchDate,
        creatorEmail: user.email,
        creatorName: user.name,
        creatorIsBot: user.isBot,
      })
      .from(project)
      .innerJoin(user, eq(user.id, project.createdBy))
      .where(
        and(
          eq(project.launchStatus, launchStatus.LAUNCHED),
          inArray(project.dailyRanking, [1, 2, 3]),
          gte(project.scheduledLaunchDate, windowStart),
          lt(project.scheduledLaunchDate, windowEnd),
        ),
      )
      .execute()

    let enqueued = 0
    for (const winner of winners) {
      if (!winner.projectRanking || !winner.creatorEmail || winner.creatorIsBot) continue
      if (!winner.scheduledLaunchDate) continue
      // event_key is scoped to the launch DAY so a re-ranked project can't
      // produce a second row for the same win.
      const day = format(winner.scheduledLaunchDate, "yyyy-MM-dd")
      await enqueueEmail("winner_badge", `winner:${day}:${winner.projectId}`, {
        email: winner.creatorEmail,
        name: winner.creatorName,
        projectName: winner.projectName,
        projectSlug: winner.projectSlug,
        ranking: winner.projectRanking,
        launchType: winner.projectLaunchType,
      })
      enqueued++
    }

    console.log(`Enqueued winner notifications for ${enqueued}/${winners.length} winners.`)

    const drain = await drainEmailOutbox()
    console.log(`Drain: sent=${drain.sent} failed=${drain.failed} remaining=${drain.remaining}`)

    return NextResponse.json(
      {
        message: "Winner notification process completed.",
        details: {
          winnersFound: winners.length,
          enqueued,
          emailsSent: drain.sent,
          emailsFailed: drain.failed,
          pending: drain.remaining,
        },
      },
      {
        // Total failure (work due, nothing sent) → 500 so cron monitoring
        // alerts during a Resend outage instead of showing green. Failed
        // rows stay in the outbox and retry on the 10-minute drain cron.
        status: cronStatusFromResult({
          errorCount: drain.failed,
          successCount: drain.sent,
        }),
      },
    )
  } catch (error) {
    console.error("Error in send-winner-notifications cron:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
