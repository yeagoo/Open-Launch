import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

export function verifyCronAuth(request: Request): NextResponse | null {
  const apiKey = process.env.CRON_API_KEY

  if (!apiKey) {
    console.error("CRON_API_KEY is not configured")
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization")
  // Strip the scheme prefix case-insensitively, anchored to the start, with
  // any whitespace — so "Bearer KEY", "bearer KEY", etc. all yield "KEY".
  const providedKey = authHeader?.replace(/^Bearer\s+/i, "") ?? ""

  // Constant-time comparison so response timing can't be used to
  // recover the key byte-by-byte. timingSafeEqual requires equal
  // lengths; the length check itself only leaks the key's length.
  const provided = Buffer.from(providedKey)
  const expected = Buffer.from(apiKey)
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
