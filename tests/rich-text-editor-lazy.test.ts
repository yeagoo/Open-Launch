// @vitest-environment jsdom

import { act, createElement } from "react"

import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { RichTextEditorLazy } from "@/components/ui/rich-text-editor-lazy"

const moduleState = vi.hoisted(() => ({ loads: 0 }))

vi.mock("@/components/ui/rich-text-editor", async () => {
  moduleState.loads += 1
  const React = await import("react")
  return {
    RichTextEditor: ({ content }: { content: string }) =>
      React.createElement("div", { "data-rich-text-editor": "loaded" }, content || "empty"),
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

async function renderEditor(content = "") {
  const container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      createElement(RichTextEditorLazy, {
        content,
        onChange: () => undefined,
        placeholder: "Describe the project",
      }),
    )
  })
  return container
}

describe("RichTextEditorLazy", () => {
  it("keeps Tiptap out of the initial empty render and loads it on activation", async () => {
    const container = await renderEditor()
    const initialLoads = moduleState.loads

    expect(container.querySelector('[data-rich-text-editor="loaded"]')).toBeNull()
    const activationButton = container.querySelector<HTMLButtonElement>(
      '[data-rich-text-editor="deferred"]',
    )
    expect(activationButton?.textContent).toContain("Describe the project")

    await act(async () => {
      activationButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(moduleState.loads).toBe(initialLoads + 1)
    expect(container.querySelector('[data-rich-text-editor="loaded"]')).not.toBeNull()
  })

  it("loads immediately when restoring a draft with rich text", async () => {
    const container = await renderEditor("<p>Restored draft</p>")
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector('[data-rich-text-editor="loaded"]')?.textContent).toContain(
      "Restored draft",
    )
  })
})
