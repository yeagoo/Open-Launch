/**
 * Best-effort client IP for rate limiting / abuse controls.
 *
 * Production traffic reaches the service through Cloudflare, which
 * OVERWRITES `cf-connecting-ip` with the real connecting IP — that header
 * is trustworthy. `x-forwarded-for` is NOT: CF preserves whatever XFF the
 * client sent and appends the real IP, so the leftmost hop (the classic
 * `split(",")[0]`) is attacker-controlled and can be rotated to defeat
 * per-IP buckets. When CF is present we therefore take the RIGHTMOST XFF
 * hop (the one CF appended) as the fallback signal.
 *
 * Direct-to-origin requests can still spoof everything — the fix for that
 * is firewalling the origin to CF IPs only, which is an infra concern.
 */
export function getClientIp(headers: Headers): string {
  const cfConnectingIp = headers.get("cf-connecting-ip")?.trim()
  if (cfConnectingIp) return cfConnectingIp

  const forwardedFor = headers.get("x-forwarded-for")
  if (forwardedFor) {
    const hops = forwardedFor
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }

  return "unknown"
}
