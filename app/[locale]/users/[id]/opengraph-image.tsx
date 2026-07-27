import { brandedOgImage, OG_SIZE } from "@/lib/og-template"
import { getPublicUserProfile } from "@/lib/user-profile-query"

export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 86400

export default async function UserOgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getPublicUserProfile(id).catch(() => null)

  return brandedOgImage(
    data?.profile.name ?? "Maker",
    `${data?.projects.length ?? 0} launches on aat.ee`,
  )
}
