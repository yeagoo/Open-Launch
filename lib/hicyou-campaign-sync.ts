import { db } from "@/drizzle/db"
import { directoryOrder, hicyouCampaignSync, launchSyndication, project } from "@/drizzle/db/schema"
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { request } from "undici"

import { FetchTimeoutError, withTimeout } from "./fetch-timeout"
import {
  siteApiKey,
  siteApiKeyEnvironmentName,
  siteEndpoint,
  siteEndpointEnvironmentName,
  SYNDICATED_TIERS,
} from "./launch-syndication-policy"

const HICYOU_CAMPAIGN_SYNC_PATH = "/api/external/campaigns/sync"
const SYNC_BATCH = 8
const RECONCILE_BATCH = 32
const STALE_CLAIM_MINUTES = 10
const TIMEOUT_MS = 10_000
const SYNCABLE_ORDER_STATUSES = ["paid", "fulfilled", "canceled"] as const
const SYNDICATED_TIER_LIST = [...SYNDICATED_TIERS]

type SyncableOrderStatus = (typeof SYNCABLE_ORDER_STATUSES)[number]

export interface HicyouCampaignSnapshot {
  source: "aat.ee"
  campaign: {
    id: string
    tier: string
    orderStatus: SyncableOrderStatus
    title: string | null
    websiteUrl: string | null
    snapshotAt: string
    placements: Array<{
      id: string
      targetSiteId: string
      status: "pending" | "sending" | "sent" | "failed" | "orphaned"
      attempts: number
      externalListingId: string | null
      externalUrl: string | null
      externalUrls: string[]
      lastError: string | null
      sentAt: string | null
      updatedAt: string
    }>
  }
}

export type HicyouCampaignSyncConfig =
  { ok: true; url: string; apiKey: string } | { ok: false; error: string }

/**
 * Reuses the already-reviewed Hicyou launch endpoint and key. The route is
 * derived only after validating that the configured URL is the exact,
 * credential-free HTTPS launch endpoint, so this sync cannot be redirected to
 * an arbitrary host by a malformed environment value.
 */
export function resolveHicyouCampaignSyncConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): HicyouCampaignSyncConfig {
  const launchEndpoint = siteEndpoint("hicyou", environment)
  if (!launchEndpoint) {
    return {
      ok: false,
      error: `${siteEndpointEnvironmentName("hicyou")} not configured`,
    }
  }

  const apiKey = siteApiKey("hicyou", environment)
  if (!apiKey) {
    return {
      ok: false,
      error: `No API key for hicyou (set ${siteApiKeyEnvironmentName("hicyou")} or EXTERNAL_LAUNCH_API_KEY)`,
    }
  }

  try {
    const url = new URL(launchEndpoint)
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/api/external/launch" ||
      url.search ||
      url.hash
    ) {
      return {
        ok: false,
        error: `${siteEndpointEnvironmentName("hicyou")} must be a credential-free HTTPS /api/external/launch URL`,
      }
    }
    url.pathname = HICYOU_CAMPAIGN_SYNC_PATH
    return { ok: true, url: url.toString(), apiKey }
  } catch {
    return {
      ok: false,
      error: `${siteEndpointEnvironmentName("hicyou")} is not a valid URL`,
    }
  }
}

function isSyncableOrderStatus(value: string): value is SyncableOrderStatus {
  return (SYNCABLE_ORDER_STATUSES as readonly string[]).includes(value)
}

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error("Source timestamp is invalid")
  return date
}

function limitedText(value: string | null | undefined, maxLength: number): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

function safeExternalUrls(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => safeHttpUrl(item))
      .filter((item): item is string => item !== null)
      .slice(0, 50)
  } catch {
    return []
  }
}

function backoffAfterAttempt(attempts: number): Date {
  const minutes = Math.min(2 ** Math.min(attempts, 8), 120)
  return new Date(Date.now() + minutes * 60_000)
}

function errorText(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error)
  return value.slice(0, 2_000)
}

/**
 * Finds Campaigns whose aat.ee order or placement state is newer than the
 * retained outbox source version. This reconciliation is intentional: a
 * crash after a payment write, cancellation, or queue update cannot silently
 * lose a Hicyou dashboard update.
 */
export async function enqueueChangedHicyouCampaignSyncs(): Promise<number> {
  const latestSourceUpdatedAt = sql<Date>`greatest(
    ${directoryOrder.updatedAt},
    coalesce(max(${launchSyndication.updatedAt}), ${directoryOrder.updatedAt})
  )`
  const candidates = await db
    .select({
      orderId: directoryOrder.id,
      sourceUpdatedAt: latestSourceUpdatedAt,
    })
    .from(directoryOrder)
    .leftJoin(launchSyndication, eq(launchSyndication.orderId, directoryOrder.id))
    .leftJoin(hicyouCampaignSync, eq(hicyouCampaignSync.orderId, directoryOrder.id))
    .where(
      and(
        inArray(directoryOrder.tier, SYNDICATED_TIER_LIST),
        inArray(directoryOrder.status, SYNCABLE_ORDER_STATUSES),
      ),
    )
    .groupBy(
      directoryOrder.id,
      directoryOrder.updatedAt,
      hicyouCampaignSync.orderId,
      hicyouCampaignSync.sourceUpdatedAt,
    )
    .having(
      or(
        isNull(hicyouCampaignSync.orderId),
        lt(hicyouCampaignSync.sourceUpdatedAt, latestSourceUpdatedAt),
      ),
    )
    .orderBy(desc(latestSourceUpdatedAt))
    .limit(RECONCILE_BATCH)

  if (candidates.length === 0) return 0

  const now = new Date()
  await Promise.all(
    candidates.map(async (candidate) => {
      const sourceUpdatedAt = asDate(candidate.sourceUpdatedAt)
      await db
        .insert(hicyouCampaignSync)
        .values({
          orderId: candidate.orderId,
          sourceUpdatedAt,
          status: "pending",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: hicyouCampaignSync.orderId,
          set: {
            sourceUpdatedAt,
            version: sql`${hicyouCampaignSync.version} + 1`,
            status: "pending",
            attempts: 0,
            lastError: null,
            nextAttemptAt: null,
            updatedAt: now,
          },
          // A concurrent worker may already have observed a newer source
          // timestamp. Do not reset its newer outbox record backward.
          where: lt(hicyouCampaignSync.sourceUpdatedAt, sourceUpdatedAt),
        })
    }),
  )

  return candidates.length
}

export async function buildHicyouCampaignSnapshot(
  orderId: string,
): Promise<HicyouCampaignSnapshot | null> {
  const [order] = await db
    .select({
      id: directoryOrder.id,
      tier: directoryOrder.tier,
      status: directoryOrder.status,
      projectTitle: project.name,
      websiteUrl: project.websiteUrl,
    })
    .from(directoryOrder)
    .leftJoin(project, eq(project.id, directoryOrder.projectId))
    .where(eq(directoryOrder.id, orderId))
    .limit(1)

  if (!order || !isSyncableOrderStatus(order.status)) return null

  const placements = await db
    .select({
      id: launchSyndication.id,
      site: launchSyndication.site,
      status: launchSyndication.status,
      attempts: launchSyndication.attempts,
      externalId: launchSyndication.externalId,
      externalUrl: launchSyndication.externalUrl,
      externalUrls: launchSyndication.externalUrls,
      lastError: launchSyndication.lastError,
      sentAt: launchSyndication.sentAt,
      updatedAt: launchSyndication.updatedAt,
    })
    .from(launchSyndication)
    .where(eq(launchSyndication.orderId, orderId))
    .orderBy(launchSyndication.site)

  return {
    source: "aat.ee",
    campaign: {
      id: order.id,
      tier: limitedText(order.tier, 64) ?? "unknown",
      orderStatus: order.status,
      title: limitedText(order.projectTitle, 500),
      websiteUrl: safeHttpUrl(order.websiteUrl),
      snapshotAt: new Date().toISOString(),
      placements: placements.map((placement) => ({
        id: placement.id,
        targetSiteId: limitedText(placement.site, 100) ?? "unknown",
        status:
          placement.status as HicyouCampaignSnapshot["campaign"]["placements"][number]["status"],
        attempts: Math.max(0, placement.attempts),
        externalListingId: limitedText(placement.externalId, 500),
        externalUrl: safeHttpUrl(placement.externalUrl),
        externalUrls: safeExternalUrls(placement.externalUrls),
        lastError: limitedText(placement.lastError, 2_000),
        sentAt: placement.sentAt ? asDate(placement.sentAt).toISOString() : null,
        updatedAt: asDate(placement.updatedAt).toISOString(),
      })),
    },
  }
}

async function postHicyouCampaignSnapshot(
  snapshot: HicyouCampaignSnapshot,
): Promise<{ ok: boolean; configError?: boolean; error?: string }> {
  const config = resolveHicyouCampaignSyncConfig()
  if (!config.ok) return { ok: false, configError: true, error: config.error }

  try {
    const deadline = Date.now() + TIMEOUT_MS
    const response = await request(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(snapshot),
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
    })

    if (response.statusCode >= 300 && response.statusCode < 400) {
      response.body.destroy()
      return {
        ok: false,
        error: `HTTP ${response.statusCode} redirect — ${siteEndpointEnvironmentName("hicyou")} must point to the final host`,
      }
    }

    let body: { ok?: boolean; error?: string } = {}
    try {
      body = (await withTimeout(
        response.body.json(),
        Math.max(1, deadline - Date.now()),
        "Hicyou Campaign sync",
      )) as typeof body
    } catch (error) {
      response.body.destroy()
      if (error instanceof FetchTimeoutError) {
        return { ok: false, error: error.message }
      }
    }

    const successful = response.statusCode >= 200 && response.statusCode < 300 && body.ok
    return successful
      ? { ok: true }
      : { ok: false, error: limitedText(body.error, 2_000) ?? `HTTP ${response.statusCode}` }
  } catch (error) {
    return { ok: false, error: errorText(error) }
  }
}

type ClaimedCampaignSync = {
  orderId: string
  version: number
  attempts: number
}

async function processClaimedCampaignSync(
  claim: ClaimedCampaignSync,
  now: Date,
): Promise<"sent" | "failed" | "deferred"> {
  try {
    const snapshot = await buildHicyouCampaignSnapshot(claim.orderId)
    if (!snapshot) {
      await db
        .update(hicyouCampaignSync)
        .set({
          status: "failed",
          attempts: claim.attempts + 1,
          lastError: "Campaign source order is unavailable for synchronization",
          nextAttemptAt: backoffAfterAttempt(claim.attempts + 1),
          updatedAt: now,
        })
        .where(
          and(
            eq(hicyouCampaignSync.orderId, claim.orderId),
            eq(hicyouCampaignSync.version, claim.version),
            eq(hicyouCampaignSync.status, "sending"),
          ),
        )
      return "failed"
    }

    const result = await postHicyouCampaignSnapshot(snapshot)
    if (result.ok) {
      await db
        .update(hicyouCampaignSync)
        .set({
          status: "sent",
          attempts: 0,
          lastError: null,
          nextAttemptAt: null,
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(hicyouCampaignSync.orderId, claim.orderId),
            eq(hicyouCampaignSync.version, claim.version),
            eq(hicyouCampaignSync.status, "sending"),
          ),
        )
      return "sent"
    }

    if (result.configError) {
      await db
        .update(hicyouCampaignSync)
        .set({
          status: "pending",
          lastError: result.error ?? "Hicyou Campaign sync is not configured",
          nextAttemptAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(hicyouCampaignSync.orderId, claim.orderId),
            eq(hicyouCampaignSync.version, claim.version),
            eq(hicyouCampaignSync.status, "sending"),
          ),
        )
      return "deferred"
    }

    const attempts = claim.attempts + 1
    await db
      .update(hicyouCampaignSync)
      .set({
        status: "failed",
        attempts,
        lastError: result.error ?? "Hicyou Campaign sync failed",
        nextAttemptAt: backoffAfterAttempt(attempts),
        updatedAt: now,
      })
      .where(
        and(
          eq(hicyouCampaignSync.orderId, claim.orderId),
          eq(hicyouCampaignSync.version, claim.version),
          eq(hicyouCampaignSync.status, "sending"),
        ),
      )
    return "failed"
  } catch (error) {
    const attempts = claim.attempts + 1
    await db
      .update(hicyouCampaignSync)
      .set({
        status: "failed",
        attempts,
        lastError: errorText(error),
        nextAttemptAt: backoffAfterAttempt(attempts),
        updatedAt: now,
      })
      .where(
        and(
          eq(hicyouCampaignSync.orderId, claim.orderId),
          eq(hicyouCampaignSync.version, claim.version),
          eq(hicyouCampaignSync.status, "sending"),
        ),
      )
    return "failed"
  }
}

/**
 * Drains the durable snapshot outbox. This runs after the primary launch
 * queue, never inside Stripe's webhook, and is independently retryable: a
 * temporary Hicyou outage cannot alter paid-order delivery or fulfilment.
 */
export async function drainHicyouCampaignSyncs(): Promise<{
  sent: number
  failed: number
  deferred: number
}> {
  const now = new Date()

  await db
    .update(hicyouCampaignSync)
    .set({ status: "pending", updatedAt: now })
    .where(
      and(
        eq(hicyouCampaignSync.status, "sending"),
        lt(hicyouCampaignSync.updatedAt, new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000)),
      ),
    )

  const due = await db
    .select({
      orderId: hicyouCampaignSync.orderId,
      version: hicyouCampaignSync.version,
      attempts: hicyouCampaignSync.attempts,
    })
    .from(hicyouCampaignSync)
    .where(
      or(
        eq(hicyouCampaignSync.status, "pending"),
        and(
          eq(hicyouCampaignSync.status, "failed"),
          or(isNull(hicyouCampaignSync.nextAttemptAt), lte(hicyouCampaignSync.nextAttemptAt, now)),
        ),
      ),
    )
    .orderBy(hicyouCampaignSync.nextAttemptAt, hicyouCampaignSync.updatedAt)
    .limit(SYNC_BATCH)

  const claimed = (
    await Promise.all(
      due.map(async (row) => {
        const [claim] = await db
          .update(hicyouCampaignSync)
          .set({ status: "sending", updatedAt: now })
          .where(
            and(
              eq(hicyouCampaignSync.orderId, row.orderId),
              eq(hicyouCampaignSync.version, row.version),
              or(
                eq(hicyouCampaignSync.status, "pending"),
                and(
                  eq(hicyouCampaignSync.status, "failed"),
                  or(
                    isNull(hicyouCampaignSync.nextAttemptAt),
                    lte(hicyouCampaignSync.nextAttemptAt, now),
                  ),
                ),
              ),
            ),
          )
          .returning({
            orderId: hicyouCampaignSync.orderId,
            version: hicyouCampaignSync.version,
            attempts: hicyouCampaignSync.attempts,
          })
        return claim ?? null
      }),
    )
  ).filter((claim): claim is ClaimedCampaignSync => claim !== null)

  const outcomes = await Promise.all(claimed.map((claim) => processClaimedCampaignSync(claim, now)))

  return {
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    deferred: outcomes.filter((outcome) => outcome === "deferred").length,
  }
}
