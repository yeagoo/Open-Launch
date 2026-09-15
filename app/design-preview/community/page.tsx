import type { Metadata } from "next"
import { notFound } from "next/navigation"

import "@/components/community/community.css"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Community frontend preview · aat.ee",
  robots: { index: false, follow: false },
}

export default async function CommunityPreviewPage() {
  if (process.env.NODE_ENV === "production" && process.env.ENABLE_DESIGN_PREVIEW !== "1") notFound()
  const { CommunityPreview } = await import("./community-preview")
  return <CommunityPreview showHeader={false} />
}
