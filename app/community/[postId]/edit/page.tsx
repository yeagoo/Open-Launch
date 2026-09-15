import { permanentRedirect } from "next/navigation"

import { communityPostHref } from "@/lib/community/urls"

export default async function LegacyCommunityEditPage({
  params,
}: {
  params: Promise<{ postId: string }>
}) {
  const { postId } = await params
  permanentRedirect(`${communityPostHref(postId)}/edit`)
}
