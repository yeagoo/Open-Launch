import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { auth } from "@/lib/auth"

import { SettingsClient } from "./settings-client"

// Server wrapper: authenticate BEFORE rendering the client page. The old
// client-only page returned null while useSession() was still loading (a
// white screen), and stayed blank forever when the session cookie had
// outlived the session itself.
export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user?.id) {
    redirect("/sign-in")
  }

  return <SettingsClient />
}
