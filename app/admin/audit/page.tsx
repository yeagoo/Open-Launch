import Link from "next/link"

import { db } from "@/drizzle/db"
import { adminAuditLog, user } from "@/drizzle/db/schema"
import { format } from "date-fns"
import { count, desc, eq } from "drizzle-orm"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const PAGE_SIZE = 50

interface PageProps {
  searchParams: Promise<{ page?: string }>
}

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const [logs, [{ total }]] = await Promise.all([
    db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        metadata: adminAuditLog.metadata,
        ipAddress: adminAuditLog.ipAddress,
        createdAt: adminAuditLog.createdAt,
        adminEmail: user.email,
        adminName: user.name,
      })
      .from(adminAuditLog)
      .leftJoin(user, eq(user.id, adminAuditLog.adminUserId))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ total: count() }).from(adminAuditLog),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Audit Log</h1>
        <span className="text-muted-foreground text-sm">{total} total entries</span>
      </div>

      {logs.length === 0 ? (
        <p className="text-muted-foreground">No audit entries yet.</p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="border-border/40 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{log.action}</Badge>
                {log.targetType && (
                  <span className="text-muted-foreground text-xs">
                    {log.targetType}
                    {log.targetId ? `:${log.targetId}` : ""}
                  </span>
                )}
                <span className="text-muted-foreground ml-auto text-xs">
                  {format(log.createdAt, "yyyy-MM-dd HH:mm:ss")}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span>
                  <span className="text-muted-foreground">By:</span> {log.adminName ?? "—"} (
                  {log.adminEmail ?? "—"})
                </span>
                {log.ipAddress && (
                  <span>
                    <span className="text-muted-foreground">IP:</span> {log.ipAddress}
                  </span>
                )}
              </div>
              {log.metadata != null && (
                <pre className="bg-muted mt-2 overflow-x-auto rounded p-2 text-xs">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/audit?page=${page - 1}`}>Previous</Link>
            </Button>
          )}
          <span className="text-sm">
            Page {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/audit?page=${page + 1}`}>Next</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
