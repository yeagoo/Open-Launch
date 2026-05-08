/**
 * Map a cron run summary to an HTTP status code that cron-job.org will
 * alert on. Pure function — same shape across every AI cron so the
 * "any errors and zero work" rule stays consistent.
 *
 * Returns 500 only when something tried to happen and nothing succeeded;
 * partial-success (some items errored, others worked) stays 200.
 */
export function cronStatusFromResult(opts: {
  errorCount: number
  successCount: number
}): 200 | 500 {
  if (opts.errorCount > 0 && opts.successCount === 0) return 500
  return 200
}
