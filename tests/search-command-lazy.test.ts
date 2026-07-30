// @vitest-environment jsdom

import { act, createElement } from "react"

import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { SearchCommandLazy } from "@/components/layout/search-command-lazy"

const moduleState = vi.hoisted(() => ({ loads: 0 }))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "placeholder" ? "Search" : key),
}))

vi.mock("@/components/layout/search-command", async () => {
  moduleState.loads += 1
  const React = await import("react")

  return {
    SearchCommandDialog: ({
      isAuthenticated,
      open,
    }: {
      isAuthenticated?: boolean
      open: boolean
    }) =>
      open
        ? React.createElement(
            "div",
            {
              role: "dialog",
              "data-authenticated": String(Boolean(isAuthenticated)),
            },
            "Loaded search",
          )
        : null,
  }
})

let root: Root | undefined

beforeAll(() => {
  ;(
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean
    }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount())
    root = undefined
  }
  document.body.replaceChildren()
})

async function renderSearch() {
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(createElement(SearchCommandLazy, { isAuthenticated: true }))
  })
  return container
}

describe("SearchCommandLazy", () => {
  it("keeps the dialog module out of the initial render and loads it on click", async () => {
    const container = await renderSearch()
    const initialLoads = moduleState.loads

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector("button")?.textContent).toContain("Search")

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(moduleState.loads).toBe(initialLoads + 1)
    expect(container.querySelector('[role="dialog"]')?.getAttribute("data-authenticated")).toBe(
      "true",
    )
  })

  it("loads and opens from the Cmd/Ctrl+K shortcut", async () => {
    const container = await renderSearch()

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          ctrlKey: true,
          key: "k",
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
  })
})
