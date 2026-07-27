"use client"

import { useState, useTransition } from "react"

import { RiFlagLine } from "@remixicon/react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const REASONS = ["spam", "abuse", "offtopic", "other"] as const

/** Report a comment for admin review. Rendered for logged-in non-owners. */
export function ReportCommentButton({ commentId }: { commentId: number }) {
  const t = useTranslations("project.comments")
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<(typeof REASONS)[number]>("spam")
  const [details, setDetails] = useState("")
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commentId,
            reason,
            ...(details.trim() ? { details: details.trim().slice(0, 500) } : {}),
          }),
        })
        if (!res.ok) throw new Error(await res.text())
        toast.success(t("reportSuccess"))
        setOpen(false)
        setDetails("")
        setReason("spam")
      } catch {
        toast.error(t("reportError"))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
          <RiFlagLine className="h-3.5 w-3.5" />
          <span>{t("report")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-xl border sm:max-w-[425px] dark:border-zinc-800">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-semibold">
            {t("reportTitle")}
          </DialogTitle>
          <DialogDescription>{t("reportDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={reason === r ? "default" : "outline"}
                onClick={() => setReason(r)}
              >
                {t(`reportReason_${r}`)}
              </Button>
            ))}
          </div>
          <textarea
            className="border-border/40 bg-background focus:ring-primary/20 min-h-[72px] w-full rounded-md border p-3 text-sm focus:ring-2 focus:outline-none"
            placeholder={t("reportDetailsPlaceholder")}
            value={details}
            maxLength={500}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        <DialogFooter className="pt-2">
          <Button disabled={isPending} onClick={submit} className="cursor-pointer">
            {t("reportSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
