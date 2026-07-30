import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const repositoryRoot = resolve(import.meta.dirname, "..")

describe("standalone asset contract", () => {
  it("ships only the runtime OG font shards and rejects the development TTF", async () => {
    const [dockerignore, nextConfig, prepareStandalone, manifest] = await Promise.all([
      readFile(resolve(repositoryRoot, ".dockerignore"), "utf8"),
      readFile(resolve(repositoryRoot, "next.config.ts"), "utf8"),
      readFile(resolve(repositoryRoot, "scripts/prepare-standalone.ts"), "utf8"),
      readFile(
        resolve(repositoryRoot, "assets/fonts/noto-sans-sc-bold-shards/manifest.json"),
        "utf8",
      ),
    ])

    expect(dockerignore).toContain("assets/fonts/NotoSansSC-Bold.ttf")
    expect(nextConfig).toContain("./assets/fonts/noto-sans-sc-bold-shards/**/*")
    expect(nextConfig).not.toContain("./assets/fonts/**/*")
    expect(nextConfig).toContain(
      'outputFileTracingExcludes: {\n    "/*": ["./assets/fonts/NotoSansSC-Bold.ttf"]',
    )
    expect(prepareStandalone).toContain(
      'rm(resolve(runtimeFontDirectory, "NotoSansSC-Bold.ttf"), { force: true })',
    )
    expect(manifest).not.toContain(".ttf")
  })
})
