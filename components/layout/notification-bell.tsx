"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"

import { RiBellLine } from "@remixicon/react"
import { useTranslations } from "next-intl"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  getRecentUnreadNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  type NotificationItem,
} from "@/app/actions/notifications"

function excerptOf(item: NotificationItem): string | null {
  const excerpt = item.metadata?.excerpt
  return typeof excerpt === "string" && excerpt ? excerpt : null
}

/**
 * Nav bell: unread badge + a popover with the latest unread items.
 * Count is fetched on mount (per-user data is intentionally not cached).
 */
export function NotificationBell() {
  const t = useTranslations("notifications")
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    void getUnreadNotificationCount()
      .then(setUnread)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (open) {
      void getRecentUnreadNotifications(5)
        .then(setItems)
        .catch(() => {})
    }
  }, [open])

  const labelFor = (item: NotificationItem): string => {
    const actor = item.actorName ?? t("someone")
    switch (item.type) {
      case "comment":
        return t("typeComment", { actor, project: item.projectName ?? "" })
      case "reply":
        return t("typeReply", { actor, project: item.projectName ?? "" })
      case "mention":
        return t("typeMention", { actor, project: item.projectName ?? "" })
      case "upvote_milestone":
        return t("typeMilestone", {
          count: Number(item.metadata?.milestone ?? 0),
          project: item.projectName ?? "",
        })
      case "launch_status":
        // "launched" = launch day ended (next-day flip), NOT "just went
        // live" — rendering both transitions with the same text would
        // send a duplicate-looking "now live" alert a day later.
        return item.metadata?.newStatus === "launched"
          ? t("typeLaunchEnded", { project: item.projectName ?? "" })
          : t("typeLaunchStatus", { project: item.projectName ?? "" })
      default:
        return item.projectName ?? ""
    }
  }

  const handleItemClick = (item: NotificationItem) => {
    startTransition(async () => {
      await markNotificationRead(item.id)
      setUnread((n) => Math.max(0, n - 1))
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("title")}
          className="hover:bg-muted relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors"
        >
          <RiBellLine className="h-4 w-4" />
          {unread > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-2">
        <div className="mb-2 flex items-center justify-between px-2">
          <span className="text-sm font-semibold">{t("title")}</span>
          <Link
            href="/notifications"
            className="text-primary text-xs hover:underline"
            onClick={() => setOpen(false)}
          >
            {t("viewAll")}
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">{t("empty")}</p>
        ) : (
          <div className="space-y-1">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.projectSlug ? `/projects/${item.projectSlug}` : "/notifications"}
                onClick={() => handleItemClick(item)}
                className="hover:bg-muted block rounded-md p-2 transition-colors"
              >
                <p className="line-clamp-2 text-sm">{labelFor(item)}</p>
                {excerptOf(item) && (
                  <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                    {excerptOf(item)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
