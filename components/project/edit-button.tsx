"use client"

import { useState } from "react"

import { RiPencilLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

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
  initialDescription: string
  initialCategories: { id: string; name: string }[]
  isOwner: boolean
  isScheduled: boolean
  sourceLocale?: string
}

export function EditButton({
  projectId,
  initialDescription,
  initialCategories,
  isOwner,
  isScheduled,
  sourceLocale,
}: EditButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  // Ne pas afficher le bouton si l'utilisateur n'est pas propriétaire ou si la chaîne n'est pas scheduled
  if (!isOwner || !isScheduled) {
    return null
  }

  const handleUpdate = () => {
    // Fermer le dialogue et rafraîchir la page pour afficher les changements
    setIsDialogOpen(false)
    window.location.reload()
  }

  const sourceLabel = sourceLocale ? (LOCALE_DISPLAY[sourceLocale] ?? sourceLocale) : null

  return (
    <>
      <Button variant="outline" size="sm" className="h-9" onClick={() => setIsDialogOpen(true)}>
        <RiPencilLine className="mr-1 h-4 w-4" />
        Edit Project Details
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Project Information</DialogTitle>
          </DialogHeader>

          {sourceLabel && (
            <p className="text-muted-foreground -mt-2 text-xs">
              You are editing the <strong>{sourceLabel}</strong> source. Other languages are
              auto-translated and will refresh after you save.
            </p>
          )}

          <EditProjectForm
            projectId={projectId}
            initialDescription={initialDescription}
            initialCategories={initialCategories}
            onUpdate={handleUpdate}
            onCancel={() => setIsDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
