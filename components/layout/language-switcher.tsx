"use client"

import { useTransition } from "react"
import { useSearchParams } from "next/navigation"

import { usePathname } from "@/i18n/navigation"
import { routing } from "@/i18n/routing"
import { RiGlobalLine } from "@remixicon/react"
import { useLocale } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LOCALE_LABELS: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  zh: "简体中文",
  es: "Español",
  pt: "Português",
  fr: "Français",
  ja: "日本語",
  ko: "한국어",
  et: "Eesti",
}

interface LanguageSwitcherProps {
  variant?: "default" | "footer"
}

export function LanguageSwitcher({ variant = "default" }: LanguageSwitcherProps) {
  const locale = useLocale()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const handleSelect = (next: string) => {
    if (next === locale) return
    const query = searchParams.toString()
    const path = pathname && pathname !== "/" ? pathname : ""
    const prefix =
      next === routing.defaultLocale && routing.localePrefix === "as-needed" ? "" : `/${next}`
    const target = `${prefix}${path}${query ? `?${query}` : ""}` || "/"
    startTransition(() => {
      // Hard navigation: soft-routing keeps RSC payloads cached per-locale, so
      // server-rendered strings (project descriptions, etc.) stay in the old
      // language until the user manually refreshes.
      window.location.assign(target)
    })
  }

  const triggerClass = variant === "footer" ? "h-7 gap-1 px-2 text-xs" : "h-9 gap-1 px-2 text-sm"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={triggerClass} disabled={isPending}>
          <RiGlobalLine className="h-4 w-4" />
          <span>{LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS] ?? locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        {routing.locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onSelect={() => handleSelect(loc)}
            className={loc === locale ? "bg-muted font-medium" : ""}
          >
            {LOCALE_LABELS[loc]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
