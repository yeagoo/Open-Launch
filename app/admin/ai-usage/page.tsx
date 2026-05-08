import Link from "next/link"

import { db } from "@/drizzle/db"
import { aiUsageLog } from "@/drizzle/db/schema"
import { format } from "date-fns"
import { desc, gte, sql } from "drizzle-orm"

import { estimateCostUsd, PRICE_PER_M_TOKENS } from "@/lib/ai-usage"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const PAGE_SIZE = 50

interface PageProps {
  searchParams: Promise<{ page?: string }>
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `<$0.01`
  return `$${usd.toFixed(2)}`
}

export default async function AdminAiUsagePage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  // Aggregate sums for three time windows + breakdown by function for the
  // last 7 days, all in parallel.
  const [
    [{ promptDay = 0, completionDay = 0, callsDay = 0 } = {}],
    [{ promptWeek = 0, completionWeek = 0, callsWeek = 0 } = {}],
    [{ promptMonth = 0, completionMonth = 0, callsMonth = 0 } = {}],
    byFunction,
    daily,
    recent,
    [{ total = 0 } = {}],
  ] = await Promise.all([
    db
      .select({
        promptDay: sql<number>`COALESCE(SUM(${aiUsageLog.promptTokens}), 0)::int`,
        completionDay: sql<number>`COALESCE(SUM(${aiUsageLog.completionTokens}), 0)::int`,
        callsDay: sql<number>`COUNT(*)::int`,
      })
      .from(aiUsageLog)
      .where(gte(aiUsageLog.createdAt, dayAgo)),
    db
      .select({
        promptWeek: sql<number>`COALESCE(SUM(${aiUsageLog.promptTokens}), 0)::int`,
        completionWeek: sql<number>`COALESCE(SUM(${aiUsageLog.completionTokens}), 0)::int`,
        callsWeek: sql<number>`COUNT(*)::int`,
      })
      .from(aiUsageLog)
      .where(gte(aiUsageLog.createdAt, weekAgo)),
    db
      .select({
        promptMonth: sql<number>`COALESCE(SUM(${aiUsageLog.promptTokens}), 0)::int`,
        completionMonth: sql<number>`COALESCE(SUM(${aiUsageLog.completionTokens}), 0)::int`,
        callsMonth: sql<number>`COUNT(*)::int`,
      })
      .from(aiUsageLog)
      .where(gte(aiUsageLog.createdAt, monthAgo)),
    db
      .select({
        functionName: aiUsageLog.functionName,
        calls: sql<number>`COUNT(*)::int`,
        prompt: sql<number>`COALESCE(SUM(${aiUsageLog.promptTokens}), 0)::int`,
        completion: sql<number>`COALESCE(SUM(${aiUsageLog.completionTokens}), 0)::int`,
      })
      .from(aiUsageLog)
      .where(gte(aiUsageLog.createdAt, weekAgo))
      .groupBy(aiUsageLog.functionName)
      .orderBy(desc(sql`SUM(${aiUsageLog.totalTokens})`)),
    db
      .select({
        day: sql<string>`DATE(${aiUsageLog.createdAt})`,
        calls: sql<number>`COUNT(*)::int`,
        prompt: sql<number>`COALESCE(SUM(${aiUsageLog.promptTokens}), 0)::int`,
        completion: sql<number>`COALESCE(SUM(${aiUsageLog.completionTokens}), 0)::int`,
      })
      .from(aiUsageLog)
      .where(gte(aiUsageLog.createdAt, monthAgo))
      .groupBy(sql`DATE(${aiUsageLog.createdAt})`)
      .orderBy(desc(sql`DATE(${aiUsageLog.createdAt})`)),
    db
      .select({
        id: aiUsageLog.id,
        createdAt: aiUsageLog.createdAt,
        functionName: aiUsageLog.functionName,
        model: aiUsageLog.model,
        promptTokens: aiUsageLog.promptTokens,
        completionTokens: aiUsageLog.completionTokens,
        totalTokens: aiUsageLog.totalTokens,
      })
      .from(aiUsageLog)
      .orderBy(desc(aiUsageLog.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: sql<number>`COUNT(*)::int` }).from(aiUsageLog),
  ])

  const dayCost = estimateCostUsd(promptDay, completionDay)
  const weekCost = estimateCostUsd(promptWeek, completionWeek)
  const monthCost = estimateCostUsd(promptMonth, completionMonth)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI usage</h1>
          <p className="text-muted-foreground text-sm">
            DeepSeek call volume + estimated spend. Cost uses {PRICE_PER_M_TOKENS.prompt}/
            {PRICE_PER_M_TOKENS.completion} USD per 1M prompt/completion tokens; update
            lib/ai-usage.ts when the provider&apos;s pricing changes.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin">Back to admin</Link>
        </Button>
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Last 24 hours"
          calls={callsDay}
          prompt={promptDay}
          completion={completionDay}
          cost={dayCost}
        />
        <SummaryCard
          label="Last 7 days"
          calls={callsWeek}
          prompt={promptWeek}
          completion={completionWeek}
          cost={weekCost}
        />
        <SummaryCard
          label="Last 30 days"
          calls={callsMonth}
          prompt={promptMonth}
          completion={completionMonth}
          cost={monthCost}
        />
      </div>

      {/* Breakdown by function (7d) */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Breakdown by function (last 7 days)</h2>
        {byFunction.length === 0 ? (
          <p className="text-muted-foreground text-sm">No usage yet.</p>
        ) : (
          <div className="bg-card rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium">Function</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">Prompt</th>
                  <th className="px-4 py-2 text-right font-medium">Completion</th>
                  <th className="px-4 py-2 text-right font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {byFunction.map((row) => (
                  <tr key={row.functionName} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs">{row.functionName}</td>
                    <td className="px-4 py-2 text-right">{row.calls.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">{formatTokens(row.prompt)}</td>
                    <td className="px-4 py-2 text-right">{formatTokens(row.completion)}</td>
                    <td className="px-4 py-2 text-right">
                      {formatCost(estimateCostUsd(row.prompt, row.completion))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily totals (last 30 days) */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Daily totals (last 30 days)</h2>
        {daily.length === 0 ? (
          <p className="text-muted-foreground text-sm">No usage yet.</p>
        ) : (
          <div className="bg-card rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr className="text-muted-foreground text-left">
                  <th className="px-4 py-2 font-medium">Day</th>
                  <th className="px-4 py-2 text-right font-medium">Calls</th>
                  <th className="px-4 py-2 text-right font-medium">Tokens</th>
                  <th className="px-4 py-2 text-right font-medium">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((row) => (
                  <tr key={row.day} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs">{row.day}</td>
                    <td className="px-4 py-2 text-right">{row.calls.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      {formatTokens(row.prompt + row.completion)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatCost(estimateCostUsd(row.prompt, row.completion))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent calls */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Recent calls</h2>
        {recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">No usage yet.</p>
        ) : (
          <>
            <div className="bg-card rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-muted-foreground text-left">
                    <th className="px-4 py-2 font-medium">Time</th>
                    <th className="px-4 py-2 font-medium">Function</th>
                    <th className="px-4 py-2 font-medium">Model</th>
                    <th className="px-4 py-2 text-right font-medium">Prompt</th>
                    <th className="px-4 py-2 text-right font-medium">Completion</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {format(row.createdAt, "MM-dd HH:mm:ss")}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {row.functionName}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground px-4 py-2 font-mono text-xs">
                        {row.model}
                      </td>
                      <td className="px-4 py-2 text-right">{row.promptTokens.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        {row.completionTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-medium">
                        {row.totalTokens.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Page {page} of {totalPages} · {total.toLocaleString()} rows
                </span>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/ai-usage?page=${page - 1}`}>Previous</Link>
                    </Button>
                  )}
                  {page < totalPages && (
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/ai-usage?page=${page + 1}`}>Next</Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface SummaryCardProps {
  label: string
  calls: number
  prompt: number
  completion: number
  cost: number
}

function SummaryCard({ label, calls, prompt, completion, cost }: SummaryCardProps) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <div className="text-muted-foreground mb-1 text-xs tracking-wider uppercase">{label}</div>
      <div className="text-2xl font-bold">{formatCost(cost)}</div>
      <div className="text-muted-foreground mt-2 text-xs">
        {calls.toLocaleString()} calls · {formatTokens(prompt + completion)} tokens
      </div>
      <div className="text-muted-foreground mt-1 text-xs">
        prompt {formatTokens(prompt)} · completion {formatTokens(completion)}
      </div>
    </div>
  )
}
