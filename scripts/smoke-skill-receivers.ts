#!/usr/bin/env bun

import "dotenv/config"

import {
  buildSkillLaunchPayload,
  postSkillLaunchToSite,
  postSkillUnpublishToSite,
  redactSkillEndpointUrl,
  skillSiteEndpoint,
  skillSiteLaunchConfigError,
  skillSiteUnpublishEndpoint,
  validateSkillEndpointUrl,
} from "@/lib/skill-publishing"
import { SKILL_PUBLICATION_SITE_COUNT, skillPublicationSites } from "@/lib/skill-sites"
import { isPrivateHostname } from "@/lib/utils"

const CONFIRM_FLAG = "--confirm-live-posts"
const KEEP_FLAG = "--keep-published"
const SITE_FLAG = "--site"

type SmokeStepStatus = "ok" | "failed" | "skipped"

interface SmokeResult {
  site: string
  post: SmokeStepStatus
  unpublish: SmokeStepStatus
  externalUrl?: string
  error?: string
}

async function main() {
  const args = process.argv.slice(2)
  const confirmed = args.includes(CONFIRM_FLAG)
  const keepPublished = args.includes(KEEP_FLAG)
  const siteFilter = readRequiredFlagValue(args, SITE_FLAG)
  if (siteFilter instanceof Error) {
    console.error(siteFilter.message)
    process.exitCode = 1
    return
  }
  const runId = process.env.SKILL_SMOKE_RUN_ID || compactTimestamp(new Date())
  const smokeWebsiteUrl = process.env.SKILL_SMOKE_WEBSITE_URL?.trim() || null
  const smokeWebsiteUrlError = validateSmokeWebsiteUrl(smokeWebsiteUrl, confirmed)
  if (smokeWebsiteUrlError) {
    console.error(smokeWebsiteUrlError)
    process.exitCode = 1
    return
  }
  const websiteUrl = smokeWebsiteUrl ?? "unset (required for live posts)"

  const sites = skillPublicationSites().filter((site) =>
    siteFilter ? site.site === siteFilter : true,
  )
  if (sites.length === 0) {
    console.error(siteFilter ? `No skill receiver site matches --site ${siteFilter}` : "No sites")
    process.exitCode = 1
    return
  }

  const countError =
    !siteFilter && sites.length !== SKILL_PUBLICATION_SITE_COUNT
      ? `Expected ${SKILL_PUBLICATION_SITE_COUNT} receiver site(s), got ${sites.length}`
      : null
  const configErrors = sites.flatMap((site) => receiverConfigErrors(site.site, keepPublished))

  console.log("Skill receiver live smoke")
  console.log("=========================")
  console.log(`mode:       ${confirmed ? "LIVE POST" : "dry-run"}`)
  console.log(`sites:      ${sites.length}${siteFilter ? ` (${siteFilter})` : ""}`)
  console.log(`run id:     ${runId}`)
  console.log(`website:    ${websiteUrl}`)
  console.log(`rollback:   ${keepPublished ? "disabled (--keep-published)" : "unpublish after post"}`)
  console.log("")

  for (const site of sites) {
    console.log(`${site.site} (${site.domain})`)
    console.log(`  launch:    ${formatEndpoint(skillSiteEndpoint(site.site))}`)
    console.log(`  unpublish: ${formatEndpoint(skillSiteUnpublishEndpoint(site.site))}`)
  }

  if (countError) {
    console.log(`\nERROR ${countError}`)
    process.exitCode = 1
    return
  }

  if (configErrors.length > 0) {
    console.log("\nReceiver configuration is not ready:")
    for (const row of configErrors) console.log(`- ${row.site}: ${row.error}`)
    process.exitCode = 1
    return
  }

  if (!confirmed) {
    console.log(`\nDry run only. Re-run with ${CONFIRM_FLAG} to create live receiver posts.`)
    return
  }

  const liveWebsiteUrl = smokeWebsiteUrl!
  const results: SmokeResult[] = []
  for (const site of sites) {
    const idempotencyKey = `skill-smoke-${runId}-${site.site}`
    const payload = buildSkillLaunchPayload({
      title: `AAT Skill Smoke ${runId}`,
      tagline: "Temporary receiver contract smoke test.",
      bodyMd: [
        `This is a temporary aat.ee skill receiver smoke test for ${site.site}.`,
        "",
        "It verifies launch payload acceptance, nofollow handling, concrete external URL return, idempotency-key storage, and unpublish rollback.",
      ].join("\n"),
      websiteUrl: liveWebsiteUrl,
    })

    const post = await postSkillLaunchToSite(site.site, idempotencyKey, payload)
    if (!post.ok) {
      const rollback = keepPublished
        ? null
        : await postSkillUnpublishToSite(site.site, idempotencyKey, liveWebsiteUrl)
      results.push({
        site: site.site,
        post: "failed",
        unpublish: rollback ? (rollback.ok ? "ok" : "failed") : "skipped",
        error: joinErrors([
          post.error || `HTTP ${post.statusCode ?? "unknown"}`,
          rollback && !rollback.ok
            ? `rollback failed: ${rollback.error || `HTTP ${rollback.statusCode ?? "unknown"}`}`
            : null,
        ]),
      })
      continue
    }

    if (keepPublished) {
      results.push({
        site: site.site,
        post: "ok",
        unpublish: "skipped",
        externalUrl: post.externalUrl,
      })
      continue
    }

    const unpublish = await postSkillUnpublishToSite(site.site, idempotencyKey, liveWebsiteUrl)
    results.push({
      site: site.site,
      post: "ok",
      unpublish: unpublish.ok ? "ok" : "failed",
      externalUrl: post.externalUrl,
      error: unpublish.ok ? undefined : unpublish.error || `HTTP ${unpublish.statusCode ?? "unknown"}`,
    })
  }

  console.log("\nResults")
  console.log("=======")
  for (const result of results) {
    const external = result.externalUrl ? ` ${result.externalUrl}` : ""
    const error = result.error ? ` error=${result.error}` : ""
    console.log(
      `${result.site}: post=${result.post} unpublish=${result.unpublish}${external}${error}`,
    )
  }

  if (results.some((result) => result.post === "failed" || result.unpublish === "failed")) {
    process.exitCode = 1
  }
}

function readRequiredFlagValue(args: readonly string[], flag: string): string | null | Error {
  const index = args.indexOf(flag)
  if (index === -1) return null
  const value = args[index + 1]
  if (!value || value.startsWith("--")) return new Error(`${flag} requires a site id value`)
  return value
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function formatEndpoint(value: string | null): string {
  return value ? redactSkillEndpointUrl(value) : "missing"
}

function joinErrors(errors: Array<string | null>): string {
  return errors.filter((error): error is string => Boolean(error)).join("; ")
}

function validateSmokeWebsiteUrl(value: string | null, confirmed: boolean): string | null {
  if (!value) {
    return confirmed
      ? "SKILL_SMOKE_WEBSITE_URL is required for live smoke posts; use a dedicated unused smoke domain."
      : null
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return "SKILL_SMOKE_WEBSITE_URL must be a valid URL"
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "SKILL_SMOKE_WEBSITE_URL must be an http(s) URL"
  }
  if (url.username || url.password) {
    return "SKILL_SMOKE_WEBSITE_URL must not include embedded credentials"
  }

  const hostname = url.hostname.toLowerCase()
  if (hostname === "aat.ee" || hostname === "www.aat.ee") {
    return "SKILL_SMOKE_WEBSITE_URL must use a dedicated unused smoke domain, not aat.ee"
  }
  if (isPrivateHostname(hostname)) {
    return "SKILL_SMOKE_WEBSITE_URL must not use a private or localhost hostname"
  }

  return null
}

function receiverConfigErrors(
  site: string,
  keepPublished: boolean,
): Array<{ site: string; error: string }> {
  const errors: Array<{ site: string; error: string }> = []
  const launchError = skillSiteLaunchConfigError(site)
  if (launchError) errors.push({ site, error: launchError })

  if (!keepPublished) {
    const unpublish = skillSiteUnpublishEndpoint(site)
    if (!unpublish) {
      errors.push({ site, error: "unpublish endpoint is required for automatic rollback" })
    } else {
      const unpublishError = validateSkillEndpointUrl(unpublish)
      if (unpublishError) errors.push({ site, error: `unpublish endpoint ${unpublishError}` })
    }
  }

  return errors
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
