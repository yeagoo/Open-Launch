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

export async function postSkillLaunchToSite(
  site: string,
  idempotencyKey: string,
  payload: SkillLaunchPayload,
): Promise<SkillPostResult> {
  const url = skillSiteEndpoint(site)
  if (!url) {
    return {
      ok: false,
      configError: true,
      error: `SKILL_PUBLISH_${envSite(site)}_URL not configured`,
    }
  }

  return postSkillJson(site, url, {
    ...payload,
    idempotencyKey,
  })
}

export async function postSkillUnpublishToSite(
  site: string,
  idempotencyKey: string,
): Promise<SkillPostResult> {
  const url = skillSiteUnpublishEndpoint(site)
  if (!url) {
    return {
      ok: false,
      configError: true,
      error: `SKILL_PUBLISH_${envSite(site)}_UNPUBLISH_URL not configured`,
    }
  }

  return postSkillJson(site, url, {
    source: "aat.ee",
    idempotencyKey,
  })
}

async function postSkillJson(
  site: string,
  url: string,
  body: Record<string, unknown>,
): Promise<SkillPostResult> {
  const key = skillSiteApiKey(site)
  if (!key) {
    return {
      ok: false,
      configError: true,
      error: `No API key for ${site} (set SKILL_PUBLISH_${envSite(site)}_API_KEY or SKILL_PUBLISH_API_KEY)`,
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

    let json: { ok?: boolean; id?: string | number; url?: string; error?: string } = {}
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

    const ok2xx = statusCode >= 200 && statusCode < 300
    if (!ok2xx || !json?.ok) {
      return {
        ok: false,
        statusCode,
        error: json?.error || `HTTP ${statusCode}`,
      }
    }

    return {
      ok: true,
      statusCode,
      externalId: json.id != null ? String(json.id) : undefined,
      externalUrl: json.url,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function envSite(site: string): string {
  return site.toUpperCase().replace(/[^A-Z0-9]+/g, "_")
}
