import { NextResponse } from "next/server"

export function verifyCronAuth(request: Request): NextResponse | null {
  const apiKey = process.env.CRON_API_KEY

  if (!apiKey) {
    console.error("CRON_API_KEY is not configured")
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization")
  const providedKey = authHeader?.replace("Bearer ", "")

  if (providedKey !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}
