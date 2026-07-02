import { request } from "undici"

import { FetchTimeoutError, withTimeout } from "@/lib/fetch-timeout"

export interface SkillLaunchPayload {
  source: "aat.ee"
  name: string
  tagline: string
  description: string
  websiteUrl: string
  rel: "nofollow"
  tier: "free-skill"
}

export interface SkillPostResult {
  ok: boolean
  statusCode?: number
  externalId?: string
  externalUrl?: string
  error?: string
  configError?: boolean
}

export interface SkillLaunchRequestBody extends SkillLaunchPayload {
  idempotencyKey: string
  targetSiteId: string
}

export interface SkillUnpublishRequestBody {
  source: "aat.ee"
  idempotencyKey: string
  targetSiteId: string
  websiteUrl: string
}

type SkillPostJson = {
  id?: string | number
  url?: string | null
  sites?: Array<{ id?: string | number | null; url?: string | null }>
}

const TIMEOUT_MS = 20_000

export function buildSkillLaunchPayload(input: {
  title: string
  tagline: string
  bodyMd: string
  websiteUrl: string
}): SkillLaunchPayload {
  return {
    source: "aat.ee",
    name: input.title,
    tagline: input.tagline,
    description: input.bodyMd,
    websiteUrl: input.websiteUrl,
    rel: "nofollow",
    tier: "free-skill",
  }
}

export function skillSiteEndpoint(site: string): string | null {
  return process.env[`SKILL_PUBLISH_${envSite(site)}_URL`] ?? null
}

export function skillSiteUnpublishEndpoint(site: string): string | null {
  const explicit = process.env[`SKILL_PUBLISH_${envSite(site)}_UNPUBLISH_URL`]
  if (explicit) return explicit

  const launch = skillSiteEndpoint(site)
  if (!launch) return null
  return launch.replace(/\/launch\/?$/i, "/unpublish")
}

export function skillSiteApiKey(site: string): string | null {
  return (
    process.env[`SKILL_PUBLISH_${envSite(site)}_API_KEY`] ??
    process.env.SKILL_PUBLISH_API_KEY ??
    process.env.EXTERNAL_LAUNCH_API_KEY ??
    null
  )
}

export function skillSiteLaunchConfigError(site: string): string | null {
  if (!skillSiteEndpoint(site)) return `SKILL_PUBLISH_${envSite(site)}_URL not configured`
  if (!skillSiteApiKey(site)) {
    return `No API key for ${site} (set SKILL_PUBLISH_${envSite(site)}_API_KEY, SKILL_PUBLISH_API_KEY, or EXTERNAL_LAUNCH_API_KEY)`
  }
  return null
}

export function buildSkillLaunchRequestBody(
  site: string,
  idempotencyKey: string,
  payload: SkillLaunchPayload,
): SkillLaunchRequestBody {
  return {
    ...payload,
    idempotencyKey,
    targetSiteId: site,
  }
}

export function buildSkillUnpublishRequestBody(input: {
  site: string
  idempotencyKey: string
  websiteUrl: string
}): SkillUnpublishRequestBody {
  return {
    source: "aat.ee",
    idempotencyKey: input.idempotencyKey,
    targetSiteId: input.site,
    websiteUrl: input.websiteUrl,
  }
}

export function extractSkillPostExternalFields(json: SkillPostJson): {
  externalId?: string
  externalUrl?: string
} {
  const firstSite = Array.isArray(json.sites)
    ? json.sites.find((site) => site?.id != null || site?.url)
    : undefined

  return {
    externalId:
      json.id != null ? String(json.id) : firstSite?.id != null ? String(firstSite.id) : undefined,
    externalUrl: normalizeSkillExternalUrl(json.url ?? firstSite?.url ?? undefined),
  }
}

export function isSuccessfulSkillPostResponse(
  statusCode: number,
  json: SkillPostJson & { ok?: boolean },
  options: { requireExternalUrl?: boolean } = {},
): boolean {
  if (statusCode < 200 || statusCode >= 300) return false
  if (json.ok === false) return false

  const external = extractSkillPostExternalFields(json)
  if (options.requireExternalUrl) return Boolean(external.externalUrl)
  if (json.ok === true) return true
  return Boolean(external.externalUrl)
}

export async function postSkillLaunchToSite(
  site: string,
  idempotencyKey: string,
  payload: SkillLaunchPayload,
): Promise<SkillPostResult> {
  const configError = skillSiteLaunchConfigError(site)
  if (configError) return { ok: false, configError: true, error: configError }

  const url = skillSiteEndpoint(site)!
  return postSkillJson(site, url, buildSkillLaunchRequestBody(site, idempotencyKey, payload), {
    requireExternalUrl: true,
  })
}

export async function postSkillUnpublishToSite(
  site: string,
  idempotencyKey: string,
  websiteUrl: string,
): Promise<SkillPostResult> {
  const url = skillSiteUnpublishEndpoint(site)
  if (!url) {
    return {
      ok: false,
      configError: true,
      error: `SKILL_PUBLISH_${envSite(site)}_UNPUBLISH_URL not configured`,
    }
  }

  return postSkillJson(
    site,
    url,
    buildSkillUnpublishRequestBody({ site, idempotencyKey, websiteUrl }),
  )
}

async function postSkillJson(
  site: string,
  url: string,
  body: object,
  options: { requireExternalUrl?: boolean } = {},
): Promise<SkillPostResult> {
  const key = skillSiteApiKey(site)
  if (!key) {
    return {
      ok: false,
      configError: true,
      error: `No API key for ${site} (set SKILL_PUBLISH_${envSite(site)}_API_KEY, SKILL_PUBLISH_API_KEY, or EXTERNAL_LAUNCH_API_KEY)`,
    }
  }

  try {
    const deadline = Date.now() + TIMEOUT_MS
    const res = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
    })

    const statusCode = res.statusCode
    if (statusCode >= 300 && statusCode < 400) {
      const location = res.headers.location
      res.body.destroy()
      return {
        ok: false,
        statusCode,
        error: `HTTP ${statusCode} redirect${typeof location === "string" ? ` to ${location}` : ""}`,
      }
    }

    let json: SkillPostJson & { ok?: boolean; error?: string } = {}
    try {
      json = (await withTimeout(
        res.body.json(),
        Math.max(1, deadline - Date.now()),
        `skill publish ${site}`,
      )) as typeof json
    } catch (error) {
      res.body.destroy()
      if (error instanceof FetchTimeoutError) return { ok: false, error: error.message }
    }

    if (!isSuccessfulSkillPostResponse(statusCode, json, options)) {
      return {
        ok: false,
        statusCode,
        error: json?.error || `HTTP ${statusCode}`,
      }
    }

    const external = extractSkillPostExternalFields(json)
    return {
      ok: true,
      statusCode,
      ...external,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function envSite(site: string): string {
  return site.toUpperCase().replace(/[^A-Z0-9]+/g, "_")
}

function normalizeSkillExternalUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined

  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString()
  } catch {
    return undefined
  }
}
