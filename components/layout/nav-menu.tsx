"use client"

import { Link } from "@/i18n/navigation"
import { RiRocketLine } from "@remixicon/react"
import { useTranslations } from "next-intl"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

interface NavMenuProps {
  showDashboard?: boolean
}

export function NavMenu({ showDashboard = true }: NavMenuProps) {
  const t = useTranslations("nav")
  const tDesc = useTranslations("nav.exploreDesc")
  return (
    <NavigationMenu className="hidden md:flex">
      <NavigationMenuList className="gap-1">
        <NavigationMenuItem>
          <NavigationMenuTrigger className="h-9 cursor-pointer px-3 text-sm">
            {t("explore")}
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[280px] gap-1 p-2">
              <li>
                <NavigationMenuLink asChild>
                  <Link
                    href="/trending"
                    className="block rounded-md px-2 py-2 text-sm no-underline transition-colors outline-none select-none"
                  >
                    <div className="mb-1 font-medium">{tDesc("trendingTitle")}</div>
                    <p className="text-muted-foreground text-xs leading-tight">
                      {tDesc("trendingDesc")}
                    </p>
                  </Link>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink asChild>
                  <Link
                    href="/winners"
                    className="block rounded-md px-2 py-2 text-sm no-underline transition-colors outline-none select-none"
                  >
                    <div className="mb-1 font-medium">{tDesc("winnersTitle")}</div>
                    <p className="text-muted-foreground text-xs leading-tight">
                      {tDesc("winnersDesc")}
                    </p>
                  </Link>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink asChild>
                  <Link
                    href="/trending?filter=month"
                    className="block rounded-md px-2 py-2 text-sm no-underline transition-colors outline-none select-none"
                  >
                    <div className="mb-1 font-medium">{tDesc("monthTitle")}</div>
                    <p className="text-muted-foreground text-xs leading-tight">
                      {tDesc("monthDesc")}
                    </p>
                  </Link>
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink asChild>
                  <Link
                    href="/categories"
                    className="block rounded-md px-2 py-2 text-sm no-underline transition-colors outline-none select-none"
                  >
                    <div className="mb-1 font-medium">{tDesc("categoriesTitle")}</div>
                    <p className="text-muted-foreground text-xs leading-tight">
                      {tDesc("categoriesDesc")}
                    </p>
                  </Link>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        {showDashboard && (
          <NavigationMenuItem>
            <NavigationMenuLink asChild>
              <Link
                href="/dashboard"
                className={`${navigationMenuTriggerStyle()} h-9 px-3 text-sm`}
              >
                {t("dashboard")}
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>
        )}

        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link href="/pricing" className={`${navigationMenuTriggerStyle()} h-9 px-3 text-sm`}>
              {t("pricing")}
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link href="/badge" className={`${navigationMenuTriggerStyle()} h-9 px-3 text-sm`}>
              {t("fastTrack")}
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>

        {/* Primary CTA — placed last so the colored fill anchors the
            right end of the nav, matching the convention used by
            Vercel / Linear / Resend / etc.
            Deliberately NOT wrapped in <NavigationMenuLink asChild>:
            that injects its own flex-col + p-2 + rounded-sm classes,
            which collide with our inline-flex / px-3 / rounded-md and
            cause the icon to wrap onto a clipped second row. The Link
            sits directly inside NavigationMenuItem so we control 100%
            of the className. */}
        <NavigationMenuItem>
          <Link
            href="/projects/submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors"
          >
            <RiRocketLine className="h-4 w-4" aria-hidden="true" />
            {t("submitProject")}
          </Link>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}
