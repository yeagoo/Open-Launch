"use client"

import { useCallback, useEffect, useState } from "react"

import type { CommunityReport, CommunityService, ModerationAction } from "@/lib/community/contracts"
import { Button } from "@/components/ui/button"

import { useCommunityActionLock } from "./community-client-utils"
import { CommunityState } from "./community-ui"

export default function ModerationPanel({
  service,
  onChanged,
}: {
  service: CommunityService
  onChanged: () => void
}) {
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [tryAcquireActionLock, releaseActionLock] = useCommunityActionLock()
  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const rows = await service.reports()
      setReports(rows)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load reports.")
    } finally {
      setLoading(false)
    }
  }, [service])
  useEffect(() => {
    let cancelled = false
    void service
      .reports()
      .then((rows) => {
        if (!cancelled) setReports(rows)
      })
      .catch((error) => {
        if (!cancelled) setError(error instanceof Error ? error.message : "Unable to load reports.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [service])
  const action = useCallback(
    async (report: CommunityReport, operation: ModerationAction | "resolve") => {
      if (pending || !tryAcquireActionLock()) return
      setPending(true)
      setError("")
      try {
        if (operation === "resolve") await service.resolveReport(report.id)
        else await service.moderate(report.postId, operation)
        onChanged()
        await load()
      } catch (error) {
        setError(error instanceof Error ? error.message : "Moderation failed. Please retry.")
      } finally {
        releaseActionLock()
        setPending(false)
      }
    },
    [load, onChanged, pending, releaseActionLock, service, tryAcquireActionLock],
  )
  return (
    <>
      <h1>Moderation queue</h1>
      <p>Review reported posts. All changes apply to demo data only.</p>
      {error && (
        <p className="c-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <CommunityState title="Loading reports…" busy />
      ) : (
        <>
          {reports.length === 0 && <CommunityState title="No reports to review" />}
          {reports.map((report) => (
            <article className="c-report" key={report.id}>
              <h2>{report.resolved ? "Resolved report" : "Pending report"}</h2>
              <p>
                <strong>Reason:</strong> {report.reason}
              </p>
              <details>
                <summary>Reported content snapshot</summary>
                <blockquote>{report.snapshot}</blockquote>
              </details>
              {report.replyId && (
                <p className="c-notice">
                  This preview can resolve a reply report. Reply hide/restore is exercised by the
                  production moderation route, where the reply ID is preserved.
                </p>
              )}
              <div className="c-actions">
                {!report.replyId &&
                  (["hide", "restore", "lock", "unlock", "pin", "unpin"] as const).map(
                    (operation) => (
                      <Button
                        key={operation}
                        variant="outline"
                        disabled={pending}
                        onClick={() => void action(report, operation)}
                      >
                        {operation[0].toUpperCase() + operation.slice(1)}
                      </Button>
                    ),
                  )}
                <Button
                  className="c-button"
                  disabled={pending || report.resolved}
                  onClick={() => void action(report, "resolve")}
                >
                  Resolve report
                </Button>
              </div>
            </article>
          ))}
        </>
      )}
      {error && !loading && <Button onClick={() => void load()}>Retry reports</Button>}
    </>
  )
}
