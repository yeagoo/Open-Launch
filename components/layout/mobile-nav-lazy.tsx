"use client"

import { useState, type ComponentType } from "react"

import { RiLoader4Line, RiMenuLine } from "@remixicon/react"
import { useTranslations } from "next-intl"

import { buttonVariants } from "@/components/ui/button"

interface MobileNavSheetProps {
  isAuthenticated: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The closed mobile drawer should cost one button, not the HTML and JavaScript
 * for every hidden navigation row. Load the real Sheet only on first use.
 */
export function MobileNavLazy({ isAuthenticated }: { isAuthenticated: boolean }) {
  const t = useTranslations("common")
  const [SheetComponent, setSheetComponent] = useState<ComponentType<MobileNavSheetProps> | null>(
    null,
  )
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  if (SheetComponent) {
    return <SheetComponent isAuthenticated={isAuthenticated} open={open} onOpenChange={setOpen} />
  }

  const loadSheet = async () => {
    if (loading) return
    setLoading(true)
    try {
      const loaded = await import("./mobile-nav-sheet")
      setSheetComponent(() => loaded.MobileNavSheet)
      setOpen(true)
    } catch (error) {
      console.error("[mobile-nav] failed to load menu", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      aria-label={t("menu")}
      aria-busy={loading}
      disabled={loading}
      onClick={() => void loadSheet()}
      className={buttonVariants({ variant: "ghost", size: "icon", className: "h-9 w-9" })}
    >
      {loading ? (
        <RiLoader4Line className="h-5 w-5 animate-spin" />
      ) : (
        <RiMenuLine className="h-5 w-5" />
      )}
    </button>
  )
}
