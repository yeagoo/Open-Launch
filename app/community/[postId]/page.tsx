import { permanentRedirect } from "next/navigation"

import { communityPostHref } from "@/lib/community/urls"

/** Legacy preview paths remain redirect-only; public links use `/community/t/[id]`. */
export default async function LegacyCommunityPostPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  permanentRedirect(communityPostHref(postId))
}
