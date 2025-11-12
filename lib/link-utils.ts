import { launchStatus as launchStatusEnum, project as projectSchema } from "@/drizzle/db/schema"

import { LAUNCH_TYPES } from "@/lib/constants"

type ProjectSchemaSelect = typeof projectSchema.$inferSelect

interface ProjectLinkInfo {
  launchType?: ProjectSchemaSelect["launchType"]
  launchStatus?: ProjectSchemaSelect["launchStatus"]
  dailyRanking?: ProjectSchemaSelect["dailyRanking"]
  hasBadgeVerified?: boolean
}

export function getProjectWebsiteRelAttribute(projectInfo: ProjectLinkInfo): string {
  let rel = "noopener"

  // Premium Launch 都是 dofollow
  const isPremiumLaunch = projectInfo.launchType === LAUNCH_TYPES.PREMIUM

  // Top 3 daily ranking 是 dofollow
  const isTop3Daily =
    projectInfo.launchStatus === launchStatusEnum.LAUNCHED &&
    projectInfo.dailyRanking !== null &&
    typeof projectInfo.dailyRanking === "number" &&
    projectInfo.dailyRanking >= 1 &&
    projectInfo.dailyRanking <= 3

  // Badge 验证用户也是 dofollow（非 Top 3 的免费发布需要 badge 才能 dofollow）
  const hasBadgeVerified = projectInfo.hasBadgeVerified === true

  // 判断是否 dofollow
  if (isPremiumLaunch || isTop3Daily || hasBadgeVerified) {
    // dofollow - 不添加 nofollow
  } else {
    rel += " nofollow"
  }

  return rel
}
