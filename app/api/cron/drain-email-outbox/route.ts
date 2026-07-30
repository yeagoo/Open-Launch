import { NextRequest, NextResponse } from "next/server"

import { verifyCronAuth } from "@/lib/cron-auth"
import { cronStatusFromResult } from "@/lib/cron-status"
import { drainEmailOutbox } from "@/lib/email-outbox"
import { logger } from "@/lib/observability/structured-logger"

export const dynamic = "force-dynamic"

/**
 * Drains the durable email outbox. Runs every 10 minutes (registered in
 * migration 0052) so failed notification emails retry promptly instead of
 * waiting for the next daily sender run. Idempotent per event_key at both
 * the DB and the Resend Idempotency-Key layer, so overlapping drains and
 * sender-triggered inline drains are safe.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const requestId = request.headers.get("x-aat-request-id")
  const authError = verifyCronAuth(request)
  if (authError) return authError

  try {
    const result = await drainEmailOutbox()
    const status = cronStatusFromResult({
      errorCount: result.failed + result.deadLettered,
      successCount: result.sent,
    })
    const fields = {
      requestId,
      route: "/api/cron/drain-email-outbox",
      status,
      durationMs: Date.now() - startedAt,
      provider: "email",
      context: result,
    }
    if (status >= 500) logger.warn("email_outbox_drain", fields)
    else logger.info("email_outbox_drain", fields)
    return NextResponse.json(
      { ranAt: new Date().toISOString(), ...result },
      {
        // Dead-lettered rows (attempts exhausted) count as errors so cron
        // monitoring alerts — otherwise permanently-unsent notifications
        // would hide behind an empty-looking drain result.
        status,
      },
    )
  } catch (error) {
    logger.error("email_outbox_drain_failed", {
      requestId,
      route: "/api/cron/drain-email-outbox",
      status: 500,
      durationMs: Date.now() - startedAt,
      provider: "email",
      error,
    })
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
