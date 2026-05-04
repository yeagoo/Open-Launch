"use client"

import { Link } from "@/i18n/navigation"
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
            <Link
              href="/projects/submit"
              className={`${navigationMenuTriggerStyle()} h-9 px-3 text-sm`}
            >
              {t("submitProject")}
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>

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

        <NavigationMenuItem>
          <NavigationMenuLink asChild>
            <Link href="/sponsors" className={`${navigationMenuTriggerStyle()} h-9 px-3 text-sm`}>
              {t("sponsors")}
            </Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}
