import { ImageResponse } from "next/og"

import { getOgFonts } from "@/lib/og-fonts"

export const OG_SIZE = { width: 1200, height: 630 } as const

/**
 * Branded OG card for list/profile pages: big title + subtitle + brand.
 * Kept deliberately minimal (no DB images) so every list route is cheap.
 */
export function brandedOgImage(title: string, subtitle: string): ImageResponse {
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
        fontFamily: "Inter, Noto Sans SC",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 60 }}>
        <div style={{ fontSize: 72, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>
          {title.length > 30 ? `${title.slice(0, 30)}…` : title}
        </div>
        <div style={{ fontSize: 34, color: "#94a3b8" }}>
          {subtitle.length > 70 ? `${subtitle.slice(0, 70)}…` : subtitle}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#fff" }}>aat.ee</div>
      </div>
    </div>,
    { ...OG_SIZE, fonts: getOgFonts() },
  )
}
