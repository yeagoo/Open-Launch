const LEGACY_BEFORE_NUMBERED = [
  "add_user_is_premium.sql",
  "add_badge_verification.sql",
  "add_promo_code_tables.sql",
  "remove_premium_fields.sql",
  "update_launch_quota_fields.sql",
  "add_bot_and_producthunt.sql",
] as const

const INTERLEAVED_AFTER = new Map<string, readonly string[]>([
  ["0025_upvote_unique_and_engagement.sql", ["add_bot_pool_upvote_targets.sql"]],
])

const KNOWN_NON_NUMBERED = new Set([
  ...LEGACY_BEFORE_NUMBERED,
  ...[...INTERLEAVED_AFTER.values()].flat(),
])

export function orderHandWrittenMigrations(files: readonly string[]): string[] {
  const available = new Set(files)
  const unknownNonNumbered = files
    .filter((filename) => !/^\d{4}_[a-z0-9_]+\.sql$/.test(filename))
    .filter((filename) => !KNOWN_NON_NUMBERED.has(filename))
  if (unknownNonNumbered.length > 0) {
    throw new Error(
      `non-numbered migrations require explicit historical ordering: ${unknownNonNumbered.join(", ")}`,
    )
  }

  const ordered: string[] = LEGACY_BEFORE_NUMBERED.filter((filename) => available.has(filename))
  const numbered = files.filter((filename) => /^\d{4}_[a-z0-9_]+\.sql$/.test(filename)).sort()
  for (const filename of numbered) {
    ordered.push(filename)
    for (const interleaved of INTERLEAVED_AFTER.get(filename) ?? []) {
      if (available.has(interleaved)) ordered.push(interleaved)
    }
  }

  const missing = files.filter((filename) => !ordered.includes(filename))
  if (missing.length > 0) {
    throw new Error(`migration ordering is incomplete: ${missing.join(", ")}`)
  }
  return ordered
}

export function findMissingTrackedMigrations(
  trackedFiles: Iterable<string>,
  availableFiles: readonly string[],
): string[] {
  const available = new Set(availableFiles)
  return [...trackedFiles].filter((filename) => !available.has(filename)).sort()
}
