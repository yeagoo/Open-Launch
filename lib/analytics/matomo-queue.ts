export type MatomoCommand = [method: string, ...parameters: unknown[]]

export type MatomoWindow = Window & {
  Matomo?: unknown
  _paq?: MatomoCommand[]
}

export const MAX_PENDING_MATOMO_COMMANDS = 100

export function pushBoundedMatomoCommand(
  target: MatomoWindow,
  command: MatomoCommand,
  maxPending = MAX_PENDING_MATOMO_COMMANDS,
): void {
  const queue = (target._paq = target._paq || [])
  const limit = Math.max(1, Math.floor(maxPending))

  if (!target.Matomo && queue.length >= limit) {
    queue.splice(0, queue.length - limit + 1)
  }

  queue.push(command)
}
