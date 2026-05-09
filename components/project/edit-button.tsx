"use client"

import { useEffect, useState } from "react"

import { RiPencilLine } from "@remixicon/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getProjectForEdit } from "@/app/actions/project-details"

import { EditProjectForm } from "./edit-project-form"

const LOCALE_DISPLAY: Record<string, string> = {
  en: "English",
  zh: "简体中文",
  es: "Español",
  pt: "Português",
  fr: "Français",
  ja: "日本語",
  ko: "한국어",
  et: "Eesti",
}

interface EditButtonProps {
  projectId: string
  isOwner: boolean
  // True for any pre-launch state (scheduled / payment_pending /
  // payment_failed). Caller passes false for ongoing/launched so the
  // button is hidden.
  canEdit: boolean
  sourceLocale?: string
}

interface InitialPayload {
  name: string
  tagline: string | null
  description: string
  websiteUrl: string
  logoUrl: string
  productImage: string | null
  techStack: string[]
  platforms: string[]
  pricing: string
  githubUrl: string | null
  twitterUrl: string | null
  categories: { id: string; name: string }[]
}

export function EditButton({ projectId, isOwner, canEdit, sourceLocale }: EditButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [initial, setInitial] = useState<InitialPayload | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isDialogOpen) return
    let cancelled = false
    setLoading(true)
    getProjectForEdit(projectId)
      .then((data) => {
        if (cancelled) return
        if (!data) {
          toast.error("Could not load project")
          setIsDialogOpen(false)
          return
        }
        setInitial({
          name: data.name,
          tagline: data.tagline,
          description: data.description,
          websiteUrl: data.websiteUrl,
          logoUrl: data.logoUrl,
          productImage: data.productImage ?? null,
          techStack: data.techStack ?? [],
          platforms: data.platforms ?? [],
          pricing: data.pricing,
          githubUrl: data.githubUrl ?? null,
          twitterUrl: data.twitterUrl ?? null,
          categories: data.categories,
        })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isDialogOpen, projectId])

  if (!isOwner || !canEdit) return null

  const sourceLabel = sourceLocale ? (LOCALE_DISPLAY[sourceLocale] ?? sourceLocale) : null

  return (
    <>
      <Button variant="outline" size="sm" className="h-9" onClick={() => setIsDialogOpen(true)}>
        <RiPencilLine className="mr-1 h-4 w-4" />
        Edit Project Details
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>

          {sourceLabel && (
            <p className="text-muted-foreground -mt-2 text-xs">
              You are editing the <strong>{sourceLabel}</strong> source. Other locales are
              auto-translated and refresh after you save.
            </p>
          )}

          {loading || !initial ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
          ) : (
            <EditProjectForm
              projectId={projectId}
              initial={initial}
              onUpdate={() => {
                setIsDialogOpen(false)
                window.location.reload()
              }}
              onCancel={() => setIsDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
