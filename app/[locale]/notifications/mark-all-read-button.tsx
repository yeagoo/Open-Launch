"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { RiCheckDoubleLine } from "@remixicon/react"
import { useTranslations } from "next-intl"

import { markAllNotificationsRead } from "@/app/actions/notifications"

export function MarkAllReadButton() {
  const t = useTranslations("notifications")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsRead()
          router.refresh()
        })
      }
      className="border-border hover:bg-muted flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
    >
      <RiCheckDoubleLine className="h-4 w-4" />
      {t("markAllRead")}
    </button>
  )
}
