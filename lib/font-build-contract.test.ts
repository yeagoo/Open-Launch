import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "..")

describe("bounded Google Fonts build contract", () => {
  it("routes local and CI Next builds through the reviewed prefetch wrapper", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> }
    const workflow = await readFile(resolve(repositoryRoot, ".github/workflows/ci.yml"), "utf8")
    const wrapper = await readFile(
      resolve(repositoryRoot, "scripts/build-next-with-font-cache.ts"),
      "utf8",
    )
    const nextConfig = await readFile(resolve(repositoryRoot, "next.config.ts"), "utf8")

    expect(packageJson.scripts["build:next"]).toBe("bun scripts/build-next-with-font-cache.ts")
    expect(packageJson.scripts.build).toContain("bun run build:next")
    expect(packageJson.scripts.build).not.toContain("next build")
    expect(workflow).toContain("run: bun run build:next")
    expect(workflow).not.toContain("run: bunx next build")
    expect(wrapper).toContain('"node",')
    expect(wrapper).toContain('[nextBinary, "build", "--webpack"')
    expect(wrapper).not.toContain("process.execPath")
    expect(wrapper).toContain('[typeScriptBinary, "--noEmit"]')
    expect(wrapper.indexOf('[typeScriptBinary, "--noEmit"]')).toBeLessThan(
      wrapper.indexOf('[nextBinary, "build", "--webpack"'),
    )
    expect(wrapper).toContain('OPEN_LAUNCH_NEXT_TYPECHECK_COMPLETE: "1"')
    expect(nextConfig).toContain(
      'ignoreBuildErrors: process.env.OPEN_LAUNCH_NEXT_TYPECHECK_COMPLETE === "1"',
    )
  })
})
