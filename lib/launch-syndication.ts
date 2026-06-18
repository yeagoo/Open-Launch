import { db } from "@/drizzle/db"
import {
  category,
  launchSyndication,
  project,
  projectToCategory,
  projectTranslation,
} from "@/drizzle/db/schema"
import { and, eq } from "drizzle-orm"
import { NodeHtmlMarkdown } from "node-html-markdown"

// aat.ee stores project descriptions as sanitized HTML (Tiptap), but every
// partner site renders the body as Markdown/MDX (bigkr/mf8 via MDXRemote,
// hicyou via react-markdown without rehype-raw). Convert once here so the
// body renders correctly everywhere instead of leaking raw HTML tags (or, on
// MDX, throwing a compile error on attributes like class= / unclosed tags).
const nhm = new NodeHtmlMarkdown()

function htmlToMarkdown(html: string | null): string | null {
  if (!html) return null
  const trimmed = html.trim()
  if (!trimmed) return null
  try {
    return nhm.translate(trimmed).trim() || null
  } catch {
    // Never emit raw HTML to a markdown renderer — strip tags as a fallback.
    return (
      trimmed
        .replace(/<[^>]+>/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .trim() || null
    )
  }
}

// aat.ee platform values (web/mobile/desktop/api/other) → the partner sites'
// platform enum (Web/iOS/Android/Desktop/Browser Extension). Unmapped values
// (api/other) are dropped rather than silently collapsing everything to Web.
const PLATFORM_MAP: Record<string, string[]> = {
  web: ["Web"],
  mobile: ["iOS", "Android"],
  desktop: ["Desktop"],
}

function mapPlatforms(platforms: string[] | null): string[] | null {
  if (!platforms?.length) return null
  const out = new Set<string>()
  for (const p of platforms) {
    for (const mapped of PLATFORM_MAP[p.toLowerCase()] ?? []) out.add(mapped)
  }
  return out.size ? [...out] : null
}

/**
 * Cross-site launch syndication.
 *
 * After a Plus/Pro/Ultra directory order is paid on aat.ee, the listing is
 * cross-posted to partner sites. This module owns:
 *   - the partner-site registry + per-site config resolution,
 *   - enqueueing one `launch_syndication` row per site (idempotent),
 *   - building the JSON payload from a project,
 *   - POSTing it to a site's `/api/external/launch` endpoint.
 *
 * The slow HTTP work is driven by `/api/cron/syndicate-launches`, never
 * inline in the webhook — a partner-site outage must not fail the Stripe
 * webhook (Stripe would retry the whole event).
 */

// Partner syndication targets. bigkr / mf8 / hicyou are standalone partner
// sites (one endpoint each). `toolso` is a single GATEWAY in front of the
// toolso-ai-open network (mifar / qoo / fastd / xlayers / upperstory / xemvip
// / skachat / nexablocks / blackhawkgames / …): aat.ee posts once and the
// gateway fans out to its own sites and returns each result, so adding toolso
// domains needs no change here. `site` keys are stored on launch_syndication.site.
export const SYNDICATION_SITES = ["bigkr", "mf8", "hicyou", "toolso"] as const
export type SyndicationSite = (typeof SYNDICATION_SITES)[number]

// Only these tiers cross-post. Basic stays on aat.ee only. Plus posts to the
// toolso gateway only (it publishes to PLUS_MAX_SITES of its own sites);
// Pro / Ultra / Ultra Plus post to every target (the standalone sites + the
// full toolso network).
export const SYNDICATED_TIERS: ReadonlySet<string> = new Set(["plus", "pro", "ultra", "ultraPlus"])

// How many sites the toolso gateway publishes a Plus order to. Sent as
// `maxSites`; the gateway randomly selects that many of its own sites.
const PLUS_MAX_SITES = 5

// Full /api/external/launch endpoint URL per target.
const SITE_URL_ENV: Record<SyndicationSite, string> = {
  bigkr: "SYNDICATION_BIGKR_URL",
  mf8: "SYNDICATION_MF8_URL",
  hicyou: "SYNDICATION_HICYOU_URL",
  toolso: "SYNDICATION_TOOLSO_URL",
}

// Per-target bearer key. Falls back to the shared EXTERNAL_LAUNCH_API_KEY so
// ops can run a single shared secret across all sites, or rotate per-target.
const SITE_KEY_ENV: Record<SyndicationSite, string> = {
  bigkr: "SYNDICATION_BIGKR_API_KEY",
  mf8: "SYNDICATION_MF8_API_KEY",
  hicyou: "SYNDICATION_HICYOU_API_KEY",
  toolso: "SYNDICATION_TOOLSO_API_KEY",
}

export function siteEndpoint(site: SyndicationSite): string | null {
  return process.env[SITE_URL_ENV[site]] ?? null
}

export function siteApiKey(site: SyndicationSite): string | null {
  return process.env[SITE_KEY_ENV[site]] ?? process.env.EXTERNAL_LAUNCH_API_KEY ?? null
}

export interface LaunchPayload {
  source: "aat.ee"
  name: string
  tagline: string | null
  description: string | null
  websiteUrl: string
  logoUrl: string | null
  coverImageUrl: string | null
  images: string[]
  pricing: string | null
  platforms: string[] | null
  githubUrl: string | null
  twitterUrl: string | null
  categoryName: string | null
  tier: string
}

/**
 * Enqueue one syndication row per partner site for a paid order. Idempotent:
 * the (order_id, site) unique index means repeat calls (Stripe retries,
 * async_payment_succeeded) add nothing. No-op for non-syndicated tiers.
 */
export async function enqueueLaunchSyndication(
  orderId: string,
  projectId: string,
  tier: string,
): Promise<void> {
  if (!SYNDICATED_TIERS.has(tier)) return

  // Plus only hits the toolso gateway (which publishes to PLUS_MAX_SITES of
  // its own sites); every other syndicated tier hits every target.
  const sites: SyndicationSite[] = tier === "plus" ? ["toolso"] : [...SYNDICATION_SITES]

  await db
    .insert(launchSyndication)
    .values(
      sites.map((site) => ({
        orderId,
        projectId,
        site,
        tier,
      })),
    )
    .onConflictDoNothing()
}

/**
 * Build the launch payload from a project row (+ source-locale tagline and
 * first category). Returns null if the project no longer exists.
 */
export async function buildLaunchPayload(
  projectId: string,
  tier: string,
): Promise<LaunchPayload | null> {
  const [proj] = await db
    .select({
      name: project.name,
      description: project.description,
      websiteUrl: project.websiteUrl,
      logoUrl: project.logoUrl,
      coverImageUrl: project.coverImageUrl,
      productImage: project.productImage,
      githubUrl: project.githubUrl,
      twitterUrl: project.twitterUrl,
      pricing: project.pricing,
      platforms: project.platforms,
    })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1)

  if (!proj) return null

  // Tagline lives on the source-locale translation row.
  const [tr] = await db
    .select({ tagline: projectTranslation.tagline })
    .from(projectTranslation)
    .where(and(eq(projectTranslation.projectId, projectId), eq(projectTranslation.isSource, true)))
    .limit(1)

  // First associated category (a hint — partner sites map it to their own).
  const [cat] = await db
    .select({ name: category.name })
    .from(projectToCategory)
    .innerJoin(category, eq(projectToCategory.categoryId, category.id))
    .where(eq(projectToCategory.projectId, projectId))
    .limit(1)

  const images = [proj.productImage].filter((u): u is string => Boolean(u))

  return {
    source: "aat.ee",
    name: proj.name,
    tagline: tr?.tagline ?? null,
    description: htmlToMarkdown(proj.description),
    websiteUrl: proj.websiteUrl,
    logoUrl: proj.logoUrl,
    coverImageUrl: proj.coverImageUrl,
    images,
    pricing: proj.pricing,
    platforms: mapPlatforms(proj.platforms ?? null),
    githubUrl: proj.githubUrl,
    twitterUrl: proj.twitterUrl,
    categoryName: cat?.name ?? null,
    tier,
  }
}

export interface PostResult {
  ok: boolean
  statusCode?: number
  externalId?: string
  externalUrl?: string
  error?: string
  // True when the failure is a LOCAL misconfiguration (endpoint/key not set)
  // rather than a partner-side error — the worker must not burn a retry on it.
  configError?: boolean
}

/**
 * POST a payload to one partner site's external-launch endpoint. The
 * orderId is sent as the idempotency key so the partner side can dedupe too.
 */
export async function postLaunchToSite(
  site: SyndicationSite,
  orderId: string,
  payload: LaunchPayload,
): Promise<PostResult> {
  const url = siteEndpoint(site)
  if (!url) return { ok: false, configError: true, error: `${SITE_URL_ENV[site]} not configured` }
  const key = siteApiKey(site)
  if (!key) {
    return {
      ok: false,
      configError: true,
      error: `No API key for ${site} (set ${SITE_KEY_ENV[site]} or EXTERNAL_LAUNCH_API_KEY)`,
    }
  }

  // The toolso gateway fans out to its own network and derives the site count
  // from the tier; we pass maxSites for Plus to pin it to PLUS_MAX_SITES.
  const body =
    site === "toolso"
      ? {
          ...payload,
          idempotencyKey: orderId,
          maxSites: payload.tier === "plus" ? PLUS_MAX_SITES : undefined,
        }
      : { ...payload, idempotencyKey: orderId }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })

    let json: {
      ok?: boolean
      id?: string | number
      url?: string
      error?: string
      count?: number
      sites?: Array<{ site?: string; id?: string | number; url?: string }>
    } = {}
    try {
      json = await res.json()
    } catch {
      // non-JSON body — fall through to the !res.ok handling
    }

    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        statusCode: res.status,
        error: json?.error || `HTTP ${res.status}`,
      }
    }

    // The toolso gateway returns a multi-site result; collapse it to a single
    // tracking record (site count + the first published URL). Standalone sites
    // return one { id, url }.
    if (site === "toolso") {
      const published = json.sites ?? []
      return {
        ok: true,
        statusCode: res.status,
        externalId: `toolso:${json.count ?? published.length} sites`,
        externalUrl: published[0]?.url,
      }
    }

    return {
      ok: true,
      statusCode: res.status,
      externalId: json.id != null ? String(json.id) : undefined,
      externalUrl: json.url,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
