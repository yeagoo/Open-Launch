import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns true if the hostname resolves to a private/loopback/link-local address
 * that should never be fetched from a server-side context (SSRF prevention).
 */
export function isPrivateHostname(hostname: string): boolean {
  // Strip IPv6 brackets
  const host = hostname.replace(/^\[|\]$/g, "")

  // Localhost names
  if (host === "localhost" || host.endsWith(".localhost") || host === "0") return true

  // IPv6 loopback / link-local / unique-local
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd"))
    return true

  // IPv4 check
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [, a, b] = ipv4.map(Number)
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
