"use client"

import { useState, useTransition } from "react"

import { RiArrowRightUpLine, RiRocket2Line, RiStarLine } from "@remixicon/react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { DIRECTORY_TIER_CONFIG, DIRECTORY_TIERS, type DirectoryTier } from "@/lib/directory-tiers"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createDirectoryOrder } from "@/app/actions/directory-orders"

interface BoostListingButtonProps {
  projectId: string
}

// Every tier is a one-time payment now, so the price is a plain dollar
// amount (no "/mo").
function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function BoostListingButton({ projectId }: BoostListingButtonProps) {
  const t = useTranslations("dashboardBoost")
  const [pending, startTransition] = useTransition()
  const [activeTier, setActiveTier] = useState<DirectoryTier | null>(null)

  function handlePick(tier: DirectoryTier) {
    setActiveTier(tier)
    startTransition(async () => {
      try {
        const { redirectUrl } = await createDirectoryOrder({ projectId, tier })
        // Hard nav to Stripe — this is a payment redirect, not an
        // SPA route, so router.push wouldn't be appropriate.
        window.location.href = redirectUrl
      } catch (err) {
        const message = err instanceof Error ? err.message : t("errors.checkoutFailed")
        toast.error(message)
        setActiveTier(null)
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-full px-3 text-xs font-semibold sm:w-auto"
          disabled={pending}
        >
          <RiRocket2Line className="mr-1.5 h-3.5 w-3.5" />
          {pending ? t("redirecting") : t("button")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-mono text-[11px] tracking-wider uppercase">
          {t("pickTier")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DIRECTORY_TIERS.map((tier) => {
          const cfg = DIRECTORY_TIER_CONFIG[tier]
          const isLoading = pending && activeTier === tier
          return (
            <DropdownMenuItem
              key={tier}
              disabled={pending}
              onSelect={(e) => {
                e.preventDefault()
                handlePick(tier)
              }}
              className="flex cursor-pointer items-start justify-between gap-3 py-2.5 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{t(`tiers.${tier}.label`)}</span>
                  {(tier === "ultra" || tier === "ultraPlus") && (
                    <RiStarLine className="h-3 w-3 text-violet-500 dark:text-violet-300" />
                  )}
                </div>
                <p className="text-muted-foreground text-[11px]">{t(`tiers.${tier}.sublabel`)}</p>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-mono text-sm tabular-nums">
                  {formatPrice(cfg.amountCents)}
                </span>
                {isLoading ? (
                  <span className="text-muted-foreground text-[10px]">…</span>
                ) : (
                  <RiArrowRightUpLine className="text-muted-foreground/60 h-3 w-3" />
                )}
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
