import Link from "next/link"

import { db } from "@/drizzle/db"
import { project } from "@/drizzle/db/schema"
import { format } from "date-fns"
import { count, desc, eq, sql } from "drizzle-orm"

import { LOW_QUALITY_THRESHOLD } from "@/lib/ai-quality"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { setProjectLowQuality } from "./actions"

const PAGE_SIZE = 50

interface PageProps {
  searchParams: Promise<{ page?: string; filter?: string }>
}

export default async function AdminQualityPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const filter = params.filter === "all" ? "all" : "flagged"
  const offset = (page - 1) * PAGE_SIZE

  const baseWhere = filter === "flagged" ? eq(project.isLowQuality, true) : sql`TRUE`

  // Counts (always show both so admin can switch between filters quickly).
  const [
    [{ flagged = 0 } = {}],
    [{ checked = 0 } = {}],
    [{ unchecked = 0 } = {}],
    rows,
    [{ total = 0 } = {}],
  ] = await Promise.all([
    db.select({ flagged: count() }).from(project).where(eq(project.isLowQuality, true)),
    db
      .select({ checked: count() })
      .from(project)
      .where(sql`${project.qualityCheckedAt} IS NOT NULL`),
    db
      .select({ unchecked: count() })
      .from(project)
      .where(sql`${project.qualityCheckedAt} IS NULL`),
    db
      .select({
        id: project.id,
        slug: project.slug,
        name: project.name,
        websiteUrl: project.websiteUrl,
        isLowQuality: project.isLowQuality,
        qualityScore: project.qualityScore,
        qualityReason: project.qualityReason,
        qualityCheckedAt: project.qualityCheckedAt,
      })
      .from(project)
      .where(baseWhere)
      .orderBy(desc(project.qualityCheckedAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(project).where(baseWhere),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Project quality</h1>
          <p className="text-muted-foreground text-sm">
            AI classifier flags projects scoring below {LOW_QUALITY_THRESHOLD}/100. Flagged projects
            are excluded from every AI feature (bot upvotes, bot comments, long descriptions,
            related products, alternative/comparison pages, translations) and their outbound URL is
            rewritten through <code>/go/</code> with <code>noindex,nofollow</code>. Use the buttons
            below to override a verdict manually — the cron will leave the row alone for 30 days
            afterwards.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Back to admin</Link>
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Currently flagged" value={flagged} tone="danger" />
        <SummaryCard label="Already classified" value={checked} />
        <SummaryCard label="Awaiting first classification" value={unchecked} tone="warn" />
      </div>

      <div className="mb-4 flex gap-2">
        <Button asChild size="sm" variant={filter === "flagged" ? "default" : "outline"}>
          <Link href="/admin/quality?filter=flagged">Flagged only</Link>
        </Button>
        <Button asChild size="sm" variant={filter === "all" ? "default" : "outline"}>
          <Link href="/admin/quality?filter=all">All projects</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No projects match this filter.</p>
      ) : (
        <div className="bg-card rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-muted-foreground text-left">
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 text-right font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Reason</th>
                <th className="px-4 py-2 font-medium">Checked</th>
                <th className="px-4 py-2 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/projects/${row.slug}`}
                      className="text-foreground font-medium hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.websiteUrl && (
                      <div className="text-muted-foreground mt-0.5 truncate text-xs">
                        {row.websiteUrl}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {row.qualityScore != null ? (
                      <Badge
                        variant={
                          row.qualityScore < LOW_QUALITY_THRESHOLD ? "destructive" : "secondary"
                        }
                        className="font-mono"
                      >
                        {row.qualityScore}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="text-muted-foreground max-w-md px-4 py-2 text-xs">
                    {row.qualityReason ?? "—"}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                    {row.qualityCheckedAt
                      ? format(row.qualityCheckedAt, "yyyy-MM-dd HH:mm")
                      : "never"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form
                      action={async () => {
                        "use server"
                        await setProjectLowQuality(row.id, !row.isLowQuality)
                      }}
                    >
                      <Button
                        type="submit"
                        size="sm"
                        variant={row.isLowQuality ? "outline" : "destructive"}
                      >
                        {row.isLowQuality ? "Clear flag" : "Flag as low quality"}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages} · {total.toLocaleString()} rows
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/quality?filter=${filter}&page=${page - 1}`}>Previous</Link>
              </Button>
            )}
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/quality?filter=${filter}&page=${page + 1}`}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface SummaryCardProps {
  label: string
  value: number
  tone?: "danger" | "warn" | "default"
}

function SummaryCard({ label, value, tone = "default" }: SummaryCardProps) {
  const toneClass =
    tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-foreground"
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="text-muted-foreground mb-1 text-xs tracking-wider uppercase">{label}</div>
      <div className={`text-2xl font-bold ${toneClass}`}>{value.toLocaleString()}</div>
    </div>
  )
}
