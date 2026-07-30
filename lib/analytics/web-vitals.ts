import { getMatomoPageUrl } from "@/lib/analytics/matomo"
import type { MatomoCommand } from "@/lib/analytics/matomo-queue"

const METRIC_NAMES = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"])
const METRIC_RATINGS = new Set(["good", "needs-improvement", "poor"])
const SUPPORTED_LOCALES = new Set(["en", "zh", "es", "pt", "fr", "ja", "ko", "et"])
const DEVICE_CLASSES = new Set(["mobile", "tablet", "desktop"])
const ROUTE_FAMILIES = new Set([
  "home",
  "projects",
  "project_submit",
  "project_badges",
  "project_detail",
  "blog",
  "blog_detail",
  "tags",
  "tag_detail",
  "reviews",
  "review_detail",
  "user_profile",
  "alternatives",
  "alternative_detail",
  "comparisons",
  "comparison_detail",
  "free_directory_submission",
  "badge",
  "categories",
  "legal",
  "pricing",
  "solution",
  "sponsors",
  "trending",
  "winners",
])
const STATIC_ROUTE_FAMILIES: Record<string, string> = {
  badge: "badge",
  categories: "categories",
  legal: "legal",
  pricing: "pricing",
  solution: "solution",
  sponsors: "sponsors",
  trending: "trending",
  winners: "winners",
}

export interface WebVitalMeasurement {
  name: string
  value: number
  rating: string
  navigationURL?: string
  attribution?: unknown
}

export interface WebVitalDimensions {
  routeFamily: string
  locale: string
  deviceClass: "mobile" | "tablet" | "desktop"
}

export function parseWebVitalsSampleRate(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("WEB_VITALS_SAMPLE_RATE must be a number between 0 and 1")
  }
  return parsed
}

export function getWebVitalRouteDimensions(
  navigationUrl: string,
): Pick<WebVitalDimensions, "routeFamily" | "locale"> | null {
  let pathname: string
  try {
    pathname = new URL(navigationUrl, "https://aat.invalid").pathname
  } catch {
    return null
  }

  const segments = pathname.split("/").filter(Boolean)
  const first = segments[0]?.toLowerCase()
  const locale = first && SUPPORTED_LOCALES.has(first) ? first : "default"
  if (locale !== "default") segments.shift()
  if (segments.length === 0) return { routeFamily: "home", locale }

  const [root, second, third] = segments
  if (root === "projects") {
    if (!second) return { routeFamily: "projects", locale }
    if (second === "submit") return { routeFamily: "project_submit", locale }
    if (third === "badges") return { routeFamily: "project_badges", locale }
    return { routeFamily: "project_detail", locale }
  }
  if (root === "blog") {
    return { routeFamily: second ? "blog_detail" : "blog", locale }
  }
  if (root === "tags") {
    return { routeFamily: second ? "tag_detail" : "tags", locale }
  }
  if (root === "reviews") {
    return { routeFamily: second ? "review_detail" : "reviews", locale }
  }
  if (root === "users" && second) return { routeFamily: "user_profile", locale }
  if (root === "alternatives") {
    return { routeFamily: second ? "alternative_detail" : "alternatives", locale }
  }
  if (root === "compare") {
    return { routeFamily: second ? "comparison_detail" : "comparisons", locale }
  }
  if (root === "skill" && second === "free-directory-submission") {
    return { routeFamily: "free_directory_submission", locale }
  }

  const staticFamily = STATIC_ROUTE_FAMILIES[root]
  return staticFamily ? { routeFamily: staticFamily, locale } : null
}

export function getWebVitalDeviceClass(viewportWidth: number): WebVitalDimensions["deviceClass"] {
  if (viewportWidth <= 767) return "mobile"
  if (viewportWidth <= 1023) return "tablet"
  return "desktop"
}

export function buildWebVitalMatomoCommands(
  metric: WebVitalMeasurement,
  dimensions: WebVitalDimensions,
  currentUrl: string,
): MatomoCommand[] {
  if (
    !METRIC_NAMES.has(metric.name) ||
    !METRIC_RATINGS.has(metric.rating) ||
    !ROUTE_FAMILIES.has(dimensions.routeFamily) ||
    !(SUPPORTED_LOCALES.has(dimensions.locale) || dimensions.locale === "default") ||
    !DEVICE_CLASSES.has(dimensions.deviceClass) ||
    !Number.isFinite(metric.value) ||
    metric.value < 0
  ) {
    return []
  }

  const label = `${dimensions.routeFamily}|${dimensions.locale}|${dimensions.deviceClass}|${metric.rating}`
  const maskedUrl = `https://www.aat.ee/__rum/${dimensions.locale}/${dimensions.routeFamily}`
  const commands: MatomoCommand[] = [
    ["setCustomUrl", maskedUrl],
    ["trackEvent", "Web Vitals", metric.name, label, metricValue(metric.name, metric.value)],
  ]

  if (metric.name === "LCP" && isRecord(metric.attribution)) {
    const segments = [
      ["time_to_first_byte", metric.attribution.timeToFirstByte],
      ["resource_load_delay", metric.attribution.resourceLoadDelay],
      ["resource_load_duration", metric.attribution.resourceLoadDuration],
      ["element_render_delay", metric.attribution.elementRenderDelay],
    ] as const
    for (const [name, value] of segments) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        commands.push(["trackEvent", "Web Vitals LCP", name, label, Math.round(value)])
      }
    }
  }

  commands.push(["setCustomUrl", getMatomoPageUrl(currentUrl)])
  return commands
}

function metricValue(name: string, value: number): number {
  return name === "CLS" ? Math.round(value * 10_000) / 10_000 : Math.round(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
