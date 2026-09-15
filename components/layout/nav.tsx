/* eslint-disable @next/next/no-img-element */
import { Link } from "@/i18n/navigation"
import { RiLoginBoxLine } from "@remixicon/react"
import { User } from "better-auth"
import { getLocale, getTranslations } from "next-intl/server"

import { getServerSession } from "@/lib/server-auth"

import { ThemeToggle } from "../theme/theme-toggle"
import { Button } from "../ui/button"
import { LanguageSwitcher } from "./language-switcher"
import { MobileNavLazy } from "./mobile-nav-lazy"
import { NavMenu } from "./nav-menu"
import { NotificationBell } from "./notification-bell"
import { SearchCommandLazy } from "./search-command-lazy"
import { UserNav } from "./user-nav"

export default async function Nav() {
  const [session, t, locale] = await Promise.all([
    getServerSession(),
    getTranslations("nav"),
    getLocale(),
  ])
  const user = session?.user

  // During the staged rollout both home pages are live, so the nav's Submit CTA
  // has to match whichever one is being served. Without this the new home's
  // orange CTA sits next to a green nav button (two competing action colours on
  // one screen) — or the reverse on the legacy home.
  const useHomeAccent = process.env.HOME_V2 === "1"
  const showCommunity = process.env.COMMUNITY_ENABLED === "1"

  return (
    <nav
      lang={locale}
      className="bg-background/95 border-border/40 sticky top-0 z-50 border-b backdrop-blur-sm"
    >
      <div className="container mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
        {/* Logo */}
        <div className="flex min-w-0 items-center gap-5 xl:gap-6">
          <Link href="/" className="font-heading flex items-center">
            <span className="font-heading flex items-center text-lg font-bold">
              <img src="/logo.svg" alt="logo" className="mr-1 h-6 w-6" />
              aat.ee
            </span>
          </Link>

          {/* Navigation principale */}
          <NavMenu
            showDashboard={!!session}
            showCommunity={showCommunity}
            useHomeAccent={useHomeAccent}
          />
        </div>

        {/* Version Desktop - Recherche et actions */}
        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <SearchCommandLazy
            isAuthenticated={!!session}
            className="w-40 min-[1100px]:w-48 xl:w-52"
          />
          {session && <NotificationBell />}

          <span aria-hidden="true" className="bg-border/70 mx-0.5 h-5 w-px" />
          <LanguageSwitcher />
          <ThemeToggle />
          {session ? (
            <UserNav user={user as User} />
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild className="px-2.5">
                <Link href="/sign-in">{t("signIn")}</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
                className={useHomeAccent ? "rounded-home-pill px-3.5" : "px-3.5"}
              >
                <Link href="/sign-up">{t("signUp")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Version Mobile - Menu Drawer */}
        <div className="ml-auto flex items-center lg:hidden">
          {session && <UserNav user={user as User} />}
          {!session && (
            <Button variant="default" size="sm" asChild className="mr-2">
              <Link href="/sign-in">
                <RiLoginBoxLine className="h-4 w-4" />
                {t("signIn")}
              </Link>
            </Button>
          )}
          <MobileNavLazy
            isAuthenticated={Boolean(session)}
            showCommunity={showCommunity}
            useHomeAccent={useHomeAccent}
          />
        </div>
      </div>
    </nav>
  )
}
