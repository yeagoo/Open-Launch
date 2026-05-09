/**
 * Ahrefs Domain Rating client.
 *
 * Both providers wrap the same upstream Ahrefs API but differ in
 * request shape and response field names. We keep a tiny adapter per
 * provider and pick between them based on monthly quota: stop using
 * a provider once it crosses 80% usage. If both are saturated, the
 * caller falls back to the cached value.
 *
 * Single env var: X_RAPIDAPI_KEY (Underscored — `X-RapidAPI-Key` is
 * the header it gets sent as. RapidAPI uses one key across every
 * subscription on your account.)
 */

import { db } from "@/drizzle/db"
import { ahrefsProviderQuota } from "@/drizzle/db/schema"
import { and, eq, sql } from "drizzle-orm"

export type AhrefsProvider = "seodataset" | "apivantage"

// Order is the failover preference: try A first, fall back to B.
export const PROVIDER_ORDER: AhrefsProvider[] = ["seodataset", "apivantage"]

// Stop using a provider once monthly usage exceeds this fraction.
// Leaves headroom for the user's manual smoke checks + accidental
// double-runs.
const QUOTA_CEILING = 0.8

interface ProviderConfig {
  host: string
  // Builder for the fetch call. Returns Request init plus a parser
  // for the response body. The parser extracts DR + raw body, hiding
  // the per-provider response shape from the rest of the codebase.
  buildRequest: (domain: string) => {
    url: string
    init: RequestInit
  }
  parseResponse: (raw: unknown) => { dr: number | null; rawForLog: unknown }
}

const PROVIDERS: Record<AhrefsProvider, ProviderConfig> = {
  // https://rapidapi.com/seodataset/api/ahrefs-domain-research
  seodataset: {
    host: "ahrefs-domain-research.p.rapidapi.com",
    buildRequest: (domain) => ({
      // Endpoint name guessed from the API title; verified at runtime
      // by scripts/smoke-ahrefs.ts. If the endpoint path differs, fix
      // here and re-run the smoke test.
      url: `https://ahrefs-domain-research.p.rapidapi.com/domain-rating?target=${encodeURIComponent(domain)}`,
      init: { method: "GET" },
    }),
    parseResponse: (raw) => ({
      // Ahrefs's canonical DR field is `domain_rating`. Also accept a
      // few common aliases the wrapper might rename to.
      dr: pickDR(raw),
      rawForLog: raw,
    }),
  },

  // https://rapidapi.com/apivantage/api/ahrefs-x
  apivantage: {
    host: "ahrefs-x.p.rapidapi.com",
    buildRequest: (domain) => ({
      url: `https://ahrefs-x.p.rapidapi.com/domain-rating?target=${encodeURIComponent(domain)}`,
      init: { method: "GET" },
    }),
    parseResponse: (raw) => ({
      dr: pickDR(raw),
      rawForLog: raw,
    }),
  },
}

/**
 * Walk a few common shapes to find the DR number. Both providers
 * proxy Ahrefs but may rename / nest the field. If you see "raw
 * stored but dr=null" in cache, add the new path here.
 */
function pickDR(raw: unknown): number | null {
  if (raw == null) return null
  const candidates: unknown[] = []
  const r = raw as Record<string, unknown>
  candidates.push(r.domain_rating, r.dr, r.domainRating)
  if (typeof r.data === "object" && r.data) {
    const d = r.data as Record<string, unknown>
    candidates.push(d.domain_rating, d.dr, d.domainRating)
  }
  if (typeof r.result === "object" && r.result) {
    const x = r.result as Record<string, unknown>
    candidates.push(x.domain_rating, x.dr, x.domainRating)
  }
  for (const c of candidates) {
    if (typeof c === "number" && c >= 0 && c <= 100) return Math.round(c)
    if (typeof c === "string") {
      const n = Number(c)
      if (Number.isFinite(n) && n >= 0 && n <= 100) return Math.round(n)
    }
  }
  return null
}

export interface FetchDrResult {
  domain: string
  provider: AhrefsProvider | null
  dr: number | null
  httpStatus: number
  raw: unknown
  error?: string
}

/**
 * Fetch DR for a single domain, walking PROVIDER_ORDER and
 * skipping any provider that has crossed the 80% quota ceiling
 * for the current month. Returns whatever the first usable
 * provider gives us; falls through to the next on transport /
 * 5xx / quota.
 *
 * Records the call in `ahrefs_provider_quota` so the next call
 * sees the updated usage. Reading the actual remaining quota from
 * `x-ratelimit-requests-remaining` (when the provider returns it)
 * keeps the local counter in sync with reality even if the cron
 * crashed mid-run last time.
 */
export async function fetchDomainRating(domain: string): Promise<FetchDrResult> {
  // Accept either dash form (matches the literal RapidAPI header name)
  // or underscore form (matches typical 12-factor convention). Pick
  // whichever the user has set.
  const apiKey =
    process.env["X-RapidAPI-Key"] ?? process.env.X_RAPIDAPI_KEY ?? process.env.RAPIDAPI_KEY
  if (!apiKey) {
    return {
      domain,
      provider: null,
      dr: null,
      httpStatus: 0,
      raw: null,
      error: "X-RapidAPI-Key not set",
    }
  }

  const month = new Date().toISOString().slice(0, 7) // 'YYYY-MM' UTC
  let lastError: string | undefined

  for (const provider of PROVIDER_ORDER) {
    const usable = await canUseProvider(provider, month)
    if (!usable) {
      lastError = `${provider}: at quota ceiling`
      continue
    }

    const cfg = PROVIDERS[provider]
    const { url, init } = cfg.buildRequest(domain)
    const headers = new Headers(init.headers)
    headers.set("X-RapidAPI-Key", apiKey)
    headers.set("X-RapidAPI-Host", cfg.host)

    try {
      const response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(20_000),
      })

      // Sync local counter with whatever the response told us.
      const limit = numHeader(response.headers, "x-ratelimit-requests-limit")
      const remaining = numHeader(response.headers, "x-ratelimit-requests-remaining")
      const used = limit !== null && remaining !== null ? limit - remaining : null
      await bumpQuota(provider, month, { used, limit })

      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        // some error responses are plain text — keep going, dr will be null
      }

      if (!response.ok) {
        lastError = `${provider}: HTTP ${response.status}`
        continue
      }

      const { dr, rawForLog } = cfg.parseResponse(body)
      return { domain, provider, dr, httpStatus: response.status, raw: rawForLog }
    } catch (err) {
      lastError = `${provider}: ${err instanceof Error ? err.message : String(err)}`
      continue
    }
  }

  return {
    domain,
    provider: null,
    dr: null,
    httpStatus: 0,
    raw: null,
    error: lastError ?? "all providers failed",
  }
}

function numHeader(h: Headers, name: string): number | null {
  const v = h.get(name)
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function canUseProvider(provider: AhrefsProvider, month: string): Promise<boolean> {
  const [row] = await db
    .select({
      callsUsed: ahrefsProviderQuota.callsUsed,
      callsLimit: ahrefsProviderQuota.callsLimit,
    })
    .from(ahrefsProviderQuota)
    .where(and(eq(ahrefsProviderQuota.provider, provider), eq(ahrefsProviderQuota.month, month)))
    .limit(1)
  if (!row) return true
  if (!row.callsLimit) return true // limit unknown yet — let the call go through
  return row.callsUsed / row.callsLimit < QUOTA_CEILING
}

interface BumpInput {
  used: number | null
  limit: number | null
}

async function bumpQuota(
  provider: AhrefsProvider,
  month: string,
  { used, limit }: BumpInput,
): Promise<void> {
  // If the provider gave us authoritative numbers via headers, trust
  // them — they reflect their own counter and self-heal across crashes.
  // Otherwise just increment by 1.
  if (used !== null && limit !== null) {
    await db
      .insert(ahrefsProviderQuota)
      .values({ provider, month, callsUsed: used, callsLimit: limit, lastUpdated: new Date() })
      .onConflictDoUpdate({
        target: [ahrefsProviderQuota.provider, ahrefsProviderQuota.month],
        set: { callsUsed: used, callsLimit: limit, lastUpdated: new Date() },
      })
    return
  }

  await db
    .insert(ahrefsProviderQuota)
    .values({ provider, month, callsUsed: 1, lastUpdated: new Date() })
    .onConflictDoUpdate({
      target: [ahrefsProviderQuota.provider, ahrefsProviderQuota.month],
      set: {
        callsUsed: sql`${ahrefsProviderQuota.callsUsed} + 1`,
        lastUpdated: new Date(),
      },
    })
}
