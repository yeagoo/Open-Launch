import { permanentRedirect } from "next/navigation"

/** Preserve the Phase 0 address while keeping one canonical feed query shape. */
export default function LegacyCommunitySavedPage() {
  permanentRedirect("/community?view=saved")
}
