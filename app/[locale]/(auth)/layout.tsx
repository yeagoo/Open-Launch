import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"

import { auth } from "@/lib/auth"
import { pickClientMessages } from "@/lib/client-messages"

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (session?.user) redirect("/dashboard")

  const messages = await getMessages()
  return (
    <NextIntlClientProvider messages={pickClientMessages(messages, ["auth"])}>
      {children}
    </NextIntlClientProvider>
  )
}
