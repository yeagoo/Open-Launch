"use client"

import { useState } from "react"
import Image from "next/image"

import { RiAlertLine, RiCalendarLine, RiDeleteBinLine, RiPencilLine } from "@remixicon/react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EditProjectForm } from "@/components/project/edit-project-form"
import { getProjectForEdit } from "@/app/actions/project-details"
import { deleteMyDraftProject } from "@/app/actions/projects"

interface DraftProjectRowProps {
  id: string
  name: string
  slug: string
  logoUrl: string
  description: string
  launchStatus: string
  scheduledLaunchDate?: string | Date | null
  websiteUrl?: string | null
  // For payment_failed projects we surface a "Retry payment" link, but
  // we keep the URL out of this component — the dashboard caller can
  // pass an onRetry handler if needed.
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  payment_pending: {
    label: "Payment pending",
    cls: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
  },
  payment_failed: {
    label: "Payment failed",
    cls: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800",
  },
  scheduled: {
    label: "Scheduled",
    cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800",
  },
}

export function DraftProjectRow(props: DraftProjectRowProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [initial, setInitial] = useState<Awaited<ReturnType<typeof getProjectForEdit>>>(null)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const status = STATUS_LABELS[props.launchStatus] ?? null

  async function openEdit() {
    setIsEditOpen(true)
    setLoadingEdit(true)
    try {
      const data = await getProjectForEdit(props.id)
      if (!data) {
        toast.error("Could not load project")
        setIsEditOpen(false)
        return
      }
      setInitial(data)
    } finally {
      setLoadingEdit(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${props.name}"? This can't be undone.`)) return
    setIsDeleting(true)
    try {
      await deleteMyDraftProject(props.id)
      toast.success("Project deleted")
      // Hard reload — dashboard is a server component, easiest way to
      // refresh the list.
      window.location.reload()
    } catch (err) {
      console.error(err)
      toast.error("Failed to delete project")
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center dark:border-zinc-800/50">
        <Image
          src={props.logoUrl || "/placeholder.svg"}
          alt={props.name}
          width={48}
          height={48}
          className="flex-shrink-0 rounded-md bg-white object-contain p-0.5 dark:bg-zinc-800"
        />
        <div className="min-w-0 flex-grow">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-medium sm:text-base">{props.name}</h4>
            {status && (
              <Badge variant="outline" className={`text-[11px] font-normal ${status.cls}`}>
                {props.launchStatus === "payment_failed" && (
                  <RiAlertLine className="mr-1 h-3 w-3" />
                )}
                {status.label}
              </Badge>
            )}
          </div>
          {props.scheduledLaunchDate && (
            <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
              <RiCalendarLine className="h-3.5 w-3.5" />
              {new Date(props.scheduledLaunchDate).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={openEdit}>
            <RiPencilLine className="mr-1 h-4 w-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            aria-label="Delete project"
          >
            <RiDeleteBinLine className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          {loadingEdit || !initial ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : (
            <EditProjectForm
              projectId={props.id}
              initial={{
                name: initial.name,
                tagline: initial.tagline,
                description: initial.description,
                websiteUrl: initial.websiteUrl,
                logoUrl: initial.logoUrl,
                productImage: initial.productImage ?? null,
                techStack: initial.techStack ?? [],
                platforms: initial.platforms ?? [],
                pricing: initial.pricing,
                githubUrl: initial.githubUrl ?? null,
                twitterUrl: initial.twitterUrl ?? null,
                categories: initial.categories,
              }}
              onUpdate={() => {
                setIsEditOpen(false)
                window.location.reload()
              }}
              onCancel={() => setIsEditOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
