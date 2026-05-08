import Link from "next/link"

import { db } from "@/drizzle/db"
import { cronRunLog, cronSchedule } from "@/drizzle/db/schema"
import { formatDistanceToNow } from "date-fns"
import { asc, gte, sql } from "drizzle-orm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { toggleCronEnabled, updateCronExpression } from "./actions"

export const dynamic = "force-dynamic"

export default async function AdminCronRunsPage() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Pull schedules + last 24h aggregate stats per task in one round trip.
  const [schedules, statsRows] = await Promise.all([
    db.select().from(cronSchedule).orderBy(asc(cronSchedule.path)),
    db
      .select({
        taskPath: cronRunLog.taskPath,
        runs: sql<number>`COUNT(*)::int`,
        successes: sql<number>`COUNT(*) FILTER (WHERE ${cronRunLog.statusCode} >= 200 AND ${cronRunLog.statusCode} < 300)::int`,
        avgMs: sql<number>`AVG(${cronRunLog.durationMs})::int`,
        lastRun: sql<Date>`MAX(${cronRunLog.dispatchedAt})`,
        lastFailure: sql<Date | null>`MAX(${cronRunLog.dispatchedAt}) FILTER (WHERE ${cronRunLog.statusCode} >= 400 OR ${cronRunLog.statusCode} = 0)`,
      })
      .from(cronRunLog)
      .where(gte(cronRunLog.dispatchedAt, dayAgo))
      .groupBy(cronRunLog.taskPath),
  ])

  const statsByPath = new Map(statsRows.map((s) => [s.taskPath, s]))

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cron schedule</h1>
          <p className="text-muted-foreground text-sm">
            <code>/api/cron/dispatch</code> is invoked every minute by cron-job.org and fires tasks
            whose cron expression matches. Edit the expression or toggle a task off here — no
            redeploy needed. Stats below cover the last 24h.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Back to admin</Link>
        </Button>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr className="text-muted-foreground text-left">
              <th className="px-4 py-2 font-medium">Task</th>
              <th className="px-4 py-2 font-medium">Schedule (UTC)</th>
              <th className="px-4 py-2 text-right font-medium">24h success</th>
              <th className="px-4 py-2 text-right font-medium">Avg ms</th>
              <th className="px-4 py-2 font-medium">Last run</th>
              <th className="px-4 py-2 font-medium">Last failure</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((task) => {
              const stats = statsByPath.get(task.path)
              const successRate =
                stats && stats.runs > 0 ? (stats.successes / stats.runs) * 100 : null
              const successOk = successRate === null || successRate >= 90
              const slow =
                task.expectedDurationMs &&
                stats?.avgMs != null &&
                stats.avgMs > task.expectedDurationMs * 1.5

              return (
                <tr key={task.id} className="border-b align-top last:border-b-0">
                  <td className="px-4 py-2">
                    <Link
                      href={`/admin/cron-runs/${encodeURIComponent(task.path)}`}
                      className="text-foreground font-medium hover:underline"
                    >
                      {task.displayName}
                    </Link>
                    {!task.enabled && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        disabled
                      </Badge>
                    )}
                    <div className="text-muted-foreground mt-0.5 font-mono text-xs">
                      {task.path}
                    </div>
                    {task.description && (
                      <div className="text-muted-foreground mt-1 max-w-md text-xs">
                        {task.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <form
                      action={async (formData) => {
                        "use server"
                        const expression = String(formData.get("expression") ?? "")
                        await updateCronExpression(task.id, expression)
                      }}
                      className="flex items-center gap-1"
                    >
                      <input
                        name="expression"
                        defaultValue={task.cronExpression}
                        className="bg-background w-32 rounded border px-2 py-1 font-mono text-xs"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Save
                      </Button>
                    </form>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {successRate === null ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : (
                      <span className={successOk ? "" : "font-medium text-red-600"}>
                        {successRate.toFixed(1)}%
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({stats!.successes}/{stats!.runs})
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {stats?.avgMs != null ? (
                      <span className={slow ? "text-amber-600" : ""}>
                        {stats.avgMs.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 text-xs">
                    {stats?.lastRun
                      ? `${formatDistanceToNow(new Date(stats.lastRun))} ago`
                      : "never"}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 text-xs">
                    {stats?.lastFailure
                      ? `${formatDistanceToNow(new Date(stats.lastFailure))} ago`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form
                      action={async () => {
                        "use server"
                        await toggleCronEnabled(task.id, !task.enabled)
                      }}
                    >
                      <Button
                        type="submit"
                        size="sm"
                        variant={task.enabled ? "outline" : "default"}
                      >
                        {task.enabled ? "Disable" : "Enable"}
                      </Button>
                    </form>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-muted-foreground mt-4 text-xs">
        Tip: cron expressions follow the standard 5-field format{" "}
        <code>minute hour day-of-month month day-of-week</code> in UTC. Examples:{" "}
        <code>*/5 * * * *</code> (every 5 min), <code>0 */2 * * *</code> (every 2h on the hour),{" "}
        <code>0 8 * * *</code> (daily 08:00 UTC).
      </div>
    </div>
  )
}
