import { brandedOgImage, OG_SIZE } from "@/lib/og-template"

export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 86400

export default function TrendingOgImage() {
  return brandedOgImage("Trending Projects", "Today's hottest launches on aat.ee")
}
