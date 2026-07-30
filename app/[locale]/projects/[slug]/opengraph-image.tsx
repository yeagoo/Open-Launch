import { ImageResponse } from "next/og"

import { getLocalizedProjectTagline } from "@/lib/get-project-translation"
import { logger } from "@/lib/observability/structured-logger"
import { getOgFontConfig } from "@/lib/og-fonts"
import { getProjectBySlug } from "@/lib/project-details-query"
import {
  closeSafeFetchResponse,
  readSafeFetchBuffer,
  safeFetch,
  SafeFetchError,
} from "@/lib/safe-fetch"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const revalidate = 86400

const LOGO_FETCH_TIMEOUT_MS = 3000
const LOGO_MAX_BYTES = 512 * 1024

/**
 * Fetch the project logo server-side with FULL SSRF protection (logoUrl
 * is user input — a plain fetch would let it point at internal hosts).
 * The bytes are re-encoded to PNG with sharp: satori can't decode AVIF
 * (our own R2 uploads are .avif) and an undecodable image kills the whole
 * ImageResponse. Any failure falls back to the letter tile, never breaks
 * the image.
 */
async function fetchLogoDataUrl(url: string): Promise<string | null> {
  let res = null
  try {
    res = await safeFetch(url, { timeoutMs: LOGO_FETCH_TIMEOUT_MS })
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") ?? ""
    // SVG is excluded (script-capable markup); raster types only.
    if (!contentType.startsWith("image/") || contentType.includes("svg")) return null
    const buffer = await readSafeFetchBuffer(res, {
      deadline: Date.now() + LOGO_FETCH_TIMEOUT_MS,
      maxBytes: LOGO_MAX_BYTES,
      label: "OG logo image",
    })
    const { default: sharp } = await import("sharp")
    // Same pixel ceiling as the upload pipeline (16MP): a crafted logo
    // URL could otherwise serve a decompression bomb that sharp's
    // 268MP default would happily expand into gigabytes of memory.
    const png = await sharp(Buffer.from(buffer), { limitInputPixels: 16_000_000 })
      .resize(280, 280, { fit: "cover" })
      .png()
      .toBuffer()
    return `data:image/png;base64,${png.toString("base64")}`
  } catch (err) {
    if (!(err instanceof SafeFetchError)) {
      logger.warn("og_logo_render_failed", {
        route: "/projects/[param]",
        status: "fallback",
        provider: "sharp",
        error: err,
      })
    }
    return null
  } finally {
    if (res) closeSafeFetchResponse(res)
  }
}

export default async function ProjectOgImage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>
}) {
  const { slug, locale } = await params
  const project = await getProjectBySlug(slug).catch(() => null)

  const name = project?.name ?? "aat.ee"
  const tagline = project
    ? await getLocalizedProjectTagline(project.id, locale).catch(() => null)
    : null
  const upvotes = project?.upvoteCount ?? 0
  const logoDataUrl = project?.logoUrl ? await fetchLogoDataUrl(project.logoUrl) : null
  const displayName = name.length > 40 ? `${name.slice(0, 40)}…` : name
  const displayTagline = tagline && tagline.length > 70 ? `${tagline.slice(0, 70)}…` : tagline
  const fontConfig = getOgFontConfig(displayName, displayTagline ?? "")

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        padding: 64,
        fontFamily: fontConfig.fontFamily,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        {logoDataUrl ? (
          <img
            src={logoDataUrl}
            alt=""
            width={140}
            height={140}
            style={{ borderRadius: 28, objectFit: "cover", background: "#fff" }}
          />
        ) : (
          <div
            style={{
              width: 140,
              height: 140,
              borderRadius: 28,
              background: "#3b82f6",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 72,
              fontWeight: 700,
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#fff", lineHeight: 1.15 }}>
            {displayName}
          </div>
          {displayTagline && (
            <div style={{ fontSize: 32, color: "#94a3b8", lineHeight: 1.3 }}>{displayTagline}</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, color: "#e2e8f0", fontSize: 32 }}
        >
          <span style={{ color: "#3b82f6" }}>▲</span>
          <span>{upvotes} upvotes</span>
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#fff" }}>aat.ee</div>
      </div>
    </div>,
    { ...size, fonts: fontConfig.fonts },
  )
}
