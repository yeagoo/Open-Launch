#!/usr/bin/env bun
import { lstat, readFile, readlink } from "node:fs/promises"
import { resolve } from "node:path"

interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  overrides?: Record<string, string>
}

const repositoryRoot = resolve(import.meta.dirname, "..")
const environmentExampleDocuments = [
  "README.md",
  "VIRTUAL_ENGAGEMENT.md",
  "CRON_AUTH_METHODS.md",
  "CRON_SETUP_COMPARISON.md",
  "PRODUCTHUNT_CRON_ZEABUR.md",
  "PRODUCTHUNT_AUTO_IMPORT.md",
  "OAUTH_QUICK_REFERENCE.md",
  "CRON_ENV_VARIABLES.md",
  "docs/cursor/README.md",
  "docs/cursor/CONFIGURATION_INDEX.md",
  "docs/cursor/OAUTH_QUICK_REFERENCE.md",
  "docs/cursor/SERVICES_QUICK_REFERENCE.md",
] as const
const stripeConfigurationDocuments = [
  "docs/cursor/ENV_SETUP_GUIDE.md",
  "docs/cursor/WEBHOOK_URL_GUIDE.md",
  "docs/cursor/ZEABUR_DEPLOYMENT_GUIDE.md",
] as const

async function main(): Promise<void> {
  const errors: string[] = []
  const packageJson = JSON.parse(
    await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  ) as PackageManifest
  const nextVersion = packageJson.dependencies?.next
  const overriddenNextVersion = packageJson.overrides?.next

  if (!nextVersion) {
    errors.push("package.json is missing dependencies.next")
  } else {
    if (overriddenNextVersion !== nextVersion) {
      errors.push(
        "package.json overrides.next must match dependencies.next (found " +
          String(overriddenNextVersion) +
          " and " +
          nextVersion +
          ")",
      )
    }

    const readme = await readFile(resolve(repositoryRoot, "README.md"), "utf8")
    const badgeVersion = readme.match(
      /https:\/\/img\.shields\.io\/badge\/Next\.js-([^-?]+)-black\?logo=next\.js/,
    )?.[1]
    if (badgeVersion !== nextVersion) {
      errors.push(
        "README Next.js badge must match dependencies.next (found " +
          String(badgeVersion) +
          " and " +
          nextVersion +
          ")",
      )
    }
  }

  if (!packageJson.devDependencies?.["@types/bun"]) {
    errors.push("package.json is missing devDependencies.@types/bun")
  }

  const legacyExample = resolve(repositoryRoot, "env.example.txt")
  const legacyExampleStats = await lstat(legacyExample)
  if (legacyExampleStats.isSymbolicLink()) {
    const target = await readlink(legacyExample)
    if (target !== ".env.example") {
      errors.push("env.example.txt must point to .env.example")
    }
  } else {
    // Git materializes a symlink as its target text when core.symlinks is
    // disabled on Windows. Accept that checkout representation without
    // allowing a second environment template to drift from the canonical one.
    const pointer = await readFile(legacyExample, "utf8")
    if (pointer.trim() !== ".env.example") {
      errors.push("env.example.txt must point to .env.example")
    }
  }

  for (const documentPath of environmentExampleDocuments) {
    const contents = await readFile(resolve(repositoryRoot, documentPath), "utf8")
    if (contents.includes("env.example.txt")) {
      errors.push(documentPath + " still references the deprecated environment example")
    }
    if (!contents.includes(".env.example")) {
      errors.push(documentPath + " does not reference the canonical environment example")
    }
  }

  for (const documentPath of stripeConfigurationDocuments) {
    const contents = await readFile(resolve(repositoryRoot, documentPath), "utf8")
    if (/^\s*NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\s*=/m.test(contents)) {
      errors.push(documentPath + " documents an unused Stripe publishable-key variable")
    }
  }

  if (errors.length > 0) {
    console.error("Repository contract check failed:")
    for (const error of errors) console.error("- " + error)
    process.exitCode = 1
    return
  }

  console.log(
    "Repository contracts passed: framework badge, environment example, Bun types, and Stripe docs.",
  )
}

main().catch((error) => {
  console.error("[repository-contracts]", error)
  process.exit(1)
})
