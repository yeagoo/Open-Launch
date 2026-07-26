#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { cp, mkdir, rm } from "node:fs/promises"
import { resolve } from "node:path"

const root = process.cwd()
const standalone = resolve(root, ".next", "standalone")

async function main() {
  if (!existsSync(resolve(standalone, "server.js"))) {
    throw new Error("Next.js standalone server was not generated")
  }

  const standalonePublic = resolve(standalone, "public")
  const standaloneStatic = resolve(standalone, ".next", "static")
  await rm(standalonePublic, { force: true, recursive: true })
  await rm(standaloneStatic, { force: true, recursive: true })
  await mkdir(resolve(standalone, ".next"), { recursive: true })
  await cp(resolve(root, "public"), standalonePublic, { recursive: true })
  await cp(resolve(root, ".next", "static"), standaloneStatic, { recursive: true })

  // Runtime secrets are supplied by the service EnvironmentFile. Never package
  // local dotenv files into the deployable standalone artifact.
  for (const name of [".env", ".env.local", ".env.production", ".env.development"]) {
    await rm(resolve(standalone, name), { force: true })
  }

  console.log("[prepare-standalone] copied public/static assets and removed dotenv files")
}

main().catch((error) => {
  console.error("[prepare-standalone]", error)
  process.exit(1)
})
