import "server-only"

import { headers } from "next/headers"

import { db } from "@/drizzle/db"

import { logger } from "@/lib/observability/structured-logger"
import { checkRateLimit } from "@/lib/rate-limit"
import { getCurrentUserId } from "@/lib/server-auth"

import { CommunityError } from "./contracts"
import type { CommunityOperationTelemetry } from "./server-types"
import { createCommunityBackend } from "./service-core"

const REQUEST_ID_HEADER = "x-aat-request-id"

function communityLogContext(telemetry: CommunityOperationTelemetry) {
  return {
    operation: telemetry.operation,
    mode: telemetry.write ? "write" : "read",
    access: telemetry.admin ? "moderator" : "standard",
    outcome: telemetry.outcome,
  }
}

/** Resolve lazily: healthy requests do not spend time reading request context solely for logging. */
function currentCommunityRequestId(): () => Promise<string | null> {
  let requestId: Promise<string | null> | undefined
  return () => {
    try {
      requestId ??= headers()
        .then((requestHeaders) => requestHeaders.get(REQUEST_ID_HEADER))
        .catch(() => null)
      return requestId
    } catch {
      return Promise.resolve(null)
    }
  }
}

/** Runtime flag intentionally stays server-only and defaults to closed. */
export function isCommunityEnabled(): boolean {
  return process.env.COMMUNITY_ENABLED === "1"
}

/** No client may supply an actor or role. */
export function getCommunityServerService() {
  if (!isCommunityEnabled()) throw new CommunityError("missing", "Community is not available")
  const requestId = currentCommunityRequestId()
  return createCommunityBackend(db, {
    getActorId: getCurrentUserId,
    async checkWriteLimit(actorId, operation) {
      const limit = operation === "publish" ? 5 : operation === "report" ? 10 : 60
      const result = await checkRateLimit(
        `community:${operation}:${actorId}`,
        limit,
        10 * 60 * 1000,
        { onRedisError: "fail-closed" },
      )
      if (!result.success) throw new CommunityError("retryable", "Please wait before trying again")
    },
    async onError(_operation, error, telemetry) {
      logger.error("community_service_error", {
        requestId: await requestId(),
        route: "/community",
        status: "failed",
        durationMs: telemetry.durationMs,
        provider: "community",
        context: communityLogContext(telemetry),
        error,
      })
    },
    async onSlowOperation(telemetry) {
      logger.warn("community_operation_slow", {
        requestId: await requestId(),
        route: "/community",
        status: telemetry.outcome,
        durationMs: telemetry.durationMs,
        provider: "community",
        context: communityLogContext(telemetry),
      })
    },
  })
}
