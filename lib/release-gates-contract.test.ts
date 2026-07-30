import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "..")

describe("release performance gates", () => {
  it("blocks on route JavaScript regressions and preserves analyzer diagnostics", async () => {
    const workflow = await readFile(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8")
    const routeGate = workflow.slice(
      workflow.indexOf("- name: Enforce route JavaScript budgets"),
      workflow.indexOf("- name: Observe route, HTML and mobile Lighthouse budgets"),
    )

    expect(routeGate).toContain("bun run perf:routes")
    expect(routeGate).not.toContain("continue-on-error")
    expect(workflow).toContain("bun run analyze:bundle")
    expect(workflow).toContain(".next/diagnostics/analyze/")
  })
})
