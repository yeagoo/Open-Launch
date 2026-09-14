/**
 * A badge reservation belongs to the verified website. When that URL changes,
 * a scheduled fast-track launch must return to the ordinary free queue.
 */
export function shouldReleaseBadgeFastTrack(input: {
  websiteUrlChanged: boolean
  launchType: string | null
  launchStatus: string
  scheduledLaunchDate: Date | null
}): boolean {
  return (
    input.websiteUrlChanged &&
    input.launchType === "free_with_badge" &&
    input.launchStatus === "scheduled" &&
    input.scheduledLaunchDate !== null
  )
}
