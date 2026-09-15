"use client"

import { useSearchParams } from "next/navigation"

import { usePathname } from "@/i18n/navigation"
import { routing, type Locale } from "@/i18n/routing"
import { RiGlobalLine } from "@remixicon/react"
import { useLocale } from "next-intl"

import { getLocaleSwitchTarget } from "@/lib/locale-switch"
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
  variant?: "default" | "footer" | "menu"
}

export function LanguageSwitcher({ variant = "default" }: LanguageSwitcherProps) {
  const locale = useLocale()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const handleSelect = (next: Locale) => {
    if (next === locale) return
    const target = getLocaleSwitchTarget(pathname, searchParams.toString(), next)

    // Use a full navigation because soft routing can retain RSC payloads from
    // the old locale. The explicit locale prefix also updates NEXT_LOCALE before
    // next-intl canonicalizes the default-locale URL.
    window.location.assign(target)
  }

  const triggerClass =
    variant === "footer"
      ? "h-7 gap-1 px-2 text-xs"
      : variant === "menu"
        ? "h-auto w-full justify-start gap-3 rounded-none px-6 py-2.5 text-sm font-normal"
        : "h-8 gap-1.5 px-2.5 text-sm"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={triggerClass}>
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
