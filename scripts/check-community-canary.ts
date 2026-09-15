#!/usr/bin/env bun
import { performance } from "node:perf_hooks"

import {
  communityCanaryCookieValue,
  evaluateCommunityCanaryBudget,
  hasCommunityCanaryCookie,
  parseCommunityCanaryArguments,
  resolveCommunityCanaryRedirect,
  type CommunityCanaryOptions,
  type CommunityCanaryTiming,
} from "@/lib/community/canary"

const REQUEST_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 1_000_000

interface ProbeResult {
  name: string
  path: string
  status: number
  ttfbMs: number
  contentType: string | null
  location: string | null
  setCookie: string | null
  body: string
}

interface CanaryRun {
  probes: ProbeResult[]
  timing?: CommunityCanaryTiming
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    printUsage()
    return
  }
  const options = parseCommunityCanaryArguments(argv)
  const run =
    options.mode === "enabled"
      ? await verifyEnabledCanary(options)
      : await verifyDisabledCanary(options)
  const budget = run.timing ? evaluateCommunityCanaryBudget(options, run.timing) : undefined

  console.log(
    JSON.stringify(
      {
        baseUrl: options.baseUrl.origin,
        mode: options.mode,
        probes: run.probes.map((probe) => ({
          name: probe.name,
          path: probe.path,
          status: probe.status,
          ttfbMs: probe.ttfbMs,
          contentType: probe.contentType,
          location: probe.location,
          emitsNextLocaleCookie: hasCommunityCanaryCookie(probe.setCookie, "NEXT_LOCALE"),
        })),
        timing: run.timing
          ? {
              ...budget,
              warmTtfbMs: run.timing.warmTtfbMs,
              configuredMaxInitialTtfbMs: options.maxInitialTtfbMs ?? null,
              configuredMaxWarmTtfbMs: options.maxWarmTtfbMs ?? null,
            }
          : null,
      },
      null,
      2,
    ),
  )

  if (budget && !budget.passed) process.exitCode = 1
}

function printUsage(): void {
  console.log(
    [
      "Usage: bun run community:canary -- --base-url <http(s)://origin> --mode <disabled|enabled> [options]",
      "",
      "Options:",
      "  --runs <1-10>                    Warm feed samples in enabled mode (default: 3)",
      "  --max-initial-ttfb-ms <1-120000>  Optional blocking initial-feed TTFB limit",
      "  --max-warm-ttfb-ms <1-120000>     Optional blocking warm-median TTFB limit",
      "  --help, -h                         Show this usage text",
    ].join("\n"),
  )
}

async function verifyDisabledCanary(options: CommunityCanaryOptions): Promise<CanaryRun> {
  const homepage = await probe(options, "homepage", "/")
  expectStatus(homepage, 200)
  expectHtmlDocument(homepage)
  if (homepage.body.includes('href="/community"')) {
    throw new Error("homepage exposes Community navigation while the flag is disabled")
  }

  const community = await probe(options, "community-disabled", "/community")
  expectStatus(community, 404)

  const bridge = await probe(
    options,
    "locale-community-bridge-disabled",
    "/zh/community?type=shipped&sort=hot",
  )
  expectRedirect(bridge, options.baseUrl, "/community", "?type=shipped&sort=hot")
  expectLocaleCookie(bridge, "zh")

  return { probes: [homepage, community, bridge] }
}

async function verifyEnabledCanary(options: CommunityCanaryOptions): Promise<CanaryRun> {
  // Start with the filtered public feed so the initial sample includes the
  // read path that staff will exercise, not only a static shell response.
  const feedPath = "/community?type=shipped&sort=hot"
  const initial = await probe(options, "community-feed-initial", feedPath, {
    "cache-control": "no-cache",
  })
  expectStatus(initial, 200)
  expectEnglishCommunityDocument(initial)

  const warm: ProbeResult[] = []
  for (let run = 1; run <= options.runs; run += 1) {
    const sample = await probe(options, "community-feed-warm-" + run, feedPath)
    expectStatus(sample, 200)
    warm.push(sample)
  }

  const canonical = await probe(options, "community-canonical", "/community")
  expectStatus(canonical, 200)
  expectEnglishCommunityDocument(canonical)

  const bridge = await probe(
    options,
    "locale-community-bridge-enabled",
    "/zh/community?type=shipped&sort=hot",
  )
  expectRedirect(bridge, options.baseUrl, "/community", "?type=shipped&sort=hot")
  expectLocaleCookie(bridge, "zh")

  // This is the exact stale Client Router shape that previously won a race
  // against a full language switch. It must redirect but never mutate the
  // persisted locale choice.
  const staleRouter = await probe(options, "stale-community-router-request", "/zh/community", {
    cookie: "NEXT_LOCALE=es",
    "next-router-prefetch": "1",
    "next-url": "/community",
    rsc: "1",
  })
  expectRedirect(staleRouter, options.baseUrl, "/community", "")
  if (hasCommunityCanaryCookie(staleRouter.setCookie, "NEXT_LOCALE")) {
    throw new Error("stale Client Router response unexpectedly persists NEXT_LOCALE")
  }

  return {
    probes: [initial, ...warm, canonical, bridge, staleRouter],
    timing: { initialTtfbMs: initial.ttfbMs, warmTtfbMs: warm.map((sample) => sample.ttfbMs) },
  }
}

async function probe(
  options: CommunityCanaryOptions,
  name: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<ProbeResult> {
  const target = new URL(path, options.baseUrl)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const requestHeaders = new Headers({
    accept: "text/html,application/xhtml+xml",
    "accept-language": "en",
    "user-agent": "open-launch-community-canary/1.0",
  })
  for (const [header, value] of Object.entries(headers)) requestHeaders.set(header, value)

  try {
    const startedAt = performance.now()
    const response = await fetch(target, {
      headers: requestHeaders,
      redirect: "manual",
      signal: controller.signal,
    })
    const ttfbMs = Math.round(performance.now() - startedAt)
    const body = await readBodyWithinLimit(response, name)
    return {
      name,
      path,
      status: response.status,
      ttfbMs,
      contentType: response.headers.get("content-type"),
      location: response.headers.get("location"),
      setCookie: response.headers.get("set-cookie"),
      body,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown request failure"
    throw new Error(name + " request failed: " + message)
  } finally {
    clearTimeout(timeout)
  }
}

async function readBodyWithinLimit(response: Response, name: string): Promise<string> {
  const declaredSize = Number(response.headers.get("content-length"))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
    throw new Error(name + " response exceeds " + MAX_RESPONSE_BYTES + " bytes")
  }
  if (!response.body) return ""

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error(name + " response exceeds " + MAX_RESPONSE_BYTES + " bytes")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

function expectStatus(result: ProbeResult, expected: number): void {
  if (result.status !== expected) {
    throw new Error(result.name + " expected HTTP " + expected + ", received " + result.status)
  }
}

function expectRedirect(
  result: ProbeResult,
  baseUrl: URL,
  expectedPathname: string,
  expectedSearch: string,
): void {
  expectStatus(result, 307)
  const target = resolveCommunityCanaryRedirect(baseUrl, result.location ?? "")
  if (target.pathname !== expectedPathname || target.search !== expectedSearch) {
    throw new Error(
      result.name +
        " redirect mismatch: expected " +
        expectedPathname +
        expectedSearch +
        ", received " +
        target.pathname +
        target.search,
    )
  }
}

function expectLocaleCookie(result: ProbeResult, locale: string): void {
  const persistedLocale = communityCanaryCookieValue(result.setCookie, "NEXT_LOCALE")
  if (persistedLocale === null) {
    throw new Error(result.name + " does not persist NEXT_LOCALE")
  }
  if (persistedLocale.toLowerCase() !== locale.toLowerCase()) {
    throw new Error(result.name + " does not persist NEXT_LOCALE=" + locale)
  }
}

function expectEnglishCommunityDocument(result: ProbeResult): void {
  expectHtmlDocument(result)
  if (!/<html\b[^>]*\blang=["']en["']/i.test(result.body)) {
    throw new Error(result.name + " does not serve an English document")
  }
  if (!result.body.includes('href="/community"')) {
    throw new Error(result.name + " does not expose the Community navigation entry")
  }
}

function expectHtmlDocument(result: ProbeResult): void {
  if (!result.contentType?.toLowerCase().includes("text/html")) {
    throw new Error(result.name + " does not serve HTML")
  }
}

main().catch((error) => {
  console.error("[community-canary]", error)
  process.exitCode = 1
})
