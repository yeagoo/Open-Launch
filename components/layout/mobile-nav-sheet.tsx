"use client"

import { Link } from "@/i18n/navigation"
import {
  RiDashboardLine,
  RiFlashlightLine,
  RiHomeLine,
  RiLayoutGridLine,
  RiLoginBoxLine,
  RiMedalLine,
  RiMenuLine,
  RiMoneyDollarCircleLine,
  RiRocketLine,
  RiUserAddLine,
} from "@remixicon/react"
import { useTranslations } from "next-intl"

import { buttonVariants } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

import { ThemeToggleMenu } from "../theme/theme-toggle-menu"
import { SearchCommandLazy } from "./search-command-lazy"

interface MobileNavSheetProps {
  isAuthenticated: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MobileNavSheet({ isAuthenticated, open, onOpenChange }: MobileNavSheetProps) {
  const t = useTranslations("nav")
  const tCommon = useTranslations("common")

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        aria-label={tCommon("menu")}
        className={buttonVariants({ variant: "ghost", size: "icon", className: "h-9 w-9" })}
      >
        <RiMenuLine className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="right">
        <div className="flex h-full flex-col">
          <div className="px-2">
            <SheetHeader className="mb-2 pb-0">
              <SheetTitle>{tCommon("menu")}</SheetTitle>
            </SheetHeader>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="mt-2 mb-4 px-6">
              <SheetClose asChild>
                <Link
                  href="/projects/submit"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors"
                >
                  <RiRocketLine className="h-4 w-4" />
                  {t("submitProject")}
                </Link>
              </SheetClose>
            </div>

            <div className="mt-2 mb-6 px-6">
              <SearchCommandLazy isAuthenticated={isAuthenticated} enableShortcut={false} />
            </div>
            <div className="bg-border my-4 h-px" />

            {isAuthenticated && (
              <div className="mb-4">
                <div className="mb-2 px-6">
                  <h3 className="text-muted-foreground mb-2 text-xs font-medium">
                    {t("navigation")}
                  </h3>
                </div>
                <div className="space-y-1">
                  <SheetClose asChild>
                    <Link
                      href="/"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiHomeLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("home")}</span>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/trending"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiFlashlightLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("trending")}</span>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/categories"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiLayoutGridLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("categories")}</span>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/winners"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiMedalLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("winners")}</span>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/pricing"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiMoneyDollarCircleLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("pricing")}</span>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/badge"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiFlashlightLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("fastTrack")}</span>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/dashboard"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiDashboardLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("dashboard")}</span>
                    </Link>
                  </SheetClose>
                </div>
              </div>
            )}

            <div className="bg-border my-4 h-px" />

            <div className="mb-4">
              <div className="mb-2 px-6">
                <h3 className="text-muted-foreground mb-2 text-xs font-medium">{t("actions")}</h3>
              </div>
              <ThemeToggleMenu />

              {!isAuthenticated && (
                <div className="space-y-1">
                  <SheetClose asChild>
                    <Link
                      href="/sign-in"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiLoginBoxLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("signIn")}</span>
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link
                      href="/sign-up"
                      className="hover:bg-muted/50 flex items-center gap-3 px-6 py-2.5 text-sm transition-colors"
                    >
                      <RiUserAddLine className="text-muted-foreground h-4 w-4" />
                      <span>{t("signUp")}</span>
                    </Link>
                  </SheetClose>
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
