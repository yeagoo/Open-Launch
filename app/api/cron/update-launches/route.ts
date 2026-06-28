import { revalidatePath, revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { crawledData, launchStatus, project, upvote } from "@/drizzle/db/schema"
import { subHours } from "date-fns"
import { and, count, desc, eq, gte, inArray, lt, lte } from "drizzle-orm"

import { HOME_PROJECTS_TAG, TOP_CATEGORIES_TAG } from "@/lib/cache-tags"
import { verifyCronAuth } from "@/lib/cron-auth"
import { getCurrentLaunchWindow, getLaunchWindowForDate } from "@/lib/launch-window"

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    const now = new Date()
    const { start: currentWindowStart, end: currentWindowEnd } = getCurrentLaunchWindow(now)

    // Date limite pour les paiements abandonnés (24 heures)
    const paymentDeadline = subHours(now, 24)

    // 1. Update SCHEDULED -> ONGOING. Committed on its own (NOT inside the
    // ranking transaction below) so a transient error in the later ranking
    // work can't roll back today's go-lives — this job runs once a day, so a
    // rolled-back go-live would hide the day's launches until tomorrow.
    const scheduledToOngoing = await db
      .update(project)
      .set({
        launchStatus: launchStatus.ONGOING,
        updatedAt: now,
      })
      .where(
        and(
          eq(project.launchStatus, launchStatus.SCHEDULED),
          gte(project.scheduledLaunchDate, currentWindowStart),
          lt(project.scheduledLaunchDate, currentWindowEnd),
        ),
      )
      .returning({ id: project.id, name: project.name })

    // 2+3. ONGOING -> LAUNCHED and its daily-ranking writes run in ONE
    // transaction: if ranking dies mid-way, the status flip rolls back too,
    // so a project is never stranded as LAUNCHED with dailyRanking = null
    // (the source query only looks at ONGOING rows). A failed run retries
    // cleanly — the LAUNCHED query re-catches the still-ONGOING rows.
    const { ongoingToLaunched, totalRanked } = await db.transaction(async (tx) => {
      let totalRanked = 0

      // 2. Update every expired launch -> LAUNCHED. This intentionally catches
      // older stuck rows, not just yesterday, so a missed cron tick cannot keep
      // old products on today's homepage or in the bot-vote pool forever.
      //
      // Catches BOTH still-ONGOING rows and SCHEDULED rows whose window has
      // fully passed. The SCHEDULED case only happens when the daily cron
      // didn't run on a project's launch day (e.g. a multi-day dispatcher
      // outage): step 1 only promotes the *current* window's SCHEDULED rows to
      // ONGOING, so a past-dated SCHEDULED row would otherwise never reach
      // ONGOING and never get launched/ranked — stranded forever. Launching it
      // straight to LAUNCHED here lets the ranking pass below settle it by its
      // own launch-day window, so the system self-heals after an outage.
      //
      // The `< currentWindowStart` guard makes this safe — it can never
      // prematurely close a launch that should still be ONGOING. The window
      // for a timestamp before 08:00 UTC is shifted back a day
      // (getLaunchWindowForDate), so any scheduledLaunchDate < currentWindowStart
      // has a window that ENDS at or before currentWindowStart, i.e. already
      // closed. In particular the ProductHunt importer's "tomorrow 00:00" rows
      // belong to the window starting the prior 08:00, sit at/after the current
      // window start, and so are still promoted to ONGOING by step 1 — never
      // swept here during normal operation.
      const ongoingToLaunched = await tx
        .update(project)
        .set({
          launchStatus: launchStatus.LAUNCHED,
          updatedAt: now,
        })
        .where(
          and(
            inArray(project.launchStatus, [launchStatus.ONGOING, launchStatus.SCHEDULED]),
            lt(project.scheduledLaunchDate, currentWindowStart),
          ),
        )
        .returning({
          id: project.id,
          name: project.name,
          scheduledLaunchDate: project.scheduledLaunchDate,
        })

      // 3. Calculate top projects for each launch window we just closed.
      const justLaunchedProjectIds = ongoingToLaunched.map((p) => p.id)
      console.log(
        `Projets passés à LAUNCHED: ${justLaunchedProjectIds.length}`,
        justLaunchedProjectIds,
      )

      if (justLaunchedProjectIds.length > 0) {
        const launchedByWindow = new Map<string, typeof ongoingToLaunched>()
        for (const proj of ongoingToLaunched) {
          if (!proj.scheduledLaunchDate) continue
          const windowKey = getLaunchWindowForDate(
            new Date(proj.scheduledLaunchDate),
          ).start.toISOString()
          launchedByWindow.set(windowKey, [...(launchedByWindow.get(windowKey) ?? []), proj])
        }

        for (const [windowKey, launchedProjects] of launchedByWindow) {
          const projectIds = launchedProjects.map((p) => p.id)
          const projectUpvotes = await tx
            .select({
              projectId: upvote.projectId,
              count: count(upvote.id),
            })
            .from(upvote)
            .where(inArray(upvote.projectId, projectIds))
            .groupBy(upvote.projectId)
            .orderBy(desc(count(upvote.id)))
            .execute()

          const projectsWithUpvotes = launchedProjects
            .map((proj) => {
              const upvoteData = projectUpvotes.find((uv) => uv.projectId === proj.id)
              return {
                projectId: proj.id,
                projectName: proj.name,
                upvoteCount: upvoteData ? Number(upvoteData.count) : 0,
              }
            })
            .sort((a, b) => b.upvoteCount - a.upvoteCount)

          console.log(`Projets avec des upvotes pour ${windowKey}:`, projectsWithUpvotes)

          const rankGroups: Array<
            Array<{ projectId: string; projectName: string; upvoteCount: number }>
          > = []
          let currentCount = -1
          let currentGroup: Array<{
            projectId: string
            projectName: string
            upvoteCount: number
          }> = []

          for (const projectData of projectsWithUpvotes) {
            if (projectData.upvoteCount === 0) continue

            if (projectData.upvoteCount !== currentCount) {
              if (currentGroup.length > 0) {
                rankGroups.push(currentGroup)
              }
              currentCount = projectData.upvoteCount
              currentGroup = [projectData]
            } else {
              currentGroup.push(projectData)
            }
          }

          if (currentGroup.length > 0) {
            rankGroups.push(currentGroup)
          }

          console.log(
            `Groupes de classement formés pour ${windowKey}: ${rankGroups.length} groupes`,
          )

          let currentRank = 1
          for (const group of rankGroups) {
            if (currentRank > 3) break

            console.log(
              `Groupe ${currentRank}: ${group.length} projets avec ${group[0].upvoteCount} upvotes chacun`,
            )

            for (const projectData of group) {
              await tx
                .update(project)
                .set({
                  dailyRanking: currentRank,
                  updatedAt: now,
                })
                .where(eq(project.id, projectData.projectId))

              console.log(
                `Classé #${currentRank}: ${projectData.projectName} (${projectData.projectId}) avec ${projectData.upvoteCount} upvotes [ex-aequo: ${group.length > 1 ? "oui" : "non"}]`,
              )

              totalRanked++
            }
            currentRank++
          }
        }
        console.log(`Total de projets classés: ${totalRanked}`)
      }

      return { ongoingToLaunched, totalRanked }
    })

    const justLaunchedProjectIds = ongoingToLaunched.map((p) => p.id)

    // 4. Clean up abandoned PAYMENT_PENDING
    const abandonedPayments = await db
      .delete(project)
      .where(
        and(
          eq(project.launchStatus, launchStatus.PAYMENT_PENDING),
          lte(project.updatedAt, paymentDeadline),
        ),
      )
      .returning({ id: project.id, name: project.name })

    console.log(`[${now.toISOString()}] Launch updates completed`)
    console.log(`- ${scheduledToOngoing.length} projects changed from SCHEDULED to ONGOING`)
    console.log(`- ${ongoingToLaunched.length} projects changed from ONGOING to LAUNCHED`)
    console.log(
      `- Top ${Math.min(3, totalRanked)} calculated from ${justLaunchedProjectIds.length} projects closed before the current window`,
    )
    console.log(`- ${abandonedPayments.length} abandoned payments deleted for projects`)

    const expiredCache = await db
      .delete(crawledData)
      .where(lt(crawledData.expiresAt, now))
      .returning({ id: crawledData.id })
    console.log(`- ${expiredCache.length} expired crawl cache rows deleted`)

    // 如果有项目状态变化，重新生成 sitemap + 失效首页缓存。
    // The home page caches `today / yesterday / month` listings
    // for 10–60 min; without this tag bust, the new ONGOING set
    // wouldn't surface until the next cache window expires —
    // visible to users as "the 8 AM launch didn't show up."
    if (scheduledToOngoing.length > 0 || ongoingToLaunched.length > 0) {
      revalidatePath("/sitemap.xml")
      revalidateTag(HOME_PROJECTS_TAG, "max")
      revalidateTag(TOP_CATEGORIES_TAG, "max")
      console.log("✅ Sitemap regenerated + home/category caches busted")
    }

    return NextResponse.json({
      message: "Launch statuses updated successfully.",
      details: {
        scheduledToOngoing: scheduledToOngoing.length,
        ongoingToLaunched: ongoingToLaunched.length,
        topCalculated: Math.min(3, totalRanked),
        totalLaunchedYesterday: justLaunchedProjectIds.length,
        abandonedPaymentsDeleted: abandonedPayments.length,
        expiredCacheDeleted: expiredCache.length,
      },
    })
  } catch (error) {
    console.error("Error updating launch statuses:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
