import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { launchStatus, project, user } from "@/drizzle/db/schema"
import { format, startOfDay, subDays } from "date-fns"
import { and, eq, gte, inArray } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { drainEmailOutbox, enqueueEmail } from "@/lib/email-outbox"

// Event-compensation instead of a fixed "today only" window: any project
// that went ONGOING in the last 2 days gets a reminder row, and the
// event_key makes re-enqueueing a no-op. The old today-only selection
// lost the reminder entirely when update-launches flipped a project to
// ONGOING after this cron's daily minute (e.g. after a launch-transition
// failure).
const COMPENSATION_WINDOW_DAYS = 2

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    const windowStart = startOfDay(subDays(now, COMPENSATION_WINDOW_DAYS))

    console.log(`[${now.toISOString()}] Starting cron: Send Ongoing Launch Reminders`)

    // ONGOING alone is not enough: update-launches flips ONGOING→LAUNCHED
    // the next morning, so a reminder missed on launch day (e.g. the
    // transition ran late) would never be recoverable by a later run —
    // the project would no longer match. Include LAUNCHED rows from the
    // window; the event_key dedupe means they still get exactly one email.
    const ongoingProjects = await db
      .select({
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        scheduledLaunchDate: project.scheduledLaunchDate,
        creatorEmail: user.email,
        creatorName: user.name,
        creatorIsBot: user.isBot,
      })
      .from(project)
      .innerJoin(user, eq(user.id, project.createdBy))
      .where(
        and(
          inArray(project.launchStatus, [launchStatus.ONGOING, launchStatus.LAUNCHED]),
          gte(project.scheduledLaunchDate, windowStart),
        ),
      )
      .execute()

    let enqueued = 0
    for (const proj of ongoingProjects) {
      if (!proj.creatorEmail || proj.creatorIsBot || !proj.scheduledLaunchDate) continue
      const day = format(proj.scheduledLaunchDate, "yyyy-MM-dd")
      await enqueueEmail("launch_reminder", `reminder:${day}:${proj.projectId}`, {
        email: proj.creatorEmail,
        name: proj.creatorName,
        projectName: proj.projectName,
        projectSlug: proj.projectSlug,
      })
      enqueued++
    }

    console.log(`Enqueued launch reminders for ${enqueued}/${ongoingProjects.length} projects.`)

    const drain = await drainEmailOutbox()
    console.log(`Drain: sent=${drain.sent} failed=${drain.failed} remaining=${drain.remaining}`)

    return NextResponse.json(
      {
        message: "Launch reminder process completed.",
        details: {
          projectsFound: ongoingProjects.length,
          enqueued,
          emailsSent: drain.sent,
          emailsFailed: drain.failed,
          pending: drain.remaining,
        },
      },
      {
        status: cronStatusFromResult({
          errorCount: drain.failed,
          successCount: drain.sent,
        }),
      },
    )
  } catch (error) {
    console.error("Error in send-ongoing-reminders cron:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
