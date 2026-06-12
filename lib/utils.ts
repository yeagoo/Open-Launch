import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse an IPv4 literal in any of the forms `inet_aton`/browsers accept
 * into dotted octets: dotted-decimal, a single 32-bit integer
 * (decimal / 0x-hex / 0-octal), or dotted parts that are themselves
 * hex/octal. Returns null if `host` isn't an IPv4 literal at all.
 *
 * This matters for SSRF: `http://2130706433/`, `http://0x7f.1/`, and
 * `http://0177.0.0.1/` all reach 127.0.0.1 but slip past a plain
 * dotted-decimal regex.
 */
function parseIpv4Octets(host: string): [number, number, number, number] | null {
  const parsePart = (s: string): number | null => {
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16)
    if (/^0[0-7]+$/.test(s)) return parseInt(s, 8)
    if (/^[0-9]+$/.test(s)) return parseInt(s, 10)
    return null
  }
  const parts = host.split(".")
  if (parts.length === 1) {
    const n = parsePart(parts[0])
    if (n === null || n < 0 || n > 0xffffffff) return null
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
  }
  if (parts.length === 4) {
    const nums = parts.map(parsePart)
    if (nums.some((n) => n === null || n < 0 || n > 255)) return null
    return nums as [number, number, number, number]
  }
  return null
}

/**
 * Returns true if the hostname resolves to a private/loopback/link-local address
 * that should never be fetched from a server-side context (SSRF prevention).
 *
 * Note: this is the literal-form gate only. Callers that actually fetch
 * (see `lib/safe-fetch.ts`) additionally resolve DNS and re-check every
 * resolved IP, which catches hostnames that point at private space.
 */
export function isPrivateHostname(hostname: string): boolean {
  // Strip IPv6 brackets and lowercase for consistent matching
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()

  // Localhost names
  if (host === "localhost" || host.endsWith(".localhost") || host === "0") return true

  // IPv6 loopback / unspecified / link-local / unique-local
  if (
    host === "::1" ||
    host === "::" ||
    host.startsWith("fe80:") ||
    host.startsWith("fc") ||
    host.startsWith("fd")
  ) {
    return true
  }

  // IPv4-mapped / -compatible IPv6: extract the embedded IPv4 and fall
  // through to the IPv4 check. Handles BOTH the dotted form
  // (::ffff:127.0.0.1, ::127.0.0.1) and the hex form (::ffff:7f00:1,
  // ::7f00:1) — the latter still reaches 127.0.0.1, so it must be caught.
  let candidate = host
  if (host.startsWith("::ffff:") || host.startsWith("::")) {
    if (host.includes(".")) {
      // dotted tail, e.g. ::ffff:127.0.0.1 -> 127.0.0.1
      candidate = host.slice(host.lastIndexOf(":") + 1)
    } else {
      // hex form: the last two colon-separated groups are the 32-bit IPv4,
      // e.g. ::ffff:7f00:1 -> 7f00:1 -> 127.0.0.1
      const groups = host.split(":").filter((g) => g.length > 0)
      const last = groups[groups.length - 1]
      const prev = groups[groups.length - 2]
      if (last && prev && /^[0-9a-f]{1,4}$/.test(last) && /^[0-9a-f]{1,4}$/.test(prev)) {
        const hi = parseInt(prev, 16)
        const lo = parseInt(last, 16)
        candidate = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
      }
    }
  }

  // IPv4 check (handles decimal / hex / octal / integer literal forms)
  const octets = parseIpv4Octets(candidate)
  if (octets) {
    const [a, b] = octets
    if (
      a === 127 || // 127.0.0.0/8 loopback
      a === 10 || // 10.0.0.0/8 private
      a === 0 || // 0.0.0.0/8 reserved
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
      (a === 192 && b === 168) || // 192.168.0.0/16 private
      (a === 169 && b === 254) || // 169.254.0.0/16 link-local (AWS metadata)
      (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 shared address space
    ) {
      return true
    }
  }

  return false
}
