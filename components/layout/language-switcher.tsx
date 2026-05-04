"use client"

import { useTransition } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { usePathname, useRouter } from "@/i18n/navigation"
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
  const router = useRouter()
  const pathname = usePathname()
  const params = useParams()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const handleSelect = (next: string) => {
    const query = searchParams.toString()
    const targetPath = query ? `${pathname}?${query}` : pathname
    startTransition(() => {
      // pathname/params is the dynamic-route shape next-intl expects when no
      // typed pathnames map is configured; cast keeps it simple.
      router.replace({ pathname: targetPath, params } as Parameters<typeof router.replace>[0], {
        locale: next as (typeof routing.locales)[number],
      })
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
