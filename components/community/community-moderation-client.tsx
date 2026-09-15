"use client"

import { useState, useTransition } from "react"

import type { CommunityReport, ModerationAction } from "@/lib/community/contracts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  moderateCommunityPost,
  moderateCommunityReply,
  resolveCommunityReport,
} from "@/app/actions/community"

import {
  actionMessage,
  communityProjectionKey,
  useCommunityActionLock,
} from "./community-client-utils"
import { CommunityState } from "./community-ui"

const postActions: ModerationAction[] = ["hide", "restore", "lock", "unlock", "pin", "unpin"]

export function CommunityModerationClient({
  initialReports,
}: {
  initialReports: CommunityReport[]
}) {
  const stateKey = communityProjectionKey({ initialReports })
  return <CommunityModerationClientState key={stateKey} initialReports={initialReports} />
}

function CommunityModerationClientState({ initialReports }: { initialReports: CommunityReport[] }) {
  const [reports, setReports] = useState(initialReports)
  const [reason, setReason] = useState("Moderator action from the community review queue")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const [tryAcquireActionLock, releaseActionLock] = useCommunityActionLock()

  function takeAction(report: CommunityReport, action: ModerationAction | "resolve") {
    if (!tryAcquireActionLock()) return
    setError("")
    startTransition(async () => {
      try {
        if (action === "resolve") {
          const result = await resolveCommunityReport(report.id)
          if (!result.ok) {
            setError(actionMessage(result) ?? "Moderation failed. Please retry.")
            return
          }
          setReports((current) => current.filter((item) => item.id !== report.id))
          return
        }
        if (report.replyId) {
          if (action !== "hide" && action !== "restore") return
          const result = await moderateCommunityReply(report.replyId, action, reason)
          if (!result.ok) {
            setError(actionMessage(result) ?? "Moderation failed. Please retry.")
            return
          }
          return
        }
        const result = await moderateCommunityPost(report.postId, action)
        if (!result.ok) {
          setError(actionMessage(result) ?? "Moderation failed. Please retry.")
          return
        }
      } catch {
        setError("Moderation failed. Please retry.")
      } finally {
        releaseActionLock()
      }
    })
  }

  return (
    <>
      <h1 tabIndex={-1}>Moderation queue</h1>
      <p>
        Review the oldest pending reports. Content snapshots are retained for audit even after
        removal.
      </p>
      <label className="c-field">
        Moderation note for reply actions
        <Input
          value={reason}
          maxLength={1000}
          disabled={pending}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error && (
        <p className="c-error" role="alert">
          {error}
        </p>
      )}
      {reports.length === 0 ? (
        <CommunityState title="No reports to review" />
      ) : (
        reports.map((report) => (
          <article className="c-report" key={report.id}>
            <h2>{report.replyId ? "Reported reply" : "Reported post"}</h2>
            <p>
              <strong>Reason:</strong> {report.reason}
            </p>
            <details>
              <summary>Reported content snapshot</summary>
              <blockquote>{report.snapshot}</blockquote>
            </details>
            <div className="c-actions">
              {(report.replyId ? (["hide", "restore"] as const) : postActions).map((action) => (
                <Button
                  key={action}
                  variant="outline"
                  disabled={pending || (Boolean(report.replyId) && reason.trim().length < 10)}
                  onClick={() => takeAction(report, action)}
                >
                  {action[0].toUpperCase() + action.slice(1)}
                </Button>
              ))}
              <Button
                className="c-button"
                disabled={pending}
                onClick={() => takeAction(report, "resolve")}
              >
                Resolve report
              </Button>
            </div>
          </article>
        ))
      )}
    </>
  )
}
