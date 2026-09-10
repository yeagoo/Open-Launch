"use client"

import Link from "next/link"

import { RiMessage2Line, RiThumbUpLine } from "@remixicon/react"
import { useTranslations } from "next-intl"

import { launchStatus as launchStatusEnum } from "@/lib/project-enums"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { UpvoteButton } from "@/components/project/upvote-button"

interface ProjectCardButtonsProps {
  projectPageUrl: string
  commentCount: number
  projectId: string
  upvoteCount: number
  isAuthenticated: boolean
  hasUpvoted: boolean
  launchStatus: string
  projectName: string
}

export function ProjectCardButtons({
  projectPageUrl,
  commentCount,
  projectId,
  upvoteCount,
  isAuthenticated,
  hasUpvoted,
  launchStatus,
  projectName,
}: ProjectCardButtonsProps) {
  const t = useTranslations("projectRow")
  const isActiveLaunch = launchStatus === launchStatusEnum.ONGOING

  return (
    <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-start">
      <Link
        href={`${projectPageUrl}#comments`}
        className="hover:border-primary group hidden h-11 w-11 flex-col items-center justify-center rounded-lg border transition-all duration-200 sm:flex"
        aria-label={t("viewCommentsFor", { name: projectName })}
      >
        <RiMessage2Line className="text-muted-foreground h-3.5 w-3.5" />
        <span className="text-muted-foreground mt-1 text-[13px] leading-none font-semibold">
          {commentCount}
        </span>
      </Link>
      {isActiveLaunch ? (
        <UpvoteButton
          projectId={projectId}
          initialUpvoted={hasUpvoted}
          upvoteCount={upvoteCount}
          isAuthenticated={isAuthenticated}
          variant="compact"
        />
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-11 w-11 flex-col items-center justify-center rounded-lg border border-dashed">
                <RiThumbUpLine className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-muted-foreground mt-1 text-[13px] leading-none font-semibold">
                  {upvoteCount}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="z-100 text-xs">
              {t("votingClosed")}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}
