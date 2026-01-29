import { launchStatus as launchStatusEnum, project as projectSchema } from "@/drizzle/db/schema"

import { LAUNCH_TYPES } from "@/lib/constants"

type ProjectSchemaSelect = typeof projectSchema.$inferSelect

interface ProjectLinkInfo {
  launchType?: ProjectSchemaSelect["launchType"]
  launchStatus?: ProjectSchemaSelect["launchStatus"]
  dailyRanking?: ProjectSchemaSelect["dailyRanking"]
  hasBadgeVerified?: boolean
}

interface LinkOptions {
  /** 是否在详情页，只有详情页才可能给 dofollow */
  isDetailPage?: boolean
}

export function getProjectWebsiteRelAttribute(
  projectInfo: ProjectLinkInfo,
  options: LinkOptions = {},
): string {
  let rel = "noopener"

  const { isDetailPage = false } = options

  // 首页/列表页链接一律不给 dofollow
  if (!isDetailPage) {
    return rel + " nofollow"
  }

  // 以下逻辑仅适用于详情页

  // Premium Launch 都是 dofollow
  const isPremiumLaunch = projectInfo.launchType === LAUNCH_TYPES.PREMIUM

  // 仅第一名才给 dofollow（原来是 top3）
  const isTop1Daily =
    projectInfo.launchStatus === launchStatusEnum.LAUNCHED &&
    projectInfo.dailyRanking !== null &&
    typeof projectInfo.dailyRanking === "number" &&
    projectInfo.dailyRanking === 1

  // Badge 验证用户也是 dofollow
  const hasBadgeVerified = projectInfo.hasBadgeVerified === true

  // 判断是否 dofollow
  if (isPremiumLaunch || isTop1Daily || hasBadgeVerified) {
    // dofollow - 不添加 nofollow
  } else {
    rel += " nofollow"
  }

  return rel
}
