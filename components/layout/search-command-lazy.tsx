"use client"

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react"

import { RiLoader4Line, RiSearchLine } from "@remixicon/react"
import { useTranslations } from "next-intl"

interface SearchDialogProps {
  isAuthenticated?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Keep the always-visible search trigger and Cmd/Ctrl+K listener in the
 * initial Nav bundle. The command palette, search hook, dialog primitives and
 * result UI are fetched only on first use.
 */
interface SearchCommandLazyProps {
  isAuthenticated?: boolean
  enableShortcut?: boolean
}

export function SearchCommandLazy({
  isAuthenticated = false,
  enableShortcut = true,
}: SearchCommandLazyProps) {
  const t = useTranslations("search")
  const [DialogComponent, setDialogComponent] = useState<ComponentType<SearchDialogProps> | null>(
    null,
  )
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const loadingModule = useRef<Promise<ComponentType<SearchDialogProps>> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const loadAndOpen = useCallback(async () => {
    if (DialogComponent) {
      setOpen(true)
      return
    }

    setLoading(true)
    try {
      loadingModule.current ??= import("./search-command").then(
        (module) => module.SearchCommandDialog,
      )
      const loaded = await loadingModule.current
      if (!mounted.current) return
      setDialogComponent(() => loaded)
      setOpen(true)
    } catch {
      // Keep the trigger enabled so a transient chunk failure can be retried.
      loadingModule.current = null
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [DialogComponent])

  useEffect(() => {
    if (!enableShortcut) return

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey)) return
      event.preventDefault()
      if (DialogComponent) setOpen((current) => !current)
      else void loadAndOpen()
    }

    document.addEventListener("keydown", handleShortcut)
    return () => document.removeEventListener("keydown", handleShortcut)
  }, [DialogComponent, enableShortcut, loadAndOpen])

  return (
    <>
      <button
        type="button"
        aria-busy={loading}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={loading}
        className="text-muted-foreground bg-muted/60 hover:bg-muted flex h-8 w-64 cursor-pointer items-center justify-start rounded-md border-none px-2 text-sm transition-colors focus:outline-none disabled:cursor-wait"
        onClick={() => void loadAndOpen()}
      >
        {loading ? (
          <RiLoader4Line className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <RiSearchLine className="mr-2 h-3.5 w-3.5" />
        )}
        <span>{t("placeholder")}</span>
        <kbd className="bg-muted pointer-events-none ml-auto hidden h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium opacity-100 select-none sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>
      {DialogComponent && (
        <DialogComponent isAuthenticated={isAuthenticated} open={open} onOpenChange={setOpen} />
      )}
    </>
  )
}
