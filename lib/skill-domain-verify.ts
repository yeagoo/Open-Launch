import dns from "node:dns/promises"

import { withTimeout } from "@/lib/fetch-timeout"
import { closeSafeFetchResponse, safeFetch, SafeFetchError } from "@/lib/safe-fetch"
import { buildSkillDomainMethods, type SkillDomainMethod } from "@/lib/skill-domains"

interface SkillDomainProof {
  domain: string
  method: string
  token: string
}

export interface SkillDomainVerifyResult {
  verified: boolean
  reason?: string
}

const VERIFY_USER_AGENT = "aat.ee Skill Domain Verifier/1.0"
const VERIFY_TIMEOUT_MS = 10_000
const HTML_FILE_MAX_BYTES = 4 * 1024
const META_HEAD_MAX_BYTES = 256 * 1024

export async function verifySkillDomainProof(
  proof: SkillDomainProof,
): Promise<SkillDomainVerifyResult> {
  if (!isSkillDomainMethod(proof.method)) {
    return { verified: false, reason: "Unsupported verification method" }
  }

  if (proof.method === "html") return verifyHtmlFile(proof.domain, proof.token)
  if (proof.method === "dns") return verifyDnsTxt(proof.domain, proof.token)
  return verifyMetaTag(proof.domain, proof.token)
}

function isSkillDomainMethod(method: string): method is SkillDomainMethod {
  return method === "html" || method === "dns" || method === "meta"
}

async function verifyHtmlFile(domain: string, token: string): Promise<SkillDomainVerifyResult> {
  const methods = buildSkillDomainMethods(domain, token)
  const result = await fetchFirstText(
    [`https://${domain}${methods.html.path}`, `http://${domain}${methods.html.path}`],
    { expectedHostname: domain, maxBytes: HTML_FILE_MAX_BYTES },
  )
  if (!result.ok) return { verified: false, reason: result.reason }

  if (result.text.trim() !== token) {
    return { verified: false, reason: "HTML verification file did not match token" }
  }

  return { verified: true }
}

async function verifyDnsTxt(domain: string, token: string): Promise<SkillDomainVerifyResult> {
  const methods = buildSkillDomainMethods(domain, token)
  try {
    const records = await withTimeout(
      dns.resolveTxt(methods.dns.name),
      VERIFY_TIMEOUT_MS,
      "DNS TXT verification",
    )
    const values = records.map((record) => record.join(""))
    if (!values.includes(token)) {
      return { verified: false, reason: "DNS TXT record did not match token" }
    }
    return { verified: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : "DNS TXT lookup failed"
    return { verified: false, reason: message }
  }
}

async function verifyMetaTag(domain: string, token: string): Promise<SkillDomainVerifyResult> {
  const result = await fetchFirstText([`https://${domain}/`, `http://${domain}/`], {
    expectedHostname: domain,
    maxBytes: META_HEAD_MAX_BYTES,
    stopAfterHead: true,
  })
  if (result.ok) {
    if (extractAatVerifyMetaContent(result.text) === token) {
      return { verified: true }
    }
    return { verified: false, reason: "Meta verification tag did not match token" }
  }

  return {
    verified: false,
    reason: result.reason,
  }
}

type TextFetchResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; terminal?: boolean }

interface FetchFirstTextOptions {
  expectedHostname: string
  maxBytes: number
  stopAfterHead?: boolean
}

async function fetchFirstText(
  urls: string[],
  options: FetchFirstTextOptions,
): Promise<TextFetchResult> {
  let lastReason = "Verification URL could not be fetched"

  for (const url of urls) {
    const deadline = Date.now() + VERIFY_TIMEOUT_MS
    try {
      const response = await safeFetch(url, {
        headers: { "User-Agent": VERIFY_USER_AGENT },
        timeoutMs: VERIFY_TIMEOUT_MS,
      })

      try {
        if (!responseHostMatches(response, options.expectedHostname)) {
          return {
            ok: false,
            reason: "Verification URL redirected to a different host",
            terminal: true,
          }
        }

        if (!response.ok) {
          lastReason = `Verification URL returned HTTP ${response.status}`
          continue
        }

        return {
          ok: true,
          text: await readBoundedResponseText(response, deadline, options.maxBytes, {
            stopAfterHead: options.stopAfterHead ?? false,
          }),
        }
      } finally {
        closeSafeFetchResponse(response)
      }
    } catch (error) {
      if (error instanceof SafeFetchError) {
        if (
          error.code === "private_host" ||
          error.code === "private_resolved_ip" ||
          error.code === "protocol" ||
          error.code === "invalid_redirect" ||
          error.code === "too_many_redirects"
        ) {
          return { ok: false, reason: error.message, terminal: true }
        }
      }

      lastReason = error instanceof Error ? error.message : lastReason
    }
  }

  return { ok: false, reason: lastReason }
}

function responseHostMatches(response: Response, expectedHostname: string): boolean {
  try {
    const finalUrl = new URL(response.url)
    return normalizeHostname(finalUrl.hostname) === normalizeHostname(expectedHostname)
  } catch {
    return false
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/\.$/, "").toLowerCase()
}

async function readBoundedResponseText(
  response: Response,
  deadline: number,
  maxBytes: number,
  options: { stopAfterHead: boolean },
): Promise<string> {
  const contentLength = response.headers.get("content-length")
  if (contentLength && !options.stopAfterHead) {
    const declaredBytes = Number(contentLength)
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new Error(`Verification response exceeded ${maxBytes} bytes`)
    }
  }

  if (!response.body) return ""

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""

  try {
    while (true) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw new Error("Verification response body timed out")
      }

      const chunk = await withTimeout(reader.read(), remaining, "verification response body")
      if (chunk.done) break

      bytes += chunk.value.byteLength
      text += decoder.decode(chunk.value, { stream: true })

      const headClose = options.stopAfterHead ? text.match(/<\/head\s*>/i) : null
      if (headClose?.index !== undefined) {
        const headEnd = headClose.index + headClose[0].length
        const headText = text.slice(0, headEnd)
        if (new TextEncoder().encode(headText).byteLength > maxBytes) {
          throw new Error(`Verification response exceeded ${maxBytes} bytes`)
        }
        text = headText
        text += decoder.decode()
        return text
      }

      if (bytes > maxBytes) {
        throw new Error(`Verification response exceeded ${maxBytes} bytes`)
      }
    }

    text += decoder.decode()
    return text
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // A timed-out read may still be pending. Do not cancel it: cancelling
      // fetch-backed web streams is the production SSR crash trigger.
    }
  }
}

export function extractAatVerifyMetaContent(html: string): string | null {
  const head = extractHtmlHead(html)
  if (!head) return null

  const metaTags = head.match(/<meta\b[^>]*>/gi) ?? []

  for (const tag of metaTags) {
    const name = getHtmlAttribute(tag, "name")
    if (name?.toLowerCase() !== "aat-verify") continue

    const content = getHtmlAttribute(tag, "content")
    if (content) return decodeHtmlAttribute(content)
  }

  return null
}

function extractHtmlHead(html: string): string | null {
  const bodyMatch = html.match(/<body\b/i)
  const headOpen = html.match(/<head\b[^>]*>/i)
  if (!headOpen || headOpen.index === undefined) return null
  if (bodyMatch?.index !== undefined && headOpen.index > bodyMatch.index) return null

  const contentStart = headOpen.index + headOpen[0].length
  const rest = html.slice(contentStart)
  const headClose = rest.match(/<\/head\s*>/i)
  if (!headClose || headClose.index === undefined) return null
  if (bodyMatch?.index !== undefined && contentStart + headClose.index > bodyMatch.index) {
    return null
  }

  return rest.slice(0, headClose.index)
}

function getHtmlAttribute(tag: string, attr: string): string | null {
  const match = tag.match(new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"))
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/gi, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, "&")
}
