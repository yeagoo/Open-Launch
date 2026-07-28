import { Metadata } from "next"
import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"

import { RiBellLine } from "@remixicon/react"
import { NextIntlClientProvider } from "next-intl"
import { getMessages, getTranslations } from "next-intl/server"

import { auth } from "@/lib/auth"
import { pickClientMessages } from "@/lib/client-messages"
import { getNotifications, type NotificationItem } from "@/app/actions/notifications"

import { MarkAllReadButton } from "./mark-all-read-button"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Notifications | aat.ee",
    robots: { index: false, follow: false },
  }
}

const PAGE_SIZE = 20

function excerptOf(item: NotificationItem): string | null {
  const excerpt = item.metadata?.excerpt
  return typeof excerpt === "string" && excerpt ? excerpt : null
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    redirect("/sign-in")
  }

  const [t, messages] = await Promise.all([getTranslations("notifications"), getMessages()])
  const { page: pageParam } = await searchParams
  // Same ceiling as getNotifications (100): the fetch and the rendered
  // page indicator must agree, or page=999 shows "999 / 2".
  const page = Math.min(100, Math.max(1, parseInt(pageParam || "1", 10) || 1))
  const { items, totalCount } = await getNotifications(page)
  // getNotifications caps at page 100 — keep the UI's page count on the
  // same ceiling so it never links to pages the action would clamp.
  const totalPages = Math.min(100, Math.max(1, Math.ceil(totalCount / PAGE_SIZE)))

  const labelFor = (item: NotificationItem): string => {
    const actor = item.actorName ?? t("someone")
    switch (item.type) {
      case "comment":
        return t("typeComment", { actor, project: item.projectName ?? "" })
      case "reply":
        return t("typeReply", { actor, project: item.projectName ?? "" })
      case "mention":
        return t("typeMention", { actor, project: item.projectName ?? "" })
      case "upvote_milestone":
        return t("typeMilestone", {
          count: Number(item.metadata?.milestone ?? 0),
          project: item.projectName ?? "",
        })
      case "launch_status":
        // "launched" = launch day ended (next-day flip), NOT "just went
        // live" — rendering both transitions with the same text would
        // send a duplicate-looking "now live" alert a day later.
        return item.metadata?.newStatus === "launched"
          ? t("typeLaunchEnded", { project: item.projectName ?? "" })
          : t("typeLaunchStatus", { project: item.projectName ?? "" })
      default:
        return item.projectName ?? ""
    }
  }

  return (
    <NextIntlClientProvider messages={pickClientMessages(messages, ["notifications"])}>
      <main className="bg-secondary/20 min-h-screen">
        <div className="container mx-auto max-w-3xl px-4 pt-8 pb-12">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
              <RiBellLine className="h-6 w-6" />
              {t("title")}
            </h1>
            <MarkAllReadButton />
          </div>

          {items.length === 0 ? (
            <div className="bg-card border-border rounded-xl border border-dashed py-16 text-center">
              <p className="text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <Link
                  key={item.id}
                  href={item.projectSlug ? `/projects/${item.projectSlug}` : "/notifications"}
                  className={`block rounded-xl border p-4 transition-colors ${
                    item.readAt
                      ? "bg-card border-border"
                      : "bg-primary/5 border-primary/30 hover:border-primary/50"
                  }`}
                >
                  <p className="text-sm font-medium">{labelFor(item)}</p>
                  {excerptOf(item) && (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                      {excerptOf(item)}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">
                    {item.createdAt.toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-4">
              {page > 1 && (
                <Link
                  href={`/notifications?page=${page - 1}`}
                  className="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm transition-colors"
                >
                  ←
                </Link>
              )}
              <span className="text-muted-foreground text-sm">
                {page} / {totalPages}
              </span>
              {page < totalPages && (
                <Link
                  href={`/notifications?page=${page + 1}`}
                  className="border-border hover:bg-muted rounded-md border px-4 py-2 text-sm transition-colors"
                >
                  →
                </Link>
              )}
            </div>
          )}
        </div>
      </main>
    </NextIntlClientProvider>
  )
}
