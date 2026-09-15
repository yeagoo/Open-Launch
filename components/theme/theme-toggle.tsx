"use client"

import { RiMoonLine, RiSunLine } from "@remixicon/react"
import { useTheme } from "next-themes"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="text-muted-foreground hover:text-foreground hover:bg-accent flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors"
    >
      <RiSunLine className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <RiMoonLine className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
