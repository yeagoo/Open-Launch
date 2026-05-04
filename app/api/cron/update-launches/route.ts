import { revalidatePath } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { crawledData, launchStatus, project, upvote } from "@/drizzle/db/schema"
import { endOfDay, startOfDay, subDays, subHours } from "date-fns"
import { and, count, desc, eq, gte, inArray, lt, lte } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"

export async function GET(request: NextRequest) {
  try {
    const authError = verifyCronAuth(request)
    if (authError) return authError

    // Date actuelle en UTC
    const now = new Date()
    const today = startOfDay(now)
    const yesterday = subDays(today, 1)

    // Date limite pour les paiements abandonnés (24 heures)
    const paymentDeadline = subHours(now, 24)

    // Déclarer rankGroups ici pour qu'il soit accessible plus tard
    let rankGroups: Array<Array<{ projectId: string; projectName: string; upvoteCount: number }>> =
      []

    // 1. Update SCHEDULED -> ONGOING
    const scheduledToOngoing = await db
      .update(project)
      .set({
        launchStatus: launchStatus.ONGOING,
        updatedAt: now,
      })
      .where(
        and(
          eq(project.launchStatus, launchStatus.SCHEDULED),
          gte(project.scheduledLaunchDate, today),
          lt(project.scheduledLaunchDate, endOfDay(today)),
        ),
      )
      .returning({ id: project.id, name: project.name })

    // 2. Update ONGOING -> LAUNCHED
    const ongoingToLaunched = await db
      .update(project)
      .set({
        launchStatus: launchStatus.LAUNCHED,
        updatedAt: now,
      })
      .where(
        and(
          eq(project.launchStatus, launchStatus.ONGOING),
          gte(project.scheduledLaunchDate, yesterday),
          lt(project.scheduledLaunchDate, today),
        ),
      )
      .returning({ id: project.id, name: project.name })

    // 3. Calculer les 3 projets les plus populaires
    const justLaunchedProjectIds = ongoingToLaunched.map((p) => p.id)
    console.log(
      `Projets passés à LAUNCHED: ${justLaunchedProjectIds.length}`,
      justLaunchedProjectIds,
    )

    if (justLaunchedProjectIds.length > 0) {
      // Utiliser inArray pour la requête d'upvotes
      const projectUpvotes = await db
        .select({
          projectId: upvote.projectId,
          count: count(upvote.id),
        })
        .from(upvote)
        .where(inArray(upvote.projectId, justLaunchedProjectIds))
        .groupBy(upvote.projectId)
        .orderBy(desc(count(upvote.id)))
        .execute()

      const projectsWithUpvotes = ongoingToLaunched
        .map((proj) => {
          const upvoteData = projectUpvotes.find((uv) => uv.projectId === proj.id)
          return {
            projectId: proj.id,
            projectName: proj.name,
            upvoteCount: upvoteData ? Number(upvoteData.count) : 0,
          }
        })
        .sort((a, b) => b.upvoteCount - a.upvoteCount)

      console.log("Projets avec des upvotes (triés):", projectsWithUpvotes)

      // Réinitialiser rankGroups ici car il est déclaré à l'extérieur
      rankGroups = []
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

      console.log(`Groupes de classement formés: ${rankGroups.length} groupes`)

      let currentRank = 1
      let projectsRanked = 0

      for (const group of rankGroups) {
        if (currentRank > 3) break

        console.log(
          `Groupe ${currentRank}: ${group.length} projets avec ${group[0].upvoteCount} upvotes chacun`,
        )

        for (const projectData of group) {
          await db
            .update(project)
            .set({
              dailyRanking: currentRank,
              updatedAt: now,
            })
            .where(eq(project.id, projectData.projectId))

          console.log(
            `Classé #${currentRank}: ${projectData.projectName} (${projectData.projectId}) avec ${projectData.upvoteCount} upvotes [ex-aequo: ${group.length > 1 ? "oui" : "non"}]`,
          )

          projectsRanked++
        }
        currentRank++
      }
      console.log(`Total de projets classés: ${projectsRanked}`)
    }

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

    // Ajouter les types explicites pour reduce
    const totalRanked = rankGroups.reduce(
      (
        sum: number,
        group: Array<{
          projectId: string
          projectName: string
          upvoteCount: number
        }>,
      ) => sum + group.length,
      0,
    )

    console.log(`[${now.toISOString()}] Launch updates completed`)
    console.log(`- ${scheduledToOngoing.length} projects changed from SCHEDULED to ONGOING`)
    console.log(`- ${ongoingToLaunched.length} projects changed from ONGOING to LAUNCHED`)
    console.log(
      `- Top ${rankGroups.length > 0 ? Math.min(3, totalRanked) : 0} calculated from ${justLaunchedProjectIds.length} projects launched yesterday`,
    )
    console.log(`- ${abandonedPayments.length} abandoned payments deleted for projects`)

    const expiredCache = await db
      .delete(crawledData)
      .where(lt(crawledData.expiresAt, now))
      .returning({ id: crawledData.id })
    console.log(`- ${expiredCache.length} expired crawl cache rows deleted`)

    // 如果有项目状态变化，重新生成 sitemap
    if (scheduledToOngoing.length > 0 || ongoingToLaunched.length > 0) {
      revalidatePath("/sitemap.xml")
      console.log("✅ Sitemap regenerated due to project status changes")
    }

    return NextResponse.json({
      message: "Launch statuses updated successfully.",
      details: {
        scheduledToOngoing: scheduledToOngoing.length,
        ongoingToLaunched: ongoingToLaunched.length,
        topCalculated: rankGroups.length > 0 ? Math.min(3, totalRanked) : 0,
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
