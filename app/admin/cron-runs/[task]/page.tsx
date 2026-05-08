import Link from "next/link"
import { notFound } from "next/navigation"

import { db } from "@/drizzle/db"
import { cronRunLog, cronSchedule } from "@/drizzle/db/schema"
import { format } from "date-fns"
import { desc, eq } from "drizzle-orm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ task: string }>
}

export default async function CronTaskDetailPage({ params }: PageProps) {
  const { task: encodedTask } = await params
  const taskPath = decodeURIComponent(encodedTask)

  const [schedule] = await db
    .select()
    .from(cronSchedule)
    .where(eq(cronSchedule.path, taskPath))
    .limit(1)

  if (!schedule) notFound()

  const runs = await db
    .select()
    .from(cronRunLog)
    .where(eq(cronRunLog.taskPath, taskPath))
    .orderBy(desc(cronRunLog.dispatchedAt))
    .limit(50)

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{schedule.displayName}</h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs">{schedule.path}</p>
          <p className="text-muted-foreground mt-2 text-sm">
            Schedule: <code>{schedule.cronExpression}</code> (UTC) ·{" "}
            {schedule.enabled ? "enabled" : "disabled"}
          </p>
          {schedule.description && (
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{schedule.description}</p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/cron-runs">All schedules</Link>
        </Button>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Last {runs.length} runs</h2>
      {runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No runs recorded yet. Either the dispatcher hasn&apos;t fired this task in the last 90
          days, or it was just enabled.
        </p>
      ) : (
        <div className="bg-card overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-muted-foreground text-left">
                <th className="px-4 py-2 font-medium">Dispatched at</th>
                <th className="px-4 py-2 text-right font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Duration (ms)</th>
                <th className="px-4 py-2 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const ok = run.statusCode >= 200 && run.statusCode < 300
                return (
                  <tr key={run.id} className="border-b last:border-b-0">
                    <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                      {format(run.dispatchedAt, "yyyy-MM-dd HH:mm:ss")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={ok ? "secondary" : "destructive"} className="font-mono">
                        {run.statusCode}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right">{run.durationMs.toLocaleString()}</td>
                    <td className="text-muted-foreground max-w-md px-4 py-2 text-xs">
                      {run.error ?? "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
