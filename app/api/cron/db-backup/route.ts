import { NextRequest, NextResponse } from "next/server"

import { verifyCronAuth } from "@/lib/cron-auth"
import {
  buildObjectKey,
  createDatabaseBackup,
  DEFAULT_RETENTION_DAYS,
  pruneOldBackups,
  uploadBackup,
} from "@/lib/db-backup"

export const dynamic = "force-dynamic"
// A 120MB DB dumps in well under a minute; cap generously, still inside the
// dispatcher's 240s per-task budget.
export const maxDuration = 300

/**
 * Scheduled database backup (registered in cron_schedule, fired by the
 * dispatcher every 3 days). Dumps the public schema, envelope-encrypts it, and
 * stores it in the private R2 backup bucket, then prunes the retention window.
 *
 * Returns 500 on any failure so the run is flagged in /admin/cron-runs and
 * cron-job.org alerts — a backup that silently no-ops is worse than none.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  // Master switch. Off (or unset) → no-op success, so the dispatcher records a
  // healthy run and does NOT alert. This is an intentional disable, not a fault.
  const enabled = (process.env.BACKUP_ENABLED ?? "").trim().toLowerCase()
  if (enabled !== "true" && enabled !== "1") {
    return NextResponse.json({ ok: true, skipped: "BACKUP_ENABLED is not set" }, { status: 200 })
  }

  const passphrase = process.env.BACKUP_PASSPHRASE ?? ""
  if (!passphrase) {
    console.error("[db-backup] BACKUP_PASSPHRASE not configured")
    return NextResponse.json({ error: "BACKUP_PASSPHRASE not configured" }, { status: 500 })
  }

  const startedAt = Date.now()
  try {
    const { body, manifest } = await createDatabaseBackup(passphrase)
    const key = buildObjectKey()
    await uploadBackup(body, key)

    // Prune only AFTER a successful upload, and never let a prune error fail
    // the run — the backup itself already succeeded.
    let pruned = 0
    try {
      pruned = await pruneOldBackups(DEFAULT_RETENTION_DAYS)
    } catch (err) {
      console.error("[db-backup] prune failed (backup itself succeeded):", err)
    }

    const rows = manifest.tables.reduce((sum, t) => sum + t.rows, 0)
    console.log(
      `[db-backup] ok: ${key} — ${body.length} bytes, ${manifest.tables.length} tables, ${rows} rows, pruned ${pruned}`,
    )
    return NextResponse.json(
      {
        ok: true,
        key,
        bytes: body.length,
        tables: manifest.tables.length,
        rows,
        pruned,
        ms: Date.now() - startedAt,
      },
      { status: 200 },
    )
  } catch (err) {
    console.error("[db-backup] failed:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
