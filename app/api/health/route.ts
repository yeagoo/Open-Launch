import { NextRequest, NextResponse } from "next/server"

import { db } from "@/drizzle/db"
import { sql } from "drizzle-orm"

import { verifyCronAuth } from "@/lib/cron-auth"
import { getSharedRedisClient } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

// Liveness: the process is up and serving. Used by the Docker HEALTHCHECK
// and any orchestrator probe. No deep dependency checks here — a slow DB
// must not get the container killed and restarted.
//
// Readiness: `?deep=1` additionally verifies Postgres + Redis. Requires
// CRON_API_KEY (same internal-auth convention as the cron endpoints)
// because each deep check costs real dependency round-trips and would
// otherwise be an anonymous amplification vector.
export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("deep") !== "1") {
    return NextResponse.json({ status: "ok", uptime: process.uptime() })
  }

  // Deep checks are internal-only: they cost real dependency round-trips
  // (anonymous amplification vector), and the secret must travel in the
  // Authorization header — a ?key= URL would leak it into proxy logs,
  // dashboards and shell history.
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const checks: Record<string, string> = {}
  try {
    await db.execute(sql`SELECT 1`)
    checks.postgres = "ok"
  } catch (err) {
    checks.postgres = `error: ${(err as Error).message}`
  }
  try {
    const pong = await getSharedRedisClient().ping()
    checks.redis = pong === "PONG" ? "ok" : `unexpected: ${pong}`
  } catch (err) {
    checks.redis = `error: ${(err as Error).message}`
  }

  const healthy = Object.values(checks).every((v) => v === "ok")
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", uptime: process.uptime(), checks },
    { status: healthy ? 200 : 503 },
  )
}
