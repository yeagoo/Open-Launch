import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { setRequestLocale } from "next-intl/server"
import * as z from "zod"

import { getSkillStatusView } from "@/lib/skill-status"

export const dynamic = "force-dynamic"

const paramsSchema = z.object({
  locale: z.string(),
  uuid: z.string().uuid(),
})

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Submission status",
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function SkillStatusPage({
  params,
}: {
  params: Promise<{ locale: string; uuid: string }>
}) {
  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) notFound()

  setRequestLocale(parsed.data.locale)

  const submission = await getSkillStatusView(parsed.data.uuid)
  if (!submission) notFound()

  const progress = submission.total > 0 ? Math.round((submission.sent / submission.total) * 100) : 0

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10 md:px-6">
      <header className="space-y-3">
        <p className="text-muted-foreground text-sm">Free directory submission</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">{submission.domain}</h1>
            <p className="text-muted-foreground mt-2 text-sm break-all">{submission.websiteUrl}</p>
          </div>
          <StatusBadge status={submission.status} />
        </div>
      </header>

      <section className="border-border rounded-md border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{submission.sent} published</p>
            <p className="text-muted-foreground text-sm">
              {submission.total} total placements · {submission.failed} failed ·{" "}
              {submission.scheduled} scheduled
            </p>
          </div>
          <span className="text-2xl font-semibold">{progress}%</span>
        </div>
        <div className="bg-muted mt-4 h-2 overflow-hidden rounded-full">
          <div className="bg-primary h-full" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {submission.reviewReason && (
        <section className="border-border rounded-md border p-4">
          <h2 className="text-sm font-medium">Review note</h2>
          <p className="text-muted-foreground mt-2 text-sm">{submission.reviewReason}</p>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Placements</h2>
        <div className="divide-border overflow-hidden rounded-md border">
          {submission.publications.map((publication) => (
            <div
              key={publication.site}
              className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{publication.site}</p>
                  <StatusBadge status={publication.status} compact />
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  Batch day {publication.batchDay} · scheduled {publication.scheduledFor}
                </p>
                {publication.title && (
                  <p className="mt-2 truncate text-sm">
                    {publication.title}
                    {publication.tagline ? ` — ${publication.tagline}` : ""}
                  </p>
                )}
                {publication.lastError && (
                  <p className="text-destructive mt-2 text-sm">{publication.lastError}</p>
                )}
              </div>
              {publication.externalUrl ? (
                <a
                  href={publication.externalUrl}
                  className="text-primary text-sm font-medium"
                  rel="nofollow noopener noreferrer"
                  target="_blank"
                >
                  Open
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const label = status.replace(/_/g, " ")
  return (
    <span
      className={`border-border bg-muted inline-flex items-center rounded-md border px-2 py-1 font-medium capitalize ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      {label}
    </span>
  )
}
