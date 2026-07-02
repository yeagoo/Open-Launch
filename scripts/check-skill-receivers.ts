#!/usr/bin/env bun

import "dotenv/config"

import {
  redactSkillEndpointUrl,
  skillSiteApiKey,
  skillSiteEndpoint,
  skillSiteEnvName,
  skillSiteUnpublishEndpoint,
  validateSkillEndpointUrl,
} from "@/lib/skill-publishing"
import { SKILL_PUBLICATION_SITE_COUNT, skillPublicationSites } from "@/lib/skill-sites"

type RowStatus = "ok" | "error"

interface ReceiverRow {
  status: RowStatus
  site: string
  domain: string
  envPrefix: string
  launch: string | null
  unpublish: string | null
  keySource: string | null
  errors: string[]
}

function main() {
  const rows = skillPublicationSites().map(receiverReadiness)
  const failures = rows.filter((row) => row.status === "error")
  const countError =
    rows.length === SKILL_PUBLICATION_SITE_COUNT
      ? null
      : `Expected ${SKILL_PUBLICATION_SITE_COUNT} receiver site(s), got ${rows.length}`

  console.log("Skill receiver readiness")
  console.log("========================")
  if (countError) console.log(`ERROR ${countError}`)
  for (const row of rows) {
    const mark = row.status === "ok" ? "OK" : "ERR"
    console.log(`${mark} ${row.site} (${row.domain})`)
    console.log(
      `    launch:    ${formatEndpointForLog(row.launch, `${row.envPrefix}_URL missing`)}`,
    )
    console.log(
      `    unpublish: ${formatEndpointForLog(row.unpublish, `${row.envPrefix}_UNPUBLISH_URL missing/unresolved`)}`,
    )
    console.log(`    key:       ${row.keySource ?? "missing"}`)
    for (const error of row.errors) console.log(`    error:     ${error}`)
  }

  if (countError || failures.length > 0) {
    console.log(`\n${failures.length}/${rows.length} receiver configuration(s) are not ready.`)
    process.exitCode = 1
    return
  }

  console.log(`\nAll ${rows.length} receiver configurations are ready.`)
}

function receiverReadiness(site: { site: string; domain: string }): ReceiverRow {
  const envSite = skillSiteEnvName(site.site)
  const envPrefix = `SKILL_PUBLISH_${envSite}`
  const launch = skillSiteEndpoint(site.site)
  const unpublish = skillSiteUnpublishEndpoint(site.site)
  const keySource = skillSiteKeySource(site.site)
  const errors: string[] = []

  if (!launch) {
    errors.push(`${envPrefix}_URL is required`)
  } else {
    const error = validateSkillEndpointUrl(launch)
    if (error) errors.push(`${envPrefix}_URL ${error}`)
  }

  if (!unpublish) {
    errors.push(`${envPrefix}_UNPUBLISH_URL is required unless ${envPrefix}_URL ends with /launch`)
  } else {
    const error = validateSkillEndpointUrl(unpublish)
    if (error) errors.push(`${envPrefix}_UNPUBLISH_URL ${error}`)
  }

  if (!skillSiteApiKey(site.site)) {
    errors.push(
      `${envPrefix}_API_KEY, SKILL_PUBLISH_API_KEY, or EXTERNAL_LAUNCH_API_KEY is required`,
    )
  }

  return {
    status: errors.length === 0 ? "ok" : "error",
    site: site.site,
    domain: site.domain,
    envPrefix,
    launch,
    unpublish,
    keySource,
    errors,
  }
}

function skillSiteKeySource(site: string): string | null {
  const envSite = skillSiteEnvName(site)
  if (process.env[`SKILL_PUBLISH_${envSite}_API_KEY`]) return `SKILL_PUBLISH_${envSite}_API_KEY`
  if (process.env.SKILL_PUBLISH_API_KEY) return "SKILL_PUBLISH_API_KEY"
  if (process.env.EXTERNAL_LAUNCH_API_KEY) return "EXTERNAL_LAUNCH_API_KEY"
  return null
}

function formatEndpointForLog(value: string | null, fallback: string): string {
  return value ? redactSkillEndpointUrl(value) : fallback
}

main()
