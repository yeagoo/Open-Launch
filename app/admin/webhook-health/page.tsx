import Link from "next/link"

import { db } from "@/drizzle/db"
import { webhookHealthCheck } from "@/drizzle/db/schema"
import { formatDistanceToNow } from "date-fns"
import { desc } from "drizzle-orm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

/**
 * Renders the last 50 webhook-health snapshots so admin can eyeball
 * "is our Stripe → DB pipe alive?" without scrolling the email box.
 *
 * Backed by `webhook_health_check` rows written by
 * `/api/cron/webhook-health` on every run (healthy or degraded). Cron
 * is registered in `cron_schedule` (see migration 0023); table
 * created in migration 0024.
 *
 * If this page is empty the cron hasn't run yet — check the admin
 * cron-runs page to confirm the dispatcher is calling it.
 */
export default async function WebhookHealthPage() {
  const runs = await db
    .select()
    .from(webhookHealthCheck)
    .orderBy(desc(webhookHealthCheck.ranAt))
    .limit(50)

  const lastRun = runs[0]
  const degradedCount = runs.filter((r) => r.status === "degraded").length
  const errorCount = runs.filter((r) => r.status === "error").length

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stripe webhook health</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Cross-references Stripe <code>events.list</code> with our <code>directory_order</code>{" "}
            writes every 6h. Catches silent webhook delivery failures (the 5/11 type).
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Back to admin</Link>
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">Last run</div>
          <div className="mt-1 flex items-center gap-2">
            {lastRun ? (
              <>
                <StatusBadge status={lastRun.status} />
                <span className="text-sm">
                  {formatDistanceToNow(lastRun.ranAt, { addSuffix: true })}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground text-sm">no runs yet</span>
            )}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">Degraded (last 50)</div>
          <div
            className={`mt-1 text-2xl font-bold ${degradedCount > 0 ? "text-amber-600" : "text-foreground"}`}
          >
            {degradedCount}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-muted-foreground text-xs">Errors (last 50)</div>
          <div
            className={`mt-1 text-2xl font-bold ${errorCount > 0 ? "text-red-600" : "text-foreground"}`}
          >
            {errorCount}
          </div>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Last {runs.length} runs</h2>
      {runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No runs recorded yet. The dispatcher fires this task every 6h once registered (see
          migration 0023). You can trigger it manually:{" "}
          <code className="text-xs">
            curl -H &quot;Authorization: Bearer $CRON_API_KEY&quot;
            https://www.aat.ee/api/cron/webhook-health
          </code>
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Events</th>
                <th className="px-3 py-2 text-right">Matched</th>
                <th className="px-3 py-2 text-right">Unmatched</th>
                <th className="px-3 py-2 text-left">Sample / Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-xs">
                      {r.ranAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totalEvents}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.matched}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${r.unmatched > 0 ? "font-semibold text-amber-600" : ""}`}
                  >
                    {r.unmatched}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.errorMessage ? (
                      <span className="text-red-600">{r.errorMessage}</span>
                    ) : r.previewSessionIds && r.previewSessionIds.length > 0 ? (
                      <span className="text-muted-foreground">
                        {r.previewSessionIds.slice(0, 3).join(", ")}
                        {r.previewSessionIds.length > 3 ? " …" : ""}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "healthy") return <Badge variant="outline">healthy</Badge>
  if (status === "degraded")
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700">
        degraded
      </Badge>
    )
  return (
    <Badge variant="outline" className="border-red-500 text-red-700">
      error
    </Badge>
  )
}
