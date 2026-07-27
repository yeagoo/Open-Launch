"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  deleteReportedComment,
  dismissCommentReport,
  hideReportedComment,
} from "@/app/actions/admin-moderation"

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [done, setDone] = useState<string | null>(null)

  if (done) {
    return <span className="text-muted-foreground text-xs">{done}</span>
  }

  const run = (action: () => Promise<void>, label: string) => {
    startTransition(async () => {
      try {
        await action()
        setDone(label)
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed")
      }
    })
  }

  return (
    <div className="flex flex-shrink-0 gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={isPending}
        onClick={() => run(() => hideReportedComment(reportId), "hidden")}
      >
        Hide
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={isPending}
        onClick={() => {
          if (window.confirm("Hard-delete this comment? Replies may be detached.")) {
            run(() => deleteReportedComment(reportId), "deleted")
          }
        }}
      >
        Delete
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => run(() => dismissCommentReport(reportId), "dismissed")}
      >
        Dismiss
      </Button>
    </div>
  )
}
