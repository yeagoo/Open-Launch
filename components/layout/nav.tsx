/* eslint-disable @next/next/no-img-element */
import { Link } from "@/i18n/navigation"
import { RiLoginBoxLine } from "@remixicon/react"
import { User } from "better-auth"
import { getTranslations } from "next-intl/server"

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
  const [session, t] = await Promise.all([getServerSession(), getTranslations("nav")])
  const user = session?.user

  return (
    <nav className="bg-background/95 border-border/40 sticky top-0 z-50 border-b backdrop-blur-sm">
      <div className="container mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link href="/" className="font-heading flex items-center">
            <span className="font-heading flex items-center text-lg font-bold">
              <img src="/logo.svg" alt="logo" className="mr-1 h-6 w-6" />
              aat.ee
            </span>
          </Link>

          {/* Navigation principale */}
          <NavMenu showDashboard={!!session} />
        </div>

        {/* Version Desktop - Recherche et actions */}
        <div className="hidden items-center gap-3 md:flex">
          <SearchCommandLazy isAuthenticated={!!session} />
          {session && <NotificationBell />}

          <LanguageSwitcher />
          <ThemeToggle />
          {session ? (
            <UserNav user={user as User} />
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/sign-in">{t("signIn")}</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">{t("signUp")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Version Mobile - Menu Drawer */}
        <div className="flex items-center md:hidden">
          {session && <UserNav user={user as User} />}
          {!session && (
            <Button variant="default" size="sm" asChild className="mr-2">
              <Link href="/sign-in">
                <RiLoginBoxLine className="h-4 w-4" />
                {t("signIn")}
              </Link>
            </Button>
          )}
          <MobileNavLazy isAuthenticated={Boolean(session)} />
        </div>
      </div>
    </nav>
  )
}
