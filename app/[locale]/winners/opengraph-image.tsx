import { brandedOgImage, OG_SIZE } from "@/lib/og-template"

export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 86400

export default function WinnersOgImage() {
  return brandedOgImage("Daily Winners", "Top-ranked launches of the day on aat.ee")
}
