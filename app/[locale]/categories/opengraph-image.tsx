import { brandedOgImage, OG_SIZE } from "@/lib/og-template"

export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 86400

export default function CategoriesOgImage() {
  return brandedOgImage("Categories", "Browse projects by category on aat.ee")
}
