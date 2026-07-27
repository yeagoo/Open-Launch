import { format } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { listPendingCommentReports, type CommentReportRow } from "@/app/actions/admin-moderation"

import { ReportActions } from "./report-actions"

export const dynamic = "force-dynamic"

const REASON_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  spam: "destructive",
  abuse: "destructive",
  offtopic: "secondary",
  other: "outline",
}

function snapshotText(snapshot: unknown): string {
  // Render ONLY text nodes out of the Tiptap JSON snapshot — never
  // dangerouslySetInnerHTML with user-controlled content.
  if (!snapshot || typeof snapshot !== "object") return ""
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return
    const n = node as { text?: unknown; content?: unknown }
    if (typeof n.text === "string") parts.push(n.text)
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(snapshot)
  return parts.join(" ").slice(0, 280)
}

function ReportRow({ report }: { report: CommentReportRow }) {
  return (
    <div className="bg-card border-border rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={REASON_VARIANT[report.reason] ?? "outline"}>{report.reason}</Badge>
            {report.reportCount > 1 && (
              <Badge variant="secondary">{report.reportCount} reports</Badge>
            )}
            {report.commentHiddenAt && <Badge variant="outline">already hidden</Badge>}
            <span className="text-muted-foreground text-xs">
              comment #{report.commentId} · {format(report.createdAt, "yyyy-MM-dd HH:mm")}
            </span>
          </div>
          <p className="text-sm">{snapshotText(report.contentSnapshot) || "(no text content)"}</p>
          {report.details && (
            <p className="text-muted-foreground mt-2 text-xs">Reporter note: {report.details}</p>
          )}
        </div>
        <ReportActions reportId={report.id} />
      </div>
    </div>
  )
}

export default async function AdminCommentReportsPage() {
  const reports = await listPendingCommentReports()

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">Comment Reports</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Pending moderation queue ({reports.length})
      </p>

      {reports.length === 0 ? (
        <div className="bg-card border-border rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No pending reports. 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  )
}
